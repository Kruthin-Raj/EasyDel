'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { resendOtpAction } from '@/lib/auth-actions';

function Button() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sm text-ink-dim underline decoration-line-bright underline-offset-4 transition-colors hover:text-accent disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
    >
      {pending ? 'Sending…' : 'Send a new code'}
    </button>
  );
}

/**
 * Resend control, kept separate from the verify form so clicking it never
 * submits a half-typed code. Needs its own useActionState to report whether
 * the new code actually went out.
 */
export default function ResendCode({ email }: { email: string }) {
  const [state, formAction] = useActionState(resendOtpAction, null);

  return (
    <div className="mt-4">
      <form action={formAction}>
        <input type="hidden" name="email" value={email} />
        <Button />
      </form>

      {state?.error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="mt-3 text-sm text-ok">
          {state.success}
        </p>
      )}
    </div>
  );
}
