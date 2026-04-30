# Transactional Outbox Pattern

## The problem it solves — the dual-write problem

A payment service needs to:

1. Persist the payment row in Postgres
2. Publish a `payment.initiated` event to Kafka

If you do these as two separate operations, **four failure modes are possible**:

| # | DB write | Kafka publish | Result |
|---|---|---|---|
| 1 | ✅ | ✅ | Correct |
| 2 | ❌ | ❌ | Correct (client retries) |
| 3 | ✅ | ❌ | **Inconsistent** — payment exists, downstream services never hear about it |
| 4 | ❌ | ✅ | **Inconsistent** — phantom event for a payment that doesn't exist |

You cannot solve this with try/catch. The crash can happen between the two operations, in transit, or in any infrastructure layer in between.

Two-phase commit across Postgres and Kafka is theoretically possible but operationally toxic — it sacrifices availability for consistency you don't actually need.

## The outbox pattern

Replace the dual write with a **single write** to one transactional resource (Postgres):

```sql
BEGIN;
  INSERT INTO payments (id, user_id, amount, ...) VALUES (...);
  INSERT INTO outbox_events (id, topic, payload, status) VALUES (..., 'PENDING');
COMMIT;
```

A separate background worker polls `outbox_events WHERE status = 'PENDING'`, publishes to Kafka, then marks them `PUBLISHED`.

| # | DB write | Outbox row | Kafka publish | Result |
|---|---|---|---|---|
| 1 | ✅ | ✅ (same tx) | ✅ | Correct |
| 2 | ❌ | ❌ (same tx) | n/a | Correct |
| 3 | ✅ | ✅ (same tx) | ❌ | Worker retries until ✅ — eventually consistent |
| 4 | impossible | impossible | n/a | n/a |

The state-of-the-system and the outbound-event commit **as one atomic transaction**. The publish is decoupled in time, and is recoverable.

## Implementation in this repo

`services/payment-service/src/outbox/outbox.worker.ts`:

- `setInterval` polls the table every `OUTBOX_POLL_INTERVAL_MS` (default 1000ms)
- Selects up to `OUTBOX_BATCH_SIZE` pending rows with `FOR UPDATE SKIP LOCKED` so multiple poller pods can run safely in parallel without double-publishing
- Publishes each row, then transitions to `PUBLISHED` with `published_at` timestamp
- On failure, increments `attempts` and stores `last_error`. After `MAX_ATTEMPTS` (10), transitions to `FAILED` for manual triage

## Why `FOR UPDATE SKIP LOCKED`

Without it, a second poller pod sees the same `PENDING` rows the first pod is publishing and publishes them too — duplicates.

`FOR UPDATE` takes a row-level lock. `SKIP LOCKED` tells Postgres to ignore rows currently locked by another transaction. The result: each poller picks up a disjoint slice of pending events. Throughput scales linearly with poller count until you saturate Kafka or the DB.

## Why poll instead of LISTEN/NOTIFY or CDC?

- **Poll (this repo)**: simplest, works on any Postgres, observable via row counts, but worst-case latency = poll interval
- **LISTEN/NOTIFY**: lower latency (sub-ms), but `NOTIFY` payloads are not durable — if no listener is connected, the signal is lost. You still need a poller for catch-up
- **Debezium/CDC**: lowest latency, but introduces a new infrastructure component (Kafka Connect + Debezium connector) with its own operational burden

For most workloads a 1-second poll interval is the right default — the latency penalty is invisible against network + Kafka publish time, and the operational story is dramatically simpler.

## Why not just publish from inside the transaction?

```ts
// DON'T do this
await db.transaction(async (tx) => {
  await tx.insert('payments', {...});
  await kafka.send({...});  // ❌
});
```

This is the bug, not the fix. If `kafka.send()` succeeds but the DB COMMIT fails, you've published a phantom event. The whole point of the outbox is that **only the DB is the transactional resource** — Kafka is downstream of the commit.

## Idempotency on the consumer side

Outbox guarantees **at-least-once** delivery to Kafka, not exactly-once. A retry can republish a row already consumed.

Consumers must dedupe. This repo does it with `processed_events (event_id PK, consumer)`:

```ts
INSERT INTO processed_events (event_id, consumer) VALUES ($1, $2)
ON CONFLICT (event_id, consumer) DO NOTHING
RETURNING event_id;
```

If the insert returns no row, the event was already processed — skip the side-effect.

## When NOT to use the outbox pattern

- Pure CRUD with no downstream consumers — there's nothing to publish
- Sub-millisecond write latency requirements where even a non-blocking outbox INSERT is too slow (rare; Postgres handles this fine up to ~10k tx/s on commodity hardware)
- The downstream consumer is the same service writing the row, in which case use a normal transaction

For everything else with cross-service event-driven flow, the outbox is the right tool.
