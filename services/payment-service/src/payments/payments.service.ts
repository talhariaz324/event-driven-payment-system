import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { TOPICS } from '@eds/shared-types';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';

export interface InitiatePaymentInput {
  userId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomic write: payment row + outbox event in the SAME transaction.
   * If anything after the COMMIT crashes, the outbox poller publishes the event.
   */
  async initiate(input: InitiatePaymentInput) {
    if (!input.idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header required');
    }
    if (input.amount <= 0) {
      throw new BadRequestException('amount must be positive');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        // idempotent replay — return same response
        return { paymentId: existing.id, status: existing.status, deduplicated: true };
      }

      const payment = await tx.payment.create({
        data: {
          userId: input.userId,
          amount: input.amount,
          currency: input.currency,
          idempotencyKey: input.idempotencyKey,
        },
      });

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'payment',
          aggregateId: payment.id,
          eventType: 'payment.initiated',
          topic: TOPICS.PAYMENTS,
          payload: {
            eventId: uuid(),
            eventType: 'payment.initiated',
            occurredAt: new Date().toISOString(),
            aggregateId: payment.id,
            aggregateType: 'payment',
            schemaVersion: 1,
            payload: {
              paymentId: payment.id,
              userId: payment.userId,
              amount: Number(payment.amount),
              currency: payment.currency,
              idempotencyKey: payment.idempotencyKey,
            },
          },
        },
      });

      return { paymentId: payment.id, status: payment.status, deduplicated: false };
    });
  }

  /** Used by consumers to ensure exactly-once handling per consumer group. */
  async markEventProcessed(eventId: string, consumer: string): Promise<boolean> {
    try {
      await this.prisma.processedEvent.create({ data: { eventId, consumer } });
      return true;
    } catch (err) {
      // unique violation = duplicate
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        return false;
      }
      throw new ConflictException('failed to mark event processed');
    }
  }
}
