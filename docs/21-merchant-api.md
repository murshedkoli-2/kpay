# Merchant website integration

The public guide is served at `/integration.html`, with a runnable website example at `/merchant-example.txt`. Merchants manage keys, webhook endpoints, delivery retries and checkout links in the dashboard's **API integration** page.

## Merchant API

All requests use `Authorization: Bearer MERCHANT_API_KEY` from the merchant's server. Browser-to-browser cross-origin API calls are intentionally rejected; secrets stay on the merchant server. Active merchants are restricted to their own payments and approved provider list.

- `POST /api/v1/payments`: `{order_id, amount: "100.00", provider, currency: "BDT"}` returns a payment and hosted `checkout_url`.
- `GET /api/v1/payments/:id`: payment status, decimal BDT amount, order, provider, expiry and checkout link.
- `GET /api/v1/payments?order_id=...`: recover an existing request after a connection interruption.
- `POST /api/v1/payments/:id/claim`: optional server-submitted sender and transaction ID for custom checkout flows.

Creation uses order IDs for idempotency. Changing an existing order's amount or provider fails with 409. Merchant and central-account row locks serialize creation checks on PostgreSQL across Vercel function instances, keeping retries and daily allocation checks within the transaction.

## Hosted checkout

Checkout capabilities are HMAC-bound to the payment ID using a domain-separated server key. The token is carried in the URL fragment, keeping it out of HTTP URL logs and referrers. The checkout API reveals only the order's collection instructions and status; customer browser requests do not need merchant credentials. Mutating claims require a valid capability, an active merchant/account and an unexpired request. Invalid capabilities and different merchants cannot access another payment.

Customer claims do not credit funds. A provider receipt must match account, sender, transaction ID and exact amount. Existing matching, conflict review, ledger and stable webhook-event logic remain the source of confirmation. Status is polled every 10 seconds while checkout is visible. Merchants should fulfill only verified orders after comparing saved amount, currency, order ID and payment ID on their server.

## Merchant self-service

`GET /api/merchant/integration` returns safe key prefixes/status, endpoint URL, and recent delivery summaries. Dashboard sessions can issue or revoke their own keys, configure/rotate a webhook secret, and retry their own undelivered events. API keys cannot mint or rotate credentials. Key hashes and webhook secrets are never included in snapshots; new credentials are shown once.

Webhook signing is HMAC-SHA256 over `timestamp.rawBody`, delivered as `X-KPay-Signature: v1=...`. The downloadable example verifies signature, timestamp and stable event ID, confirms payment through the API, compares its saved order, and persists duplicate-safe payment acceptance in SQLite. Outgoing webhooks retain public HTTPS/DNS restrictions and delivery leases.

Vercel triggers bounded delivery on receipt verification, claims, merchant payment API activity and webhook configuration/retry. The existing daily cron catches remaining work; it does not guarantee minute-level retries when the site has no activity. Merchant status polling can recover confirmation independently of email/webhook delivery. Increase the cron frequency if the hosting plan supports it and operational requirements need quicker unattended retries.

## Verification

The isolated merchant API test covers creation/retry conflicts, decimal amounts/currency, order lookup, capability tampering, expiry, merchant isolation, key revocation, credential management restrictions, secret-free metadata, receipt-backed confirmation, and exactly one ledger credit/event for duplicate evidence. Browser QA confirmed a synthetic customer claim remains pending and changes to confirmed only after synthetic receipt ingestion, and checked merchant integration navigation/controls. No real money was transferred during verification.
