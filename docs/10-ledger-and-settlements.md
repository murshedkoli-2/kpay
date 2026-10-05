# Ledger, recharge and settlement specification

## Accounting model

Use an immutable double-entry ledger. Entries in each transaction balance to zero per currency. Display balances from postings/projections, not editable totals. Reversals are linked compensating transactions.

Conceptual accounts: collection clearing/control, merchant available liability, merchant reserved liability, user available liability, settlement clearing, fee revenue and adjustment control. Finance must validate account classification before live accounting.

## Payment credit

On verified merchant payment of gross G with fee F: debit collection control G; credit merchant available G-F; credit fee revenue F. For a user recharge: debit collection control G and credit user available G unless an explicitly disclosed recharge fee applies.

All entries commit with verification and receipt consumption. Unique ledger source/payment operation prevents repeated posting. Snapshotted fee version cannot be changed by a later settings update.

Default fee is zero. Proposed percentage formula is rounded to nearest poisha with documented half-up rule, plus fixed fee, capped so fee cannot exceed gross. Never use binary floating point. Display gross, fee and net separately.

## Recharge

Recharge intent belongs to authenticated user before payment. Claim supplies sender and transaction only. Matching never selects a user from SMS reference or sender ownership. Sender can be someone else paying for that user's intent; unique evidence ownership and review policy still apply.

First release disables cash withdrawal from user balances. Internal spending requires a separately implemented authenticated ledger debit with available-funds checks and idempotency. An admin cannot type a new balance directly.

## Merchant settlement states

requested -> reserved -> approved -> executing -> paid.

Alternatives: rejected/cancelled before execution; failed only when nonpayment is established; uncertain_execution for ambiguous external outcome. Uncertain execution remains reserved until evidence resolves it.

1. Merchant requests payout to an approved destination with idempotency key.
2. Database transaction checks available amount and moves it to reserved liability.
3. Finance reviews account/destination evidence and fees.
4. Another authorized administrator approves the immutable amount and destination snapshot.
5. Authorized executor performs external payment outside kPay's initial automation and records transaction/evidence.
6. Confirmed paid posting debits reserved liability and credits collection/settlement control according to approved accounting mapping.
7. Proven failure/cancellation releases reservation exactly once. Never release after an unknown external outcome simply because a request timed out.

Destination or amount changes invalidate approval and restart controlled preparation. Record provider external transaction identity uniquely to prevent duplicate completion. Manual payout does not mean unlogged or unapproved payout.

## Refunds and adjustments

Initial release handles refunds through audited finance cases with dual approval and external evidence. A refund cannot delete original payment/receipt or make it reusable. Adjustment identifies beneficiary, amount, reason, evidence and original source when relevant. Prohibit self-approval and unsupported negative available balances.

## Reconciliation

Daily, compare per-central-account statement/approved evidence totals with received SMS, verified allocations and ledger control movements. Separate money received but unmatched, approved liabilities, paid settlements, fees and unexplained variance. Device heartbeat and SMS count are not a substitute for account balance reconciliation.

Attach statement evidence securely; flag missing/duplicate/conflicting transactions, manual transfers and fee differences. Freeze affected account allocation or settlements when variance exceeds approved threshold. Preserve run versions and resolution notes.

## Financial invariants

- Balanced ledger transaction in BDT.
- At most one normal credit per verified intent and financial transaction identity.
- Available liability cannot be spent/reserved twice under concurrency.
- Payout reservation changes and final postings are atomic and idempotent.
- Sum of merchant/user balances agrees with liability accounts.
- No status mutation can bypass a required ledger posting.
