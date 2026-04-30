import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const port = app.get(ConfigService).get<number>('NOTIFICATION_SERVICE_PORT', 3004);
  app.enableShutdownHooks();
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[notification-service] listening on :${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[notification-service] failed to bootstrap', err);
  process.exit(1);
});
