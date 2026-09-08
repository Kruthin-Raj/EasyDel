'use client';

import { useEffect, useRef, useState, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { MapPin, Camera, Check, Trash2, Loader2, Satellite } from 'lucide-react';
import RecordMap from '@/components/RecordMap';
import {
  addCheckpointAction,
  appendTrackAction,
  toggleCheckpointCompleteAction,
  deleteCheckpointAction,
  endRecordingAction,
} from '@/lib/recording-actions';

type Checkpoint = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  deliveryType: string | null;
  quantity: number | null;
  notes: string | null;
  nextVisitNote: string | null;
  photoUrl: string | null;
  completedAt: Date | null;
  sequence: number;
};

type Fix = { lat: number; lng: number; accuracy: number };

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3.5 text-base font-semibold text-accent-ink transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:bg-line-bright disabled:text-ink-faint"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending ? 'Saving…' : label}
    </button>
  );
}

/**
 * The first-day recording screen.
 *
 * Designed for one hand on a phone while standing at a gate: large targets,
 * the primary action always reachable, and no navigation away from the round.
 * Each checkpoint is saved to the server the moment it is entered — nothing is
 * buffered locally, because a closed tab or a dead battery must not lose the
 * houses already logged.
 */
export default function RecordingConsole({
  sessionId,
  routeName,
  checkpoints,
  deliveryTypes,
  startedAt,
}: {
  sessionId: string;
  routeName: string;
  checkpoints: Checkpoint[];
  deliveryTypes: string[];
  startedAt: string;
}) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [elapsed, setElapsed] = useState('');
  const pending = useRef<number[][]>([]);

  const [addState, addAction] = useActionState(addCheckpointAction, null);
  const [endState, endAction] = useActionState(endRecordingAction, null);

  // --- live position -------------------------------------------------------
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('This browser cannot report your location.');
      return;
    }

    const watch = navigator.geolocation.watchPosition(
      (position) => {
        setGeoError(null);
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setFix(next);
        pending.current.push([next.lng, next.lat]);
      },
      (error) => {
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was refused. Allow it in your browser settings, then reload — checkpoints need a position.'
            : 'Could not get a location fix. Move somewhere with a clearer view of the sky.',
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );

    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  // --- flush the track periodically ---------------------------------------
  useEffect(() => {
    // Batched every 20s rather than per reading: a round produces hundreds of
    // fixes and one request each would hammer the server for no extra detail.
    const timer = setInterval(() => {
      if (pending.current.length === 0) return;
      const batch = pending.current;
      pending.current = [];

      const data = new FormData();
      data.set('sessionId', sessionId);
      data.set('points', JSON.stringify(batch));
      // Fire and forget — a dropped batch costs a little track detail, nothing
      // more, and must never interrupt the driver.
      void appendTrackAction(data).catch(() => {});
    }, 20000);

    return () => clearInterval(timer);
  }, [sessionId]);

  // --- elapsed timer -------------------------------------------------------
  useEffect(() => {
    const started = new Date(startedAt).getTime();
    const tick = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      setElapsed(
        h > 0
          ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : `${m}:${String(s).padStart(2, '0')}`,
      );
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  // Close the form once a checkpoint saves, so the next tap starts clean.
  useEffect(() => {
    if (addState?.success) setFormOpen(false);
  }, [addState?.success]);

  const done = checkpoints.filter((c) => c.completedAt).length;

  return (
    <div className="space-y-4">
      {/* Status strip — the three numbers that matter mid-round. */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
        <div className="bg-panel px-4 py-3">
          <p className="eyebrow text-ink-faint">Elapsed</p>
          <p className="numeric mt-1 text-xl font-semibold text-ink">{elapsed || '—'}</p>
        </div>
        <div className="bg-panel px-4 py-3">
          <p className="eyebrow text-ink-faint">Houses</p>
          <p className="numeric mt-1 text-xl font-semibold text-ink">{checkpoints.length}</p>
        </div>
        <div className="bg-panel px-4 py-3">
          <p className="eyebrow text-ink-faint">Delivered</p>
          <p className="numeric mt-1 text-xl font-semibold text-ok">{done}</p>
        </div>
      </div>

      <RecordMap
        checkpoints={checkpoints.map((c) => ({
          id: c.id,
          sequence: c.sequence,
          name: c.name,
          latitude: c.latitude,
          longitude: c.longitude,
          completed: Boolean(c.completedAt),
        }))}
      />

      {/* GPS state, stated plainly — a driver must never wonder if it is on. */}
      <div
        className={`flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${
          geoError
            ? 'bg-bad-dim/60 text-ink ring-bad/30'
            : fix
              ? 'bg-ok-dim/50 text-ink ring-ok/25'
              : 'bg-warn-dim/50 text-ink ring-warn/25'
        }`}
      >
        {geoError ? (
          <Satellite className="h-4 w-4 shrink-0 text-bad" aria-hidden />
        ) : fix ? (
          <span className="live-dot h-2 w-2 shrink-0 rounded-full bg-ok" aria-hidden />
        ) : (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-warn" aria-hidden />
        )}
        <span className="min-w-0">
          {geoError ??
            (fix
              ? `Recording — ${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)} (±${Math.round(fix.accuracy)} m)`
              : 'Waiting for a GPS fix…')}
        </span>
      </div>

      {addState?.error && (
        <p role="alert" data-testid="form-error" className="rounded-lg bg-bad-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-bad/30">
          {addState.error}
        </p>
      )}
      {addState?.success && (
        <p role="status" data-testid="form-success" className="rounded-lg bg-ok-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-ok/30">
          {addState.success}
        </p>
      )}

      {/* --- primary action --- */}
      {!formOpen ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          disabled={!fix}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-accent px-4 py-5 text-lg font-semibold text-accent-ink transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:bg-line-bright disabled:text-ink-faint"
        >
          <MapPin className="h-5 w-5" aria-hidden />
          {fix ? 'Add checkpoint here' : 'Waiting for GPS…'}
        </button>
      ) : (
        <div className="rounded-xl border border-line bg-panel">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">New checkpoint</h2>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="text-sm text-ink-dim hover:text-ink"
            >
              Cancel
            </button>
          </header>

          <form action={addAction} className="space-y-4 p-4">
            <input type="hidden" name="sessionId" value={sessionId} />
            <input type="hidden" name="latitude" value={fix?.lat ?? ''} />
            <input type="hidden" name="longitude" value={fix?.lng ?? ''} />

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                House / building <span className="text-accent">*</span>
              </span>
              <input name="name" required autoFocus placeholder="e.g. 24 Green Street" className="field" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Address</span>
              <input name="address" placeholder="Optional — defaults to the name" className="field" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Package type</span>
                <select name="deliveryType" className="field" defaultValue={deliveryTypes[0] ?? ''}>
                  <option value="">— none —</option>
                  {deliveryTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Quantity</span>
                <input name="quantity" type="number" min="0" inputMode="numeric" placeholder="1" className="field" />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Delivery notes</span>
              <textarea
                name="notes"
                rows={2}
                placeholder="e.g. leave at the gate, dog in the yard"
                className="field resize-y"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Note for next visit</span>
              <textarea
                name="nextVisitNote"
                rows={2}
                placeholder="e.g. no delivery tomorrow"
                className="field resize-y"
              />
              <span className="mt-1.5 block text-xs text-ink-dim">
                Shown at the top of this stop on the next run.
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Floor</span>
                <input name="floor" placeholder="2" className="field" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Unit</span>
                <input name="unit" placeholder="B" className="field" />
              </label>
            </div>

            {/* capture="environment" opens the rear camera directly on a phone
                instead of a file browser. */}
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
                <Camera className="h-4 w-4 text-ink-faint" aria-hidden />
                Photo of the house
              </span>
              <input
                type="file"
                name="photo"
                accept="image/*"
                capture="environment"
                className="block w-full cursor-pointer rounded-lg text-sm text-ink-dim ring-1 ring-inset ring-line file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-panel-2 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-ink"
              />
              <span className="mt-1.5 block text-xs text-ink-dim">Optional.</span>
            </label>

            <label className="flex items-center gap-2.5 rounded-lg bg-surface-2 p-3 ring-1 ring-inset ring-line">
              <input type="checkbox" name="markComplete" defaultChecked className="check" />
              <span className="text-sm text-ink">Delivered — mark this house done</span>
            </label>

            <SaveButton label="Save checkpoint" />
          </form>
        </div>
      )}

      {/* --- houses logged so far --- */}
      <div className="rounded-xl border border-line bg-panel">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">
            Logged this round ({checkpoints.length})
          </h2>
        </header>

        {checkpoints.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-dim">
            No houses yet. Tap <span className="font-medium text-ink">Add checkpoint</span> at the
            first delivery.
          </p>
        ) : (
          <ul className="divide-y divide-line/70">
            {[...checkpoints].reverse().map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={`numeric mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
                    c.completedAt
                      ? 'bg-ok-dim text-ok ring-1 ring-inset ring-ok/30'
                      : 'bg-panel-2 text-ink-dim ring-1 ring-inset ring-line-bright'
                  }`}
                >
                  {c.sequence}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{c.name}</p>
                  <p className="text-xs text-ink-dim">
                    {[c.deliveryType, c.quantity != null ? `×${c.quantity}` : null]
                      .filter(Boolean)
                      .join(' ') || 'No package type'}
                  </p>
                  {c.photoUrl && (
                    <div className="mt-2">
                      <img src={c.photoUrl} alt="House photo" className="h-16 w-auto rounded-md object-cover ring-1 ring-line" />
                    </div>
                  )}
                  {c.notes && <p className="mt-1 text-xs text-ink-dim">{c.notes}</p>}
                  {c.nextVisitNote && (
                    <p className="mt-1 text-xs text-warn">Next visit: {c.nextVisitNote}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <form action={toggleCheckpointCompleteAction}>
                    <input type="hidden" name="checkpointId" value={c.id} />
                    <button
                      type="submit"
                      title={c.completedAt ? 'Mark not delivered' : 'Mark delivered'}
                      className={`rounded-md p-2 transition-colors ${
                        c.completedAt
                          ? 'text-ok hover:bg-ok-dim'
                          : 'text-ink-faint hover:bg-panel-2 hover:text-ink'
                      }`}
                    >
                      <Check className="h-4 w-4" aria-hidden />
                      <span className="sr-only">
                        {c.completedAt ? 'Mark not delivered' : 'Mark delivered'}
                      </span>
                    </button>
                  </form>

                  <form action={deleteCheckpointAction}>
                    <input type="hidden" name="checkpointId" value={c.id} />
                    <button
                      type="submit"
                      title="Remove this checkpoint"
                      className="rounded-md p-2 text-ink-faint transition-colors hover:bg-bad-dim hover:text-bad"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Remove {c.name}</span>
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* --- finish --- */}
      <form action={endAction} className="rounded-xl border border-line bg-panel p-4">
        <input type="hidden" name="sessionId" value={sessionId} />
        {endState?.error && (
          <p role="alert" className="mb-3 rounded-lg bg-bad-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-bad/30">
            {endState.error}
          </p>
        )}
        <p className="mb-3 text-sm text-ink-dim">
          Finishing saves “{routeName}” with {checkpoints.length} house
          {checkpoints.length === 1 ? '' : 's'}. You can turn it into a delivery route straight
          after.
        </p>
        <SaveButton label="End route" />
      </form>
    </div>
  );
}
