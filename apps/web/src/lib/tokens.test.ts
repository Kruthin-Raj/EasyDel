import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from './db';
import {
  issueVerificationCode,
  verifyCode,
  issueResetToken,
  peekResetToken,
  consumeResetToken,
  purgeExpiredTokens,
} from './tokens';

/**
 * Integration tests — these hit the real database, because the whole point of
 * this module is the persistence and single-use semantics. Mocking Prisma here
 * would test nothing worth testing.
 *
 * Requires DATABASE_URL (loaded by vitest.config.mts). All rows are namespaced
 * to a test address and cleaned up.
 */

const EMAIL = 'tokens.test@easydel.invalid';

async function cleanup() {
  await db.emailVerificationCode.deleteMany({ where: { email: EMAIL } });
  await db.passwordResetToken.deleteMany({ where: { email: EMAIL } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe('email verification codes', () => {
  it('issues a 6-digit numeric code', async () => {
    const code = await issueVerificationCode(EMAIL);
    expect(code).toMatch(/^\d{6}$/);
  });

  it('stores only a hash, never the code itself', async () => {
    const code = await issueVerificationCode(EMAIL);
    const row = await db.emailVerificationCode.findFirst({ where: { email: EMAIL } });
    expect(row?.codeHash).toBeTruthy();
    expect(row?.codeHash).not.toBe(code);
    expect(JSON.stringify(row)).not.toContain(code);
  });

  it('accepts the correct code exactly once', async () => {
    const code = await issueVerificationCode(EMAIL);
    expect(await verifyCode(EMAIL, code)).toEqual({ ok: true });

    // Replay must fail — the row is consumed.
    expect(await verifyCode(EMAIL, code)).toEqual({ ok: false, reason: 'not-found' });
  });

  it('rejects an incorrect code and counts the attempt', async () => {
    const code = await issueVerificationCode(EMAIL);
    const wrong = code === '000000' ? '111111' : '000000';

    expect(await verifyCode(EMAIL, wrong)).toEqual({ ok: false, reason: 'incorrect' });

    const row = await db.emailVerificationCode.findFirst({ where: { email: EMAIL } });
    expect(row?.attempts).toBe(1);

    // The real code still works while attempts remain.
    expect(await verifyCode(EMAIL, code)).toEqual({ ok: true });
  });

  it('burns the code after too many wrong attempts', async () => {
    const code = await issueVerificationCode(EMAIL);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i++) {
      expect(await verifyCode(EMAIL, wrong)).toEqual({ ok: false, reason: 'incorrect' });
    }

    // Sixth attempt trips the cap, and even the CORRECT code is now dead —
    // this is what stops a 1e6 keyspace being walked online.
    expect(await verifyCode(EMAIL, wrong)).toEqual({ ok: false, reason: 'too-many-attempts' });
    expect(await verifyCode(EMAIL, code)).toEqual({ ok: false, reason: 'not-found' });
  });

  it('rejects an expired code', async () => {
    const code = await issueVerificationCode(EMAIL);
    await db.emailVerificationCode.updateMany({
      where: { email: EMAIL, consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await verifyCode(EMAIL, code)).toEqual({ ok: false, reason: 'expired' });
  });

  it('invalidates an earlier code when a new one is issued', async () => {
    const first = await issueVerificationCode(EMAIL);
    const second = await issueVerificationCode(EMAIL);
    expect(first).not.toBe(second);

    expect(await verifyCode(EMAIL, first)).toEqual({ ok: false, reason: 'incorrect' });
    expect(await verifyCode(EMAIL, second)).toEqual({ ok: true });
  });

  it('reports not-found when no code was ever issued', async () => {
    expect(await verifyCode(EMAIL, '123456')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('normalises the email, so casing and padding do not matter', async () => {
    const code = await issueVerificationCode(`  ${EMAIL.toUpperCase()}  `);
    expect(await verifyCode(EMAIL, code)).toEqual({ ok: true });
  });
});

describe('password reset tokens', () => {
  it('issues a long random token and stores only its hash', async () => {
    const token = await issueResetToken(EMAIL);
    expect(token.length).toBeGreaterThanOrEqual(40);

    const row = await db.passwordResetToken.findFirst({ where: { email: EMAIL } });
    expect(row?.tokenHash).not.toBe(token);
  });

  it('peek returns the email without consuming the token', async () => {
    const token = await issueResetToken(EMAIL);
    expect(await peekResetToken(token)).toBe(EMAIL);
    // Still usable — an email client prefetching the link must not burn it.
    expect(await peekResetToken(token)).toBe(EMAIL);
    expect(await consumeResetToken(token)).toBe(EMAIL);
  });

  it('consumes a token exactly once', async () => {
    const token = await issueResetToken(EMAIL);
    expect(await consumeResetToken(token)).toBe(EMAIL);
    expect(await consumeResetToken(token)).toBeNull();
    expect(await peekResetToken(token)).toBeNull();
  });

  it('rejects an unknown, empty or expired token', async () => {
    expect(await consumeResetToken('')).toBeNull();
    expect(await consumeResetToken('not-a-real-token')).toBeNull();

    const token = await issueResetToken(EMAIL);
    await db.passwordResetToken.updateMany({
      where: { email: EMAIL, consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await peekResetToken(token)).toBeNull();
    expect(await consumeResetToken(token)).toBeNull();
  });

  it('invalidates an earlier token when a new one is issued', async () => {
    const first = await issueResetToken(EMAIL);
    const second = await issueResetToken(EMAIL);

    expect(await consumeResetToken(first)).toBeNull();
    expect(await consumeResetToken(second)).toBe(EMAIL);
  });

  it('only one of two concurrent redemptions succeeds', async () => {
    const token = await issueResetToken(EMAIL);
    const results = await Promise.all([consumeResetToken(token), consumeResetToken(token)]);
    expect(results.filter((r) => r === EMAIL)).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(1);
  });
});

describe('purgeExpiredTokens', () => {
  it('removes expired rows and leaves live ones', async () => {
    await issueVerificationCode(EMAIL);
    await db.emailVerificationCode.updateMany({
      where: { email: EMAIL },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const liveCode = await issueVerificationCode(EMAIL);

    const result = await purgeExpiredTokens();
    expect(result.codes).toBeGreaterThanOrEqual(1);

    // The live code survived the purge.
    expect(await verifyCode(EMAIL, liveCode)).toEqual({ ok: true });
  });
});
