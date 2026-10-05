# Configurable SMS samples and extraction

## Template record

Provider; receiving account type; incoming operation classification; approved originating SMS addresses; name; immutable version; status; literal pattern; extraction policies; positive/negative samples; created/published actor/time.

Supported operation classifications are explicit, for example incoming customer transfer or merchant payment. Cash-out, outgoing transfers, refunds, balance-only notices, OTPs and failed transactions must not be credited just because they contain an amount and transaction ID. Account type is not sufficient to determine whether money was received.

## Admin creation flow

1. Choose provider, account type, allowed incoming operation and SMS originating address.
2. Paste anonymized samples from controlled tests; preserve punctuation and message structure.
3. Select sender number, provider transaction ID and received amount; editor replaces selected text with `{{sender}}`, `{{transaction}}`, `{{amount}}`.
4. Optional `{{received_at}}` supports trusted parsing of a message's timestamp format; absence triggers the configured late-payment review rules.
5. Preview captures, normalization and rejection reasons.
6. Add at least two differing positive fixtures and negative fixtures for outgoing/failed/OTP messages where applicable.
7. Test against fixtures and existing templates for collisions.
8. Publish after permission/approval checks. Agents receive sender capture filters; backend uses published template versions.

Reference fields are not extracted or used for matching. Literal message text may contain unrelated labels, but customer references never determine approval.

## Extraction rules

- Require sender, transaction and amount exactly once. Missing/masked sender means no automatic approval.
- Compile a restricted literal-template DSL; escape all non-marker text.
- Full-message match; defined whitespace normalization may trim outer whitespace and normalize line endings. Internal whitespace/case transformations are versioned, never implicit wildcard matching.
- Transaction format and case sensitivity are provider-configured; preserve original and normalized value. Never assume all providers are case-insensitive without tested evidence.
- Normalize Bangla digits to ASCII only through explicit approved policy, preserve original evidence.
- Amount parsing accepts approved grouping/decimal formats, uses integer poisha and rejects negative/zero, excess decimals and ambiguous separators.
- Sender normalization supports approved Bangladesh prefixes; reject masked or incomplete numbers. Receiving account identifier normalization is separate from customer sender normalization.
- Bound message length, template length, field widths and parser work. No uploaded scripts or user-defined unrestricted regular expressions.
- Originating-address allowlist is explicit. It does not prove authenticity.

## Versioning and ambiguity

Draft -> tested -> published -> paused -> retired. Publication creates immutable version. Editing creates draft version. Rollback changes the active pointer while preserving all versions and previous decisions.

Use provider, account type, permitted operation and originating address to select candidate templates. If several match, accept only when all extracted financial fields and operation classifications agree; otherwise create ambiguous-template review case. Do not select the first match arbitrarily.

Default applies the currently published eligible version at ingestion and records it. Reprocessing historical unmatched events is explicit, audited and append-only. Credited events are never automatically reinterpreted after a template update.

## Failure outcomes

| Failure | Result |
| --- | --- |
| Unknown allowed payment format | Stored unparsed evidence; review case |
| Unrelated/non-allowlisted SMS | Discard locally; do not transmit |
| Masked sender / incomplete fields | Store restricted evidence; no auto-credit |
| Outgoing, failed, OTP, balance notice | Nonpayment classification; no credit |
| Conflicting templates | Quarantine; alert template owner |
| Valid new receipt | Insert normalized receipt; schedule matching |
| Same transaction, inconsistent details | Conflict case; block auto-credit |

Raw samples may contain private payment data. Restrict access, support redaction for shared fixtures, prohibit real samples in source control and apply evidence retention.
