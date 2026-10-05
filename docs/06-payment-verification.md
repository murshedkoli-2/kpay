# Payment verification specification

## Authoritative match

A payment intent fixes beneficiary, expected amount, currency, provider, receiving account and allocation time. Customer claims provide full sender number and transaction ID. Amount is the intent's expected amount; a customer-entered alternate amount cannot overwrite it.

Automatic approval requires all of:

- Full normalized sender equals the parsed receipt sender.
- Canonical provider transaction ID equals receipt transaction ID.
- Exact integer amount equals expected amount.
- Provider and central receiving account equal the intent allocation.
- Receipt represents an approved incoming operation from a valid device/account/SIM binding.
- Receipt is unconsumed, nonconflicting, and outside any quarantine.
- Intent remains eligible under expiry/time policy.
- Exactly one eligible intent claims this evidence.

No reference number, screenshot or browser redirect can approve a payment.

## States

| Entity | States |
| --- | --- |
| Intent | created, awaiting_payment, claim_submitted, review_required, verified, expired, cancelled |
| Claim | submitted, waiting_receipt, matched, rejected, superseded, conflict |
| Raw SMS event | accepted, parsing, parsed, unparsed, nonpayment, ambiguous, quarantined |
| Receipt | unmatched, matched, conflict, quarantined |

Verified is final for that intent. A refund/reversal is a new finance transaction linked to it, not a rewrite of the verified history. Failed webhook delivery is independent from payment status.

## Time and expiry

Default intent expiry is 30 minutes. Auto-match an eligible claim submitted before expiry when receipt evidence falls within the allocation/payment window. A valid provider timestamp parsed by an approved format can support delayed upload matching. Server receipt time and device capture time are also preserved, but device clocks are not trusted.

After expiry, late receipts/claims go to review by default; no silent late auto-credit. Missing trustworthy provider timestamp, substantial device clock skew or historical backfill crossing a payment window goes to review. Review window defaults to 7 days, after which operator resolution is required. These defaults can be adjusted through versioned policy and must not silently alter historical decisions.

## Duplicate and ambiguity rules

- Transport duplicate: unique `(device_id, client_event_id)`; return existing result.
- Financial duplicate: canonical `(provider, transaction_id)` unique conservatively across accounts. Any legitimate provider reuse discovered in controlled tests requires an explicit reviewed identity-policy change.
- Same transaction with differing amount/sender/account: quarantine new evidence and flag associated receipt/intent for investigation. No second credit.
- Multiple pending claims for the same scoped transaction: conflict/review, never arbitrary first-come allocation.
- Claim made after a receipt was consumed: reject reuse with generic customer error; do not disclose the original beneficiary.
- Two receipts with same sender/amount but different transaction IDs remain distinct. Sender+amount alone never match.

## Atomic approval transaction

1. Acquire database locks on receipt and candidate intent; reevaluate eligibility and competing claims under locking/unique reservation policy.
2. Reserve receipt consumption with a unique constraint.
3. Write immutable verification decision with rules/version/evidence pointers.
4. Write balanced ledger transaction with unique source/payment key.
5. Mark intent verified and receipt consumed.
6. Insert signed-webhook outbox record and audit event.
7. Commit all or none. Jobs may rerun; uniqueness makes side effects idempotent.

Serialize claim insertion and matching on a canonical transaction reservation so simultaneous claims cannot evade ambiguity checks. Once a payment is settled, later attempts cannot reverse ownership automatically.

## Review behavior

Operators can reparse or rerun matching after configuration/binding fixes. Independent provider/account statement evidence can support an exceptional manual finance credit with separate maker/checker approval and audit. A plain manual status switch is prohibited.

## Honest verification boundary

The system verifies consistency with registered device evidence. SMS-only operation cannot prove provider authenticity against a compromised phone or fabricated message. Quarantine suspicious devices, reconcile against account statements and consider provider-supported verification when available.
