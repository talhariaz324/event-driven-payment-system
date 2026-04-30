import { Module } from '@nestjs/common';
import { OutboxWorker } from './outbox.worker';

@Module({
  providers: [OutboxWorker],
  exports: [OutboxWorker],
})
export class OutboxModule {}
