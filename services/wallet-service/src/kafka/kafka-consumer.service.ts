import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createKafka, KafkaConsumer } from '@eds/kafka-core';
import { TOPICS, type EventEnvelope, type PaymentInitiatedPayload } from '@eds/shared-types';
import { WalletsService } from '../wallets/wallets.service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(KafkaConsumerService.name);
  private consumer: KafkaConsumer | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly wallets: WalletsService,
  ) {}

  async onModuleInit(): Promise<void> {
    createKafka({
      brokers: this.config.get<string>('KAFKA_BROKERS', '').split(','),
      clientId: this.config.get<string>('KAFKA_CLIENT_ID', 'wallet-service'),
    });

    this.consumer = new KafkaConsumer(
      {
        groupId: this.config.get<string>('KAFKA_GROUP_ID', 'wallet-service-consumer'),
        topics: [TOPICS.PAYMENTS],
        maxInFlight: 1,
      },
      async (event) => this.dispatch(event),
      TOPICS.PAYMENTS_DLQ,
    );

    await this.consumer.start();
    this.log.log('wallet-service kafka consumer started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.stop();
  }

  private async dispatch(event: EventEnvelope): Promise<void> {
    switch (event.eventType) {
      case 'payment.initiated':
        await this.wallets.handlePaymentInitiated(event as EventEnvelope<PaymentInitiatedPayload>);
        return;
      default:
        // ignore — other handlers care about other event types
        return;
    }
  }
}
