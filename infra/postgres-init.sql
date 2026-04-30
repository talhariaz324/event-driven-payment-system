-- Bootstraps databases + extensions on first container start.
-- Schema for each service-owned table is created by Prisma migrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- payment-service uses the default 'payments' DB (already created via POSTGRES_DB).

-- ledger-service: separate database for strict bounded-context isolation.
SELECT 'CREATE DATABASE ledger'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ledger')
\gexec

-- wallets: separate database for strict bounded-context isolation.
SELECT 'CREATE DATABASE wallets'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'wallets')
\gexec
