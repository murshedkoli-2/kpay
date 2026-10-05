# API contracts

Target prefix `/v1`. These contracts replace prototype `/api` endpoints during implementation. JSON; HTTPS outside localhost; ISO-8601 UTC times. BDT amounts are decimal strings externally and integer poisha internally. IDs are opaque strings. Paginate lists with cursor/limit (default 25, maximum 100).

## Authentication

Admin web: expiring secure HttpOnly SameSite session cookie + CSRF defense on mutations; MFA/step-up for sensitive actions. Merchant: scoped Bearer API key. Device: enrolled device credential plus request proof from device private key, timestamp/nonce/body hash; anti-replay checks. Checkout: short-lived intent-scoped token, never a merchant key.

Error envelope:

```json
{"error":{"code":"RECEIPT_CONFLICT","message":"Payment needs review","fields":{},"request_id":"req_..."}}
```

Status codes: 400 malformed; 401 unauthenticated; 403 unauthorized; 404 absent or outside tenant scope; 409 conflict/stale version; 422 invalid extraction/business rule; 429 rate limit; 503 retryable unavailable. Do not leak other merchants' evidence in errors.

## Admin endpoints

| Method / route | Purpose |
| --- | --- |
| POST /admin/sessions; DELETE /admin/sessions/current | Sign in/out |
| GET /admin/dashboard | Filtered KPIs and alerts |
| GET, POST /admin/receiving-accounts | List / create central account |
| GET, PATCH /admin/receiving-accounts/{id} | Detail / version-checked config edit |
| POST /admin/receiving-accounts/{id}/status | Activate/pause/quarantine/retire with reason |
| POST /admin/device-pairings | Create limited one-use pairing code |
| GET /admin/devices; GET /admin/devices/{id} | Device health and bindings |
| POST /admin/devices/{id}/approve-binding | Approve binding proposal |
| POST /admin/devices/{id}/revoke | Revoke credential/binding |
| GET, POST /admin/sms-templates | List / create draft |
| POST /admin/sms-templates/{id}/versions | New draft version |
| POST /admin/sms-templates/{id}/test | Return extraction and fixture outcomes |
| POST /admin/sms-templates/{id}/publish | Publish tested version |
| POST /admin/sms-templates/{id}/status | Pause/retire/rollback active version |
| GET /admin/sms-events; GET /admin/receipts | Masked evidence and normalized receipts |
| POST /admin/sms-events/{id}/reparse | Append parse attempt; audit reason |
| GET /admin/payments; GET /admin/review-cases | Payment operations |
| POST /admin/review-cases/{id}/actions | Assign/note/retry/reject/resolve |
| GET, POST /admin/merchants | Merchant operations |
| GET /admin/users; GET /admin/ledger | Recharge users / accounting |
| GET /admin/settlements | Settlement queue |
| POST /admin/settlements/{id}/approve | Different approved checker |
| POST /admin/settlements/{id}/execute | Record controlled external execution |
| GET /admin/webhook-deliveries | Delivery diagnostics |
| POST /admin/webhook-deliveries/{id}/retry | Redeliver same stable event |
| GET /admin/audit-events | Restricted audit access |

All edits accept expected `version` or If-Match. Payout execution/finance adjustments require idempotency key, reason and supporting evidence. Full evidence reveal is a separately authorized/audited endpoint.

## Device endpoints

| Method / route | Purpose |
| --- | --- |
| POST /agent/enroll | Exchange pairing code + challenge proof + public key |
| POST /agent/binding-proposals | Propose approved account/subscription assignment |
| GET /agent/config | Versioned sender allowlist, approved bindings and policy |
| POST /agent/heartbeats | Queue, permissions, binding and application health |
| POST /agent/sms-events/batch | Durable per-item SMS acknowledgment |
| GET /agent/sms-events/{client_event_id} | Restricted own-event status |
| POST /agent/credentials/rotate | Controlled credential lifecycle |

Sample upload (synthetic data only):

```json
{
  "events": [{
    "client_event_id": "opaque-event-id",
    "binding_id": "binding-id",
    "binding_version": 2,
    "sms_sender": "configured-origin",
    "message": "synthetic payment SMS matching an admin template",
    "captured_at": "2026-10-04T10:00:00Z",
    "config_version": 4,
    "body_sha256": "hex-encoded-hash"
  }]
}
```

Maximum 50 events and 256 KiB per batch; 4 KiB per body initially. Hash is checked server-side, not trusted as authenticity. Respond per item with server event ID and accepted/duplicate/review/rejected plus safe reason. Partially successful batches must not cause acknowledged items to be resent with new IDs. Parsing may happen asynchronously; durable acceptance is separate from verification.

## Merchant / customer endpoints

| Method / route | Purpose |
| --- | --- |
| GET /merchant/payment-methods | Eligible providers; no device secrets |
| POST /merchant/payments | Create idempotent merchant collection intent |
| GET /merchant/payments/{id} | Tenant-scoped status |
| GET /merchant/payments | Tenant-scoped history |
| POST /checkout/{token}/claims | Customer sender/transaction submission |
| GET /checkout/{token} | Scoped instructions and safe status |
| POST /users/me/recharges | Authenticated user recharge intent |
| GET /users/me/balance | Ledger-derived user balance |
| GET /merchant/balance | Available/reserved/net merchant balance |
| POST /merchant/settlements | Request eligible settlement |
| GET /merchant/settlements | Own settlement history |
| POST /merchant/api-keys | Authorized dashboard key issuance |
| PUT /merchant/webhook-endpoint | Validate endpoint/configure delivery |

Create request requires Idempotency-Key and body:

```json
{"order_id":"ORDER-001","amount":"500.00","currency":"BDT","provider":"bkash"}
```

Response includes payment ID, status, amount, provider, allocated receiving account instructions, hosted checkout URL and expiry. The merchant cannot submit `receiving_number` or choose a custom account. Same key/body returns original response; same key with differing body returns 409. Order ID is also unique per merchant.

## Webhooks

Events: payment.verified, payment.review_required, payment.expired, settlement.paid, settlement.failed. Payload contains stable event ID, event type, timestamp, merchant order/payment ID, amount/currency, status and ledger linkage; omit raw SMS and unnecessary sender data.

HMAC-SHA256 sign exact transmitted payload with endpoint secret using `timestamp + '.' + raw_body`. Headers carry event ID, timestamp, signature version and signature. Merchants check signature/time window and deduplicate event IDs. Redelivery gets fresh delivery timestamp/signature but identical event ID/payload.

Success is any 2xx. Retry transient failures on bounded exponential schedule through 72 hours, then dead-letter and alert. Validate public HTTPS destinations and recheck DNS/IP on every request to block internal/network metadata targets and unsafe redirects. See [security](09-security.md).
