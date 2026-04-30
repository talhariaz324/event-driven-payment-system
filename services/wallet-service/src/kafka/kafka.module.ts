import { Module } from '@nestjs/common';
import { WalletsModule } from '../wallets/wallets.module';
import { KafkaConsumerService } from './kafka-consumer.service';

@Module({
  imports: [WalletsModule],
  providers: [KafkaConsumerService],
})
export class KafkaModule {}
