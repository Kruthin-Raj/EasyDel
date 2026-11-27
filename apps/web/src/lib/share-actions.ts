'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from './db';
import { requireUser } from './auth';
import { formatSharePath, normalizeShareInput } from './share-code';
import { allocateUniqueShareCode, canAccessRoute } from './route-sharing';

export type ShareActionState = { error?: string; success?: string } | null;

/**
 * Resolves a pasted share code or share link and takes the user to that
 * route's share preview page so they can inspect, save, memorize, or run it.
 */
export async function joinRouteByCodeAction(
  _prev: ShareActionState,
  formData: FormData,
): Promise<ShareActionState> {
  await requireUser();

  const raw = String(formData.get('code') ?? '');
  const code = normalizeShareInput(raw);
  if (!code) {
    return { error: 'Enter a valid route code (e.g. K7M9P2X4) or paste a share link.' };
  }

  const route = await db.route.findUnique({
    where: { shareCode: code },
    select: { id: true, shareCode: true },
  });

  if (!route || !route.shareCode) {
    return { error: `No route found for code “${code}”. Check the code and try again.` };
  }

  redirect(formatSharePath(route.shareCode));
}

/**
 * Saves a shared route into the signed-in user's own route list (`SavedRoute`)
 * so it stays available for memorization and daily deliveries.
 */
export async function saveRouteAction(
  _prev: ShareActionState,
  formData: FormData,
): Promise<ShareActionState> {
  const user = await requireUser();
  const routeId = String(formData.get('routeId') ?? '').trim();
  const codeRaw = String(formData.get('code') ?? '').trim();
  const code = codeRaw ? normalizeShareInput(codeRaw) : null;

  const route = routeId
    ? await db.route.findUnique({
        where: { id: routeId },
        select: { id: true, name: true, status: true, createdById: true, shareCode: true },
      })
    : code
      ? await db.route.findUnique({
          where: { shareCode: code },
          select: { id: true, name: true, status: true, createdById: true, shareCode: true },
        })
      : null;

  if (!route) {
    return { error: 'That shared route could not be found.' };
  }

  if (route.status === 'ARCHIVED') {
    return { error: 'This route has been archived by its creator and cannot be saved.' };
  }

  if (route.createdById !== user.id) {
    await db.savedRoute.upsert({
      where: { userId_routeId: { userId: user.id, routeId: route.id } },
      update: {},
      create: { userId: user.id, routeId: route.id },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'ROUTE_SAVED',
        entityType: 'Route',
        entityId: route.id,
        newValue: route.name,
        reason: route.shareCode ? `Saved via share code ${route.shareCode}` : 'Saved via share link',
      },
    });
  }

  revalidatePath('/routes');
  revalidatePath('/');
  revalidatePath(`/routes/${route.id}`);
  if (route.shareCode) revalidatePath(formatSharePath(route.shareCode));
  redirect(`/routes/${route.id}`);
}

/** Removes a shared route from the user's saved routes without touching the original. */
export async function unsaveRouteAction(formData: FormData) {
  const user = await requireUser();
  const routeId = String(formData.get('routeId') ?? '').trim();
  if (!routeId) return;

  await db.savedRoute.deleteMany({
    where: { userId: user.id, routeId },
  });

  revalidatePath('/routes');
  revalidatePath('/');
  revalidatePath(`/routes/${routeId}`);
  redirect('/routes');
}

/** Rotates a route's share code (creator only). */
export async function regenerateShareCodeAction(formData: FormData) {
  const user = await requireUser();
  const routeId = String(formData.get('routeId') ?? '').trim();
  if (!routeId) return;

  const route = await db.route.findUnique({
    where: { id: routeId },
    select: { id: true, createdById: true, shareCode: true },
  });
  if (!route || route.createdById !== user.id) return;

  const nextCode = await allocateUniqueShareCode();
  await db.route.update({
    where: { id: routeId },
    data: { shareCode: nextCode },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'ROUTE_SHARE_CODE_ROTATED',
      entityType: 'Route',
      entityId: routeId,
      oldValue: route.shareCode,
      newValue: nextCode,
    },
  });

  revalidatePath('/routes');
  revalidatePath(`/routes/${routeId}`);
}

/**
 * Clones a route (owned or accessed via share code) into a brand-new editable
 * route belonging to the current user, with its own unique share code.
 */
export async function duplicateRouteAction(
  _prev: ShareActionState,
  formData: FormData,
): Promise<ShareActionState> {
  const user = await requireUser();
  const routeId = String(formData.get('routeId') ?? '').trim();
  const shareCodeRaw = String(formData.get('shareCode') ?? '').trim();
  const normalizedCode = shareCodeRaw ? normalizeShareInput(shareCodeRaw) : null;

  const source = await db.route.findUnique({
    where: { id: routeId },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
        include: { stops: { orderBy: { sequence: 'asc' } } },
      },
    },
  });

  if (!source) return { error: 'Source route not found.' };

  const hasAccess =
    (await canAccessRoute(user.id, source.id)) ||
    (normalizedCode !== null && source.shareCode === normalizedCode);

  if (!hasAccess) {
    return { error: 'You need the share code or link for this route before copying it.' };
  }

  const latest = source.versions[0];
  if (!latest) return { error: 'This route has no stops version to copy yet.' };

  const customName = String(formData.get('name') ?? '').trim().slice(0, 120);
  const newName = customName || `${source.name} (Copy)`.slice(0, 120);
  const shareCode = await allocateUniqueShareCode();

  const created = await db.route.create({
    data: {
      name: newName,
      shareCode,
      status: 'ACTIVE',
      createdById: user.id,
      approvedById: user.id,
    },
  });

  const version = await db.routeVersion.create({
    data: {
      routeId: created.id,
      versionNumber: 1,
      startLocationName: latest.startLocationName,
      startLatitude: latest.startLatitude,
      startLongitude: latest.startLongitude,
      endLocationName: latest.endLocationName,
      endLatitude: latest.endLatitude,
      endLongitude: latest.endLongitude,
      totalDistance: latest.totalDistance,
      estimatedDuration: latest.estimatedDuration,
      routeGeometry: latest.routeGeometry,
    },
  });

  if (latest.stops.length > 0) {
    await db.routeStop.createMany({
      data: latest.stops.map((s) => ({
        routeVersionId: version.id,
        deliveryLocationId: s.deliveryLocationId,
        sequence: s.sequence,
        distanceFromPrevious: s.distanceFromPrevious,
        durationFromPrevious: s.durationFromPrevious,
      })),
    });
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'ROUTE_CREATED',
      entityType: 'Route',
      entityId: created.id,
      newValue: created.name,
      reason: `Copied from route “${source.name}”`,
    },
  });

  revalidatePath('/routes');
  revalidatePath('/');
  redirect(`/routes/${created.id}`);
}
