import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { currentUserWith } from '@/lib/permissions';
import {
  addStopByLinkAction,
  addStopFromLocationAction,
  removeStopAction,
  reoptimiseAction,
  deleteRouteAction,
  restoreRouteAction,
} from '@/lib/route-edit-actions';
import RouteEditor from '@/components/RouteEditor';
import Forbidden from '@/components/Forbidden';
import { PageHeader, Card, Badge, MetricStrip, metres, duration } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function EditRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await currentUserWith(['create_routes']);
  const { id } = await params;

  const route = await db.route.findUnique({
    where: { id },
    include: {
      createdBy: true,
      driver: true,
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
        include: {
          stops: {
            orderBy: { sequence: 'asc' },
            include: {
              deliveryLocation: {
                include: { subscriptions: { where: { status: 'ACTIVE' } } },
              },
            },
          },
        },
      },
    },
  });

  if (!route) notFound();

  const driverProfile = await db.driverProfile.findUnique({ where: { userId: user.id } });
  const mayEdit =
    user.role === 'ADMIN' ||
    route.createdById === user.id ||
    (route.driverId !== null && route.driverId === driverProfile?.id);

  if (!mayEdit) {
    return (
      <Forbidden
        title="You can’t edit this route"
        reason="Routes can only be changed by the person who created them, the driver they are assigned to, or an administrator."
        role={user.role}
        hint="You can still run a route that is assigned to you."
      />
    );
  }

  const latest = route.versions[0];
  const onRoute = new Set(latest?.stops.map((s) => s.deliveryLocationId) ?? []);

  // Saved checkpoints that could be added — anything active and not already on
  // this route. Capped because this fills a dropdown.
  const available = await db.deliveryLocation.findMany({
    where: { status: 'ACTIVE', id: { notIn: [...onRoute] } },
    select: { id: true, name: true, address: true },
    orderBy: { name: 'asc' },
    take: 200,
  });

  const versionIds = (
    await db.routeVersion.findMany({ where: { routeId: id }, select: { id: true } })
  ).map((v) => v.id);
  const [deliveryCount, runCount, versionCount] = await Promise.all([
    db.delivery.count({ where: { routeVersionId: { in: versionIds } } }),
    db.routeRun.count({ where: { routeVersionId: { in: versionIds } } }),
    db.routeVersion.count({ where: { routeId: id } }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Edit route"
        title={route.name}
        subtitle="Every change creates a new version. Past runs keep the version they were recorded against."
        actions={
          <>
            <Link
              href={`/routes/${route.id}`}
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              Route details
            </Link>
            {route.status === 'ARCHIVED' ? (
              <form action={restoreRouteAction}>
                <input type="hidden" name="routeId" value={route.id} />
                <button
                  type="submit"
                  className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
                >
                  Restore route
                </button>
              </form>
            ) : (
              <Link
                href={`/routes/${route.id}/run`}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
              >
                Run this route
              </Link>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Badge>{route.status}</Badge>
        <p className="text-sm text-ink-dim">
          Version {latest?.versionNumber ?? '—'} of {versionCount} · created by{' '}
          {route.createdBy.firstName} {route.createdBy.lastName}
        </p>
      </div>

      <MetricStrip
        items={[
          { label: 'Stops', value: String(latest?.stops.length ?? 0) },
          { label: 'Distance', value: metres(latest?.totalDistance) },
          { label: 'Est. time', value: duration(latest?.estimatedDuration) },
          {
            label: 'Delivery records',
            value: String(deliveryCount),
            tone: deliveryCount > 0 ? 'positive' : 'neutral',
          },
        ]}
      />

      <RouteEditor
        routeId={route.id}
        routeName={route.name}
        stops={(latest?.stops ?? []).map((s) => ({
          id: s.id,
          sequence: s.sequence,
          name: s.deliveryLocation.name,
          address: s.deliveryLocation.address,
          status: s.deliveryLocation.status,
          items: s.deliveryLocation.subscriptions.reduce((n, x) => n + x.quantity, 0),
          distanceFromPrevious: s.distanceFromPrevious,
        }))}
        availableLocations={available}
        addByLinkAction={addStopByLinkAction}
        addFromLocationAction={addStopFromLocationAction}
        removeStopAction={removeStopAction}
        reoptimiseAction={reoptimiseAction}
        deleteRouteAction={deleteRouteAction}
        hasHistory={deliveryCount > 0 || runCount > 0}
        deliveryCount={deliveryCount}
        runCount={runCount}
        isArchived={route.status === 'ARCHIVED'}
      />

      <Card title="Why changes make a new version">
        <p className="p-5 text-sm text-ink-dim">
          Adding or removing a stop writes a new version and re-optimises the whole round, so the
          change lands in the right place rather than at the end. Runs already recorded stay
          attached to the version they were driven against — history never changes retroactively.
          Removing a stop takes the house off <em>this route only</em>; the location, its
          subscriptions and its delivery history are untouched.
        </p>
      </Card>
    </>
  );
}
