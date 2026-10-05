# Architecture

## Target components

| Component | Proposed implementation | Responsibility |
| --- | --- | --- |
| Admin / merchant web | React + TypeScript | Operations and merchant workflows |
| Checkout | Web frontend | Display central collection instructions and accept claim details |
| API backend | Node.js + TypeScript / NestJS | Auth, tenancy, configuration, matching and ledger |
| Database | PostgreSQL | Durable state, constraints and atomic money operations |
| Job processing | Redis-backed workers | SMS parsing, matching, webhooks and notifications |
| Android agent | Kotlin, Compose, Room, WorkManager | Capture, persist and report SMS |
| Evidence storage | Encrypted database/object storage | Restricted raw SMS and reconciliation attachments |

The current dependency-free prototype remains a development reference. Move money operations to PostgreSQL before production. Redis is scheduling infrastructure; losing Redis must not lose a receipt, credit or webhook event. Persist work/outbox records in PostgreSQL.

## Trust boundaries

- Merchant clients authenticate only to tenant-scoped merchant endpoints.
- Customer claims are assertions, not evidence of receipt.
- Enrolled phones authenticate to device endpoints; their evidence can still be fabricated if compromised.
- Admin actions require role checks on the server, not just hidden navigation.
- An SMS originating address is a filter, not cryptographic proof from a provider.
- Server configuration, parsing and matching determine acceptance. The app cannot approve payments or choose beneficiary balances.

## Main payment sequence

1. Merchant server creates intent with order ID, amount, provider preference and idempotency key.
2. Backend allocates a central account and returns a hosted checkout URL and expiry.
3. Customer follows the account-type-specific instructions and submits sender number and transaction ID.
4. Collection phone receives a candidate payment SMS, saves it locally and uploads its envelope.
5. Server validates device/account binding, stores the envelope and parses an eligible immutable template version.
6. Matching locks receipt and intent, verifies exact fields, records decision, posts ledger transaction and emits durable outbox event in one database transaction.
7. Webhook worker delivers the event; the merchant can poll status independently.

Steps 3 and 4 may happen in either order. Failed delivery does not roll back a verified payment.

## Recharge sequence

Authenticated user creates a recharge intent. The same checkout, claim, receipt and matching pipeline runs. The server credits that intent's fixed user beneficiary. Neither SMS content nor customer claim selects a different beneficiary.

## Configuration flow

Admin draft -> test against samples -> approve/publish immutable version -> backend updates active configuration -> agent downloads approved sender/account capture filters. Parsing remains server-side so template changes do not require Android releases.

## Delivery model

SMS ingestion and job delivery are at least once. Monetary side effects are effectively once using unique keys, row locks and atomic transactions. Devices receive per-event acknowledgments only after durable storage. Duplicate envelopes return the existing acknowledgment.

## Module boundaries

Identity, tenancy, receiving accounts, devices, templates, evidence, payment intents/claims, verification, ledger, settlements, webhook outbox, notifications and audits should be separate backend modules. UI modules consume these contracts; they must not write tables directly.
