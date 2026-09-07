import Link from 'next/link';
import { forgotPasswordAction } from '@/lib/auth-actions';
import ActionForm from '@/components/ActionForm';
import { Field } from '@/components/ui';

export const metadata = { title: 'Reset your password — EasyDel' };
export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="mb-8">
        <p className="eyebrow mb-3 text-accent">Password reset</p>
        <h1 className="text-2xl font-semibold text-ink">Forgot your password?</h1>
        <p className="mt-1.5 text-sm text-ink-dim">
          Enter your email and we&rsquo;ll send a link to set a new one.
        </p>
      </div>

      <ActionForm
        action={forgotPasswordAction}
        submitLabel="Send reset link"
        pendingLabel="Sending…"
        fullWidthSubmit
      >
        <Field
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
        />
      </ActionForm>

      <p className="mt-6 text-xs leading-relaxed text-ink-faint">
        The confirmation is worded the same way whether or not an account exists — otherwise this
        form could be used to discover which addresses are registered.
      </p>

      <p className="mt-8 border-t border-line pt-6 text-sm text-ink-dim">
        <Link
          href="/login"
          className="font-medium text-accent underline decoration-accent/40 underline-offset-4 transition-colors hover:decoration-accent"
        >
          Back to sign in
        </Link>
      </p>
    </>
  );
}
