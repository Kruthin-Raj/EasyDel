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
        eyebrow="Route sharing"
        title="Open a shared route"
        subtitle="Paste a route code or link from someone else to inspect its stops, save it to your routes, memorize it, and deliver."
        actions={
          <Link
            href="/routes"
            className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
          >
            My routes
          </Link>
        }
      />

      <div className="max-w-2xl space-y-5">
        <JoinRouteForm />

        <Notice>
          Every route created in EasyDel automatically gets a unique 8-character code and link.
          Saving someone else&rsquo;s route puts it in your <strong>My routes</strong> list while
          keeping your own delivery runs and history completely separate.
        </Notice>

        <Card
          title="How new delivery people use shared routes"
          description="Built for handing over a morning newspaper or parcel beat without paperwork."
        >
          <ol className="list-decimal space-y-2 px-5 py-4 pl-10 text-sm text-ink-dim">
            <li>
              Ask the person who knows the beat for their <strong className="text-ink">route code</strong> or{' '}
              <strong className="text-ink">share link</strong>.
            </li>
            <li>
              Paste it above and tap <strong className="text-ink">Save to my routes</strong>.
            </li>
            <li>
              Open <strong className="text-ink">Memorize route</strong> to study every house photo,
              entrance note, and drop quantity — or test yourself in quiz mode.
            </li>
            <li>
              When you&rsquo;re ready, tap <strong className="text-ink">Deliver</strong> to follow
              the route stop by stop.
            </li>
          </ol>
        </Card>
      </div>
    </>
  );
}
