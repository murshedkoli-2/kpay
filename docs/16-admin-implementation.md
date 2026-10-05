# Admin implementation guide

Status: local runnable release. Date: 4 October 2026. This document describes implemented behavior; earlier documents remain the target production specification.

## Files

| File | Responsibility |
| --- | --- |
| `server.mjs` | Local HTTP server, authentication boundary, static security headers, webhook worker |
| `store.mjs` | Persistent schema upgrades, credentials, transactions and ledger helpers |
| `operations.mjs` | Admin permissions, configuration, evidence, matching, settlements and audits |
| `core.mjs` | Exact minor-unit amounts, Bangladesh sender normalization, restricted SMS DSL |
| `mfa.mjs` | Time-based authenticator generation, verification and counter handling |
| `webhooks.mjs` | HMAC signatures, DNS/IP restrictions, retries and attempt history |
| `public/app.js` | Admin views, forms, dialogs, filters and responsive navigation |
| `public/style.css` | Desktop/mobile visual system |
| `integration.test.mjs` | Isolated end-to-end domain/API acceptance tests |

## Running

Node.js 24+, `npm run dev`; visit http://127.0.0.1:3000. Change `PORT` for another port and `KPAY_DB` for an isolated database. Local data files and WAL files are ignored by Git. Keep the database private: secrets/raw evidence are not encrypted in this development release.

## Authentication and roles

`POST /api/login` accepts `{role:"admin",key:"OWNER_KEY"}` or `{role:"admin",email,password,otp?}` and returns a 30-minute idle session token. When MFA is enabled, root key sign-in also needs `otp`. The owner key cannot directly authorize admin API calls. Team passwords are scrypt-hashed; session/API key values are SHA-256-hashed. `POST /api/logout` revokes the session.

Role controls are on the server. Owner: all operations. Operations: collection configuration and investigations. Finance: merchant management, accounting, exports and payout approvals. Support: read masked data and add/assign review notes. Support cannot reveal raw SMS or template sample content.

Authenticator setup: `/api/admin/security/start`, `/confirm`, `/step-up`. Enabling requires a valid TOTP. Remember consumed counter to prevent code reuse; confirmation authorizes privileged mutations for five minutes. Enable MFA on all privileged accounts before any live deployment. A production recovery-code workflow is not yet provided; protect owner access and backups.

## Main endpoints

All examples use JSON and `Authorization: Bearer SESSION_OR_KEY`, except login/enrollment.

| Endpoint | Behavior |
| --- | --- |
| GET /api/state | Permission-filtered local workspace snapshot |
| POST /api/admin/accounts | Create paused central collection account |
| POST /api/admin/accounts/{id} | Version-checked edit or status change |
| POST /api/admin/templates | Save draft or clone version |
| POST /api/admin/templates/test | Extract sender/transaction/amount |
| POST /api/admin/templates/{id}/fixtures | Add positive/negative fixture to draft |
| POST /api/admin/templates/{id}/publish | Validate fixtures and publish version |
| POST /api/admin/templates/{id}/pause | Pause eligible format |
| POST /api/admin/devices | Device + one-use pairing code |
| POST /api/admin/devices/{id} | Approve/pause/revoke, re-pair or refresh |
| GET /api/admin/detail/{type}/{id} | Authorized detail; SMS reveal audited |
| POST /api/admin/reviews/{id} | Note, assign, retry or reject eligible claim |
| POST /api/admin/merchants | Merchant and pending destination request |
| POST /api/admin/merchants/{id} | Status/provider changes |
| POST /api/admin/merchants/{id}/keys | One-time merchant key issue |
| POST /api/admin/keys/{id}/revoke | API key revocation |
| POST /api/admin/merchants/{id}/destination | Destination change request |
| POST /api/admin/destinations/{id}/approve | Independent destination approval |
| POST /api/admin/users | Recharge user creation |
| POST /api/admin/users/{id} | Recharge user status |
| POST /api/admin/settlements | Atomic available-funds reservation |
| POST /api/admin/settlements/{id} | Approve, paid, uncertain, cancel |
| POST /api/admin/adjustments | Finance adjustment request |
| POST /api/admin/adjustments/{id}/approve | Independent adjustment approval |
| POST /api/admin/reconciliation | Record daily statement comparison |
| POST /api/admin/export | Audited ledger export rows |
| POST /api/admin/webhook-endpoints | HTTPS endpoint, one-time signing secret |
| POST /api/admin/webhooks/{id}/retry | Queue same stable event ID |
| POST /api/admin/webhooks/{id}/deliver | Controlled direct delivery attempt |
| POST /api/admin/administrators | Individual team account |
| POST /api/admin/administrators/{id} | Suspend/resume administrator |
| POST /api/admin/settings | Version-checked policy changes |

The implementation keeps the dashboard routes together under `/api`; public versioned contracts remain in [API plan](08-api-contracts.md).

## Merchant payment example

```json
{"provider":"bkash","order_id":"ORDER-001","amount":"500.00"}
```

Send to `POST /api/payments` with merchant API key. Server allocates an eligible central account. Merchant-supplied `account_id` or `receiving_number` is rejected. Repeated same order/details returns the existing request; differing amount returns conflict. `GET /api/payments/{id}` is tenant-scoped. `POST /api/payments/{id}/claim` accepts `{sender,transaction}`. Amount comes from the intent; no reference field.

Admin test payments may specify central account and merchant; recharge additionally specifies `beneficiary_type:"user"` and `user_id`. This admin testing flow is not a public user recharge authentication flow. Public user login/checkout tokens are separate build work.

## Device example

`POST /api/agent/enroll` with `{code,app_version,android_version}` consumes a pairing code and reveals test device credential once. Enrollment remains pending until admin approval.

`GET /api/agent/config` returns device status/version, central account/SIM label and published originating-address allowlist. `POST /api/agent/heartbeat` reports `{permission:"granted"|"denied",queue_depth}`.

```json
{
  "account_id":"CENTRAL_ACCOUNT_ID",
  "client_event_id":"STABLE_EVENT_UUID",
  "sms_sender":"CONFIGURED_ORIGIN",
  "message":"SYNTHETIC_SMS_FOR_TESTING",
  "sim":"APPROVED_SIM_LABEL"
}
```

Send to `POST /api/agent/receipts` with device credential. Same event/content returns duplicate; conflicting content returns 409. Unparsed messages persist for review. Matching commits receipt consumption, verification decision, balanced entries and webhook event atomically.

Development simulator routes require collection permission. They enroll using the pairing code or upload test evidence from an already approved device. This release uses hashed Bearer device keys and operator-defined SIM labels; asymmetric Android signing, trusted subscription metadata and real permission validation require the native app.

## Template publication

All non-marker text is literal. Sender, transaction and amount markers each appear once. Publication requires two distinct matching positive samples and one rejecting negative. Creating a version preserves history, and publishing a previous paused version rolls the active family back. Credited receipts cannot be reinterpreted by review retry. Provider transaction IDs normalize uppercase in this release; configurable case/timestamp/Bangla-digit policies remain planned extensions.

## Finance

Positive entry amounts credit conceptual liability accounts; negative amounts debit them. Every posting sums to zero. Unique source protects retries. Verified payment fees snapshot policy. Maker cannot approve own settlement/adjustment/destination request. No payout is actually executed; **Paid** records external test/approved payout evidence. Uncertain outcomes remain reserved and need finance resolution before funds can be released.

Daily reconciliation currently compares entered incoming statement total with receipt totals for that date in Asia/Dhaka. Provider statement import and independent proof validation remain external/production work.

## Verified coverage and remaining work

Covered in automated tests: activation/publication gates, duplicate prevention, access/tenancy, stale versions, one-use pairing, evidence reveal audit, matched recharge/merchant postings, settlement maker/checker, balanced reserve/payment postings, MFA replay/confirmation, and internal webhook rejection. Browser QA verifies all screens, form persistence, template preview and mobile overflow/navigation.

Uncertain payout resolution is implemented: a different administrator must record independent failure evidence before releasing funds, or confirmed transaction/evidence before recording payment. No automatic release is allowed after an unknown outcome.

Before production: PostgreSQL/TypeScript deployment migration; secure cookie sessions; encryption and backups; Android app/signing/attestation; real provider samples and approved operation formats; production MFA recovery; public checkout/user auth; statement import; server-side list pagination; automatic retention/archival; live webhook delivery acceptance; operational and provider review.
