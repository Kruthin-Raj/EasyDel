import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { buildSessionCookie, SELF_SIGNUP_ROLE } from '@/lib/auth';

function getOrigin(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envUrl && !envUrl.includes('REPLACE-WITH')) {
    return envUrl.replace(/\/$/, '');
  }

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  if (host) {
    return `${proto}://${host}`;
  }

  return request.nextUrl.origin;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token?: string;
}

interface GoogleUserInfo {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email: string;
  email_verified?: boolean;
}

export async function GET(request: NextRequest) {
  const origin = getOrigin(request);
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const loginRedirect = (errorCode: string) => {
    const url = new URL('/login', origin);
    url.searchParams.set('error', errorCode);
    const res = NextResponse.redirect(url);
    res.cookies.delete('oauth_state');
    return res;
  };

  if (error) {
    return loginRedirect('oauth_cancelled');
  }

  const cookieState = request.cookies.get('oauth_state')?.value;
  if (!state || !cookieState || state !== cookieState) {
    return loginRedirect('oauth_state_mismatch');
  }

  if (!code) {
    return loginRedirect('oauth_no_code');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return loginRedirect('oauth_not_configured');
  }

  const redirectUri = `${origin}/api/auth/callback/google`;

  let tokenData: GoogleTokenResponse;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('[Google OAuth] Token exchange error:', errBody);
      return loginRedirect('oauth_token_exchange_failed');
    }

    tokenData = await tokenRes.json();
  } catch (err) {
    console.error('[Google OAuth] Token fetch error:', err);
    return loginRedirect('oauth_network_error');
  }

  let googleUser: GoogleUserInfo;
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      console.error('[Google OAuth] Userinfo fetch error:', await userRes.text());
      return loginRedirect('oauth_userinfo_failed');
    }

    googleUser = await userRes.json();
  } catch (err) {
    console.error('[Google OAuth] Userinfo network error:', err);
    return loginRedirect('oauth_network_error');
  }

  const email = googleUser.email?.trim().toLowerCase();
  if (!email) {
    return loginRedirect('oauth_no_email');
  }

  try {
    const existing = await db.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true },
    });

    let userId: string;

    if (existing) {
      userId = existing.id;
      if (!existing.emailVerified) {
        await db.user.update({
          where: { id: existing.id },
          data: {
            emailVerified: true,
            emailVerifiedAt: new Date(),
          },
        });
      }
    } else {
      const firstName = (googleUser.given_name || googleUser.name?.split(' ')[0] || 'User').trim();
      const lastName = (googleUser.family_name || googleUser.name?.split(' ').slice(1).join(' ') || '').trim();

      const created = await db.user.create({
        data: {
          email,
          firstName,
          lastName,
          role: SELF_SIGNUP_ROLE,
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });
      userId = created.id;
    }

    const session = buildSessionCookie(userId);
    const destination = new URL('/', origin);
    const response = NextResponse.redirect(destination);
    response.cookies.set(session.name, session.value, session.options);
    response.cookies.delete('oauth_state');
    return response;
  } catch (err) {
    console.error('[Google OAuth] Database error:', err);
    return loginRedirect('oauth_database_error');
  }
}
