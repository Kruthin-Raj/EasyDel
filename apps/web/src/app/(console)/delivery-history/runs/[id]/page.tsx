import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Route as RouteIcon } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { canSeeRun } from '@/lib/scope';
import Forbidden from '@/components/Forbidden';
import RunReport from '../../RunReport';
import { PageHeader, when } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * The report for one round, reached by clicking a round in Delivery history.
 *
 * The history list is a list of rounds; this is what a round produced. The
 * same report also appears under a single delivery, rendered from the shared
 * RunReport component.
 */
export default async function RunReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const run = await db.routeRun.findUnique({
    where: { id },
    include: {
      routeVersion: { include: { route: true } },
      driver: { select: { firstName: true, lastName: true } },
    },
  });

  if (!run) notFound();

  // Checked here, not only in the list query — this URL is guessable.
  if (!(await canSeeRun(user, id))) {
    return (
      <Forbidden
        title="That round is not yours"
        reason="You can only open reports for rounds you ran."
        role={user.role}
        hint="Your own rounds are listed under Delivery history."
      />
    );
  }

  const status =
    run.status === 'IN_PROGRESS'
      ? 'In progress'
      : run.status === 'ABANDONED'
        ? 'Stopped early'
        : 'Completed';

  return (
    <>
      <PageHeader
        eyebrow={`Round report · ${status}`}
        title={run.routeVersion.route.name}
        subtitle={`v${run.routeVersion.versionNumber} · started ${when(run.startedAt)}${
          run.endedAt ? ` · finished ${when(run.endedAt)}` : ''
        } · ${run.driver.firstName} ${run.driver.lastName}`}
        actions={
          <>
            <Link
              href="/delivery-history"
              className="btn inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              All history
            </Link>
            <Link
              href={`/routes/${run.routeVersion.routeId}`}
              className="btn inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              <RouteIcon className="h-4 w-4" aria-hidden />
              The route
            </Link>
          </>
        }
      />

      <RunReport runId={id} />
    </>
  );
}
