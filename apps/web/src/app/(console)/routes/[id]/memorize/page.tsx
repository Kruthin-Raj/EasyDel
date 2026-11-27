import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { loadSettings, parseGeofenceMetres } from '@/lib/permissions';
import { canAccessRoute } from '@/lib/route-sharing';
import { signedPhotoUrl } from '@/lib/storage';
import Forbidden from '@/components/Forbidden';
import MemorizeConsole, { type MemorizeStop } from '@/components/MemorizeConsole';
import { PageHeader, Card, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Memorize route — EasyDel' };

export default async function MemorizeRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const route = await db.route.findUnique({
    where: { id },
    include: {
      createdBy: true,
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

  if (!route) notFound();

  if (!(await canAccessRoute(user.id, route.id))) {
    return (
      <Forbidden
        title="Save this route before memorizing it"
        reason="You can memorize and deliver routes you created or saved using a share code or link."
        hint="Ask the creator for the route code or link, then open Join by code."
      />
    );
  }

  const version = route.versions[0];
  if (!version || version.stops.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Memorize route"
          title={route.name}
          actions={
            <Link
              href={`/routes/${route.id}`}
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              Route details
            </Link>
          }
        />
        <Card>
          <EmptyState
            message="This route has no stops yet."
            hint="Add stops before practicing the route."
          />
        </Card>
      </>
    );
  }

  const settings = await loadSettings();
  const geofenceMetres = parseGeofenceMetres(settings, user.id);

  const photoUrls = await Promise.all(
    version.stops.map((s) => signedPhotoUrl(s.deliveryLocation.photo, 60 * 60 * 8)),
  );

  const stops: MemorizeStop[] = version.stops.map((s, i) => ({
    id: s.id,
    sequence: s.sequence,
    locationId: s.deliveryLocationId,
    name: s.deliveryLocation.name,
    address: s.deliveryLocation.address,
    latitude: s.deliveryLocation.latitude,
    longitude: s.deliveryLocation.longitude,
    notes: s.deliveryLocation.notes,
    previousNote: s.deliveryLocation.nextVisitNote,
    floor: s.deliveryLocation.floor,
    unit: s.deliveryLocation.unit,
    entranceInstructions: s.deliveryLocation.entranceInstructions,
    securityInstructions: s.deliveryLocation.securityInstructions,
    photoUrl: photoUrls[i],
    subscriptions: s.deliveryLocation.subscriptions.map((sub) => ({
      id: sub.id,
      customer: sub.customerId,
      productType: sub.productType,
      quantity: sub.quantity,
      specialInstructions: sub.specialInstructions,
    })),
  }));

  const routeGeometry: number[][] | null = version.routeGeometry
    ? (() => {
        try {
          const parsed = JSON.parse(version.routeGeometry);
          return Array.isArray(parsed?.coordinates) ? (parsed.coordinates as number[][]) : null;
        } catch {
          return null;
        }
      })()
    : null;

  const startPoint =
    version.startLatitude != null && version.startLongitude != null
      ? {
          name: version.startLocationName ?? 'Start',
          lat: version.startLatitude,
          lng: version.startLongitude,
        }
      : null;

  const endPoint =
    version.endLatitude != null && version.endLongitude != null
      ? {
          name: version.endLocationName ?? 'End',
          lat: version.endLatitude,
          lng: version.endLongitude,
        }
      : null;

  return (
    <>
      <PageHeader
        eyebrow="Memorize & practice"
        title={route.name}
        subtitle={`Step through all ${stops.length} stops with photos, drop quantities, and entrance notes — or switch on quiz mode to test your memory.`}
        actions={
          <>
            <Link
              href={`/routes/${route.id}`}
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              Route details
            </Link>
            <Link
              href={`/routes/${route.id}/run`}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
            >
              Deliver now
            </Link>
          </>
        }
      />

      <MemorizeConsole
        routeId={route.id}
        routeName={route.name}
        stops={stops}
        geofenceMetres={geofenceMetres}
        routeGeometry={routeGeometry}
        startPoint={startPoint}
        endPoint={endPoint}
      />
    </>
  );
}
