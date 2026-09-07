'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from './db';
import { requireUser } from './auth';
import { loadSettings } from './permissions';
import { isValidCoord, haversine, optimizeRoute, type Point } from './optimize';
import { SKIP_REASONS } from './run-constants';

/*
 * Running a route — the day-two workflow.
 *
 * A driver starts a run, works the stops in order, and records an outcome for
 * every one. Outcomes are immutable facts about what happened: a skipped or
 * failed stop is recorded with its reason, never deleted, so the history stays
 * truthful even when the round went badly.
 */

export type RunState = { error?: string; success?: string; info?: string } | null;

function text(form: FormData, key: string, max = 500) {
  return String(form.get(key) ?? '').trim().slice(0, max);
}

/** Reads the driver's reported position, if the browser supplied one. */
function position(form: FormData) {
  const lat = Number(form.get('latitude'));
  const lng = Number(form.get('longitude'));
  return isValidCoord(lat, lng) ? { lat, lng } : null;
}

/** Loads a run and checks the caller owns it. */
async function ownedRun(runId: string, userId: string, role: string) {
  const run = await db.routeRun.findUnique({
    where: { id: runId },
    include: { routeVersion: { include: { route: true } } },
  });
  if (!run) return null;
  if (run.driverId !== userId && role !== 'ADMIN') return null;
  return run;
}

// ------------------------------------------------------------ start --------

export async function startRunAction(_prev: RunState, formData: FormData): Promise<RunState> {
  const user = await requireUser();
  const routeId = String(formData.get('routeId') ?? '');

  const route = await db.route.findUnique({
    where: { id: routeId },
    include: {
      driver: true,
      versions: { orderBy: { versionNumber: 'desc' }, take: 1, include: { stops: true } },
    },
  });
  if (!route) return { error: 'That route no longer exists.' };

  const version = route.versions[0];
  if (!version || version.stops.length === 0) {
    return { error: 'This route has no stops yet, so there is nothing to deliver.' };
  }

  /*
   * Who may run this route.
   *
   * Assignment alone was too narrow: a driver who recorded the round by
   * driving it, or built it from their own pasted map links, was told to go
   * ask an administrator to assign them their own route. Creating a route is
   * as strong a claim to it as being assigned one.
   *
   * An unassigned route is open to any driver — nobody is being displaced.
   */
  const assignedUserId = route.driver
    ? (await db.driverProfile.findUnique({
        where: { id: route.driver.id },
        select: { userId: true },
      }))?.userId
    : null;

  const isAdmin = user.role === 'ADMIN';
  const isAssignee = assignedUserId === user.id;
  const isCreator = route.createdById === user.id;
  const unassigned = assignedUserId === null;

  if (!isAdmin && !isAssignee && !isCreator && !unassigned) {
    return {
      error: `This route is assigned to another driver. Ask an administrator to reassign it, or run one of your own.`,
    };
  }

  const existing = await db.routeRun.findFirst({
    where: { driverId: user.id, status: 'IN_PROGRESS' },
    select: { id: true, routeVersion: { select: { routeId: true } } },
  });
  if (existing) {
    // Finishing the open run first keeps each run's history coherent.
    redirect(`/routes/${existing.routeVersion.routeId}/run`);
  }

  const here = position(formData);

  /*
   * Re-order the stops from wherever the driver actually is.
   *
   * The stored order was optimised from the route's planned start point. A
   * driver setting off from home would otherwise be sent back across town to
   * stop 1 before working outward. The order is saved on the run, not as a new
   * RouteVersion — "I started from home today" is a fact about this run, not a
   * change to the route everyone shares.
   */
  let stopOrder: string | null = null;
  if (here) {
    const stopsWithLocation = await db.routeStop.findMany({
      where: { routeVersionId: version.id },
      include: { deliveryLocation: { select: { latitude: true, longitude: true, name: true } } },
    });

    const start: Point = { id: 'start', name: 'You', lat: here.lat, lng: here.lng };
    const points: Point[] = stopsWithLocation.map((stop) => ({
      id: stop.id,
      name: stop.deliveryLocation.name,
      lat: stop.deliveryLocation.latitude,
      lng: stop.deliveryLocation.longitude,
    }));

    // Round trip back to the driver's start, matching how routes are planned.
    const ordered = optimizeRoute(start, start, points);
    if (ordered.order.length === points.length) {
      stopOrder = JSON.stringify(ordered.order.map((p) => p.id));
    }
  }

  const run = await db.routeRun.create({
    data: {
      routeVersionId: version.id,
      driverId: user.id,
      startLatitude: here?.lat ?? null,
      startLongitude: here?.lng ?? null,
      stopOrder,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'ROUTE_STARTED',
      entityType: 'RouteRun',
      entityId: run.id,
      newValue: route.name,
    },
  });

  revalidatePath(`/routes/${routeId}/run`);
  return {
    success: stopOrder
      ? 'Route started, ordered from where you are now.'
      : 'Route started. Work the stops in order.',
  };
}

// ---------------------------------------------------------- outcomes -------

/**
 * Records an outcome for every active subscription at one stop.
 *
 * The spec's rule: a building is completed as a single stop, but each
 * customer's delivery is recorded individually — so one row per subscription,
 * not one per building.
 */
async function recordOutcome(
  formData: FormData,
  status: 'DELIVERED' | 'SKIPPED' | 'FAILED',
): Promise<RunState> {
  const user = await requireUser();
  const runId = String(formData.get('runId') ?? '');
  const stopId = String(formData.get('stopId') ?? '');
  const reason = text(formData, 'reason', 200) || null;
  const notes = text(formData, 'notes', 1000) || null;

  if (status !== 'DELIVERED' && !reason) {
    return { error: 'Pick a reason — a skipped or failed stop must say why.' };
  }
  // The dropdown is client-side; a direct POST could send anything.
  if (reason && !SKIP_REASONS.includes(reason)) {
    return { error: 'That is not a valid reason.' };
  }

  const run = await ownedRun(runId, user.id, user.role);
  if (!run) return { error: 'That run is not yours, or no longer exists.' };
  if (run.status !== 'IN_PROGRESS') return { error: 'This run has already been finished.' };

  const stop = await db.routeStop.findUnique({
    where: { id: stopId },
    include: {
      deliveryLocation: { include: { subscriptions: { where: { status: 'ACTIVE' } } } },
    },
  });
  if (!stop) return { error: 'That stop no longer exists.' };

  const here = position(formData);
  const distance = here
    ? haversine(here, { lat: stop.deliveryLocation.latitude, lng: stop.deliveryLocation.longitude })
    : null;

  // Geofence is a warning, not a block: a driver standing in the wrong place
  // still needs to record what happened, and refusing would push them to lie.
  const settings = await loadSettings();
  const fence = Number(settings.delivery_geofence_metres) || 150;
  const farAway = distance !== null && distance > fence;

  if (farAway && formData.get('confirmDistance') !== 'yes') {
    return {
      error: `You are ${Math.round(distance)} m from ${stop.deliveryLocation.name} — further than the ${fence} m limit. Tick “record anyway” if that is correct.`,
    };
  }

  const subscriptions = stop.deliveryLocation.subscriptions;

  // A stop with no active subscription still needs an outcome recorded, so fall
  // back to a single row that carries the result.
  const already = await db.delivery.findMany({
    where: {
      routeRunId: runId,
      subscription: { deliveryLocationId: stop.deliveryLocationId },
    },
    select: { id: true },
  });
  if (already.length > 0) {
    return { info: `${stop.deliveryLocation.name} already has an outcome for this run.` };
  }

  if (subscriptions.length === 0) {
    return {
      error: `${stop.deliveryLocation.name} has no active subscription, so there is nothing to deliver. Ask an administrator to add one.`,
    };
  }

  const now = new Date();
  await db.delivery.createMany({
    data: subscriptions.map((sub) => ({
      routeVersionId: run.routeVersionId,
      routeRunId: runId,
      subscriptionId: sub.id,
      status,
      // A skipped or failed delivery moved zero items, whatever was ordered.
      quantity: status === 'DELIVERED' ? sub.quantity : 0,
      reason,
      notes,
      timestamp: now,
      latitude: here?.lat ?? null,
      longitude: here?.lng ?? null,
      recordedDistance: distance,
    })),
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: status === 'DELIVERED' ? 'DELIVERY_COMPLETED' : `DELIVERY_${status}`,
      entityType: 'RouteStop',
      entityId: stopId,
      newValue: stop.deliveryLocation.name,
      reason,
    },
  });

  revalidatePath(`/routes/${run.routeVersion.routeId}/run`);

  const label =
    status === 'DELIVERED'
      ? `Delivered at ${stop.deliveryLocation.name}.`
      : `${stop.deliveryLocation.name} marked ${status.toLowerCase()}.`;
  return { success: farAway ? `${label} Recorded ${Math.round(distance!)} m away.` : label };
}

export async function markDeliveredAction(_prev: RunState, formData: FormData) {
  return recordOutcome(formData, 'DELIVERED');
}

export async function skipStopAction(_prev: RunState, formData: FormData) {
  return recordOutcome(formData, 'SKIPPED');
}

export async function markFailedAction(_prev: RunState, formData: FormData) {
  return recordOutcome(formData, 'FAILED');
}

/** Clears the recorded outcome for a stop so it can be redone. */
export async function undoStopOutcomeAction(formData: FormData) {
  const user = await requireUser();
  const runId = String(formData.get('runId') ?? '');
  const stopId = String(formData.get('stopId') ?? '');

  const run = await ownedRun(runId, user.id, user.role);
  if (!run || run.status !== 'IN_PROGRESS') return;

  const stop = await db.routeStop.findUnique({
    where: { id: stopId },
    select: { deliveryLocationId: true },
  });
  if (!stop) return;

  // Only removable while the run is still open. Once finished, the record
  // stands — including the mistakes.
  await db.delivery.deleteMany({
    where: {
      routeRunId: runId,
      subscription: { deliveryLocationId: stop.deliveryLocationId },
    },
  });

  revalidatePath(`/routes/${run.routeVersion.routeId}/run`);
}

// ------------------------------------------------------------ issues -------

export async function reportIssueAction(_prev: RunState, formData: FormData): Promise<RunState> {
  const user = await requireUser();
  const description = text(formData, 'description', 2000);
  const category = text(formData, 'category', 80);
  const entityType = text(formData, 'entityType', 40) || 'Location';
  const entityId = text(formData, 'entityId', 64);
  const runId = String(formData.get('runId') ?? '') || null;

  if (!category) return { error: 'Choose what kind of problem this is.' };
  if (description.length < 5) {
    return { error: 'Describe the problem in a few words so it can be acted on.' };
  }

  const here = position(formData);

  await db.issue.create({
    data: {
      reportedBy: user.id,
      entityType,
      entityId,
      category,
      description,
      routeRunId: runId,
      latitude: here?.lat ?? null,
      longitude: here?.lng ?? null,
      status: 'OPEN',
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'ISSUE_CREATED',
      entityType,
      entityId,
      newValue: category,
      reason: description.slice(0, 200),
    },
  });

  revalidatePath('/delivery-history');
  if (runId) {
    const run = await db.routeRun.findUnique({
      where: { id: runId },
      select: { routeVersion: { select: { routeId: true } } },
    });
    if (run) revalidatePath(`/routes/${run.routeVersion.routeId}/run`);
  }

  return { success: 'Issue reported. An administrator will see it in Delivery history.' };
}

/**
 * Cancels a run in progress.
 *
 * The run and any outcomes already recorded are kept and marked ABANDONED —
 * deleting them would erase the fact that deliveries were made before the
 * round was called off, which is exactly what history is for.
 */
export async function cancelRunAction(formData: FormData) {
  const user = await requireUser();
  const runId = String(formData.get('runId') ?? '');

  const run = await ownedRun(runId, user.id, user.role);
  if (!run || run.status !== 'IN_PROGRESS') return;

  const recorded = await db.delivery.count({ where: { routeRunId: runId } });

  await db.routeRun.update({
    where: { id: runId },
    data: { status: 'ABANDONED', endedAt: new Date() },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'ROUTE_CANCELLED',
      entityType: 'RouteRun',
      entityId: runId,
      newValue: `${recorded} delivery record(s) kept`,
      reason: String(formData.get('reason') ?? '') || null,
    },
  });

  revalidatePath(`/routes/${run.routeVersion.routeId}/run`);
  redirect(`/routes/${run.routeVersion.routeId}/run?cancelled=1`);
}

// -------------------------------------------------------------- end --------

export async function endRunAction(_prev: RunState, formData: FormData): Promise<RunState> {
  const user = await requireUser();
  const runId = String(formData.get('runId') ?? '');

  const run = await ownedRun(runId, user.id, user.role);
  if (!run) return { error: 'That run is not yours, or no longer exists.' };
  if (run.status !== 'IN_PROGRESS') return { error: 'This run is already finished.' };

  const [stops, outcomes] = await Promise.all([
    db.routeStop.count({ where: { routeVersionId: run.routeVersionId } }),
    db.delivery.findMany({
      where: { routeRunId: runId },
      select: { subscription: { select: { deliveryLocationId: true } } },
    }),
  ]);

  const covered = new Set(outcomes.map((o) => o.subscription.deliveryLocationId)).size;

  // Finishing early is allowed, but not by accident.
  if (covered < stops && formData.get('confirmIncomplete') !== 'yes') {
    return {
      error: `${stops - covered} of ${stops} stops have no outcome recorded. Tick “finish anyway” to end the run with them unvisited.`,
    };
  }

  await db.routeRun.update({
    where: { id: runId },
    data: { status: 'COMPLETED', endedAt: new Date() },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'ROUTE_COMPLETED',
      entityType: 'RouteRun',
      entityId: runId,
      newValue: `${covered}/${stops} stops`,
    },
  });

  revalidatePath('/delivery-history');
  revalidatePath('/');
  redirect(`/routes/${run.routeVersion.routeId}/run?finished=1`);
}

/**
 * Fetches the road path from where the driver is to a given stop.
 *
 * Proxied through the server so OSRM_URL stays server-side and the browser
 * never talks to the routing host directly — that keeps a self-hosted OSRM off
 * the public internet and avoids CORS entirely.
 *
 * Returns null geometry rather than throwing when routing is unavailable: the
 * map falls back to a straight line, which is still useful, and a delivery must
 * never be blocked by a routing outage.
 */
export async function getNavigationLegAction(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Promise<{ coordinates: number[][] | null; distance: number | null; duration: number | null }> {
  await requireUser();

  const empty = { coordinates: null, distance: null, duration: null };
  if (!isValidCoord(fromLat, fromLng) || !isValidCoord(toLat, toLng)) return empty;

  const base = process.env.OSRM_URL;
  if (!base) return empty;

  const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
  const url = `${base.replace(/\/$/, '')}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });
    if (!res.ok) return empty;

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates) return empty;

    return {
      coordinates: route.geometry.coordinates as number[][],
      distance: route.distance ?? null,
      duration: route.duration ?? null,
    };
  } catch {
    // Offline, timed out, or the public demo server rate-limited us.
    return empty;
  }
}
