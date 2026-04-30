import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('liveness')
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('readiness')
  readiness(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
