import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { reoptimizeRouteAction } from '@/lib/actions';
import { PageHeader, Card, Table, Td, Badge, EmptyState, Button, when, duration, metres } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function RoutesPage() {
  await requireUser();

  const routes = await db.route.findMany({
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
