import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Card } from './ui';

/**
 * Shown instead of throwing when someone opens a page their role does not
 * cover.
 *
 * Throwing from a Server Component renders Next's error overlay in development
 * and a bare "something went wrong" in production — neither tells the user what
 * happened or what to do. A signed-in user reaching a page they lack permission
 * for is an expected outcome, not a crash.
 */
export default function Forbidden({
  title = 'You don’t have access to this',
  reason,
  role,
  hint,
}: {
  title?: string;
  reason: string;
  role?: string;
  hint?: string;
}) {
  return (
    <>
      <div className="border-b border-line pb-5">
        <p className="eyebrow mb-2 text-warn">Permission required</p>
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      </div>

      <Card className="max-w-2xl">
        <div className="flex gap-4 p-6">
          <div
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warn-dim ring-1 ring-inset ring-warn/30"
          >
            <ShieldAlert className="h-5 w-5 text-warn" />
          </div>

          <div className="min-w-0">
            <p className="text-sm leading-relaxed text-ink-dim">{reason}</p>

            {role && (
              <p className="mt-3 text-sm text-ink-dim">
                You are signed in as{' '}
                <span className="font-mono text-ink">{role.replace(/_/g, ' ')}</span>.
              </p>
            )}

            {hint && <p className="mt-3 text-sm text-ink-dim">{hint}</p>}

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
              >
                Back to dashboard
              </Link>
              <Link
                href="/record"
                className="inline-flex items-center justify-center rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
              >
                Record a route
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
