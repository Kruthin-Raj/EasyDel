'use server';

import { redirect } from 'next/navigation';
import { db } from './db';
import { createSession, destroySession, SELF_SIGNUP_ROLE } from './auth';
import { hashPassword, verifyPassword, validatePasswordStrength } from './password';
import {
  issueVerificationCode,
  verifyCode,
  issueResetToken,
  consumeResetToken,
} from './tokens';
import { sendMail, verificationEmail, passwordResetEmail, smtpConfigured } from './mailer';

/*
 * Auth Server Actions — fully self-hosted.
 *
 * Passwords are scrypt-hashed locally, verification codes and reset tokens live
 * in our own tables, and mail goes out through our own SMTP. Supabase is not in
 * this path at all.
 *
 * Note on redirect(): it signals by throwing, so it is always called OUTSIDE
 * any try/catch that would swallow it.
 */

export type AuthState = {
  error?: string;
  success?: string;
  /** Neutral guidance — e.g. "you already have an account, sign in". */
  info?: string;
  email?: string;
  /** Set when SMTP is unconfigured so the UI can point at the server console. */
  devNoMail?: boolean;
} | null;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function normaliseEmail(raw: FormDataEntryValue | null) {
  return String(raw ?? '').trim().toLowerCase();
}

/**
 * The public base URL, used to build password-reset links.
 *
 * Resolved at request time, in this order:
 *
 *   1. NEXT_PUBLIC_SITE_URL          — set this once you have a custom domain
 *   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel injects this; stable across deploys
 *   3. VERCEL_URL                    — per-deployment URL; correct on previews
 *   4. localhost                     — development
 *
 * The Vercel fallbacks exist to break a chicken-and-egg problem: you cannot
 * know your deployment URL before the first deploy, so requiring
 * NEXT_PUBLIC_SITE_URL up front meant every project shipped one broken build
 * with reset links pointing at a placeholder, then needed a second deploy.
 *
 * These are read at runtime rather than inlined at build time (they are not
 * NEXT_PUBLIC_ variables), so the value is always correct for the deployment
 * actually serving the request — including preview deployments, which each have
 * their own hostname.
 */
function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit && !explicit.includes('REPLACE-WITH')) {
    return explicit.replace(/\/$/, '');
  }

  // Vercel supplies these without a protocol.
  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (vercelHost) return `https://${vercelHost.replace(/\/$/, '')}`;

  return 'http://localhost:3000';
}

/** Sends the verification code, translating a send failure into a message. */
async function deliverCode(email: string): Promise<AuthState> {
  const code = await issueVerificationCode(email);
  const result = await sendMail({ to: email, ...verificationEmail(code) });

  if (!result.ok) {
    // Surfaced rather than swallowed: an SMTP misconfiguration used to look
    // like success while nothing was delivered.
    return {
      error:
        'We could not send the verification email. Check the SMTP settings — the server log has the exact reason.',
      email,
    };
  }
  return { email, devNoMail: !result.delivered };
}

// ------------------------------------------------------------- sign up ------

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normaliseEmail(formData.get('email'));
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();

  if (!firstName) return { error: 'First name is required.' };
  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };

  const weak = validatePasswordStrength(password, confirm);
  if (weak) return { error: weak };

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });

  // Already registered and verified: guide them to sign in rather than
  // presenting this as a failure.
  if (existing?.emailVerified) {
    return {
      info: `You already have an account for ${email}. Sign in below, or reset your password if you have forgotten it.`,
      email,
    };
  }

  // Registered but never verified — treat this as resuming signup. The
  // password is updated so a half-finished attempt is not a dead end.
  if (existing && !existing.emailVerified) {
    await db.user.update({
      where: { id: existing.id },
      data: { firstName, lastName, passwordHash: await hashPassword(password) },
    });
    const sent = await deliverCode(email);
    if (sent?.error) return sent;
    redirect(`/verify?email=${encodeURIComponent(email)}&resumed=1`);
  }

  await db.user.create({
    data: {
      email,
      firstName,
      lastName,
      role: SELF_SIGNUP_ROLE,
      passwordHash: await hashPassword(password),
      emailVerified: false,
    },
  });

  const sent = await deliverCode(email);
  if (sent?.error) return sent;

  redirect(`/verify?email=${encodeURIComponent(email)}`);
}

// -------------------------------------------------------- verify email ------

export async function verifyOtpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normaliseEmail(formData.get('email'));
  const code = String(formData.get('token') ?? '').replace(/\D/g, '');

  if (!EMAIL_RE.test(email)) {
    return { error: 'Missing email address. Start again from sign up.', email };
  }
  if (code.length !== 6) return { error: 'Enter the 6-digit code from your email.', email };

  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return { error: 'No signup found for that address. Start again from sign up.', email };

  const outcome = await verifyCode(email, code);
  if (!outcome.ok) {
    const messages = {
      'not-found': 'No active code for that address. Request a new one.',
      expired: 'That code has expired. Request a new one.',
      'too-many-attempts': 'Too many incorrect attempts. Request a new code.',
      incorrect: 'That code is not correct. Check it and try again.',
    };
    return { error: messages[outcome.reason], email };
  }

  await db.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });

  await createSession(user.id);
  redirect('/');
}

export async function resendOtpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normaliseEmail(formData.get('email'));
  if (!EMAIL_RE.test(email)) return { error: 'Missing email address.', email };

  const user = await db.user.findUnique({
    where: { email },
    select: { emailVerified: true },
  });

  if (user?.emailVerified) {
    return { info: 'That email is already verified — you can sign in.', email };
  }
  // Deliberately identical response whether or not a signup exists, so this
  // cannot be used to probe for registered addresses.
  if (!user) {
    return { success: 'If a signup exists for that address, a new code is on its way.', email };
  }

  const sent = await deliverCode(email);
  if (sent?.error) return sent;

  return {
    success: 'A new code is on its way. It expires in 15 minutes.',
    email,
    devNoMail: sent?.devNoMail,
  };
}

// -------------------------------------------------------------- log in ------

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normaliseEmail(formData.get('email'));
  const password = String(formData.get('password') ?? '');

  if (!email || !password) return { error: 'Email and password are required.' };

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, emailVerified: true },
  });

  const passwordOk = await verifyPassword(password, user?.passwordHash ?? null);

  // One message for both wrong email and wrong password, so the form cannot be
  // used to discover which addresses are registered.
  if (!user || !passwordOk) return { error: 'Invalid email or password.' };

  // Correct credentials but unverified: send them to finish verification
  // rather than refusing with a dead end.
  if (!user.emailVerified) {
    await deliverCode(email);
    redirect(`/verify?email=${encodeURIComponent(email)}&unverified=1`);
  }

  await createSession(user.id);
  redirect('/');
}

export async function logoutAction() {
  await destroySession();
  redirect('/login');
}

// ---------------------------------------------------- forgot / reset --------

export async function forgotPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = normaliseEmail(formData.get('email'));
  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });

  // Only actually send for a real, verified account — but always answer the
  // same way, so the response reveals nothing about who is registered.
  if (user?.emailVerified) {
    const token = await issueResetToken(email);
    const link = `${siteUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    const result = await sendMail({ to: email, ...passwordResetEmail(link) });

    if (!result.ok) {
      return {
        error:
          'We could not send the reset email. Check the SMTP settings — the server log has the exact reason.',
      };
    }
    return {
      success:
        'If an account exists for that address, a reset link is on its way. Check your inbox and spam folder.',
      devNoMail: !result.delivered,
    };
  }

  return {
    success:
      'If an account exists for that address, a reset link is on its way. Check your inbox and spam folder.',
    devNoMail: !smtpConfigured(),
  };
}

export async function resetPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  const weak = validatePasswordStrength(password, confirm);
  if (weak) return { error: weak };

  // Consumed before the password is written, so a link cannot be replayed even
  // if two requests arrive at once.
  const email = await consumeResetToken(token);
  if (!email) {
    return { error: 'This reset link has expired or was already used. Request a new one.' };
  }

  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return { error: 'That account no longer exists.' };

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) },
  });

  redirect('/login?reset=1');
}
