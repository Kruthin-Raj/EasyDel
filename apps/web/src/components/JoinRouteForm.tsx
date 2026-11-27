'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { ArrowRight, KeyRound, Loader2 } from 'lucide-react';
import { joinRouteByCodeAction } from '@/lib/share-actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <ArrowRight className="h-4 w-4" aria-hidden />
      )}
      {pending ? 'Finding…' : label}
    </button>
  );
}

/**
 * Input form to open or save a route shared by someone else using its unique
 * code or share link.
 */
export default function JoinRouteForm({
  title = 'Open a shared route by code or link',
  description = 'Got a route code or link from someone? Paste it here to preview, save it to your routes, memorize the stops, and start delivering.',
  submitLabel = 'Open route',
}: {
  title?: string;
  description?: string;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(joinRouteByCodeAction, null);

  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-dim/40 text-accent ring-1 ring-inset ring-accent/30"
        >
          <KeyRound className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-xs text-ink-dim">{description}</p>
        </div>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        {state?.error && (
          <p
            role="alert"
            className="rounded-lg bg-bad-dim/60 px-3 py-2 text-xs text-ink ring-1 ring-inset ring-bad/30"
          >
            {state.error}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            name="code"
            required
            placeholder="e.g. K7M9P2X4 or https://…/share/K7M9P2X4"
            className="field flex-1 font-mono text-sm"
          />
          <SubmitButton label={submitLabel} />
        </div>
      </form>
    </section>
  );
}
