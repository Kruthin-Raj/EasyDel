'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

type State = {
  error?: string;
  success?: string;
  info?: string;
  devNoMail?: boolean;
} | null;

function Submit({
  label,
  pendingLabel,
  full,
}: {
  label: string;
  pendingLabel: string;
  full?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-line-bright disabled:text-ink-faint ${
        full ? 'w-full' : ''
      }`}
    >
      {pending && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {pending ? pendingLabel : label}
    </button>
  );
}

const BANNER =
  "relative overflow-hidden rounded-lg px-4 py-3 pl-5 text-sm text-ink ring-1 ring-inset before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']";

/**
 * Wraps a Server Action with useActionState so pages stay Server Components
 * while still showing validation feedback and a pending state.
 *
 * Three feedback tones, because "already registered" is neither an error nor a
 * success — it is guidance, and colouring it red reads as though the user did
 * something wrong.
 */
export default function ActionForm({
  action,
  children,
  submitLabel = 'Save',
  pendingLabel = 'Saving…',
  secondary,
  fullWidthSubmit = false,
  infoFooter,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  children: ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  secondary?: ReactNode;
  fullWidthSubmit?: boolean;
  /**
   * Rendered directly under the `info` banner — e.g. a "Sign in instead" link.
   *
   * A ReactNode, NOT a render function: this is a Client Component, and React
   * refuses to serialise a function passed across the server/client boundary.
   * Passing `(state) => ...` from a Server Component crashes the page at
   * runtime with "Functions cannot be passed directly to Client Components",
   * which the type checker does not flag.
   */
  infoFooter?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && (
        <p
          role="alert"
          data-testid="form-error"
          className={`${BANNER} bg-bad-dim/60 ring-bad/30 before:bg-bad`}
        >
          {state.error}
        </p>
      )}
      {state?.info && (
        <>
          <p
            role="status"
            data-testid="form-info"
            className={`${BANNER} bg-info-dim/60 ring-info/30 before:bg-info`}
          >
            {state.info}
          </p>
          {infoFooter}
        </>
      )}
      {state?.success && (
        <p
          role="status"
          data-testid="form-success"
          className={`${BANNER} bg-ok-dim/60 ring-ok/30 before:bg-ok`}
        >
          {state.success}
        </p>
      )}
      {state?.devNoMail && (
        <p
          data-testid="form-devnomail"
          className={`${BANNER} bg-warn-dim/60 ring-warn/30 before:bg-warn`}
        >
          SMTP is not configured, so no email was actually sent. The code was printed to your{' '}
          <strong className="font-semibold">server console</strong> — check the terminal running{' '}
          <code className="font-mono text-xs">pnpm --filter web dev</code>.
        </p>
      )}

      {children}

      <div
        className={`flex items-center gap-3 pt-1 ${fullWidthSubmit ? 'flex-col items-stretch' : ''}`}
      >
        <Submit label={submitLabel} pendingLabel={pendingLabel} full={fullWidthSubmit} />
        {secondary}
      </div>
    </form>
  );
}
