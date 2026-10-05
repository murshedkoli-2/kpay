# Data model

PostgreSQL target schema. Use UUID primary IDs, UTC timestamps, foreign keys, tenant scoping and soft lifecycle states. Store amounts as BIGINT minor units with currency BDT. Enforce bounds at API and database levels.

## Identity and configuration

| Entity | Required fields / constraints |
| --- | --- |
| administrators | identity, role assignments, MFA state, active state; no plaintext passwords |
| roles / permissions | explicit actions and scope; server-enforced |
| merchants | legal/display identity, status, limits, fee schedule version |
| users | authentication identity, status, recharge eligibility |
| api_keys | merchant_id, prefix, hash, scopes, created/expiry/revoked; reveal secret once |
| receiving_accounts | provider, account identifier, type, operation, status, limits, instruction version; unique provider+identifier |
| devices | public key, status, label, app/OS versions, enrolled/last_seen; no raw key material in listings |
| device_bindings | device_id, receiving_account_id, subscription identity metadata, version, status; one active writer per account |
| pairing_tokens | hashed token, expiry, allowed enrollment, consumed time; single use |
| sms_templates / template_versions | identity + immutable DSL/config/version/status |
| sms_template_samples | version_id, redacted fixture, positive/negative expectation |
| fee_schedules | immutable version, effective date, formula and rounding policy |

## Payment evidence and intent

| Entity | Required fields / constraints |
| --- | --- |
| payment_intents | beneficiary_type/id, tenant, order_id, amount, currency, account/provider snapshot, status, created/expiry, policy/fee version |
| customer_claims | intent_id, full normalized sender, original/canonical transaction ID, status, submitted time; append-only attempts |
| sms_events | device_id, client_event_id, binding_id/version, encrypted raw body, origin, hashes, timestamps, config version; unique device+event |
| parse_attempts | sms_event_id, immutable template version, result/errors, original/normalized fields, operation; append-only |
| incoming_receipts | event/parse pointer, provider, account, canonical transaction, sender, amount/currency, evidence times, status; financial identity unique |
| transaction_reservations | canonical provider/account/transaction lock/reservation for competing claims |
| receipt_consumptions | receipt_id unique, intent_id unique, decision_id, consumed_at |
| verification_decisions | intent, receipt, claim, outcome, rule version, reason, actor, time; immutable |
| review_cases | category, entity links, assignee, state, notes and resolution evidence |

Merchant order ID is unique within merchant, not globally. Recharge has an internal intent identifier and server-fixed user beneficiary. No payment reference field exists. Original raw values are restricted; normal listings expose masked sender/account identifiers.

## Accounting and delivery

| Entity | Required fields / constraints |
| --- | --- |
| ledger_accounts | owner/type/currency, available/reserved/control account classification |
| ledger_transactions | unique source_type+source_id+operation, posting time, reason, immutable |
| ledger_entries | transaction_id, ledger_account_id, debit/credit signed amount; per-currency balanced transaction |
| settlements | merchant, requested amount, destination snapshot/version, state, maker/checker, fees |
| payout_executions | settlement, idempotency key, external transaction evidence, result; prevent duplicate external identity |
| reconciliation_runs / items | date/provider/account, statement/evidence totals, variance, assigned resolution |
| webhook_endpoints | merchant, validated URL, encrypted signing secret/version, state |
| webhook_events | stable event ID, payment/tenant, immutable payload, creation time |
| webhook_attempts | event, endpoint, attempt count, status, redacted response, retry time |
| outbox_jobs | type, payload pointer, due/status/attempts; committed with business operation |
| audit_events | actor, action, entity, reason, redacted changes, request ID/time; append-only |

## Indexing and transactions

Index pending intents by provider/account/amount; claims by canonical transaction; receipt identity; device queue state; tenant payment creation time; due outbox work; review state; ledger owner/date. Lock rows/transaction reservations for matching and balance reservations. Database constraints remain authoritative under concurrent workers.

Balance projections may be cached but rebuild from ledger. Do not use floating-point amounts, editable balance columns as sole authority, cascading deletion of financial history, or cross-tenant lookup by ID alone.

## Migration policy

Version schema changes, test rollback/recovery, and reconcile all imported prototype credits. Existing demo merchant/key data is not production identity data. Migrate only deliberately selected test records into development. Production starts with approved configuration and empty audited opening balances.
