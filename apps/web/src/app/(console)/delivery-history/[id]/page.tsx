import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { canSeeDelivery } from '@/lib/scope';
import Forbidden from '@/components/Forbidden';
import {
  PageHeader,
  Card,
  Table,
  Row,
  Td,
  Badge,
  StatCard,
  EmptyState,
  Notice,
  when,
  metres,
  duration,
  coords,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * One delivery, plus a report on the round it belonged to.
 *
 * The history list answers "what happened"; this answers "how did the round
 * go" — how many packages actually went out, of which types, across how many
 * stops. The package-type breakdown is computed from each delivery's
 * subscription rather than stored, so it always reflects the real records and
 * cannot drift out of sync with them.
 */
export default async function DeliveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const delivery = await db.delivery.findUnique({
    where: { id },
    include: {
      subscription: { include: { deliveryLocation: true } },
      routeVersion: { include: { route: true } },
      routeRun: { include: { driver: { select: { firstName: true, lastName: true } } } },
    },
  });

  if (!delivery) notFound();

  // Same rule as the list, asked as a question. Checked here and not only in
  // the list query, because this URL is guessable.
  if (!(await canSeeDelivery(user, id))) {
    return (
      <Forbidden
        title="That delivery is not yours"
        reason="You can only open deliveries recorded on runs you performed."
        role={user.role}
        hint="Your own deliveries are listed under Delivery history."
      />
    );
  }

  const run = delivery.routeRun;

  // The round this delivery belonged to. Without a run (records predating the
  // RouteRun model) there is no round to report on, only the single delivery.
  const [runDeliveries, plannedStops, issueCount] = await Promise.all([
    run
      ? db.delivery.findMany({
          where: { routeRunId: run.id },
          include: { subscription: { include: { deliveryLocation: true } } },
          orderBy: [{ timestamp: 'asc' }, { createdAt: 'asc' }],
        })
      : Promise.resolve([]),
    db.routeStop.count({ where: { routeVersionId: delivery.routeVersionId } }),
    run ? db.issue.count({ where: { routeRunId: run.id } }) : Promise.resolve(0),
  ]);

  const delivered = runDeliveries.filter((d) => d.status === 'DELIVERED');
  const skipped = runDeliveries.filter((d) => d.status === 'SKIPPED');
  const failed = runDeliveries.filter((d) => d.status === 'FAILED');

  /*
   * Packages by type — the "how many big, how many small" question.
   *
   * Counts packages (summed quantity) and the number of stops each type went
   * to, because "12 newspapers" and "12 houses" are different facts and the
   * driver needs both.
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
  const runMinutes =
    run?.endedAt && run.startedAt
      ? Math.round((run.endedAt.getTime() - run.startedAt.getTime()) / 1000)
      : null;

  const location = delivery.subscription.deliveryLocation;

  return (
    <>
      <PageHeader
        eyebrow="Delivery report"
        title={location.name}
        subtitle={`${delivery.routeVersion.route.name} · v${delivery.routeVersion.versionNumber}`}
        actions={
          <Link
            href="/delivery-history"
            className="btn inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All history
          </Link>
        }
      />

      {/* ------------------------------------------------- this delivery --- */}
      <Card title="This delivery">
        <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          {[
            ['Outcome', <Badge key="s">{delivery.status}</Badge>],
            ['Packages', <span key="q" className="numeric">{delivery.quantity}</span>],
            ['Type', delivery.subscription.productType || '—'],
            ['Recorded', when(delivery.timestamp)],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-panel px-4 py-3">
              <dt className="eyebrow text-ink-faint">{label}</dt>
              <dd className="mt-2 text-sm text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-3 border-t border-line px-5 py-4 text-sm">
          <p className="text-ink-dim">
            <span className="text-ink">Address</span> · {location.address}
          </p>
          {delivery.latitude != null && delivery.longitude != null && (
            <p className="text-ink-dim">
              <span className="text-ink">Recorded at</span>{' '}
              <span className="numeric">{coords(delivery.latitude, delivery.longitude)}</span>
              {delivery.recordedDistance != null && (
                <> · {metres(delivery.recordedDistance)} from the stop</>
              )}
            </p>
          )}
          {delivery.reason && (
            <p className="text-ink-dim">
              <span className="text-ink">Reason</span> · {delivery.reason}
            </p>
          )}
          {delivery.notes && (
            <p className="text-ink-dim">
              <span className="text-ink">Notes</span> · {delivery.notes}
            </p>
          )}
        </div>
      </Card>

      {/* ------------------------------------------------------ the round --- */}
      {!run ? (
        <Notice tone="warning">
          This delivery predates run tracking, so there is no round report for it. Newer deliveries
          record which run they belonged to.
        </Notice>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Packages delivered" value={totalPackages} tone="positive" />
            <StatCard
              label="Checkpoints done"
              value={`${delivered.length}/${plannedStops || runDeliveries.length}`}
              hint="Stops with a delivered outcome"
            />
            <StatCard
              label="Skipped / failed"
              value={`${skipped.length} / ${failed.length}`}
              tone={failed.length > 0 ? 'critical' : skipped.length > 0 ? 'warning' : 'neutral'}
            />
            <StatCard
              label="Time on the round"
              value={runMinutes != null ? duration(runMinutes) : 'In progress'}
              hint={run.endedAt ? when(run.startedAt) : 'Not finished yet'}
            />
          </div>

          <Card
            title="Packages by type"
            description="Counted from the delivered records on this round."
          >
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

          <Card
            title={`Every stop on this round (${runDeliveries.length})`}
            description={
              issueCount > 0
                ? `${issueCount} issue${issueCount === 1 ? '' : 's'} were reported during this round.`
                : 'No issues were reported during this round.'
            }
          >
            <Table head={['Checkpoint', 'Type', 'Qty', 'Outcome', 'Reason', 'When']}>
              {runDeliveries.map((d) => (
                <Row key={d.id}>
                  <Td>
                    {d.id === delivery.id ? (
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
                  <Td className="whitespace-nowrap text-ink-dim">{when(d.timestamp)}</Td>
                </Row>
              ))}
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
