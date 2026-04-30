import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createKafka, KafkaConsumer } from '@eds/kafka-core';
import { TOPICS, type EventEnvelope, type PaymentSettledPayload } from '@eds/shared-types';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(KafkaConsumerService.name);
  private consumer: KafkaConsumer | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    createKafka({
      brokers: this.config.get<string>('KAFKA_BROKERS', '').split(','),
      clientId: this.config.get<string>('KAFKA_CLIENT_ID', 'notification-service'),
    });

    this.consumer = new KafkaConsumer(
      {
        groupId: this.config.get<string>('KAFKA_GROUP_ID', 'notification-service-consumer'),
        topics: [TOPICS.PAYMENTS],
        maxInFlight: 1,
      },
      async (event) => {
        if (event.eventType === 'payment.settled') {
          await this.notifications.sendPaymentSettled(
            event as EventEnvelope<PaymentSettledPayload>,
          );
        }
      },
      TOPICS.PAYMENTS_DLQ,
    );
    await this.consumer.start();
    this.log.log('notification-service kafka consumer started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.stop();
  }
}
