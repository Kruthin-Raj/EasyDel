#!/usr/bin/env node
/**
 * Fixtures for the end-to-end checks in `apps/web/tests/e2e`.
 *
 *   node scripts/test-fixtures.mjs setup     # create them, print their ids
 *   node scripts/test-fixtures.mjs reset     # clear open runs/recordings only
 *   node scripts/test-fixtures.mjs destroy   # remove every fixture row
 *   node scripts/test-fixtures.mjs status    # what exists right now
 *
 * Everything created here is tagged `easydel-e2e` in its email, name or route
 * name, and every delete is scoped by that tag.
 *
 * Why the tag matters
 * -------------------
 * A cleanup that filters on status alone ("delete runs where status =
 * RECORDING") once removed a real in-progress round belonging to an actual
 * driver, and a later mistake wiped the whole database. Scope by identity, not
 * by state, and never let a cleanup match a row it did not create.
 *
 * `reset` exists because the e2e scripts start runs and recordings. Without it
 * a second execution finds a round already open and reports working features
 * as broken.
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const TAG = 'easydel-e2e';
const EMAIL = {
  agentA: `${TAG}-a@easydel.invalid`,
  agentB: `${TAG}-b@easydel.invalid`,
  admin: `${TAG}-admin@easydel.invalid`,
};

const db = new PrismaClient();
const command = (process.argv[2] ?? 'status').toLowerCase();

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

function hash(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N: 65536, r: 8, p: 1, maxmem: 268435456 });
  return ['scrypt', 65536, 8, 1, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Every user id belonging to a fixture account. */
async function fixtureUserIds() {
  const users = await db.user.findMany({
    where: { email: { contains: TAG } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

// ------------------------------------------------------------------ setup ---

async function setup() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error(`${RED}ADMIN_PASSWORD is not set — the e2e scripts sign in with it.${OFF}`);
    process.exit(1);
  }

  async function account(email, firstName, role) {
    const user = await db.user.upsert({
      where: { email },
      update: { role, emailVerified: true, passwordHash: hash(password) },
      create: {
        email,
        firstName,
        lastName: TAG,
        role,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        passwordHash: hash(password),
      },
    });
    if (role === 'DELIVERY_AGENT') {
      const profile = await db.driverProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, vehicleType: 'Bike' },
      });
      return { user, profile };
    }
    return { user, profile: null };
  }

  const a = await account(EMAIL.agentA, 'AgentA', 'DELIVERY_AGENT');
  const b = await account(EMAIL.agentB, 'AgentB', 'DELIVERY_AGENT');
  await account(EMAIL.admin, 'AdminE2E', 'ADMIN');

  // A house only agent A ever delivers to. The isolation checks assert that
  // agent B can see none of these strings anywhere in the UI.
  const location = await db.deliveryLocation.create({
    data: {
      name: `${TAG} Secret House`,
      buildingName: `${TAG} Secret House`,
      address: `${TAG} 42 Private Lane`,
      latitude: 13.6288,
      longitude: 79.4192,
    },
  });
  const subscription = await db.subscription.create({
    data: {
      deliveryLocationId: location.id,
      customerId: `${TAG} Mr Confidential`,
      productType: 'Large package',
      quantity: 3,
      frequency: 'DAILY',
    },
  });

  // A second stop, so a delivery can be recorded mid-round rather than ending
  // the round — which is what the "still in your bag" note needs.
  const second = await db.deliveryLocation.create({
    data: {
      name: `${TAG} Second House`,
      buildingName: `${TAG} Second House`,
      address: `${TAG} 9 Second Lane`,
      latitude: 13.632,
      longitude: 79.423,
    },
  });
  const secondSub = await db.subscription.create({
    data: {
      deliveryLocationId: second.id,
      customerId: `${TAG} Mrs Two`,
      productType: 'Small package',
      quantity: 2,
      frequency: 'DAILY',
    },
  });

  const route = await db.route.create({
    data: {
      name: `${TAG} A's round`,
      status: 'ACTIVE',
      createdById: a.user.id,
      driverId: a.profile.id,
    },
  });
  const version = await db.routeVersion.create({
    data: {
      routeId: route.id,
      versionNumber: 1,
      startLocationName: 'Start',
      startLatitude: 13.6288,
      startLongitude: 79.4192,
      totalDistance: 1200,
      estimatedDuration: 600,
    },
  });
  await db.routeStop.createMany({
    data: [
      { routeVersionId: version.id, deliveryLocationId: location.id, sequence: 1 },
      { routeVersionId: version.id, deliveryLocationId: second.id, sequence: 2 },
    ],
  });

  // A finished run with one delivery, so the delivery-report page has content
  // and agent B has something concrete they must not be able to reach.
  const run = await db.routeRun.create({
    data: {
      routeVersionId: version.id,
      driverId: a.user.id,
      status: 'COMPLETED',
      endedAt: new Date(),
    },
  });
  const delivery = await db.delivery.create({
    data: {
      routeVersionId: version.id,
      routeRunId: run.id,
      subscriptionId: subscription.id,
      status: 'DELIVERED',
      quantity: 3,
      timestamp: new Date(),
      latitude: 13.6288,
      longitude: 79.4192,
      // A note typed at the door, and repeated at the next stop, so the round
      // report's "said more than once" grouping has something to group.
      notes: 'box not returned',
    },
  });
  await db.delivery.create({
    data: {
      routeVersionId: version.id,
      routeRunId: run.id,
      subscriptionId: secondSub.id,
      status: 'DELIVERED',
      quantity: 2,
      timestamp: new Date(),
      notes: 'box not returned',
    },
  });
  await db.issue.create({
    data: {
      reportedBy: a.user.id,
      entityType: 'Delivery',
      entityId: delivery.id,
      description: `${TAG} A's private issue note`,
      category: 'ACCESS',
      routeRunId: run.id,
    },
  });

  // Something of B's own, so "B sees their own work" is a real assertion and
  // not just an empty page passing by default.
  const bRoute = await db.route.create({
    data: {
      name: `${TAG} B's round`,
      status: 'ACTIVE',
      createdById: b.user.id,
      driverId: b.profile.id,
    },
  });
  await db.routeVersion.create({
    data: { routeId: bRoute.id, versionNumber: 1, startLatitude: 13.63, startLongitude: 79.42 },
  });

  const ids = { deliveryId: delivery.id, routeA: route.id, routeB: bRoute.id };
  console.error(`${GREEN}Fixtures created.${OFF} ${DIM}Tag: ${TAG}${OFF}`);
  // stdout carries only JSON, so a caller can pipe it.
  console.log(JSON.stringify(ids));
}

// ------------------------------------------------------------------ reset ---

async function reset() {
  const ids = await fixtureUserIds();
  if (ids.length === 0) {
    console.log('No fixture accounts — nothing to reset. Run `setup` first.');
    return;
  }

  const openRuns = await db.routeRun.findMany({
    where: { driverId: { in: ids }, status: 'IN_PROGRESS' },
    select: { id: true },
  });
  const runIds = openRuns.map((r) => r.id);
  await db.delivery.deleteMany({ where: { routeRunId: { in: runIds } } });
  await db.issue.deleteMany({ where: { routeRunId: { in: runIds } } });
  const runs = await db.routeRun.deleteMany({ where: { id: { in: runIds } } });

  const openSessions = await db.trainingSession.findMany({
    where: { recordedById: { in: ids }, status: 'RECORDING' },
    select: { id: true },
  });
  const sessionIds = openSessions.map((s) => s.id);
  await db.trainingCheckpoint.deleteMany({
    where: { trainingSessionId: { in: sessionIds } },
  });
  const sessions = await db.trainingSession.deleteMany({ where: { id: { in: sessionIds } } });

  console.log(
    `${GREEN}Reset.${OFF} Cleared ${runs.count} open run(s) and ${sessions.count} open recording(s).`,
  );
}

// ---------------------------------------------------------------- destroy ---

async function destroy() {
  const ids = await fixtureUserIds();

  const routes = await db.route.findMany({
    where: { OR: [{ createdById: { in: ids } }, { name: { startsWith: TAG } }] },
    select: { id: true },
  });
  const routeIds = routes.map((r) => r.id);
  const versions = await db.routeVersion.findMany({
    where: { routeId: { in: routeIds } },
    select: { id: true },
  });
  const versionIds = versions.map((v) => v.id);
  const runs = await db.routeRun.findMany({
    where: { OR: [{ driverId: { in: ids } }, { routeVersionId: { in: versionIds } }] },
    select: { id: true },
  });
  const runIds = runs.map((r) => r.id);

  await db.issue.deleteMany({
    where: {
      OR: [
        { reportedBy: { in: ids } },
        { routeRunId: { in: runIds } },
        { description: { contains: TAG } },
      ],
    },
  });
  await db.delivery.deleteMany({
    where: { OR: [{ routeRunId: { in: runIds } }, { routeVersionId: { in: versionIds } }] },
  });
  await db.routeRun.deleteMany({ where: { id: { in: runIds } } });
  await db.routeStop.deleteMany({ where: { routeVersionId: { in: versionIds } } });
  await db.routeVersion.deleteMany({ where: { routeId: { in: routeIds } } });
  await db.route.deleteMany({ where: { id: { in: routeIds } } });

  const sessions = await db.trainingSession.findMany({
    where: {
      OR: [
        { recordedById: { in: ids } },
        { traineeId: { in: ids } },
        { mentorId: { in: ids } },
        { routeName: { startsWith: TAG } },
      ],
    },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);
  await db.trainingCheckpoint.deleteMany({ where: { trainingSessionId: { in: sessionIds } } });
  await db.trainingSession.deleteMany({ where: { id: { in: sessionIds } } });

  const locations = await db.deliveryLocation.findMany({
    where: { name: { startsWith: TAG } },
    select: { id: true },
  });
  const locationIds = locations.map((l) => l.id);
  await db.subscription.deleteMany({ where: { deliveryLocationId: { in: locationIds } } });
  await db.deliveryLocation.deleteMany({ where: { id: { in: locationIds } } });

  await db.auditLog.deleteMany({ where: { userId: { in: ids } } });
  // Per-agent package-type lists these accounts may have saved.
  for (const id of ids) {
    await db.setting.deleteMany({ where: { key: `checkpoint_type_options:${id}` } });
  }
  await db.driverProfile.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });

  console.log(`${GREEN}Fixtures destroyed.${OFF}`);
  await status();
}

// ----------------------------------------------------------------- status ---

async function status() {
  const accounts = await db.user.findMany({
    where: { email: { contains: TAG } },
    select: { email: true, role: true },
  });
  const [routes, locations, sessions] = await Promise.all([
    db.route.count({ where: { name: { startsWith: TAG } } }),
    db.deliveryLocation.count({ where: { name: { startsWith: TAG } } }),
    db.trainingSession.count({ where: { routeName: { startsWith: TAG } } }),
  ]);

  console.log(`\n${DIM}Fixture rows tagged "${TAG}":${OFF}`);
  console.log(`  accounts  ${accounts.length}${accounts.length ? ` (${accounts.map((a) => a.role).join(', ')})` : ''}`);
  console.log(`  routes    ${routes}`);
  console.log(`  locations ${locations}`);
  console.log(`  rounds    ${sessions}`);

  // The point of printing this: prove a cleanup removed only fixtures.
  const real = await db.user.findMany({
    where: { email: { not: { contains: TAG } } },
    select: { email: true, role: true },
  });
  console.log(`\n${DIM}Real accounts (must be untouched):${OFF}`);
  if (real.length === 0) console.log(`  ${RED}NONE — the database has no real users.${OFF}`);
  else for (const u of real) console.log(`  ${u.email} (${u.role})`);
  console.log('');
}

const commands = { setup, reset, destroy, status };
if (!commands[command]) {
  console.error(`Unknown command "${command}". Use: setup | reset | destroy | status`);
  await db.$disconnect();
  process.exit(1);
}

await commands[command]();
await db.$disconnect();
