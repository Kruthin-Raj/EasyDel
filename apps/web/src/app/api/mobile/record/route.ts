import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBearerUser } from '@/lib/auth';
import { allocateUniqueShareCode } from '@/lib/route-sharing';
import { haversine, isValidCoord, optimizeRoute, refineWithOsrm, type Point } from '@/lib/optimize';

export const dynamic = 'force-dynamic';

/** Returns the active recording session (if any) with its checkpoints. */
export async function GET(request: Request) {
  const user = await getBearerUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const session = await db.trainingSession.findFirst({
    where: { recordedById: user.id, status: 'RECORDING' },
    include: { checkpoints: { orderBy: { sequence: 'asc' } } },
  });

  return NextResponse.json({ session });
}

/** Handles recording lifecycle: start round, add checkpoint, finish & generate route, or abandon. */
export async function POST(request: Request) {
  const user = await getBearerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to record routes.' }, { status: 401 });
  }

  let body: {
    action: 'start' | 'checkpoint' | 'finish' | 'abandon';
    sessionId?: string;
    routeName?: string;
    latitude?: number;
    longitude?: number;
    name?: string;
    address?: string;
    floor?: string;
    unit?: string;
    deliveryType?: string;
    quantity?: number;
    notes?: string;
    nextVisitNote?: string;
    entranceInstructions?: string;
    securityInstructions?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (body.action === 'start') {
    const existing = await db.trainingSession.findFirst({
      where: { recordedById: user.id, status: 'RECORDING' },
      include: { checkpoints: { orderBy: { sequence: 'asc' } } },
    });
    if (existing) return NextResponse.json({ session: existing });

    const routeName = String(body.routeName ?? '').trim().slice(0, 120) || 'Recorded Round';
    const lat = isValidCoord(Number(body.latitude), Number(body.longitude)) ? Number(body.latitude) : 13.6288;
    const lng = isValidCoord(Number(body.latitude), Number(body.longitude)) ? Number(body.longitude) : 79.4192;

    const session = await db.trainingSession.create({
      data: {
        routeName,
        mentorId: user.id,
        traineeId: user.id,
        recordedById: user.id,
        status: 'RECORDING',
        geometry: JSON.stringify([[lng, lat]]),
      },
      include: { checkpoints: true },
    });
    return NextResponse.json({ session });
  }

  const session = await db.trainingSession.findUnique({
    where: { id: String(body.sessionId ?? '') },
    include: { checkpoints: { orderBy: { sequence: 'asc' } } },
  });
  if (!session || session.recordedById !== user.id) {
    return NextResponse.json({ error: 'Recording session not found.' }, { status: 404 });
  }

  if (body.action === 'abandon') {
    await db.trainingSession.update({
      where: { id: session.id },
      data: { status: 'ABANDONED', endedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'checkpoint') {
    if (session.status !== 'RECORDING') {
      return NextResponse.json({ error: 'Session is already finished.' }, { status: 400 });
    }
    const name = String(body.name ?? '').trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: 'House or stop name is required.' }, { status: 400 });

    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    if (!isValidCoord(lat, lng)) {
      return NextResponse.json({ error: 'Valid GPS coordinates are required.' }, { status: 400 });
    }

    const cp = await db.trainingCheckpoint.create({
      data: {
        trainingSessionId: session.id,
        name,
        address: String(body.address ?? '').trim() || name,
        latitude: lat,
        longitude: lng,
        deliveryType: body.deliveryType?.trim() || 'Newspaper',
        quantity: Math.max(1, Math.floor(Number(body.quantity) || 1)),
        floor: body.floor?.trim() || null,
        unit: body.unit?.trim() || null,
        notes: body.notes?.trim() || null,
        nextVisitNote: body.nextVisitNote?.trim() || null,
        entranceInstructions: body.entranceInstructions?.trim() || null,
        securityInstructions: body.securityInstructions?.trim() || null,
        sequence: session.checkpoints.length + 1,
        completedAt: new Date(),
      },
    });

    const updated = await db.trainingSession.findUnique({
      where: { id: session.id },
      include: { checkpoints: { orderBy: { sequence: 'asc' } } },
    });
    return NextResponse.json({ ok: true, checkpoint: cp, session: updated });
  }

  // finish -> finalize session and convert to optimised shareable Route
  if (session.checkpoints.length === 0) {
    return NextResponse.json({ error: 'Record at least 1 house before generating a route.' }, { status: 400 });
  }

  const existing = await db.deliveryLocation.findMany({
    where: { createdById: user.id, status: { in: ['ACTIVE', 'PAUSED'] } },
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  const locationIds: string[] = [];
  for (const cp of session.checkpoints) {
    const near = existing.find(
      (l) => haversine({ lat: cp.latitude, lng: cp.longitude }, { lat: l.latitude, lng: l.longitude }) < 40 && l.name === cp.name,
    );
    if (near) {
      locationIds.push(near.id);
      continue;
    }
    const locShare = await allocateUniqueShareCode();
    const created = await db.deliveryLocation.create({
      data: {
        name: cp.name,
        buildingName: cp.name,
        address: cp.address,
        latitude: cp.latitude,
        longitude: cp.longitude,
        notes: cp.notes,
        nextVisitNote: cp.nextVisitNote,
        floor: cp.floor,
        unit: cp.unit,
        entranceInstructions: cp.entranceInstructions,
        securityInstructions: cp.securityInstructions,
        shareCode: locShare,
        createdById: user.id,
      },
    });
    await db.subscription.create({
      data: {
        deliveryLocationId: created.id,
        customerId: cp.name,
        productType: cp.deliveryType || 'Package',
        quantity: cp.quantity ?? 1,
        frequency: 'DAILY',
      },
    });
    locationIds.push(created.id);
  }

  const locs = await db.deliveryLocation.findMany({
    where: { id: { in: locationIds } },
    select: { id: true, name: true, latitude: true, longitude: true },
  });
  const first = session.checkpoints[0];
  const start: Point = { id: 'start', name: 'Start', lat: first.latitude, lng: first.longitude };
  const optimized = await refineWithOsrm(
    optimizeRoute(start, start, locs.map((l) => ({ id: l.id, name: l.name, lat: l.latitude, lng: l.longitude }))),
  );
  const routeCode = await allocateUniqueShareCode();

  const route = await db.route.create({
    data: {
      name: session.routeName,
      shareCode: routeCode,
      status: 'ACTIVE',
      createdById: user.id,
      approvedById: user.id,
    },
  });

  const version = await db.routeVersion.create({
    data: {
      routeId: route.id,
      versionNumber: 1,
      startLocationName: 'Start',
      startLatitude: start.lat,
      startLongitude: start.lng,
      endLocationName: 'Start',
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

  await db.trainingSession.update({
    where: { id: session.id },
    data: { status: 'COMPLETED', endedAt: new Date(), generatedRouteId: route.id },
  });

  return NextResponse.json({ ok: true, routeId: route.id, routeName: route.name, shareCode: routeCode });
}
