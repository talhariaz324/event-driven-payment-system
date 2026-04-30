import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Unit tests for PaymentsService.
 *
 * What we test here:
 *   - Idempotency: same idempotency key returns the same payment without
 *     a second INSERT.
 *   - Validation: missing idempotency key, non-positive amount.
 *
 * What we DON'T test here (lives in test/integration/):
 *   - Actual transactional outbox semantics — needs a real Postgres
 *   - SKIP LOCKED behavior of the outbox poller — needs concurrent connections
 *   - Kafka publish — needs a real broker
 *
 * Mocks of distributed-system primitives lie. Unit tests verify pure logic;
 * integration tests verify the contracts the system actually depends on.
 */

type MockPrismaTx = {
  payment: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  outboxEvent: {
    create: jest.Mock;
  };
};

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prismaTx: MockPrismaTx;

  beforeEach(async () => {
    prismaTx = {
      payment: { findUnique: jest.fn(), create: jest.fn() },
      outboxEvent: { create: jest.fn().mockResolvedValue({}) },
    };

    const prismaMock = {
      $transaction: jest.fn(async (fn: (tx: MockPrismaTx) => Promise<unknown>) => fn(prismaTx)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [PaymentsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = moduleRef.get(PaymentsService);
  });

  describe('initiate()', () => {
    const baseInput = {
      userId: '11111111-1111-1111-1111-111111111111',
      amount: 100,
      currency: 'USD',
      idempotencyKey: 'idem-1',
    };

    it('rejects request without idempotency key', async () => {
      await expect(
        service.initiate({ ...baseInput, idempotencyKey: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-positive amount', async () => {
      await expect(service.initiate({ ...baseInput, amount: 0 })).rejects.toThrow(BadRequestException);
      await expect(service.initiate({ ...baseInput, amount: -1 })).rejects.toThrow(BadRequestException);
    });

    it('creates payment and outbox event on first call', async () => {
      prismaTx.payment.findUnique.mockResolvedValueOnce(null);
      prismaTx.payment.create.mockResolvedValueOnce({
        id: 'pay-1',
        userId: baseInput.userId,
        amount: { toString: () => '100' },
        currency: baseInput.currency,
        idempotencyKey: baseInput.idempotencyKey,
        status: 'INITIATED',
      });

      const result = await service.initiate(baseInput);

      expect(result).toEqual({ paymentId: 'pay-1', status: 'INITIATED', deduplicated: false });
      expect(prismaTx.payment.create).toHaveBeenCalledTimes(1);
      expect(prismaTx.outboxEvent.create).toHaveBeenCalledTimes(1);

      // Verify outbox event has correct shape
      const outboxArgs = prismaTx.outboxEvent.create.mock.calls[0][0].data;
      expect(outboxArgs).toMatchObject({
        aggregateType: 'payment',
        aggregateId: 'pay-1',
        eventType: 'payment.initiated',
      });
    });

    it('returns existing payment without re-inserting on duplicate idempotency key', async () => {
      const existing = {
        id: 'pay-existing',
        idempotencyKey: baseInput.idempotencyKey,
        status: 'SETTLED',
      };
      prismaTx.payment.findUnique.mockResolvedValueOnce(existing);

      const result = await service.initiate(baseInput);

      expect(result).toEqual({ paymentId: 'pay-existing', status: 'SETTLED', deduplicated: true });
      expect(prismaTx.payment.create).not.toHaveBeenCalled();
      expect(prismaTx.outboxEvent.create).not.toHaveBeenCalled();
    });
  });
});
