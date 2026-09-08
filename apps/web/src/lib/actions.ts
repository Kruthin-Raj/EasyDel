'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from './db';
import { requireAdmin, requireUser } from './auth';
import { requireCapability, can, currentUserWith, checkpointTypesKey } from './permissions';
import { optimizeRoute, refineWithOsrm, isValidCoord, haversine, type Point } from './optimize';
import { parseMapLink, resolveShortLink } from './map-links';
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
  const user = await requireCapability('edit_locations');

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

/** Creates a location from a pasted map link. Only name is required; coords come from the link. */
export async function createLocationFromLinkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireCapability('edit_locations');

  const link = String(formData.get('link') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();

  if (!name) return { error: 'Name is required.' };
  if (!link) return { error: 'Paste a map link or coordinates.' };

  let parsed = parseMapLink(link);
  if (parsed.needsResolution) parsed = await resolveShortLink(link);

  if (parsed.latitude === null || parsed.longitude === null) {
    return { error: parsed.error ?? 'Could not read coordinates from that link.' };
  }

  const lat = parsed.latitude;
  const lng = parsed.longitude;

  // Duplicate detection
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
      address: String(formData.get('address') ?? '').trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
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
  return { success: `Created "${name}" at ${lat.toFixed(5)}, ${lng.toFixed(5)}. You can close this tab.` };
}

export async function updateLocationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, can: permissions } = await currentUserWith(['edit_locations']);
  if (!permissions.edit_locations) {
    return { error: 'You do not have permission to edit locations.' };
  }

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim();
  const lat = Number(formData.get('latitude'));
  const lng = Number(formData.get('longitude'));

  if (!id) return { error: 'Location ID is missing.' };
  if (!name) return { error: 'Name is required.' };
  if (!address) return { error: 'Address is required.' };
  if (!isValidCoord(lat, lng)) {
    return {
      error: 'Latitude and longitude must be valid numbers (lat −90..90, lng −180..180).',
    };
  }

  const existing = await db.deliveryLocation.findUnique({ where: { id } });
  if (!existing) return { error: 'Location not found.' };

  const updated = await db.deliveryLocation.update({
    where: { id },
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

  await audit(user.id, 'LOCATION_UPDATED', 'DeliveryLocation', id, { oldValue: existing.name, newValue: name });
  revalidatePath('/locations');
  revalidatePath('/');
  
  // Also close the tab since this is usually opened in a new tab for inline editing
  return { success: 'Location updated! You can safely close this tab.' };
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
  _prev: any,
  formData: FormData,
): Promise<ActionState & { state?: 'OTP_REQUIRED'; email?: string; formData?: any }> {
  const admin = await requireAdmin();

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const role = String(formData.get('role') ?? '');
  const vehicleType = String(formData.get('vehicleType') ?? '') || null;

  if (!email || !firstName || !lastName) return { error: 'Email, first and last name are required.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'That email address is not valid.' };
  if (!['ADMIN', 'MENTOR', 'DELIVERY_AGENT'].includes(role)) return { error: 'Pick a valid role.' };

  const existing = await db.user.findUnique({ where: { email }, include: { driverProfile: true, mentorProfile: true } });
  
  if (existing) {
    if (role === 'DELIVERY_AGENT' && existing.driverProfile) return { error: `User is already a delivery agent.` };
    if (role === 'MENTOR' && existing.mentorProfile) return { error: `User is already a mentor.` };

    // Trigger OTP flow for converting existing user to a new role
    const { issueVerificationCode } = await import('./tokens');
    const { sendMail, verificationEmail } = await import('./mailer');
    
    const code = await issueVerificationCode(email);
    await sendMail({
      to: email,
      ...verificationEmail(code),
    });

    return { 
      state: 'OTP_REQUIRED', 
      email,
      success: `An OTP has been sent to ${email}. Ask the driver for it to verify.`,
      formData: { email, firstName, lastName, role, vehicleType }
    };
  }

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

export async function verifyDriverAddAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const otp = String(formData.get('otp') ?? '').trim();
  const role = String(formData.get('role') ?? '');
  const vehicleType = String(formData.get('vehicleType') ?? '') || null;

  if (!email || !otp) return { error: 'Email and OTP are required.' };

  const { verifyCode } = await import('./tokens');
  const outcome = await verifyCode(email, otp);
  
  if (!outcome.ok) {
    if (outcome.reason === 'expired') return { error: 'That code has expired. Request a new one.' };
    if (outcome.reason === 'too-many-attempts') return { error: 'Too many incorrect attempts. Request a new code.' };
    if (outcome.reason === 'incorrect') return { error: 'Incorrect code.' };
    return { error: 'Code not found or already used.' };
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user) return { error: 'User not found.' };

  if (role === 'DELIVERY_AGENT') {
    await db.driverProfile.create({ data: { userId: user.id, vehicleType } });
  } else if (role === 'MENTOR') {
    await db.mentorProfile.create({ data: { userId: user.id } });
  }

  // Update role to include the new capability if it wasn't already ADMIN
  if (user.role !== 'ADMIN') {
    await db.user.update({ where: { id: user.id }, data: { role: role as never } });
  }

  await audit(admin.id, 'USER_ROLE_ADDED', 'User', user.id, { newValue: `${email} (${role}) via OTP` });
  
  revalidatePath('/drivers');
  revalidatePath('/mentors');
  revalidatePath('/');
  return { success: `Successfully assigned ${role} to ${user.firstName}.` };
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
  const user = await requireCapability('create_routes');

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
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN';
  const canEditDropdown = await can(user, 'edit_dropdown');

  if (!isAdmin && !canEditDropdown) {
    return { error: 'Forbidden.' };
  }

  const geofence = Number(formData.get('delivery_geofence_metres'));
  if (isAdmin && (!Number.isFinite(geofence) || geofence < 10 || geofence > 5000)) {
    return { error: 'Delivery geofence must be between 10 and 5000 metres.' };
  }

  for (const key of Object.keys(SETTING_DEFAULTS)) {
    if (!isAdmin && key !== 'checkpoint_type_options') continue;

    const raw = formData.get(key);
    let value = '';
    if (key === 'delivery_geofence_metres') {
      value = String(geofence);
    } else if (key === 'checkpoint_type_options') {
      value = String(raw ?? '');
    } else {
      value = raw === 'on' ? 'true' : 'false';
    }

    /*
     * An agent's package-type list is written to their own namespaced key.
     *
     * `checkpoint_type_options` is one global row, so an agent saving here used
     * to replace the list for every other agent — the dropdown one agent
     * edited appeared in everybody's. Admins still write the shared row, which
     * remains the default for anyone who has not customised theirs.
     */
    const targetKey =
      key === 'checkpoint_type_options' && !isAdmin ? checkpointTypesKey(user.id) : key;

    await db.setting.upsert({
      where: { key: targetKey },
      update: { value },
      create: { key: targetKey, value },
    });
  }

  await audit(
    user.id,
    'SETTINGS_UPDATED',
    'Setting',
    isAdmin ? 'global' : checkpointTypesKey(user.id),
  );
  revalidatePath('/settings');
  revalidatePath('/record');
  return {
    success: isAdmin
      ? 'Settings saved.'
      : 'Saved. Your package types are yours alone — other agents keep theirs.',
  };
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
