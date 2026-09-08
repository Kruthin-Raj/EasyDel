import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { loadSettings } from '@/lib/permissions';
import { seesAllData } from '@/lib/scope';
import Forbidden from '@/components/Forbidden';
import { signedPhotoUrl } from '@/lib/storage';
import { startRunAction } from '@/lib/run-actions';
import RunConsole, { type RunStop } from '@/components/RunConsole';
import StartRunForm from '@/components/StartRunForm';
import { PageHeader, Card, MetricStrip, Notice, EmptyState, when, metres, duration } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ finished?: string; cancelled?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { finished, cancelled } = await searchParams;

  const route = await db.route.findUnique({
    where: { id },
    include: {
      driver: { include: { user: true } },
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

  /*
   * Whose route this is.
   *
   * The page had no ownership check at all — only startRunAction did — so
   * anyone signed in could open another driver's run screen by URL and read
   * their stops, addresses and customers. Mirrors the rule in startRunAction,
   * so what you can open is what you can start.
   */
  const canRun =
    seesAllData(user) ||
    route.createdById === user.id ||
    (route.driver !== null && route.driver.userId === user.id);

  if (!canRun) {
    return (
      <Forbidden
        title="This round is not yours"
        reason="You can only run routes you created or that are assigned to you."
        role={user.role}
        hint="Your own routes are listed under Routes."
      />
    );
  }

  const version = route.versions[0];

  const settings = await loadSettings();
  const geofence = Number(settings.delivery_geofence_metres) || 150;

  // The run in progress for this driver on this version, if any.
  const activeRun = version
    ? await db.routeRun.findFirst({
        where: { routeVersionId: version.id, driverId: user.id, status: 'IN_PROGRESS' },
      })
    : null;

  const lastRun = version
    ? await db.routeRun.findFirst({
        where: { routeVersionId: version.id, status: 'COMPLETED' },
        orderBy: { startedAt: 'desc' },
        include: { _count: { select: { deliveries: true } } },
      })
    : null;

  if (!version || version.stops.length === 0) {
    return (
      <>
        <PageHeader title={route.name} subtitle="Run this route" />
        <Card>
          <EmptyState
            message="This route has no stops."
            hint="Add stops or generate the route from a recorded round before running it."
          />
        </Card>
      </>
    );
  }

  // Outcomes already recorded in this run, keyed by location so a building with
  // several customers still resolves to one status.
  const outcomes = activeRun
    ? await db.delivery.findMany({
        where: { routeRunId: activeRun.id },
        select: {
          status: true,
          reason: true,
          subscription: { select: { deliveryLocationId: true } },
        },
      })
    : [];

  const byLocation = new Map<string, { status: string; reason: string | null }>();
  for (const o of outcomes) {
    byLocation.set(o.subscription.deliveryLocationId, { status: o.status, reason: o.reason });
  }

  /*
   * When the driver started away from the planned start point, the run carries
   * its own order. Fall back to the stored sequence when it doesn't.
   */
  const runOrder: string[] | null = activeRun?.stopOrder
    ? (JSON.parse(activeRun.stopOrder) as string[])
    : null;

  const orderedStops = runOrder
    ? [...version.stops].sort((a, b) => {
        const ai = runOrder.indexOf(a.id);
        const bi = runOrder.indexOf(b.id);
        // Anything missing from the saved order goes last rather than vanishing.
        return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
      })
    : version.stops;

  /*
   * Photos live in a private bucket, so each needs a signed URL. An 8-hour
   * expiry covers a full shift: the default hour would leave the pictures
   * broken halfway through a long round.
   */
  const photoUrls = await Promise.all(
    orderedStops.map((stop) => signedPhotoUrl(stop.deliveryLocation.photo, 60 * 60 * 8)),
  );

  const stops: RunStop[] = orderedStops.map((stop, index) => {
    const recorded = byLocation.get(stop.deliveryLocationId);
    return {
      id: stop.id,
      // Renumbered against the run's own order so the driver sees 1, 2, 3…
      sequence: runOrder ? index + 1 : stop.sequence,
      locationId: stop.deliveryLocationId,
      name: stop.deliveryLocation.name,
      address: stop.deliveryLocation.address,
      latitude: stop.deliveryLocation.latitude,
      longitude: stop.deliveryLocation.longitude,
      notes: stop.deliveryLocation.notes,
      previousNote: stop.deliveryLocation.nextVisitNote,
      floor: stop.deliveryLocation.floor,
      unit: stop.deliveryLocation.unit,
      entranceInstructions: stop.deliveryLocation.entranceInstructions,
      photoUrl: photoUrls[index],
      subscriptions: stop.deliveryLocation.subscriptions.map((sub) => ({
        id: sub.id,
        customer: sub.customerId,
        productType: sub.productType,
        quantity: sub.quantity,
        specialInstructions: sub.specialInstructions,
      })),
      outcome: (recorded?.status as RunStop['outcome']) ?? null,
      reason: recorded?.reason ?? null,
    };
  });

  // The planned round, drawn faintly under the live leg.
  const plannedGeometry: number[][] | null = version.routeGeometry
    ? (() => {
        try {
          const parsed = JSON.parse(version.routeGeometry);
          return Array.isArray(parsed?.coordinates) ? (parsed.coordinates as number[][]) : null;
        } catch {
          return null;
        }
      })()
    : null;

  const totalItems = stops.reduce(
    (n, s) => n + s.subscriptions.reduce((m, x) => m + x.quantity, 0),
    0,
  );

  return (
    <>
      <PageHeader
        eyebrow={activeRun ? 'Run in progress' : 'Delivery run'}
        title={route.name}
        subtitle={
          activeRun
            ? 'Work the stops in order. Every outcome is saved as you record it.'
            : 'Start the run when you set off.'
        }
        actions={
          <Link
            href={`/routes/${route.id}`}
            className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
          >
            Route details
          </Link>
        }
      />

      {finished && (
        <Notice>
          <strong className="font-semibold">Run finished.</strong> Every outcome is in Delivery
          history, including anything skipped or failed.
        </Notice>
      )}

      {cancelled && (
        <Notice tone="warning">
          <strong className="font-semibold">Run cancelled.</strong> Anything you had already
          recorded is kept in Delivery history — cancelling does not erase it.
        </Notice>
      )}

      {activeRun ? (
        <div className="mx-auto w-full max-w-2xl">
          <RunConsole
            runId={activeRun.id}
            routeId={route.id}
            routeName={route.name}
            startedAt={activeRun.startedAt.toISOString()}
            geofenceMetres={geofence}
            stops={stops}
            reordered={Boolean(runOrder)}
            routeGeometry={plannedGeometry}
          />
        </div>
      ) : (
        <>
          <MetricStrip
            items={[
              { label: 'Stops', value: String(stops.length) },
              { label: 'Items to deliver', value: String(totalItems) },
              { label: 'Planned distance', value: metres(version.totalDistance) },
              { label: 'Planned time', value: duration(version.estimatedDuration) },
            ]}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_1fr]">
            <Card title="Start the run">
              <div className="p-5">
                <StartRunForm action={startRunAction} routeId={route.id} />
                <p className="mt-4 text-xs text-ink-dim">
                  {route.createdById === user.id
                    ? 'This is your route — you can start it whenever you like.'
                    : route.driver
                      ? `Assigned to ${route.driver.user.firstName} ${route.driver.user.lastName}.`
                      : 'Unassigned, so any driver can run it.'}{' '}
                  Deliveries can be marked up to {geofence} m from each stop without confirming.
                </p>
              </div>
            </Card>

            <Card title="Today’s stops" description="In optimised order.">
              <ul className="divide-y divide-line/70">
                {stops.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 px-5 py-3">
                    <span className="numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-panel-2 text-xs font-semibold text-ink-dim ring-1 ring-inset ring-line-bright">
                      {s.sequence}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{s.name}</p>
                      <p className="text-xs text-ink-dim">{s.address}</p>
                      {s.subscriptions.length === 0 && (
                        <p className="mt-1 text-xs text-warn">No active subscription</p>
                      )}
                    </div>
                    <span className="numeric shrink-0 text-xs text-ink-faint">
                      {s.subscriptions.reduce((n, x) => n + x.quantity, 0)} items
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {lastRun && (
            <p className="text-sm text-ink-dim">
              Last completed run: {when(lastRun.startedAt)} — {lastRun._count.deliveries} delivery
              record{lastRun._count.deliveries === 1 ? '' : 's'}.
            </p>
          )}
        </>
      )}
    </>
  );
}
