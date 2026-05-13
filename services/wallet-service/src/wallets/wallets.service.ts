import { Injectable, Logger } from '@nestjs/common';
import { Prisma, WalletTransactionType } from '../generated/prisma-client';
import type { EventEnvelope, PaymentInitiatedPayload } from '@eds/shared-types';
import { PrismaService } from '../prisma/prisma.service';

export const WALLET_CONSUMER = 'wallet-service';
const MAX_OPTIMISTIC_RETRIES = 3;

export type HandleResult =
  | { outcome: 'debited'; walletId: string; balanceAfter: string }
  | { outcome: 'duplicate'; walletId?: string }
  | { outcome: 'insufficient-funds'; walletId: string; balance: string; requested: string };

/**
 * Consumes payment.initiated events and debits the user's wallet exactly once
 * per (event_id, consumer) pair.
 *
 * Failure-handling contract:
 *   - Duplicate event → no-op, no Kafka retry (handler returns cleanly).
 *   - Insufficient funds → logged + returned. The consumer treats this as a
 *     handled outcome (not an exception) so the message is committed and not
 *     retried; in a real system this would emit a `wallet.debit_failed`
 *     event via the outbox so the saga can compensate.
 *   - Concurrent debit on the same wallet → optimistic-lock retry up to
 *     MAX_OPTIMISTIC_RETRIES, then surface as an exception (DLQ).
 *   - Any other DB error → propagated. Kafka-consumer retry + DLQ takes over.
 *
 * The flow is intentionally not "load → mutate → save" with a wide
 * transaction; that would hold a row lock for the duration of the
 * application logic. Instead we use a conditional UPDATE that includes the
 * version we read, and retry on miss.
 */
@Injectable()
export class WalletsService {
  private readonly log = new Logger(WalletsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handlePaymentInitiated(
    event: EventEnvelope<PaymentInitiatedPayload>,
  ): Promise<HandleResult> {
    const { eventId } = event;
    const { paymentId, userId, amount, currency } = event.payload;

    // Layer 3 idempotency: claim the (eventId, consumer) row first. If it's
    // already there, we're a duplicate delivery and can return without
    // touching the wallet. This must precede any side-effect.
    const claimed = await this.claimEvent(eventId);
    if (!claimed) {
      this.log.debug(`duplicate payment.initiated eventId=${eventId} — skipping`);
      return { outcome: 'duplicate' };
    }

    const wallet = await this.ensureWallet(userId, currency);
    const requestedAmount = new Prisma.Decimal(amount);

    for (let attempt = 0; attempt < MAX_OPTIMISTIC_RETRIES; attempt += 1) {
      const current = await this.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      const balance = new Prisma.Decimal(current.balance);

      if (balance.lessThan(requestedAmount)) {
        this.log.warn(
          `insufficient funds: wallet=${current.id} balance=${balance.toString()} requested=${requestedAmount.toString()} payment=${paymentId}`,
        );
        return {
          outcome: 'insufficient-funds',
          walletId: current.id,
          balance: balance.toString(),
          requested: requestedAmount.toString(),
        };
      }

      const newBalance = balance.minus(requestedAmount);

      try {
        await this.prisma.$transaction(async (tx) => {
          // Conditional update: row is only modified if version matches the
          // value we just read. If a concurrent debit landed in between,
          // count = 0 and we re-loop.
          const updated = await tx.wallet.updateMany({
            where: { id: current.id, version: current.version },
            data: { balance: newBalance, version: { increment: 1 } },
          });

          if (updated.count === 0) {
            throw new OptimisticLockError();
          }

          await tx.walletTransaction.create({
            data: {
              walletId: current.id,
              paymentId,
              amount: requestedAmount,
              type: WalletTransactionType.DEBIT,
              reason: `payment.initiated ${eventId}`,
            },
          });
        });

        this.log.log(
          `debited wallet=${current.id} amount=${requestedAmount.toString()} ${currency} payment=${paymentId}`,
        );
        return { outcome: 'debited', walletId: current.id, balanceAfter: newBalance.toString() };
      } catch (err) {
        if (err instanceof OptimisticLockError) {
          this.log.debug(
            `optimistic-lock contention on wallet=${current.id} attempt=${attempt + 1}/${MAX_OPTIMISTIC_RETRIES}`,
          );
          continue;
        }
        throw err;
      }
    }

    throw new Error(
      `optimistic-lock retries exhausted for wallet user=${userId} currency=${currency}`,
    );
  }

  private async claimEvent(eventId: string): Promise<boolean> {
    try {
      await this.prisma.processedEvent.create({
        data: { eventId, consumer: WALLET_CONSUMER },
      });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return false;
      }
      throw err;
    }
  }

  private async ensureWallet(
    userId: string,
    currency: string,
  ): Promise<{ id: string; version: number }> {
    // Upsert in a single round-trip. In a real system the wallet would be
    // created at account-signup time; we auto-create here so the demo flow
    // works even on a fresh DB.
    const wallet = await this.prisma.wallet.upsert({
      where: { userId_currency: { userId, currency } },
      create: { userId, currency },
      update: {},
      select: { id: true, version: true },
    });
    return wallet;
  }
}

class OptimisticLockError extends Error {
  constructor() {
    super('optimistic-lock miss');
    this.name = 'OptimisticLockError';
  }
}
