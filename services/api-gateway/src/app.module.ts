import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        API_GATEWAY_PORT: Joi.number().default(3000),
        PAYMENT_SERVICE_URL: Joi.string().uri().required(),
        WALLET_SERVICE_URL: Joi.string().uri().required(),
        LOG_LEVEL: Joi.string().default('info'),
      }),
      validationOptions: { abortEarly: false },
    }),
    HealthModule,
  ],
})
export class AppModule {}
