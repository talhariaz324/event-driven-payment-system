# Load tests

Performance / throughput validation using [k6](https://k6.io/).

## Why k6 and not artillery / wrk / vegeta

- **k6's scripting model is JavaScript** — same language as the services. Easier for the team to maintain than wrk's Lua or vegeta's CLI templates.
- **First-class threshold assertions** — k6 fails the run if SLOs are violated, which makes it CI-runnable.
- **Native histogram + custom metrics** — counter, rate, and trend metrics out of the box.
- **Cloud option** — k6 Cloud for distributed runs when you need >10k RPS from one machine isn't viable.

## Running locally

```bash
# Install k6 (macOS)
brew install k6

# Install k6 (Linux)
sudo apt install k6   # Debian/Ubuntu via the official k6 repo

# Bring up the full stack
npm run infra:up

# Wait for services to be ready
curl -fsS http://localhost:3000/health/liveness
curl -fsS http://localhost:3001/health/readiness

# Run the load test
k6 run test/load/payments.k6.js

# Customize (50 VUs default, 2.5min total run)
k6 run -e BASE_URL=http://localhost:3000 -e VUS=200 test/load/payments.k6.js
```

## Interpreting results

Look for:

- `http_req_duration{status:202} p(95)` — should be under 500ms locally on commodity hardware
- `errors` rate — should be near 0
- `idempotency_hits` — should be 0 (we generate unique keys per iteration). Non-zero means a bug in idempotency handling, not a test artifact.

After the run, also check:

- `payment_service_outbox_events_pending` (prometheus gauge) — should drain to ~0 within seconds of test end. Sustained pending = poller can't keep up.
- Postgres `pg_stat_activity` — count of active connections. Saturating the connection pool is a common bottleneck.
- Kafka consumer lag — if downstream services can't keep up.

## Thresholds in CI

The script defines thresholds that fail the run if violated:

- `http_req_duration{status:202} p(95) < 500ms`
- `http_req_duration{status:202} p(99) < 2000ms`
- `errors rate < 1%`
- `idempotency_hits count < 10`

Tune these to your target. CI should fail loudly if thresholds regress — that's the whole point of having them.

## What this does NOT validate

- Spike handling (10x sudden burst)
- Sustained load over hours (memory leaks, connection leaks)
- Multi-region latency
- Downstream consumer throughput (wallet/ledger/notification)

Each of those is a separate test scenario worth writing.
