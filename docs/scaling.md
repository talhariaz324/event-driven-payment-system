# Scaling

## Read path

Reads (`GET /payments/:id`, balance lookups) are easy:

- Each service is stateless — scale horizontally behind a load balancer
- Add Redis cache in front of hot queries: `payment:{id}` keyed lookup, TTL 5–60s, invalidate on `payment.settled` event
- For wallet balance reads under contention: cache aggressively, read-through with `SETNX`-based stampede protection

## Write path — payment-service

The bottleneck is `INSERT payments + INSERT outbox_events` in one transaction.

- One Postgres primary handles ~5–15k writes/sec with the default page cache and synchronous commit. Beyond that:
  - **Vertical**: bigger instance, NVMe, more shared_buffers
  - **Horizontal**: shard `payments` by `user_id` hash. The outbox table shards with the payment table — each shard has its own outbox + poller pods
- Connection pooling: PgBouncer in transaction mode in front of Postgres. Without it, Node.js apps with `maxConnections=100` will exhaust Postgres at ~5 pods

## Outbox poller scaling

Each pod runs `SELECT … FOR UPDATE SKIP LOCKED LIMIT batch_size`. Throughput scales linearly with pod count until:

- Kafka producer throughput per partition saturates (≈ 50–100 MB/s on a single broker partition)
- Postgres can't keep up with the UPDATE-set-published cadence

Mitigation:

- Increase Kafka partition count (more parallelism on the consume side too — see below)
- Batch publish: `producer.sendBatch()` with 100–500 events per RPC reduces network overhead by ~10x
- For very high throughput consider switching from poll to **logical replication / Debezium** (CDC) — eliminates the polling round-trip but adds operational complexity

## Consumer scaling

Each Kafka consumer group can scale up to `min(num_partitions, num_pods)`. Beyond that, extra pods sit idle.

Sizing rule: **partition count is the upper bound on consumer parallelism per service**, and you cannot increase partitions retroactively without a partition-rebalance migration. So pick a generous number up front (this repo defaults to 6 — for production payment volume pick 32 or 64).

Per-aggregate ordering is preserved because partition key = `paymentId` — all events for one payment land on the same partition, consumed by the same pod, in order.

## Hot-key skew

If a single user causes 10% of all payment events (e.g. a bot or a bug), one partition gets 10% of load while others sit idle. Mitigations:

1. **Compound partition key**: hash `userId + paymentId` — sacrifices per-user ordering for per-payment ordering. Acceptable if you only need ordering at the payment-aggregate level
2. **Detect and isolate**: rate-limit the offending user upstream
3. **Sticky partitioner with random salt**: kafkajs default sticky partitioner mostly handles this, but skewed keys defeat it

## DLQ and replay

`payments.v1.dlq` holds events that exceeded retry budget. Operations:

- Alert on `payments.v1.dlq` lag > 0
- Build a small CLI or admin endpoint to read the DLQ, fix the underlying bug, and **re-produce** the original event back to `payments.v1` (don't reset offsets — that replays everything)
- Track DLQ headers (`dlq-reason`, `dlq-original-topic`, `dlq-original-offset`) for audit

## Database growth

`outbox_events` grows monotonically. Without cleanup it becomes a multi-billion-row table that's slow to scan even with the partial index on `(status, created_at) WHERE status = 'PENDING'`.

- **Retention**: nightly job deletes `published_at < NOW() - INTERVAL '7 days'` — keep enough for replay and audit, drop the rest
- **Partitioning**: declarative range partitioning on `created_at`, monthly partitions — drop old partitions in O(1)

`processed_events` similarly — keep the last 30 days. Older duplicate events are infinitesimally unlikely; if you do replay further than 30 days back, idempotency is the consumer's responsibility (use `INSERT … ON CONFLICT DO NOTHING` on the side-effect table).

## Multi-region

Out of scope for this repo, but the pattern extends:

- One Kafka cluster per region, MirrorMaker 2 for cross-region replication, prefix topics with region (`us.payments.v1`)
- Postgres logical replication for the payments table to a read replica in the secondary region for disaster recovery
- The outbox-poll pattern works unchanged — each region has its own poller publishing to its own Kafka cluster
