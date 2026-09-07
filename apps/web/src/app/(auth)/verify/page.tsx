import Link from 'next/link';
import { verifyOtpAction } from '@/lib/auth-actions';
import { smtpConfigured } from '@/lib/mailer';
import ResendCode from '@/components/ResendCode';
import ActionForm from '@/components/ActionForm';
import { Notice } from '@/components/ui';

export const metadata = { title: 'Verify your email — EasyDel' };
export const dynamic = 'force-dynamic';

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; resumed?: string; unverified?: string }>;
}) {
  const { email = '', resumed, unverified } = await searchParams;
  const noMail = !smtpConfigured();

  if (!email) {
    return (
      <>
        <h1 className="text-2xl font-semibold text-ink">Nothing to verify</h1>
        <p className="mt-2 text-sm text-ink-dim">
          This page needs the email address you signed up with.
        </p>
        <Link
          href="/signup"
          className="mt-6 inline-block text-sm font-medium text-accent underline decoration-accent/40 underline-offset-4"
        >
          Start from sign up
        </Link>
      </>
    );
  }

  return (
    <>
      <div className="mb-6">
        <p className="eyebrow mb-3 text-accent">Step 2 of 2</p>
        <h1 className="text-2xl font-semibold text-ink">Check your email</h1>
        <p className="mt-1.5 text-sm text-ink-dim">
          We sent a 6-digit code to{' '}
          <span className="break-anywhere font-mono text-ink">{email}</span>. It expires in 15
          minutes.
        </p>
      </div>

      {/* Explains why they landed here, so it doesn't read as an error. */}
      {unverified && (
        <div className="mb-6">
          <Notice>
            Your password was correct, but this email hasn&rsquo;t been verified yet. We&rsquo;ve
            sent a fresh code — enter it below to finish signing in.
          </Notice>
        </div>
      )}
      {resumed && !unverified && (
        <div className="mb-6">
          <Notice>
            You started signing up with this address before. We&rsquo;ve sent a new code to finish
            it off.
          </Notice>
        </div>
      )}

      {noMail && (
        <div className="mb-6">
          <Notice tone="warning">
            SMTP isn&rsquo;t configured, so no email was sent. Your code was printed to the{' '}
            <strong className="font-semibold">server console</strong> — check the terminal running
            the dev server.
          </Notice>
        </div>
      )}

      <ActionForm
        action={verifyOtpAction}
        submitLabel="Verify and continue"
        pendingLabel="Verifying…"
        fullWidthSubmit
      >
        <input type="hidden" name="email" value={email} />

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Verification code</span>
          <input
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="\d{6}"
            required
            placeholder="000000"
            aria-describedby="code-hint"
            /* Oversized, wide-tracked and monospace so a 6-digit code is
               trivial to read back from the email while typing. */
            className="field text-center font-mono text-2xl tracking-[0.5em] placeholder:tracking-[0.5em] placeholder:text-line-bright"
          />
          <span id="code-hint" className="mt-2 block text-xs text-ink-dim">
            Digits only. You get 5 attempts before the code is invalidated.
          </span>
        </label>
      </ActionForm>

      <ResendCode email={email} />

      <p className="mt-8 border-t border-line pt-6 text-sm text-ink-dim">
        Wrong address?{' '}
        <Link
          href="/signup"
          className="font-medium text-accent underline decoration-accent/40 underline-offset-4"
        >
          Sign up again
        </Link>
      </p>
    </>
  );
}
