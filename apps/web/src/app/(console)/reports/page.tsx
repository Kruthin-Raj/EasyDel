import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { seesAllData } from '@/lib/scope';
import Forbidden from '@/components/Forbidden';
import { PageHeader, Card, StatCard, Table, Td, EmptyState, metres, duration } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** Accessible CSS bar chart — no chart library, works without JS. */
function BarChart({
  data,
  caption,
}: {
  data: { label: string; value: number; color: string }[];
  caption: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <figure className="p-5">
      <figcaption className="sr-only">{caption}</figcaption>
      {total === 0 ? (
        <p className="text-sm text-ink-dim">No data yet.</p>
      ) : (
        <ul className="space-y-3">
          {data.map((d) => (
            <li key={d.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-ink">{d.label}</span>
                <span className="tabular-nums text-ink-dim">
                  {d.value}
                  <span className="ml-1 text-xs text-ink-dim">
                    ({total ? Math.round((d.value / total) * 100) : 0}%)
                  </span>
                </span>
              </div>
              <div
                className="mt-1 h-2 w-full overflow-hidden rounded-full bg-panel-2"
                role="img"
                aria-label={`${d.label}: ${d.value} of ${total}`}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${((d.value / max) * 100).toFixed(1)}%`, backgroundColor: d.color }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

export default async function ReportsPage() {
  const user = await requireUser();

  /*
   * Reports aggregate the whole operation — every driver's deliveries, every
   * route's distance. There is no meaningful way to scope that to one agent
   * (a report of yourself is just your delivery history), so the page is
   * limited to the roles that supervise. The nav link is hidden for agents to
   * match; this is the check that holds for a typed URL.
   */
  if (!seesAllData(user)) {
    return (
      <Forbidden
        title="Reports cover the whole operation"
        reason="These figures combine every driver's deliveries and routes, so they are limited to administrators and mentors."
        role={user.role}
        hint="Your own deliveries, with a per-round report, are under Delivery history."
      />
    );
  }

  const [byStatus, routeAgg, stopCount, training, drivers, locationsByStatus] = await Promise.all([
    db.delivery.groupBy({ by: ['status'], _count: { _all: true }, _sum: { quantity: true } }),
    db.routeVersion.aggregate({
      _sum: { totalDistance: true, estimatedDuration: true },
      _avg: { totalDistance: true },
      _count: true,
    }),
    db.routeStop.count(),
    db.trainingSession.aggregate({ _sum: { distance: true, duration: true }, _count: true }),
    db.driverProfile.findMany({
      include: {
        user: true,
        assignedRoutes: {
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
              include: { _count: { select: { stops: true, deliveries: true } } },
            },
          },
        },
      },
    }),
    db.deliveryLocation.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const delivered = count('DELIVERED');
  const failed = count('FAILED');
  const skipped = count('SKIPPED');
  const pending = count('PENDING') + count('IN_PROGRESS');
  const attempted = delivered + failed + skipped;
  const successRate = attempted ? Math.round((delivered / attempted) * 100) : 0;
  const itemsDelivered =
    byStatus.find((b) => b.status === 'DELIVERED')?._sum.quantity ?? 0;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Aggregates computed live from delivery, route and training records."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Success rate"
          value={`${successRate}%`}
          hint={`${delivered} of ${attempted} attempted`}
          tone={successRate >= 90 ? 'positive' : successRate >= 70 ? 'warning' : 'critical'}
        />
        <StatCard label="Items delivered" value={itemsDelivered} tone="positive" />
        <StatCard label="Total distance planned" value={metres(routeAgg._sum.totalDistance)} />
        <StatCard
          label="Avg route distance"
          value={metres(routeAgg._avg.totalDistance)}
          hint={`across ${routeAgg._count} version${routeAgg._count === 1 ? '' : 's'}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Deliveries by outcome">
          <BarChart
            caption="Delivery outcomes"
            data={[
              { label: 'Delivered', value: delivered, color: 'var(--color-ok)' },
              { label: 'Pending', value: pending, color: 'var(--color-warn)' },
              { label: 'Failed', value: failed, color: 'var(--color-bad)' },
              { label: 'Skipped', value: skipped, color: 'var(--color-idle)' },
            ]}
          />
        </Card>

        <Card title="Locations by lifecycle status">
          <BarChart
            caption="Location statuses"
            data={[
              { label: 'Active', value: locationsByStatus.find((l) => l.status === 'ACTIVE')?._count._all ?? 0, color: 'var(--color-ok)' },
              { label: 'Paused', value: locationsByStatus.find((l) => l.status === 'PAUSED')?._count._all ?? 0, color: 'var(--color-warn)' },
              { label: 'Cancelled', value: locationsByStatus.find((l) => l.status === 'CANCELLED')?._count._all ?? 0, color: 'var(--color-bad)' },
              { label: 'Archived', value: locationsByStatus.find((l) => l.status === 'ARCHIVED')?._count._all ?? 0, color: 'var(--color-idle)' },
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Route planning totals">
          <div className="grid grid-cols-2 gap-px bg-line">
            {[
              { label: 'Route versions', value: String(routeAgg._count) },
              { label: 'Total stops planned', value: String(stopCount) },
              { label: 'Total planned driving', value: duration(routeAgg._sum.estimatedDuration) },
              {
                label: 'Avg stops per version',
                value: routeAgg._count ? (stopCount / routeAgg._count).toFixed(1) : '—',
              },
            ].map((m) => (
              <div key={m.label} className="bg-panel px-5 py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-dim">
                  {m.label}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{m.value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Training totals">
          <div className="grid grid-cols-2 gap-px bg-line">
            {[
              { label: 'Sessions completed', value: String(training._count) },
              { label: 'Distance trained', value: metres(training._sum.distance) },
              { label: 'Time trained', value: duration(training._sum.duration) },
              {
                label: 'Avg session',
                value: training._count
                  ? duration((training._sum.duration ?? 0) / training._count)
                  : '—',
              },
            ].map((m) => (
              <div key={m.label} className="bg-panel px-5 py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-dim">
                  {m.label}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{m.value}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Driver performance" description="Routes assigned and stops planned per driver.">
        {drivers.length === 0 ? (
          <EmptyState message="No drivers to report on." />
        ) : (
          <Table head={['Driver', 'Vehicle', 'Routes assigned', 'Stops on latest versions', 'Status']}>
            {drivers.map((d) => {
              const stops = d.assignedRoutes.reduce(
                (sum, r) => sum + (r.versions[0]?._count.stops ?? 0),
                0,
              );
              return (
                <tr key={d.id} className="hover:bg-panel-2/60">
                  <Td className="font-medium text-ink">
                    {d.user.firstName} {d.user.lastName}
                  </Td>
                  <Td className="text-ink-dim">{d.vehicleType ?? '—'}</Td>
                  <Td className="tabular-nums text-ink">{d.assignedRoutes.length}</Td>
                  <Td className="tabular-nums text-ink">{stops}</Td>
                  <Td className="text-ink-dim">{d.active ? 'Active' : 'Inactive'}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <p className="text-sm text-ink-dim">
        Average delivery time per stop is not reported yet — it needs per-stop start timestamps,
        which the mobile app will record once delivery completion is built. See the README TODO.
      </p>
    </>
  );
}
