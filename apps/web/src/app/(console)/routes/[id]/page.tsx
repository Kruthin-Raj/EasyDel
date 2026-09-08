import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { reoptimizeRouteAction, assignDriverAction } from '@/lib/actions';
import LiveMap, { type MapMarker } from '@/components/Map';
import { signedPhotoUrl } from '@/lib/storage';
import { PageHeader, Card, Table, Td, Badge, EmptyState, Button, when, duration, metres } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function RouteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const route = await db.route.findUnique({
    where: { id },
    include: {
      createdBy: true,
      approvedBy: true,
      driver: { include: { user: true } },
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: {
          stops: {
            orderBy: { sequence: 'asc' },
            include: { deliveryLocation: { include: { subscriptions: true } } },
          },
        },
      },
    },
  });

  if (!route) notFound();

  const drivers = await db.driverProfile.findMany({
    where: { active: true },
    include: { user: true },
  });

  const latest = route.versions[0];
  const geometry: number[][] | null = latest?.routeGeometry
    ? (() => {
        try {
          const parsed = JSON.parse(latest.routeGeometry);
          return Array.isArray(parsed?.coordinates) ? parsed.coordinates : null;
        } catch {
          return null;
        }
      })()
    : null;

  const markers: MapMarker[] = [];
  if (latest?.startLatitude != null && latest.startLongitude != null) {
    markers.push({
      id: 'start',
      lat: latest.startLatitude,
      lng: latest.startLongitude,
      name: latest.startLocationName ?? 'Start',
      state: 'start',
    });
  }
  latest?.stops.forEach((s) => {
    markers.push({
      id: s.id,
      lat: s.deliveryLocation.latitude,
      lng: s.deliveryLocation.longitude,
      name: s.deliveryLocation.name,
      sequence: s.sequence,
      state: s.deliveryLocation.status === 'ACTIVE' ? 'remaining' : 'completed',
      subtitle: s.deliveryLocation.address,
    });
  });
  if (latest?.endLatitude != null && latest.endLongitude != null) {
    markers.push({
      id: 'end',
      lat: latest.endLatitude,
      lng: latest.endLongitude,
      name: latest.endLocationName ?? 'End',
      state: 'end',
    });
  }

  const staleStops = latest?.stops.filter((s) => s.deliveryLocation.status !== 'ACTIVE') ?? [];

  const stopsWithPhotos = latest ? await Promise.all(
    latest.stops.map(async (s) => {
      let url = null;
      if (s.deliveryLocation.photo) {
        url = await signedPhotoUrl(s.deliveryLocation.photo);
      }
      return { ...s, resolvedPhotoUrl: url };
    })
  ) : [];

  return (
    <>
      <PageHeader
        title={route.name}
        subtitle={`Created by ${route.createdBy.firstName} ${route.createdBy.lastName} on ${when(route.createdAt)}`}
        actions={
          <>
            <Link
              href={`/routes/${route.id}/run`}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
            >
              Run this route
            </Link>
            <Link
              href={`/routes/${route.id}/edit`}
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              Edit route
            </Link>
            <Link
              href="/routes"
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              All routes
            </Link>
            <form action={reoptimizeRouteAction}>
              <input type="hidden" name="routeId" value={route.id} />
              <Button>Re-optimise (new version)</Button>
            </form>
          </>
        }
      />

      {staleStops.length > 0 && (
        <div className="rounded-lg bg-warn-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-warn/30">
          <strong>Route needs re-optimisation.</strong> {staleStops.length} stop
          {staleStops.length === 1 ? '' : 's'} no longer active:{' '}
          {staleStops.map((s) => s.deliveryLocation.name).join(', ')}. Re-optimising creates a new
          version and leaves this one intact for history.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-dim">Status</p>
          <p className="mt-1.5">
            <Badge>{route.status}</Badge>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-dim">Stops</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
            {latest?.stops.length ?? 0}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-dim">Distance</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
            {metres(latest?.totalDistance)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-dim">Est. duration</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
            {duration(latest?.estimatedDuration)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-dim">Version</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
            v{latest?.versionNumber ?? '—'}
          </p>
        </Card>
      </div>

      <Card title="Planned route" description="Start, numbered stops in optimised order, then end.">
        <div className="h-96 p-4">
          <LiveMap markers={markers} routeGeometry={geometry} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Stops in order">
            {!latest || latest.stops.length === 0 ? (
              <EmptyState message="This version has no stops." />
            ) : (
              <Table head={['#', 'Location', 'Deliveries', 'Leg distance', 'Status']}>
                {stopsWithPhotos.map((s) => {
                  const active = s.deliveryLocation.subscriptions.filter(
                    (x) => x.status === 'ACTIVE',
                  );
                  const qty = active.reduce((sum, x) => sum + x.quantity, 0);
                  return (
                    <tr key={s.id} className="align-top hover:bg-panel-2/60">
                      <Td className="tabular-nums font-medium text-ink">{s.sequence}</Td>
                      <Td>
                        <p className="font-medium text-ink">{s.deliveryLocation.name}</p>
                        <p className="text-xs text-ink-dim">{s.deliveryLocation.address}</p>
                        {s.deliveryLocation.notes && (
                          <p className="mt-0.5 text-xs text-ink-dim">
                            {s.deliveryLocation.notes}
                          </p>
                        )}
                        {s.resolvedPhotoUrl && (
                          <div className="mt-2">
                            <img src={s.resolvedPhotoUrl} alt="House photo" className="h-20 w-auto rounded-md object-cover ring-1 ring-line" />
                          </div>
                        )}
                      </Td>
                      <Td className="text-ink">
                        {qty} item{qty === 1 ? '' : 's'}
                        <p className="text-xs text-ink-dim">
                          {active.map((x) => `${x.customerId ?? 'Customer'} × ${x.quantity}`).join(', ') || '—'}
                        </p>
                      </Td>
                      <Td className="tabular-nums text-ink">
                        {metres(s.distanceFromPrevious)}
                        <p className="text-xs text-ink-dim">
                          {duration(s.durationFromPrevious)}
                        </p>
                      </Td>
                      <Td>
                        <Badge>{s.deliveryLocation.status}</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Driver">
            <div className="space-y-3 p-5">
              <p className="text-sm text-ink">
                {route.driver
                  ? `${route.driver.user.firstName} ${route.driver.user.lastName}`
                  : 'Unassigned'}
              </p>
              <form action={assignDriverAction} className="space-y-3">
                <input type="hidden" name="routeId" value={route.id} />
                <select
                  name="driverId"
                  defaultValue={route.driverId ?? ''}
                  className="field text-sm"
                >
                  <option value="">Unassigned</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.user.firstName} {d.user.lastName}
                    </option>
                  ))}
                </select>
                <Button variant="secondary">Update driver</Button>
              </form>
            </div>
          </Card>

          <Card title="Version history" description="Older versions keep their own stops.">
            <ul className="divide-y divide-line/70">
              {route.versions.map((v) => (
                <li key={v.id} className="flex items-baseline justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">v{v.versionNumber}</p>
                    <p className="text-xs text-ink-dim">{when(v.createdAt)}</p>
                  </div>
                  <p className="text-sm tabular-nums text-ink-dim">
                    {metres(v.totalDistance)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
