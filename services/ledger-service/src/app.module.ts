import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { HealthModule } from './health/health.module';
import { LedgerModule } from './ledger/ledger.module';
import { KafkaModule } from './kafka/kafka.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        LEDGER_SERVICE_PORT: Joi.number().default(3003),
        KAFKA_BROKERS: Joi.string().required(),
        KAFKA_CLIENT_ID: Joi.string().default('ledger-service'),
        KAFKA_GROUP_ID: Joi.string().default('ledger-service-consumer'),
        LOG_LEVEL: Joi.string().default('info'),
      }),
      validationOptions: { abortEarly: false },
    }),
    HealthModule,
    LedgerModule,
    KafkaModule,
  ],
})
export class AppModule {}
