import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBearerUser } from '@/lib/auth';
import { normalizeShareInput } from '@/lib/share-code';
import { resolveSharedLocationForUser } from '@/lib/route-sharing';

/**
 * Saves a shared route or shared location by 8-char code into the
 * authenticated mobile user's account.
 */
export async function POST(request: Request) {
  const user = await getBearerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to save this route or location.' }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = (await request.json()) as { code?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const code = normalizeShareInput(String(body.code ?? ''));
  if (!code) {
    return NextResponse.json({ error: 'Valid share code is required.' }, { status: 400 });
  }

  const route = await db.route.findUnique({
    where: { shareCode: code },
    select: { id: true, name: true, status: true, createdById: true, shareCode: true },
  });

  if (route) {
    if (route.status === 'ARCHIVED') {
      return NextResponse.json({ error: 'This route was archived by its creator.' }, { status: 410 });
    }
    if (route.createdById !== user.id) {
      await db.savedRoute.upsert({
        where: { userId_routeId: { userId: user.id, routeId: route.id } },
        update: {},
        create: { userId: user.id, routeId: route.id },
      });
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'ROUTE_SAVED',
          entityType: 'Route',
          entityId: route.id,
          newValue: route.name,
          reason: `Saved from mobile app via code ${code}`,
        },
      });
    }
    return NextResponse.json({ ok: true, kind: 'route', id: route.id, name: route.name });
  }

  const location = await db.deliveryLocation.findUnique({
    where: { shareCode: code },
    select: { id: true },
  });

  if (location) {
    const resolved = await resolveSharedLocationForUser(location.id, user.id);
    if (resolved.error || !resolved.location) {
      return NextResponse.json({ error: resolved.error ?? 'Could not save location.' }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      kind: 'location',
      id: resolved.location.id,
      name: resolved.location.name,
      shareCode: resolved.location.shareCode,
    });
  }

  return NextResponse.json({ error: `No route or location found for code “${code}”.` }, { status: 404 });
}

/** Removes a saved shared route from the user's mobile list without touching the original. */
export async function DELETE(request: Request) {
  const user = await getBearerUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const url = new URL(request.url);
  const routeId = url.searchParams.get('routeId')?.trim() ?? '';
  if (!routeId) return NextResponse.json({ error: 'routeId required.' }, { status: 400 });

  await db.savedRoute.deleteMany({ where: { userId: user.id, routeId } });
  return NextResponse.json({ ok: true });
}
