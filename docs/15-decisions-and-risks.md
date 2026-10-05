# Decisions, defaults and external dependencies

## Confirmed decisions

| ID | Decision |
| --- | --- |
| D01 | bKash, Nagad, Rocket are initial providers |
| D02 | Personal, merchant and agent receiving account types are modeled |
| D03 | Only central admin-managed receiving numbers; merchant-owned numbers excluded |
| D04 | Automatic Android capture; no official provider API assumed |
| D05 | Customer match fields: sender number, transaction ID, exact amount |
| D06 | No payment reference system |
| D07 | Configurable admin SMS samples/templates; no hardcoded message formats |
| D08 | Funds collected centrally and merchants paid later |
| D09 | Automatic approval for unambiguous eligible matches |
| D10 | Admin panel and Android agent specifications precede further implementation |

## Defaults chosen for a buildable specification

BDT only; 30-minute expiry; 7-day review window; zero fees until configured; request-based manually executed settlements; maker/checker approval; recharge cash withdrawal disabled; signed managed APK first; backend parsing; PostgreSQL production; TypeScript web/backend and Kotlin Android. These are proposed implementation defaults, not additional user-confirmed requirements.

## Decisions requiring validation before enabling features

| Dependency | Why it matters | Progress possible now |
| --- | --- | --- |
| Real payment SMS fields per provider/type/operation | Full sender/transaction/amount might not all be present | Build configurable editor/parser/review queue; enable only tested combinations |
| Provider account identifier format | Receiving account identifiers may differ from customer mobile numbers | Keep account identifier policy separate; validate formats through controlled samples |
| Actual approved incoming payment operation | Personal transfer, merchant payment and agent operations are different | Version instructions/operation classification; avoid universal instructions |
| Android permission/distribution eligibility | Automatic SMS reading requires appropriate platform permissions | Build pairing/queue/UI and validate managed signed APK on real devices |
| SIM metadata available on supported phones | Wrong receiving account could cause false attribution | Test device matrix; single-SIM fallback or quarantine unknown bindings |
| Provider permissions and applicable fund-holding requirements | Central third-party collection/settlement model needs approval review | Complete software in sandbox; keep real-money rollout gated |
| Expected volume and device count | Sizing, operational thresholds and concurrency targets | Use documented test workload, measure and adjust |
| Merchant destination/fees and payout procedures | Determines accounting/disclosure and approval workflow | Use zero fees and controlled manual settlement defaults |
| User balance spending purpose | Credits need a defined consumption model | Build recharge ledger; keep spending/withdrawal unavailable until defined |

## Residual risks

1. SMS evidence can be spoofed or fabricated by a compromised device; no app-only control creates provider authentication.
2. Android background restrictions/force-stop can interrupt capture; queues recover captured events, not unseen messages.
3. Missing/obscured sender fields prevent exact automatic verification.
4. Payouts occur outside the system initially; outcome evidence and reconciliation are essential.
5. Similar SMS formats can describe nonpayment operations; operation-specific negatives and versioned publication are mandatory.

## Primary references

- [Google Play SMS/Call Log permission policy](https://support.google.com/googleplay/android-developer/answer/10208820): public store use of SMS permissions is restricted; eligibility must be reviewed.
- [Android permission API](https://developer.android.com/reference/android/Manifest.permission): distinguish live RECEIVE_SMS capture from READ_SMS inbox access.
- [bKash merchant facilities](https://www.bkash.com/index.php/en/business/merchant): official merchant collection facilities exist; software support does not imply account approval.
- [Bangladesh Bank PSO/PSP approval procedure](https://www.bb.org.bd/aboutus/regulationguideline/psd/pso_psp_03022019.pdf): starting reference for professional regulatory review, not a conclusion about kPay's exact licensing obligations.

Recheck current platform/provider requirements during implementation and before launch. No legal classification is inferred solely from these documents.
