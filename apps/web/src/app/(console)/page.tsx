import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { deliveryWhere, issueWhere, routeWhere, trainingWhere } from '@/lib/scope';
import JoinRouteForm from '@/components/JoinRouteForm';
import { PageHeader, StatCard, Card, Table, Td, Badge, EmptyState, when } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();

  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

  const dScope = deliveryWhere(user);
  const iScope = issueWhere(user);
  const rScope = await routeWhere(user);
  const tScope = trainingWhere(user);

  const [
    myRoutesCount,
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
    db.route.count({ where: { ...rScope, status: { not: 'ARCHIVED' } } }),
    db.delivery.count({ where: { ...dScope, status: 'DELIVERED' } }),
    db.delivery.count({ where: { ...dScope, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
    db.delivery.count({ where: { ...dScope, status: 'FAILED' } }),
    db.delivery.count({ where: { ...dScope, status: 'SKIPPED' } }),
    db.trainingSession.count({ where: tScope }),
    db.gPSPoint.findMany({
      where: {
        timestamp: { gte: fifteenMinAgo },
        userId: user.id,
      },
      select: { userId: true },
      distinct: ['userId'],
    }),
    db.issue.count({ where: { ...iScope, status: 'OPEN' } }),
    db.delivery.findMany({
      where: dScope,
      take: 8,
      orderBy: { updatedAt: 'desc' },
      include: { subscription: { include: { deliveryLocation: true } } },
    }),
    db.auditLog.findMany({
      where: { userId: user.id },
      take: 6,
      orderBy: { timestamp: 'desc' },
      include: { user: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.firstName}`}
        subtitle="Create routes, share them by code or link, memorize every stop, and record deliveries."
        actions={
          <>
            <Link
              href="/routes/from-links"
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
            >
              Route from links
            </Link>
            <Link
              href="/record"
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              Record by driving
            </Link>
            <Link
              href="/routes/new"
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              From saved locations
            </Link>
          </>
        }
      />

      <JoinRouteForm />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="My routes"
          value={myRoutesCount}
          hint="Created & saved routes"
          tone="info"
        />
        <StatCard label="Delivered" value={delivered} tone="positive" />
        <StatCard label="Pending" value={pending} tone="warning" />
        <StatCard label="Failed" value={failed} tone={failed > 0 ? 'critical' : 'neutral'} />
        <StatCard label="Skipped" value={skipped} />
        <StatCard label="Recorded rounds" value={trainingSessions} />
        <StatCard
          label="My GPS tracking"
          value={activeGpsUsers.length}
          hint="Reported in the last 15 min"
          tone={activeGpsUsers.length > 0 ? 'positive' : 'neutral'}
        />
        <StatCard
          label="Open issues"
          value={openIssues}
          tone={openIssues > 0 ? 'critical' : 'positive'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Your recent deliveries"
          description="Most recently updated first."
        >
          {recentDeliveries.length === 0 ? (
            <EmptyState message="No deliveries recorded yet." hint="Open a route and mark stops delivered." />
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

        <Card
          title="Your recent activity"
          description="Changes you have made to locations, routes and settings."
        >
          {recentAudit.length === 0 ? (
            <EmptyState message="No activity yet." />
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
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
