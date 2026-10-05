# Android collection agent specification

## Purpose and platform

An Android app on managed collection phones captures permitted incoming payment SMS and forwards evidence. It does not send money, run USSD, read wallet PINs/OTPs, approve claims or edit balances.

Implementation: Kotlin, Jetpack Compose, Room for the durable local queue, WorkManager for network-bound retry work, Android Keystore for device private key protection. Proposed minimum Android 10; target SDK and supported-device matrix must be finalized from current Android requirements at implementation time.

SMS permissions are sensitive and restricted in Google Play. Do not assume approval or make the app a default SMS handler solely to evade policy. Validate the lawful distribution path and tested permission grants before release. [Google Play SMS policy](https://support.google.com/googleplay/android-developer/answer/10208820), [Android permission reference](https://developer.android.com/reference/android/Manifest.permission).

## App navigation

Home; Receipts; Sync queue; Receiving accounts; Device health; Settings. Setup screens: welcome/disclosure, pairing, permissions, SIM binding, administrator approval.

### Welcome and disclosure

Explain the purpose, configured SMS senders, data transmitted, retention and operator controls before requesting permission. Unrelated SMS must not be uploaded. Continue only after operator acknowledgment. Store disclosure version and time.

### Pair device

Enter short-lived one-use code or scan admin pairing QR. The QR identifies the approved server and code; it contains no persistent secret. Build configuration defines trusted server origin; arbitrary QR-controlled endpoints cannot receive SMS.

Generate signing key on device; submit public key, challenge proof, app/OS version and label. Backend enrolls device as pending. Admin approves account/SIM binding. Pairing code expires after 10 minutes; limited attempts and atomic single use. Show clear expired/rejected states.

### Permissions and SIM binding

Request only permissions necessary for supported capture. RECEIVE_SMS is the proposed live path. READ_SMS is requested only if optional historical reconciliation is implemented and approved for distribution. Do not assume SMS Retriever can read arbitrary provider payment messages.

Show available subscriptions/slots if accessible. Operator selects a subscription and identifies the central account; admin verifies the binding. SIM slot alone is insufficient identity, and number auto-detection is not reliable. Handle subscription changes by pausing the binding and requesting revalidation. Never guess a receiver from SMS text or the default SIM.

If the OS does not expose trustworthy receiving-subscription metadata, require a tested single-collection-SIM configuration and controlled binding, or quarantine ambiguous messages. Do not auto-approve messages from an unknown subscription.

### Home

Status: active/pending/paused/revoked; linked accounts; server reachability; latest capture and sync; queued/review count; permission and binding health. Actions: sync now, view queue, report issue. A green connection indicator means reachable, not financially reconciled.

### Receipts and queue

Show local candidate events with masked sender/preview, received time, account and state: queued, uploading, acknowledged, needs review, retrying, blocked. Acknowledged means server durably accepted evidence, not payment approved. Fetch server parse/match status for display when available.

Retry individual transient failures or all eligible queued events. Operator cannot alter captured SMS or transaction values. Do not allow local deletion of unacknowledged evidence. Invalid data remains available for controlled review/export under policy.

### Health and settings

Display app version, OS, permission state, current binding, last config version, sync errors and safe diagnostics. Allow notification preference, approved language and local app lock. Server endpoint and account mappings are admin-controlled.

Pause capture is explicit, alerts the backend at next contact and blocks new allocation to the affected account once unhealthy. Resume requires valid permissions/binding. Revocation clears usable credentials and stops uploads; pending data remains encrypted until a controlled recovery/deletion process.

## Capture pipeline

1. Receive SMS event and reassemble multipart segments in original order.
2. Check originating-address allowlist from approved configuration.
3. Resolve receiving subscription to one approved account binding.
4. Persist complete envelope in Room before requesting network work.
5. Assign stable client event UUID; include captured time, subscription binding ID, message hash and configuration version.
6. Schedule worker; authenticate and sign upload with device key and fresh server challenge/request metadata.
7. Mark acknowledged only on durable per-event server acknowledgment.
8. Keep masked local history and purge acknowledged raw content according to retention policy.

Do not parse authoritative values on-device. Local preview parsing is optional and cannot influence approval.

## Offline and lifecycle behavior

- WorkManager network constraint; exponential backoff with jitter, capped at 6 hours. Manual sync may expedite eligible work without bypassing limits.
- Retry network failures, 429 and retryable 5xx; respect Retry-After. Authentication failure pauses queue for re-enrollment; 422 moves evidence to review rather than discarding it.
- Process death, reboot, interrupted batch upload and app update must not lose queued events.
- Force-stop or manufacturer restrictions may prevent capture/background work; show health instructions and server alert, never promise uninterrupted collection.
- Missing historical events require explicit supported inbox reconciliation with appropriate permission; no claim that reboot recovery restores SMS never captured.
- Room queue cap triggers operational alarm; do not silently drop messages. Account allocation is paused before storage exhaustion becomes a collection risk.
- Captured timestamp is evidence metadata, not trusted authority for accounting.

## Device configuration

Server returns device ID/status, bindings, allowed sender addresses, capture start time, configuration version, heartbeat settings and size limits. No merchant keys, provider wallet credentials or payout secrets are sent.

Heartbeat while operational includes queue depth, oldest queued age, permission/binding status and app version. Background scheduling is best effort; default offline threshold 30 minutes, adjusted from real-device measurements. New allocation requires heartbeat freshness and validated binding.

## Android completion criteria

Real supported phones demonstrate live and multipart SMS capture, dual-SIM isolation, offline persistence, duplicate handling, process restart, permission loss, binding change and revocation. A simulator alone cannot satisfy this milestone.
