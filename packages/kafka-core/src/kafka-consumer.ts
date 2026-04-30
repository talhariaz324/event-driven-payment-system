import type { Consumer, EachMessagePayload } from 'kafkajs';
import pino from 'pino';
import type { EventEnvelope } from '@eds/shared-types';
import { getKafka } from './kafka-client';
import type { ConsumerConfig, EventHandler, HandlerContext } from './types';

const log = pino({ name: 'kafka-consumer' });

const DEFAULT_MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 200;
const BACKOFF_CAP_MS = 30_000;

export class KafkaConsumer {
  private consumer: Consumer | null = null;
  private running = false;

  constructor(
    private readonly config: ConsumerConfig,
    private readonly handler: EventHandler,
    private readonly dlqTopic?: string,
  ) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.consumer = getKafka().consumer({
      groupId: this.config.groupId,
      maxInFlightRequests: this.config.maxInFlight ?? 1,
      sessionTimeout: 30_000,
      heartbeatInterval: 3_000,
      retry: { retries: 10 },
    });

    await this.consumer.connect();
    for (const topic of this.config.topics) {
      await this.consumer.subscribe({ topic, fromBeginning: this.config.fromBeginning ?? false });
    }

    await this.consumer.run({
      autoCommit: true,
      eachMessage: (payload) => this.processMessage(payload),
    });

    this.running = true;
    log.info({ topics: this.config.topics, groupId: this.config.groupId }, 'consumer started');
  }

  async stop(): Promise<void> {
    if (!this.consumer) return;
    await this.consumer.disconnect();
    this.running = false;
  }

  private async processMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    if (!message.value) return;

    let event: EventEnvelope;
    try {
      event = JSON.parse(message.value.toString());
    } catch (err) {
      log.error({ err, topic, partition, offset: message.offset }, 'malformed message — sending to DLQ');
      await this.toDlq(payload, 'malformed-json');
      return;
    }

    let attempt = 0;
    while (attempt < DEFAULT_MAX_RETRIES) {
      attempt += 1;
      const ctx: HandlerContext = {
        topic,
        partition,
        offset: message.offset,
        attempt,
      };
      try {
        await this.handler(event, ctx);
        return;
      } catch (err) {
        const wait = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
        log.warn(
          { err, eventId: event.eventId, attempt, wait },
          'handler failed — retrying with backoff',
        );
        await sleep(wait);
      }
    }

    log.error({ eventId: event.eventId }, 'max retries exceeded — sending to DLQ');
    await this.toDlq(payload, 'max-retries-exceeded', event);
  }

  private async toDlq(
    payload: EachMessagePayload,
    reason: string,
    event?: EventEnvelope,
  ): Promise<void> {
    if (!this.dlqTopic) return;
    const producer = getKafka().producer();
    await producer.connect();
    try {
      await producer.send({
        topic: this.dlqTopic,
        messages: [
          {
            key: payload.message.key ?? null,
            value: payload.message.value,
            headers: {
              'dlq-reason': reason,
              'dlq-original-topic': payload.topic,
              'dlq-original-partition': String(payload.partition),
              'dlq-original-offset': payload.message.offset,
              ...(event ? { 'event-id': event.eventId } : {}),
            },
          },
        ],
      });
    } finally {
      await producer.disconnect();
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
