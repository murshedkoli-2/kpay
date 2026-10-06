# Registration, login and password recovery

## Production configuration

`APP_ORIGIN` should be `https://kpay-six.vercel.app`. It must be a plain origin, without Markdown formatting, credentials, paths or query parameters. On Vercel, an absent or malformed value falls back to the platform's `VERCEL_PROJECT_PRODUCTION_URL` over HTTPS. Request headers never determine password-reset destinations.

Add the same origin to Neon Auth's trusted domains. A successful Vercel build does not confirm authentication is configured: `/api/auth/config` must return HTTP 200, and login must reach Neon without `INVALID_ORIGIN`.

## Merchant registration

1. Submit business name, email and a password of 12–128 characters.
2. Neon creates the email identity; kPay records a pending merchant with no enabled providers.
3. Verify the email and obtain administrator approval.
4. Use the shared email/password login. Roles and approval status come from saved application records.

Administrator activation requires an invitation. Public merchant registration cannot create an administrator. Passwords retain spaces exactly as entered; only email and display-name fields are trimmed.

## Login

Neon validates email/password and verified email ownership. kPay resolves the saved Admin or Merchant role, verifies identity bindings and active status, then issues an HttpOnly session cookie. Suspended accounts and pending merchants cannot sign in. Merchant reads remain scoped to their own records.

## Password recovery

Forgot password submits an email to Neon's recovery endpoint and shows an account-neutral response. The server supplies a fixed callback origin. The emailed link returns to the reset form with a token; the form removes the token from the URL and submits it with the new password. Neon validates expiry and single use. Success clears the browser cookie and returns to sign-in; reset does not approve a pending merchant or grant a different role.

## Review and validation

The review reproduced a malformed production `APP_ORIGIN` that prevented server startup and an untrusted production origin rejected by Neon. Code fixes remove unnecessary production SQLite loading, validate URL settings, use Vercel's trusted production-domain fallback, display configuration failures clearly, and preserve exact passwords throughout registration and local admin creation.

Automated checks cover role assignment, invitation restrictions, merchant approval/isolation, reset request privacy, fixed callbacks, invalid/reused tokens, password validation, rate limiting, origin resolution, and unavailable-service UI. Live validation uses invalid inputs so it does not create accounts, email users or change passwords. Successful email delivery and a complete reset still require an account owner to exercise their inbox link.
