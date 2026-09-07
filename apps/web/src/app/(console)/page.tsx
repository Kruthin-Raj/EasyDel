import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { PageHeader, StatCard, Card, Table, Td, Badge, EmptyState, when, metres } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

  const [
    totalDrivers,
    activeDrivers,
    routesToday,
    delivered,
    pending,
    failed,
    skipped,
    trainingSessions,
    activeGpsUsers,
    openIssues,
    recentDeliveries,
    recentAudit,
  ] = await Promise.all([
    db.driverProfile.count(),
    db.driverProfile.count({ where: { active: true } }),
    db.route.count({ where: { createdAt: { gte: startOfDay } } }),
    db.delivery.count({ where: { status: 'DELIVERED' } }),
    db.delivery.count({ where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
    db.delivery.count({ where: { status: 'FAILED' } }),
    db.delivery.count({ where: { status: 'SKIPPED' } }),
    db.trainingSession.count(),
    db.gPSPoint.findMany({
      where: { timestamp: { gte: fifteenMinAgo } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    db.issue.count({ where: { status: 'OPEN' } }),
    db.delivery.findMany({
      take: 8,
      orderBy: { updatedAt: 'desc' },
      include: { subscription: { include: { deliveryLocation: true } } },
    }),
    db.auditLog.findMany({ take: 6, orderBy: { timestamp: 'desc' }, include: { user: true } }),
  ]);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.firstName}`}
        subtitle="Live overview of drivers, routes and deliveries."
        actions={
          <Link
            href="/routes/new"
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
          >
            New route
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total drivers" value={totalDrivers} />
        <StatCard label="Active drivers" value={activeDrivers} tone="positive" />
        <StatCard label="Routes today" value={routesToday} tone="info" />
        <StatCard
          label="Active GPS sessions"
          value={activeGpsUsers.length}
          hint="Reported in the last 15 min"
          tone={activeGpsUsers.length > 0 ? 'positive' : 'neutral'}
        />
        <StatCard label="Delivered" value={delivered} tone="positive" />
        <StatCard label="Pending" value={pending} tone="warning" />
        <StatCard label="Failed" value={failed} tone={failed > 0 ? 'critical' : 'neutral'} />
        <StatCard label="Skipped" value={skipped} />
        <StatCard label="Training sessions" value={trainingSessions} />
        <StatCard
          label="Open issues"
          value={openIssues}
          tone={openIssues > 0 ? 'critical' : 'positive'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Recent deliveries" description="Most recently updated first.">
          {recentDeliveries.length === 0 ? (
            <EmptyState message="No deliveries recorded yet." hint="Create a route and mark stops delivered." />
          ) : (
            <Table head={['Location', 'Customer', 'Qty', 'Status', 'When']}>
              {recentDeliveries.map((d) => (
                <tr key={d.id} className="hover:bg-panel-2/60">
                  <Td className="font-medium text-ink">
                    {d.subscription.deliveryLocation.name}
                  </Td>
                  <Td>{d.subscription.customerId ?? '—'}</Td>
                  <Td className="tabular-nums">{d.quantity}</Td>
                  <Td>
                    <Badge>{d.status}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-dim">{when(d.timestamp)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Audit trail" description="Recent changes to locations, routes and settings.">
          {recentAudit.length === 0 ? (
            <EmptyState message="No audit events yet." />
          ) : (
            <ul className="divide-y divide-line/70">
              {recentAudit.map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-ink">
                      {a.action.replace(/_/g, ' ').toLowerCase()}
                    </p>
                    <p className="text-xs text-ink-dim">{when(a.timestamp)}</p>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-dim">
                    {a.newValue ?? a.entityType}
                    {a.reason ? ` — ${a.reason}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    by {a.user.firstName} {a.user.lastName}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="Reports"
        description="Distance and duration totals across all recorded route versions."
      >
        <RouteTotals />
      </Card>
    </>
  );
}

async function RouteTotals() {
  const agg = await db.routeVersion.aggregate({
    _sum: { totalDistance: true, estimatedDuration: true },
    _count: true,
  });
  const stops = await db.routeStop.count();

  return (
    <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
      {[
        { label: 'Route versions', value: agg._count },
        { label: 'Total stops', value: stops },
        { label: 'Total distance', value: metres(agg._sum.totalDistance) },
        {
          label: 'Planned duration',
          value: agg._sum.estimatedDuration
            ? `${Math.round(agg._sum.estimatedDuration / 60)} min`
            : '—',
        },
      ].map((s) => (
        <div key={s.label} className="bg-panel px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-dim">{s.label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{s.value}</p>
        </div>
      ))}
    </div>
  );
}
