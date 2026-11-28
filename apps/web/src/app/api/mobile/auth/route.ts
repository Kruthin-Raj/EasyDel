import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createBearerToken, getBearerUser, SELF_SIGNUP_ROLE } from '@/lib/auth';
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/lib/password';

export async function GET(request: Request) {
  const user = await getBearerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ user });
}

export async function POST(request: Request) {
  let body: {
    mode?: 'login' | 'signup';
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const mode = body.mode === 'signup' ? 'signup' : 'login';
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  if (mode === 'login') {
    if (!password) {
      return NextResponse.json({ error: 'Enter your password.' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
    }
    if (!user.emailVerified) {
      return NextResponse.json(
        { error: 'Please verify your email address on the web before signing in.' },
        { status: 403 },
      );
    }

    const token = createBearerToken(user.id);
    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  }

  // Mobile sign-up
  const firstName = String(body.firstName ?? '').trim();
  const lastName = String(body.lastName ?? '').trim();
  if (!firstName) {
    return NextResponse.json({ error: 'First name is required.' }, { status: 400 });
  }
  const weak = validatePasswordStrength(password, password);
  if (weak) {
    return NextResponse.json({ error: weak }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email already exists. Please sign in instead.' },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);
  const created = await db.user.create({
    data: {
      email,
      passwordHash,
      firstName,
      lastName: lastName || '',
      role: SELF_SIGNUP_ROLE,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  const token = createBearerToken(created.id);
  return NextResponse.json({
    token,
    user: {
      id: created.id,
      email: created.email,
      firstName: created.firstName,
      lastName: created.lastName,
    },
  });
}

/** Updates the signed-in mobile user's password. */
export async function PATCH(request: Request) {
  const user = await getBearerUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!row) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  if (row.passwordHash) {
    if (!body.currentPassword || !(await verifyPassword(body.currentPassword, row.passwordHash))) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
    }
  }

  const newPw = String(body.newPassword ?? '');
  const weak = validatePasswordStrength(newPw, newPw);
  if (weak) return NextResponse.json({ error: weak }, { status: 400 });

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPw) },
  });

  return NextResponse.json({ ok: true });
}
