import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createKafka, KafkaConsumer } from '@eds/kafka-core';
import { TOPICS, type EventEnvelope, type PaymentInitiatedPayload } from '@eds/shared-types';
import { LedgerService } from '../ledger/ledger.service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(KafkaConsumerService.name);
  private consumer: KafkaConsumer | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly ledger: LedgerService,
  ) {}

  async onModuleInit(): Promise<void> {
    createKafka({
      brokers: this.config.get<string>('KAFKA_BROKERS', '').split(','),
      clientId: this.config.get<string>('KAFKA_CLIENT_ID', 'ledger-service'),
    });

    this.consumer = new KafkaConsumer(
      {
        groupId: this.config.get<string>('KAFKA_GROUP_ID', 'ledger-service-consumer'),
        topics: [TOPICS.PAYMENTS],
        maxInFlight: 1,
      },
      async (event) => {
        if (event.eventType === 'payment.initiated') {
          await this.ledger.postEntry(event as EventEnvelope<PaymentInitiatedPayload>);
        }
      },
      TOPICS.PAYMENTS_DLQ,
    );
    await this.consumer.start();
    this.log.log('ledger-service kafka consumer started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.stop();
  }
}
