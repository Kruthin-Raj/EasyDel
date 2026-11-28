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
const MOBILE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

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

export function buildSessionCookie(userId: string) {
  const payload = `${userId}|${Date.now() + SESSION_TTL_SECONDS * 1000}`;
  return {
    name: SESSION_COOKIE,
    value: `${payload}.${sign(payload)}`,
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    },
  };
}

export async function createSession(userId: string) {
  const { name, value, options } = buildSessionCookie(userId);
  const jar = await cookies();
  jar.set(name, value, options);
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

async function loadVerifiedUser(userId: string): Promise<SessionUser | null> {
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
  // effect at once rather than when the cookie or token happens to expire.
  if (!user || !user.emailVerified) return null;

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = readToken(token);
  if (!userId) return null;

  return loadVerifiedUser(userId);
}

/** Issues a 30-day HMAC-signed bearer token for the native mobile app. */
export function createBearerToken(userId: string): string {
  const payload = `${userId}|${Date.now() + MOBILE_TOKEN_TTL_SECONDS * 1000}`;
  return `${payload}.${sign(payload)}`;
}

/** Authenticates a mobile API request from `Authorization: Bearer <token>`. */
export async function getBearerUser(request: Request): Promise<SessionUser | null> {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const userId = readToken(match[1].trim());
  if (!userId) return null;

  return loadVerifiedUser(userId);
}

/** Throws unless a verified session exists. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error('Unauthorized — sign in first.');
  return user;
}

/** Validates an internal redirect target so open-redirect URLs are rejected. */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== 'string') return '/';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';
  return trimmed;
}

/**
 * Default role value stored on the User row when signing up.
 *
 * All users have equal permissions in the platform — there is no admin
 * hierarchy. Kept only to satisfy the database column without a destructive
 * schema change.
 */
export const SELF_SIGNUP_ROLE = 'DELIVERY_AGENT' as const;
