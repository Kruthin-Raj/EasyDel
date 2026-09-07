# Authentication and email

Auth is **fully self-hosted**. Supabase is the Postgres host and file store only
— it is not in the authentication path at all.

| Concern | Where it lives |
|---|---|
| Password hashing | scrypt, `apps/web/src/lib/password.ts` |
| Sessions | HMAC-signed httpOnly cookie, `apps/web/src/lib/auth.ts` |
| Verification codes | `EmailVerificationCode` table, `lib/tokens.ts` |
| Password reset | `PasswordResetToken` table, `lib/tokens.ts` |
| Sending mail | your SMTP server via nodemailer, `lib/mailer.ts` |

## Why not Supabase Auth

It was tried and removed. Supabase's mailer failed at the transport layer
(`dial tcp: lookup EasyDel.gmail.com: no such host`), its built-in sender is
rate-limited to a few messages an hour, and the OTP flow needed its email
templates hand-edited to expose `{{ .Token }}`. Keeping Supabase for passwords
while sending our own mail would also have required the **service-role key**
inside the web app — a key that bypasses row-level security — plus two
competing sources of truth for "is this email verified".

One system, one place to debug.

---

## SMTP configuration

Set these in `apps/web/.env.local` (and in your host's environment for
deployment). Placeholders are already in `.env.example`.

```dotenv
SMTP_HOST="smtp.gmail.com"        # a HOSTNAME. Not an app name, not a code.
SMTP_PORT="587"                   # 587 STARTTLS, 465 implicit TLS
SMTP_USER="you@example.com"
SMTP_PASSWORD="your-app-password"
SMTP_FROM="EasyDel <you@example.com>"
SMTP_SECURE=""                    # optional; defaults to true when port is 465
```

| Provider | Host | Port | Username |
|---|---|---|---|
| Gmail / Workspace | `smtp.gmail.com` | 587 | full Gmail address |
| SendGrid | `smtp.sendgrid.net` | 587 | literally `apikey` |
| Brevo | `smtp-relay.brevo.com` | 587 | your Brevo login email |
| Mailgun | `smtp.mailgun.org` | 587 | `postmaster@your-domain` |
| Resend | `smtp.resend.com` | 587 | literally `resend` |

Gmail needs an **App Password** — 16 characters, four groups of four, with 2FA
enabled. Your normal account password will be rejected with `535`.

### Works with no SMTP at all

If `SMTP_HOST` is blank, nothing is sent. Instead the message — including the
6-digit code — is printed to the **server console**, and the UI says so rather
than pretending it emailed you:

```
─────────────────────────────────────────────────────────────
 SMTP is not configured — email was NOT sent.
 Set SMTP_HOST / SMTP_PORT in apps/web/.env.local to deliver.
─────────────────────────────────────────────────────────────
 To:      someone@example.com
 Subject: 481923 is your EasyDel verification code
 Your EasyDel verification code is: 481923
```

That makes local signup fully usable before any mail server exists. **This is a
development convenience only** — it means anyone who can read your server logs
can complete a signup, so configure real SMTP before deploying.

### Nothing to edit in Supabase

No templates, no URL configuration, no SMTP settings there. Email bodies are
in `lib/mailer.ts` as ordinary code, so they are version-controlled and
reviewable. If you previously edited the Supabase templates, reverting them —
as you have — is correct.

---

## The flows

### Sign up

1. `/signup` — name, email, password, confirm.
2. A `User` row is created with `emailVerified: false`.
3. A 6-digit code is issued and emailed. Only its SHA-256 hash is stored.
4. `/verify` — enter the code. On success `emailVerified` is set and a session
   is created.

Sign-in is refused until verification, and `getSessionUser()` re-checks
`emailVerified` on every request — so an unverified account can never reach the
dashboard even if it somehow obtained a cookie.

**New accounts get the `DELIVERY_AGENT` role** (`SELF_SIGNUP_ROLE` in
`lib/auth.ts`). Signup is open, so this is what a stranger who finds the URL
receives. An `ADMIN` default would let them delete locations and reassign
routes. Change it only alongside restricting who may sign up.

### Signing up with an address that already exists

Not treated as a failure:

- **Already verified** → a neutral message ("You already have an account for
  …") plus *Sign in instead* and *Reset my password* buttons.
- **Registered but never verified** → treated as resuming signup. The password
  is updated and a fresh code sent, so a half-finished attempt is not a dead
  end.

Note the trade-off: telling the user their account exists confirms that the
address is registered. That is a deliberate choice for usability on an
open-signup tool. Sign-in and password-reset **do not** leak this — both
respond identically whether or not the account exists.

### Sign in

Wrong email and wrong password return the same message, so the form cannot be
used to enumerate registered addresses. Correct password on an unverified
account sends a new code and redirects to `/verify` rather than refusing.

### Password reset

1. `/forgot-password` — always answers "if an account exists…", regardless.
2. A 32-byte single-use token is emailed as a link to `/reset-password?token=…`.
3. The page **checks but does not consume** the token, so an email client that
   prefetches links cannot burn it. It is consumed inside the action on submit.
4. Consumption is a conditional update, so two simultaneous submissions cannot
   both succeed.

---

## Security properties worth keeping

- Codes and tokens are stored **hashed** — a database leak yields no usable
  secrets.
- Codes expire in **15 minutes**, reset links in **1 hour**.
- **5 wrong code attempts** burns the code. A 6-digit code is only 10⁶
  possibilities, so limiting guesses is what makes it safe.
- Issuing a new code invalidates the previous one, so only the newest email
  works.
- Passwords: scrypt at N=2^16, per-password random salt, constant-time compare.
  The stored string records its own cost parameters, so they can be raised later
  without invalidating existing hashes.
- Session cookies are `httpOnly`, `sameSite=lax`, `secure` in production, and
  signed with `JWT_SECRET`.
- Every Server Action calls `requireUser()` or `requireAdmin()`. Actions are
  reachable by direct POST regardless of the UI, so that — not the proxy
  redirect — is the security boundary.

## Still to do

- **Rate-limit sign-in and code requests per IP.** Attempts per code are
  capped, but nothing throttles how many codes an address can request.
- Expire old rows on a schedule — `purgeExpiredTokens()` exists but nothing
  calls it yet.
- Admin-initiated invites (create a user who sets their own password).

## Testing

```bash
pnpm --filter web test        # 68 unit + integration tests
```

`password.test.ts` covers hashing, verification and failing closed on malformed
hashes. `tokens.test.ts` hits the real database to cover single-use semantics,
expiry, attempt limits and concurrent redemption — the parts that cannot be
meaningfully mocked.
