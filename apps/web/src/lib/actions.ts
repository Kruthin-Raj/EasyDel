'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from './db';
import { requireAdmin, requireUser } from './auth';
import { requireCapability } from './permissions';
import { optimizeRoute, refineWithOsrm, isValidCoord, haversine, type Point } from './optimize';
import { SETTING_DEFAULTS } from './settings';
import type { ParsedRow } from './import-parse';

/*
 * Every export here is a Server Action, which means it is reachable by direct
 * POST regardless of what the UI exposes. Each one therefore starts with an
 * authorisation check — see lib/auth.ts.
 *
 * Mutations that change business state also write an AuditLog row, per the
 * spec's requirement that location/route/subscription changes be traceable.
 */

type ActionState = { error?: string; success?: string } | null;

async function audit(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  // Nullable rather than optional: callers routinely pass a reason that is
  // absent, and Prisma treats null and undefined differently on create.
  extra?: {
    oldValue?: string | null;
    newValue?: string | null;
    reason?: string | null;
  },
) {
  await db.auditLog.create({
    data: { userId, action, entityType, entityId, ...extra },
  });
}

// ------------------------------------------------------------ locations -----

export async function createLocationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();

  const name = String(formData.get('name') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim();
  const lat = Number(formData.get('latitude'));
  const lng = Number(formData.get('longitude'));

  if (!name) return { error: 'Name is required.' };
  if (!address) return { error: 'Address is required.' };
  if (!isValidCoord(lat, lng)) {
    return {
      error:
        'Latitude and longitude must be valid numbers (lat −90..90, lng −180..180). Nothing was saved.',
    };
  }

  // Duplicate detection — never silently create a second checkpoint on the
  // same doorstep (spec: DUPLICATE LOCATION DETECTION).
  const nearby = await db.deliveryLocation.findMany({
    where: { status: { in: ['ACTIVE', 'PAUSED'] } },
    select: { id: true, name: true, latitude: true, longitude: true },
  });
  const dup = nearby.find((l) => haversine({ lat, lng }, { lat: l.latitude, lng: l.longitude }) < 60);
  if (dup && formData.get('confirmDuplicate') !== 'yes') {
    const d = Math.round(haversine({ lat, lng }, { lat: dup.latitude, lng: dup.longitude }));
    return {
      error: `Possible duplicate: "${dup.name}" is ${d} m away. Re-submit with "Create anyway" ticked if this is genuinely a separate location.`,
    };
  }

  const created = await db.deliveryLocation.create({
    data: {
      name,
      buildingName: String(formData.get('buildingName') ?? '') || null,
      address,
      latitude: lat,
      longitude: lng,
      floor: String(formData.get('floor') ?? '') || null,
      unit: String(formData.get('unit') ?? '') || null,
      notes: String(formData.get('notes') ?? '') || null,
      entranceInstructions: String(formData.get('entranceInstructions') ?? '') || null,
      securityInstructions: String(formData.get('securityInstructions') ?? '') || null,
    },
  });

  await audit(user.id, 'LOCATION_CREATED', 'DeliveryLocation', created.id, { newValue: name });
  revalidatePath('/locations');
  revalidatePath('/');
  redirect('/locations');
}

export async function setLocationStatusAction(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  const reason = String(formData.get('reason') ?? '') || null;
  const pauseUntilRaw = String(formData.get('pauseUntil') ?? '');

  const allowed = ['ACTIVE', 'PAUSED', 'CANCELLED', 'MOVED', 'ARCHIVED'];
  if (!id || !allowed.includes(status)) return;

  const before = await db.deliveryLocation.findUnique({ where: { id } });
  if (!before) return;

  await db.deliveryLocation.update({
    where: { id },
    data: {
      status: status as never,
      pauseUntil: status === 'PAUSED' && pauseUntilRaw ? new Date(pauseUntilRaw) : null,
    },
  });

  await audit(user.id, `LOCATION_${status}`, 'DeliveryLocation', id, {
    oldValue: before.status,
    newValue: status,
    reason,
  });

  revalidatePath('/locations');
  revalidatePath('/');
}

export async function moveLocationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const lat = Number(formData.get('latitude'));
  const lng = Number(formData.get('longitude'));
  const reason = String(formData.get('reason') ?? '') || null;

  if (!isValidCoord(lat, lng)) return { error: 'Invalid coordinates — nothing was changed.' };

  const before = await db.deliveryLocation.findUnique({ where: { id } });
  if (!before) return { error: 'Location not found.' };

  const movedBy = Math.round(
    haversine({ lat: before.latitude, lng: before.longitude }, { lat, lng }),
  );

  await db.deliveryLocation.update({ where: { id }, data: { latitude: lat, longitude: lng } });
  await db.locationHistory.create({
    data: {
      deliveryLocationId: id,
      changedBy: user.id,
      oldLatitude: before.latitude,
      oldLongitude: before.longitude,
      newLatitude: lat,
      newLongitude: lng,
      reason: reason ?? `Moved ${movedBy} m`,
    },
  });
  await audit(user.id, 'LOCATION_MOVED', 'DeliveryLocation', id, {
    oldValue: `${before.latitude},${before.longitude}`,
    newValue: `${lat},${lng}`,
    reason,
  });

  revalidatePath('/locations');
  return { success: `Location moved ${movedBy} m.` };
}

// ----------------------------------------------------------- people ---------

export async function createUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const role = String(formData.get('role') ?? '');
  const vehicleType = String(formData.get('vehicleType') ?? '') || null;

  if (!email || !firstName || !lastName) return { error: 'Email, first and last name are required.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'That email address is not valid.' };
  if (!['ADMIN', 'MENTOR', 'DELIVERY_AGENT'].includes(role)) return { error: 'Pick a valid role.' };

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { error: `A user with ${email} already exists.` };

  const user = await db.user.create({
    data: { email, firstName, lastName, role: role as never },
  });

  if (role === 'DELIVERY_AGENT') {
    await db.driverProfile.create({ data: { userId: user.id, vehicleType } });
  } else if (role === 'MENTOR') {
    await db.mentorProfile.create({ data: { userId: user.id } });
  }

  await audit(admin.id, 'USER_CREATED', 'User', user.id, { newValue: `${email} (${role})` });
  revalidatePath('/drivers');
  revalidatePath('/mentors');
  revalidatePath('/');
  return { success: `Created ${firstName} ${lastName}.` };
}

export async function toggleDriverActiveAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const profile = await db.driverProfile.findUnique({ where: { id } });
  if (!profile) return;

  await db.driverProfile.update({ where: { id }, data: { active: !profile.active } });
  await audit(admin.id, profile.active ? 'DRIVER_DEACTIVATED' : 'DRIVER_ACTIVATED', 'DriverProfile', id, {
    oldValue: String(profile.active),
    newValue: String(!profile.active),
  });
  revalidatePath('/drivers');
  revalidatePath('/');
}

// ----------------------------------------------------------- routes ---------

/**
 * Builds a route from the currently deliverable locations and optimises the
 * stop order. Only ACTIVE locations with at least one ACTIVE subscription are
 * included — the spec's core business rule.
 */
export async function createRouteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Route name is required.' };

  const driverId = String(formData.get('driverId') ?? '') || null;
  const selected = formData.getAll('locationIds').map(String).filter(Boolean);

  const locations = await db.deliveryLocation.findMany({
    where: selected.length
      ? { id: { in: selected } }
      : { status: 'ACTIVE', subscriptions: { some: { status: 'ACTIVE' } } },
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  if (locations.length === 0) {
    return { error: 'No deliverable locations found. Add a location with an active subscription first.' };
  }

  const startLat = Number(formData.get('startLatitude'));
  const startLng = Number(formData.get('startLongitude'));
  const endSameAsStart = formData.get('endSameAsStart') === 'on';
  const endLat = endSameAsStart ? startLat : Number(formData.get('endLatitude'));
  const endLng = endSameAsStart ? startLng : Number(formData.get('endLongitude'));

  if (!isValidCoord(startLat, startLng) || !isValidCoord(endLat, endLng)) {
    return { error: 'Start and end coordinates must be valid. Nothing was saved.' };
  }

  const start: Point = { id: 'start', name: String(formData.get('startName') ?? 'Start'), lat: startLat, lng: startLng };
  const end: Point = { id: 'end', name: String(formData.get('endName') ?? 'End'), lat: endLat, lng: endLng };
  const stops: Point[] = locations.map((l) => ({ id: l.id, name: l.name, lat: l.latitude, lng: l.longitude }));

  const optimized = await refineWithOsrm(optimizeRoute(start, end, stops));

  const route = await db.route.create({
    data: {
      name,
      status: 'ACTIVE',
      createdById: user.id,
      approvedById: user.id,
      driverId,
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

  await audit(user.id, 'ROUTE_CREATED', 'Route', route.id, { newValue: name });
  revalidatePath('/routes');
  revalidatePath('/');
  redirect(`/routes/${route.id}`);
}

/** Creates a NEW version rather than mutating history (spec: ROUTE VERSIONING). */
export async function reoptimizeRouteAction(formData: FormData) {
  // Re-optimising is governed by the agents_can_optimize_routes setting rather
  // than being admin-only: a driver who built the round should be able to
  // reshuffle it without waiting for someone else.
  const user = await requireCapability('optimize_routes');
  const routeId = String(formData.get('routeId') ?? '');

  const latest = await db.routeVersion.findFirst({
    where: { routeId },
    orderBy: { versionNumber: 'desc' },
    include: { stops: { include: { deliveryLocation: true } } },
  });
  if (!latest) return;

  // Re-read deliverability: cancelled/paused locations drop out automatically.
  const live = latest.stops
    .map((s) => s.deliveryLocation)
    .filter((l) => l.status === 'ACTIVE');

  const start: Point = {
    id: 'start',
    name: latest.startLocationName ?? 'Start',
    lat: latest.startLatitude ?? 0,
    lng: latest.startLongitude ?? 0,
  };
  const end: Point = {
    id: 'end',
    name: latest.endLocationName ?? 'End',
    lat: latest.endLatitude ?? 0,
    lng: latest.endLongitude ?? 0,
  };
  if (!isValidCoord(start.lat, start.lng) || !isValidCoord(end.lat, end.lng)) return;

  const optimized = await refineWithOsrm(
    optimizeRoute(
      start,
      end,
      live.map((l) => ({ id: l.id, name: l.name, lat: l.latitude, lng: l.longitude })),
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

  await audit(user.id, 'ROUTE_OPTIMIZED', 'Route', routeId, {
    oldValue: `v${latest.versionNumber}`,
    newValue: `v${version.versionNumber}`,
  });
  revalidatePath('/routes');
  revalidatePath(`/routes/${routeId}`);
}

export async function assignDriverAction(formData: FormData) {
  const user = await requireAdmin();
  const routeId = String(formData.get('routeId') ?? '');
  const driverId = String(formData.get('driverId') ?? '') || null;

  await db.route.update({ where: { id: routeId }, data: { driverId } });
  await audit(user.id, 'ROUTE_DRIVER_ASSIGNED', 'Route', routeId, { newValue: driverId ?? 'unassigned' });
  revalidatePath('/routes');
  revalidatePath(`/routes/${routeId}`);
}

// ----------------------------------------------------------- imports --------

/** Commits rows that the user reviewed in the import preview. */
export async function commitImportAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  const payload = String(formData.get('rows') ?? '');
  if (!payload) return { error: 'Nothing to import.' };

  let rows: ParsedRow[];
  try {
    rows = JSON.parse(payload);
  } catch {
    return { error: 'Import payload was malformed. Re-upload the file.' };
  }

  const importable = rows.filter((r) => r.errors.length === 0 && !r.duplicateOf);
  if (importable.length === 0) {
    return { error: 'No valid rows to import — every row had an error or was a duplicate.' };
  }

  let created = 0;
  for (const r of importable) {
    if (!isValidCoord(r.latitude, r.longitude)) continue;
    const loc = await db.deliveryLocation.create({
      data: {
        name: r.name,
        buildingName: r.name,
        address: r.address,
        latitude: r.latitude as number,
        longitude: r.longitude as number,
        notes: r.notes,
      },
    });
    if (r.quantity && r.quantity > 0) {
      await db.subscription.create({
        data: {
          deliveryLocationId: loc.id,
          customerId: r.name,
          productType: r.productType ?? 'Newspaper',
          quantity: r.quantity,
          frequency: 'DAILY',
        },
      });
    }
    await audit(user.id, 'LOCATION_CREATED', 'DeliveryLocation', loc.id, {
      newValue: r.name,
      reason: 'Imported from file',
    });
    created++;
  }

  revalidatePath('/locations');
  revalidatePath('/');
  return { success: `Imported ${created} location${created === 1 ? '' : 's'}.` };
}

// ----------------------------------------------------------- settings -------

export async function saveSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();

  const geofence = Number(formData.get('delivery_geofence_metres'));
  if (!Number.isFinite(geofence) || geofence < 10 || geofence > 5000) {
    return { error: 'Delivery geofence must be between 10 and 5000 metres.' };
  }

  for (const key of Object.keys(SETTING_DEFAULTS)) {
    const raw = formData.get(key);
    const value =
      key === 'delivery_geofence_metres' ? String(geofence) : raw === 'on' ? 'true' : 'false';
    await db.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  await audit(user.id, 'SETTINGS_UPDATED', 'Setting', 'global');
  revalidatePath('/settings');
  return { success: 'Settings saved.' };
}

// ----------------------------------------------------------- issues ---------

export async function setIssueStatusAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!['OPEN', 'RESOLVED'].includes(status)) return;

  await db.issue.update({ where: { id }, data: { status } });
  await audit(user.id, status === 'RESOLVED' ? 'ISSUE_RESOLVED' : 'ISSUE_REOPENED', 'Issue', id, {
    newValue: status,
  });
  revalidatePath('/delivery-history');
  revalidatePath('/');
}
