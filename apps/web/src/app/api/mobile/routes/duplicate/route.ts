import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBearerUser } from '@/lib/auth';
import { allocateUniqueShareCode, canAccessRoute } from '@/lib/route-sharing';
import { normalizeShareInput } from '@/lib/share-code';

export const dynamic = 'force-dynamic';

/** Clones an accessible or shared route into a brand-new editable route owned by the mobile user. */
export async function POST(request: Request) {
  const user = await getBearerUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  let body: { routeId?: string; shareCode?: string; name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const routeId = String(body.routeId ?? '').trim();
  const normalized = body.shareCode ? normalizeShareInput(body.shareCode) : null;

  const source = routeId
    ? await db.route.findUnique({
        where: { id: routeId },
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            include: { stops: { orderBy: { sequence: 'asc' } } },
          },
        },
      })
    : normalized
      ? await db.route.findUnique({
          where: { shareCode: normalized },
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
              include: { stops: { orderBy: { sequence: 'asc' } } },
            },
          },
        })
      : null;

  if (!source) return NextResponse.json({ error: 'Source route not found.' }, { status: 404 });

  const hasAccess =
    (await canAccessRoute(user.id, source.id)) ||
    (normalized !== null && source.shareCode === normalized);
  if (!hasAccess) {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  }

  const latest = source.versions[0];
  if (!latest) return NextResponse.json({ error: 'Route has no stops version.' }, { status: 400 });

  const newName = (body.name?.trim() || `${source.name} (Copy)`).slice(0, 120);
  const shareCode = await allocateUniqueShareCode();

  const created = await db.route.create({
    data: {
      name: newName,
      shareCode,
      status: 'ACTIVE',
      createdById: user.id,
      approvedById: user.id,
    },
  });

  const version = await db.routeVersion.create({
    data: {
      routeId: created.id,
      versionNumber: 1,
      startLocationName: latest.startLocationName,
      startLatitude: latest.startLatitude,
      startLongitude: latest.startLongitude,
      endLocationName: latest.endLocationName,
      endLatitude: latest.endLatitude,
      endLongitude: latest.endLongitude,
      totalDistance: latest.totalDistance,
      estimatedDuration: latest.estimatedDuration,
      routeGeometry: latest.routeGeometry,
    },
  });

  if (latest.stops.length > 0) {
    await db.routeStop.createMany({
      data: latest.stops.map((s) => ({
        routeVersionId: version.id,
        deliveryLocationId: s.deliveryLocationId,
        sequence: s.sequence,
        distanceFromPrevious: s.distanceFromPrevious,
        durationFromPrevious: s.durationFromPrevious,
      })),
    });
  }

  return NextResponse.json({ ok: true, id: created.id, name: created.name, shareCode });
}
