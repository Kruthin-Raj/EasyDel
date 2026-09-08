'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from './db';
import { requireUser } from './auth';
import { requireCapability } from './permissions';
import { parseNameOptions } from './name-options';
import { uploadPhoto, ensureBucket } from './storage';
import { isValidCoord, haversine, optimizeRoute, refineWithOsrm, type Point } from './optimize';

/*
 * Route recording — the first-day workflow.
 *
 * A driver (usually riding with a mentor) starts a session, logs a checkpoint
 * at each house as they reach it, and ends the session. Day two onwards they
 * follow the route the app generates from that recording.
 *
 * Everything is written as it happens rather than batched at the end: a phone
 * losing signal or a browser being closed mid-round must not discard the
 * houses already logged.
 */

export type RecState = { error?: string; success?: string; info?: string } | null;

const MAX_NOTE = 2000;

function text(form: FormData, key: string, max = 300) {
  return String(form.get(key) ?? '').trim().slice(0, max);
}



// ------------------------------------------------------------ session -------

export async function startRecordingAction(
  _prev: RecState,
  formData: FormData,
): Promise<RecState> {
  const user = await requireCapability('create_training_routes');

  const routeName = text(formData, 'routeName', 120);
  if (!routeName) return { error: 'Give the route a name so you can find it tomorrow.' };

  const lat = Number(formData.get('startLatitude'));
  const lng = Number(formData.get('startLongitude'));
  if (!isValidCoord(lat, lng)) {
    return {
      error:
        'We could not read your location. Allow location access in your browser, then try again.',
    };
  }

  /*
   * The "riding with" picker was removed — agents record their own rounds and
   * nobody was using it.
   *
   * `TrainingSession.mentorId` is still a required column, and existing rows
   * depend on it, so it points at whoever recorded the round. That keeps the
   * schema and old sessions valid without a migration; `recordedById` is the
   * field that actually means anything now.
   */
  const mentorId = user.id;

  const existing = await db.trainingSession.findFirst({
    where: { recordedById: user.id, status: 'RECORDING' },
    select: { id: true },
  });
  if (existing) {
    // Never start a second recording silently — that splits one round across
    // two sessions and neither is usable.
    redirect(`/record/${existing.id}`);
  }

  /*
   * Optional list of house names for this round, one per line.
   *
   * Offered as a dropdown on the checkpoint form so a long name can be picked
   * rather than typed at the gate. Normalised here — blank lines dropped,
   * duplicates removed, order preserved — so the form can render it directly.
   */
  const nameOptions = parseNameOptions(String(formData.get('nameOptions') ?? ''));
  // Package types for this round only — see TrainingSession.typeOptions.
  const typeOptions = parseNameOptions(String(formData.get('typeOptions') ?? ''));

  const session = await db.trainingSession.create({
    data: {
      routeName,
      mentorId,
      traineeId: user.id,
      recordedById: user.id,
      status: 'RECORDING',
      geometry: JSON.stringify([[lng, lat]]),
      nameOptions: nameOptions.length > 0 ? nameOptions.join('\n') : null,
      typeOptions: typeOptions.length > 0 ? typeOptions.join('\n') : null,
    },
  });

  redirect(`/record/${session.id}`);
}

/** Appends GPS points to the session track. Called periodically while moving. */
export async function appendTrackAction(formData: FormData) {
  const user = await requireUser();
  const sessionId = String(formData.get('sessionId') ?? '');
  const raw = String(formData.get('points') ?? '');

  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    select: { id: true, recordedById: true, traineeId: true, status: true, geometry: true },
  });
  if (!session || session.status !== 'RECORDING') return;
  if (session.recordedById !== user.id && session.traineeId !== user.id) return;

  let incoming: number[][];
  try {
    incoming = JSON.parse(raw);
    if (!Array.isArray(incoming)) return;
  } catch {
    return;
  }

  const clean = incoming
    .filter((p) => Array.isArray(p) && p.length === 2 && isValidCoord(p[1], p[0]))
    .slice(0, 500);
  if (clean.length === 0) return;

  const existing: number[][] = session.geometry ? JSON.parse(session.geometry) : [];

  /*
   * Drop points closer than 15 m to the previous one. A stationary phone emits
   * a reading every few seconds; without this a one-hour round would store
   * thousands of duplicate coordinates for no extra detail.
   */
  const merged = [...existing];
  for (const point of clean) {
    const last = merged[merged.length - 1];
    if (
      !last ||
      haversine({ lat: last[1], lng: last[0] }, { lat: point[1], lng: point[0] }) > 15
    ) {
      merged.push(point);
    }
  }

  await db.trainingSession.update({
    where: { id: sessionId },
    data: { geometry: JSON.stringify(merged) },
  });
}

// --------------------------------------------------------- checkpoints -----

export async function addCheckpointAction(
  _prev: RecState,
  formData: FormData,
): Promise<RecState> {
  const user = await requireUser();
  const sessionId = String(formData.get('sessionId') ?? '');

  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    select: { id: true, recordedById: true, traineeId: true, status: true },
  });
  if (!session) return { error: 'That recording session no longer exists.' };
  if (session.status !== 'RECORDING') return { error: 'This session has already been ended.' };
  if (session.recordedById !== user.id && session.traineeId !== user.id) {
    return { error: 'This is not your recording session.' };
  }

  const name = text(formData, 'name', 120);
  if (!name) return { error: 'Give the house or building a name.' };

  const lat = Number(formData.get('latitude'));
  const lng = Number(formData.get('longitude'));
  if (!isValidCoord(lat, lng)) {
    return { error: 'No location for this checkpoint. Allow location access and try again.' };
  }

  const quantityRaw = String(formData.get('quantity') ?? '').trim();
  const quantity = quantityRaw === '' ? null : Number(quantityRaw);
  if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0)) {
    return { error: 'Quantity must be a whole number.' };
  }

  // Photo is optional — the driver decides whether the house needs one.
  let photoUrl: string | null = null;
  const photo = formData.get('photo');
  if (photo instanceof File && photo.size > 0) {
    const bucketSetup = await ensureBucket();
    if (!bucketSetup.ok) return { error: `Storage error: ${bucketSetup.detail}` };
    
    const upload = await uploadPhoto(photo, `training/${sessionId}`);
    if (!upload.ok) return { error: upload.error };
    photoUrl = upload.path;
  }

  const lastSequence = await db.trainingCheckpoint.aggregate({
    where: { trainingSessionId: sessionId },
    _max: { sequence: true },
  });

  const completed = formData.get('markComplete') === 'on';

  await db.trainingCheckpoint.create({
    data: {
      trainingSessionId: sessionId,
      name,
      address: text(formData, 'address', 300) || name,
      latitude: lat,
      longitude: lng,
      deliveryType: text(formData, 'deliveryType', 80) || null,
      quantity,
      notes: text(formData, 'notes', MAX_NOTE) || null,
      nextVisitNote: text(formData, 'nextVisitNote', MAX_NOTE) || null,
      floor: text(formData, 'floor', 40) || null,
      unit: text(formData, 'unit', 40) || null,
      entranceInstructions: text(formData, 'entranceInstructions', MAX_NOTE) || null,
      photoUrl,
      sequence: (lastSequence._max.sequence ?? 0) + 1,
      completedAt: completed ? new Date() : null,
    },
  });

  revalidatePath(`/record/${sessionId}`);
  return { success: `Saved “${name}”${completed ? ' and marked delivered' : ''}.` };
}

/** Toggles the delivered flag for a house already logged. */
export async function toggleCheckpointCompleteAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('checkpointId') ?? '');

  const checkpoint = await db.trainingCheckpoint.findUnique({
    where: { id },
    include: { trainingSession: { select: { recordedById: true, traineeId: true, id: true } } },
  });
  if (!checkpoint) return;

  const session = checkpoint.trainingSession;
  if (session.recordedById !== user.id && session.traineeId !== user.id && user.role !== 'ADMIN') {
    return;
  }

  await db.trainingCheckpoint.update({
    where: { id },
    data: { completedAt: checkpoint.completedAt ? null : new Date() },
  });
  revalidatePath(`/record/${session.id}`);
}

/**
 * Edits a checkpoint already logged.
 *
 * Only while the session is still recording: a finished session is the record
 * of what happened on the day and must not be quietly rewritten. Fields left
 * blank are cleared rather than ignored, so a wrong note can be removed.
 */
export async function updateCheckpointAction(
  _prev: RecState,
  formData: FormData,
): Promise<RecState> {
  const user = await requireUser();
  const id = String(formData.get('checkpointId') ?? '');

  const checkpoint = await db.trainingCheckpoint.findUnique({
    where: { id },
    include: {
      trainingSession: {
        select: { id: true, recordedById: true, traineeId: true, status: true },
      },
    },
  });
  if (!checkpoint) return { error: 'That checkpoint no longer exists.' };

  const session = checkpoint.trainingSession;
  if (session.status !== 'RECORDING') {
    return { error: 'This round is finished, so its checkpoints can no longer be edited.' };
  }
  if (
    session.recordedById !== user.id &&
    session.traineeId !== user.id &&
    user.role !== 'ADMIN'
  ) {
    return { error: 'This is not your recording session.' };
  }

  const name = text(formData, 'name', 120);
  if (!name) return { error: 'Give the house or building a name.' };

  const quantityRaw = String(formData.get('quantity') ?? '').trim();
  const quantity = quantityRaw === '' ? null : Number(quantityRaw);
  if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0)) {
    return { error: 'Quantity must be a whole number.' };
  }

  await db.trainingCheckpoint.update({
    where: { id },
    data: {
      name,
      address: text(formData, 'address', 300) || name,
      deliveryType: text(formData, 'deliveryType', 80) || null,
      quantity,
      notes: text(formData, 'notes', MAX_NOTE) || null,
      nextVisitNote: text(formData, 'nextVisitNote', MAX_NOTE) || null,
    },
  });

  revalidatePath(`/record/${session.id}`);
  return { success: `Updated “${name}”.` };
}

/**
 * Replaces the round's list of house names mid-round.
 *
 * The list is normally pasted before setting off, but an agent who forgot, or
 * who was handed extra names on the way, should not have to restart the round
 * to use the dropdown.
 */
export async function updateNameOptionsAction(
  _prev: RecState,
  formData: FormData,
): Promise<RecState> {
  const user = await requireUser();
  const sessionId = String(formData.get('sessionId') ?? '');

  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    select: { id: true, recordedById: true, traineeId: true, status: true },
  });
  if (!session) return { error: 'That recording session no longer exists.' };
  if (session.status !== 'RECORDING') return { error: 'This round is already finished.' };
  if (
    session.recordedById !== user.id &&
    session.traineeId !== user.id &&
    user.role !== 'ADMIN'
  ) {
    return { error: 'This is not your recording session.' };
  }

  const names = parseNameOptions(String(formData.get('nameOptions') ?? ''));
  const types = parseNameOptions(String(formData.get('typeOptions') ?? ''));

  await db.trainingSession.update({
    where: { id: sessionId },
    data: {
      nameOptions: names.length > 0 ? names.join('\n') : null,
      typeOptions: types.length > 0 ? types.join('\n') : null,
    },
  });

  revalidatePath(`/record/${sessionId}`);
  const parts = [
    names.length > 0 ? `${names.length} name${names.length === 1 ? '' : 's'}` : null,
    types.length > 0 ? `${types.length} package type${types.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  return {
    success:
      parts.length > 0
        ? `Saved for this round: ${parts.join(' and ')}.`
        : 'Lists cleared for this round.',
  };
}

export async function deleteCheckpointAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('checkpointId') ?? '');

  const checkpoint = await db.trainingCheckpoint.findUnique({
    where: { id },
    include: { trainingSession: { select: { recordedById: true, traineeId: true, id: true, status: true } } },
  });
  if (!checkpoint) return;

  const session = checkpoint.trainingSession;
  // Only removable while still recording — a finished session is a record of
  // what happened and should not be quietly edited.
  if (session.status !== 'RECORDING') return;
  if (session.recordedById !== user.id && session.traineeId !== user.id && user.role !== 'ADMIN') {
    return;
  }

  await db.trainingCheckpoint.delete({ where: { id } });
  revalidatePath(`/record/${session.id}`);
}

// ------------------------------------------------------------ finish -------

export async function endRecordingAction(_prev: RecState, formData: FormData): Promise<RecState> {
  const user = await requireUser();
  const sessionId = String(formData.get('sessionId') ?? '');

  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    include: { checkpoints: true },
  });
  if (!session) return { error: 'That recording session no longer exists.' };
  if (session.recordedById !== user.id && session.traineeId !== user.id && user.role !== 'ADMIN') {
    return { error: 'This is not your recording session.' };
  }
  if (session.status !== 'RECORDING') return { error: 'This session is already finished.' };

  const track: number[][] = session.geometry ? JSON.parse(session.geometry) : [];
  let distance = 0;
  for (let i = 1; i < track.length; i++) {
    distance += haversine(
      { lat: track[i - 1][1], lng: track[i - 1][0] },
      { lat: track[i][1], lng: track[i][0] },
    );
  }

  const endedAt = new Date();
  await db.trainingSession.update({
    where: { id: sessionId },
    data: {
      status: 'COMPLETED',
      endedAt,
      distance,
      duration: Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000),
    },
  });

  revalidatePath('/training-routes');
  revalidatePath('/record');
  redirect(`/training-routes/${sessionId}?finished=1`);
}

export async function abandonRecordingAction(formData: FormData) {
  const user = await requireUser();
  const sessionId = String(formData.get('sessionId') ?? '');

  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    select: { recordedById: true, traineeId: true },
  });
  if (!session) return;
  if (session.recordedById !== user.id && session.traineeId !== user.id && user.role !== 'ADMIN') {
    return;
  }

  // Kept, not deleted — an abandoned round still shows where someone went.
  await db.trainingSession.update({
    where: { id: sessionId },
    data: { status: 'ABANDONED', endedAt: new Date() },
  });
  redirect('/record');
}

// --------------------------------------------- turn a recording into a route */

/**
 * Day one becomes day two: every checkpoint becomes a permanent delivery
 * location, and the whole set becomes an optimised route.
 *
 * Locations are matched by proximity first, so recording the same street twice
 * does not create duplicate buildings.
 */
export async function generateRouteFromSessionAction(
  _prev: RecState,
  formData: FormData,
): Promise<RecState> {
  const user = await requireCapability('create_routes');
  const sessionId = String(formData.get('sessionId') ?? '');

  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    include: { checkpoints: { orderBy: { sequence: 'asc' } } },
  });
  if (!session) return { error: 'That session no longer exists.' };
  if (session.checkpoints.length === 0) {
    return { error: 'This session has no checkpoints, so there is nothing to turn into a route.' };
  }
  if (session.generatedRouteId) {
    return {
      info: 'A route has already been generated from this session. Open it from the Routes page.',
    };
  }

  const existing = await db.deliveryLocation.findMany({
    where: { status: { in: ['ACTIVE', 'PAUSED'] } },
    select: { id: true, latitude: true, longitude: true },
  });

  const locationIds: string[] = [];

  for (const checkpoint of session.checkpoints) {
    const near = existing.find(
      (l) =>
        haversine(
          { lat: checkpoint.latitude, lng: checkpoint.longitude },
          { lat: l.latitude, lng: l.longitude },
        ) < 40,
    );

    if (near) {
      locationIds.push(near.id);
      continue;
    }

    const created = await db.deliveryLocation.create({
      data: {
        name: checkpoint.name,
        buildingName: checkpoint.name,
        address: checkpoint.address,
        latitude: checkpoint.latitude,
        longitude: checkpoint.longitude,
        notes: checkpoint.notes,
        floor: checkpoint.floor,
        unit: checkpoint.unit,
        entranceInstructions: checkpoint.entranceInstructions,
        photo: checkpoint.photoUrl,
      },
    });
    existing.push({ id: created.id, latitude: created.latitude, longitude: created.longitude });
    locationIds.push(created.id);

    // A recorded house with a delivery type is a real recurring delivery, so
    // give it a subscription — otherwise it would be filtered out of every
    // generated route as having nothing to deliver.
    if (checkpoint.deliveryType) {
      await db.subscription.create({
        data: {
          deliveryLocationId: created.id,
          customerId: checkpoint.name,
          productType: checkpoint.deliveryType,
          quantity: checkpoint.quantity ?? 1,
          frequency: 'DAILY',
          specialInstructions: checkpoint.nextVisitNote,
        },
      });
    }

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOCATION_CREATED',
        entityType: 'DeliveryLocation',
        entityId: created.id,
        newValue: created.name,
        reason: `Recorded during training session “${session.routeName}”`,
      },
    });
  }

  const locations = await db.deliveryLocation.findMany({
    where: { id: { in: locationIds } },
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  const first = session.checkpoints[0];
  const start: Point = {
    id: 'start',
    name: 'Start',
    lat: first.latitude,
    lng: first.longitude,
  };
  const stops: Point[] = locations.map((l) => ({
    id: l.id,
    name: l.name,
    lat: l.latitude,
    lng: l.longitude,
  }));

  const optimized = await refineWithOsrm(optimizeRoute(start, start, stops));

  // Assign the route to whoever recorded it, when they are a driver, so it
  // appears as theirs and can be run without an admin step.
  const driverProfile = await db.driverProfile.findUnique({ where: { userId: user.id } });

  const route = await db.route.create({
    data: {
      name: session.routeName,
      status: 'ACTIVE',
      createdById: user.id,
      approvedById: user.role === 'ADMIN' ? user.id : null,
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

  await db.trainingSession.update({
    where: { id: sessionId },
    data: { generatedRouteId: route.id },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'ROUTE_CREATED',
      entityType: 'Route',
      entityId: route.id,
      newValue: route.name,
      reason: 'Generated from a recorded training session',
    },
  });

  revalidatePath('/routes');
  redirect(`/routes/${route.id}`);
}
