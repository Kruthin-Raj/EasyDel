import { db } from './db';
import { generateShareCode } from './share-code';

/**
 * Generates a unique 8-character share code (collision-free across both
 * routes and delivery locations), retrying on the vanishingly rare chance
 * of a collision.
 */
export async function allocateUniqueShareCode(): Promise<string> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const candidate = generateShareCode();
    const [existingRoute, existingLocation] = await Promise.all([
      db.route.findUnique({ where: { shareCode: candidate }, select: { id: true } }),
      db.deliveryLocation.findUnique({ where: { shareCode: candidate }, select: { id: true } }),
    ]);
    if (!existingRoute && !existingLocation) return candidate;
  }
  throw new Error('Could not allocate a unique share code.');
}

async function backfillShareCode(
  kind: 'route' | 'location',
  id: string,
): Promise<string | null> {
  const current =
    kind === 'route'
      ? await db.route.findUnique({ where: { id }, select: { id: true, shareCode: true } })
      : await db.deliveryLocation.findUnique({ where: { id }, select: { id: true, shareCode: true } });

  if (!current) return null;
  if (current.shareCode) return current.shareCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await allocateUniqueShareCode();
    try {
      const updated =
        kind === 'route'
          ? await db.route.update({ where: { id }, data: { shareCode: code }, select: { shareCode: true } })
          : await db.deliveryLocation.update({ where: { id }, data: { shareCode: code }, select: { shareCode: true } });
      return updated.shareCode;
    } catch {
      const refreshed =
        kind === 'route'
          ? await db.route.findUnique({ where: { id }, select: { shareCode: true } })
          : await db.deliveryLocation.findUnique({ where: { id }, select: { shareCode: true } });
      if (refreshed?.shareCode) return refreshed.shareCode;
    }
  }
  return null;
}

/**
 * Ensures a route has a share code, lazily backfilling legacy rows that were
 * created before share codes existed.
 */
export async function ensureRouteShareCode(routeId: string): Promise<string | null> {
  return backfillShareCode('route', routeId);
}

/**
 * Ensures a delivery location has a share code, lazily backfilling legacy rows.
 */
export async function ensureLocationShareCode(locationId: string): Promise<string | null> {
  return backfillShareCode('location', locationId);
}

/**
 * Resolves a shared location into a private copy owned by `userId`, copying
 * its house photo, instructions, coordinates, and active delivery items so
 * edits or archival stay isolated from the original creator.
 */
export async function resolveSharedLocationForUser(sourceLocationId: string, userId: string) {
  const source = await db.deliveryLocation.findUnique({
    where: { id: sourceLocationId },
    include: { subscriptions: { where: { status: 'ACTIVE' } } },
  });

  if (!source) {
    return { error: 'That shared location could not be found.' as const, location: null, cloned: false };
  }
  if (source.status === 'ARCHIVED') {
    return {
      error: 'This location was archived by its creator and can no longer be added.' as const,
      location: null,
      cloned: false,
    };
  }
  if (source.createdById === userId) {
    const code = source.shareCode ?? (await ensureLocationShareCode(source.id));
    return { error: null, location: { ...source, shareCode: code }, cloned: false };
  }

  // Reuse an active copy if the user already imported this exact location.
  const existing = await db.deliveryLocation.findFirst({
    where: {
      createdById: userId,
      status: { in: ['ACTIVE', 'PAUSED'] },
      name: source.name,
      latitude: { gte: source.latitude - 0.0002, lte: source.latitude + 0.0002 },
      longitude: { gte: source.longitude - 0.0002, lte: source.longitude + 0.0002 },
    },
  });
  if (existing) {
    return { error: null, location: existing, cloned: false };
  }

  const shareCode = await allocateUniqueShareCode();
  const created = await db.deliveryLocation.create({
    data: {
      name: source.name,
      buildingName: source.buildingName,
      address: source.address,
      latitude: source.latitude,
      longitude: source.longitude,
      photo: source.photo,
      notes: source.notes,
      nextVisitNote: source.nextVisitNote,
      floor: source.floor,
      unit: source.unit,
      entranceInstructions: source.entranceInstructions,
      securityInstructions: source.securityInstructions,
      shareCode,
      createdById: userId,
    },
  });

  if (source.subscriptions.length > 0) {
    await db.subscription.createMany({
      data: source.subscriptions.map((s) => ({
        deliveryLocationId: created.id,
        customerId: s.customerId ?? source.name,
        productType: s.productType,
        quantity: s.quantity,
        frequency: s.frequency,
        specialInstructions: s.specialInstructions,
      })),
    });
  } else {
    await db.subscription.create({
      data: {
        deliveryLocationId: created.id,
        customerId: source.name,
        productType: 'Package',
        quantity: 1,
        frequency: 'DAILY',
        status: 'ACTIVE',
      },
    });
  }

  await db.auditLog.create({
    data: {
      userId,
      action: 'LOCATION_IMPORTED_BY_CODE',
      entityType: 'DeliveryLocation',
      entityId: created.id,
      newValue: created.name,
      reason: source.shareCode ? `Added via location code ${source.shareCode}` : 'Added via shared link',
    },
  });

  return { error: null, location: created, cloned: true };
}

/**
 * True when the user created this route or has saved it via its share code/link.
 */
export async function canAccessRoute(userId: string, routeId: string): Promise<boolean> {
  const hit = await db.route.findFirst({
    where: {
      id: routeId,
      OR: [{ createdById: userId }, { savedBy: { some: { userId } } }],
    },
    select: { id: true },
  });
  return hit !== null;
}
