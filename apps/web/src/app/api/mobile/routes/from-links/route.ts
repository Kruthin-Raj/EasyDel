import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBearerUser } from '@/lib/auth';
import { allocateUniqueShareCode } from '@/lib/route-sharing';
import { splitLinks, parseMapLink, resolveShortLink, type ParsedLink } from '@/lib/map-links';
import { haversine, isValidCoord, optimizeRoute, refineWithOsrm, type Point } from '@/lib/optimize';

export const dynamic = 'force-dynamic';

type LinkStopInput = {
  name?: string;
  lat: number;
  lng: number;
  type?: string;
  quantity?: number;
};

/** Parses Google Maps links/coords OR builds an optimised route from parsed stops. */
export async function POST(request: Request) {
  const user = await getBearerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to create routes from links.' }, { status: 401 });
  }

  let body: {
    action?: 'parse' | 'create';
    links?: string;
    routeName?: string;
    stops?: LinkStopInput[];
    startLatitude?: number;
    startLongitude?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (body.action === 'parse') {
    const lines = splitLinks(String(body.links ?? ''));
    if (lines.length === 0) {
      return NextResponse.json({ error: 'Paste at least one Google Maps link or coordinates.' }, { status: 400 });
    }
    if (lines.length > 200) {
      return NextResponse.json({ error: 'Maximum 200 links per batch.' }, { status: 400 });
    }

    const rows: ParsedLink[] = [];
    for (const line of lines) {
      const parsed = parseMapLink(line);
      rows.push(parsed.needsResolution ? await resolveShortLink(line) : parsed);
    }
    return NextResponse.json({ rows });
  }

  const routeName = String(body.routeName ?? '').trim().slice(0, 120);
  if (!routeName) {
    return NextResponse.json({ error: 'Give the route a name.' }, { status: 400 });
  }

  const rawStops = Array.isArray(body.stops) ? body.stops : [];
  const validStops = rawStops
    .map((s, i) => ({
      name: String(s.name ?? '').trim() || `Stop ${i + 1}`,
      lat: Number(s.lat),
      lng: Number(s.lng),
      type: String(s.type ?? '').trim() || 'Package',
      quantity: Math.max(1, Math.floor(Number(s.quantity) || 1)),
    }))
    .filter((s) => isValidCoord(s.lat, s.lng));

  if (validStops.length === 0) {
    return NextResponse.json({ error: 'No valid coordinates found to create stops.' }, { status: 400 });
  }

  const start: Point = isValidCoord(Number(body.startLatitude), Number(body.startLongitude))
    ? { id: 'start', name: 'Start', lat: Number(body.startLatitude), lng: Number(body.startLongitude) }
    : { id: 'start', name: 'Start', lat: validStops[0].lat, lng: validStops[0].lng };

  const existing = await db.deliveryLocation.findMany({
    where: { createdById: user.id, status: { in: ['ACTIVE', 'PAUSED'] } },
    select: { id: true, latitude: true, longitude: true },
  });

  const locationIds: string[] = [];
  for (const row of validStops) {
    const near = existing.find(
      (l) => haversine({ lat: row.lat, lng: row.lng }, { lat: l.latitude, lng: l.longitude }) < 40,
    );
    if (near) {
      locationIds.push(near.id);
      continue;
    }

    const shareCode = await allocateUniqueShareCode();
    const created = await db.deliveryLocation.create({
      data: {
        name: row.name,
        buildingName: row.name,
        address: `${row.lat.toFixed(5)}, ${row.lng.toFixed(5)}`,
        latitude: row.lat,
        longitude: row.lng,
        shareCode,
        createdById: user.id,
      },
    });
    existing.push({ id: created.id, latitude: created.latitude, longitude: created.longitude });
    locationIds.push(created.id);

    await db.subscription.create({
      data: {
        deliveryLocationId: created.id,
        customerId: row.name,
        productType: row.type,
        quantity: row.quantity,
        frequency: 'DAILY',
      },
    });
  }

  const locations = await db.deliveryLocation.findMany({
    where: { id: { in: locationIds } },
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  const optimized = await refineWithOsrm(
    optimizeRoute(
      start,
      start,
      locations.map((l) => ({ id: l.id, name: l.name, lat: l.latitude, lng: l.longitude })),
    ),
  );
  const shareCode = await allocateUniqueShareCode();

  const route = await db.route.create({
    data: {
      name: routeName,
      shareCode,
      status: 'ACTIVE',
      createdById: user.id,
      approvedById: user.id,
    },
  });

  const version = await db.routeVersion.create({
    data: {
      routeId: route.id,
      versionNumber: 1,
      startLocationName: start.name,
      startLatitude: start.lat,
      startLongitude: start.lng,
      endLocationName: start.name,
      endLatitude: start.lat,
      endLongitude: start.lng,
      totalDistance: optimized.totalDistance,
      estimatedDuration: Math.round(optimized.estimatedDuration),
      routeGeometry: optimized.geometry ? JSON.stringify(optimized.geometry) : null,
    },
  });

  await db.routeStop.createMany({
    data: optimized.order.map((p, i) => ({
      routeVersionId: version.id,
      deliveryLocationId: p.id,
      sequence: i + 1,
      distanceFromPrevious: optimized.legs[i]?.distance ?? null,
      durationFromPrevious: Math.round(optimized.legs[i]?.duration ?? 0),
    })),
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'ROUTE_CREATED',
      entityType: 'Route',
      entityId: route.id,
      newValue: route.name,
      reason: `Built from ${validStops.length} map link(s) on mobile`,
    },
  });

  return NextResponse.json({ ok: true, id: route.id, name: route.name, shareCode });
}
