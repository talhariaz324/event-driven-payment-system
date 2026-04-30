import { Injectable, Logger } from '@nestjs/common';
import type { EventEnvelope, PaymentInitiatedPayload } from '@eds/shared-types';

@Injectable()
export class LedgerService {
  private readonly log = new Logger(LedgerService.name);

  async postEntry(event: EventEnvelope<PaymentInitiatedPayload>): Promise<void> {
    const { paymentId, userId, amount, currency } = event.payload;
    // Double-entry: debit user.cash, credit merchant.receivable
    this.log.log(
      `posting ledger entry payment=${paymentId} user=${userId} ${amount} ${currency} (debit=user.cash, credit=merchant.receivable)`,
    );
    // TODO: real double-entry ledger insert (idempotent on event.eventId)
  }
}
