# Testing and acceptance

## Test layers

Unit tests cover normalization, DSL safety, operation classification, amount/fee calculation and state transitions. PostgreSQL integration tests cover real constraints/locks, tenancy, receipt consumption, ledger transactions and outbox. API tests cover auth, idempotency, validation and error privacy. Browser tests cover main operations. Real Android tests cover capture/lifecycle/SIM behavior.

## Required scenarios

| Scenario | Expected result |
| --- | --- |
| Matching receipt arrives before claim | Stored unmatched; credit once after eligible claim |
| Claim arrives before receipt | Pending; credit once after eligible evidence |
| Duplicate upload or worker retry | Existing acknowledgment; one credit/outbox event |
| Two claims compete concurrently | Conflict/review or preexisting consumed rejection; no arbitrary duplicate credit |
| Wrong sender, transaction, amount, provider or receiver | No approval |
| Masked sender / missing amount | Review, no auto-credit |
| Outgoing/failed/OTP/balance SMS | Nonpayment or ignored; no credit |
| Multiple conflicting templates | Ambiguous review case |
| Same transaction with conflicting receipt details | Quarantine, no second credit |
| Same order/key retry | Same intent; differing body gets conflict |
| Late claim / historical receipt | Apply documented expiry policy; review when uncertain |
| Fee changes after creation | Original snapshotted fee used |
| Backend dies before commit | No partial verified/ledger state |
| Backend dies after commit before acknowledgment | Retry returns durable existing result |
| Webhook failure | Verified remains verified; outbox retries |
| Merchant accesses other tenant | 404/denied with no data exposure |
| Merchant attempts receiving number/device edit | Denied server-side |
| Device uploads wrong binding/account | Rejected/quarantined |
| Revoked device replays signed upload | Unauthorized; no approval |
| Queue offline and restart | Captured data persists and resumes safely |
| Settlement concurrent requests | Available funds reserved once |
| Payout uncertain result | Funds remain reserved until reconciliation |
| Adjustment/self-approval | Unauthorized; no posting |

## Android device matrix

Test at least three actual managed phone models including a vendor with aggressive background limits, supported older/latest Android versions, single and dual SIM, alternate active data SIM, SIM removal/replacement, permission revocation, reboot, process death, force-stop, multipart/Bangla SMS, app update, no network, clock skew and storage pressure.

Document observed OS limitations and capture recovery. Do not replace real-device evidence with emulator SMS injection alone. Measure whether a receiving subscription can be resolved reliably on each supported configuration.

## Template acceptance

Each published template includes multiple positive field variations and negatives for nearby nonpayment formats. Extraction returns all required full fields. Tests prove no matching outside permitted operation/origin/account type. New versions cannot rewrite credited history.

## Financial acceptance

Run concurrency tests against PostgreSQL, not just in-memory logic. Assert balanced entries, unique source keys, no negative available liability, reservation/payout idempotency, and equality of derived balance projections to ledger totals. Restore a backup and reconcile it in staging.

## Performance and reliability targets

Planning targets, to measure rather than promise: durable ingestion response p95 under 2 seconds at agreed peak load; matching p95 under 5 seconds after both eligible claim/evidence exist; online webhook first attempt under 10 seconds after commit. Android capture/upload latency depends on OS/network and is measured separately. Initial load fixture: 10,000 payments/day, 20 collection phones, 100 merchants; revise once volume is known.

## Definition of done

Feature is implemented, permission-tested, migration-reviewed, observable, documented and verified across relevant error paths. Production pilot additionally requires real samples for all enabled provider/account/operation combinations, provider/distribution review, operational runbooks and no unresolved critical security/accounting issues.

Current prototype tests are a starting point; they do not certify these target acceptance criteria.
