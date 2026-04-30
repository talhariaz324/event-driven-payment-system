export const TOPICS = {
  PAYMENTS: 'payments.v1',
  WALLETS: 'wallets.v1',
  LEDGER: 'ledger.v1',
  NOTIFICATIONS: 'notifications.v1',
  PAYMENTS_DLQ: 'payments.v1.dlq',
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  occurredAt: string;
  aggregateId: string;
  aggregateType: string;
  schemaVersion: number;
  payload: T;
}

export interface PaymentInitiatedPayload {
  paymentId: string;
  userId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
}

export interface PaymentSettledPayload {
  paymentId: string;
  userId: string;
  amount: number;
  currency: string;
  settledAt: string;
}

export interface PaymentFailedPayload {
  paymentId: string;
  userId: string;
  reason: string;
  retryable: boolean;
}

export interface WalletDebitedPayload {
  walletId: string;
  userId: string;
  amount: number;
  paymentId: string;
}

export interface LedgerEntryPostedPayload {
  entryId: string;
  paymentId: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  currency: string;
}

export type PaymentEvent =
  | (EventEnvelope<PaymentInitiatedPayload> & { eventType: 'payment.initiated' })
  | (EventEnvelope<PaymentSettledPayload> & { eventType: 'payment.settled' })
  | (EventEnvelope<PaymentFailedPayload> & { eventType: 'payment.failed' });
