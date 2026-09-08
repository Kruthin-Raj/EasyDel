import type { Prisma } from '@prisma/client';
import type { SessionUser } from './auth';
import { db } from './db';

/*
 * Row-level visibility.
 *
 * Every console page used to check only that *someone* was signed in and then
 * query globally, so one agent's Delivery history listed every other agent's
 * work. These helpers produce the `where` clause that was missing.
 *
 * Two deliberately different rules:
 *
 *   Personal records — deliveries, issues, runs, GPS traces — are scoped to the
 *   person who produced them. This is the leak these helpers exist to close.
 *
 *   Shared work — routes — is visible when you created it, when it is assigned
 *   to you, or when nobody has claimed it. A route is a job to be picked up,
 *   and the run page already lets an agent start an unassigned route, so
 *   hiding those would contradict shipped behaviour.
 *
 * ADMIN and MENTOR see everything: an admin runs the operation, and a mentor
 * reviews the agents they train. That is about *data*; user management is a
 * separate question and stays ADMIN-only — see `permissions.ts`.
 *
 * Each helper returns a plain object so callers can spread it alongside their
 * own filters (`{ ...scope, status }`), which Prisma treats as AND.
 */

/** True when the role is entitled to the whole operation's data. */
export function seesAllData(user: SessionUser) {
  return user.role === 'ADMIN' || user.role === 'MENTOR';
}

/** The caller's DriverProfile id, or null if they have no driver profile. */
export async function driverProfileIdFor(userId: string): Promise<string | null> {
  const profile = await db.driverProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  return profile?.id ?? null;
}

/**
 * Deliveries: strictly the runs this person performed.
 *
 * Deliveries predating the RouteRun model have a null `routeRunId` and are
 * therefore invisible to agents. That is the safe direction to fail — they are
 * someone else's record until proven otherwise, and an admin can still see them.
 */
export function deliveryWhere(user: SessionUser): Prisma.DeliveryWhereInput {
  if (seesAllData(user)) return {};
  return { routeRun: { driverId: user.id } };
}

/** Issues: strictly the ones this person reported. */
export function issueWhere(user: SessionUser): Prisma.IssueWhereInput {
  if (seesAllData(user)) return {};
  return { reportedBy: user.id };
}

/** Runs (and anything hanging off them): strictly this person's own. */
export function runWhere(user: SessionUser): Prisma.RouteRunWhereInput {
  if (seesAllData(user)) return {};
  return { driverId: user.id };
}

/** Routes: created by, assigned to, or unclaimed. */
export async function routeWhere(user: SessionUser): Promise<Prisma.RouteWhereInput> {
  if (seesAllData(user)) return {};

  const profileId = await driverProfileIdFor(user.id);
  return {
    OR: [
      { createdById: user.id },
      ...(profileId ? [{ driverId: profileId }] : []),
      { driverId: null },
    ],
  };
}

/** Training sessions: recorded by, being trained in, or mentored by the caller. */
export function trainingWhere(user: SessionUser): Prisma.TrainingSessionWhereInput {
  if (seesAllData(user)) return {};
  return {
    OR: [{ recordedById: user.id }, { traineeId: user.id }, { mentorId: user.id }],
  };
}

/**
 * Whether the caller may open one specific delivery.
 *
 * The detail page needs a yes/no answer rather than a filter, and re-deriving
 * the rule there would be a second place for it to drift.
 */
export async function canSeeRun(user: SessionUser, runId: string): Promise<boolean> {
  if (seesAllData(user)) return true;
  const hit = await db.routeRun.findFirst({
    where: { id: runId, ...runWhere(user) },
    select: { id: true },
  });
  return hit !== null;
}

export async function canSeeDelivery(user: SessionUser, deliveryId: string): Promise<boolean> {
  if (seesAllData(user)) return true;
  const hit = await db.delivery.findFirst({
    where: { id: deliveryId, ...deliveryWhere(user) },
    select: { id: true },
  });
  return hit !== null;
}
