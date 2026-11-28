import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeShareInput } from '@/lib/share-code';
import { signedPhotoUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Resolves a route or location by 8-character share code for mobile preview
 * (usable by both signed-in riders and "Continue without login" guests).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await context.params;
  const code = normalizeShareInput(decodeURIComponent(raw)) ?? raw.trim().toUpperCase();

  const route = await db.route.findUnique({
    where: { shareCode: code },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
        include: {
          stops: {
            orderBy: { sequence: 'asc' },
            include: {
              deliveryLocation: {
                include: { subscriptions: { where: { status: 'ACTIVE' } } },
              },
            },
          },
        },
      },
    },
  });

  if (route && route.status !== 'ARCHIVED') {
    const latest = route.versions[0];
    const stops = latest
      ? await Promise.all(
          latest.stops.map(async (s) => {
            const loc = s.deliveryLocation;
            const photoUrl = await signedPhotoUrl(loc.photo);
            const items = loc.subscriptions.map((sub) => ({
              subscriptionId: sub.id,
              customer: sub.customerId,
              productType: sub.productType,
              quantity: sub.quantity,
              specialInstructions: sub.specialInstructions,
            }));
            return {
              id: s.id,
              routeVersionId: latest.id,
              locationId: loc.id,
              locationShareCode: loc.shareCode,
              sequence: s.sequence,
              name: loc.name,
              address: loc.address,
              latitude: loc.latitude,
              longitude: loc.longitude,
              floor: loc.floor,
              unit: loc.unit,
              notes: loc.notes,
              nextVisitNote: loc.nextVisitNote,
              entranceInstructions: loc.entranceInstructions,
              securityInstructions: loc.securityInstructions,
              photoUrl,
              totalItems: items.reduce((n, x) => n + x.quantity, 0),
              items,
            };
          }),
        )
      : [];

    return NextResponse.json({
      kind: 'route',
      code: route.shareCode ?? code,
      route: {
        id: route.id,
        name: route.name,
        shareCode: route.shareCode ?? code,
        creatorName: `${route.createdBy.firstName} ${route.createdBy.lastName}`.trim(),
        versionId: latest?.id ?? null,
        totalDistance: latest?.totalDistance ?? null,
        estimatedDuration: latest?.estimatedDuration ?? null,
        stops,
      },
    });
  }

  const location = await db.deliveryLocation.findUnique({
    where: { shareCode: code },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      subscriptions: { where: { status: 'ACTIVE' } },
    },
  });

  if (location && location.status !== 'ARCHIVED') {
    const photoUrl = await signedPhotoUrl(location.photo);
    const items = location.subscriptions.map((sub) => ({
      subscriptionId: sub.id,
      customer: sub.customerId,
      productType: sub.productType,
      quantity: sub.quantity,
      specialInstructions: sub.specialInstructions,
    }));
    return NextResponse.json({
      kind: 'location',
      code: location.shareCode ?? code,
      location: {
        id: location.id,
        name: location.name,
        address: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
        shareCode: location.shareCode ?? code,
        creatorName: location.createdBy
          ? `${location.createdBy.firstName} ${location.createdBy.lastName}`.trim()
          : 'EasyDel',
        floor: location.floor,
        unit: location.unit,
        notes: location.notes,
        nextVisitNote: location.nextVisitNote,
        entranceInstructions: location.entranceInstructions,
        securityInstructions: location.securityInstructions,
        photoUrl,
        totalItems: items.reduce((n, x) => n + x.quantity, 0),
        items,
      },
    });
  }

  return NextResponse.json(
    { error: `No route or location found for code “${code}”.` },
    { status: 404 },
  );
}
