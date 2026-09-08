'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, Pencil } from 'lucide-react';
import { updateCheckpointAction } from '@/lib/recording-actions';

/**
 * Correcting a checkpoint already logged, without leaving the round.
 *
 * Collapsed by default: the recording screen is a list of houses to work
 * through, and an always-open form per row would bury it. A <details>
 * disclosure keeps it one tap away and needs no state of its own.
 *
 * Only offered while the session is still recording — the action re-checks
 * that server-side, which is what actually enforces it.
 */
function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  );
}

export default function CheckpointEditor({
  checkpoint,
  deliveryTypes,
  nameOptions,
}: {
  checkpoint: {
    id: string;
    name: string;
    address: string;
    deliveryType: string | null;
    quantity: number | null;
    notes: string | null;
    nextVisitNote: string | null;
  };
  deliveryTypes: string[];
  nameOptions: string[];
}) {
  const [state, formAction] = useActionState(updateCheckpointAction, null);
  const listId = `names-${checkpoint.id}`;

  return (
    <details className="mt-2 rounded-lg bg-surface-2/60 ring-1 ring-inset ring-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-ink-dim transition-colors hover:text-ink">
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Edit this checkpoint
      </summary>

      <form action={formAction} className="space-y-3 border-t border-line px-3 py-3">
        <input type="hidden" name="checkpointId" value={checkpoint.id} />

        {state?.error && (
          <p
            role="alert"
            className="rounded-lg bg-bad-dim/60 px-3 py-2 text-xs text-ink ring-1 ring-inset ring-bad/30"
          >
            {state.error}
          </p>
        )}
        {state?.success && (
          <p
            role="status"
            className="rounded-lg bg-ok-dim/50 px-3 py-2 text-xs text-ink ring-1 ring-inset ring-ok/25"
          >
            {state.success}
          </p>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink">House / building</span>
          <input
            name="name"
            required
            defaultValue={checkpoint.name}
            list={nameOptions.length > 0 ? listId : undefined}
            autoComplete="off"
            className="field"
          />
          {nameOptions.length > 0 && (
            <datalist id={listId}>
              {nameOptions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink">Address</span>
          <input name="address" defaultValue={checkpoint.address} className="field" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink">Package type</span>
            <select name="deliveryType" defaultValue={checkpoint.deliveryType ?? ''} className="field">
              <option value="">— none —</option>
              {/* The stored type may predate a change to the options list, so
                  keep it selectable rather than silently dropping it. */}
              {(checkpoint.deliveryType && !deliveryTypes.includes(checkpoint.deliveryType)
                ? [checkpoint.deliveryType, ...deliveryTypes]
                : deliveryTypes
              ).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink">Quantity</span>
            <input
              name="quantity"
              type="number"
              min="0"
              inputMode="numeric"
              defaultValue={checkpoint.quantity ?? ''}
              className="field"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink">Notes</span>
          <textarea name="notes" rows={2} defaultValue={checkpoint.notes ?? ''} className="field resize-y" />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink">Note for the next visit</span>
          <textarea
            name="nextVisitNote"
            rows={2}
            defaultValue={checkpoint.nextVisitNote ?? ''}
            placeholder="e.g. no delivery tomorrow"
            className="field resize-y"
          />
        </label>

        <SaveButton />
      </form>
    </details>
  );
}
