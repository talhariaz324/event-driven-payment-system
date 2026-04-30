import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { KafkaConsumerService } from './kafka-consumer.service';

@Module({ imports: [NotificationsModule], providers: [KafkaConsumerService] })
export class KafkaModule {}
