import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from './db';
import {
  canSeeDelivery,
  canSeeRun,
  canSeeTrainingSession,
  deliveryWhere,
  issueWhere,
  locationWhere,
  ownedRouteWhere,
  routeWhere,
  runWhere,
  trainingWhere,
} from './scope';
import {
  allocateUniqueShareCode,
  canAccessRoute,
  ensureLocationShareCode,
  ensureRouteShareCode,
} from './route-sharing';
import { SHARE_CODE_ALPHABET, SHARE_CODE_LENGTH } from './share-code';
import type { SessionUser } from './auth';

/**
 * Integration tests verifying strict multi-user data isolation and peer-to-peer
 * route sharing / memorization persistence against the real Postgres database.
 */

const TAG = 'wf-iso-test';
const EMAIL_A = `${TAG}-a@easydel.invalid`;
const EMAIL_B = `${TAG}-b@easydel.invalid`;

async function cleanup() {
  const users = await db.user.findMany({
    where: { email: { in: [EMAIL_A, EMAIL_B] } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  const routes = await db.route.findMany({
    where: { OR: [{ createdById: { in: userIds } }, { name: { startsWith: TAG } }] },
    select: { id: true },
  });
  const routeIds = routes.map((r) => r.id);
  const versions = await db.routeVersion.findMany({
    where: { routeId: { in: routeIds } },
    select: { id: true },
  });
  const versionIds = versions.map((v) => v.id);
  const runs = await db.routeRun.findMany({
    where: { OR: [{ driverId: { in: userIds } }, { routeVersionId: { in: versionIds } }] },
    select: { id: true },
  });
  const runIds = runs.map((r) => r.id);

  await db.issue.deleteMany({
    where: { OR: [{ reportedBy: { in: userIds } }, { routeRunId: { in: runIds } }] },
  });
  await db.delivery.deleteMany({
    where: { OR: [{ routeRunId: { in: runIds } }, { routeVersionId: { in: versionIds } }] },
  });
  await db.routeRun.deleteMany({ where: { id: { in: runIds } } });
  await db.routeStop.deleteMany({ where: { routeVersionId: { in: versionIds } } });
  await db.routeVersion.deleteMany({ where: { id: { in: versionIds } } });
  await db.savedRoute.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { routeId: { in: routeIds } }] },
  });
  await db.route.deleteMany({ where: { id: { in: routeIds } } });

  const sessions = await db.trainingSession.findMany({
    where: { OR: [{ recordedById: { in: userIds } }, { traineeId: { in: userIds } }] },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);
  await db.trainingCheckpoint.deleteMany({ where: { trainingSessionId: { in: sessionIds } } });
  await db.trainingSession.deleteMany({ where: { id: { in: sessionIds } } });

  const locs = await db.deliveryLocation.findMany({
    where: { OR: [{ createdById: { in: userIds } }, { name: { startsWith: TAG } }] },
    select: { id: true },
  });
  const locIds = locs.map((l) => l.id);
  await db.subscription.deleteMany({ where: { deliveryLocationId: { in: locIds } } });
  await db.locationHistory.deleteMany({ where: { deliveryLocationId: { in: locIds } } });
  await db.deliveryLocation.deleteMany({ where: { id: { in: locIds } } });

  await db.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

async function createTestUser(email: string, role: 'ADMIN' | 'DELIVERY_AGENT', firstName: string): Promise<SessionUser> {
  const row = await db.user.create({
    data: {
      email,
      firstName,
      lastName: 'Tester',
      role,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    firstName: row.firstName,
    lastName: row.lastName,
  };
}

describe('multi-user isolation and peer sharing persistence', () => {
  it('isolates locations, routes, runs, deliveries, issues, and recorded rounds per user', async () => {
    // Even if userA carries legacy role ADMIN in DB, userA must not see userB's data.
    const userA = await createTestUser(EMAIL_A, 'ADMIN', 'Alice');
    const userB = await createTestUser(EMAIL_B, 'DELIVERY_AGENT', 'Bob');

    const locA = await db.deliveryLocation.create({
      data: {
        name: `${TAG} Alice Door`,
        address: '10 Rose Lane',
        latitude: 13.6288,
        longitude: 79.4192,
        notes: 'Keep dry near gate',
        nextVisitNote: 'Collect empty milk bottle tomorrow',
        floor: '2',
        unit: '2B',
        entranceInstructions: 'Side wooden gate',
        securityInstructions: 'Ask watchman Raju',
        photo: 'training/test/alice-door.jpg',
        createdById: userA.id,
      },
    });
    const subA = await db.subscription.create({
      data: {
        deliveryLocationId: locA.id,
        customerId: 'Mrs Alice Customer',
        productType: 'Newspaper',
        quantity: 2,
        frequency: 'DAILY',
      },
    });

    const locB = await db.deliveryLocation.create({
      data: {
        name: `${TAG} Bob Door`,
        address: '22 Oak St',
        latitude: 13.64,
        longitude: 79.43,
        createdById: userB.id,
      },
    });

    const routeA = await db.route.create({
      data: {
        name: `${TAG} Morning Newspaper Beat`,
        shareCode: await allocateUniqueShareCode(),
        status: 'ACTIVE',
        createdById: userA.id,
      },
    });
    const versionA = await db.routeVersion.create({
      data: { routeId: routeA.id, versionNumber: 1, startLatitude: 13.62, startLongitude: 79.41 },
    });
    await db.routeStop.create({
      data: { routeVersionId: versionA.id, deliveryLocationId: locA.id, sequence: 1 },
    });

    const runA = await db.routeRun.create({
      data: { routeVersionId: versionA.id, driverId: userA.id, status: 'COMPLETED', endedAt: new Date() },
    });
    const delA = await db.delivery.create({
      data: {
        routeVersionId: versionA.id,
        routeRunId: runA.id,
        subscriptionId: subA.id,
        status: 'DELIVERED',
        quantity: 2,
      },
    });
    await db.issue.create({
      data: {
        reportedBy: userA.id,
        entityType: 'Location',
        entityId: locA.id,
        description: `${TAG} dog blocked gate`,
        routeRunId: runA.id,
      },
    });
    const sessionA = await db.trainingSession.create({
      data: {
        mentorId: userA.id,
        traineeId: userA.id,
        recordedById: userA.id,
        routeName: `${TAG} Recorded Round`,
        status: 'COMPLETED',
      },
    });

    // 1. Strict location isolation
    const aLocs = await db.deliveryLocation.findMany({ where: locationWhere(userA) });
    const bLocs = await db.deliveryLocation.findMany({ where: locationWhere(userB) });
    expect(aLocs.map((l) => l.id)).toEqual([locA.id]);
    expect(bLocs.map((l) => l.id)).toEqual([locB.id]);

    // 2. Routes are private until shared via SavedRoute
    expect(await canAccessRoute(userA.id, routeA.id)).toBe(true);
    expect(await canAccessRoute(userB.id, routeA.id)).toBe(false);
    expect(await db.route.findMany({ where: await routeWhere(userB) })).toHaveLength(0);

    // 3. When Bob saves Alice's route, Bob can access the route to memorize/run,
    //    but Bob still does NOT own routeA, see Alice's locations list, or see Alice's runs/deliveries/issues/rounds.
    await db.savedRoute.create({ data: { userId: userB.id, routeId: routeA.id } });

    expect(await canAccessRoute(userB.id, routeA.id)).toBe(true);
    expect((await db.route.findMany({ where: await routeWhere(userB) })).map((r) => r.id)).toEqual([routeA.id]);
    expect(await db.route.findMany({ where: ownedRouteWhere(userB) })).toHaveLength(0);
    expect((await db.deliveryLocation.findMany({ where: locationWhere(userB) })).map((l) => l.id)).toEqual([locB.id]);

    expect(await canSeeRun(userB, runA.id)).toBe(false);
    expect(await canSeeDelivery(userB, delA.id)).toBe(false);
    expect(await canSeeTrainingSession(userB, sessionA.id)).toBe(false);
    expect(await db.routeRun.findMany({ where: runWhere(userB) })).toHaveLength(0);
    expect(await db.delivery.findMany({ where: deliveryWhere(userB) })).toHaveLength(0);
    expect(await db.issue.findMany({ where: issueWhere(userB) })).toHaveLength(0);
    expect(await db.trainingSession.findMany({ where: trainingWhere(userB) })).toHaveLength(0);
  });

  it('allocates valid share codes and idempotently backfills null legacy routes', async () => {
    const userA = await createTestUser(EMAIL_A, 'DELIVERY_AGENT', 'Alice');
    const code = await allocateUniqueShareCode();

    expect(code).toHaveLength(SHARE_CODE_LENGTH);
    for (const ch of code) {
      expect(SHARE_CODE_ALPHABET).toContain(ch);
    }

    const routeWithoutCode = await db.route.create({
      data: {
        name: `${TAG} Legacy Route`,
        shareCode: null,
        status: 'ACTIVE',
        createdById: userA.id,
      },
    });

    const assigned = await ensureRouteShareCode(routeWithoutCode.id);
    expect(assigned).toBeTruthy();
    expect(assigned).toHaveLength(SHARE_CODE_LENGTH);

    // Calling again returns the same code without overwriting it.
    expect(await ensureRouteShareCode(routeWithoutCode.id)).toBe(assigned);
    expect(await ensureRouteShareCode('00000000-0000-4000-8000-000000000000')).toBeNull();

    // Location share codes allocate & idempotently backfill too.
    const locWithoutCode = await db.deliveryLocation.create({
      data: {
        name: `${TAG} Legacy House`,
        address: '99 Legacy Way',
        latitude: 13.631,
        longitude: 79.421,
        shareCode: null,
        createdById: userA.id,
      },
    });
    const locAssigned = await ensureLocationShareCode(locWithoutCode.id);
    expect(locAssigned).toBeTruthy();
    expect(locAssigned).toHaveLength(SHARE_CODE_LENGTH);
    expect(locAssigned).not.toBe(assigned);
    expect(await ensureLocationShareCode(locWithoutCode.id)).toBe(locAssigned);
    expect(await ensureLocationShareCode('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
