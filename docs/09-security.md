# Security and access design

## Threats and controls

| Threat | Required controls / residual limits |
| --- | --- |
| Customer reuses transaction | Financial identity and receipt-consumption uniqueness; no sender+amount-only matching |
| Compromised phone fabricates SMS | Registered signing key, binding, quarantine, limits and statement reconciliation; signatures do not prove provider authenticity |
| SMS spoofing | Allowed origin/operation templates, full matching and reconciliation; originating address alone is insufficient |
| Tenant data leak | Tenant-scoped queries, key scopes and automated isolation tests |
| Administrator abuse | Roles, MFA, step-up, audit and dual approval for money/destination changes |
| Queue replay | Stable event IDs, signed body/nonce, anti-replay window and financial deduplication |
| Template abuse | Restricted DSL, bounded parsing, fixture tests, immutable versions and reviewed publication |
| Webhook SSRF | Public HTTPS allowlist policy, DNS/IP validation per request, safe redirects/timeouts |
| Lost phone | Keystore keys, encrypted local queue, revocation and recovery; prohibit unmanaged credential copying |
| Duplicate payout after timeout | Execution idempotency, reservation, external evidence lookup; uncertain outcome stays reserved for review |

## Admin identity

No shared production login keys. Individual accounts, strong password hashing, MFA, short-lived secure sessions, CSRF protection and session revocation. Default session idle limit 30 minutes; step-up for evidence reveal, credential issuance, account rebinding, permission changes, adjustment and payout approval.

Support cannot credit, rebind devices or execute settlements. Maker/checker roles cannot approve their own finance request. Runtime service credentials have least privilege. Restrict database and evidence storage to private networks.

## Merchant and device credentials

Merchant API keys have hashed secrets, scopes, expiration, last-used metadata and revocation. Show once; never log plaintext. Webhook signing secrets require encrypted storage because the server must sign payloads.

Device enrollment uses generated asymmetric keys with server proof verification and limited enrollment tokens. Every receipt links to approved binding version. Revocation blocks new authenticated ingestion; previously accepted evidence remains immutable, and suspicious unmatched evidence is quarantined pending review.

Do not read or store wallet PINs, login passwords, OTP SMS, contacts or unrelated message history. No access to provider accounts through accessibility automation or USSD is included.

## Privacy and retention defaults

- Raw SMS: encrypted at rest, restricted reveal, proposed 90-day retention unless legal/reconciliation hold applies.
- Local acknowledged raw SMS: proposed 7 days; unacknowledged queue retained until resolved, bounded by operational alerts.
- Normalized financial/audit records: retention period set by applicable requirements before production; never assume deleting raw SMS authorizes deleting ledger history.
- Logs: mask numbers, redact tokens/bodies and limit retention. Sensitive samples remain outside Git.
- Exports: permission check, masked default, record who exported what and when.

Retention values are planning defaults requiring prelaunch review, not asserted legal requirements.

## Request defenses

Validate schemas and payload limits; rate-limit login, pairing, claims and ingestion. Use secure headers, safe HTML escaping, HTTPS, no credentials in URLs, encrypted backups and authenticated health endpoints. Avoid detailed transaction lookup responses before user/tenant authorization.

Use request IDs for correlation, not sensitive data. Alert unusual device volume, parser failures, account reassignment, broad evidence exports and ledger inconsistencies.

## Launch prerequisites

Complete threat-model review, independent auth/tenant tests, managed-device permission/distribution validation, provider account eligibility review and applicable fund-holding/settlement review. The SMS gateway must not be marketed as provider-authenticated merely because its local match succeeded.
