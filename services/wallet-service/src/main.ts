import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const port = config.get<number>('WALLET_SERVICE_PORT', 3002);
  app.enableShutdownHooks();
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[wallet-service] listening on :${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[wallet-service] failed to bootstrap', err);
  process.exit(1);
});
