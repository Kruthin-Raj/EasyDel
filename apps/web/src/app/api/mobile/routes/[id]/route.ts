import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBearerUser } from '@/lib/auth';
import { allocateUniqueShareCode, resolveSharedLocationForUser } from '@/lib/route-sharing';
import { normalizeShareInput } from '@/lib/share-code';
import { parseMapLink, resolveShortLink } from '@/lib/map-links';
import { haversine, isValidCoord, optimizeRoute, refineWithOsrm, type Point } from '@/lib/optimize';

export const dynamic = 'force-dynamic';

/** Edits an owned route (rename, add stop by link/code/location, remove stop, re-optimise). */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getBearerUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const { id } = await context.params;
  const route = await db.route.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
        include: { stops: { orderBy: { sequence: 'asc' }, include: { deliveryLocation: true } } },
      },
    },
  });

  if (!route) return NextResponse.json({ error: 'Route not found.' }, { status: 404 });
  if (route.createdById !== user.id) {
    return NextResponse.json({ error: 'Only the creator can edit this route.' }, { status: 403 });
  }
  const latest = route.versions[0];
  if (!latest) return NextResponse.json({ error: 'Route has no version.' }, { status: 400 });

  let body: {
    action: 'rename' | 'add_link' | 'add_code' | 'add_location' | 'remove_stop' | 'reoptimise';
    name?: string;
    link?: string;
    code?: string;
    locationId?: string;
    stopId?: string;
    productType?: string;
    quantity?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (body.action === 'rename') {
    const name = String(body.name ?? '').trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    await db.route.update({ where: { id }, data: { name } });
    return NextResponse.json({ ok: true, name });
  }

  let nextIds = latest.stops.map((s) => s.deliveryLocationId);

  if (body.action === 'remove_stop') {
    nextIds = latest.stops.filter((s) => s.id !== body.stopId).map((s) => s.deliveryLocationId);
    if (nextIds.length === 0) {
      await db.route.update({ where: { id }, data: { status: 'ARCHIVED' } });
      return NextResponse.json({ ok: true, archived: true });
    }
  } else if (body.action === 'reoptimise') {
    nextIds = latest.stops
      .filter((s) => s.deliveryLocation.status === 'ACTIVE')
      .map((s) => s.deliveryLocationId);
    if (nextIds.length === 0) {
      return NextResponse.json({ error: 'No active stops remain to re-optimise.' }, { status: 400 });
    }
  } else if (body.action === 'add_location') {
    const loc = await db.deliveryLocation.findUnique({ where: { id: String(body.locationId ?? '') } });
    if (!loc || loc.createdById !== user.id) {
      return NextResponse.json({ error: 'Location not found.' }, { status: 404 });
    }
    if (!nextIds.includes(loc.id)) nextIds.push(loc.id);
  } else if (body.action === 'add_code') {
    const code = normalizeShareInput(String(body.code ?? ''));
    if (!code) return NextResponse.json({ error: 'Invalid location code.' }, { status: 400 });
    const shared = await db.deliveryLocation.findUnique({ where: { shareCode: code }, select: { id: true } });
    if (!shared) return NextResponse.json({ error: `No location found for “${code}”.` }, { status: 404 });
    const resolved = await resolveSharedLocationForUser(shared.id, user.id);
    if (resolved.error || !resolved.location) {
      return NextResponse.json({ error: resolved.error ?? 'Could not import location.' }, { status: 400 });
    }
    if (!nextIds.includes(resolved.location.id)) nextIds.push(resolved.location.id);
  } else if (body.action === 'add_link') {
    const raw = String(body.link ?? '').trim();
    let parsed = parseMapLink(raw);
    if (parsed.needsResolution) parsed = await resolveShortLink(raw);
    if (parsed.latitude === null || parsed.longitude === null || !isValidCoord(parsed.latitude, parsed.longitude)) {
      return NextResponse.json({ error: parsed.error ?? 'Could not read coords from link.' }, { status: 400 });
    }
    const existing = await db.deliveryLocation.findMany({
      where: { createdById: user.id, status: { in: ['ACTIVE', 'PAUSED'] } },
      select: { id: true, latitude: true, longitude: true },
    });
    const near = existing.find(
      (l) => haversine({ lat: parsed.latitude!, lng: parsed.longitude! }, { lat: l.latitude, lng: l.longitude }) < 40,
    );
    let locId = near?.id;
    if (!locId) {
      const shareCode = await allocateUniqueShareCode();
      const created = await db.deliveryLocation.create({
        data: {
          name: body.name?.trim() || parsed.name || `${parsed.latitude.toFixed(4)}, ${parsed.longitude.toFixed(4)}`,
          address: `${parsed.latitude.toFixed(5)}, ${parsed.longitude.toFixed(5)}`,
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          shareCode,
          createdById: user.id,
        },
      });
      await db.subscription.create({
        data: {
          deliveryLocationId: created.id,
          customerId: created.name,
          productType: body.productType?.trim() || 'Package',
          quantity: Math.max(1, Math.floor(Number(body.quantity) || 1)),
          frequency: 'DAILY',
        },
      });
      locId = created.id;
    }
    if (!nextIds.includes(locId)) nextIds.push(locId);
  }

  const locs = await db.deliveryLocation.findMany({
    where: { id: { in: nextIds } },
    select: { id: true, name: true, latitude: true, longitude: true },
  });
  const start: Point = {
    id: 'start',
    name: latest.startLocationName ?? 'Start',
    lat: latest.startLatitude ?? locs[0].latitude,
    lng: latest.startLongitude ?? locs[0].longitude,
  };
  const end: Point = {
    id: 'end',
    name: latest.endLocationName ?? start.name,
    lat: latest.endLatitude ?? start.lat,
    lng: latest.endLongitude ?? start.lng,
  };

  const optimized = await refineWithOsrm(
    optimizeRoute(start, end, locs.map((l) => ({ id: l.id, name: l.name, lat: l.latitude, lng: l.longitude }))),
  );

  const version = await db.routeVersion.create({
    data: {
      routeId: id,
      versionNumber: latest.versionNumber + 1,
      startLocationName: start.name,
      startLatitude: start.lat,
      startLongitude: start.lng,
      endLocationName: end.name,
      endLatitude: end.lat,
      endLongitude: end.lng,
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

  return NextResponse.json({ ok: true, versionNumber: version.versionNumber, stopCount: optimized.order.length });
}
