import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db';

/**
 * Session handling and authorisation guards.
 *
 * Self-contained: Supabase is no longer part of the auth path (it remains the
 * Postgres host and file store). Identity is proven by an HMAC-signed httpOnly
 * cookie carrying the user id, re-checked against the database on every
 * request so a deleted or demoted user loses access immediately.
 *
 * Server Actions are reachable by direct POST regardless of what the UI
 * renders, so requireUser()/requireAdmin() are the real security boundary —
 * not the proxy redirect, and not whether a button is visible.
 */

export const SESSION_COOKIE = 'easydel_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET is not set — refusing to issue sessions.');
  return value;
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Returns the user id if the token is authentic and unexpired. */
function readToken(token: string): string | null {
  const separator = token.lastIndexOf('.');
  if (separator < 1) return null;

  const payload = token.slice(0, separator);
  const provided = Buffer.from(token.slice(separator + 1));
  const expected = Buffer.from(sign(payload));

  // Constant-time compare so the signature cannot be discovered byte by byte.
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  const [userId, expiresAt] = payload.split('|');
  if (!userId || !expiresAt) return null;
  if (Number(expiresAt) < Date.now()) return null;

  return userId;
}

export async function createSession(userId: string) {
  const payload = `${userId}|${Date.now() + SESSION_TTL_SECONDS * 1000}`;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export type SessionUser = {
  id: string;
  email: string;
  role: 'ADMIN' | 'MENTOR' | 'DELIVERY_AGENT';
  firstName: string;
  lastName: string;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = readToken(token);
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      emailVerified: true,
    },
  });

  // Re-checked per request, so revoking verification or deleting the row takes
  // effect at once rather than when the cookie happens to expire.
  if (!user || !user.emailVerified) return null;

  const { emailVerified: _ignored, ...session } = user;
  return session as SessionUser;
}

/** Throws unless a verified session exists. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error('Unauthorized — sign in first.');
  return user;
}

/** Throws unless the caller is an ADMIN. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') {
    throw new Error('Forbidden — this action requires the ADMIN role.');
  }
  return user;
}

/**
 * Role granted to someone who signs up through the public form.
 *
 * DELIVERY_AGENT deliberately: signup is open, so this is what a stranger who
 * finds the URL receives. An ADMIN default would let them delete locations and
 * reassign routes. Change this only alongside restricting who may sign up.
 */
export const SELF_SIGNUP_ROLE = 'DELIVERY_AGENT' as const;
