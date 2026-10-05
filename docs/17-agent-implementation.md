# Android agent implementation

## Delivered

The native Android project is in `agent-android`, with a signed development APK under `artifacts`. See [installation, builds and acceptance testing](../agent-android/README.md).

The app provides pairing, a centrally assigned account, SMS disclosure/permissions, active physical subscription selection, Home/Receipts/Queue/Accounts/Health/Settings, encrypted local credentials and evidence, stable receipt IDs, multipart capture, sender allowlist/OTP exclusion, local unknown-SIM quarantine, network-constrained persistent background jobs, retries, heartbeat, pause controls and re-pairing without queue deletion.

Implementation uses Java, Android Views, SQLiteOpenHelper and JobScheduler rather than the proposed Kotlin/Compose/Room/WorkManager stack. The official SDK builds this dependency-free implementation offline. The functional constraints are retained; the original stack remains an optional future migration.

## Backend contract

`POST /api/agent/enroll` requires `code`, `public_key` (base64 DER SPKI, P-256), and `proof` (base64 ASN.1 DER ECDSA SHA-256 signature over `kpay-enroll\n{code}\n{public_key}`). Enrollment returns a device ID and random Bearer secret shown only to the enrolling app. One-use code expiry and admin approval still apply. The admin-authorized simulator remains available as a development helper.

Each other agent API call requires Bearer secret plus `X-Kpay-Time` (epoch milliseconds), `X-Kpay-Nonce` (UUID), and `X-Kpay-Signature` (base64 DER ECDSA). Sign UTF-8 bytes of these five newline-separated fields, with no trailing newline:

```text
HTTP_METHOD
/api/agent/path
timestamp
nonce
lowercase_sha256_of_exact_request_body
```

GET has an empty body. Signatures expire after a five-minute skew allowance; accepted nonces cannot be reused. Retries use a fresh request nonce and the same receipt event ID. Device revocation invalidates its credential.

`POST /api/agent/heartbeat`: `queue_depth`, `permission`, `subscription_id`, `binding_health`, `capture_paused`. The server reports the proposed physical subscription to Admin. Activating a native device requires confirming that subscription ID, granted SMS permission, and healthy binding. Changing the reported subscription clears approval and pauses the device/account.

`GET /api/agent/config`: central account, published SMS sender allowlist, version, device status, proposed/approved subscription and binding health. Cached encrypted configuration supports offline capture.

`POST /api/agent/receipts`: `account_id`, `client_event_id`, `sms_sender`, `message`, `subscription_id`, `sim`, plus capture metadata. Server requires the active device and approved subscription and parses centrally configured templates. Capture timestamps/body hashes/config version accompany the upload but are not independently attested or persisted as separate server fields in this release. A server response acknowledging unparsed/conflicting evidence appears as review, not successful verification.

Local pause reports through the next heartbeat and prevents account readiness for new allocation. Existing queued evidence can still upload. Jobs and SMS broadcasts are subject to Android battery/permission/force-stop restrictions; fifteen-minute periodic scheduling is not an exact delivery promise.

## Verification and limits

APK compilation/signature verification and eight backend tests pass, including native signatures, UTF-8 evidence, replay/payload rejection and SIM binding checks. Runtime instrumentation was not executed: the installed AVD points to a missing Android 15 image, hardware acceleration is unavailable, and an attempted temporary Android 14 software-emulation boot exited before an ADB device became available. Native smoke tests are included for execution on a functioning test device. Compiling an APK does not certify live SMS reception. A SIM-equipped real phone acceptance run is required before enabling real customer collection.

No production APK/domain/signing identity, hardware attestation, automatic raw evidence retention, historical inbox reading, QR enrollment or quarantine recovery workflow is provided. The current app has one central account/approved subscription per enrolled device. Dual-SIM metadata is checked; multiple receiving accounts on one installation are not supported. Keep blocked evidence and resolve it with operations rather than editing receipt data.
