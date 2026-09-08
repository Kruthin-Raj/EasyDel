'use client';

import { useEffect, useState, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, Play } from 'lucide-react';

type State = { error?: string; success?: string; info?: string } | null;

function StartButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !ready}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3.5 text-base font-semibold text-accent-ink transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:bg-line-bright disabled:text-ink-faint"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Play className="h-4 w-4" aria-hidden />
      )}
      {pending ? 'Starting…' : ready ? 'Start recording' : 'Waiting for GPS…'}
    </button>
  );
}

/**
 * Start form for a recording round.
 *
 * The button stays disabled until a real GPS fix arrives: starting without a
 * position would produce a session whose first checkpoint has nowhere to
 * anchor, and the driver would only discover that at the first house.
 */
export default function StartRecordingForm({
  action,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
}) {
  const [state, formAction] = useActionState(action, null);
  const [fix, setFix] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('This browser cannot report your location.');
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        setGeoError(null);
        setFix({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was refused. Allow it in your browser, then reload this page.'
            : 'Could not get a GPS fix yet. Step outside or move somewhere with a clearer view.',
        );
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <p role="alert" data-testid="form-error" className="rounded-lg bg-bad-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-bad/30">
          {state.error}
        </p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          Route name <span className="text-accent">*</span>
        </span>
        <input
          name="routeName"
          required
          placeholder="e.g. Monday fruit round — Area 1"
          className="field"
        />
        <span className="mt-1.5 block text-xs text-ink-dim">
          You will pick this by name tomorrow, so make it recognisable.
        </span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          House names <span className="text-ink-faint">(optional)</span>
        </span>
        <textarea
          name="nameOptions"
          rows={4}
          placeholder={'One per line, e.g.\nMr Sharma — 12 Green Street\nAvengers Tower flat 3B\nCorner shop'}
          className="field resize-y"
        />
        <span className="mt-1.5 block text-xs text-ink-dim">
          Paste the round’s names now and each checkpoint will offer them as a dropdown, so you
          can pick instead of typing a long name at the gate. You can always type a new one.
        </span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          Package types for this round <span className="text-ink-faint">(optional)</span>
        </span>
        <textarea
          name="typeOptions"
          rows={3}
          placeholder={'One per line, e.g.\nBig box\nSmall box\nFruit crate'}
          className="field resize-y"
        />
        <span className="mt-1.5 block text-xs text-ink-dim">
          What you are carrying today. Kept to this round only, so it never changes another
          agent&rsquo;s list. Leave empty to use your usual types.
        </span>
      </label>

      <input type="hidden" name="startLatitude" value={fix?.lat ?? ''} />
      <input type="hidden" name="startLongitude" value={fix?.lng ?? ''} />

      <div
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ring-1 ring-inset ${
          geoError
            ? 'bg-bad-dim/60 text-ink ring-bad/30'
            : fix
              ? 'bg-ok-dim/50 text-ink ring-ok/25'
              : 'bg-warn-dim/50 text-ink ring-warn/25'
        }`}
      >
        {geoError ? null : fix ? (
          <span className="h-2 w-2 shrink-0 rounded-full bg-ok" aria-hidden />
        ) : (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-warn" aria-hidden />
        )}
        <span className="min-w-0">
          {geoError ??
            (fix
              ? `Location ready (±${Math.round(fix.accuracy)} m)`
              : 'Getting your location…')}
        </span>
      </div>

      <StartButton ready={Boolean(fix)} />
    </form>
  );
}
