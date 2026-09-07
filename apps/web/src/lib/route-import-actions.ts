'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from './db';
import { requireCapability } from './permissions';
import { splitLinks, parseMapLink, resolveShortLink, type ParsedLink } from './map-links';
import { optimizeRoute, refineWithOsrm, haversine, isValidCoord, type Point } from './optimize';

/*
 * Building a route from pasted map links.
 *
 * The driver shares each house out of Google Maps, pastes the collected links
 * here, checks the preview, and gets a round-trip route back.
 *
 * Nothing is written until the preview is confirmed — parsing and creating are
 * deliberately separate steps so a mis-parsed link is caught by a human before
 * it becomes a delivery location.
 */

export type ImportState = {
  error?: string;
  success?: string;
  info?: string;
  rows?: ParsedLink[];
} | null;

const MAX_LINKS = 200;

/** Step one: parse the pasted blob and return a preview. Writes nothing. */
export async function parseLinksAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireCapability('import_map_links');

  const blob = String(formData.get('links') ?? '');
  const lines = splitLinks(blob);

  if (lines.length === 0) return { error: 'Paste at least one map link or coordinate pair.' };
  if (lines.length > MAX_LINKS) {
    return { error: `That is ${lines.length} lines — the limit is ${MAX_LINKS} at a time.` };
  }

  const rows: ParsedLink[] = [];
  for (const line of lines) {
    const parsed = parseMapLink(line);

    // Short links are expanded one at a time. Sequential on purpose: firing
    // 50 requests at Google in parallel is a good way to get rate-limited.
    if (parsed.needsResolution) {
      rows.push(await resolveShortLink(line));
    } else {
      rows.push(parsed);
    }
  }

  const usable = rows.filter((r) => r.latitude !== null).length;
  const failed = rows.length - usable;

  return {
    rows,
    info:
      failed === 0
        ? `Recognised all ${usable} location${usable === 1 ? '' : 's'}.`
        : `Recognised ${usable} of ${rows.length}. ${failed} could not be read — see the reason on each row.`,
  };
}

/**
 * Step two: create locations and a round-trip route from the confirmed rows.
 *
 * The names and quantities come back from the preview form, so anything the
 * driver corrected on screen is what gets saved.
 */
export async function createRouteFromLinksAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireCapability('create_routes');

  const routeName = String(formData.get('routeName') ?? '').trim().slice(0, 120);
  if (!routeName) return { error: 'Give the route a name.' };

  const names = formData.getAll('stopName').map(String);
  const lats = formData.getAll('stopLat').map(Number);
  const lngs = formData.getAll('stopLng').map(Number);
  const types = formData.getAll('stopType').map(String);
  const quantities = formData.getAll('stopQty').map((q) => Number(q) || 1);
  const includes = formData.getAll('stopInclude').map(String);

  const rows = names
    .map((name, i) => ({
      name: name.trim() || `Stop ${i + 1}`,
      lat: lats[i],
      lng: lngs[i],
      type: types[i]?.trim() || 'Package',
      quantity: quantities[i] > 0 ? Math.floor(quantities[i]) : 1,
      included: includes.includes(String(i)),
    }))
    .filter((r) => r.included && isValidCoord(r.lat, r.lng));

  if (rows.length === 0) {
    return { error: 'No usable stops were selected. Tick at least one row with valid coordinates.' };
  }

  const startLat = Number(formData.get('startLatitude'));
  const startLng = Number(formData.get('startLongitude'));

  // Round trip: start and end are the same point. Prefer the driver's current
  // position; fall back to the first stop when the browser gave us nothing.
  const start: Point = isValidCoord(startLat, startLng)
    ? { id: 'start', name: 'Start', lat: startLat, lng: startLng }
    : { id: 'start', name: 'Start', lat: rows[0].lat, lng: rows[0].lng };

  const existing = await db.deliveryLocation.findMany({
    where: { status: { in: ['ACTIVE', 'PAUSED'] } },
    select: { id: true, latitude: true, longitude: true },
  });

  const locationIds: string[] = [];
  let reused = 0;

  for (const row of rows) {
    // Reuse anything within 40 m rather than creating a second pin on the same
    // doorstep — the spec's duplicate rule.
    const near = existing.find(
      (l) => haversine({ lat: row.lat, lng: row.lng }, { lat: l.latitude, lng: l.longitude }) < 40,
    );

    if (near) {
      locationIds.push(near.id);
      reused++;
      continue;
    }

    const created = await db.deliveryLocation.create({
      data: {
        name: row.name,
        buildingName: row.name,
        // No street address is available from a coordinate link; the position
        // is the truth here, and the name is what the driver recognises.
        address: `${row.lat.toFixed(5)}, ${row.lng.toFixed(5)}`,
        latitude: row.lat,
        longitude: row.lng,
      },
    });
    existing.push({ id: created.id, latitude: created.latitude, longitude: created.longitude });
    locationIds.push(created.id);

    // Without a subscription the stop would be filtered out of route
    // generation as having nothing to deliver.
    await db.subscription.create({
      data: {
        deliveryLocationId: created.id,
        customerId: row.name,
        productType: row.type,
        quantity: row.quantity,
        frequency: 'DAILY',
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOCATION_CREATED',
        entityType: 'DeliveryLocation',
        entityId: created.id,
        newValue: created.name,
        reason: 'Imported from a pasted map link',
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
      start, // round trip
      locations.map((l) => ({ id: l.id, name: l.name, lat: l.latitude, lng: l.longitude })),
    ),
  );

  const driverProfile = await db.driverProfile.findUnique({ where: { userId: user.id } });

  const route = await db.route.create({
    data: {
      name: routeName,
      status: 'ACTIVE',
      createdById: user.id,
      approvedById: user.role === 'ADMIN' ? user.id : null,
      // Assign to the creator when they are a driver, so they can run it
      // immediately without waiting for an admin.
      driverId: driverProfile?.id ?? null,
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

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'ROUTE_CREATED',
      entityType: 'Route',
      entityId: route.id,
      newValue: routeName,
      reason: `Built from ${rows.length} pasted link${rows.length === 1 ? '' : 's'}${
        reused ? `, reusing ${reused} existing location${reused === 1 ? '' : 's'}` : ''
      }`,
    },
  });

  revalidatePath('/routes');
  redirect(`/routes/${route.id}`);
}

/**
 * Adds pasted stops to a route that already exists.
 *
 * Creates a NEW RouteVersion rather than editing the current one: the spec
 * requires historical routes to stay intact, and a run recorded against v1 must
 * keep meaning what it meant. The existing stops are carried over and the whole
 * set is re-optimised together, so the new houses are slotted into the right
 * place rather than tacked on the end.
 */
export async function addLinksToRouteAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireCapability('create_routes');

  const routeId = String(formData.get('existingRouteId') ?? '');
  if (!routeId) return { error: 'Choose which route to add these stops to.' };

  const route = await db.route.findUnique({
    where: { id: routeId },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
        include: { stops: { include: { deliveryLocation: true }, orderBy: { sequence: 'asc' } } },
      },
    },
  });
  if (!route) return { error: 'That route no longer exists.' };

  const latest = route.versions[0];
  if (!latest) return { error: 'That route has no version to extend.' };

  // Only the creator, the assigned driver or an admin may reshape a route.
  const driverProfile = await db.driverProfile.findUnique({ where: { userId: user.id } });
  const mayEdit =
    user.role === 'ADMIN' ||
    route.createdById === user.id ||
    (route.driverId !== null && route.driverId === driverProfile?.id);
  if (!mayEdit) {
    return { error: 'You can only add stops to routes you created or are assigned to.' };
  }

  const names = formData.getAll('stopName').map(String);
  const lats = formData.getAll('stopLat').map(Number);
  const lngs = formData.getAll('stopLng').map(Number);
  const types = formData.getAll('stopType').map(String);
  const quantities = formData.getAll('stopQty').map((q) => Number(q) || 1);
  const includes = formData.getAll('stopInclude').map(String);

  const rows = names
    .map((name, i) => ({
      name: name.trim() || `Stop ${i + 1}`,
      lat: lats[i],
      lng: lngs[i],
      type: types[i]?.trim() || 'Package',
      quantity: quantities[i] > 0 ? Math.floor(quantities[i]) : 1,
      included: includes.includes(String(i)),
    }))
    .filter((r) => r.included && isValidCoord(r.lat, r.lng));

  if (rows.length === 0) {
    return { error: 'No usable stops were selected.' };
  }

  const existing = await db.deliveryLocation.findMany({
    where: { status: { in: ['ACTIVE', 'PAUSED'] } },
    select: { id: true, latitude: true, longitude: true },
  });

  const alreadyOnRoute = new Set(latest.stops.map((s) => s.deliveryLocationId));
  const addedIds: string[] = [];
  let skippedDuplicates = 0;

  for (const row of rows) {
    const near = existing.find(
      (l) => haversine({ lat: row.lat, lng: row.lng }, { lat: l.latitude, lng: l.longitude }) < 40,
    );

    if (near) {
      // Already a stop on this route — adding it twice would send the driver
      // to the same door two times.
      if (alreadyOnRoute.has(near.id)) {
        skippedDuplicates++;
        continue;
      }
      addedIds.push(near.id);
      alreadyOnRoute.add(near.id);
      continue;
    }

    const created = await db.deliveryLocation.create({
      data: {
        name: row.name,
        buildingName: row.name,
        address: `${row.lat.toFixed(5)}, ${row.lng.toFixed(5)}`,
        latitude: row.lat,
        longitude: row.lng,
      },
    });
    existing.push({ id: created.id, latitude: created.latitude, longitude: created.longitude });
    addedIds.push(created.id);
    alreadyOnRoute.add(created.id);

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

  if (addedIds.length === 0) {
    return {
      info: `Nothing to add — ${skippedDuplicates} of those stops are already on “${route.name}”.`,
    };
  }

  const allIds = [...latest.stops.map((s) => s.deliveryLocationId), ...addedIds];
  const locations = await db.deliveryLocation.findMany({
    where: { id: { in: allIds } },
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  const start: Point = {
    id: 'start',
    name: latest.startLocationName ?? 'Start',
    lat: latest.startLatitude ?? locations[0].latitude,
    lng: latest.startLongitude ?? locations[0].longitude,
  };
  const end: Point = {
    id: 'end',
    name: latest.endLocationName ?? start.name,
    lat: latest.endLatitude ?? start.lat,
    lng: latest.endLongitude ?? start.lng,
  };

  const optimized = await refineWithOsrm(
    optimizeRoute(
      start,
      end,
      locations.map((l) => ({ id: l.id, name: l.name, lat: l.latitude, lng: l.longitude })),
    ),
  );

  const version = await db.routeVersion.create({
    data: {
      routeId: route.id,
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

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'ROUTE_CHANGED',
      entityType: 'Route',
      entityId: route.id,
      oldValue: `v${latest.versionNumber} (${latest.stops.length} stops)`,
      newValue: `v${version.versionNumber} (${optimized.order.length} stops)`,
      reason: `Added ${addedIds.length} stop(s) from pasted links`,
    },
  });

  revalidatePath('/routes');
  redirect(`/routes/${route.id}`);
}
