/**
 * Seed script — demo data for local development.
 *
 * Idempotent: safe to re-run. Uses deterministic UUIDs and upserts so it will
 * not duplicate rows. Run with:  pnpm --filter @delivery/database db:seed
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

// Deterministic ids so re-running upserts instead of duplicating.
const ID = {
  admin: '00000000-0000-4000-8000-000000000001',
  mentor: '00000000-0000-4000-8000-000000000002',
  driver1: '00000000-0000-4000-8000-000000000003',
  driver2: '00000000-0000-4000-8000-000000000004',
  driverProfile1: '00000000-0000-4000-8000-000000000101',
  driverProfile2: '00000000-0000-4000-8000-000000000102',
  mentorProfile: '00000000-0000-4000-8000-000000000201',
  route1: '00000000-0000-4000-8000-000000000301',
  routeVersion1: '00000000-0000-4000-8000-000000000401',
  training1: '00000000-0000-4000-8000-000000000501',
};

// Tirupati-area coordinates — matches the ap-south-1 region of the project.
const LOCATIONS = [
  { name: 'Green Residency',     building: 'Green Residency',   address: '12 Tilak Rd, Tirupati',        lat: 13.6288, lng: 79.4192, floor: '1', unit: 'Security Desk', notes: 'Leave newspapers at security desk.', entrance: 'Main gate, ask for Ramesh', security: 'Gate closes 22:00' },
  { name: 'Sai Towers',          building: 'Sai Towers',        address: '45 Bhavani Nagar, Tirupati',   lat: 13.6335, lng: 79.4241, floor: '3', unit: '3B',           notes: 'Ring bell twice.',                    entrance: 'Side entrance',            security: null },
  { name: 'Royal Apartments',    building: 'Royal Apartments',  address: '8 Korlagunta, Tirupati',       lat: 13.6412, lng: 79.4103, floor: '2', unit: '204',          notes: 'Dog on premises — leave at gate.',    entrance: 'Rear gate',                security: 'Guard on duty 06:00-18:00' },
  { name: 'MG Road Complex',     building: 'MG Road Complex',   address: '101 MG Rd, Tirupati',          lat: 13.6198, lng: 79.4275, floor: 'G', unit: 'Shop 4',       notes: 'Shutter opens 06:30.',                entrance: 'Front shutter',            security: null },
  { name: 'Lakshmi Nivas',       building: 'Lakshmi Nivas',     address: '23 Kapilatheertham Rd',        lat: 13.6501, lng: 79.4021, floor: '1', unit: '1A',           notes: null,                                  entrance: 'Main door',                security: null },
  { name: 'Balaji Enclave',      building: 'Balaji Enclave',    address: '77 Air Bypass Rd, Tirupati',   lat: 13.6104, lng: 79.4188, floor: '4', unit: '402',          notes: 'Lift often out of service.',          entrance: 'Tower B',                  security: 'Visitor log required' },
  { name: 'Srinivasa Heights',   building: 'Srinivasa Heights', address: '5 Leela Mahal Cir, Tirupati',  lat: 13.6357, lng: 79.4310, floor: '2', unit: '2C',           notes: null,                                  entrance: 'Main gate',                security: null },
  { name: 'Tirumala Residency',  building: 'Tirumala Residency',address: '19 Alipiri Rd, Tirupati',      lat: 13.6449, lng: 79.4356, floor: '1', unit: '105',          notes: 'Customer prefers before 07:00.',      entrance: 'Main gate',                security: null },
  // PAUSED + CANCELLED so lifecycle filtering is visibly exercised.
  { name: 'Venkatesh Villa',     building: 'Venkatesh Villa',   address: '31 Renigunta Rd, Tirupati',    lat: 13.6612, lng: 79.4433, floor: null, unit: null,          notes: 'Family travelling.',                  entrance: null,                       security: null, status: 'PAUSED' },
  { name: 'Old Depot Store',     building: 'Old Depot Store',   address: '2 Industrial Estate, Tirupati',lat: 13.6055, lng: 79.4501, floor: null, unit: null,          notes: 'Shop permanently closed.',            entrance: null,                       security: null, status: 'CANCELLED' },
];


/**
 * Hashes a password with scrypt, in the same self-describing format the web app
 * reads in apps/web/src/lib/password.ts:
 *   scrypt$N$r$p$<salt base64>$<key base64>
 *
 * Supabase Auth is no longer involved — credentials live in our own User table,
 * so the seed has to produce a real hash rather than calling an admin API.
 */
function hashPasswordSync(password) {
  const N = 65536;
  const R = 8;
  const P = 1;
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, {
    N,
    r: R,
    p: P,
    maxmem: 256 * 1024 * 1024,
  });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/*
 * Guard against seeding a real database.
 *
 * This script creates four accounts whose password is whatever ADMIN_PASSWORD
 * happens to be, and re-running it against production would hand out working
 * logins. It also resurrects demo locations and routes that someone has
 * deliberately deleted.
 *
 * Set ALLOW_SEED=yes to override — deliberately awkward.
 */
function assertSafeToSeed() {
  if (process.env.ALLOW_SEED === 'yes') return;

  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    throw new Error(
      'Refusing to seed: this looks like a production environment. ' +
        'Set ALLOW_SEED=yes if you really mean it.',
    );
  }
}

async function main() {
  assertSafeToSeed();
  console.log('Seeding…');

  // ---- Users -------------------------------------------------------------
  const users = [
    { id: ID.admin,   email: 'admin@easydel.dev',   role: 'ADMIN',          firstName: 'Sarah', lastName: 'Admin' },
    { id: ID.mentor,  email: 'mentor@easydel.dev',  role: 'MENTOR',         firstName: 'Ravi',  lastName: 'Mentor' },
    { id: ID.driver1, email: 'driver@easydel.dev',  role: 'DELIVERY_AGENT', firstName: 'John',  lastName: 'Kumar' },
    { id: ID.driver2, email: 'driver2@easydel.dev', role: 'DELIVERY_AGENT', firstName: 'Priya', lastName: 'Reddy' },
  ];
  const demoPassword = process.env.ADMIN_PASSWORD;
  if (!demoPassword) {
    throw new Error(
      'ADMIN_PASSWORD is not set. The demo accounts need it to have a usable password.',
    );
  }

  // One hash reused across the demo accounts. scrypt is intentionally slow, so
  // hashing four times would add seconds to every seed run for no benefit.
  const passwordHash = hashPasswordSync(demoPassword);

  for (const u of users) {
    // Demo accounts skip the email OTP: there may be no SMTP configured, and
    // they exist precisely so the dashboard is usable straight after seeding.
    const data = {
      ...u,
      passwordHash,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    };
    await prisma.user.upsert({ where: { id: u.id }, update: data, create: data });
  }

  await prisma.mentorProfile.upsert({
    where: { id: ID.mentorProfile },
    update: {},
    create: { id: ID.mentorProfile, userId: ID.mentor, active: true },
  });
  await prisma.driverProfile.upsert({
    where: { id: ID.driverProfile1 },
    update: { active: true, vehicleType: 'Motorcycle' },
    create: { id: ID.driverProfile1, userId: ID.driver1, active: true, vehicleType: 'Motorcycle' },
  });
  await prisma.driverProfile.upsert({
    where: { id: ID.driverProfile2 },
    update: { active: false, vehicleType: 'Bicycle' },
    create: { id: ID.driverProfile2, userId: ID.driver2, active: false, vehicleType: 'Bicycle' },
  });

  // ---- Locations + subscriptions ----------------------------------------
  const locationIds = [];
  for (let i = 0; i < LOCATIONS.length; i++) {
    const l = LOCATIONS[i];
    const id = `00000000-0000-4000-8000-0000000006${String(i).padStart(2, '0')}`;
    locationIds.push(id);
    const data = {
      name: l.name,
      buildingName: l.building,
      address: l.address,
      latitude: l.lat,
      longitude: l.lng,
      floor: l.floor,
      unit: l.unit,
      notes: l.notes,
      entranceInstructions: l.entrance,
      securityInstructions: l.security,
      status: l.status ?? 'ACTIVE',
    };
    await prisma.deliveryLocation.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  // Green Residency gets 4 customers — exercises the "multiple deliveries at
  // one building" rule (one stop, several delivery items).
  const subs = [
    { loc: 0, customer: 'Customer A', productType: 'Newspaper',    quantity: 2, frequency: 'DAILY' },
    { loc: 0, customer: 'Customer B', productType: 'Newspaper',    quantity: 1, frequency: 'DAILY' },
    { loc: 0, customer: 'Customer C', productType: 'Newspaper',    quantity: 4, frequency: 'DAILY' },
    { loc: 0, customer: 'Customer D', productType: 'Food Package', quantity: 1, frequency: 'WEEKDAYS' },
    { loc: 1, customer: 'M. Iyer',    productType: 'Newspaper',    quantity: 1, frequency: 'DAILY' },
    { loc: 2, customer: 'S. Rao',     productType: 'Milk',         quantity: 2, frequency: 'DAILY' },
    { loc: 3, customer: 'MG Traders', productType: 'Newspaper',    quantity: 12, frequency: 'DAILY' },
    { loc: 4, customer: 'L. Devi',    productType: 'Milk',         quantity: 1, frequency: 'DAILY' },
    { loc: 5, customer: 'B. Naidu',   productType: 'Newspaper',    quantity: 3, frequency: 'WEEKDAYS' },
    { loc: 6, customer: 'K. Shetty',  productType: 'Food Package', quantity: 1, frequency: 'DAILY' },
    { loc: 7, customer: 'T. Prasad',  productType: 'Newspaper',    quantity: 2, frequency: 'DAILY' },
    { loc: 8, customer: 'V. Kumar',   productType: 'Newspaper',    quantity: 1, frequency: 'DAILY', status: 'PAUSED' },
    { loc: 9, customer: 'Depot Store',productType: 'Newspaper',    quantity: 5, frequency: 'DAILY', status: 'CANCELLED' },
  ];
  const subIds = [];
  for (let i = 0; i < subs.length; i++) {
    const s = subs[i];
    const id = `00000000-0000-4000-8000-0000000007${String(i).padStart(2, '0')}`;
    subIds.push(id);
    const data = {
      deliveryLocationId: locationIds[s.loc],
      customerId: s.customer,
      productType: s.productType,
      quantity: s.quantity,
      frequency: s.frequency,
      status: s.status ?? 'ACTIVE',
      specialInstructions: null,
    };
    await prisma.subscription.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  // ---- Route + version + stops ------------------------------------------
  await prisma.route.upsert({
    where: { id: ID.route1 },
    update: { name: 'Morning Newspaper Route 01', status: 'ACTIVE', driverId: ID.driverProfile1 },
    create: {
      id: ID.route1,
      name: 'Morning Newspaper Route 01',
      status: 'ACTIVE',
      createdById: ID.admin,
      approvedById: ID.admin,
      driverId: ID.driverProfile1,
    },
  });

  await prisma.routeVersion.upsert({
    where: { id: ID.routeVersion1 },
    update: {},
    create: {
      id: ID.routeVersion1,
      routeId: ID.route1,
      versionNumber: 1,
      startLocationName: 'Depot',
      startLatitude: 13.6288,
      startLongitude: 79.4192,
      endLocationName: 'Depot',
      endLatitude: 13.6288,
      endLongitude: 79.4192,
      totalDistance: 12700,
      estimatedDuration: 4320,
      routeGeometry: null,
    },
  });

  // Only ACTIVE locations become stops — cancelled/paused must not appear.
  const activeLocIdx = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let i = 0; i < activeLocIdx.length; i++) {
    const id = `00000000-0000-4000-8000-0000000008${String(i).padStart(2, '0')}`;
    const data = {
      routeVersionId: ID.routeVersion1,
      deliveryLocationId: locationIds[activeLocIdx[i]],
      sequence: i + 1,
      distanceFromPrevious: i === 0 ? 0 : 1200 + i * 180,
      durationFromPrevious: i === 0 ? 0 : 400 + i * 60,
    };
    await prisma.routeStop.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  // ---- Deliveries (mixed statuses so history/reports have real numbers) --
  const deliveryPlan = [
    { sub: 0, status: 'DELIVERED', qty: 2 },
    { sub: 1, status: 'DELIVERED', qty: 1 },
    { sub: 2, status: 'DELIVERED', qty: 4 },
    { sub: 3, status: 'DELIVERED', qty: 1 },
    { sub: 4, status: 'DELIVERED', qty: 1 },
    { sub: 5, status: 'FAILED',    qty: 0, reason: 'Building inaccessible' },
    { sub: 6, status: 'DELIVERED', qty: 12 },
    { sub: 7, status: 'SKIPPED',   qty: 0, reason: 'Customer unavailable' },
    { sub: 8, status: 'PENDING',   qty: 3 },
    { sub: 9, status: 'PENDING',   qty: 1 },
    { sub: 10, status: 'IN_PROGRESS', qty: 2 },
  ];
  for (let i = 0; i < deliveryPlan.length; i++) {
    const d = deliveryPlan[i];
    const id = `00000000-0000-4000-8000-0000000009${String(i).padStart(2, '0')}`;
    const done = d.status === 'DELIVERED' || d.status === 'FAILED' || d.status === 'SKIPPED';
    const data = {
      routeVersionId: ID.routeVersion1,
      subscriptionId: subIds[d.sub],
      status: d.status,
      quantity: d.qty,
      reason: d.reason ?? null,
      notes: null,
      timestamp: done ? new Date(Date.now() - (11 - i) * 6 * 60 * 1000) : null,
      latitude: done ? 13.6288 + i * 0.002 : null,
      longitude: done ? 79.4192 + i * 0.002 : null,
    };
    await prisma.delivery.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  // ---- Training session + checkpoints -----------------------------------
  await prisma.trainingSession.upsert({
    where: { id: ID.training1 },
    update: {},
    create: {
      id: ID.training1,
      mentorId: ID.mentor,
      traineeId: ID.driver1,
      routeName: 'Morning Route - Area 1 (Training)',
      status: 'COMPLETED',
      distance: 8400,
      duration: 4320,
      startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      endedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 4320 * 1000),
    },
  });
  for (let i = 0; i < 4; i++) {
    const l = LOCATIONS[i];
    const id = `00000000-0000-4000-8000-0000000010${String(i).padStart(2, '0')}`;
    const data = {
      trainingSessionId: ID.training1,
      name: l.name,
      address: l.address,
      latitude: l.lat,
      longitude: l.lng,
      deliveryType: 'Newspaper',
      quantity: 2 + i,
      notes: l.notes,
      floor: l.floor,
      unit: l.unit,
      entranceInstructions: l.entrance,
      securityInstructions: l.security,
    };
    await prisma.trainingCheckpoint.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  // ---- GPS track for live map -------------------------------------------
  await prisma.gPSPoint.deleteMany({ where: { userId: ID.driver1 } });
  const track = [];
  for (let i = 0; i < 25; i++) {
    track.push({
      userId: ID.driver1,
      routeId: ID.route1,
      latitude: 13.6288 + i * 0.0011,
      longitude: 79.4192 + i * 0.0009,
      accuracy: 8,
      speed: 6.5,
      heading: 45,
      timestamp: new Date(Date.now() - (25 - i) * 60 * 1000),
    });
  }
  await prisma.gPSPoint.createMany({ data: track });

  // ---- Issues ------------------------------------------------------------
  const issues = [
    { id: '00000000-0000-4000-8000-000000001101', reportedBy: ID.driver1, entityType: 'Location', entityId: locationIds[2], description: 'Wrong location — actual building is ~150 m north.', status: 'OPEN' },
    { id: '00000000-0000-4000-8000-000000001102', reportedBy: ID.driver1, entityType: 'Delivery', entityId: locationIds[5], description: 'Building inaccessible, main gate locked.', status: 'OPEN' },
    { id: '00000000-0000-4000-8000-000000001103', reportedBy: ID.driver2, entityType: 'Location', entityId: locationIds[9], description: 'Subscription cancelled, shop closed.', status: 'RESOLVED' },
  ];
  for (const iss of issues) {
    await prisma.issue.upsert({ where: { id: iss.id }, update: iss, create: iss });
  }

  // ---- Audit log ---------------------------------------------------------
  const audits = [
    { id: '00000000-0000-4000-8000-000000001201', userId: ID.admin, action: 'LOCATION_CREATED',   entityType: 'DeliveryLocation', entityId: locationIds[0], newValue: 'Green Residency', reason: null },
    { id: '00000000-0000-4000-8000-000000001202', userId: ID.admin, action: 'LOCATION_PAUSED',    entityType: 'DeliveryLocation', entityId: locationIds[8], oldValue: 'ACTIVE', newValue: 'PAUSED',    reason: 'Temporary suspension' },
    { id: '00000000-0000-4000-8000-000000001203', userId: ID.admin, action: 'LOCATION_CANCELLED', entityType: 'DeliveryLocation', entityId: locationIds[9], oldValue: 'ACTIVE', newValue: 'CANCELLED', reason: 'Subscription cancelled' },
    { id: '00000000-0000-4000-8000-000000001204', userId: ID.admin, action: 'ROUTE_CREATED',      entityType: 'Route',            entityId: ID.route1,      newValue: 'Morning Newspaper Route 01', reason: null },
  ];
  for (const a of audits) {
    await prisma.auditLog.upsert({ where: { id: a.id }, update: a, create: a });
  }

  // ---- Location history --------------------------------------------------
  await prisma.locationHistory.upsert({
    where: { id: '00000000-0000-4000-8000-000000001301' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000001301',
      deliveryLocationId: locationIds[2],
      changedBy: ID.admin,
      oldLatitude: 13.6400,
      oldLongitude: 79.4100,
      newLatitude: 13.6412,
      newLongitude: 79.4103,
      reason: 'Corrected after driver report — moved 380 m',
    },
  });

  const counts = {
    users: await prisma.user.count(),
    locations: await prisma.deliveryLocation.count(),
    subscriptions: await prisma.subscription.count(),
    routes: await prisma.route.count(),
    stops: await prisma.routeStop.count(),
    deliveries: await prisma.delivery.count(),
    training: await prisma.trainingSession.count(),
    gpsPoints: await prisma.gPSPoint.count(),
    issues: await prisma.issue.count(),
    auditLogs: await prisma.auditLog.count(),
  };
  console.log('Seed complete:', counts);

  console.log('\nDemo accounts — password is ADMIN_PASSWORD from your .env:');
  console.log('  admin@easydel.dev    ADMIN');
  console.log('  mentor@easydel.dev   MENTOR');
  console.log('  driver@easydel.dev   DELIVERY_AGENT');
  console.log('  driver2@easydel.dev  DELIVERY_AGENT');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
