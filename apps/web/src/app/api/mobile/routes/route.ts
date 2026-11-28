import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBearerUser } from '@/lib/auth';
import {
  deliveryWhere,
  issueWhere,
  locationWhere,
  routeWhere,
  runWhere,
  trainingWhere,
} from '@/lib/scope';
import { ensureLocationShareCode, ensureRouteShareCode, allocateUniqueShareCode } from '@/lib/route-sharing';
import { parseUserPreferences, loadSettings } from '@/lib/permissions';
import { isValidCoord, optimizeRoute, refineWithOsrm, type Point } from '@/lib/optimize';
import { signedPhotoUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Full mobile workspace payload: synced routes, locations, dashboard counts,
 * recent deliveries, recorded rounds, delivery runs, issues, and user prefs.
 */
export async function GET(request: Request) {
  const user = await getBearerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const dScope = deliveryWhere(user);
  const rScope = await routeWhere(user);
  const lScope = locationWhere(user);
  const tScope = trainingWhere(user);
  const iScope = issueWhere(user);
  const rnScope = runWhere(user);

  const [
    rawRoutes,
    rawLocations,
    deliveredCount,
    savedSharedCount,
    trainingRoundsCount,
    openIssuesCount,
    recentDeliveriesRaw,
    recordedRoundsRaw,
    runsRaw,
    issuesRaw,
    settings,
  ] = await Promise.all([
    db.route.findMany({
      where: { ...rScope, status: { not: 'ARCHIVED' } },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: {
            stops: {
              orderBy: { sequence: 'asc' },
              include: {
                deliveryLocation: {
                  include: { subscriptions: { where: { status: 'ACTIVE' } } },
                },
              },
            },
          },
        },
      },
    }),
    db.deliveryLocation.findMany({
      where: { ...lScope, status: { in: ['ACTIVE', 'PAUSED'] } },
      orderBy: { name: 'asc' },
      take: 200,
      include: { subscriptions: { where: { status: 'ACTIVE' } } },
    }),
    db.delivery.count({ where: { ...dScope, status: 'DELIVERED' } }),
    db.savedRoute.count({ where: { userId: user.id } }),
    db.trainingSession.count({ where: tScope }),
    db.issue.count({ where: { ...iScope, status: 'OPEN' } }),
    db.delivery.findMany({
      where: dScope,
      take: 12,
      orderBy: { updatedAt: 'desc' },
      include: { subscription: { include: { deliveryLocation: true } } },
    }),
    db.trainingSession.findMany({
      where: tScope,
      take: 15,
      orderBy: { startedAt: 'desc' },
      include: { _count: { select: { checkpoints: true } } },
    }),
    db.routeRun.findMany({
      where: rnScope,
      take: 15,
      orderBy: { startedAt: 'desc' },
      include: {
        routeVersion: {
          select: { routeId: true, route: { select: { name: true } }, _count: { select: { stops: true } } },
        },
        deliveries: { select: { status: true } },
      },
    }),
    db.issue.findMany({
      where: iScope,
      take: 15,
      orderBy: { createdAt: 'desc' },
    }),
    loadSettings(),
  ]);

  const routes = await Promise.all(
    rawRoutes.map(async (route) => {
      const shareCode = route.shareCode ?? (await ensureRouteShareCode(route.id));
      const latest = route.versions[0];
      const stops = latest
        ? await Promise.all(
            latest.stops.map(async (s) => {
              const loc = s.deliveryLocation;
              const photoUrl = await signedPhotoUrl(loc.photo);
              const items = loc.subscriptions.map((sub) => ({
                subscriptionId: sub.id,
                customer: sub.customerId,
                productType: sub.productType,
                quantity: sub.quantity,
                specialInstructions: sub.specialInstructions,
              }));
              return {
                id: s.id,
                routeVersionId: latest.id,
                locationId: loc.id,
                locationShareCode: loc.shareCode,
                sequence: s.sequence,
                name: loc.name,
                address: loc.address,
                latitude: loc.latitude,
                longitude: loc.longitude,
                floor: loc.floor,
                unit: loc.unit,
                notes: loc.notes,
                nextVisitNote: loc.nextVisitNote,
                entranceInstructions: loc.entranceInstructions,
                securityInstructions: loc.securityInstructions,
                photoUrl,
                totalItems: items.reduce((n, x) => n + x.quantity, 0),
                items,
              };
            }),
          )
        : [];

      const routeGeometry: number[][] | null = latest?.routeGeometry
        ? (() => {
            try {
              const parsed = JSON.parse(latest.routeGeometry);
              return Array.isArray(parsed?.coordinates) ? (parsed.coordinates as number[][]) : null;
            } catch {
              return null;
            }
          })()
        : null;

      return {
        id: route.id,
        name: route.name,
        shareCode,
        isOwner: route.createdById === user.id,
        creatorName: `${route.createdBy.firstName} ${route.createdBy.lastName}`.trim(),
        versionId: latest?.id ?? null,
        totalDistance: latest?.totalDistance ?? null,
        estimatedDuration: latest?.estimatedDuration ?? null,
        routeGeometry,
        startPoint:
          latest?.startLatitude != null && latest?.startLongitude != null
            ? {
                name: latest.startLocationName ?? 'Start',
                latitude: latest.startLatitude,
                longitude: latest.startLongitude,
              }
            : null,
        endPoint:
          latest?.endLatitude != null && latest?.endLongitude != null
            ? {
                name: latest.endLocationName ?? 'End',
                latitude: latest.endLatitude,
                longitude: latest.endLongitude,
              }
            : null,
        stops,
      };
    }),
  );

  const locations = await Promise.all(
    rawLocations.map(async (loc) => ({
      id: loc.id,
      name: loc.name,
      address: loc.address,
      latitude: loc.latitude,
      longitude: loc.longitude,
      status: loc.status,
      shareCode: loc.shareCode ?? (await ensureLocationShareCode(loc.id)),
      floor: loc.floor,
      unit: loc.unit,
      notes: loc.notes,
      nextVisitNote: loc.nextVisitNote,
      entranceInstructions: loc.entranceInstructions,
      securityInstructions: loc.securityInstructions,
      activeItems: loc.subscriptions.reduce((s, sub) => s + sub.quantity, 0),
      subscriptions: loc.subscriptions.map((sub) => ({
        id: sub.id,
        productType: sub.productType,
        quantity: sub.quantity,
      })),
    })),
  );

  return NextResponse.json({
    routes,
    locations,
    dashboardStats: {
      myRoutesCount: routes.length,
      locationsCount: locations.filter((l) => l.status === 'ACTIVE').length,
      deliveredCount,
      savedSharedCount,
      trainingRoundsCount,
      openIssuesCount,
    },
    recentDeliveries: recentDeliveriesRaw.map((d) => ({
      id: d.id,
      locationName: d.subscription.deliveryLocation.name,
      customer: d.subscription.customerId,
      productType: d.subscription.productType,
      quantity: d.quantity,
      status: d.status,
      timestamp: (d.timestamp ?? d.updatedAt).toISOString(),
    })),
    recordedRounds: recordedRoundsRaw.map((r) => ({
      id: r.id,
      routeName: r.routeName,
      status: r.status,
      checkpointCount: r._count.checkpoints,
      generatedRouteId: r.generatedRouteId,
      startedAt: r.startedAt.toISOString(),
    })),
    runs: runsRaw.map((run) => ({
      id: run.id,
      routeId: run.routeVersion.routeId,
      routeName: run.routeVersion.route.name,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      endedAt: run.endedAt?.toISOString() ?? null,
      totalStops: run.routeVersion._count.stops,
      delivered: run.deliveries.filter((d) => d.status === 'DELIVERED').length,
      skipped: run.deliveries.filter((d) => d.status === 'SKIPPED').length,
      failed: run.deliveries.filter((d) => d.status === 'FAILED').length,
    })),
    issues: issuesRaw.map((iss) => ({
      id: iss.id,
      category: iss.category,
      description: iss.description,
      status: iss.status,
      createdAt: iss.createdAt.toISOString(),
    })),
    preferences: parseUserPreferences(settings, user.id),
    syncedAt: new Date().toISOString(),
  });
}

/** Creates an optimised route from selected saved location IDs. */
export async function POST(request: Request) {
  const user = await getBearerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to create a route.' }, { status: 401 });
  }

  let body: {
    name?: string;
    locationIds?: string[];
    startName?: string;
    startLatitude?: number;
    startLongitude?: number;
    endSameAsStart?: boolean;
    endName?: string;
    endLatitude?: number;
    endLongitude?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: 'Route name is required.' }, { status: 400 });

  const selected = Array.isArray(body.locationIds) ? body.locationIds.filter(Boolean) : [];
  const locations = await db.deliveryLocation.findMany({
    where: selected.length
      ? { id: { in: selected }, createdById: user.id, status: 'ACTIVE' }
      : { createdById: user.id, status: 'ACTIVE' },
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  if (locations.length === 0) {
    return NextResponse.json(
      { error: 'Pick at least one active location to create a route.' },
      { status: 400 },
    );
  }

  // Ensure every location in the route has at least one active subscription
  for (const loc of locations) {
    const subCount = await db.subscription.count({
      where: { deliveryLocationId: loc.id, status: 'ACTIVE' },
    });
    if (subCount === 0) {
      await db.subscription.create({
        data: {
          deliveryLocationId: loc.id,
          customerId: loc.name,
          productType: 'Package',
          quantity: 1,
          frequency: 'DAILY',
          status: 'ACTIVE',
        },
      });
    }
  }

  const startLat = Number(body.startLatitude ?? locations[0].latitude);
  const startLng = Number(body.startLongitude ?? locations[0].longitude);
  const endSame = body.endSameAsStart !== false;
  const endLat = endSame ? startLat : Number(body.endLatitude ?? startLat);
  const endLng = endSame ? startLng : Number(body.endLongitude ?? startLng);

  if (!isValidCoord(startLat, startLng) || !isValidCoord(endLat, endLng)) {
    return NextResponse.json({ error: 'Start/end coordinates must be valid.' }, { status: 400 });
  }

  const start: Point = { id: 'start', name: body.startName?.trim() || 'Start', lat: startLat, lng: startLng };
  const end: Point = { id: 'end', name: body.endName?.trim() || start.name, lat: endLat, lng: endLng };

  const optimized = await refineWithOsrm(
    optimizeRoute(
      start,
      end,
      locations.map((l) => ({ id: l.id, name: l.name, lat: l.latitude, lng: l.longitude })),
    ),
  );
  const shareCode = await allocateUniqueShareCode();

  const route = await db.route.create({
    data: {
      name,
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

  await db.auditLog.create({
    data: { userId: user.id, action: 'ROUTE_CREATED', entityType: 'Route', entityId: route.id, newValue: name },
  });

  return NextResponse.json({ ok: true, id: route.id, name: route.name, shareCode });
}
