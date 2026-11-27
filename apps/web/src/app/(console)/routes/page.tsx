import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { routeWhere } from '@/lib/scope';
import { ensureRouteShareCode } from '@/lib/route-sharing';
import { reoptimizeRouteAction } from '@/lib/actions';
import { unsaveRouteAction } from '@/lib/share-actions';
import { cancelRunAction } from '@/lib/run-actions';
import JoinRouteForm from '@/components/JoinRouteForm';
import ShareRouteCard from '@/components/ShareRouteCard';
import { PageHeader, Card, Table, Td, Badge, EmptyState, Button, Notice, when, duration, metres } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function RoutesPage() {
  const user = await requireUser();

  const rawRoutes = await db.route.findMany({
    where: await routeWhere(user),
    include: {
      createdBy: true,
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

  // Guarantee every route shown has a share code & link (backfilling any legacy rows).
  const routes = await Promise.all(
    rawRoutes.map(async (r) => ({
      ...r,
      shareCode: r.shareCode ?? (await ensureRouteShareCode(r.id)),
    })),
  );

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
      id: true,
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
        title="My routes"
        subtitle="Create routes in any way, share them with a unique code or link, memorize the stops, and deliver."
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

      <JoinRouteForm />

      {/*
        The one place a driver can always find — and end — the round they left
        open. The first version only linked to it, which meant a driver whose
        round had gone stale still had to navigate to the run screen to stop it.
        Stopping is the thing they actually want, so it is a button right here.
      */}
      {activeRun && (
        <Notice tone="warning">
          <p>
            <strong className="font-semibold">You have a round in progress:</strong>{' '}
            <Link
              href={`/routes/${activeRun.routeVersion.routeId}/run`}
              className="font-semibold text-warn underline decoration-warn/50 underline-offset-2 hover:decoration-warn"
            >
              {activeRun.routeVersion.route.name}
            </Link>
            , started {when(activeRun.startedAt)} · {activeRun._count.deliveries} of{' '}
            {activeRun.routeVersion._count.stops} stop
            {activeRun.routeVersion._count.stops === 1 ? '' : 's'} recorded. No other route can
            start until you finish or stop it.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={`/routes/${activeRun.routeVersion.routeId}/run`}
              className="btn inline-flex items-center rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
            >
              Continue this round
            </Link>

            {/* Ends the round in place. Nothing recorded is lost. */}
            <form action={cancelRunAction}>
              <input type="hidden" name="runId" value={activeRun.id} />
              <input
                type="hidden"
                name="reason"
                value="Stopped from the Routes list"
              />
              <Button variant="danger">Stop this round</Button>
            </form>

            <span className="text-xs text-ink-dim">
              Stopping keeps every delivery already recorded.
            </span>
          </div>
        </Notice>
      )}

      {routes.length === 0 ? (
        <Card>
          <EmptyState
            message="No routes in your list yet."
            hint="Create a route above, or paste someone's share code or link to save theirs."
          />
        </Card>
      ) : (
        <Card>
          <Table head={['Route', 'Share code', 'Stops', 'Distance', 'Status', '']}>
            {routes.map((r) => {
              const latest = r.versions[0];
              const isOwner = r.createdById === user.id;
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
                      {isOwner
                        ? `Created by you · ${when(r.createdAt)}`
                        : `Saved · by ${r.createdBy.firstName} ${r.createdBy.lastName}`}
                    </p>
                    <p className="text-xs text-ink-faint">
                      v{latest?.versionNumber ?? '—'} ({r.versions.length} version
                      {r.versions.length === 1 ? '' : 's'})
                    </p>
                    {stale && (
                      <p className="mt-1 text-xs font-medium text-warn">
                        Needs re-optimisation — a stop is no longer active
                      </p>
                    )}
                  </Td>
                  <Td>
                    {r.shareCode ? (
                      <ShareRouteCard
                        routeId={r.id}
                        routeName={r.name}
                        shareCode={r.shareCode}
                        isOwner={isOwner}
                        compact
                      />
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
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
                        href={`/routes/${r.id}/memorize`}
                        className="rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
                      >
                        Memorize
                      </Link>
                      <Link
                        href={`/routes/${r.id}/run`}
                        className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
                      >
                        Deliver
                      </Link>
                      {isOwner ? (
                        <>
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
                        </>
                      ) : (
                        <form action={unsaveRouteAction}>
                          <input type="hidden" name="routeId" value={r.id} />
                          <Button variant="ghost" className="px-2 py-1 text-xs">
                            Remove
                          </Button>
                        </form>
                      )}
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
