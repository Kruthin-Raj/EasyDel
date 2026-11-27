import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import LiveMap, { type MapMarker } from '@/components/Map';
import { PageHeader, Card, Badge, EmptyState, Notice, when, metres } from '@/components/ui';

export const dynamic = 'force-dynamic';

const ACTIVE_WINDOW_MIN = 15;

export default async function LivePage() {
  const user = await requireUser();

  const since = new Date(Date.now() - ACTIVE_WINDOW_MIN * 60 * 1000);

  const recent = await db.gPSPoint.findMany({
    where: {
      timestamp: { gte: since },
      userId: user.id,
    },
    orderBy: { timestamp: 'desc' },
  });

  const latest = recent[0] ?? null;

  const activeRun = await db.routeRun.findFirst({
    where: { driverId: user.id, status: 'IN_PROGRESS' },
    orderBy: { startedAt: 'desc' },
    include: {
      routeVersion: {
        include: {
          route: { select: { name: true } },
          stops: { include: { deliveryLocation: true }, orderBy: { sequence: 'asc' } },
        },
      },
      deliveries: { select: { status: true } },
    },
  });

  const track = recent
    .slice()
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .map((p) => [p.longitude, p.latitude]);

  const markers: MapMarker[] = [];
  if (latest) {
    markers.push({
      id: user.id,
      lat: latest.latitude,
      lng: latest.longitude,
      name: `${user.firstName} ${user.lastName}`,
      state: 'driver',
      subtitle: `Last seen ${when(latest.timestamp)}`,
    });
  }

  activeRun?.routeVersion.stops.forEach((s) => {
    markers.push({
      id: s.id,
      lat: s.deliveryLocation.latitude,
      lng: s.deliveryLocation.longitude,
      name: s.deliveryLocation.name,
      sequence: s.sequence,
      state: 'remaining',
      subtitle: s.deliveryLocation.address,
    });
  });

  const total = activeRun?.routeVersion.stops.length ?? 0;
  const done =
    activeRun?.deliveries.filter((d) => d.status === 'DELIVERED').length ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Live GPS"
        subtitle={`Your GPS positions reported in the last ${ACTIVE_WINDOW_MIN} minutes.`}
      />

      {!latest && (
        <Notice tone="warning">
          No recent GPS points in the last {ACTIVE_WINDOW_MIN} minutes. Live location updates
          appear while you are recording a route or running a delivery.
        </Notice>
      )}

      <Card
        title="Map"
        description="Red marker is your last known position; numbered pins are your active run's stops."
      >
        <div className="h-[28rem] p-4">
          <LiveMap markers={markers} routeGeometry={track.length > 1 ? track : null} />
        </div>
      </Card>

      {!latest ? (
        <Card>
          <EmptyState message="No recent GPS activity." />
        </Card>
      ) : (
        <Card title={`${user.firstName} ${user.lastName}`} description={user.email}>
          <dl className="divide-y divide-line/70">
            {[
              { k: 'Active run', v: activeRun?.routeVersion.route.name ?? 'None in progress' },
              { k: 'Position', v: `${latest.latitude.toFixed(5)}, ${latest.longitude.toFixed(5)}` },
              { k: 'Speed', v: latest.speed != null ? `${(latest.speed * 3.6).toFixed(1)} km/h` : '—' },
              { k: 'Accuracy', v: latest.accuracy != null ? metres(latest.accuracy) : '—' },
              { k: 'Last update', v: when(latest.timestamp) },
            ].map((row) => (
              <div key={row.k} className="flex flex-wrap justify-between gap-2 px-5 py-2.5">
                <dt className="text-sm font-medium text-ink">{row.k}</dt>
                <dd className="text-sm tabular-nums text-ink-dim">{row.v}</dd>
              </div>
            ))}
          </dl>

          <div className="border-t border-line px-5 py-4">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-ink">Run progress</p>
              <p className="text-sm tabular-nums text-ink-dim">
                {done} / {total} stops
              </p>
            </div>
            <div
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-panel-2"
              role="img"
              aria-label={`${pct}% complete`}
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2">
              <Badge>{total === 0 ? 'DRAFT' : done === total ? 'DELIVERED' : 'IN_PROGRESS'}</Badge>
            </p>
          </div>
        </Card>
      )}
    </>
  );
}
