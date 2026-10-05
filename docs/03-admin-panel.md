# Admin panel specification

## Navigation and permissions

Dashboard; Payments; Incoming SMS; Review queue; Receiving accounts; Agent devices; SMS templates; Merchants; Recharge users; Ledger; Settlements; Webhook deliveries; Audit log; Administrators; Settings.

Operations can manage collection configuration and investigate. Finance can reconcile and prepare settlements. Support has masked read access and notes. Super admin manages roles and policy. Separate settlement preparer and approver identities. Security-sensitive changes require MFA/step-up authentication and an audit reason.

## Screen definitions

### Dashboard

- Show verified gross collection, net merchant credits, recharge credits, pending claims, unmatched receipts, reserved settlements, offline devices and failed webhooks.
- Date range defaults to today in Asia/Dhaka; allow provider and merchant filters.
- Each card links to its underlying filtered list. Never label device sync count as verified payment count.
- Alerts: permission loss, disabled collection account, template parse spike, oldest unsynced event, reconciliation variance.
- Empty state explains the next configuration action; loading/error states cannot look like zero balances.

### Receiving accounts

List columns: provider, masked number, account type, display label, linked device/SIM, status, permitted payment operation, daily limits, health, last receipt.

Create form: provider, account type, full number, label, allowed incoming operation, customer instructions, amount limits, daily collection cap. Validate number format but support provider-specific identifiers through an explicitly configured identifier format if real samples require it. Default to full Bangladesh mobile numbers; do not silently reject/transform a provider account identifier without evidence.

Actions: create, edit nonhistorical configuration, activate, pause, retire, link device. Account activation requires eligible published template, active approved device/SIM binding and supported incoming operation. A retired account cannot receive new intent allocation. Preserve account identity for outstanding intents, receipts and history.

Number/provider changes create a new account identity instead of rewriting historical records. Pause blocks new allocation but permits validated late receipts for already allocated intents; security quarantine blocks automatic matching as well.

### Agent devices

Columns: name, device ID, app version, Android version, status, approved accounts, SIM binding, last seen, last successful sync, queued count, permission status, battery/network telemetry if permitted.

Actions: generate expiring one-use pairing code, approve proposed binding, pause, revoke, rotate credentials, request configuration refresh, view health/events. Never display reusable device secrets in ordinary lists.

Device detail includes operator label, public signing key, credential lifecycle, binding history and recent failed uploads. Same SIM/account cannot have two active writer bindings. A replacement phone requires old binding revocation or a controlled transfer.

### SMS templates

List by provider/account type/operation/sender address/version/status. Editor stores sample messages, field markers, whitespace policy, case policy, optional timestamp field definition and required test fixtures. Extracted preview displays original and normalized sender, transaction ID and amount.

Actions: save draft, test, add positive/negative samples, publish, pause, clone version, rollback to a prior version. No arbitrary JavaScript or unrestricted regex execution. See [template specification](05-sms-templates.md).

### Incoming SMS and receipts

List: event ID, device, central account, originating address, device/provider/server times, parse result, template version, transaction ID, amount, matching status. Default masked data; restricted raw evidence reveal requires permission and audit entry.

Filters: provider, account, device, date, unparsed, missing fields, ambiguous, duplicate, conflict, unmatched, credited. Detail links to payment, verification decision and ledger posting. Reparse creates a new parse attempt; it cannot silently change already consumed evidence.

### Payments and review queue

Payment list: ID, merchant/order ID or user recharge, expected amount, account, sender, transaction ID, state, timestamps and webhook status. Detail shows immutable allocation and all claims/evidence/decisions.

Review cases include unmatched claim, masked sender, malformed SMS, transaction conflict, amount mismatch, expired claim and suspicious device. Actions: annotate, assign, reparse, retry match, reject claim, resolve with independent evidence. A manual adjustment is a separate finance action with maker/checker approval; never manufacture an SMS receipt or toggle status to paid without a ledger operation.

### Merchants and recharge users

Merchant list/detail: identity/status, approved providers, limits, fee schedule, balance buckets, orders, settlement destination, keys metadata and webhook configuration. Actions: onboard, suspend/resume, rotate/revoke keys and approve destination changes. Display API secrets once at creation, store hash thereafter. Suspension blocks new intents and settlements, not historical visibility/reconciliation.

Recharge user detail: status, verified recharge history, available balance, spending postings, review holds. No arbitrary editable balance field. All credits/debits are ledger-backed.

### Ledger and settlements

Ledger filters by beneficiary, currency, transaction type, date and payment ID. Export masked CSV with access checks and export audit. Detail shows balanced entries and provenance.

Settlement screens: requested -> reserved -> approved -> executing -> paid/failed/cancelled. Display gross eligible balance, pending reservations, payout amount, fees, approved destination and execution evidence. See [ledger specification](10-ledger-and-settlements.md).

### Webhooks, audits and settings

Webhook detail shows event ID, destination, attempts, HTTP status, next retry and sanitized response. Redelivery keeps event ID stable. Never expose signing secrets or full sensitive payloads in general logs.

Audit log has actor, permission, action, target, timestamp, reason and redacted before/after changes. Read-only, filterable and exportable by authorized roles.

Settings: allocation limits, expiry/review windows, sender allowlists, alert thresholds, retention, session policy and fee schedules. Validate changes server-side, version and audit them. Show warnings about affected pending work before destructive configuration transitions.

## Common acceptance criteria

- All lists support pagination, filters and explicit empty/error/loading states.
- Forms show field validation and prevent duplicate submission without hiding errors.
- Mutation responses return authoritative saved state; stale edits use optimistic version checks.
- Every privileged action is permission-tested on the API.
- Sensitive numbers are masked except when an authorized workflow needs the full value.
- Export, evidence reveal, credential lifecycle, publication and payout actions are auditable.
