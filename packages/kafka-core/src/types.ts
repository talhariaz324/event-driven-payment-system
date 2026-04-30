import type { EventEnvelope } from '@eds/shared-types';

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
  ssl?: boolean;
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
}

export interface ConsumerConfig {
  groupId: string;
  topics: string[];
  fromBeginning?: boolean;
  maxInFlight?: number;
}

export type EventHandler<T = unknown> = (
  event: EventEnvelope<T>,
  ctx: HandlerContext,
) => Promise<void>;

export interface HandlerContext {
  topic: string;
  partition: number;
  offset: string;
  attempt: number;
}

export interface ProducerSendInput<T = unknown> {
  topic: string;
  key: string;
  event: EventEnvelope<T>;
  headers?: Record<string, string>;
}
