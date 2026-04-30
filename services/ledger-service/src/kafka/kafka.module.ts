import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { KafkaConsumerService } from './kafka-consumer.service';

@Module({ imports: [LedgerModule], providers: [KafkaConsumerService] })
export class KafkaModule {}
