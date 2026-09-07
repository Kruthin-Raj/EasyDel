'use client';

import { useEffect, useState, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Check,
  SkipForward,
  TriangleAlert,
  Navigation,
  Loader2,
  Undo2,
  MapPin,
} from 'lucide-react';
import RunMap from '@/components/RunMap';
import {
  markDeliveredAction,
  skipStopAction,
  markFailedAction,
  undoStopOutcomeAction,
  reportIssueAction,
  endRunAction,
  cancelRunAction,
} from '@/lib/run-actions';
import { SKIP_REASONS, ISSUE_CATEGORIES } from '@/lib/run-constants';

export type RunStop = {
  id: string;
  sequence: number;
  locationId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  notes: string | null;
  floor: string | null;
  unit: string | null;
  entranceInstructions: string | null;
  /** Signed URL for the house photo taken during training, if there is one. */
  photoUrl: string | null;
  subscriptions: {
    id: string;
    customer: string | null;
    productType: string;
    quantity: number;
    specialInstructions: string | null;
  }[];
  outcome: 'DELIVERED' | 'SKIPPED' | 'FAILED' | null;
  reason: string | null;
};

type Fix = { lat: number; lng: number; accuracy: number };

const R = 6_371_000;
function metresBetween(a: Fix, b: { latitude: number; longitude: number }) {
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.latitude * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b.longitude - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function ActionButton({
  label,
  pendingLabel,
  variant,
  icon: Icon,
}: {
  label: string;
  pendingLabel: string;
  variant: 'ok' | 'idle' | 'bad';
  icon: typeof Check;
}) {
  const { pending } = useFormStatus();
  const styles = {
    ok: 'bg-ok text-surface hover:brightness-110',
    idle: 'bg-surface-2 text-ink ring-1 ring-inset ring-line-bright hover:bg-panel-2',
    bad: 'bg-bad-dim text-bad ring-1 ring-inset ring-bad/40 hover:bg-bad hover:text-surface',
  };
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]}`}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Icon className="h-4 w-4" aria-hidden />
      )}
      {pending ? pendingLabel : label}
    </button>
  );
}

/**
 * The driver's day-two screen.
 *
 * One stop is in focus at a time — the next one without an outcome — because a
 * driver at a gate needs a single obvious action, not a table to scan. Every
 * outcome posts immediately; nothing is held client-side.
 */
export default function RunConsole({
  runId,
  routeId,
  routeName,
  stops,
  startedAt,
  geofenceMetres,
  reordered = false,
  routeGeometry = null,
}: {
  runId: string;
  routeId: string;
  routeName: string;
  stops: RunStop[];
  startedAt: string;
  geofenceMetres: number;
  reordered?: boolean;
  routeGeometry?: number[][] | null;
}) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'skip' | 'issue' | 'failed'>('none');
  const [elapsed, setElapsed] = useState('');

  const [deliverState, deliverAction] = useActionState(markDeliveredAction, null);
  const [skipState, skipAction] = useActionState(skipStopAction, null);
  const [failState, failAction] = useActionState(markFailedAction, null);
  const [issueState, issueAction] = useActionState(reportIssueAction, null);
  const [endState, endAction] = useActionState(endRunAction, null);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('This browser cannot report your location.');
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        setGeoError(null);
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      () =>
        setGeoError(
          'No GPS fix. You can still record deliveries, but the distance check is off.',
        ),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  useEffect(() => {
    const started = new Date(startedAt).getTime();
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - started) / 1000));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      setElapsed(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [startedAt]);

  // Close any open panel once an action succeeds.
  useEffect(() => {
    if (skipState?.success || issueState?.success || failState?.success) setPanel('none');
  }, [skipState?.success, issueState?.success, failState?.success]);

  const done = stops.filter((s) => s.outcome).length;
  const current = stops.find((s) => !s.outcome) ?? null;
  const remaining = stops.filter((s) => !s.outcome && s.id !== current?.id);
  const completed = stops.filter((s) => s.outcome);

  const distance = fix && current ? metresBetween(fix, current) : null;
  const tooFar = distance !== null && distance > geofenceMetres;

  const feedback = deliverState ?? skipState ?? failState ?? issueState;

  const hiddenPosition = (
    <>
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="latitude" value={fix?.lat ?? ''} />
      <input type="hidden" name="longitude" value={fix?.lng ?? ''} />
    </>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
        <div className="bg-panel px-4 py-3">
          <p className="eyebrow text-ink-faint">Progress</p>
          <p className="numeric mt-1 text-xl font-semibold text-ink">
            {done}/{stops.length}
          </p>
        </div>
        <div className="bg-panel px-4 py-3">
          <p className="eyebrow text-ink-faint">Remaining</p>
          <p className="numeric mt-1 text-xl font-semibold text-warn">{stops.length - done}</p>
        </div>
        <div className="bg-panel px-4 py-3">
          <p className="eyebrow text-ink-faint">Elapsed</p>
          <p className="numeric mt-1 text-xl font-semibold text-ink">{elapsed || '—'}</p>
        </div>
      </div>

      {reordered && (
        <p className="rounded-lg bg-info-dim/50 px-4 py-2.5 text-sm text-ink ring-1 ring-inset ring-info/25">
          Stops re-ordered from where you started, not from the route&rsquo;s planned start point.
        </p>
      )}

      <div
        className="h-1.5 overflow-hidden rounded-full bg-panel-2"
        role="img"
        aria-label={`${done} of ${stops.length} stops complete`}
      >
        <div
          className="h-full rounded-full bg-ok transition-all duration-500"
          style={{ width: `${stops.length ? (done / stops.length) * 100 : 0}%` }}
        />
      </div>

      {geoError && (
        <p className="rounded-lg bg-warn-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-warn/30">
          {geoError}
        </p>
      )}
      {feedback?.error && (
        <p role="alert" data-testid="form-error" className="rounded-lg bg-bad-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-bad/30">
          {feedback.error}
        </p>
      )}
      {feedback?.success && (
        <p role="status" data-testid="form-success" className="rounded-lg bg-ok-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-ok/30">
          {feedback.success}
        </p>
      )}
      {feedback?.info && (
        <p role="status" data-testid="form-info" className="rounded-lg bg-info-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-info/30">
          {feedback.info}
        </p>
      )}

      {/* The map sits above the stop card: mid-round the driver needs to see
          where to go before what to hand over. */}
      <RunMap
        stops={stops.map((s) => ({
          id: s.id,
          sequence: s.sequence,
          name: s.name,
          latitude: s.latitude,
          longitude: s.longitude,
          outcome: s.outcome,
        }))}
        current={
          current
            ? {
                id: current.id,
                sequence: current.sequence,
                name: current.name,
                latitude: current.latitude,
                longitude: current.longitude,
                outcome: current.outcome,
              }
            : null
        }
        routeGeometry={routeGeometry}
      />

      {/* ---------------- the stop in focus ---------------- */}
      {current ? (
        <section className="overflow-hidden rounded-xl border border-accent/40 bg-panel ring-1 ring-inset ring-accent/20">
          <header className="flex items-start justify-between gap-3 border-b border-line bg-panel-2 px-5 py-4">
            <div className="min-w-0">
              <p className="eyebrow text-accent">Next stop · {current.sequence} of {stops.length}</p>
              <h2 className="mt-1.5 text-xl font-semibold text-ink">{current.name}</h2>
              <p className="mt-1 text-sm text-ink-dim">{current.address}</p>
              {(current.floor || current.unit) && (
                <p className="text-sm text-ink-dim">
                  {[current.floor && `Floor ${current.floor}`, current.unit && `Unit ${current.unit}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </div>
            <span
              className={`numeric shrink-0 rounded-md px-2.5 py-1 text-sm font-semibold ${
                distance === null
                  ? 'bg-panel text-ink-faint ring-1 ring-inset ring-line-bright'
                  : tooFar
                    ? 'bg-warn-dim text-warn ring-1 ring-inset ring-warn/30'
                    : 'bg-ok-dim text-ok ring-1 ring-inset ring-ok/30'
              }`}
            >
              {distance === null
                ? '— m'
                : distance >= 1000
                  ? `${(distance / 1000).toFixed(1)} km`
                  : `${Math.round(distance)} m`}
            </span>
          </header>

          <div className="space-y-4 p-5">
            {current.photoUrl && (
              /*
               * eslint-disable-next-line @next/next/no-img-element --
               * these are short-lived signed URLs, which the Image optimiser's
               * static loader cannot handle.
               */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.photoUrl}
                alt={`The building at ${current.name}, photographed during training`}
                className="h-44 w-full rounded-lg object-cover ring-1 ring-inset ring-line"
              />
            )}

            {/* What to hand over. One row per customer, per the spec's
                "one stop, several delivery items" rule. */}
            <div>
              <p className="eyebrow mb-2 text-ink-faint">
                {current.subscriptions.reduce((n, s) => n + s.quantity, 0)} items ·{' '}
                {current.subscriptions.length} customer
                {current.subscriptions.length === 1 ? '' : 's'}
              </p>
              <ul className="divide-y divide-line/70 overflow-hidden rounded-lg ring-1 ring-inset ring-line">
                {current.subscriptions.map((sub) => (
                  <li key={sub.id} className="flex items-baseline justify-between gap-3 bg-surface-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{sub.customer ?? 'Customer'}</p>
                      <p className="text-xs text-ink-dim">{sub.productType}</p>
                      {sub.specialInstructions && (
                        <p className="mt-1 text-xs text-warn">{sub.specialInstructions}</p>
                      )}
                    </div>
                    <span className="numeric shrink-0 text-lg font-semibold text-ink">
                      ×{sub.quantity}
                    </span>
                  </li>
                ))}
                {current.subscriptions.length === 0 && (
                  <li className="bg-surface-2 px-4 py-3 text-sm text-ink-dim">
                    No active subscription at this building.
                  </li>
                )}
              </ul>
            </div>

            {current.notes && (
              <p className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-line">
                {current.notes}
              </p>
            )}
            {current.entranceInstructions && (
              <p className="text-sm text-ink-dim">Entrance: {current.entranceInstructions}</p>
            )}

            {tooFar && (
              <p className="rounded-lg bg-warn-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-warn/30">
                You are {Math.round(distance!)} m away — beyond the {geofenceMetres} m limit. You
                can still record an outcome, but you will be asked to confirm.
              </p>
            )}

            {/* Primary action. */}
            <form action={deliverAction} className="space-y-3">
              {hiddenPosition}
              <input type="hidden" name="stopId" value={current.id} />
              {tooFar && <input type="hidden" name="confirmDistance" value="yes" />}
              <ActionButton
                label={tooFar ? 'Mark delivered anyway' : 'Mark delivered'}
                pendingLabel="Recording…"
                variant="ok"
                icon={Check}
              />
            </form>

            <div className="grid grid-cols-2 gap-3">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${current.latitude},${current.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-surface-2 px-4 py-3 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
              >
                <Navigation className="h-4 w-4" aria-hidden />
                Navigate
              </a>
              <button
                type="button"
                onClick={() => setPanel(panel === 'skip' ? 'none' : 'skip')}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-surface-2 px-4 py-3 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
              >
                <SkipForward className="h-4 w-4" aria-hidden />
                Skip
              </button>
              <button
                type="button"
                onClick={() => setPanel(panel === 'failed' ? 'none' : 'failed')}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-surface-2 px-4 py-3 text-sm font-medium text-ink-dim ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2 hover:text-ink"
              >
                <TriangleAlert className="h-4 w-4" aria-hidden />
                Failed
              </button>
              <button
                type="button"
                onClick={() => setPanel(panel === 'issue' ? 'none' : 'issue')}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-surface-2 px-4 py-3 text-sm font-medium text-ink-dim ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2 hover:text-ink"
              >
                <TriangleAlert className="h-4 w-4" aria-hidden />
                Problem
              </button>
            </div>

            {/* Reason panels. A skip or failure without a reason is useless to
                whoever reads the history, so the reason is required. */}
            {panel === 'skip' && (
              <form action={skipAction} className="space-y-3 rounded-lg bg-surface-2 p-4 ring-1 ring-inset ring-line">
                {hiddenPosition}
                <input type="hidden" name="stopId" value={current.id} />
                {tooFar && <input type="hidden" name="confirmDistance" value="yes" />}
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">
                    Why are you skipping this stop?
                  </span>
                  <select name="reason" required className="field" defaultValue="">
                    <option value="" disabled>
                      Choose a reason…
                    </option>
                    {SKIP_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <textarea name="notes" rows={2} placeholder="Anything else worth noting" className="field resize-y" />
                <ActionButton label="Confirm skip" pendingLabel="Recording…" variant="idle" icon={SkipForward} />
              </form>
            )}

            {panel === 'failed' && (
              <form action={failAction} className="space-y-3 rounded-lg bg-surface-2 p-4 ring-1 ring-inset ring-line">
                {hiddenPosition}
                <input type="hidden" name="stopId" value={current.id} />
                {tooFar && <input type="hidden" name="confirmDistance" value="yes" />}
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">
                    Why did the delivery fail?
                  </span>
                  <select name="reason" required className="field" defaultValue="">
                    <option value="" disabled>
                      Choose a reason…
                    </option>
                    {SKIP_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <textarea name="notes" rows={2} placeholder="What happened" className="field resize-y" />
                <ActionButton label="Record failure" pendingLabel="Recording…" variant="bad" icon={TriangleAlert} />
              </form>
            )}

            {panel === 'issue' && (
              <form action={issueAction} className="space-y-3 rounded-lg bg-surface-2 p-4 ring-1 ring-inset ring-line">
                {hiddenPosition}
                <input type="hidden" name="entityType" value="Location" />
                <input type="hidden" name="entityId" value={current.locationId} />
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">
                    What kind of problem?
                  </span>
                  <select name="category" required className="field" defaultValue="">
                    <option value="" disabled>
                      Choose a category…
                    </option>
                    {ISSUE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">What happened?</span>
                  <textarea
                    name="description"
                    rows={3}
                    required
                    placeholder="e.g. the gate code has changed and nobody answered"
                    className="field resize-y"
                  />
                </label>
                <p className="text-xs text-ink-dim">
                  Reporting a problem does not change the delivery outcome — record that
                  separately.
                </p>
                <ActionButton label="Report problem" pendingLabel="Sending…" variant="idle" icon={TriangleAlert} />
              </form>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-ok/40 bg-panel p-6 text-center ring-1 ring-inset ring-ok/20">
          <Check className="mx-auto h-8 w-8 text-ok" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold text-ink">Every stop has an outcome</h2>
          <p className="mt-1 text-sm text-ink-dim">
            {done} of {stops.length} recorded. Finish the run below.
          </p>
        </section>
      )}

      {/* ---------------- what is left ---------------- */}
      {remaining.length > 0 && (
        <div className="rounded-xl border border-line bg-panel">
          <header className="border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold text-ink">Still to do ({remaining.length})</h2>
          </header>
          <ul className="divide-y divide-line/70">
            {remaining.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                <span className="numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-panel-2 text-xs font-semibold text-ink-dim ring-1 ring-inset ring-line-bright">
                  {s.sequence}
                </span>
                {s.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.photoUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-inset ring-line"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{s.name}</p>
                  <p className="truncate text-xs text-ink-dim">{s.address}</p>
                </div>
                <span className="numeric shrink-0 text-xs text-ink-faint">
                  {s.subscriptions.reduce((n, x) => n + x.quantity, 0)} items
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------------- recorded ---------------- */}
      {completed.length > 0 && (
        <div className="rounded-xl border border-line bg-panel">
          <header className="border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold text-ink">Recorded ({completed.length})</h2>
          </header>
          <ul className="divide-y divide-line/70">
            {completed.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
                    s.outcome === 'DELIVERED'
                      ? 'bg-ok-dim text-ok ring-1 ring-inset ring-ok/30'
                      : s.outcome === 'FAILED'
                        ? 'bg-bad-dim text-bad ring-1 ring-inset ring-bad/30'
                        : 'bg-idle-dim text-idle ring-1 ring-inset ring-idle/25'
                  }`}
                >
                  {s.outcome === 'DELIVERED' ? <Check className="h-3.5 w-3.5" /> : s.sequence}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{s.name}</p>
                  <p className="truncate text-xs text-ink-dim">
                    {s.outcome?.toLowerCase()}
                    {s.reason ? ` — ${s.reason}` : ''}
                  </p>
                </div>
                <form action={undoStopOutcomeAction}>
                  <input type="hidden" name="runId" value={runId} />
                  <input type="hidden" name="stopId" value={s.id} />
                  <button
                    type="submit"
                    title="Undo this outcome"
                    className="rounded-md p-2 text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
                  >
                    <Undo2 className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Undo outcome for {s.name}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------------- finish ---------------- */}
      <form action={endAction} className="space-y-3 rounded-xl border border-line bg-panel p-5">
        <input type="hidden" name="runId" value={runId} />
        {endState?.error && (
          <p role="alert" data-testid="end-error" className="rounded-lg bg-bad-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-bad/30">
            {endState.error}
          </p>
        )}
        {done < stops.length && (
          <label className="flex items-start gap-2.5 text-sm text-ink-dim">
            <input type="checkbox" name="confirmIncomplete" value="yes" className="check mt-0.5" />
            <span>
              Finish anyway, leaving {stops.length - done} stop
              {stops.length - done === 1 ? '' : 's'} unvisited.
            </span>
          </label>
        )}
        <ActionButton label="End route" pendingLabel="Finishing…" variant="idle" icon={MapPin} />
      </form>

      {/* Cancelling keeps whatever was already recorded — see cancelRunAction. */}
      <form action={cancelRunAction} className="rounded-xl border border-line bg-panel p-5">
        <input type="hidden" name="runId" value={runId} />
        <p className="mb-3 text-sm text-ink-dim">
          Cancelling stops the round without finishing it. The {done} outcome
          {done === 1 ? '' : 's'} you have already recorded are kept.
        </p>
        <label className="mb-3 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Reason (optional)</span>
          <input name="reason" placeholder="e.g. van broke down" className="field" />
        </label>
        <button
          type="submit"
          className="w-full rounded-lg bg-bad-dim px-4 py-3 text-sm font-semibold text-bad ring-1 ring-inset ring-bad/40 transition-colors hover:bg-bad hover:text-surface"
        >
          Cancel this run
        </button>
      </form>

      <p className="text-center text-xs text-ink-faint">
        {routeName} · run started {new Date(startedAt).toLocaleTimeString()} ·{' '}
        <a
          href={`/routes/${routeId}`}
          className="underline decoration-line-bright underline-offset-2 hover:text-ink"
        >
          route details
        </a>
      </p>
    </div>
  );
}
