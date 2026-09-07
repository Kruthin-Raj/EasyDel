import Link from 'next/link';
import { resetPasswordAction } from '@/lib/auth-actions';
import { peekResetToken } from '@/lib/tokens';
import ActionForm from '@/components/ActionForm';
import { Field } from '@/components/ui';

export const metadata = { title: 'Set a new password — EasyDel' };
export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;

  // Checked but NOT consumed here — a page view must not burn the token, or
  // an email client that prefetches links would invalidate it before the user
  // ever sees the form. It is consumed inside the action on submit.
  const email = await peekResetToken(token);

  if (!email) {
    return (
      <>
        <div className="mb-6">
          <p className="eyebrow mb-3 text-bad">Link expired</p>
          <h1 className="text-2xl font-semibold text-ink">This link no longer works</h1>
          <p className="mt-1.5 text-sm text-ink-dim">
            Reset links can only be used once, and they expire after an hour. Request a fresh one.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
        >
          Request a new link
        </Link>
      </>
    );
  }

  return (
    <>
      <div className="mb-8">
        <p className="eyebrow mb-3 text-accent">Password reset</p>
        <h1 className="text-2xl font-semibold text-ink">Set a new password</h1>
        <p className="mt-1.5 text-sm text-ink-dim">
          For <span className="break-anywhere font-mono text-ink">{email}</span>
        </p>
      </div>

      <ActionForm
        action={resetPasswordAction}
        submitLabel="Update password"
        pendingLabel="Updating…"
        fullWidthSubmit
      >
        <input type="hidden" name="token" value={token} />
        <Field
          label="New password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          hint="At least 8 characters."
        />
        <Field
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
        />
      </ActionForm>
    </>
  );
}
