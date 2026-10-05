# Registration and Vercel deployment

## Admin panel review

Staff roles, MFA, tenant isolation and financial approvals already existed. Missing pieces were public merchant registration, merchant email/password login and staff review of registrations. Deployment problems included automatic port binding, schema upgrades on every cold start, process-local rate limits and timer-based webhook delivery. Dashboard balances performed repeated queries for every merchant.

Merchant registrations now start **pending**, with no enabled providers. In **Merchants → Manage**, staff review the business, choose approved providers and change status to **active**. Verified Neon users can then sign in through the shared email/password form. Public registration cannot assign administrator roles, enable providers or choose receiving accounts. Staff activation remains invitation-only. Merchant snapshots and detail responses exclude password hashes and identity bindings.

## Unified sign-in

Only Admin and Merchant roles exist. Login does not accept an account type or API key. Roles come from application records, not browser fields or Neon metadata. Legacy staff roles migrate to Admin; financial approvals still require different administrators. Enabled authenticators protect sensitive actions after login.

## Administrator credentials

`npm run admin:setup` creates `NEON_OWNER_EMAIL` with a generated password and saves it in ignored `data/admin-credentials.json`. Existing account passwords remain unchanged. Complete email verification, then sign in with email/password. Save the password in your password manager. Enable MFA through Account security.

## Vercel setup

1. Import the repository using framework **Other**, Node.js **24.x**, build command `npm run build` and output directory `public`.
2. Configure `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_OWNER_EMAIL`, `AUTH_ENCRYPTION_KEY`, `APP_ORIGIN` and `CRON_SECRET` in Vercel. Use the existing encryption key if sharing the local database. Never set `KPAY_MIGRATE` in runtime environment variables.
3. Set `APP_ORIGIN` to the exact HTTPS domain and add it to Neon Auth trusted domains. Preview deployments should use an isolated Neon branch and its own Auth URL.
4. Run `npm run db:migrate` against the target database before deployment. Runtime functions skip migrations and seeding.
5. Deploy and verify registration, email verification, approval, login and signed Android receipt submission.

The function entry point exports the shared handler without starting a port or timer. Static assets use Vercel hosting. Configuration includes worker/PostgreSQL dependencies and excludes local credentials, SQLite data, test engines and Android artifacts. Build checks trace dependencies and reject private files.

Rate limits persist in PostgreSQL. Database leases coordinate webhook deliveries across instances. Payment/receipt requests schedule delivery through `waitUntil`; `/api/cron/webhooks` handles retries and requires `CRON_SECRET`. The checked-in cron runs daily for Hobby compatibility. Use a supported higher-frequency schedule or external scheduler when timely quiet-period retries are needed.

Dashboard balances now use one aggregate query. The synchronous PostgreSQL worker bridge and client-side history pagination remain scaling limits; this change does not claim a full asynchronous rewrite or production load testing.

## Verification

`npm test` validates registration, approval, isolation, hash redaction, suspension, Neon identity checks and existing finance/device behavior. `npm run test:postgres` repeats registration and payment/device flows on isolated PostgreSQL. `npm run build` validates assets and function tracing. A deployed smoke test remains necessary after configuring the Vercel domain and environment.
