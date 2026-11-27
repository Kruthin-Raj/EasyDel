import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { deliveryWhere, locationWhere, routeWhere, trainingWhere } from '@/lib/scope';
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
  const dScope = deliveryWhere(user);
  const rScope = await routeWhere(user);
  const tScope = trainingWhere(user);

  const [byStatus, myRoutes, training, locationsByStatus] = await Promise.all([
    db.delivery.groupBy({
      by: ['status'],
      where: dScope,
      _count: { _all: true },
      _sum: { quantity: true },
    }),
    db.route.findMany({
      where: rScope,
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { _count: { select: { stops: true } } },
        },
        _count: { select: { versions: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.trainingSession.aggregate({
      where: tScope,
      _sum: { distance: true, duration: true },
      _count: true,
    }),
    db.deliveryLocation.groupBy({
      by: ['status'],
      where: locationWhere(user),
      _count: { _all: true },
    }),
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

  const totalDistance = myRoutes.reduce((sum, r) => sum + (r.versions[0]?.totalDistance ?? 0), 0);
  const avgDistance = myRoutes.length ? totalDistance / myRoutes.length : null;
  const totalStops = myRoutes.reduce((sum, r) => sum + (r.versions[0]?._count.stops ?? 0), 0);
  const totalPlannedDuration = myRoutes.reduce(
    (sum, r) => sum + (r.versions[0]?.estimatedDuration ?? 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="My reports"
        subtitle="Summary of your deliveries, routes, and recorded rounds."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Success rate"
          value={`${successRate}%`}
          hint={`${delivered} of ${attempted} attempted`}
          tone={successRate >= 90 ? 'positive' : successRate >= 70 ? 'warning' : 'critical'}
        />
        <StatCard label="Items delivered" value={itemsDelivered} tone="positive" />
        <StatCard label="Combined route distance" value={metres(totalDistance)} />
        <StatCard
          label="Avg route distance"
          value={metres(avgDistance)}
          hint={`across ${myRoutes.length} route${myRoutes.length === 1 ? '' : 's'}`}
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
        <Card title="My route totals">
          <div className="grid grid-cols-2 gap-px bg-line">
            {[
              { label: 'Routes in list', value: String(myRoutes.length) },
              { label: 'Total stops', value: String(totalStops) },
              { label: 'Planned time', value: duration(totalPlannedDuration) },
              {
                label: 'Avg stops per route',
                value: myRoutes.length ? (totalStops / myRoutes.length).toFixed(1) : '—',
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

        <Card title="Recorded rounds">
          <div className="grid grid-cols-2 gap-px bg-line">
            {[
              { label: 'Rounds recorded', value: String(training._count) },
              { label: 'Distance recorded', value: metres(training._sum.distance) },
              { label: 'Time recorded', value: duration(training._sum.duration) },
              {
                label: 'Avg round',
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

      <Card title="My routes summary" description="Routes you created or saved via share code.">
        {myRoutes.length === 0 ? (
          <EmptyState message="No routes yet." />
        ) : (
          <Table head={['Route', 'Source', 'Stops', 'Distance', 'Versions']}>
            {myRoutes.map((r) => (
              <tr key={r.id} className="hover:bg-panel-2/60">
                <Td className="font-medium text-ink">
                  <Link href={`/routes/${r.id}`} className="text-accent hover:underline">
                    {r.name}
                  </Link>
                </Td>
                <Td className="text-ink-dim">
                  {r.createdById === user.id
                    ? 'Created by you'
                    : `Saved · ${r.createdBy.firstName} ${r.createdBy.lastName}`}
                </Td>
                <Td className="tabular-nums text-ink">{r.versions[0]?._count.stops ?? 0}</Td>
                <Td className="tabular-nums text-ink">{metres(r.versions[0]?.totalDistance)}</Td>
                <Td className="tabular-nums text-ink-dim">{r._count.versions}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
