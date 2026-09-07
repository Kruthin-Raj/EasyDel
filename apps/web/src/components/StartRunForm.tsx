'use client';

import { useEffect, useState, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Play, Loader2 } from 'lucide-react';

type State = { error?: string; success?: string; info?: string } | null;

function Button() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3.5 text-base font-semibold text-accent-ink transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:bg-line-bright disabled:text-ink-faint"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Play className="h-4 w-4" aria-hidden />
      )}
      {pending ? 'Starting…' : 'Start run'}
    </button>
  );
}

/**
 * Starts a delivery run.
 *
 * Unlike recording, this does NOT block on a GPS fix — a driver in an
 * underground car park still needs to start their round. Position is sent when
 * available and simply omitted when not; the distance check degrades to off
 * rather than stopping work.
 */
export default function StartRunForm({
  action,
  routeId,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  routeId: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const [fix, setFix] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setFix({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setFix(null),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, []);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && (
        <p role="alert" data-testid="form-error" className="rounded-lg bg-bad-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-bad/30">
          {state.error}
        </p>
      )}
      <input type="hidden" name="routeId" value={routeId} />
      <input type="hidden" name="latitude" value={fix?.lat ?? ''} />
      <input type="hidden" name="longitude" value={fix?.lng ?? ''} />
      <Button />
    </form>
  );
}
