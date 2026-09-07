import { createHash, randomBytes, randomInt } from 'node:crypto';
import { db } from './db';

/**
 * One-time email codes and password-reset tokens.
 *
 * Both are stored as SHA-256 hashes, never in the clear: a leaked database
 * should not hand out working codes. SHA-256 is appropriate here (unlike for
 * passwords) because these secrets are high-entropy and short-lived, so there
 * is nothing to brute-force offline.
 */

const CODE_TTL_MINUTES = 15;
const RESET_TTL_MINUTES = 60;

/**
 * A 6-digit code is only 1e6 possibilities, so guessing is the real threat, not
 * cracking. Attempts are capped to make online brute force useless.
 */
const MAX_CODE_ATTEMPTS = 5;

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

/* ------------------------------------------------------ verification code -- */

/**
 * Issues a fresh 6-digit code, invalidating any earlier unconsumed ones for
 * that address so only the newest email works.
 */
export async function issueVerificationCode(email: string): Promise<string> {
  const normalised = email.trim().toLowerCase();

  await db.emailVerificationCode.updateMany({
    where: { email: normalised, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  // randomInt is cryptographically secure; Math.random is not.
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

  await db.emailVerificationCode.create({
    data: {
      email: normalised,
      codeHash: hash(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
    },
  });

  return code;
}

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'expired' | 'too-many-attempts' | 'incorrect' };

/**
 * Checks a submitted code and consumes it on success.
 *
 * A wrong guess increments `attempts`; past the cap the row is burned so the
 * user must request a new code. That converts an online guessing attack into
 * an email-sending rate-limit problem.
 */
export async function verifyCode(email: string, code: string): Promise<VerifyOutcome> {
  const normalised = email.trim().toLowerCase();

  const record = await db.emailVerificationCode.findFirst({
    where: { email: normalised, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) return { ok: false, reason: 'not-found' };

  if (record.expiresAt < new Date()) {
    await db.emailVerificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    return { ok: false, reason: 'expired' };
  }

  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    await db.emailVerificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    return { ok: false, reason: 'too-many-attempts' };
  }

  if (record.codeHash !== hash(code)) {
    await db.emailVerificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: 'incorrect' };
  }

  await db.emailVerificationCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });
  return { ok: true };
}

/* -------------------------------------------------------- reset token ------ */

/** Issues a single-use reset token and returns the raw value for the email. */
export async function issueResetToken(email: string): Promise<string> {
  const normalised = email.trim().toLowerCase();

  await db.passwordResetToken.updateMany({
    where: { email: normalised, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  // 32 random bytes — long enough that guessing is not a consideration.
  const token = randomBytes(32).toString('base64url');

  await db.passwordResetToken.create({
    data: {
      email: normalised,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
    },
  });

  return token;
}

/** Returns the email a valid token belongs to, or null. Does not consume it. */
export async function peekResetToken(token: string): Promise<string | null> {
  if (!token) return null;
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!record || record.consumedAt || record.expiresAt < new Date()) return null;
  return record.email;
}

/**
 * Consumes a token, returning the email it belonged to.
 *
 * The update is conditional on `consumedAt` still being null, so two
 * simultaneous submissions cannot both succeed.
 */
export async function consumeResetToken(token: string): Promise<string | null> {
  if (!token) return null;
  const tokenHash = hash(token);

  const record = await db.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.consumedAt || record.expiresAt < new Date()) return null;

  const claimed = await db.passwordResetToken.updateMany({
    where: { tokenHash, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claimed.count === 0) return null;

  return record.email;
}

/** Housekeeping for expired rows. Safe to call from a cron or on demand. */
export async function purgeExpiredTokens() {
  const now = new Date();
  const [codes, tokens] = await Promise.all([
    db.emailVerificationCode.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return { codes: codes.count, tokens: tokens.count };
}
