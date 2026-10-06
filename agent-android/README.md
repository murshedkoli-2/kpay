# kPay Android Agent

Native Android app for centrally assigned bKash, Nagad and Rocket collection phones. Personal, merchant and agent account types use the same app; the administrator controls numbers and SMS formats.

## Development installation

The signed development APK is `../artifacts/kpay-agent-debug.apk`. Version 1.2 (code 3), minimum Android 10, target Android 15. The supplied APK connects to `https://kpay-six.vercel.app` and disables cleartext traffic. It retains the development signing certificate for upgrades and includes test instrumentation.

1. Confirm the deployed backend is available and configure collection accounts in Admin.
2. Connect a test Android phone over USB with USB debugging enabled.
3. Run `adb install -r artifacts/kpay-agent-debug.apk`, or use your managed installer. The supplied HTTPS build does not require USB networking.
4. Add a central receiving account and publish tested SMS templates in Admin.
5. Create an agent device and enter its ten-minute pairing code in the app. Enrollment requires a Keystore key proof and waits for approval.
6. Open Health, read the disclosure, grant SMS/phone permissions, and select the physical SIM slot. Sync once.
7. In Admin → Agent devices → Manage, confirm the subscription ID displayed on the phone and approve the device. Activate its receiving account, then sync again.

Android treats `RECEIVE_SMS` as a hard-restricted permission: installation must allowlist it before the user can grant it. Managed installation/installer policy may be required. Do not assume an arbitrary sideload or Google Play listing can grant it. The app does not request default-SMS status, read inbox history, or use accessibility to read messages. See [Android permission documentation](https://developer.android.com/reference/android/Manifest.permission#RECEIVE_SMS).

## Build

Requirements: JDK 17+, Android SDK platform 35 and build tools 35.0.0. No Maven/Gradle/network dependencies are needed.

```powershell
.\agent-android\build.ps1
# Override SDK location if necessary:
.\agent-android\build.ps1 -Sdk 'C:\Android\Sdk'
```

The script compiles Java, resources and DEX with official SDK tools, aligns and signs the APK, then verifies the signature. It keeps a development certificate under ignored `agent-android/build`; keep that certificate to install updates over existing development versions without losing queue data. Never uninstall an agent with pending evidence.

For a production-origin build, provide a production signing key and environment variable password. No private key/password belongs in source control:

```powershell
$env:KPAY_SIGNING_PASSWORD = '<set securely in your build environment>'
.\agent-android\build.ps1 -Release -Server 'https://your-trusted-server.example' -SigningKey 'C:\secure\agent-release.p12' -SigningAlias 'kpay'
```

Release builds reject HTTP, disable cleartext traffic and omit test instrumentation. The supplied development APK is not a production rollout artifact. Provision a trusted HTTPS deployment and managed permission installation first.

## App behavior

- Home: enrollment/approval readiness, queue depth, latest sync, sync now.
- Receipts: local evidence status, capture time, stable event ID and acknowledgment. An upload does not mean payment approval.
- Queue: pending/review/quarantined evidence, attempts, retry queued uploads.
- Accounts: read-only central provider/type/number, account status and published sender allowlist.
- Health: disclosure, runtime permissions, actual active subscriptions, binding health and Android app settings.
- Settings: pause new capture, trusted server, device ID, re-pairing while preserving local evidence.

The SMS receiver assembles multipart messages through Android Telephony APIs, filters published sender addresses, and excludes OTP/PIN/password messages. It never hardcodes payment SMS formats or parses payment fields. Matching remains server-side. Unknown or conflicting subscription metadata is quarantined locally, never assigned by guessing a default SIM. No historical inbox reconciliation or automatic quarantine release is implemented.

AES-GCM encryption protects credentials/configuration and raw queue payloads, with keys held in Android Keystore. P-256 device keys sign enrollment and every API request. Backup is disabled. SQLite commits evidence before upload, with a stable UUID and capture fingerprint for duplicate handling.

Android JobScheduler runs network-constrained durable jobs after capture, boot and updates, with 15-minute best-effort heartbeat jobs, exponential backoff and jitter. HTTP 429/5xx and network failures retry. Authentication failures stop upload until the device/clock/approval is fixed. HTTP 409/422 preserves evidence for attention. Receipt success persists server acknowledgment. Evidence is never deleted automatically; monitor storage and implement an audited retention process before extended deployment.

## Native smoke test

Development builds contain self-instrumentation for Keystore encryption, encrypted credentials, sender allowlist rejection, duplicate capture prevention, SQLite reopen persistence and activity launch:

```powershell
adb shell am instrument -w bd.kpay.agent/bd.kpay.agent.SmokeTest
# Optional controlled integration with a fresh admin-created pairing code:
adb shell am instrument -w -e code '<pairing-code>' bd.kpay.agent/bd.kpay.agent.SmokeTest
```

Run this only on a test device: it writes clearly labelled synthetic local queue records. Optional enrollment consumes the one-use code. `npm test` independently exercises signed enrollment, payload tampering, nonce replay, expired signatures, admin SIM confirmation, wrong-SIM rejection, receipt idempotency and changed-SIM invalidation.

## Real-phone acceptance checklist

- Obtain managed-install permission approval, grant permissions and confirm the actual SIM receiving number manually.
- Test real provider messages for each enabled provider/account/operation with published admin samples.
- Test multipart and Bangla SMS, matching senders, unrelated messages and OTP exclusion.
- Verify both SIM slots; missing subscription metadata must quarantine. Swapping/replacing a SIM must stop collection approval.
- Receive while offline, kill the process, reboot, then reconnect. Check identical event IDs and no duplicate ledger credit.
- Test permission removal, device pause/revoke, invalid phone clock, HTTP failures and queue storage pressure.
- Verify manufacturer battery restrictions. Force-stop prevents background capture until the app is reopened.
- Exercise APK update with the same signing certificate and retain pending receipts.

Subscription IDs identify Android subscriptions, not cryptographic SIM ownership. Signed uploads prove possession of the enrolled device key, not provider-authenticated payment or untampered SMS. Hardware attestation, rooted-device policy, production backend encryption and real provider reconciliation remain rollout requirements.

## Version 1.1 review

Fixed queued work remaining after a 50-receipt batch or a delayed retry, duplicate-capture races, shared cancellation state between background jobs, and permission revocation while reading subscriptions. SIM metadata accepts the standard Android subscription extra and the legacy extra; conflicting values remain quarantined. HTTP 403 preserves queued evidence for administrator attention. HTTPS builds disable cleartext traffic and generate an updated SHA-256 file.

The APK compiles and its signature/package metadata verify. Server-side signed-device tests pass. Expanded Android smoke tests compile, but could not run on the build computer because the configured emulator system image is missing and no phone is connected. Real SMS, dual-SIM behavior and background scheduling still need device acceptance testing.

## Installation build 1.2

The separately named `../artifacts/kpay-agent-v1.2.apk` retains the existing certificate, increases the update version, and explicitly includes v1/v2/v3 signatures. Signature verification for Android 16 and ZIP alignment pass. This is a compatibility rebuild; a generic phone message of “App not installed” does not identify the underlying installer error. No phone is connected to confirm installation. Do not uninstall an agent with pending receipts to work around an update conflict. The build removes stale incremental-install `.idsig` sidecars.
