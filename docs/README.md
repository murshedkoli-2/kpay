# kPay implementation specification

Version: 1.0 · Prepared: 4 October 2026 · Status: ready for implementation planning.

This folder specifies the complete intended admin panel and Android collection agent, plus the backend contracts they require. These documents describe target behavior; they do not imply that the existing prototype implements it.

## Reading order

| Document | Purpose |
| --- | --- |
| [Product scope](01-product-scope.md) | Confirmed requirements, defaults, exclusions and launch decisions |
| [Architecture](02-architecture.md) | Components, boundaries and end-to-end flows |
| [Admin panel](03-admin-panel.md) | Screens, actions, validation and access rules |
| [Android agent](04-agent-app.md) | Screens, SMS capture, pairing, SIM binding and offline behavior |
| [SMS templates](05-sms-templates.md) | Configurable sample collection and safe extraction |
| [Verification](06-payment-verification.md) | Matching rules, state transitions and concurrency |
| [Data model](07-data-model.md) | Entities, relationships, constraints and money storage |
| [API contracts](08-api-contracts.md) | Admin, device and merchant endpoints and payloads |
| [Security](09-security.md) | Threats, permissions, credentials and audit requirements |
| [Ledger and settlements](10-ledger-and-settlements.md) | Accounting, recharge, fees and controlled payouts |
| [UI specification](11-ui-specification.md) | Layout, navigation, reusable components and interaction states |
| [Testing](12-testing-and-acceptance.md) | Integration, Android device and financial acceptance checks |
| [Build roadmap](13-build-roadmap.md) | Dependency order, tasks and completion gates |
| [Operations](14-operations-and-deployment.md) | Environments, deployment, monitoring and recovery |
| [Decisions and risks](15-decisions-and-risks.md) | Defaults, unresolved external dependencies and decision register |
| [Admin implementation guide](16-admin-implementation.md) | Runnable admin release, actual endpoints, verification and remaining launch work |

## Specification rules

- Receiving numbers are centrally owned/managed. Only authorized admins configure them.
- Providers: bKash, Nagad, Rocket. Receiving account types: personal, merchant, agent.
- Customer payment references are removed. Internal IDs and idempotency keys remain for database/API reliability; customers never use them as a payment reference.
- Automatic verification uses sender number, provider transaction ID and amount, scoped to the central receiving account and provider.
- Android uploads evidence; the server parses, verifies and writes ledger entries.
- SMS templates are administrator-configured and versioned. Never hardcode provider message formats.
- An ambiguous, incomplete or conflicting receipt cannot produce an automatic credit.
- Ledger entries, evidence and audit history are never silently edited or deleted.

## Prototype status

The Node.js/SQLite local release includes the admin modules, template versioning/fixtures, device pairing, multi-merchant isolation, recharge credits, balanced ledger/settlement records, signed webhook delivery, team roles and optional authenticator MFA. The native Android agent includes encrypted SMS capture/queue, signed requests, physical subscription approval and retry jobs. See the [admin implementation guide](16-admin-implementation.md) and [Android implementation guide](17-agent-implementation.md) for actual coverage. Production hardening and real-phone acceptance remain; target production contracts are not all implemented.
