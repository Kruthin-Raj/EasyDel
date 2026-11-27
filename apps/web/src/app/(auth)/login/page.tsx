import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser, safeNextPath } from '@/lib/auth';
import { loginAction } from '@/lib/auth-actions';
import ActionForm from '@/components/ActionForm';
import { Field, Notice } from '@/components/ui';
import GoogleSignInButton from '@/components/GoogleSignInButton';

export const metadata = { title: 'Sign in — EasyDel' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; error?: string; next?: string }>;
}) {
  const { reset, error, next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);
  if (await getSessionUser()) redirect(next);

  const errorMessages: Record<string, string> = {
    oauth_cancelled: 'Google sign-in was cancelled.',
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
        <p className="eyebrow mb-3 text-accent">Sign in</p>
        <h1 className="text-2xl font-semibold text-ink">Welcome back</h1>
        <p className="mt-1.5 text-sm text-ink-dim">
          Sign in to open your routes, memorize stops, and deliver.
        </p>
      </div>

      {/* Confirms the reset landed, so the user is not left guessing. */}
      {reset && (
        <div className="mb-6">
          <Notice>Your password has been updated. Sign in with your new password.</Notice>
        </div>
      )}

      {error && (
        <div className="mb-6">
          <Notice tone="warning">
            {errorMessages[error] || 'Google sign-in encountered an error. Please try again.'}
          </Notice>
        </div>
      )}

      <GoogleSignInButton text="Sign in with Google" next={next} />

      <ActionForm
        action={loginAction}
        submitLabel="Sign in"
        pendingLabel="Signing in…"
        fullWidthSubmit
      >
        <input type="hidden" name="next" value={next} />
        <Field
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
        />

        <div>
          <Field
            label="Password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
          <div className="mt-2 text-right">
            <Link
              href="/forgot-password"
              className="text-xs text-ink-dim underline decoration-line-bright underline-offset-4 transition-colors hover:text-accent"
            >
              Forgot your password?
            </Link>
          </div>
        </div>
      </ActionForm>

      <p className="mt-8 border-t border-line pt-6 text-sm text-ink-dim">
        Don&rsquo;t have an account?{' '}
        <Link
          href={next !== '/' ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}
          className="font-medium text-accent underline decoration-accent/40 underline-offset-4 transition-colors hover:decoration-accent"
        >
          Create one
        </Link>
      </p>
    </>
  );
}
