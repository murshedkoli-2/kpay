# Build roadmap and task checklist

This roadmap defines the implementation sequence after the documentation milestone. Existing prototype files remain available as a development reference; each phase must satisfy its completion gate.

## Phase 0 — foundation and decisions

- [ ] Review confirmed scope and defaults; keep references removed.
- [ ] Confirm actual incoming operations/number formats for each provider/account type.
- [ ] Select managed phones and approved signed-APK distribution path.
- [ ] Establish development/staging configuration and synthetic fixtures.
- [ ] Scaffold TypeScript backend/web and Kotlin Android projects with reproducible builds.
- [ ] Define migrations, environments, secrets and shared API schemas.

Gate: reproducible local backend/web/Android builds and understood device permission route. Real payment samples are collected through the panel during controlled validation rather than embedded in code.

## Phase 1 — identity, accounts and configuration

- [ ] Admin login, MFA, roles, session/CSRF protections.
- [ ] Merchant/user identities and tenant boundary.
- [ ] Account create/edit/pause/retire and immutable historical identity.
- [ ] Versioned account instructions and allocation limits.
- [ ] Audit model and restricted evidence visibility.

Gate: merchants cannot configure receiving accounts; all privileged actions pass access tests.

## Phase 2 — SMS template administration

- [ ] Sample editor, field selection and restricted DSL.
- [ ] Parse preview, normalization and positive/negative fixture runner.
- [ ] Version publication, collision detection, pause and rollback.
- [ ] Unrecognized-message review and reparse audit.

Gate: new eligible SMS format can be added without code changes; unsupported/masked formats fail closed.

## Phase 3 — real Android capture

- [ ] Pairing code/challenge, device key and administrator approval.
- [ ] Disclosure, permission workflow and SIM/account binding.
- [ ] Multipart capture, configured sender filtering and Room queue.
- [ ] Signed batches, per-item acknowledgment, WorkManager retry.
- [ ] Health screens, configuration refresh, pause/revoke/rebind.
- [ ] Real phone tests and documented unsupported configurations.

Gate: bKash controlled SMS travels from real bound phone to stored server evidence, survives offline recovery and cannot cross a SIM/account boundary.

## Phase 4 — payment verification and ledger

- [ ] Merchant intent allocation, checkout and customer claims.
- [ ] Transaction identity/reservation, conflicts and exact matching.
- [ ] Expiry/review policy and atomic receipt consumption.
- [ ] Double-entry ledger and immutable decisions.
- [ ] Recharge intents and user credits.
- [ ] PostgreSQL concurrency and crash-recovery tests.

Gate: one eligible payment gives one balanced posting; no customer reference field anywhere.

## Phase 5 — merchant API and delivery

- [ ] Scoped API keys, idempotency and merchant dashboard.
- [ ] Hosted checkout tokens and safe status polling.
- [ ] Signed webhook outbox, retries, SSRF controls and delivery UI.
- [ ] Integration documentation and example merchant application.

Gate: merchant order is fulfilled from signed event/server status, including delayed/repeated delivery, with tenant isolation.

## Phase 6 — finance operations

- [ ] Versioned fees, balance projections and reconciliation dashboard.
- [ ] Settlement request/reservation and destination approval.
- [ ] Maker/checker approval and controlled external execution evidence.
- [ ] Payout uncertainty/failure resolution, refunds and adjustments.
- [ ] Finance exports and backup/restore acceptance.

Gate: no overdraw/double execution; daily receipt and ledger reconciliation completes with explainable variance.

## Phase 7 — providers and launch readiness

- [ ] Repeat controlled real-device template validation for Nagad and Rocket.
- [ ] Enable only validated provider/account/operation combinations.
- [ ] Device offline/parser failure/webhook/backlog alerts.
- [ ] Security, permission/distribution and provider/fund-holding review.
- [ ] Small approved real-money pilot with limits and rollback controls.
- [ ] Measure latency, losses, duplicates and settlement reconciliation before expansion.

Gate: complete trace from approved central account/device through receipt, verification, ledger, merchant delivery and settlement.

## Work-item convention

Each implementation task links to its specification, acceptance scenario, schema/API change, migration, test evidence and operational effect. Update checkboxes only when acceptance passes. No milestone is complete solely because screens exist.
