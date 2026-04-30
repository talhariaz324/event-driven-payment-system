import type { Producer } from 'kafkajs';
import { CompressionTypes } from 'kafkajs';
import pino from 'pino';
import { getKafka } from './kafka-client';
import type { ProducerSendInput } from './types';

const log = pino({ name: 'kafka-producer' });

export class KafkaProducer {
  private producer: Producer | null = null;
  private connected = false;

  async connect(): Promise<void> {
    if (this.connected) return;
    this.producer = getKafka().producer({
      idempotent: true,
      maxInFlightRequests: 5,
      transactionTimeout: 30_000,
    });
    await this.producer.connect();
    this.connected = true;
    log.info('producer connected');
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.producer) return;
    await this.producer.disconnect();
    this.connected = false;
    log.info('producer disconnected');
  }

  async send<T>(input: ProducerSendInput<T>): Promise<void> {
    if (!this.producer) throw new Error('producer not connected');

    await this.producer.send({
      topic: input.topic,
      compression: CompressionTypes.GZIP,
      acks: -1,
      messages: [
        {
          key: input.key,
          value: JSON.stringify(input.event),
          headers: {
            'event-id': input.event.eventId,
            'event-type': input.event.eventType,
            'schema-version': String(input.event.schemaVersion),
            ...input.headers,
          },
        },
      ],
    });
  }

  async sendBatch<T>(inputs: ProducerSendInput<T>[]): Promise<void> {
    if (!this.producer) throw new Error('producer not connected');
    if (inputs.length === 0) return;

    const grouped = new Map<string, ProducerSendInput<T>[]>();
    for (const i of inputs) {
      const list = grouped.get(i.topic) ?? [];
      list.push(i);
      grouped.set(i.topic, list);
    }

    await this.producer.sendBatch({
      compression: CompressionTypes.GZIP,
      acks: -1,
      topicMessages: Array.from(grouped.entries()).map(([topic, msgs]) => ({
        topic,
        messages: msgs.map((m) => ({
          key: m.key,
          value: JSON.stringify(m.event),
          headers: {
            'event-id': m.event.eventId,
            'event-type': m.event.eventType,
            'schema-version': String(m.event.schemaVersion),
            ...m.headers,
          },
        })),
      })),
    });
  }
}
