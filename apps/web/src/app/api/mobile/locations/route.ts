import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBearerUser } from '@/lib/auth';
import { allocateUniqueShareCode } from '@/lib/route-sharing';
import { parseMapLink, resolveShortLink } from '@/lib/map-links';
import { parseCsv, detectColumns, validateRows } from '@/lib/import-parse';
import { haversine, isValidCoord } from '@/lib/optimize';

export const dynamic = 'force-dynamic';

/** Creates a delivery location (from manual coords OR a map link) for the mobile user. */
export async function POST(request: Request) {
  const user = await getBearerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to add locations.' }, { status: 401 });
  }

  let body: {
    name?: string;
    address?: string;
    link?: string;
    latitude?: number;
    longitude?: number;
    floor?: string;
    unit?: string;
    notes?: string;
    entranceInstructions?: string;
    securityInstructions?: string;
    productType?: string;
    quantity?: number;
    confirmDuplicate?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: 'Location name is required.' }, { status: 400 });

  let lat = Number(body.latitude);
  let lng = Number(body.longitude);

  if (body.link?.trim()) {
    let parsed = parseMapLink(body.link.trim());
    if (parsed.needsResolution) parsed = await resolveShortLink(body.link.trim());
    if (parsed.latitude === null || parsed.longitude === null) {
      return NextResponse.json({ error: parsed.error ?? 'Could not read coords from link.' }, { status: 400 });
    }
    lat = parsed.latitude;
    lng = parsed.longitude;
  }

  if (!isValidCoord(lat, lng)) {
    return NextResponse.json({ error: 'Valid latitude and longitude (or a map link) required.' }, { status: 400 });
  }

  const nearby = await db.deliveryLocation.findMany({
    where: { createdById: user.id, status: { in: ['ACTIVE', 'PAUSED'] } },
    select: { id: true, name: true, latitude: true, longitude: true },
  });
  const dup = nearby.find((l) => haversine({ lat, lng }, { lat: l.latitude, lng: l.longitude }) < 60);
  if (dup && !body.confirmDuplicate) {
    const dist = Math.round(haversine({ lat, lng }, { lat: dup.latitude, lng: dup.longitude }));
    return NextResponse.json(
      { error: `Possible duplicate: “${dup.name}” is ${dist} m away. Tap "Create anyway" to force.` },
      { status: 409 },
    );
  }

  const shareCode = await allocateUniqueShareCode();
  const created = await db.deliveryLocation.create({
    data: {
      name,
      buildingName: name,
      address: String(body.address ?? '').trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      latitude: lat,
      longitude: lng,
      floor: body.floor?.trim() || null,
      unit: body.unit?.trim() || null,
      notes: body.notes?.trim() || null,
      entranceInstructions: body.entranceInstructions?.trim() || null,
      securityInstructions: body.securityInstructions?.trim() || null,
      shareCode,
      createdById: user.id,
    },
  });

  await db.subscription.create({
    data: {
      deliveryLocationId: created.id,
      customerId: name,
      productType: body.productType?.trim() || 'Newspaper',
      quantity: Math.max(1, Math.floor(Number(body.quantity) || 1)),
      frequency: 'DAILY',
    },
  });

  await db.auditLog.create({
    data: { userId: user.id, action: 'LOCATION_CREATED', entityType: 'DeliveryLocation', entityId: created.id, newValue: name },
  });

  return NextResponse.json({ ok: true, id: created.id, name: created.name, shareCode });
}

/** Updates location status (ACTIVE / PAUSED / ARCHIVED). */
export async function PATCH(request: Request) {
  const user = await getBearerUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  let body: { id?: string; status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'CANCELLED' };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const existing = await db.deliveryLocation.findUnique({ where: { id: String(body.id ?? '') } });
  if (!existing || existing.createdById !== user.id) {
    return NextResponse.json({ error: 'Location not found.' }, { status: 404 });
  }

  const status = body.status ?? 'ACTIVE';
  if (!['ACTIVE', 'PAUSED', 'ARCHIVED', 'CANCELLED'].includes(status)) {
    return NextResponse.json({ error: 'Unsupported status.' }, { status: 400 });
  }

  await db.deliveryLocation.update({
    where: { id: existing.id },
    data: { status: status as never },
  });

  return NextResponse.json({ ok: true, status });
}

/** Edits an owned location OR imports CSV rows cleanly from mobile. */
export async function PUT(request: Request) {
  const user = await getBearerUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  let body: {
    importCsv?: boolean;
    csvText?: string;
    id?: string;
    name?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    floor?: string;
    unit?: string;
    notes?: string;
    nextVisitNote?: string;
    entranceInstructions?: string;
    securityInstructions?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (body.importCsv) {
    const matrix = parseCsv(String(body.csvText ?? ''));
    if (matrix.length < 2) {
      return NextResponse.json(
        { error: 'Paste a header row plus at least one location row (Name, Address, Latitude, Longitude).' },
        { status: 400 },
      );
    }
    const existing = await db.deliveryLocation.findMany({
      where: { createdById: user.id },
      select: { name: true, latitude: true, longitude: true },
    });
    const map = detectColumns(matrix[0]);
    const rows = validateRows(matrix.slice(1), map, existing);
    const valid = rows.filter((r) => r.errors.length === 0 && !r.duplicateOf);
    if (valid.length === 0) {
      return NextResponse.json(
        { error: 'No importable rows (check Name, Address, Latitude, Longitude or duplicate pins).' },
        { status: 400 },
      );
    }

    let imported = 0;
    for (const r of valid) {
      if (!isValidCoord(r.latitude ?? NaN, r.longitude ?? NaN)) continue;
      const shareCode = await allocateUniqueShareCode();
      const loc = await db.deliveryLocation.create({
        data: {
          name: r.name,
          buildingName: r.name,
          address: r.address,
          latitude: r.latitude as number,
          longitude: r.longitude as number,
          notes: r.notes,
          shareCode,
          createdById: user.id,
        },
      });
      await db.subscription.create({
        data: {
          deliveryLocationId: loc.id,
          customerId: r.name,
          productType: r.productType ?? 'Newspaper',
          quantity: r.quantity && r.quantity > 0 ? r.quantity : 1,
          frequency: 'DAILY',
        },
      });
      imported++;
    }
    return NextResponse.json({ ok: true, imported });
  }

  const existing = await db.deliveryLocation.findUnique({ where: { id: String(body.id ?? '') } });
  if (!existing || existing.createdById !== user.id) {
    return NextResponse.json({ error: 'Location not found.' }, { status: 404 });
  }

  const name = body.name?.trim() || existing.name;
  const address = body.address?.trim() || existing.address;
  const lat = body.latitude !== undefined ? Number(body.latitude) : existing.latitude;
  const lng = body.longitude !== undefined ? Number(body.longitude) : existing.longitude;
  if (!isValidCoord(lat, lng)) {
    return NextResponse.json({ error: 'Valid coordinates required.' }, { status: 400 });
  }

  await db.deliveryLocation.update({
    where: { id: existing.id },
    data: {
      name,
      address,
      latitude: lat,
      longitude: lng,
      floor: body.floor !== undefined ? body.floor.trim() || null : existing.floor,
      unit: body.unit !== undefined ? body.unit.trim() || null : existing.unit,
      notes: body.notes !== undefined ? body.notes.trim() || null : existing.notes,
      nextVisitNote:
        body.nextVisitNote !== undefined ? body.nextVisitNote.trim() || null : existing.nextVisitNote,
      entranceInstructions:
        body.entranceInstructions !== undefined
          ? body.entranceInstructions.trim() || null
          : existing.entranceInstructions,
      securityInstructions:
        body.securityInstructions !== undefined
          ? body.securityInstructions.trim() || null
          : existing.securityInstructions,
    },
  });

  return NextResponse.json({ ok: true });
}
