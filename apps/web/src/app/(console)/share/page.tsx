import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import JoinRouteForm from '@/components/JoinRouteForm';
import { PageHeader, Card, Notice } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Join shared route — EasyDel' };

export default async function ShareIndexPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        eyebrow="Code sharing"
        title="Open a shared route or location"
        subtitle="Paste an 8-letter code or link to load someone's route or save a single delivery stop."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/locations"
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              Locations
            </Link>
            <Link
              href="/routes"
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              My routes
            </Link>
          </div>
        }
      />

      <div className="max-w-2xl space-y-5">
        <JoinRouteForm />

        <Notice>
          Every route and every location automatically gets an 8-letter code. Share a route code to
          pass on an entire beat, or share a location code to pass on a single house with its photo
          and entrance notes.
        </Notice>

        <Card
          title="3 steps to get started"
          description="Your deliveries and notes always stay private to you."
        >
          <ol className="list-decimal space-y-2 px-5 py-4 pl-10 text-sm text-ink-dim">
            <li>
              Enter a <strong className="text-ink">route code</strong> or{' '}
              <strong className="text-ink">location code</strong> above.
            </li>
            <li>
              Tap <strong className="text-ink">Save to my routes</strong> (or{' '}
              <strong className="text-ink">Save to my locations</strong>).
            </li>
            <li>
              Open <strong className="text-ink">Memorize</strong> to learn the stops, or tap{' '}
              <strong className="text-ink">Deliver</strong> when you head out.
            </li>
          </ol>
        </Card>
      </div>
    </>
  );
}
