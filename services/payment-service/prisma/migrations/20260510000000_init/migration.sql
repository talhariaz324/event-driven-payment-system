-- Initial schema for payment-service: payments, outbox_events, processed_events.
-- Generated with `prisma migrate diff` from schema.prisma. Hand-tuned to add
-- the partial outbox index that the schema cannot express directly.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "payment_status" AS ENUM ('INITIATED', 'AUTHORIZED', 'SETTLED', 'FAILED');
CREATE TYPE "outbox_status" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

CREATE TABLE "payments" (
  "id"              UUID            NOT NULL DEFAULT gen_random_uuid(),
  "userId"          UUID            NOT NULL,
  "amount"          DECIMAL(18, 4)  NOT NULL,
  "currency"        VARCHAR(3)      NOT NULL,
  "status"          "payment_status" NOT NULL DEFAULT 'INITIATED',
  "idempotency_key" TEXT            NOT NULL,
  "created_at"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3)    NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");
CREATE INDEX "payments_userId_idx" ON "payments"("userId");
CREATE INDEX "payments_status_idx" ON "payments"("status");

CREATE TABLE "outbox_events" (
  "id"              UUID            NOT NULL DEFAULT gen_random_uuid(),
  "aggregate_type"  TEXT            NOT NULL,
  "aggregate_id"    TEXT            NOT NULL,
  "event_type"      TEXT            NOT NULL,
  "topic"           TEXT            NOT NULL,
  "payload"         JSONB           NOT NULL,
  "status"          "outbox_status" NOT NULL DEFAULT 'PENDING',
  "attempts"        INTEGER         NOT NULL DEFAULT 0,
  "created_at"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at"    TIMESTAMP(3),
  "last_error"      TEXT,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outbox_events_status_created_at_idx" ON "outbox_events"("status", "created_at");

-- Partial index on pending rows: the outbox poller's hot query.
-- Skipping PUBLISHED rows keeps the working-set small as history grows.
CREATE INDEX "outbox_events_pending_idx"
  ON "outbox_events"("created_at")
  WHERE "status" = 'PENDING';

CREATE TABLE "processed_events" (
  "event_id"     TEXT         NOT NULL,
  "consumer"     TEXT         NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id", "consumer")
);
