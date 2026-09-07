import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, validatePasswordStrength } from './password';

describe('hashPassword / verifyPassword', () => {
  it('accepts the correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('Correct horse battery staple', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
    // Both must still verify — the salt is embedded in the stored string.
    expect(await verifyPassword('same-password', a)).toBe(true);
    expect(await verifyPassword('same-password', b)).toBe(true);
  });

  it('never stores the password in the hash', async () => {
    const hash = await hashPassword('super-secret-value');
    expect(hash).not.toContain('super-secret-value');
  });

  it('records its cost parameters so they can be raised later', async () => {
    const hash = await hashPassword('x'.repeat(12));
    const [scheme, n, r, p] = hash.split('$');
    expect(scheme).toBe('scrypt');
    expect(Number(n)).toBeGreaterThanOrEqual(16384);
    expect(Number(r)).toBeGreaterThan(0);
    expect(Number(p)).toBeGreaterThan(0);
  });

  it('fails closed on a null, empty or malformed hash', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$1$2$3')).toBe(false);
    expect(await verifyPassword('anything', 'bcrypt$1$8$1$aaaa$bbbb')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$x$y$z$aaaa$bbbb')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$16384$8$1$$')).toBe(false);
  });

  it('verifies a hash generated with different cost parameters', async () => {
    // Simulates a hash written before the cost was raised: parameters are read
    // back from the stored string, not assumed.
    const { randomBytes, scryptSync } = await import('node:crypto');
    const salt = randomBytes(16);
    const key = scryptSync('legacy-password', salt, 64, { N: 16384, r: 8, p: 1 });
    const legacy = ['scrypt', 16384, 8, 1, salt.toString('base64'), key.toString('base64')].join('$');

    expect(await verifyPassword('legacy-password', legacy)).toBe(true);
    expect(await verifyPassword('wrong', legacy)).toBe(false);
  });

  it('handles unicode and very long passwords', async () => {
    const unicode = 'ಪಾಸ್‌ವರ್ಡ್-🔐-Ünïcødé';
    expect(await verifyPassword(unicode, await hashPassword(unicode))).toBe(true);

    const long = 'a'.repeat(200);
    expect(await verifyPassword(long, await hashPassword(long))).toBe(true);
  });
});

describe('validatePasswordStrength', () => {
  it('accepts a reasonable password', () => {
    expect(validatePasswordStrength('a-decent-password')).toBeNull();
  });

  it('rejects anything under 8 characters', () => {
    expect(validatePasswordStrength('short')).toMatch(/at least 8/);
    expect(validatePasswordStrength('1234567')).toMatch(/at least 8/);
    expect(validatePasswordStrength('12345678')).not.toMatch(/at least 8/);
  });

  it('rejects absurdly long input', () => {
    expect(validatePasswordStrength('a'.repeat(201))).toMatch(/unreasonably long/);
  });

  it('rejects common breach-list passwords, case-insensitively', () => {
    expect(validatePasswordStrength('password')).toMatch(/too common/);
    expect(validatePasswordStrength('PASSWORD123')).toMatch(/too common/);
    expect(validatePasswordStrength('12345678')).toMatch(/too common/);
    expect(validatePasswordStrength('qwerty123')).toMatch(/too common/);
  });

  it('reports a mismatch only when a confirmation is supplied', () => {
    expect(validatePasswordStrength('a-decent-password', 'a-decent-password')).toBeNull();
    expect(validatePasswordStrength('a-decent-password', 'something-else')).toMatch(/do not match/);
    expect(validatePasswordStrength('a-decent-password')).toBeNull();
  });

  it('checks length before mismatch, so the clearer error wins', () => {
    expect(validatePasswordStrength('short', 'different')).toMatch(/at least 8/);
  });
});
