import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { allowedNavHrefs, ALL_NAV_HREFS } from './nav';
import { buildSessionCookie, safeNextPath, SELF_SIGNUP_ROLE, type SessionUser } from './auth';
import {
  can,
  checkpointTypesKey,
  DEFAULT_CHECKPOINT_TYPES,
  geofenceKey,
  parseCheckpointTypes,
  parseGeofenceMetres,
} from './permissions';
import {
  deliveryWhere,
  issueWhere,
  locationWhere,
  ownedRouteWhere,
  routeWhere,
  runWhere,
  trainingWhere,
} from './scope';
import { MAX_NAME_OPTIONS, parseNameOptions, readNameOptions, roundTypeOptions } from './name-options';

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'user-1',
    email: 'carrier@easydel.invalid',
    role: 'DELIVERY_AGENT',
    firstName: 'Sam',
    lastName: 'Carrier',
    ...overrides,
  };
}

describe('navigation destinations', () => {
  it('excludes removed admin and live-GPS tracking routes', async () => {
    const hrefs = await allowedNavHrefs();
    expect(hrefs).toEqual([...ALL_NAV_HREFS]);
    expect(hrefs).not.toContain('/live');
    expect(hrefs).not.toContain('/drivers');
    expect(hrefs).not.toContain('/mentors');
  });

  it('includes every route-recording, sharing, location, and delivery workflow link', () => {
    expect(ALL_NAV_HREFS).toEqual([
      '/',
      '/routes',
      '/share',
      '/record',
      '/routes/from-links',
      '/training-routes',
      '/locations',
      '/imports',
      '/delivery-history',
      '/reports',
      '/settings',
    ]);
  });
});

describe('session cookie & safeNextPath', () => {
  const previousSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'vitest-jwt-secret-key-for-signing';
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  it('allows valid internal paths and blocks protocol-relative or external URLs', () => {
    expect(safeNextPath('/share/K7M9P2X4')).toBe('/share/K7M9P2X4');
    expect(safeNextPath('  /routes/123?tab=stops  ')).toBe('/routes/123?tab=stops');
    expect(safeNextPath('//evil.example/steal')).toBe('/');
    expect(safeNextPath('https://evil.example/steal')).toBe('/');
    expect(safeNextPath('http://localhost:3000')).toBe('/');
    expect(safeNextPath('')).toBe('/');
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath(42)).toBe('/');
  });

  it('builds an httpOnly signed session cookie for the user id', () => {
    const cookie = buildSessionCookie('user-abc');
    expect(cookie.name).toBe('easydel_session');
    expect(cookie.options.httpOnly).toBe(true);
    expect(cookie.options.sameSite).toBe('lax');
    expect(cookie.options.path).toBe('/');
    expect(cookie.value.startsWith('user-abc|')).toBe(true);
    expect(cookie.value.split('.')).toHaveLength(2);
  });

  it('defaults self-signup role to DELIVERY_AGENT', () => {
    expect(SELF_SIGNUP_ROLE).toBe('DELIVERY_AGENT');
  });
});

describe('equal capabilities & per-user preferences', () => {
  it('grants every capability to every signed-in user without role checks', async () => {
    expect(await can()).toBe(true);
  });

  it('resolves per-user checkpoint package types before shared defaults', () => {
    const uid = 'u-42';
    const settings = {
      checkpoint_type_options: 'Envelope\nBox',
      [checkpointTypesKey(uid)]: 'Morning Times\nMilk Pouch',
    };

    expect(parseCheckpointTypes(settings, uid)).toEqual(['Morning Times', 'Milk Pouch']);
    expect(parseCheckpointTypes(settings, 'other-user')).toEqual(['Envelope', 'Box']);
    expect(parseCheckpointTypes({}, 'other-user')).toEqual(DEFAULT_CHECKPOINT_TYPES);
  });

  it('resolves per-user geofence distance with bounds validation (10..5000m)', () => {
    const uid = 'u-42';
    expect(parseGeofenceMetres({ [geofenceKey(uid)]: '300', delivery_geofence_metres: '150' }, uid)).toBe(300);
    expect(parseGeofenceMetres({ [geofenceKey(uid)]: '5', delivery_geofence_metres: '220' }, uid)).toBe(220);
    expect(parseGeofenceMetres({ [geofenceKey(uid)]: '9999', delivery_geofence_metres: 'bad' }, uid)).toBe(150);
    expect(parseGeofenceMetres({ delivery_geofence_metres: '10' }, uid)).toBe(10);
    expect(parseGeofenceMetres({ delivery_geofence_metres: '5000' }, uid)).toBe(5000);
  });
});

describe('strict user-level query scopes (no admin bypass)', () => {
  it('scopes locations, deliveries, issues, runs, owned routes, shared routes, and rounds to user.id regardless of role', async () => {
    const adminShapedUser = makeUser({ id: 'admin-id', role: 'ADMIN' });
    const mentorShapedUser = makeUser({ id: 'mentor-id', role: 'MENTOR' });

    for (const u of [adminShapedUser, mentorShapedUser]) {
      expect(locationWhere(u)).toEqual({ createdById: u.id });
      expect(deliveryWhere(u)).toEqual({ routeRun: { driverId: u.id } });
      expect(issueWhere(u)).toEqual({ reportedBy: u.id });
      expect(runWhere(u)).toEqual({ driverId: u.id });
      expect(ownedRouteWhere(u)).toEqual({ createdById: u.id });
      expect(await routeWhere(u)).toEqual({
        OR: [{ createdById: u.id }, { savedBy: { some: { userId: u.id } } }],
      });
      expect(trainingWhere(u)).toEqual({
        OR: [{ recordedById: u.id }, { traineeId: u.id }, { mentorId: u.id }],
      });
    }
  });
});

describe('recording pick-list helpers', () => {
  it('deduplicates house names case-insensitively while keeping first casing and order', () => {
    const parsed = parseNameOptions('  Green Villa  \n\nSai Towers\ngreen villa\nCorner Shop  ');
    expect(parsed).toEqual(['Green Villa', 'Sai Towers', 'Corner Shop']);
  });

  it('enforces max entry count and 120-char name cap', () => {
    const overlong = 'A'.repeat(180);
    expect(parseNameOptions(overlong)[0]).toHaveLength(120);

    const many = Array.from({ length: MAX_NAME_OPTIONS + 25 }, (_, i) => `Stop ${i + 1}`).join('\n');
    expect(parseNameOptions(many)).toHaveLength(MAX_NAME_OPTIONS);
  });

  it('reads stored names and resolves roundTypeOptions precedence cleanly', () => {
    expect(readNameOptions(null)).toEqual([]);
    expect(readNameOptions('A\nB')).toEqual(['A', 'B']);

    expect(
      roundTypeOptions({
        stored: 'Newspaper\nMilk',
        usedOnRound: ['Parcel'],
        fallback: ['Box'],
      }),
    ).toEqual(['Newspaper', 'Milk']);

    expect(
      roundTypeOptions({
        stored: '',
        usedOnRound: ['Parcel', null, 'Box', 'parcel'],
        fallback: ['Box', 'Newspaper'],
      }),
    ).toEqual(['Parcel', 'Box', 'Newspaper']);
  });
});
