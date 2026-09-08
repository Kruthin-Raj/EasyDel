import Link from 'next/link';
import { db } from '@/lib/db';
import {
  Card,
  Table,
  Row,
  Td,
  Badge,
  StatCard,
  EmptyState,
  Notice,
  when,
  duration,
} from '@/components/ui';

/**
 * The report for one round.
 *
 * Shared by the run view (`/delivery-history/runs/[id]`) and the single-delivery
 * view (`/delivery-history/[id]`), so the two can never disagree about what a
 * round produced.
 *
 * Every figure is computed from the delivery records themselves rather than
 * stored on the run. A cancelled round keeps its outcomes — cancelling marks
 * the run abandoned but destroys nothing — so a stopped round reports exactly
 * like a finished one, just with fewer stops covered.
 */
export default async function RunReport({
  runId,
  highlightDeliveryId,
}: {
  runId: string;
  /** Marks one row as "the delivery you came from". */
  highlightDeliveryId?: string;
}) {
  const run = await db.routeRun.findUnique({
    where: { id: runId },
    include: {
      routeVersion: { include: { route: true } },
      driver: { select: { firstName: true, lastName: true } },
    },
  });

  if (!run) {
    return <Notice tone="warning">That round no longer exists.</Notice>;
  }

  const [deliveries, plannedStops, issues] = await Promise.all([
    db.delivery.findMany({
      where: { routeRunId: runId },
      include: { subscription: { include: { deliveryLocation: true } } },
      orderBy: [{ timestamp: 'asc' }, { createdAt: 'asc' }],
    }),
    db.routeStop.count({ where: { routeVersionId: run.routeVersionId } }),
    db.issue.findMany({
      where: { routeRunId: runId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const delivered = deliveries.filter((d) => d.status === 'DELIVERED');
  const skipped = deliveries.filter((d) => d.status === 'SKIPPED');
  const failed = deliveries.filter((d) => d.status === 'FAILED');

  /*
   * Packages by type — the "how many big, how many small" question.
   *
   * Counts packages (summed quantity) and how many stops each type went to,
   * because "12 newspapers" and "12 houses" are different facts.
   */
  const byType = new Map<string, { packages: number; stops: number }>();
  for (const d of delivered) {
    const type = d.subscription.productType || 'Unspecified';
    const row = byType.get(type) ?? { packages: 0, stops: 0 };
    row.packages += d.quantity;
    row.stops += 1;
    byType.set(type, row);
  }
  const typeRows = [...byType.entries()].sort((a, b) => b[1].packages - a[1].packages);

  const totalPackages = delivered.reduce((sum, d) => sum + d.quantity, 0);

  /*
   * Notes the driver typed at the door, as "name — note".
   *
   * Pulled into their own list because they are the part of a round someone
   * actually reads afterwards: "box not returned" typed at four houses is four
   * separate things to chase, and finding them meant scanning every row.
   */
  const noted = deliveries
    .filter((d) => d.notes?.trim())
    .map((d) => ({
      id: d.id,
      name: d.subscription.deliveryLocation.name,
      note: d.notes!.trim(),
      status: d.status,
    }));

  // Notes repeated across several stops, so a pattern is obvious at a glance.
  const noteCounts = new Map<string, number>();
  for (const n of noted) {
    const key = n.note.toLowerCase();
    noteCounts.set(key, (noteCounts.get(key) ?? 0) + 1);
  }
  const repeated = [...noteCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1]);

  const elapsed =
    run.endedAt && run.startedAt
      ? Math.round((run.endedAt.getTime() - run.startedAt.getTime()) / 1000)
      : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Packages delivered" value={totalPackages} tone="positive" />
        <StatCard
          label="Checkpoints done"
          value={`${delivered.length}/${plannedStops || deliveries.length}`}
          hint="Stops with a delivered outcome"
        />
        <StatCard
          label="Skipped / failed"
          value={`${skipped.length} / ${failed.length}`}
          tone={failed.length > 0 ? 'critical' : skipped.length > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Time on the round"
          value={elapsed != null ? duration(elapsed) : 'In progress'}
          hint={run.endedAt ? when(run.startedAt) : 'Not finished yet'}
        />
      </div>

      {run.status === 'ABANDONED' && (
        <Notice tone="warning">
          This round was stopped before it finished. Everything recorded up to that point is kept
          and counted below.
        </Notice>
      )}

      {/* --------------------------------------------- notes from the door --- */}
      <Card
        title={`Notes from this round (${noted.length})`}
        description="What the driver typed at each door, in the order they were recorded."
      >
        {noted.length === 0 ? (
          <EmptyState
            message="No notes were left on this round."
            hint="Notes are optional — a driver adds one when something needs saying."
          />
        ) : (
          <>
            {repeated.length > 0 && (
              <div className="border-b border-line px-5 py-3">
                <p className="eyebrow mb-2 text-ink-faint">Said more than once</p>
                <ul className="space-y-1">
                  {repeated.map(([note, count]) => (
                    <li key={note} className="text-sm text-ink">
                      <span className="numeric font-semibold text-warn">×{count}</span>{' '}
                      <span className="text-ink-dim">{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ul className="divide-y divide-line/70">
              {noted.map((n) => (
                <li key={n.id} className="px-5 py-3">
                  {/* name — note, which is how it gets read aloud. */}
                  <p className="text-sm text-ink">
                    <span className="font-medium">{n.name}</span>
                    <span className="text-ink-faint"> — </span>
                    <span className="text-ink-dim">{n.note}</span>
                  </p>
                  {n.status !== 'DELIVERED' && (
                    <p className="mt-1">
                      <Badge>{n.status}</Badge>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* ------------------------------------------------- packages by type --- */}
      <Card title="Packages by type" description="Counted from the delivered records on this round.">
        {typeRows.length === 0 ? (
          <EmptyState message="Nothing was marked delivered on this round." />
        ) : (
          <Table head={['Package type', 'Packages', 'Checkpoints']}>
            {typeRows.map(([type, row]) => (
              <Row key={type}>
                <Td className="font-medium text-ink">{type}</Td>
                <Td className="numeric text-ink">{row.packages}</Td>
                <Td className="numeric text-ink-dim">{row.stops}</Td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {/* ------------------------------------------------------- every stop --- */}
      <Card
        title={`Every stop on this round (${deliveries.length})`}
        description={
          issues.length > 0
            ? `${issues.length} issue${issues.length === 1 ? '' : 's'} reported during this round.`
            : 'No issues were reported during this round.'
        }
      >
        {deliveries.length === 0 ? (
          <EmptyState message="No outcomes were recorded on this round." />
        ) : (
          <Table head={['Checkpoint', 'Type', 'Qty', 'Outcome', 'Reason', 'Note', 'When']}>
            {deliveries.map((d) => (
              <Row key={d.id}>
                <Td>
                  {d.id === highlightDeliveryId ? (
                    <span className="font-medium text-accent">
                      {d.subscription.deliveryLocation.name}
                    </span>
                  ) : (
                    <Link
                      href={`/delivery-history/${d.id}`}
                      className="text-ink underline decoration-line-bright underline-offset-2 hover:decoration-accent"
                    >
                      {d.subscription.deliveryLocation.name}
                    </Link>
                  )}
                </Td>
                <Td className="text-ink-dim">{d.subscription.productType || '—'}</Td>
                <Td className="numeric text-ink">{d.quantity}</Td>
                <Td>
                  <Badge>{d.status}</Badge>
                </Td>
                <Td className="text-ink-dim">{d.reason ?? '—'}</Td>
                <Td className="text-ink-dim">
                  {d.notes?.trim() ? (
                    <span className="break-anywhere">{d.notes}</span>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-ink-dim">{when(d.timestamp)}</Td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {/* ---------------------------------------------------------- issues --- */}
      {issues.length > 0 && (
        <Card title={`Issues raised (${issues.length})`}>
          <ul className="divide-y divide-line/70">
            {issues.map((i) => (
              <li key={i.id} className="px-5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-ink">{i.description}</p>
                  <Badge>{i.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-faint">
                  {i.category ?? 'Uncategorised'} · {when(i.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
