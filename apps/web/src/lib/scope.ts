import type { Prisma } from '@prisma/client';
import type { SessionUser } from './auth';
import { db } from './db';

/*
 * Row-level visibility.
 *
 * Every user is equal — there is no admin or fleet supervisor peering into
 * other people's personal deliveries, runs, or GPS traces. Routes are shared
 * intentionally via unique share codes and links: saving a shared route adds
 * it to your route list for memorization and running your own deliveries.
 */

/** Deliveries: strictly the runs this user performed. */
export function deliveryWhere(user: SessionUser): Prisma.DeliveryWhereInput {
  return { routeRun: { driverId: user.id } };
}

/** Issues: strictly the ones this user reported. */
export function issueWhere(user: SessionUser): Prisma.IssueWhereInput {
  return { reportedBy: user.id };
}

/** Runs: strictly this user's own. */
export function runWhere(user: SessionUser): Prisma.RouteRunWhereInput {
  return { driverId: user.id };
}

/**
 * Routes: created by this user OR saved by them via a share code/link.
 */
export async function routeWhere(user: SessionUser): Promise<Prisma.RouteWhereInput> {
  return {
    OR: [
      { createdById: user.id },
      { savedBy: { some: { userId: user.id } } },
    ],
  };
}

/** Routes this user created and therefore owns/may edit. */
export function ownedRouteWhere(user: SessionUser): Prisma.RouteWhereInput {
  return { createdById: user.id };
}

/** Delivery locations: strictly the ones created by this user. */
export function locationWhere(user: SessionUser): Prisma.DeliveryLocationWhereInput {
  return { createdById: user.id };
}

/** Recorded rounds: created or recorded by this user. */
export function trainingWhere(user: SessionUser): Prisma.TrainingSessionWhereInput {
  return {
    OR: [{ recordedById: user.id }, { traineeId: user.id }, { mentorId: user.id }],
  };
}

export async function canSeeRun(user: SessionUser, runId: string): Promise<boolean> {
  const hit = await db.routeRun.findFirst({
    where: { id: runId, ...runWhere(user) },
    select: { id: true },
  });
  return hit !== null;
}

export async function canSeeDelivery(user: SessionUser, deliveryId: string): Promise<boolean> {
  const hit = await db.delivery.findFirst({
    where: { id: deliveryId, ...deliveryWhere(user) },
    select: { id: true },
  });
  return hit !== null;
}

export async function canSeeTrainingSession(
  user: SessionUser,
  sessionId: string,
): Promise<boolean> {
  const hit = await db.trainingSession.findFirst({
    where: { id: sessionId, ...trainingWhere(user) },
    select: { id: true },
  });
  return hit !== null;
}
