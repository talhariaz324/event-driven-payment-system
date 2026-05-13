import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { HealthModule } from './health/health.module';
import { KafkaModule } from './kafka/kafka.module';
import { PrismaModule } from './prisma/prisma.module';
import { WalletsModule } from './wallets/wallets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        WALLET_SERVICE_PORT: Joi.number().default(3002),
        DATABASE_URL: Joi.string()
          .uri({ scheme: ['postgresql', 'postgres'] })
          .required(),
        KAFKA_BROKERS: Joi.string().required(),
        KAFKA_CLIENT_ID: Joi.string().default('wallet-service'),
        KAFKA_GROUP_ID: Joi.string().default('wallet-service-consumer'),
        LOG_LEVEL: Joi.string().default('info'),
      }),
      validationOptions: { abortEarly: false },
    }),
    PrismaModule,
    HealthModule,
    WalletsModule,
    KafkaModule,
  ],
})
export class AppModule {}
