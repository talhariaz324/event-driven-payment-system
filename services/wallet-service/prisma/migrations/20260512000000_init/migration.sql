-- Initial schema for wallet-service: wallets, wallet_transactions, processed_events.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "wallet_transaction_type" AS ENUM ('DEBIT', 'CREDIT');

CREATE TABLE "wallets" (
  "id"         UUID            NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    UUID            NOT NULL,
  "currency"   VARCHAR(3)      NOT NULL,
  "balance"    DECIMAL(18, 4)  NOT NULL DEFAULT 0,
  "version"    INTEGER         NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3)    NOT NULL,
  CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wallets_user_id_currency_key" ON "wallets"("user_id", "currency");

CREATE TABLE "wallet_transactions" (
  "id"         UUID                      NOT NULL DEFAULT gen_random_uuid(),
  "wallet_id"  UUID                      NOT NULL,
  "payment_id" UUID                      NOT NULL,
  "amount"     DECIMAL(18, 4)            NOT NULL,
  "type"       "wallet_transaction_type" NOT NULL,
  "reason"     TEXT,
  "created_at" TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wallet_transactions_wallet_id_fkey"
    FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT
);

CREATE INDEX "wallet_transactions_wallet_id_created_at_idx"
  ON "wallet_transactions"("wallet_id", "created_at");
CREATE INDEX "wallet_transactions_payment_id_idx"
  ON "wallet_transactions"("payment_id");

CREATE TABLE "processed_events" (
  "event_id"     TEXT         NOT NULL,
  "consumer"     TEXT         NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id", "consumer")
);
