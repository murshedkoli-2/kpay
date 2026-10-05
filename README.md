# kPay admin panel

A working admin workspace for centrally managed bKash, Nagad and Rocket collection. Requires Node.js 24+.

```powershell
npm install
npm run dev
npm test
```

Open [the dashboard](http://127.0.0.1:3000). With no Neon configuration, accounts sign in with email/password and the demo merchant API key is available only for API integration and data persists in `data/kpay.sqlite`. With `DATABASE_URL` configured, the application uses PostgreSQL instead. The server binds to localhost by default.

## Neon database and authentication

Merchant businesses can use **Register merchant**. Staff review registrations in **Merchants → Manage**, approve providers and activate the account before merchant login. See [registration, administrator credentials and Vercel setup](docs/18-registration-and-vercel.md).

Copy `.env.example` to `.env`, then configure `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_OWNER_EMAIL`, `AUTH_ENCRYPTION_KEY` and `APP_ORIGIN`. The start commands load `.env` automatically. Keep this file private; it is ignored by Git. Keep the same encryption key across restarts and replicas, since it encrypts stored upstream session cookies.

Enable Neon Auth email/password authentication and email verification. Add the exact `APP_ORIGIN` (locally, `http://127.0.0.1:3000`) to trusted domains in Neon Auth settings. Use the database and Auth URL for the same Neon branch. PostgreSQL connections verify TLS certificates, and application tables initialize at startup without touching `neon_auth` tables.

On the sign-in page, choose **Activate invited admin**, then enter the configured owner email and a password of at least 12 characters. Alternatively run `npm run admin:setup` to generate owner credentials. Complete email verification and sign in. Existing verified Neon users can sign in directly. The first verified owner login links that Neon identity to the workspace owner. Admins invite other administrators by email; those users then create their invited Neon accounts. Registration is restricted to approved team emails and the configured owner email. Workspace roles are controlled by the application, not user-supplied Neon profile metadata.

Admin sessions use HttpOnly, SameSite=Strict cookies; HTTPS origins also set Secure. Each authenticated request checks the upstream Neon session, the linked identity and the active administrator status. Logout removes the local session and requests upstream revocation. There are exactly two account roles: Admin and Merchant. The server assigns the role from the saved account after email/password authentication. API keys cannot sign in. Enabled MFA protects sensitive admin actions through Account security after login; independent finance approvals remain enforced.

For deployment, set `APP_ORIGIN` to your HTTPS origin, `NODE_ENV=production` and `HOST` to your deployment's bind address. Add that origin to Neon Auth trusted domains. The current synchronous business logic runs PostgreSQL queries through a worker with one connection and serialized transactions; it is suitable for this admin workspace, and high throughput will require an asynchronous storage refactor. A transaction advisory lock coordinates cooperating application instances. Run one instance during schema initialization or upgrades.

To import an existing SQLite workspace into a newly initialized Neon database, stop the app and run `node --env-file=.env migrate-sqlite.mjs data/kpay.sqlite`. This imports records in a transaction, excludes sessions and refuses a populated target. Existing local data is not automatically copied or deleted when changing storage. The source SQLite file remains unchanged.

`npm run test:postgres` runs payment, settlement and signed-device workflows against an isolated PostgreSQL engine (PGlite), including rollback and uniqueness checks. `npm test` also verifies Neon Auth using a mock upstream: invitations, email verification, immutable identity binding, suspended users, revoked sessions, encrypted cookies and MFA replay prevention. Tests do not use the live Neon project.

## Implemented admin modules

- Dashboard with real collection metrics, provider breakdown, history and health summaries.
- Central receiving account creation, configuration edits, activation, pause, quarantine and retirement.
- Device pairing, one-use enrollment, approval, status management, credential rotation and configuration refresh.
- Configurable SMS template drafts, extraction preview, positive/negative fixtures, publication, pause and version cloning/rollback.
- Incoming SMS evidence, restricted raw reveal, parse history, normalized receipts and review cases.
- Payment requests, customer claims, exact matching and immutable verification history.
- Merchants, approved provider selection, API key issue/revoke and tenant isolation.
- Recharge users and ledger-backed recharge credits.
- Balanced double-entry postings, CSV export, statement-total reconciliation and approved adjustments.
- Merchant settlement reservation, independent approval, external payout evidence and uncertain outcomes.
- Independently approved settlement destination changes.
- Signed webhook outbox, bounded retries and delivery history, with public HTTPS destination restrictions.
- Audit history, team administrators, role permissions, expiring sessions and optional TOTP MFA.
- Version-checked settings, searchable/filterable/paginated tables, detail dialogs and responsive navigation.

## First setup

1. Sign in with your email and password. The same form serves admins and merchants.
2. Add a central receiving account. It starts paused.
3. Create an SMS template using an actual anonymized sample and `{{sender}}`, `{{transaction}}`, `{{amount}}` markers. Test extraction.
4. Add a second distinct positive fixture and a negative fixture. Publish the template with a reason.
5. Pair a device to that account. Use the one-use code within ten minutes.
6. For local testing, use **Agent devices → Enroll with pairing code**. Save the shown test credential once, then approve the device through **Manage**.
7. Activate the receiving account through **Status**. The server checks template and device eligibility.
8. Create a test payment, open its detail and submit sender/transaction details. Upload a matching synthetic SMS from the development simulator. Check verified status and balanced ledger posting.

Never place real payment samples or keys in source control. The simulator does not read a phone's SMS. Do not use real funds in this local release.

## Team and finance

Admins create individual administrator invitations. Merchant registration creates only pending merchant accounts. All accounts use the same email/password login; account type and permissions are determined by the server. **Account security** beside the sidebar user menu enables an authenticator and renews the five-minute confirmation window for sensitive actions. Existing staff accounts migrate to the Admin role.

Merchant payout destinations and payouts require separate maker/checker identities. Reserve a payout from an available balance, have another admin account approve, then record external execution evidence. This application does not send money. Unknown external outcomes remain reserved. A finance adjustment also needs another approver.

## API and device integration

Current runnable endpoints use `/api`, documented in [the implementation guide](docs/16-admin-implementation.md). Target `/v1` contracts in the planning documents are a future public API migration.

Merchant credentials only authorize their own data and provider selection; merchants cannot select arbitrary receiving numbers. The old prototype `/api/accounts` and `/api/templates` writes are replaced by `/api/admin/...` routes. Bootstrap keys cannot sign in or authorize admin API requests.

## Validation

`npm test` covers exact money/number parsing, template rejection, authenticator reference vectors and an isolated end-to-end integration suite: account activation gates, publication fixtures, one-use pairing, duplicate receipt protection, stale edits, tenant isolation, restricted evidence, recharge credits, settlement reservation/approval, balanced postings, MFA confirmation and internal webhook destination rejection.

Browser verification covered every admin screen, account creation, extraction preview, saved template, desktop rendering, mobile navigation and contained table scrolling. Browser tests use a separate `data/browser-qa.sqlite` database.

## Production boundaries

Neon PostgreSQL and Neon Auth are available through the configuration above; the unconfigured development fallback uses SQLite and local credentials. Enable MFA for all privileged administrators, encrypt backend raw evidence/webhook/MFA secrets, add Android hardware attestation and complete real SIM/provider/operational acceptance testing before real collection. The Android app already encrypts local evidence and signs requests with a Keystore key.

Retention/review-window settings are recorded policy values; automatic retention purge and timed archival are not enabled. List filtering/pagination is currently client-side over the local workspace state. Statement reconciliation compares entered totals, not imported provider statements. Webhooks support public IPv4 HTTPS destinations on port 443 and reject redirects/private addresses; verify live merchant delivery in a controlled deployment before rollout. Separate business approval from provider-side authenticity: SMS evidence remains vulnerable to compromised collection devices.

## Specifications

[Complete specification index](docs/README.md) · [Admin panel](docs/03-admin-panel.md) · [Android app](docs/04-agent-app.md) · [Build roadmap](docs/13-build-roadmap.md) · [Implemented release](docs/16-admin-implementation.md)

## Android agent

[Signed development APK](artifacts/kpay-agent-debug.apk) · [Installation and build guide](agent-android/README.md) · [Agent implementation and API](docs/17-agent-implementation.md)

The app includes pairing, physical SIM approval, encrypted receipt storage, automatic SMS capture and offline retry. The development APK connects to the local server through `adb reverse tcp:3000 tcp:3000`. A production build requires a trusted HTTPS origin and your signing identity. Run real SIM-phone acceptance tests before receiving customer payments.
