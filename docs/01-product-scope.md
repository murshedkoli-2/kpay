# Product scope

## Objective

kPay lets websites accept manual mobile financial payments into centrally managed Bangladesh receiving accounts. Collection phones automatically report incoming payment SMS; the backend matches customer claims and updates merchant/user balances. kPay holds collected funds and settles merchants later.

## Actors

| Actor | Responsibilities |
| --- | --- |
| Owner / super admin | Administrators, permissions, global configuration, payout approval |
| Operations admin | Receiving accounts, devices, templates, payment exceptions |
| Finance admin | Ledger, reconciliation, settlement preparation and execution |
| Support operator | Scoped payment lookup and review notes; no credits or payout execution |
| Merchant | API integration, eligible provider selection, orders and settlement requests |
| Customer / recharge user | Pay displayed central account and submit sender number + transaction ID |
| Collection agent app | Capture allowed SMS on an enrolled Android phone and sync evidence |

The collection agent is software on company-controlled phones; this term does not mean every receiving account is a provider agent account.

## Confirmed requirements

1. Support bKash, Nagad and Rocket.
2. Support personal, merchant and agent central receiving accounts.
3. Merchants cannot add/edit receiving numbers.
4. Automatically capture incoming payment information on Android.
5. Automatically approve matching payments without routine admin intervention.
6. Match full sender number, transaction ID and amount; no reference matching.
7. Admins save sample SMS and configure extraction from the panel.
8. Provide API integration, merchant dashboard, central administration and delayed settlements.
9. Recharge credits the logged-in user's balance after the same matching process.
10. No official provider API is assumed for the initial implementation.

## Initial defaults

- Currency: BDT only; integer poisha internally.
- Checkout expiry: 30 minutes, configurable globally with a capped merchant override.
- One currency and one beneficiary per payment intent: merchant collection or user recharge.
- Merchant fee: zero until a finance admin configures an approved fee schedule.
- Settlements: merchant requests, finance prepares, another authorized admin approves; executor records external payout evidence.
- Recharge balances can be used only through explicitly implemented internal spending flows. User cash withdrawal is disabled in the first release.
- Payment allocation chooses an eligible central account; merchants may request an enabled provider but cannot choose arbitrary receiving numbers.
- First distribution is a signed APK to managed collection phones. Public store eligibility is a separate decision.
- Real money is disabled in development/staging.

## Release boundaries

Initial production scope includes central collection, Android reporting, configurable templates, verified payments, recharge credits, merchant credits, signed webhooks, manual external payouts and reconciliation. Automatic provider payouts, USSD execution, PIN/OTP capture, notification scraping, banking integration, multi-currency and customer reference fields are excluded.

Supporting a receiving account type in software does not establish provider authorization for collecting third-party payments. Provider/account eligibility and fund-holding requirements must be reviewed before a real-money pilot.

## Success criteria

- Every successful approval has stored receipt evidence and an immutable verification decision.
- One provider transaction produces at most one monetary credit.
- Receipts survive temporary network failure and reconcile after recovery.
- Merchants cannot access another merchant's payments or central device credentials.
- Administrators can configure a new supported message format without deploying code.
- Payouts cannot exceed available merchant funds or be recorded twice.
