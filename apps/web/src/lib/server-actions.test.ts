import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { db } from './db';

/**
 * End-to-end Server Action tests exercising every minute workflow feature
 * against real Postgres rows with mocked Next.js request/navigation APIs:
 *   - Location creation, per-user duplicate guard, ownership-gated edit/pause/move
 *   - Route creation from saved locations & pasted links (creator-only scope)
 *   - Recording a first-day route with current delivery details, house photo
 *     reference, floor/unit/entrance/security instructions, and next-visit notes
 *   - Converting a recording into an optimised route with a unique share code
 *   - Sharing by code/link, saving, copying, un-saving, and rotating codes
 *   - Running a shared route privately (deliver, undo, clear next-visit note
 *     ownership check, report issue, finish run, archive vs permanent delete)
 */

const state = {
  userId: null as string | null,
};

class RedirectSignal extends Error {
  constructor(public readonly location: string) {
    super(`REDIRECT:${location}`);
  }
}

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new RedirectSignal(location);
  },
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name !== 'easydel_session' || !state.userId) return undefined;
      return { value: signTestCookie(state.userId) };
    },
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

import { createHmac } from 'node:crypto';
import {
  createLocationAction,
  createRouteAction,
  moveLocationAction,
  setLocationStatusAction,
  setIssueStatusAction,
  updateLocationAction,
} from './actions';
import {
  joinRouteByCodeAction,
  saveRouteAction,
  unsaveRouteAction,
  regenerateShareCodeAction,
  duplicateRouteAction,
} from './share-actions';
import {
  startRecordingAction,
  addCheckpointAction,
  updateCheckpointAction,
  toggleCheckpointCompleteAction,
  endRecordingAction,
  generateRouteFromSessionAction,
} from './recording-actions';
import {
  addStopFromLocationAction,
  renameRouteAction,
  deleteRouteAction,
} from './route-edit-actions';
import {
  startRunAction,
  markDeliveredAction,
  undoStopOutcomeAction,
  clearNextVisitNoteAction,
  reportIssueAction,
  endRunAction,
} from './run-actions';

function signTestCookie(userId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET must be set to run server-action tests.');
  const payload = `${userId}|${Date.now() + 60_000}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function fd(entries: Record<string, string | string[]>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) {
      for (const item of v) form.append(k, item);
    } else {
      form.set(k, v);
    }
  }
  return form;
}

async function catchRedirect<T>(fn: () => Promise<T>): Promise<{ redirectedTo: string | null; value?: T }> {
  try {
    const value = await fn();
    return { redirectedTo: null, value };
  } catch (err) {
    if (err instanceof RedirectSignal) {
      return { redirectedTo: err.location };
    }
    throw err;
  }
}

const TAG = 'sa-test';
const EMAIL_A = `${TAG}-a@easydel.invalid`;
const EMAIL_B = `${TAG}-b@easydel.invalid`;
const EMAIL_C = `${TAG}-c@easydel.invalid`;

async function cleanup() {
  state.userId = null;
  const users = await db.user.findMany({
    where: { email: { in: [EMAIL_A, EMAIL_B, EMAIL_C] } },
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

async function seedUser(email: string, firstName: string) {
  return db.user.create({
    data: {
      email,
      firstName,
      lastName: 'User',
      role: 'DELIVERY_AGENT',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
}

describe('location creation, per-user duplicate check, and ownership enforcement', () => {
  it('sets createdById, isolates duplicate detection per user, and blocks cross-user mutations', async () => {
    const userA = await seedUser(EMAIL_A, 'Alice');
    const userB = await seedUser(EMAIL_B, 'Bob');

    // Alice creates a location at (13.6288, 79.4192)
    state.userId = userA.id;
    const resA = await catchRedirect(() =>
      createLocationAction(
        null,
        fd({
          name: `${TAG} Rose Villa`,
          address: '10 Rose St',
          latitude: '13.6288',
          longitude: '79.4192',
        }),
      ),
    );
    expect(resA.redirectedTo).toBe('/locations');

    const aliceLoc = await db.deliveryLocation.findFirst({ where: { createdById: userA.id } });
    expect(aliceLoc).toBeTruthy();

    // Duplicate check triggers for Alice at same coordinates...
    const dupA = await createLocationAction(
      null,
      fd({
        name: `${TAG} Duplicate Villa`,
        address: '10 Rose St',
        latitude: '13.6288',
        longitude: '79.4192',
      }),
    );
    expect(dupA?.error).toContain('Possible duplicate');

    // ...but Bob CAN create his own location at the exact same coordinates!
    state.userId = userB.id;
    const resB = await catchRedirect(() =>
      createLocationAction(
        null,
        fd({
          name: `${TAG} Bob Rose Villa`,
          address: '10 Rose St',
          latitude: '13.6288',
          longitude: '79.4192',
        }),
      ),
    );
    expect(resB.redirectedTo).toBe('/locations');

    // Bob cannot edit, move, pause, or route-select Alice's location
    const updErr = await updateLocationAction(
      null,
      fd({
        id: aliceLoc!.id,
        name: 'Hijacked',
        address: 'Hacked',
        latitude: '13.63',
        longitude: '79.42',
      }),
    );
    expect(updErr?.error).toContain('another user');

    const moveErr = await moveLocationAction(
      null,
      fd({ id: aliceLoc!.id, latitude: '13.65', longitude: '79.45' }),
    );
    expect(moveErr?.error).toContain('another user');

    await setLocationStatusAction(fd({ id: aliceLoc!.id, status: 'CANCELLED', reason: 'Nope' }));
    const unchanged = await db.deliveryLocation.findUnique({ where: { id: aliceLoc!.id } });
    expect(unchanged?.status).toBe('ACTIVE');

    const routeWithAliceLoc = await createRouteAction(
      null,
      fd({
        name: `${TAG} Steal Attempt`,
        startLatitude: '13.62',
        startLongitude: '79.41',
        endSameAsStart: 'on',
        locationIds: [aliceLoc!.id],
      }),
    );
    expect(routeWithAliceLoc?.error).toContain('No deliverable locations');
  });
});

describe('newspaper recording -> route generation -> sharing -> memorize/run workflow', () => {
  it(
    'records delivery details, notes, nextVisitNote and converts to a shareable route that others can save and copy',
    { timeout: 60_000 },
    async () => {
      const creator = await seedUser(EMAIL_A, 'Creator');
      const newbie = await seedUser(EMAIL_B, 'Newbie');
      const outsider = await seedUser(EMAIL_C, 'Outsider');

      // 1. Creator starts recording a morning newspaper round
      state.userId = creator.id;
      const startRec = await catchRedirect(() =>
        startRecordingAction(
          null,
          fd({
            routeName: `${TAG} Morning Times`,
            startLatitude: '13.6288',
            startLongitude: '79.4192',
            nameOptions: 'Green Gate House\nSai Apartments',
            typeOptions: 'The Hindu\nEenadu',
          }),
        ),
      );
      expect(startRec.redirectedTo).toMatch(/^\/record\/[0-9a-f-]{36}$/);
      const sessionId = startRec.redirectedTo!.split('/')[2];

      // 2. Creator logs a house with current delivery details + notes + next-visit note
      const cp1 = await addCheckpointAction(
        null,
        fd({
          sessionId,
          name: `${TAG} Green Gate House`,
          address: '45 Main Road',
          latitude: '13.6295',
          longitude: '79.4201',
          deliveryType: 'The Hindu',
          quantity: '2',
          floor: '1',
          unit: '101',
          entranceInstructions: 'Side iron gate',
          securityInstructions: 'Tell watchman Suresh',
          notes: 'Drop inside newspaper box',
          nextVisitNote: 'Collect monthly bill tomorrow',
          markComplete: 'on',
        }),
      );
      expect(cp1?.success).toContain('Green Gate House');

      const checkpoint = await db.trainingCheckpoint.findFirst({
        where: { trainingSessionId: sessionId },
      });
      expect(checkpoint).toBeTruthy();

      // Update checkpoint details mid-round
      const updCp = await updateCheckpointAction(
        null,
        fd({
          checkpointId: checkpoint!.id,
          name: `${TAG} Green Gate House`,
          address: '45 Main Road',
          deliveryType: 'The Hindu',
          quantity: '3',
          floor: '1',
          unit: '101',
          entranceInstructions: 'Side iron gate',
          securityInstructions: 'Tell watchman Suresh',
          notes: 'Drop inside blue box',
          nextVisitNote: 'Skip Wednesday edition next week',
        }),
      );
      expect(updCp?.success).toContain('Updated');

      // Toggle completion off then back on
      await toggleCheckpointCompleteAction(fd({ checkpointId: checkpoint!.id }));
      expect(
        (await db.trainingCheckpoint.findUnique({ where: { id: checkpoint!.id } }))?.completedAt,
      ).toBeNull();
      await toggleCheckpointCompleteAction(fd({ checkpointId: checkpoint!.id }));

      // 3. End recording and generate a shareable delivery route
      const endRec = await catchRedirect(() => endRecordingAction(null, fd({ sessionId })));
      expect(endRec.redirectedTo).toBe(`/training-routes/${sessionId}?finished=1`);

      const genRes = await catchRedirect(() =>
        generateRouteFromSessionAction(null, fd({ sessionId })),
      );
      expect(genRes.redirectedTo).toMatch(/^\/routes\/[0-9a-f-]{36}$/);
      const routeId = genRes.redirectedTo!.split('/')[2];

      const route = await db.route.findUnique({
        where: { id: routeId },
        include: {
          versions: {
            include: {
              stops: {
                include: { deliveryLocation: { include: { subscriptions: true } } },
              },
            },
          },
        },
      });
      expect(route?.shareCode).toBeTruthy();
      const loc = route!.versions[0].stops[0].deliveryLocation;
      expect(loc.createdById).toBe(creator.id);
      expect(loc.notes).toBe('Drop inside blue box');
      expect(loc.nextVisitNote).toBe('Skip Wednesday edition next week');
      expect(loc.entranceInstructions).toBe('Side iron gate');
      expect(loc.securityInstructions).toBe('Tell watchman Suresh');
      expect(loc.floor).toBe('1');
      expect(loc.unit).toBe('101');
      expect(loc.subscriptions[0]?.productType).toBe('The Hindu');
      expect(loc.subscriptions[0]?.quantity).toBe(3);

      // 4. Outsider without share code cannot duplicate the route
      state.userId = outsider.id;
      const dupDenied = await duplicateRouteAction(null, fd({ routeId }));
      expect(dupDenied?.error).toContain('need the share code');

      // 5. Newly joined agent joins by share link and saves the route
      state.userId = newbie.id;
      const joinRes = await catchRedirect(() =>
        joinRouteByCodeAction(
          null,
          fd({ code: `https://example.com/share/${route!.shareCode!.toLowerCase()}` }),
        ),
      );
      expect(joinRes.redirectedTo).toBe(`/share/${route!.shareCode}`);

      const saveRes = await catchRedirect(() => saveRouteAction(null, fd({ routeId })));
      expect(saveRes.redirectedTo).toBe(`/routes/${routeId}`);

      // Newbie cannot rename, rotate share code, or attach Creator's location
      const renameDenied = await renameRouteAction(null, fd({ routeId, name: 'Stolen Name' }));
      expect(renameDenied?.error).toContain('only change routes you created');

      const codeBefore = route!.shareCode;
      await regenerateShareCodeAction(fd({ routeId }));
      expect((await db.route.findUnique({ where: { id: routeId } }))?.shareCode).toBe(codeBefore);

      const addStopDenied = await addStopFromLocationAction(
        null,
        fd({ routeId, locationId: loc.id }),
      );
      expect(addStopDenied?.error).toContain('only change routes you created');

      // 6. Newbie CAN copy the shared route into their own editable route and delete an unused copy
      const copyRes = await catchRedirect(() =>
        duplicateRouteAction(
          null,
          fd({ routeId, shareCode: route!.shareCode!, name: `${TAG} My Morning Copy` }),
        ),
      );
      expect(copyRes.redirectedTo).toMatch(/^\/routes\/[0-9a-f-]{36}$/);
      const copiedRouteId = copyRes.redirectedTo!.split('/')[2];
      const copiedRoute = await db.route.findUnique({ where: { id: copiedRouteId } });
      expect(copiedRoute?.createdById).toBe(newbie.id);
      expect(copiedRoute?.shareCode).toBeTruthy();
      expect(copiedRoute?.shareCode).not.toBe(route!.shareCode);

      // Creator can rotate share code; Newbie can unsave & permanently delete unused copy
      state.userId = creator.id;
      await regenerateShareCodeAction(fd({ routeId }));
      expect((await db.route.findUnique({ where: { id: routeId } }))?.shareCode).not.toBe(codeBefore);

      state.userId = newbie.id;
      const unsaveRes = await catchRedirect(() => unsaveRouteAction(fd({ routeId })));
      expect(unsaveRes.redirectedTo).toBe('/routes');
      expect(await db.route.findUnique({ where: { id: routeId } })).toBeTruthy();

      const delCopy = await catchRedirect(() =>
        deleteRouteAction(null, fd({ routeId: copiedRouteId, mode: 'permanent' })),
      );
      expect(delCopy.redirectedTo).toBe('/routes?deleted=1');
      expect(await db.route.findUnique({ where: { id: copiedRouteId } })).toBeNull();
    },
  );

  it(
    'runs a shared route privately with delivery outcomes, undo, issue lifecycle, and history protection',
    { timeout: 60_000 },
    async () => {
      const creator = await seedUser(EMAIL_A, 'Creator');
      const newbie = await seedUser(EMAIL_B, 'Newbie');

      const loc = await db.deliveryLocation.create({
        data: {
          name: `${TAG} Gate Stop`,
          address: '12 Market St',
          latitude: 13.6295,
          longitude: 79.4201,
          nextVisitNote: 'Keep parcel on porch bench',
          createdById: creator.id,
        },
      });
      await db.subscription.create({
        data: {
          deliveryLocationId: loc.id,
          customerId: 'Mr Rao',
          productType: 'Newspaper',
          quantity: 1,
          frequency: 'DAILY',
        },
      });
      const route = await db.route.create({
        data: {
          name: `${TAG} Shared Run Beat`,
          shareCode: 'SATEST01',
          status: 'ACTIVE',
          createdById: creator.id,
        },
      });
      const version = await db.routeVersion.create({
        data: { routeId: route.id, versionNumber: 1, startLatitude: 13.629, startLongitude: 79.42 },
      });
      const stop = await db.routeStop.create({
        data: { routeVersionId: version.id, deliveryLocationId: loc.id, sequence: 1 },
      });
      await db.savedRoute.create({ data: { userId: newbie.id, routeId: route.id } });

      // Newbie runs the saved shared route
      state.userId = newbie.id;
      const runStartRes = await catchRedirect(() => startRunAction(null, fd({ routeId: route.id })));
      expect(runStartRes.redirectedTo).toBe(`/routes/${route.id}/run`);

      const newbieRun = await db.routeRun.findFirst({
        where: { driverId: newbie.id, status: 'IN_PROGRESS' },
      });
      expect(newbieRun).toBeTruthy();

      const markRes = await markDeliveredAction(
        null,
        fd({
          runId: newbieRun!.id,
          stopId: stop.id,
          latitude: '13.6295',
          longitude: '79.4201',
          notes: 'Newbie personal reminder: gate sticks in rain',
        }),
      );
      expect(markRes?.success).toContain('Delivered');

      // Creator's original nextVisitNote stays untouched when Newbie runs the shared route
      expect(
        (await db.deliveryLocation.findUnique({ where: { id: loc.id } }))?.nextVisitNote,
      ).toBe('Keep parcel on porch bench');

      // Newbie cannot clear Creator's nextVisitNote
      await clearNextVisitNoteAction(fd({ runId: newbieRun!.id, stopId: stop.id }));
      expect(
        (await db.deliveryLocation.findUnique({ where: { id: loc.id } }))?.nextVisitNote,
      ).toBe('Keep parcel on porch bench');

      // Undo and re-deliver works on Newbie's own run
      await undoStopOutcomeAction(fd({ runId: newbieRun!.id, stopId: stop.id }));
      expect(await db.delivery.count({ where: { routeRunId: newbieRun!.id } })).toBe(0);

      await markDeliveredAction(
        null,
        fd({
          runId: newbieRun!.id,
          stopId: stop.id,
          latitude: '13.6295',
          longitude: '79.4201',
          notes: 'Left at box',
        }),
      );

      const issueRes = await reportIssueAction(
        null,
        fd({
          runId: newbieRun!.id,
          category: 'ACCESS',
          entityType: 'Location',
          entityId: loc.id,
          description: 'Gate bell broken today',
        }),
      );
      expect(issueRes?.success).toContain('reported');

      const issue = await db.issue.findFirst({ where: { reportedBy: newbie.id } });
      await setIssueStatusAction(fd({ id: issue!.id, status: 'RESOLVED' }));
      expect((await db.issue.findUnique({ where: { id: issue!.id } }))?.status).toBe('RESOLVED');

      const finishRun = await catchRedirect(() =>
        endRunAction(null, fd({ runId: newbieRun!.id })),
      );
      expect(finishRun.redirectedTo).toBe(`/routes/${route.id}/run?finished=1`);

      // Route with run history refuses permanent delete
      state.userId = creator.id;
      const permBlocked = await deleteRouteAction(
        null,
        fd({ routeId: route.id, mode: 'permanent' }),
      );
      expect(permBlocked?.error).toContain('history');
    },
  );
});
