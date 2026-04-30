import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { PaymentsService, InitiatePaymentInput } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @HttpCode(202)
  async initiate(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: Omit<InitiatePaymentInput, 'idempotencyKey'>,
  ) {
    return this.payments.initiate({ ...body, idempotencyKey });
  }
}
