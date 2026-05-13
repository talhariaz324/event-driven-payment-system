import { Test } from '@nestjs/testing';
import { Prisma, WalletTransactionType } from '../generated/prisma-client';
import { WalletsService, WALLET_CONSUMER } from './wallets.service';
import { PrismaService } from '../prisma/prisma.service';
import type { EventEnvelope, PaymentInitiatedPayload } from '@eds/shared-types';

/**
 * Unit tests for WalletsService.
 *
 * What we test here:
 *   - The (eventId, consumer) claim is taken before any side-effect, so a
 *     duplicate delivery is a no-op.
 *   - Balance/version optimistic-lock UPDATE is conditional on the version
 *     read; a contention loss triggers a retry.
 *   - Insufficient funds returns an outcome instead of throwing.
 *
 * What we don't cover here (lives in test/integration/, runs against real
 * Postgres):
 *   - Real serializable behavior under concurrency
 *   - Foreign key integrity between wallets and wallet_transactions
 *   - Migration shape — `prisma migrate diff` covers that in CI
 */

type Tx = {
  wallet: {
    updateMany: jest.Mock;
  };
  walletTransaction: {
    create: jest.Mock;
  };
};

function envelope(
  eventId: string,
  payload: Partial<PaymentInitiatedPayload> = {},
): EventEnvelope<PaymentInitiatedPayload> {
  return {
    eventId,
    eventType: 'payment.initiated',
    occurredAt: new Date().toISOString(),
    aggregateId: payload.paymentId ?? 'pay-1',
    aggregateType: 'payment',
    schemaVersion: 1,
    payload: {
      paymentId: 'pay-1',
      userId: '11111111-1111-1111-1111-111111111111',
      amount: 25,
      currency: 'USD',
      idempotencyKey: 'idem-1',
      ...payload,
    },
  };
}

describe('WalletsService', () => {
  let service: WalletsService;
  let prisma: {
    processedEvent: { create: jest.Mock };
    wallet: { upsert: jest.Mock; findUniqueOrThrow: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: Tx;

  beforeEach(async () => {
    tx = {
      wallet: { updateMany: jest.fn() },
      walletTransaction: { create: jest.fn().mockResolvedValue({}) },
    };

    prisma = {
      processedEvent: { create: jest.fn() },
      wallet: {
        upsert: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: Tx) => Promise<unknown>) => fn(tx)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [WalletsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(WalletsService);
  });

  it('claims the (eventId, consumer) row before any wallet mutation', async () => {
    prisma.processedEvent.create.mockResolvedValueOnce({});
    prisma.wallet.upsert.mockResolvedValueOnce({ id: 'wallet-1', version: 0 });
    prisma.wallet.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'wallet-1',
      version: 0,
      balance: new Prisma.Decimal(100),
    });
    tx.wallet.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.handlePaymentInitiated(envelope('evt-1'));

    expect(prisma.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'evt-1', consumer: WALLET_CONSUMER },
    });
    // claim ran first
    const claimOrder = prisma.processedEvent.create.mock.invocationCallOrder[0];
    const upsertOrder = prisma.wallet.upsert.mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(upsertOrder);
    expect(result).toEqual({ outcome: 'debited', walletId: 'wallet-1', balanceAfter: '75' });
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletId: 'wallet-1',
        paymentId: 'pay-1',
        type: WalletTransactionType.DEBIT,
      }),
    });
  });

  it('returns duplicate on (eventId, consumer) collision and does not touch the wallet', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'x',
    });
    prisma.processedEvent.create.mockRejectedValueOnce(p2002);

    const result = await service.handlePaymentInitiated(envelope('evt-dup'));

    expect(result).toEqual({ outcome: 'duplicate' });
    expect(prisma.wallet.upsert).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns insufficient-funds without throwing or debiting', async () => {
    prisma.processedEvent.create.mockResolvedValueOnce({});
    prisma.wallet.upsert.mockResolvedValueOnce({ id: 'wallet-1', version: 3 });
    prisma.wallet.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'wallet-1',
      version: 3,
      balance: new Prisma.Decimal(10),
    });

    const result = await service.handlePaymentInitiated(envelope('evt-broke'));

    expect(result).toMatchObject({ outcome: 'insufficient-funds', balance: '10', requested: '25' });
    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('retries the conditional update on optimistic-lock contention then commits', async () => {
    prisma.processedEvent.create.mockResolvedValueOnce({});
    prisma.wallet.upsert.mockResolvedValueOnce({ id: 'wallet-1', version: 0 });

    // First findUniqueOrThrow: version 0. Update returns count 0 (loser).
    // Second findUniqueOrThrow: version 1 (winner committed). Update returns count 1.
    prisma.wallet.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 'wallet-1', version: 0, balance: new Prisma.Decimal(50) })
      .mockResolvedValueOnce({ id: 'wallet-1', version: 1, balance: new Prisma.Decimal(40) });

    tx.wallet.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    const result = await service.handlePaymentInitiated(envelope('evt-race'));

    expect(prisma.wallet.findUniqueOrThrow).toHaveBeenCalledTimes(2);
    expect(tx.wallet.updateMany).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ outcome: 'debited', walletId: 'wallet-1', balanceAfter: '15' });
  });

  it('throws when optimistic-lock retries are exhausted (escalates to DLQ path)', async () => {
    prisma.processedEvent.create.mockResolvedValueOnce({});
    prisma.wallet.upsert.mockResolvedValueOnce({ id: 'wallet-1', version: 0 });
    prisma.wallet.findUniqueOrThrow.mockResolvedValue({
      id: 'wallet-1',
      version: 0,
      balance: new Prisma.Decimal(50),
    });
    tx.wallet.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.handlePaymentInitiated(envelope('evt-stuck'))).rejects.toThrow(
      /optimistic-lock retries exhausted/,
    );
  });
});
