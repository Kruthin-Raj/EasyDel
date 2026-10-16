import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { signUpAction } from '@/lib/auth-actions';
import ActionForm from '@/components/ActionForm';
import { Field, Notice } from '@/components/ui';
import GoogleSignInButton from '@/components/GoogleSignInButton';

export const metadata = { title: 'Create account — EasyDel' };
export const dynamic = 'force-dynamic';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSessionUser()) redirect('/');
  const { error } = await searchParams;

  const errorMessages: Record<string, string> = {
    oauth_cancelled: 'Google sign-up was cancelled.',
    oauth_state_mismatch: 'Security check failed or session expired. Please try again.',
    oauth_not_configured: 'Google OAuth is not configured on the server yet.',
    oauth_token_exchange_failed: 'Failed to verify Google credentials. Check redirect URI settings.',
    oauth_network_error: 'Network connection issue while communicating with Google.',
    oauth_no_email: 'Google did not provide a valid email address.',
    oauth_database_error: 'Unable to update database for your account.',
  };

  return (
    <>
      <div className="mb-8">
        <p className="eyebrow mb-3 text-accent">Create account</p>
        <h1 className="text-2xl font-semibold text-ink">Get started</h1>
        <p className="mt-1.5 text-sm text-ink-dim">
          Create an account with Google or by email.
        </p>
      </div>

      {error && (
        <div className="mb-6">
          <Notice tone="warning">
            {errorMessages[error] || 'Google sign-up encountered an error. Please try again.'}
          </Notice>
        </div>
      )}

      <GoogleSignInButton text="Sign up with Google" />

      <ActionForm
        action={signUpAction}
        submitLabel="Create account"
        pendingLabel="Creating account…"
        fullWidthSubmit
        /*
         * Shown under the `info` banner when the address is already
         * registered, so the way forward sits with the message instead of
         * being buried at the bottom of the page. Passed as a node, not a
         * function — see ActionForm.
         */
        infoFooter={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
            >
              Sign in instead
            </Link>
            <Link
              href="/forgot-password"
              className="inline-flex items-center justify-center rounded-lg bg-surface-2 px-4 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              Reset my password
            </Link>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" name="firstName" required autoComplete="given-name" />
          <Field label="Last name" name="lastName" autoComplete="family-name" />
        </div>

        <Field
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
        />

        <Field
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          hint="At least 8 characters."
        />

        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
        />
      </ActionForm>

      <div className="mt-6">
        <Notice>
          New accounts are created as <strong className="font-semibold">delivery agents</strong>.
          An administrator can change your role afterwards.
        </Notice>
      </div>

      <p className="mt-8 border-t border-line pt-6 text-sm text-ink-dim">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-medium text-accent underline decoration-accent/40 underline-offset-4 transition-colors hover:decoration-accent"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
