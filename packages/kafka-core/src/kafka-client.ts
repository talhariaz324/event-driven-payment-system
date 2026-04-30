import { Kafka, logLevel } from 'kafkajs';
import type { KafkaConfig } from './types';

let cachedKafka: Kafka | null = null;

export function createKafka(config: KafkaConfig): Kafka {
  if (cachedKafka) return cachedKafka;
  cachedKafka = new Kafka({
    brokers: config.brokers,
    clientId: config.clientId,
    ssl: config.ssl,
    sasl: config.sasl,
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
