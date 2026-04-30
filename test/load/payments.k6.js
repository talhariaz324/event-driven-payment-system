/**
 * k6 load test — POST /payments
 *
 * Validates that the payment write path can sustain target throughput
 * under realistic concurrency. Use this BEFORE making scaling claims
 * in marketing material — claims unbacked by load tests are folklore.
 *
 * Run:
 *   k6 run test/load/payments.k6.js
 *
 * With env overrides:
 *   k6 run -e BASE_URL=http://localhost:3000 -e VUS=200 test/load/payments.k6.js
 *
 * What it measures:
 *   - p50 / p95 / p99 latency on POST /payments
 *   - Request rate sustained
 *   - Error rate (anything not 202 within 2s)
 *   - Idempotency-Key reuse rate (we generate unique keys per VU iteration,
 *     so dedupe should be ~0% — if it's higher, we have a bug)
 *
 * What it does NOT cover:
 *   - Outbox publish lag (use prometheus outbox_events_pending gauge instead)
 *   - Downstream consumer throughput (separate test against wallet/ledger)
 *   - Cold-start / warm-up effects (use stages.rampUp and ignore p99 in
 *     the first ramp-up window)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TARGET_VUS = parseInt(__ENV.VUS || '50', 10);

const idempotencyHits = new Counter('idempotency_hits');
const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: Math.floor(TARGET_VUS / 2) }, // ramp up
    { duration: '2m',  target: TARGET_VUS },                  // sustain
    { duration: '30s', target: 0 },                           // ramp down
  ],
  thresholds: {
    'http_req_duration{status:202}': ['p(95)<500', 'p(99)<2000'],
    'errors': ['rate<0.01'], // <1% error rate
    'idempotency_hits': ['count<10'], // we should never see dedupe with unique keys
  },
};

export default function () {
  const idempotencyKey = uuidv4();
  const userId = uuidv4();
  const payload = JSON.stringify({
    userId,
    amount: 100,
    currency: 'USD',
  });

  const res = http.post(`${BASE_URL}/payments`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    timeout: '5s',
  });

  const ok = check(res, {
    'status is 202': (r) => r.status === 202,
    'has paymentId': (r) => {
      try {
        return JSON.parse(r.body).paymentId !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (!ok) {
    errorRate.add(1);
    console.error(`request failed: status=${res.status} body=${res.body}`);
  } else {
    errorRate.add(0);
    try {
      const body = JSON.parse(res.body);
      if (body.deduplicated) idempotencyHits.add(1);
    } catch {
      // body parsing already covered by check above
    }
  }

  sleep(0.1); // 10 req/s per VU upper bound — adjust for your target throughput
}
