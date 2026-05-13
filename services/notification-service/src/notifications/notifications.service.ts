import { Injectable, Logger } from '@nestjs/common';
import type { EventEnvelope, PaymentSettledPayload } from '@eds/shared-types';

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  async sendPaymentSettled(event: EventEnvelope<PaymentSettledPayload>): Promise<void> {
    const { paymentId, userId, amount, currency } = event.payload;
    this.log.log(`notify user=${userId} payment=${paymentId} settled ${amount} ${currency}`);
    // TODO: real channel dispatch (email/sms/push) — must be idempotent on event.eventId
  }
}
