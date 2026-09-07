import { NextResponse, type NextRequest } from 'next/server';

/**
 * Redirect gate. Bounces requests with no Supabase auth cookie to /login.
 *
 * This checks only that a session cookie is PRESENT. It cannot verify the HMAC
 * signature or read the database — proxy runs before render and may execute at
 * a CDN edge. The actual authorisation boundary is getSessionUser()/
 * requireAdmin(), which verify the signature and re-check the user row, and
 * which every Server Action invokes. Treat this purely as a UX convenience.
 *
 * (Named `proxy`, not `middleware` — that convention is deprecated in Next 16.)
 */

const PUBLIC_PATHS = ['/login', '/signup', '/verify', '/forgot-password', '/reset-password'];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Our own signed session cookie — see lib/auth.ts. */
function hasSession(request: NextRequest) {
  return request.cookies.has('easydel_session');
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  if (!hasSession(request)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpg|jpeg|svg|ico|webp|css|js|map)$).*)',
  ],
};
