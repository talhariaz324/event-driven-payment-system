import { Kafka, logLevel, type SASLOptions } from 'kafkajs';
import type { KafkaConfig } from './types';

let cachedKafka: Kafka | null = null;

export function createKafka(config: KafkaConfig): Kafka {
  if (cachedKafka) return cachedKafka;
  cachedKafka = new Kafka({
    brokers: config.brokers,
    clientId: config.clientId,
    ssl: config.ssl,
    // kafkajs's SASLOptions is a discriminated union on `mechanism`. The
    // narrower input type in our KafkaConfig is structurally compatible but
    // TS can't prove the discrimination through the optional/union edge —
    // cast at the boundary, not at every call site.
    sasl: config.sasl as SASLOptions | undefined,
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 300,
      retries: 8,
      maxRetryTime: 30_000,
    },
  });
  return cachedKafka;
}

export function getKafka(): Kafka {
  if (!cachedKafka) {
    throw new Error('Kafka client not initialised — call createKafka(config) first');
  }
  return cachedKafka;
}
