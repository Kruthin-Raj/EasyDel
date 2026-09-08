import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { canSeeDelivery } from '@/lib/scope';
import Forbidden from '@/components/Forbidden';
import RunReport from '../RunReport';
import { PageHeader, Card, Badge, Notice, when, metres, coords } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * One delivery, then the report for the round it belonged to.
 *
 * The round report comes from the shared RunReport component, so this page and
 * `/delivery-history/runs/[id]` can never disagree about what a round produced.
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
      routeRun: { select: { id: true } },
    },
  });

  if (!delivery) notFound();

  // Same rule as the list, asked as a question. Checked here too, because this
  // URL is guessable.
  if (!(await canSeeDelivery(user, id))) {
    return (
      <Forbidden
        title="That delivery is not yours"
        reason="You can only open deliveries recorded on rounds you ran."
        role={user.role}
        hint="Your own deliveries are listed under Delivery history."
      />
    );
  }

  const location = delivery.subscription.deliveryLocation;

  return (
    <>
      <PageHeader
        eyebrow="Delivery report"
        title={location.name}
        subtitle={`${delivery.routeVersion.route.name} · v${delivery.routeVersion.versionNumber}`}
        actions={
          <>
            <Link
              href="/delivery-history"
              className="btn inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              All history
            </Link>
            {delivery.routeRun && (
              <Link
                href={`/delivery-history/runs/${delivery.routeRun.id}`}
                className="btn inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
              >
                <ClipboardList className="h-4 w-4" aria-hidden />
                Round report
              </Link>
            )}
          </>
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
          {delivery.notes?.trim() && (
            <p className="text-ink-dim">
              <span className="text-ink">Note left at the door</span> ·{' '}
              <span className="break-anywhere">{delivery.notes}</span>
            </p>
          )}
        </div>
      </Card>

      {/* ----------------------------------------------------- the round --- */}
      {delivery.routeRun ? (
        <RunReport runId={delivery.routeRun.id} highlightDeliveryId={delivery.id} />
      ) : (
        <Notice tone="warning">
          This delivery predates run tracking, so there is no round report for it. Newer deliveries
          record which round they belonged to.
        </Notice>
      )}
    </>
  );
}
