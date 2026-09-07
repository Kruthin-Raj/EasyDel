import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { setLocationStatusAction } from '@/lib/actions';
import { PageHeader, Card, Table, Td, Badge, EmptyState, Button, when } from '@/components/ui';

export const dynamic = 'force-dynamic';

const STATUSES = ['ALL', 'ACTIVE', 'PAUSED', 'CANCELLED', 'MOVED', 'ARCHIVED'] as const;

const REMOVAL_REASONS = [
  'Subscription cancelled',
  'Customer moved',
  'Building no longer serviced',
  'Duplicate location',
  'Temporary suspension',
  'Wrong location',
  'Other',
];

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireUser();
  const { q = '', status = 'ACTIVE' } = await searchParams;

  const locations = await db.deliveryLocation.findMany({
    where: {
      ...(status !== 'ALL' ? { status: status as never } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { address: { contains: q, mode: 'insensitive' as const } },
              { buildingName: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    include: {
      subscriptions: true,
      _count: { select: { routeStops: true, history: true } },
    },
    orderBy: { name: 'asc' },
  });

  return (
    <>
      <PageHeader
        title="Delivery locations"
        subtitle="Reusable delivery points. Locations are archived, never deleted, so history survives."
        actions={
          <Link
            href="/locations/new"
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
          >
            Add location
          </Link>
        }
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4">
          <label className="flex-1 min-w-56">
            <span className="text-sm font-medium text-ink">Search</span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Building, customer or address…"
              className="field mt-1.5"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-ink">Status</span>
            <select
              name="status"
              defaultValue={status}
              className="field mt-1.5"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'ALL' ? 'All statuses' : s}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary">Apply</Button>
        </form>

        {locations.length === 0 ? (
          <EmptyState
            message="No locations match."
            hint={q ? 'Try a different search or status filter.' : 'Add your first delivery location.'}
          />
        ) : (
          <Table head={['Location', 'Address', 'Deliveries', 'Status', 'Used in', 'Actions']}>
            {locations.map((loc) => {
              const activeSubs = loc.subscriptions.filter((s) => s.status === 'ACTIVE');
              const totalQty = activeSubs.reduce((sum, s) => sum + s.quantity, 0);
              return (
                <tr key={loc.id} className="align-top hover:bg-panel-2/60">
                  <Td>
                    <p className="font-medium text-ink">{loc.name}</p>
                    <p className="text-xs text-ink-dim">
                      {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                    </p>
                    {loc.floor || loc.unit ? (
                      <p className="text-xs text-ink-dim">
                        {[loc.floor && `Floor ${loc.floor}`, loc.unit].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                  </Td>
                  <Td className="max-w-64 text-ink-dim">
                    <span className="break-anywhere">{loc.address}</span>
                  </Td>
                  <Td>
                    {activeSubs.length === 0 ? (
                      <span className="text-ink-dim">None active</span>
                    ) : (
                      <>
                        <p className="font-medium text-ink">
                          {totalQty} item{totalQty === 1 ? '' : 's'}
                        </p>
                        <p className="text-xs text-ink-dim">
                          {activeSubs.length} subscription{activeSubs.length === 1 ? '' : 's'}
                        </p>
                      </>
                    )}
                  </Td>
                  <Td>
                    <Badge>{loc.status}</Badge>
                    {loc.pauseUntil && (
                      <p className="mt-1 text-xs text-ink-dim">until {when(loc.pauseUntil)}</p>
                    )}
                  </Td>
                  <Td className="text-ink-dim tabular-nums">
                    {loc._count.routeStops} stop{loc._count.routeStops === 1 ? '' : 's'}
                  </Td>
                  <Td>
                    <LifecycleActions id={loc.id} status={loc.status} />
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <p className="text-sm text-ink-dim">
        Showing {locations.length} location{locations.length === 1 ? '' : 's'}
        {status !== 'ALL' && ` with status ${status}`}.
      </p>
    </>
  );
}

/*
 * Lifecycle controls, collapsed behind <details> disclosures.
 *
 * These were previously five stacked always-visible controls per row, which
 * pushed every row to roughly 200px tall and buried the actual data. Using
 * <details>/<summary> keeps this a Server Component — no client JS — while
 * hiding the date picker and reason selector until they are needed. It also
 * means a destructive action takes two deliberate clicks rather than one.
 */
function LifecycleActions({ id, status }: { id: string; status: string }) {
  const isActive = status === 'ACTIVE';
  const canRestore = status === 'PAUSED' || status === 'CANCELLED' || status === 'ARCHIVED';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {isActive && (
        <>
          <details className="group relative">
            <summary className="cursor-pointer list-none rounded-md bg-surface-2 px-2 py-1 text-xs text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2 [&::-webkit-details-marker]:hidden">
              Pause
            </summary>
            <form
              action={setLocationStatusAction}
              className="absolute right-0 z-20 mt-1.5 w-56 space-y-2 rounded-lg border border-line-bright bg-panel-2 p-3 shadow-xl"
            >
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value="PAUSED" />
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink">Pause until</span>
                <input type="date" name="pauseUntil" className="field text-xs" />
              </label>
              <p className="text-xs text-ink-dim">
                Leave blank to pause indefinitely.
              </p>
              <Button variant="secondary" className="w-full px-2 py-1 text-xs">
                Confirm pause
              </Button>
            </form>
          </details>

          <details className="group relative">
            <summary className="cursor-pointer list-none rounded-md bg-bad-dim px-2 py-1 text-xs text-bad ring-1 ring-inset ring-bad/40 transition-colors hover:bg-bad hover:text-surface [&::-webkit-details-marker]:hidden">
              Cancel
            </summary>
            <form
              action={setLocationStatusAction}
              className="absolute right-0 z-20 mt-1.5 w-64 space-y-2 rounded-lg border border-line-bright bg-panel-2 p-3 shadow-xl"
            >
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value="CANCELLED" />
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink">
                  Why are you removing this location?
                </span>
                <select name="reason" required className="field text-xs">
                  <option value="">Select a reason…</option>
                  {REMOVAL_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-ink-dim">
                Delivery history and photos are kept.
              </p>
              <Button variant="danger" className="w-full px-2 py-1 text-xs">
                Confirm removal
              </Button>
            </form>
          </details>
        </>
      )}

      {canRestore && (
        <form action={setLocationStatusAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="ACTIVE" />
          <input type="hidden" name="reason" value="Restored by admin" />
          <Button variant="secondary" className="px-2 py-1 text-xs">
            Restore
          </Button>
        </form>
      )}

      {status !== 'ARCHIVED' && (
        <form action={setLocationStatusAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="ARCHIVED" />
          <input type="hidden" name="reason" value="Archived by admin" />
          <Button variant="ghost" className="px-2 py-1 text-xs">
            Archive
          </Button>
        </form>
      )}
    </div>
  );
}
