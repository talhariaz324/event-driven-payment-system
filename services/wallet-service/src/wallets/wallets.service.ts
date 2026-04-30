import { Injectable, Logger } from '@nestjs/common';
import type { EventEnvelope, PaymentInitiatedPayload } from '@eds/shared-types';

@Injectable()
export class WalletsService {
  private readonly log = new Logger(WalletsService.name);

  async handlePaymentInitiated(event: EventEnvelope<PaymentInitiatedPayload>): Promise<void> {
    const { paymentId, userId, amount, currency } = event.payload;
    this.log.log(`debiting wallet for user=${userId} amount=${amount} ${currency} payment=${paymentId}`);
    // TODO: real wallet debit logic (DB transaction, optimistic locking on balance)
    // emit wallet.debited via outbox if needed
  }
}
