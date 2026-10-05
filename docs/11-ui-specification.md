# UI and interaction specification

## Admin web

Desktop sidebar with grouped navigation: Overview; Collection (Payments, Incoming SMS, Review); Configuration (Accounts, Devices, Templates); Business (Merchants, Users); Finance (Ledger, Settlements); System (Webhooks, Audits, Settings).

Header shows page title, environment label and signed-in role. Global date controls display Asia/Dhaka; stored timestamps remain UTC. Narrow screens use accessible collapsible navigation and retain sign-out access.

Visual direction: restrained dark-green navigation, neutral content background, clear typography, white panels and strong financial/status hierarchy. Status colors supplement text and icons; never use color alone to communicate approval.

## Shared web components

- Paginated data table with explicit filters, sortable supported columns and sticky selection only when needed.
- Money value with BDT label, gross/fee/net separation and masked sensitive identifier.
- Detail timeline linking evidence, claim, verification, ledger and webhook delivery.
- Form field with label, help, inline error and server conflict state.
- Confirmation dialog for revoke/retire/publish/finance actions with reason and consequences.
- Version-conflict message offering reload and comparison, not silent overwrite.
- Template editor with field-selection actions, extraction preview, fixtures and collision results.
- Device health card differentiating reachability, capture permission, SIM binding and sync backlog.
- Empty, loading, permission-denied, partial-service and error states.

No production secret appears in a general table. A one-time secret view provides copy action and explains it cannot be retrieved later.

## Android UI

Bottom navigation: Home, Receipts, Queue, Settings. Receiving account and health detail accessible from Home/Settings. Large touch targets, clear sync/permission banners, concise Bangla/English-ready strings. Do not expose backend implementation terminology to operators unless needed for troubleshooting.

Queue distinguishes captured, acknowledged and verified. Home shows the approved receiving account and last successful sync. Errors offer an appropriate action: retry network, request administrator, grant required permission, revalidate binding, or update approved app.

## Checkout UI boundary

Provider selection, central receiving number, permitted payment operation, exact amount, account-specific instructions and expiry. Fields: sender number and transaction ID only. Instructions may include copyable receiving number and amount; no reference input. Status waiting/verified/review/expired is server-owned.

Do not tell customers to use the same payment operation for all account types. Published instructions must match the actual supported incoming operation.

## Accessibility and responsiveness

Keyboard accessible web navigation/forms; visible focus; semantic labels; screen-reader status announcements; text equivalents for icons; meaningful error association. Tables scroll within container on small screens. Android supports font scaling and maintains readable amounts and action labels. Use minimum 44px web / 48dp Android touch targets where practical.

## Design acceptance

Verify dashboard, template editor, account/device detail, review case, payment detail and settlement flow in desktop and narrow layouts. Test empty/error and denied-permission states, not only populated success screens. Seed synthetic fixtures in development; never make demo data look like real collected money.
