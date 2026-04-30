# Contributing

Thanks for considering a contribution. This is a teaching architecture, so contributions that improve clarity, fix bugs, or strengthen the demonstrated patterns are especially welcome.

## Quick start

```bash
# install
npm install

# build shared packages first (services depend on their dist)
npm run build --workspace=@eds/shared-types
npm run build --workspace=@eds/kafka-core

# run the full stack locally
npm run infra:up
```

See [`README.md`](README.md) §14 for full smoke-test instructions.

## Branching

- Branch from `main`
- Use a descriptive branch name: `fix/outbox-poller-skip-locked`, `feat/dlq-replay-cli`, `docs/clarify-idempotency`
- Keep PRs focused. One logical change per PR. Smaller PRs ship faster.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): brief summary

Optional body explaining the why and any non-obvious how.
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `ci`, `refactor`, `perf`.

Scope is the package or service: `payment-service`, `kafka-core`, `infra`, `docs`.

Examples:

- `feat(payment-service): add /metrics endpoint for prometheus scraping`
- `fix(kafka-core): handle JSON parse error before dispatching to handler`
- `docs(outbox): clarify FOR UPDATE SKIP LOCKED rationale`

## Code style

- TypeScript strict mode is non-negotiable — no `any` without an explicit `// eslint-disable` and a comment explaining why
- Run `npm run lint` and `npm run format` before pushing
- Comments explain *why*, not *what* — assume the reader can read code

## Tests

If you add code that has logic worth testing, add a test. The existing patterns:

- Service unit tests next to the file: `payments.service.spec.ts`
- Integration tests under `services/<svc>/test/integration/`
- Smoke tests under `services/<svc>/test/smoke/`

For idempotency / outbox / consumer dedup logic, an integration test against a real Postgres + Kafka container is required (mocks lie about distributed-system behavior).

## Pull requests

PR description should include:

- **Why**: what problem this solves
- **What**: high-level summary of the change
- **How tested**: how you verified it works (unit/integration test results, manual steps)
- **Risk**: anything reviewers should look at extra carefully

CI must be green before merge. The CI workflow runs lint + build for all workspaces.

## Questions?

Open an issue with the `question` label, or start a discussion. The architecture docs (`docs/`) are the first place to look for "why does it work this way" answers.
