import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly http: HttpHealthIndicator,
    private readonly config: ConfigService,
  ) {}

  @Get('liveness')
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('readiness')
  @HealthCheck()
  readiness() {
    const paymentUrl = this.config.get<string>('PAYMENT_SERVICE_URL');
    return this.health.check([
      () => this.http.pingCheck('payment-service', `${paymentUrl}/health/liveness`),
    ]);
  }
}
