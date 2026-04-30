# Security Policy

## Reporting a vulnerability

If you've found a security vulnerability in this codebase, please **do not open a public GitHub issue**. Instead, report it privately so it can be triaged and fixed before disclosure.

**Preferred channel:** open a [private security advisory](https://github.com/talhariaz324/event-driven-payment-system/security/advisories/new) on this repository.

**Alternative:** email the maintainer (see GitHub profile) with subject prefix `[security]`.

What to include:

- Affected version / commit SHA
- Reproduction steps
- Impact assessment (what an attacker can achieve)
- Suggested mitigation if you have one

You should expect an acknowledgement within 72 hours and a remediation plan within 7 days for confirmed issues.

## Disclosure timeline

- **Day 0**: report received, acknowledgement sent
- **Day 1-7**: triage, severity assessment, fix scoping
- **Day 7-30**: fix developed and tested
- **Day 30-90**: coordinated public disclosure with reporter credit (if desired)

Critical issues affecting production deployments may be disclosed faster on an emergency basis.

## Scope

In-scope:

- Authentication / authorization bugs
- Idempotency bypasses leading to double-spend or duplicate side effects
- Outbox / event publication bugs that lose or duplicate financial events
- Container or Dockerfile misconfigurations exposing secrets
- Dependency vulnerabilities with practical exploit paths
- Kafka or PostgreSQL configuration that allows unauthorized access

Out-of-scope:

- Issues only reproducible against a fork with custom modifications
- Theoretical attacks without a practical exploit path
- Rate-limiting / DoS issues in the local Docker compose dev stack (not a production target)
- Social engineering, phishing, physical attacks

## What this codebase does NOT do

This is a teaching architecture, not a vendored payments product. Things production-grade payment systems must do that this repo deliberately doesn't (yet):

- PCI DSS-compliant card data handling
- HSM-backed key management
- Sanctions / OFAC screening
- Real-time fraud detection
- Multi-region active-active failover

If you're using patterns from this repo as a starting point for a real product, treat the security model as a baseline, not a finished posture.
