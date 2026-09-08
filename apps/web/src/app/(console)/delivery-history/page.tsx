import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { deliveryWhere, issueWhere, seesAllData } from '@/lib/scope';
import { setIssueStatusAction } from '@/lib/actions';
import { PageHeader, Card, Table, Td, Badge, EmptyState, Button, Notice, when } from '@/components/ui';

export const dynamic = 'force-dynamic';

const STATUSES = ['ALL', 'DELIVERED', 'PENDING', 'IN_PROGRESS', 'FAILED', 'SKIPPED'] as const;

export default async function DeliveryHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  const { status = 'ALL' } = await searchParams;

  /*
   * Scoped, not global.
   *
   * These queries had no `where` beyond the status filter, so every agent's
   * Delivery history listed every other agent's deliveries and every issue
   * anyone had reported — other people's customers and addresses included.
   * An agent now sees the runs they performed and the issues they raised;
   * admins and mentors still see the whole operation.
   */
  const mine = !seesAllData(user);

  const [deliveries, issues] = await Promise.all([
    db.delivery.findMany({
      where: {
        ...deliveryWhere(user),
        ...(status !== 'ALL' ? { status: status as never } : {}),
      },
      include: {
        subscription: { include: { deliveryLocation: true } },
        routeVersion: { include: { route: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    }),
    db.issue.findMany({
      where: issueWhere(user),
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Delivery history"
        subtitle={
          mine
            ? 'Every delivery you have recorded, including failures and skips with reasons.'
            : 'Immutable record of every delivery attempt, including failures and skips with reasons.'
        }
      />

      {mine && (
        <Notice>
          You are seeing your own deliveries and the issues you reported. Administrators see the
          whole operation.
        </Notice>
      )}

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4">
          <label>
            <span className="text-sm font-medium text-ink">Status</span>
            <select
              name="status"
              defaultValue={status}
              className="field mt-1.5"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'ALL' ? 'All statuses' : s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary">Filter</Button>
        </form>

        {deliveries.length === 0 ? (
          <EmptyState message="No deliveries match this filter." />
        ) : (
          <Table head={['Location', 'Customer', 'Route', 'Qty', 'Status', 'Reason', 'When']}>
            {deliveries.map((d) => (
              <tr key={d.id} className="align-top hover:bg-panel-2/60">
                <Td>
                  {/* The whole row's subject is a link to the run report. */}
                  <Link
                    href={`/delivery-history/${d.id}`}
                    className="font-medium text-ink underline decoration-line-bright underline-offset-2 hover:decoration-accent"
                  >
                    {d.subscription.deliveryLocation.name}
                  </Link>
                  <p className="text-xs text-ink-dim">
                    {d.subscription.deliveryLocation.address}
                  </p>
                </Td>
                <Td className="text-ink">{d.subscription.customerId ?? '—'}</Td>
                <Td className="text-ink">
                  {d.routeVersion.route.name}
                  <p className="text-xs text-ink-dim">v{d.routeVersion.versionNumber}</p>
                </Td>
                <Td className="tabular-nums text-ink">{d.quantity}</Td>
                <Td>
                  <Badge>{d.status}</Badge>
                </Td>
                <Td className="max-w-56 text-ink-dim">
                  {d.reason ?? <span className="text-ink-faint">—</span>}
                </Td>
                <Td className="whitespace-nowrap text-ink-dim">{when(d.timestamp)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card
        title="Reported issues"
        description="Raised by drivers from the field. Resolving one keeps the record."
      >
        {issues.length === 0 ? (
          <EmptyState message="No issues reported." />
        ) : (
          <Table head={['Description', 'Category', 'About', 'Status', 'Reported', '']}>
            {issues.map((i) => (
              <tr key={i.id} className="align-top hover:bg-panel-2/60">
                <Td className="max-w-96 text-ink">
                  <span className="break-anywhere">{i.description}</span>
                </Td>
                <Td className="text-ink">{i.category ?? '—'}</Td>
                <Td className="text-ink-dim">{i.entityType}</Td>
                <Td>
                  <Badge>{i.status}</Badge>
                </Td>
                <Td className="whitespace-nowrap text-ink-dim">{when(i.createdAt)}</Td>
                <Td>
                  <form action={setIssueStatusAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={i.status === 'OPEN' ? 'RESOLVED' : 'OPEN'}
                    />
                    <Button variant="secondary" className="px-2 py-1 text-xs">
                      {i.status === 'OPEN' ? 'Resolve' : 'Reopen'}
                    </Button>
                  </form>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
