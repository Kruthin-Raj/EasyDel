import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { seesAllData } from '@/lib/scope';
import LiveMap, { type MapMarker } from '@/components/Map';
import { PageHeader, Card, Badge, EmptyState, Notice, when, metres } from '@/components/ui';

export const dynamic = 'force-dynamic';

const ACTIVE_WINDOW_MIN = 15;

export default async function LivePage() {
  const user = await requireUser();

  const since = new Date(Date.now() - ACTIVE_WINDOW_MIN * 60 * 1000);

  /*
   * Latest GPS point per driver within the active window.
   *
   * Unscoped this showed every driver's live position to every driver. Only
   * roles that supervise the operation see the whole fleet; an agent sees
   * their own trace, which is all they need to confirm tracking is working.
   */
  const recent = await db.gPSPoint.findMany({
    where: {
      timestamp: { gte: since },
      ...(seesAllData(user) ? {} : { userId: user.id }),
    },
    orderBy: { timestamp: 'desc' },
  });

  const latestByUser = new Map<string, (typeof recent)[number]>();
  for (const p of recent) if (!latestByUser.has(p.userId)) latestByUser.set(p.userId, p);

  const userIds = [...latestByUser.keys()];
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        include: {
          driverProfile: {
            include: {
              assignedRoutes: {
                include: {
                  versions: {
                    orderBy: { versionNumber: 'desc' },
                    take: 1,
                    include: {
                      stops: { include: { deliveryLocation: true }, orderBy: { sequence: 'asc' } },
                      deliveries: true,
                    },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  // Track polyline for the most recently seen driver.
  const primary = userIds[0];
  const track = primary
    ? recent
        .filter((p) => p.userId === primary)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        .map((p) => [p.longitude, p.latitude])
    : [];

  const markers: MapMarker[] = [];
  for (const u of users) {
    const p = latestByUser.get(u.id)!;
    markers.push({
      id: u.id,
      lat: p.latitude,
      lng: p.longitude,
      name: `${u.firstName} ${u.lastName}`,
      state: 'driver',
      subtitle: `Last seen ${when(p.timestamp)}`,
    });
  }

  const route = users[0]?.driverProfile?.assignedRoutes[0]?.versions[0];
  route?.stops.forEach((s) => {
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

  return (
    <>
      <PageHeader
        title="Live tracking"
        subtitle={`Drivers reporting GPS in the last ${ACTIVE_WINDOW_MIN} minutes.`}
      />

      {users.length === 0 && (
        <Notice tone="warning">
          No driver has reported a position in the last {ACTIVE_WINDOW_MIN} minutes. Positions
          arrive from the mobile app during an active route; the seeded demo track ages out after a
          while — re-run <code className="font-mono">pnpm --filter @delivery/database db:seed</code>{' '}
          to refresh it.
        </Notice>
      )}

      <Card
        title="Map"
        description="Red marker is the driver's last known position; numbered pins are their route stops."
      >
        <div className="h-[28rem] p-4">
          <LiveMap markers={markers} routeGeometry={track.length > 1 ? track : null} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {users.length === 0 ? (
          <Card>
            <EmptyState message="No active drivers." />
          </Card>
        ) : (
          users.map((u) => {
            const p = latestByUser.get(u.id)!;
            const version = u.driverProfile?.assignedRoutes[0]?.versions[0];
            const routeName = u.driverProfile?.assignedRoutes[0]?.name;
            const total = version?.stops.length ?? 0;
            const done =
              version?.deliveries.filter((d) => d.status === 'DELIVERED').length ?? 0;
            const pct = total ? Math.round((done / total) * 100) : 0;

            return (
              <Card key={u.id} title={`${u.firstName} ${u.lastName}`} description={u.email}>
                <dl className="divide-y divide-line/70">
                  {[
                    { k: 'Route', v: routeName ?? 'No route assigned' },
                    { k: 'Position', v: `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}` },
                    { k: 'Speed', v: p.speed != null ? `${(p.speed * 3.6).toFixed(1)} km/h` : '—' },
                    { k: 'Accuracy', v: p.accuracy != null ? metres(p.accuracy) : '—' },
                    { k: 'Last update', v: when(p.timestamp) },
                  ].map((row) => (
                    <div key={row.k} className="flex flex-wrap justify-between gap-2 px-5 py-2.5">
                      <dt className="text-sm font-medium text-ink">{row.k}</dt>
                      <dd className="text-sm tabular-nums text-ink-dim">{row.v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="border-t border-line px-5 py-4">
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-medium text-ink">Route progress</p>
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
            );
          })
        )}
      </div>
    </>
  );
}
