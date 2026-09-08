'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from './db';
import { requireUser } from './auth';
import { requireCapability } from './permissions';
import { parseMapLink, resolveShortLink } from './map-links';
import { optimizeRoute, refineWithOsrm, haversine, isValidCoord, type Point } from './optimize';

/*
 * Editing an existing route: add stops, remove stops, re-optimise, delete.
 *
 * Every change that alters the stop list creates a NEW RouteVersion rather than
 * mutating the current one. A run recorded against v1 must keep meaning what it
 * meant, and yesterday's history must not silently change because someone
 * dropped a house this morning.
 */

export type EditState = { error?: string; success?: string; info?: string } | null;

/** Loads a route and checks the caller may reshape it. */
async function editableRoute(routeId: string, userId: string, role: string) {
  const route = await db.route.findUnique({
    where: { id: routeId },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
        include: { stops: { orderBy: { sequence: 'asc' }, include: { deliveryLocation: true } } },
      },
    },
  });
  if (!route) return { error: 'That route no longer exists.' as const, route: null };

  const driverProfile = await db.driverProfile.findUnique({ where: { userId } });
  const mayEdit =
    role === 'ADMIN' ||
    route.createdById === userId ||
    (route.driverId !== null && route.driverId === driverProfile?.id);

  if (!mayEdit) {
    return {
      error: 'You can only change routes you created or are assigned to.' as const,
      route: null,
    };
  }
  return { error: null, route };
}

/**
 * Rebuilds the route as a new version from a given set of location ids.
 *
 * Shared by every edit below so add, remove and re-optimise all produce the
 * same shape of result and identical versioning behaviour.
 */
async function writeNewVersion(
  routeId: string,
  latest: {
    id: string;
    versionNumber: number;
    startLocationName: string | null;
    startLatitude: number | null;
    startLongitude: number | null;
    endLocationName: string | null;
    endLatitude: number | null;
    endLongitude: number | null;
  },
  locationIds: string[],
  userId: string,
  reason: string,
  oldCount: number,
) {
  const locations = await db.deliveryLocation.findMany({
    where: { id: { in: locationIds } },
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  const fallback = locations[0];
  const start: Point = {
    id: 'start',
    name: latest.startLocationName ?? 'Start',
    lat: latest.startLatitude ?? fallback.latitude,
    lng: latest.startLongitude ?? fallback.longitude,
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
      routeId,
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
      userId,
      action: 'ROUTE_CHANGED',
      entityType: 'Route',
      entityId: routeId,
      oldValue: `v${latest.versionNumber} (${oldCount} stops)`,
      newValue: `v${version.versionNumber} (${optimized.order.length} stops)`,
      reason,
    },
  });

  return version;
}

// ------------------------------------------------------------ add stops ----

/** Adds one stop from a pasted map link. */
export async function addStopByLinkAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const user = await requireCapability('import_map_links');
  const routeId = String(formData.get('routeId') ?? '');
  const link = String(formData.get('link') ?? '').trim();
  const nameOverride = String(formData.get('name') ?? '').trim().slice(0, 120);
  const productType = String(formData.get('productType') ?? '').trim().slice(0, 80) || 'Package';
  const quantity = Math.max(1, Math.floor(Number(formData.get('quantity')) || 1));

  if (!link) return { error: 'Paste a map link or a "latitude, longitude" pair.' };

  const { error, route } = await editableRoute(routeId, user.id, user.role);
  if (error || !route) return { error: error ?? 'Route not found.' };

  const latest = route.versions[0];
  if (!latest) return { error: 'That route has no version to extend.' };

  let parsed = parseMapLink(link);
  if (parsed.needsResolution) parsed = await resolveShortLink(link);

  if (parsed.latitude === null || parsed.longitude === null) {
    // Never guess — the spec's rule about silently creating wrong locations.
    return { error: parsed.error ?? 'Could not read a position from that link.' };
  }

  const lat = parsed.latitude;
  const lng = parsed.longitude;

  const existing = await db.deliveryLocation.findMany({
    where: { status: { in: ['ACTIVE', 'PAUSED'] } },
    select: { id: true, name: true, latitude: true, longitude: true },
  });
  const near = existing.find(
    (l) => haversine({ lat, lng }, { lat: l.latitude, lng: l.longitude }) < 40,
  );

  const onRoute = new Set(latest.stops.map((s) => s.deliveryLocationId));
  let locationId: string;

  if (near) {
    if (onRoute.has(near.id)) {
      return { info: `“${near.name}” is already a stop on this route.` };
    }
    locationId = near.id;
  } else {
    const created = await db.deliveryLocation.create({
      data: {
        name: nameOverride || parsed.name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        buildingName: nameOverride || parsed.name || null,
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        latitude: lat,
        longitude: lng,
      },
    });
    // Without a subscription the stop has nothing to deliver and would be
    // filtered out of future route generation.
    await db.subscription.create({
      data: {
        deliveryLocationId: created.id,
        customerId: created.name,
        productType,
        quantity,
        frequency: 'DAILY',
      },
    });
    locationId = created.id;
  }

  const ids = [...latest.stops.map((s) => s.deliveryLocationId), locationId];
  await writeNewVersion(
    routeId,
    latest,
    ids,
    user.id,
    'Added a stop from a pasted link',
    latest.stops.length,
  );

  revalidatePath(`/routes/${routeId}`);
  revalidatePath(`/routes/${routeId}/edit`);
  return { success: 'Stop added and the route re-optimised.' };
}

/** Adds a stop from a location that already exists — a saved checkpoint. */
export async function addStopFromLocationAction(
  _prev: EditState,
  formData: FormData,
): Promise<EditState> {
  const user = await requireCapability('create_routes');
  const routeId = String(formData.get('routeId') ?? '');
  const locationId = String(formData.get('locationId') ?? '');

  if (!locationId) return { error: 'Choose a checkpoint to add.' };

  const { error, route } = await editableRoute(routeId, user.id, user.role);
  if (error || !route) return { error: error ?? 'Route not found.' };

  const latest = route.versions[0];
  if (!latest) return { error: 'That route has no version to extend.' };

  const location = await db.deliveryLocation.findUnique({
    where: { id: locationId },
    include: { subscriptions: { where: { status: 'ACTIVE' } } },
  });
  if (!location) return { error: 'That checkpoint no longer exists.' };

  if (latest.stops.some((s) => s.deliveryLocationId === locationId)) {
    return { info: `“${location.name}” is already a stop on this route.` };
  }

  // A checkpoint with nothing to deliver would be dropped from generation, so
  // give it a default subscription rather than adding a stop that vanishes.
  if (location.subscriptions.length === 0) {
    await db.subscription.create({
      data: {
        deliveryLocationId: location.id,
        customerId: location.name,
        productType: String(formData.get('productType') ?? '').trim() || 'Package',
        quantity: Math.max(1, Math.floor(Number(formData.get('quantity')) || 1)),
        frequency: 'DAILY',
      },
    });
  }

  const ids = [...latest.stops.map((s) => s.deliveryLocationId), locationId];
  await writeNewVersion(
    routeId,
    latest,
    ids,
    user.id,
    `Added existing checkpoint “${location.name}”`,
    latest.stops.length,
  );

  revalidatePath(`/routes/${routeId}`);
  revalidatePath(`/routes/${routeId}/edit`);
  return { success: `Added “${location.name}” and re-optimised.` };
}

// --------------------------------------------------------- remove stops ----

/**
 * Removes a stop from the route.
 *
 * This takes the house off THIS route only. The delivery location, its
 * subscriptions and all its history are untouched — per the spec, removing a
 * stop from a route and cancelling a delivery location are different acts.
 */
export async function removeStopAction(formData: FormData) {
  const user = await requireUser();
  const routeId = String(formData.get('routeId') ?? '');
  const stopId = String(formData.get('stopId') ?? '');

  const { route } = await editableRoute(routeId, user.id, user.role);
  if (!route) return;

  const latest = route.versions[0];
  if (!latest) return;

  const removed = latest.stops.find((s) => s.id === stopId);
  if (!removed) return;

  const ids = latest.stops.filter((s) => s.id !== stopId).map((s) => s.deliveryLocationId);

  if (ids.length === 0) {
    // A version with no stops is not a route. Archive instead of emptying it.
    await db.route.update({ where: { id: routeId }, data: { status: 'ARCHIVED' } });
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'ROUTE_ARCHIVED',
        entityType: 'Route',
        entityId: routeId,
        reason: 'Last stop removed',
      },
    });
    redirect('/routes?archived=1');
  }

  await writeNewVersion(
    routeId,
    latest,
    ids,
    user.id,
    `Removed “${removed.deliveryLocation.name}” from the route`,
    latest.stops.length,
  );

  revalidatePath(`/routes/${routeId}`);
  revalidatePath(`/routes/${routeId}/edit`);
}

/** Re-runs the optimiser over the current stops without changing membership. */
export async function reoptimiseAction(formData: FormData) {
  const user = await requireCapability('optimize_routes');
  const routeId = String(formData.get('routeId') ?? '');

  const { route } = await editableRoute(routeId, user.id, user.role);
  if (!route) return;

  const latest = route.versions[0];
  if (!latest || latest.stops.length === 0) return;

  // Cancelled or archived locations drop out here automatically.
  const live = latest.stops.filter((s) => s.deliveryLocation.status === 'ACTIVE');
  const ids = (live.length > 0 ? live : latest.stops).map((s) => s.deliveryLocationId);

  await writeNewVersion(routeId, latest, ids, user.id, 'Re-optimised', latest.stops.length);
  revalidatePath(`/routes/${routeId}`);
  revalidatePath(`/routes/${routeId}/edit`);
}

// -------------------------------------------------------- delete route -----

/**
 * Deletes a route.
 *
 * Archives by default — the spec is explicit that delivery history must survive.
 * A permanent delete is only allowed when the route has never been run, i.e.
 * there is genuinely no history to destroy, and only for an admin or the
 * creator. That covers the real case of "I made this by mistake".
 */
export async function deleteRouteAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const user = await requireUser();
  const routeId = String(formData.get('routeId') ?? '');
  const mode = String(formData.get('mode') ?? 'archive');
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 200) || null;

  const { error, route } = await editableRoute(routeId, user.id, user.role);
  if (error || !route) return { error: error ?? 'Route not found.' };

  const versionIds = (
    await db.routeVersion.findMany({ where: { routeId }, select: { id: true } })
  ).map((v) => v.id);

  const [deliveries, runs] = await Promise.all([
    db.delivery.count({ where: { routeVersionId: { in: versionIds } } }),
    db.routeRun.count({ where: { routeVersionId: { in: versionIds } } }),
  ]);

  const hasHistory = deliveries > 0 || runs > 0;

  if (mode === 'permanent') {
    if (hasHistory) {
      return {
        error: `This route has ${deliveries} delivery record(s) across ${runs} run(s). Deleting it would destroy that history — archive it instead.`,
      };
    }
    if (user.role !== 'ADMIN' && route.createdById !== user.id) {
      return { error: 'Only an administrator or the route’s creator can delete it permanently.' };
    }

    // Safe now: nothing references these versions.
    await db.routeStop.deleteMany({ where: { routeVersionId: { in: versionIds } } });
    await db.routeVersion.deleteMany({ where: { routeId } });
    await db.trainingSession.updateMany({
      where: { generatedRouteId: routeId },
      data: { generatedRouteId: null },
    });
    await db.route.delete({ where: { id: routeId } });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'ROUTE_DELETED',
        entityType: 'Route',
        entityId: routeId,
        oldValue: route.name,
        reason: reason ?? 'Permanently deleted — no delivery history',
      },
    });

    revalidatePath('/routes');
    redirect('/routes?deleted=1');
  }

  await db.route.update({ where: { id: routeId }, data: { status: 'ARCHIVED' } });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'ROUTE_ARCHIVED',
      entityType: 'Route',
      entityId: routeId,
      oldValue: route.status,
      newValue: 'ARCHIVED',
      reason,
    },
  });

  revalidatePath('/routes');
  redirect('/routes?archived=1');
}

/** Brings an archived route back. The archive event stays in the audit log. */
export async function restoreRouteAction(formData: FormData) {
  const user = await requireUser();
  const routeId = String(formData.get('routeId') ?? '');

  const { route } = await editableRoute(routeId, user.id, user.role);
  if (!route) return;

  await db.route.update({ where: { id: routeId }, data: { status: 'ACTIVE' } });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'ROUTE_RESTORED',
      entityType: 'Route',
      entityId: routeId,
      oldValue: 'ARCHIVED',
      newValue: 'ACTIVE',
    },
  });

  revalidatePath('/routes');
  revalidatePath(`/routes/${routeId}`);
}

/** Renames a route without creating a new version. */
export async function renameRouteAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const user = await requireUser();
  const routeId = String(formData.get('routeId') ?? '');
  const newName = String(formData.get('name') ?? '').trim().slice(0, 100);

  if (!newName) return { error: 'Provide a name for the route.' };

  const { error, route } = await editableRoute(routeId, user.id, user.role);
  if (error || !route) return { error: error ?? 'Route not found.' };

  if (route.name === newName) return { success: 'Name unchanged.' };

  await db.route.update({
    where: { id: routeId },
    data: { name: newName },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'ROUTE_CHANGED',
      entityType: 'Route',
      entityId: routeId,
      oldValue: route.name,
      newValue: newName,
      reason: 'Renamed route',
    },
  });

  revalidatePath('/routes');
  revalidatePath(`/routes/${routeId}`);
  revalidatePath(`/routes/${routeId}/edit`);
  return { success: 'Route renamed.' };
}
