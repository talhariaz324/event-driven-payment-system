import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createKafka, KafkaProducer } from '@eds/kafka-core';
import type { EventEnvelope } from '@eds/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';

const MAX_ATTEMPTS = 10;

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OutboxWorker.name);
  private producer: KafkaProducer | null = null;
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    createKafka({
      brokers: this.config.get<string>('KAFKA_BROKERS', '').split(','),
      clientId: this.config.get<string>('KAFKA_CLIENT_ID', 'payment-service'),
    });
    this.producer = new KafkaProducer();
    await this.producer.connect();

    const interval = this.config.get<number>('OUTBOX_POLL_INTERVAL_MS', 1000);
    this.timer = setInterval(() => this.tick().catch((e) => this.log.error(e)), interval);
    this.log.log(`outbox poller started (interval=${interval}ms)`);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    // wait briefly for in-flight tick to settle
    let waited = 0;
    while (this.inFlight && waited < 5000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }
    await this.producer?.disconnect();
  }

  private async tick(): Promise<void> {
    if (this.inFlight || this.stopping || !this.producer) return;
    this.inFlight = true;
    try {
      const batchSize = this.config.get<number>('OUTBOX_BATCH_SIZE', 100);

      // SKIP LOCKED enables horizontal scaling — multiple poller pods coexist safely
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          topic: string;
          aggregate_id: string;
          payload: EventEnvelope;
          attempts: number;
        }>
      >`
        SELECT id, topic, aggregate_id, payload, attempts
        FROM outbox_events
        WHERE status = 'PENDING'
        ORDER BY created_at
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `;

      // Update lag gauge — pending count is the operator-facing health signal
      const pending = await this.prisma.outboxEvent.count({ where: { status: 'PENDING' } });
      this.metrics.outboxPending.set(pending);

      if (rows.length === 0) return;

      for (const row of rows) {
        const stopTimer = this.metrics.outboxPublishDuration.startTimer();
        try {
          await this.producer.send({
            topic: row.topic,
            key: row.aggregate_id,
            event: row.payload,
          });
          await this.prisma.outboxEvent.update({
            where: { id: row.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              attempts: { increment: 1 },
            },
          });
          stopTimer();
          this.metrics.outboxPublished.inc({ topic: row.topic });
        } catch (err) {
          stopTimer();
          const failed = row.attempts + 1 >= MAX_ATTEMPTS;
          await this.prisma.outboxEvent.update({
            where: { id: row.id },
            data: {
              status: failed ? 'FAILED' : 'PENDING',
              attempts: { increment: 1 },
              lastError: err instanceof Error ? err.message : String(err),
            },
          });
          if (failed) this.metrics.outboxFailed.inc({ topic: row.topic });
          this.log.warn(
            `outbox publish failed (id=${row.id}, attempts=${row.attempts + 1})`,
            err instanceof Error ? err.stack : undefined,
          );
        }
      }
    } finally {
      this.inFlight = false;
    }
  }
}
