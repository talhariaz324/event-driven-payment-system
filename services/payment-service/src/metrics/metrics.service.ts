import { Injectable, OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

/**
 * Prometheus metrics for payment-service.
 *
 * Exposed on GET /metrics in plain-text exposition format. Scrape with
 * Prometheus or compatible (Grafana Agent, OpenTelemetry Collector, etc.).
 *
 * Convention: snake_case names, labels low-cardinality only (status, currency).
 * NEVER label with userId/paymentId/eventId — high-cardinality labels are
 * how a Prometheus instance falls over.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  public readonly registry = new Registry();

  // Counters
  public readonly paymentsInitiated = new Counter({
    name: 'payments_initiated_total',
    help: 'Total payments initiated, broken down by currency and outcome.',
    labelNames: ['currency', 'outcome'] as const,
    registers: [this.registry],
  });

  public readonly outboxPublished = new Counter({
    name: 'outbox_events_published_total',
    help: 'Total outbox events successfully published to Kafka.',
    labelNames: ['topic'] as const,
    registers: [this.registry],
  });

  public readonly outboxFailed = new Counter({
    name: 'outbox_events_failed_total',
    help: 'Total outbox events that exceeded retry budget and went to FAILED.',
    labelNames: ['topic'] as const,
    registers: [this.registry],
  });

  // Gauges — current state
  public readonly outboxPending = new Gauge({
    name: 'outbox_events_pending',
    help: 'Current number of outbox events with status=PENDING (lag indicator).',
    registers: [this.registry],
  });

  // Histograms — latency distribution
  public readonly paymentInitiateDuration = new Histogram({
    name: 'payment_initiate_duration_seconds',
    help: 'Wall-clock duration of POST /payments handling, including DB tx.',
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  public readonly outboxPublishDuration = new Histogram({
    name: 'outbox_publish_duration_seconds',
    help: 'Time from outbox INSERT to successful Kafka publish.',
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [this.registry],
  });

  onModuleInit(): void {
    // Default node.js process metrics (memory, GC, event loop lag)
    collectDefaultMetrics({ register: this.registry, prefix: 'payment_service_' });
  }
}
