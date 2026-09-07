import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/**
 * Promise wrapper around crypto.scrypt.
 *
 * Hand-rolled rather than util.promisify: promisify picks the 3-argument
 * overload and drops the options parameter, so the cost parameters below could
 * not be passed at all.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

/**
 * Password hashing with scrypt.
 *
 * scrypt is used rather than a bare SHA hash because it is deliberately slow
 * and memory-hard, which is what makes a stolen hash expensive to crack. It
 * ships in Node's standard library, so this adds no dependency and no native
 * build step (unlike bcrypt/argon2).
 *
 * Stored format is self-describing:
 *   scrypt$N$r$p$<salt base64>$<derived key base64>
 * so the cost parameters can be raised later without invalidating existing
 * hashes — verify reads them back from the stored string.
 */

// ~64 MB per hash at N=2^16. Tuned to stay well under a second on a laptop.
const N = 65536;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// scrypt needs roughly 128 * N * r bytes; Node's default maxmem is too low.
const MAX_MEM = 256 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });

  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed hash, so a corrupted row
 * fails closed instead of 500-ing the login page.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltB64, keyB64] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let expected: Buffer;
  let salt: Buffer;
  try {
    expected = Buffer.from(keyB64, 'base64');
    salt = Buffer.from(saltB64, 'base64');
  } catch {
    return false;
  }
  if (expected.length === 0 || salt.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await scrypt(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAX_MEM,
    });
  } catch {
    return false;
  }

  // Constant-time: a fast-fail byte comparison would leak how much of the hash
  // matched.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Rejects passwords that are too short or in the common-breach shortlist. */
export function validatePasswordStrength(password: string, confirm?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 200) {
    return 'That password is unreasonably long.';
  }
  const COMMON = [
    'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
    'qwertyui', 'qwerty123', '11111111', 'abc12345', 'iloveyou', 'letmein1',
    'welcome1', 'admin123', 'easydel123',
  ];
  if (COMMON.includes(password.toLowerCase())) {
    return 'That password is too common. Choose something less guessable.';
  }
  if (confirm !== undefined && password !== confirm) {
    return 'The two passwords do not match.';
  }
  return null;
}
