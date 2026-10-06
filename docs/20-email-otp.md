# Email code verification and password recovery

Neon Auth sends the registration verification code. After signup, kPay opens a six-digit email code form. Users who closed it can choose **Verify email with a code** from sign-in. Resend uses `email-otp/send-verification-otp` with a server-controlled `email-verification` purpose.

`auth/verify-email` submits the code to Neon's `email-otp/verify-email`. Any returned provider session is signed out and never converted into a workspace session. Merchant approval remains required; email verification does not grant a role or activate a merchant.

Forgot password now requests a `forget-password` code through the same Neon send endpoint. The next form accepts email, code, new password and confirmation. `email-otp/reset-password` performs code validation and password replacement atomically in Neon. Existing reset links remain supported.

The browser provides a numeric code keyboard, one-time-code autofill, resend cooldown and inline errors. No codes or passwords are persisted in browser storage. Server routes enforce origin checks, persisted request rate limits, six-digit code validation, and 12–128 character passwords. Recovery requests use account-neutral messaging.

Validation: 17 tests pass, including invalid codes, purpose separation, single-use reset codes, password whitespace, cross-origin rejection, session clearing, and verification without workspace access. Browser forms were verified against an isolated response fixture. Empty invalid requests confirmed the live Neon OTP endpoints exist without sending emails or modifying accounts. A real emailed code and end-to-end delivery still require user verification.
