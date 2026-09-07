import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { loginAction } from '@/lib/auth-actions';
import ActionForm from '@/components/ActionForm';
import { Field, Notice } from '@/components/ui';

export const metadata = { title: 'Sign in — EasyDel' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  if (await getSessionUser()) redirect('/');
  const { reset } = await searchParams;

  return (
    <>
      <div className="mb-8">
        <p className="eyebrow mb-3 text-accent">Sign in</p>
        <h1 className="text-2xl font-semibold text-ink">Welcome back</h1>
        <p className="mt-1.5 text-sm text-ink-dim">
          Sign in to the dispatch console with your email and password.
        </p>
      </div>

      {/* Confirms the reset landed, so the user is not left guessing. */}
      {reset && (
        <div className="mb-6">
          <Notice>Your password has been updated. Sign in with your new password.</Notice>
        </div>
      )}

      <ActionForm
        action={loginAction}
        submitLabel="Sign in"
        pendingLabel="Signing in…"
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
          href="/signup"
          className="font-medium text-accent underline decoration-accent/40 underline-offset-4 transition-colors hover:decoration-accent"
        >
          Create one
        </Link>
      </p>
    </>
  );
}
