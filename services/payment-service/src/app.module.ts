import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import * as Joi from 'joi';
import { HealthModule } from './health/health.module';
import { PaymentsModule } from './payments/payments.module';
import { OutboxModule } from './outbox/outbox.module';
import { PrismaModule } from './prisma/prisma.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PAYMENT_SERVICE_PORT: Joi.number().default(3001),
        DATABASE_URL: Joi.string()
          .uri({ scheme: ['postgresql', 'postgres'] })
          .required(),
        KAFKA_BROKERS: Joi.string().required(),
        KAFKA_CLIENT_ID: Joi.string().default('payment-service'),
        KAFKA_GROUP_ID: Joi.string().default('payment-service-consumer'),
        OUTBOX_POLL_INTERVAL_MS: Joi.number().integer().min(100).default(1000),
        OUTBOX_BATCH_SIZE: Joi.number().integer().min(1).max(1000).default(100),
        LOG_LEVEL: Joi.string().default('info'),
      }),
      validationOptions: { abortEarly: false },
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    MetricsModule,
    PaymentsModule,
    OutboxModule,
  ],
})
export class AppModule {}
