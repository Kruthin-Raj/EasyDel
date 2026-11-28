import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from './db';
import { POST as authPost, GET as authGet, PATCH as authPatch } from '../app/api/mobile/auth/route';
import { GET as shareGet } from '../app/api/mobile/share/[code]/route';
import { POST as savePost, DELETE as saveDelete } from '../app/api/mobile/routes/save/route';
import { POST as duplicatePost } from '../app/api/mobile/routes/duplicate/route';
import { GET as routesGet, POST as routesPost } from '../app/api/mobile/routes/route';
import { POST as fromLinksPost } from '../app/api/mobile/routes/from-links/route';
import { PATCH as routePatch } from '../app/api/mobile/routes/[id]/route';
import { POST as locationsPost, PATCH as locationsPatch, PUT as locationsPut } from '../app/api/mobile/locations/route';
import { POST as recordPost, GET as recordGet } from '../app/api/mobile/record/route';
import { POST as settingsPost, PUT as contactPut } from '../app/api/mobile/settings/route';
import { POST as syncPost } from '../app/api/mobile/runs/sync/route';
import { GET as releaseGet } from '../app/api/app-release/route';
import { GET as osrmLegGet } from '../app/api/mobile/osrm-leg/route';
import { hashPassword } from './password';

const TAG = 'mobile-api-test';
const EMAIL_OWNER = `${TAG}-owner@easydel.invalid`;
const EMAIL_RIDER = `${TAG}-rider@easydel.invalid`;

async function cleanup() {
  const users = await db.user.findMany({
    where: { email: { in: [EMAIL_OWNER, EMAIL_RIDER] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  const routes = await db.route.findMany({
    where: { createdById: { in: ids } },
    select: { id: true },
  });
  const routeIds = routes.map((r) => r.id);

  const locations = await db.deliveryLocation.findMany({
    where: { createdById: { in: ids } },
    select: { id: true },
  });
  const locIds = locations.map((l) => l.id);

  if (routeIds.length || ids.length) {
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

    await db.delivery.deleteMany({ where: { routeRunId: { in: runIds } } });
    await db.routeRun.deleteMany({ where: { id: { in: runIds } } });
    await db.routeStop.deleteMany({ where: { routeVersionId: { in: versionIds } } });
    await db.routeVersion.deleteMany({ where: { id: { in: versionIds } } });
    await db.savedRoute.deleteMany({ where: { OR: [{ userId: { in: ids } }, { routeId: { in: routeIds } }] } });
    await db.route.deleteMany({ where: { id: { in: routeIds } } });
  }

  if (locIds.length) {
    await db.subscription.deleteMany({ where: { deliveryLocationId: { in: locIds } } });
    await db.deliveryLocation.deleteMany({ where: { id: { in: locIds } } });
  }

  if (ids.length) {
    const sessions = await db.trainingSession.findMany({ where: { recordedById: { in: ids } }, select: { id: true } });
    const sessionIds = sessions.map((s) => s.id);
    await db.trainingCheckpoint.deleteMany({ where: { trainingSessionId: { in: sessionIds } } });
    await db.trainingSession.deleteMany({ where: { id: { in: sessionIds } } });
    await db.setting.deleteMany({ where: { key: { in: ids.flatMap((id) => [
      `geofence_metres:${id}`,
      `distance_unit:${id}`,
      `default_start:${id}`,
      `memorize_quiz_default:${id}`,
      `memorize_auto_advance:${id}`,
      `show_bag_reminder:${id}`,
      `checkpoint_type_options:${id}`,
    ]) } } });
    await db.issue.deleteMany({ where: { reportedBy: { in: ids } } });
    await db.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
}

describe('Mobile sync API & direct APK release endpoint', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it('supports guest share preview, login/signup auth, saving a route by code, and offline run sync', async () => {
    const pwHash = await hashPassword('MobileTestPass123!');
    const owner = await db.user.create({
      data: {
        email: EMAIL_OWNER,
        passwordHash: pwHash,
        firstName: 'Owner',
        lastName: 'Agent',
        role: 'DELIVERY_AGENT',
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    const loc = await db.deliveryLocation.create({
      data: {
        name: `${TAG} Sunrise Villa`,
        address: '10 Palm St',
        latitude: 13.63,
        longitude: 79.42,
        entranceInstructions: 'Blue side gate',
        shareCode: 'MOBLOC77',
        createdById: owner.id,
      },
    });
    const sub = await db.subscription.create({
      data: {
        deliveryLocationId: loc.id,
        customerId: 'Owner Cust',
        productType: 'Morning Times',
        quantity: 2,
        frequency: 'DAILY',
      },
    });
    const route = await db.route.create({
      data: {
        name: `${TAG} Early Beat`,
        shareCode: 'MOBRTE88',
        status: 'ACTIVE',
        createdById: owner.id,
      },
    });
    const ver = await db.routeVersion.create({
      data: {
        routeId: route.id,
        versionNumber: 1,
        totalDistance: 1200,
        estimatedDuration: 300,
        startLocationName: 'Depot',
        startLatitude: 13.629,
        startLongitude: 79.419,
        routeGeometry: JSON.stringify({
          type: 'LineString',
          coordinates: [
            [79.419, 13.629],
            [79.42, 13.63],
          ],
        }),
      },
    });
    await db.routeStop.create({
      data: { routeVersionId: ver.id, deliveryLocationId: loc.id, sequence: 1 },
    });

    // 1. Guest (no Bearer token) can preview route & location share codes for free
    const guestRouteRes = await shareGet(new Request('http://localhost/api/mobile/share/MOBRTE88'), {
      params: Promise.resolve({ code: 'MOBRTE88' }),
    });
    expect(guestRouteRes.status).toBe(200);
    const guestRouteBody = (await guestRouteRes.json()) as {
      kind: string;
      route: {
        name: string;
        routeGeometry: number[][] | null;
        startPoint: { name: string } | null;
        stops: { totalItems: number }[];
      };
    };
    expect(guestRouteBody.kind).toBe('route');
    expect(guestRouteBody.route.name).toBe(`${TAG} Early Beat`);
    expect(guestRouteBody.route.stops[0]?.totalItems).toBe(2);
    expect(guestRouteBody.route.routeGeometry).toHaveLength(2);
    expect(guestRouteBody.route.startPoint?.name).toBe('Depot');

    const guestLocRes = await shareGet(new Request('http://localhost/api/mobile/share/MOBLOC77'), {
      params: Promise.resolve({ code: 'MOBLOC77' }),
    });
    expect(guestLocRes.status).toBe(200);
    const guestLocBody = (await guestLocRes.json()) as {
      kind: string;
      location: { entranceInstructions: string };
    };
    expect(guestLocBody.kind).toBe('location');
    expect(guestLocBody.location.entranceInstructions).toBe('Blue side gate');

    // 2. Saving without auth is rejected (401 -> prompts mobile login modal)
    const unauthSave = await savePost(
      new Request('http://localhost/api/mobile/routes/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'MOBRTE88' }),
      }),
    );
    expect(unauthSave.status).toBe(401);

    // 3. Mobile sign-up returns a valid Bearer token
    const signupRes = await authPost(
      new Request('http://localhost/api/mobile/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'signup',
          firstName: 'Sam',
          lastName: 'Rider',
          email: EMAIL_RIDER,
          password: 'RiderPassword99!',
        }),
      }),
    );
    expect(signupRes.status).toBe(200);
    const { token, user: rider } = (await signupRes.json()) as {
      token: string;
      user: { id: string; email: string; firstName: string };
    };
    expect(rider.firstName).toBe('Sam');
    expect(token).toBeTruthy();

    const meRes = await authGet(
      new Request('http://localhost/api/mobile/auth', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(meRes.status).toBe(200);

    // 4. Rider saves shared route via code and pulls synced payload
    const saveRes = await savePost(
      new Request('http://localhost/api/mobile/routes/save', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: 'MOBRTE88' }),
      }),
    );
    expect(saveRes.status).toBe(200);

    const syncedListRes = await routesGet(
      new Request('http://localhost/api/mobile/routes', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(syncedListRes.status).toBe(200);
    const syncedList = (await syncedListRes.json()) as {
      routes: { id: string; routeGeometry?: number[][] | null }[];
    };
    expect(syncedList.routes.map((r) => r.id)).toContain(route.id);
    expect(syncedList.routes.find((r) => r.id === route.id)?.routeGeometry).toHaveLength(2);

    const badLegRes = await osrmLegGet(new Request('http://localhost/api/mobile/osrm-leg?fromLat=bad'));
    expect(badLegRes.status).toBe(400);
    const okLegRes = await osrmLegGet(
      new Request('http://localhost/api/mobile/osrm-leg?fromLat=13.629&fromLng=79.419&toLat=13.63&toLng=79.42'),
    );
    expect(okLegRes.status).toBe(200);

    // 5. Rider syncs offline delivery outcomes
    const syncRes = await syncPost(
      new Request('http://localhost/api/mobile/runs/sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entries: [
            {
              routeId: route.id,
              routeVersionId: ver.id,
              locationId: loc.id,
              subscriptionId: sub.id,
              status: 'DELIVERED',
              quantity: 2,
            },
          ],
        }),
      }),
    );
    expect(syncRes.status).toBe(200);
    const syncBody = (await syncRes.json()) as { synced: number };
    expect(syncBody.synced).toBe(1);

    // 6. APK release metadata endpoint returns structured non-failing response
    const releaseRes = await releaseGet();
    expect(releaseRes.status).toBe(200);
    const releaseJson = (await releaseRes.json()) as { version: string; available: boolean };
    expect(releaseJson.version).toBeTruthy();
  });

  it('creates/edits locations, imports CSV, builds from links, clones/unsaves routes, records rounds, and updates settings', async () => {
    const pwHash = await hashPassword('MobileTestPass123!');
    const owner = await db.user.create({
      data: {
        email: EMAIL_OWNER,
        passwordHash: pwHash,
        firstName: 'Owner',
        lastName: 'Agent',
        role: 'DELIVERY_AGENT',
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });
    const sharedLoc = await db.deliveryLocation.create({
      data: {
        name: `${TAG} Sunrise Villa`,
        address: '10 Palm St',
        latitude: 13.63,
        longitude: 79.42,
        entranceInstructions: 'Blue side gate',
        shareCode: 'MOBLOC77',
        createdById: owner.id,
      },
    });
    const route = await db.route.create({
      data: { name: `${TAG} Early Beat`, shareCode: 'MOBRTE88', status: 'ACTIVE', createdById: owner.id },
    });
    const ver = await db.routeVersion.create({
      data: { routeId: route.id, versionNumber: 1, totalDistance: 1200, estimatedDuration: 300 },
    });
    await db.routeStop.create({
      data: { routeVersionId: ver.id, deliveryLocationId: sharedLoc.id, sequence: 1 },
    });

    const signupRes = await authPost(
      new Request('http://localhost/api/mobile/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'signup',
          firstName: 'Sam',
          lastName: 'Rider',
          email: EMAIL_RIDER,
          password: 'RiderPassword99!',
        }),
      }),
    );
    const { token } = (await signupRes.json()) as { token: string };

    // Create location, toggle status, build route from links, record round, edit, settings & contact
    const createLocRes = await locationsPost(
      new Request('http://localhost/api/mobile/locations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${TAG} Rider Stop`,
          link: '13.6400, 79.4300',
          entranceInstructions: 'Ring bell twice',
          productType: 'Milk',
          quantity: 2,
        }),
      }),
    );
    expect(createLocRes.status).toBe(200);
    const createdLoc = (await createLocRes.json()) as { id: string; shareCode: string };
    expect(createdLoc.shareCode).toMatch(/^[A-Z0-9]{8}$/);

    const pauseRes = await locationsPatch(
      new Request('http://localhost/api/mobile/locations', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: createdLoc.id, status: 'PAUSED' }),
      }),
    );
    expect(pauseRes.status).toBe(200);

    await locationsPatch(
      new Request('http://localhost/api/mobile/locations', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: createdLoc.id, status: 'ACTIVE' }),
      }),
    );

    const createRouteLocRes = await routesPost(
      new Request('http://localhost/api/mobile/routes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${TAG} Saved Stops Route`, locationIds: [createdLoc.id] }),
      }),
    );
    expect(createRouteLocRes.status).toBe(200);
    const riderRoute = (await createRouteLocRes.json()) as { id: string };

    // Add owner's location via location share code into rider's route
    const patchRes = await routePatch(
      new Request(`http://localhost/api/mobile/routes/${riderRoute.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_code', code: 'MOBLOC77' }),
      }),
      { params: Promise.resolve({ id: riderRoute.id }) },
    );
    expect(patchRes.status).toBe(200);

    // Parse & build route from links
    const parseRes = await fromLinksPost(
      new Request('http://localhost/api/mobile/routes/from-links', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parse', links: '13.6500, 79.4400\n13.6520, 79.4420' }),
      }),
    );
    expect(parseRes.status).toBe(200);
    const parsedBody = (await parseRes.json()) as { rows: { latitude: number | null; longitude: number | null }[] };
    expect(parsedBody.rows).toHaveLength(2);

    const buildLinksRes = await fromLinksPost(
      new Request('http://localhost/api/mobile/routes/from-links', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          routeName: `${TAG} Links Beat`,
          stops: [{ name: 'Link Villa', lat: 13.65, lng: 79.44, type: 'Paper', quantity: 1 }],
        }),
      }),
    );
    expect(buildLinksRes.status).toBe(200);

    // Record route: start -> checkpoint -> finish
    const recStartRes = await recordPost(
      new Request('http://localhost/api/mobile/record', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', routeName: `${TAG} Recorded Walk`, latitude: 13.66, longitude: 79.45 }),
      }),
    );
    expect(recStartRes.status).toBe(200);
    const { session } = (await recStartRes.json()) as { session: { id: string } };

    const activeRecRes = await recordGet(
      new Request('http://localhost/api/mobile/record', { headers: { Authorization: `Bearer ${token}` } }),
    );
    expect(activeRecRes.status).toBe(200);

    const recCpRes = await recordPost(
      new Request('http://localhost/api/mobile/record', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'checkpoint',
          sessionId: session.id,
          name: 'Corner Porch',
          latitude: 13.661,
          longitude: 79.451,
        }),
      }),
    );
    expect(recCpRes.status).toBe(200);

    const recFinishRes = await recordPost(
      new Request('http://localhost/api/mobile/record', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finish', sessionId: session.id }),
      }),
    );
    expect(recFinishRes.status).toBe(200);

    // Settings & Contact
    const setRes = await settingsPost(
      new Request('http://localhost/api/mobile/settings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ geofenceMetres: 200, distanceUnit: 'imperial', memorizeQuizDefault: true }),
      }),
    );
    expect(setRes.status).toBe(200);

    const contactRes = await contactPut(
      new Request('http://localhost/api/mobile/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Sam Rider',
          email: EMAIL_RIDER,
          topic: 'Mobile app',
          subject: 'Testing contact',
          message: 'Mobile contact message check.',
        }),
      }),
    );
    expect(contactRes.status).toBe(200);

    // Edit location, bulk CSV import, clone shared route, unsave shared route, and change password
    const editLocRes = await locationsPut(
      new Request('http://localhost/api/mobile/locations', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: createdLoc.id, nextVisitNote: 'Updated note' }),
      }),
    );
    expect(editLocRes.status).toBe(200);

    const csvRes = await locationsPut(
      new Request('http://localhost/api/mobile/locations', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importCsv: true,
          csvText: `Name,Address,Latitude,Longitude,Type,Qty\n${TAG} CSV Home,11 Oak Rd,13.671,79.461,Milk,1`,
        }),
      }),
    );
    expect(csvRes.status).toBe(200);
    expect(((await csvRes.json()) as { imported: number }).imported).toBe(1);

    const dupRes = await duplicatePost(
      new Request('http://localhost/api/mobile/routes/duplicate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId: route.id, shareCode: 'MOBRTE88', name: `${TAG} Cloned Beat` }),
      }),
    );
    expect(dupRes.status).toBe(200);

    const unsaveRes = await saveDelete(
      new Request(`http://localhost/api/mobile/routes/save?routeId=${route.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(unsaveRes.status).toBe(200);

    const pwChangeRes = await authPatch(
      new Request('http://localhost/api/mobile/auth', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'RiderPassword99!',
          newPassword: 'RiderPasswordNew99!',
        }),
      }),
    );
    expect(pwChangeRes.status).toBe(200);
  }, 90_000);
});
