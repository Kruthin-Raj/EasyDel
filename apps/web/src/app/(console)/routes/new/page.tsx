import Link from 'next/link';
import { db } from '@/lib/db';
import { currentUserWith } from '@/lib/permissions';
import Forbidden from '@/components/Forbidden';
import { createRouteAction } from '@/lib/actions';
import ActionForm from '@/components/ActionForm';
import RouteTemplateSelector from '@/components/RouteTemplateSelector';
import { PageHeader, Card, Field, Notice, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function NewRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ baseRoute?: string }>;
}) {
  const { user, can } = await currentUserWith(['create_routes']);
  const { baseRoute: baseRouteId } = await searchParams;

  if (!can.create_routes) {
    return (
      <Forbidden
        title="Route creation is turned off for delivery agents"
        reason="An administrator has disabled route creation for your role. They can re-enable it under Settings → Delivery agent permissions."
        role={user.role}
        hint="You can still record a route by driving it — that does not need this permission."
      />
    );
  }

  // Only deliverable locations are offered: ACTIVE, and with at least one
  // ACTIVE subscription. This is the spec's core rule — a building drops out
  // of route generation only once nothing is left to deliver there.
  const [deliverable, drivers, existingRoutes] = await Promise.all([
    db.deliveryLocation.findMany({
      where: { status: 'ACTIVE', subscriptions: { some: { status: 'ACTIVE' } } },
      include: { subscriptions: { where: { status: 'ACTIVE' } } },
      orderBy: { name: 'asc' },
    }),
    db.driverProfile.findMany({ where: { active: true }, include: { user: true } }),
    db.route.findMany({
      orderBy: { name: 'asc' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { stops: true },
        },
      },
    }),
  ]);

  const baseRoute = baseRouteId ? existingRoutes.find((r) => r.id === baseRouteId) : null;
  const baseRouteLocationIds = new Set(
    baseRoute?.versions[0]?.stops.map((s) => s.deliveryLocationId) ?? []
  );

  return (
    <>
      <PageHeader
        title="New delivery route"
        subtitle="Stops are ordered by the optimiser (nearest-neighbour + 2-opt), not by name."
        actions={
          <Link
            href="/routes"
            className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
          >
            Cancel
          </Link>
        }
      />

      {deliverable.length === 0 ? (
        <Card>
          <EmptyState
            message="No deliverable locations."
            hint="A location needs status ACTIVE and at least one ACTIVE subscription before it can be routed."
          />
        </Card>
      ) : (
        <div className="max-w-3xl space-y-4">
          <Notice>
            Road distances come from OSRM when <code className="font-mono">OSRM_URL</code> is
            reachable. If it is not, the route still optimises using straight-line distance and is
            labelled as an estimate — the stop order never depends on the network.
          </Notice>

          <Card>
            <div className="p-5">
              <ActionForm
                action={createRouteAction}
                submitLabel="Create & optimise route"
                pendingLabel="Optimising…"
              >
                <RouteTemplateSelector routes={existingRoutes} currentRouteId={baseRouteId} />

                <Field 
                  label="Route name" 
                  name="name" 
                  required 
                  placeholder="Morning Newspaper Route 01" 
                  defaultValue={baseRoute ? `Copy of ${baseRoute.name}` : undefined}
                />

                <fieldset className="rounded-lg ring-1 ring-inset ring-line p-4">
                  <legend className="px-1 text-sm font-medium text-ink">Start point</legend>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Name" name="startName" defaultValue="Depot" />
                    <Field label="Latitude" name="startLatitude" type="number" step="any" required defaultValue="13.6288" />
                    <Field label="Longitude" name="startLongitude" type="number" step="any" required defaultValue="79.4192" />
                  </div>
                </fieldset>

                <fieldset className="rounded-lg ring-1 ring-inset ring-line p-4">
                  <legend className="px-1 text-sm font-medium text-ink">End point</legend>
                  <label className="mb-3 flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      name="endSameAsStart"
                      defaultChecked
                      className="check"
                    />
                    <span className="text-sm text-ink">
                      Return to start (round trip)
                    </span>
                  </label>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Name" name="endName" defaultValue="Depot" />
                    <Field label="Latitude" name="endLatitude" type="number" step="any" defaultValue="13.6288" />
                    <Field label="Longitude" name="endLongitude" type="number" step="any" defaultValue="79.4192" />
                  </div>
                  <p className="mt-2 text-xs text-ink-dim">
                    Ignored while &ldquo;Return to start&rdquo; is ticked.
                  </p>
                </fieldset>

                <label className="block">
                  <span className="text-sm font-medium text-ink">Assign driver</span>
                  <select
                    name="driverId"
                    className="field mt-1.5"
                  >
                    <option value="">Unassigned</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.user.firstName} {d.user.lastName}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset>
                  <div className="mb-2 flex items-center justify-between">
                    <legend className="text-sm font-medium text-ink">
                      Stops ({deliverable.length} deliverable)
                    </legend>
                    <a
                      href="/locations/new"
                      target="_blank"
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      + Create new checkpoint
                    </a>
                  </div>

                  {baseRoute && baseRouteLocationIds.size > 0 && (
                    <>
                      <p className="mb-1 text-xs font-medium text-ink">
                        Stops from &ldquo;{baseRoute.name}&rdquo; ({baseRouteLocationIds.size} stops) — uncheck to remove
                      </p>
                      <div className="mb-3 space-y-1 rounded-lg ring-1 ring-inset ring-accent/30 bg-accent/5 p-3">
                        {deliverable
                          .filter((l) => baseRouteLocationIds.has(l.id))
                          .map((l) => {
                            const qty = l.subscriptions.reduce((s, x) => s + x.quantity, 0);
                            return (
                              <div
                                key={l.id}
                                className="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-panel-2/60"
                              >
                                <label className="flex flex-1 items-start gap-2.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    name="locationIds"
                                    value={l.id}
                                    className="mt-0.5 check"
                                    defaultChecked
                                  />
                                  <span className="text-sm">
                                    <span className="font-medium text-ink">{l.name}</span>
                                    <span className="text-ink-dim">
                                      {' '}&mdash; {qty} item{qty === 1 ? '' : 's'}
                                    </span>
                                    <span className="block text-xs text-ink-dim">{l.address}</span>
                                  </span>
                                </label>
                                <a
                                  href={`/locations/${l.id}/edit`}
                                  target="_blank"
                                  title="Edit checkpoint"
                                  className="rounded p-1 text-ink-faint hover:bg-panel-2 hover:text-ink"
                                >
                                  <span className="sr-only">Edit</span>
                                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </a>
                              </div>
                            );
                          })}
                      </div>
                    </>
                  )}

                  <p className="mb-2 text-xs text-ink-dim">
                    {baseRoute
                      ? 'Other available locations — tick to add:'
                      : 'Leave all unticked to include every deliverable location.'}
                  </p>
                  <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg ring-1 ring-inset ring-line p-3">
                    {deliverable
                      .filter((l) => !baseRouteLocationIds.has(l.id))
                      .map((l) => {
                        const qty = l.subscriptions.reduce((s, x) => s + x.quantity, 0);
                        return (
                          <div
                            key={l.id}
                            className="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-panel-2/60"
                          >
                            <label className="flex flex-1 items-start gap-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                name="locationIds"
                                value={l.id}
                                className="mt-0.5 check"
                              />
                              <span className="text-sm">
                                <span className="font-medium text-ink">{l.name}</span>
                                <span className="text-ink-dim">
                                  {' '}&mdash; {qty} item{qty === 1 ? '' : 's'} across {l.subscriptions.length}{' '}
                                  subscription{l.subscriptions.length === 1 ? '' : 's'}
                                </span>
                                <span className="block text-xs text-ink-dim">{l.address}</span>
                              </span>
                            </label>
                            <a
                              href={`/locations/${l.id}/edit`}
                              target="_blank"
                              title="Edit checkpoint"
                              className="rounded p-1 text-ink-faint hover:bg-panel-2 hover:text-ink"
                            >
                              <span className="sr-only">Edit</span>
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </a>
                          </div>
                        );
                      })}
                    {deliverable.filter((l) => !baseRouteLocationIds.has(l.id)).length === 0 && (
                      <p className="text-sm text-ink-dim py-2 text-center">All locations are already in the selected route.</p>
                    )}
                  </div>
                </fieldset>
              </ActionForm>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
