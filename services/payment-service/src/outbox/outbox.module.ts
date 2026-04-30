import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { OutboxWorker } from './outbox.worker';

@Module({
  imports: [MetricsModule],
  providers: [OutboxWorker],
  exports: [OutboxWorker],
})
export class OutboxModule {}
