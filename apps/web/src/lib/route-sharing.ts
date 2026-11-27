import { db } from './db';
import { generateShareCode } from './share-code';

/**
 * Generates a unique 8-character route share code, retrying on the vanishingly
 * rare chance of a collision.
 */
export async function allocateUniqueShareCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = generateShareCode();
    const existing = await db.route.findUnique({
      where: { shareCode: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error('Could not allocate a unique route share code.');
}

/**
 * Ensures a route has a share code, lazily backfilling legacy rows that were
 * created before share codes existed.
 */
export async function ensureRouteShareCode(routeId: string): Promise<string | null> {
  const route = await db.route.findUnique({
    where: { id: routeId },
    select: { id: true, shareCode: true },
  });
  if (!route) return null;
  if (route.shareCode) return route.shareCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await allocateUniqueShareCode();
    try {
      const updated = await db.route.update({
        where: { id: routeId },
        data: { shareCode: code },
        select: { shareCode: true },
      });
      return updated.shareCode;
    } catch {
      const refreshed = await db.route.findUnique({
        where: { id: routeId },
        select: { shareCode: true },
      });
      if (refreshed?.shareCode) return refreshed.shareCode;
    }
  }
  return null;
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
