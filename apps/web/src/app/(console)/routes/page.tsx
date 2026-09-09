import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { routeWhere } from '@/lib/scope';
import { reoptimizeRouteAction } from '@/lib/actions';
import { PageHeader, Card, Table, Td, Badge, EmptyState, Button, Notice, when, duration, metres } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function RoutesPage() {
  const user = await requireUser();

  /*
   * Routes an agent created themselves used to be missing from this list: the
   * filter matched only `driver.userId`, so anything they built but were not
   * formally assigned to was invisible. routeWhere covers created-by,
   * assigned-to and unclaimed, which is also what the run page already allows
   * an agent to start.
   */
  const routes = await db.route.findMany({
    where: await routeWhere(user),
    include: {
      createdBy: true,
      driver: { include: { user: true } },
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: {
          _count: { select: { stops: true } },
          stops: { include: { deliveryLocation: { select: { status: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  /*
   * The round this driver currently has open, if any.
   *
   * Only one run may be in progress at a time, so an unfinished round silently
   * blocks every new one. Until now the only place it appeared was that route's
   * own run screen — so a driver who had forgotten about it had nowhere to look,
   * and starting anything else just failed. This is that missing place.
   */
  const activeRun = await db.routeRun.findFirst({
    where: { driverId: user.id, status: 'IN_PROGRESS' },
    orderBy: { startedAt: 'desc' },
    select: {
      startedAt: true,
      routeVersion: {
        select: {
          routeId: true,
          route: { select: { name: true } },
          _count: { select: { stops: true } },
        },
      },
      _count: { select: { deliveries: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Delivery routes"
        subtitle="Each change creates a new version, so historical routes stay intact."
        actions={
          <>
            <Link
              href="/routes/from-links"
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
            >
              Route from map links
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

      {/* The one place a driver can always find the round they left open. */}
      {activeRun && (
        <Notice tone="warning">
          <strong className="font-semibold">You have a round in progress:</strong>{' '}
          <Link
            href={`/routes/${activeRun.routeVersion.routeId}/run`}
            className="font-semibold text-warn underline decoration-warn/50 underline-offset-2 hover:decoration-warn"
          >
            {activeRun.routeVersion.route.name}
          </Link>
          , started {when(activeRun.startedAt)} · {activeRun._count.deliveries} of{' '}
          {activeRun.routeVersion._count.stops} stop
          {activeRun.routeVersion._count.stops === 1 ? '' : 's'} recorded. No other route can start
          until you finish or cancel it — cancelling keeps everything already recorded.
        </Notice>
      )}

      {routes.length === 0 ? (
        <Card>
          <EmptyState message="No routes yet." hint="Create one from your active locations." />
        </Card>
      ) : (
        <Card>
          <Table head={['Route', 'Driver', 'Latest version', 'Stops', 'Distance', 'Status', '']}>
            {routes.map((r) => {
              const latest = r.versions[0];
              // A stop whose location is no longer ACTIVE means the route is stale.
              const stale =
                latest?.stops.some((s) => s.deliveryLocation.status !== 'ACTIVE') ?? false;
              return (
                <tr key={r.id} className="align-top hover:bg-panel-2/60">
                  <Td>
                    <Link
                      href={`/routes/${r.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {r.name}
                    </Link>
                    <p className="text-xs text-ink-dim">
                      by {r.createdBy.firstName} {r.createdBy.lastName} · {when(r.createdAt)}
                    </p>
                    {stale && (
                      <p className="mt-1 text-xs font-medium text-warn">
                        Needs re-optimisation — a stop is no longer active
                      </p>
                    )}
                  </Td>
                  <Td className="text-ink">
                    {r.driver ? `${r.driver.user.firstName} ${r.driver.user.lastName}` : (
                      <span className="text-ink-dim">Unassigned</span>
                    )}
                  </Td>
                  <Td className="tabular-nums text-ink">
                    v{latest?.versionNumber ?? '—'}
                    <p className="text-xs text-ink-dim">
                      {r.versions.length} version{r.versions.length === 1 ? '' : 's'}
                    </p>
                  </Td>
                  <Td className="tabular-nums text-ink">{latest?._count.stops ?? 0}</Td>
                  <Td className="tabular-nums text-ink">
                    {metres(latest?.totalDistance)}
                    <p className="text-xs text-ink-dim">{duration(latest?.estimatedDuration)}</p>
                  </Td>
                  <Td>
                    <Badge>{r.status}</Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/routes/${r.id}/run`}
                        className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
                      >
                        Run
                      </Link>
                      <Link
                        href={`/routes/${r.id}/edit`}
                        className="rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
                      >
                        Edit
                      </Link>
                      <form action={reoptimizeRouteAction}>
                        <input type="hidden" name="routeId" value={r.id} />
                        <Button variant="secondary" className="px-2 py-1 text-xs">
                          Re-optimise
                        </Button>
                      </form>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}
    </>
  );
}
