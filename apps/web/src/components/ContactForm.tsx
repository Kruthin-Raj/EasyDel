'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, Send } from 'lucide-react';
import { submitContactAction, type SupportState } from '@/lib/support-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
      {pending ? 'Sending…' : 'Send message'}
    </button>
  );
}

const TOPICS = [
  'General question',
  'Route sharing & codes',
  'Memorize & recording',
  'Delivery issue / bug',
  'Feature request',
  'Account & sign-in',
];

export default function ContactForm({
  defaultName = '',
  defaultEmail = '',
}: {
  defaultName?: string;
  defaultEmail?: string;
}) {
  const [state, action] = useActionState<SupportState, FormData>(submitContactAction, null);

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <p
          role="alert"
          data-testid="form-error"
          className="rounded-lg bg-bad-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-bad/30"
        >
          {state.error}
        </p>
      )}
      {state?.success && (
        <p
          role="status"
          data-testid="form-success"
          className="rounded-lg bg-ok-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-ok/30"
        >
          {state.success}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 flex items-baseline gap-1 text-sm font-medium text-ink">
            Your name <span className="text-accent">*</span>
          </span>
          <input
            name="name"
            required
            defaultValue={defaultName}
            placeholder="e.g. Kruthin Raj"
            className="field"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-baseline gap-1 text-sm font-medium text-ink">
            Email address <span className="text-accent">*</span>
          </span>
          <input
            name="email"
            type="email"
            required
            defaultValue={defaultEmail}
            placeholder="you@example.com"
            className="field"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Topic</span>
          <select name="topic" defaultValue={TOPICS[0]} className="field">
            {TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-baseline gap-1 text-sm font-medium text-ink">
            Subject <span className="text-accent">*</span>
          </span>
          <input
            name="subject"
            required
            placeholder="Brief summary of what you need"
            className="field"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 flex items-baseline gap-1 text-sm font-medium text-ink">
          Message <span className="text-accent">*</span>
        </span>
        <textarea
          name="message"
          rows={5}
          required
          placeholder="Tell us what happened, which route or screen you were using, or what feature would make your morning round easier…"
          className="field resize-y"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-xs text-ink-dim">
          You&rsquo;ll receive a reference ticket number right away after submitting.
        </p>
        <SubmitButton />
      </div>
    </form>
  );
}
