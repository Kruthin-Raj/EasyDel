import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBearerUser } from '@/lib/auth';
import { routeWhere, locationWhere } from '@/lib/scope';
import { ensureLocationShareCode, ensureRouteShareCode } from '@/lib/route-sharing';
import { signedPhotoUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** Returns all routes & saved locations owned or joined by this mobile user for offline caching. */
export async function GET(request: Request) {
  const user = await getBearerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const [rawRoutes, rawLocations] = await Promise.all([
    db.route.findMany({
      where: { ...(await routeWhere(user)), status: { not: 'ARCHIVED' } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
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
    }),
    db.deliveryLocation.findMany({
      where: { ...locationWhere(user), status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      take: 100,
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
        shareCode: true,
        notes: true,
        entranceInstructions: true,
      },
    }),
  ]);

  const routes = await Promise.all(
    rawRoutes.map(async (route) => {
      const shareCode = route.shareCode ?? (await ensureRouteShareCode(route.id));
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

      return {
        id: route.id,
        name: route.name,
        shareCode,
        isOwner: route.createdById === user.id,
        creatorName: `${route.createdBy.firstName} ${route.createdBy.lastName}`.trim(),
        versionId: latest?.id ?? null,
        totalDistance: latest?.totalDistance ?? null,
        estimatedDuration: latest?.estimatedDuration ?? null,
        stops,
      };
    }),
  );

  const locations = await Promise.all(
    rawLocations.map(async (loc) => ({
      ...loc,
      shareCode: loc.shareCode ?? (await ensureLocationShareCode(loc.id)),
    })),
  );

  return NextResponse.json({ routes, locations, syncedAt: new Date().toISOString() });
}
