'use client';

import { useEffect, useState, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, Link2, MapPin, TriangleAlert } from 'lucide-react';
import LiveMap, { type MapMarker } from '@/components/Map';
import type { ParsedLink } from '@/lib/map-links';

type State = { error?: string; success?: string; info?: string; rows?: ParsedLink[] } | null;

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-base font-semibold text-accent-ink transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:bg-line-bright disabled:text-ink-faint"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending ? pendingLabel : label}
    </button>
  );
}

/**
 * Two-step route builder: paste links, check the preview, then create.
 *
 * The steps are separate on purpose. A mis-parsed link becomes a delivery
 * location a driver has to visit, so a human confirms every row — and every
 * failure is shown with its reason rather than being dropped.
 */
export default function LinkRouteBuilder({
  parseAction,
  createAction,
  appendAction,
  deliveryTypes,
  existingRoutes,
}: {
  parseAction: (prev: State, formData: FormData) => Promise<State>;
  createAction: (prev: State, formData: FormData) => Promise<State>;
  appendAction: (prev: State, formData: FormData) => Promise<State>;
  deliveryTypes: string[];
  existingRoutes: { id: string; name: string; stopCount: number }[];
}) {
  const [parseState, runParse] = useActionState(parseAction, null);
  const [createState, runCreate] = useActionState(createAction, null);
  const [appendState, runAppend] = useActionState(appendAction, null);

  // Adding to a round the driver already runs is at least as common as
  // starting a fresh one - a house gets added mid-week.
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [fix, setFix] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setFix({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setFix(null),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, []);

  const rows = parseState?.rows ?? [];
  const usable = rows.filter((r) => r.latitude !== null);
  const failed = rows.filter((r) => r.latitude === null);

  const markers: MapMarker[] = usable.map((r, i) => ({
    id: `${i}`,
    lat: r.latitude!,
    lng: r.longitude!,
    name: r.name ?? `Stop ${i + 1}`,
    sequence: i + 1,
    state: 'remaining',
    subtitle: r.source,
  }));
  if (fix) {
    markers.unshift({
      id: 'start',
      lat: fix.lat,
      lng: fix.lng,
      name: 'Your position (start & end)',
      state: 'start',
    });
  }

  return (
    <div className="space-y-6">
      {/* ---------- step 1: paste ---------- */}
      <section className="rounded-xl border border-line bg-panel">
        <header className="border-b border-line px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Link2 className="h-4 w-4 text-accent" aria-hidden />
            Paste your map links
          </h2>
          <p className="mt-1 text-sm text-ink-dim">
            One per line. Google Maps, Apple Maps and Waze links all work, as do plain
            &ldquo;latitude, longitude&rdquo; pairs.
          </p>
        </header>

        <form action={runParse} className="space-y-4 p-5">
          <textarea
            name="links"
            rows={7}
            required
            placeholder={`https://maps.app.goo.gl/xxxxx\nhttps://www.google.com/maps/place/Green+Residency/@13.6288,79.4192,17z\n13.6335, 79.4241`}
            className="field resize-y font-mono text-sm"
          />
          {parseState?.error && (
            <p role="alert" data-testid="form-error" className="rounded-lg bg-bad-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-bad/30">
              {parseState.error}
            </p>
          )}
          <Submit label="Check these links" pendingLabel="Reading links…" />
        </form>
      </section>

      {/* ---------- step 2: preview + create ---------- */}
      {rows.length > 0 && (
        <form action={mode === 'new' ? runCreate : runAppend} className="space-y-6">
          {parseState?.info && (
            <p
              role="status"
              data-testid="form-info"
              className={`rounded-lg px-4 py-3 text-sm text-ink ring-1 ring-inset ${
                failed.length ? 'bg-warn-dim/60 ring-warn/30' : 'bg-ok-dim/60 ring-ok/30'
              }`}
            >
              {parseState.info}
            </p>
          )}
          {(createState?.error || appendState?.error) && (
            <p role="alert" data-testid="create-error" className="rounded-lg bg-bad-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-bad/30">
              {createState?.error ?? appendState?.error}
            </p>
          )}
          {appendState?.info && (
            <p role="status" data-testid="append-info" className="rounded-lg bg-info-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-info/30">
              {appendState.info}
            </p>
          )}

          {markers.length > 0 && (
            <section className="rounded-xl border border-line bg-panel">
              <header className="border-b border-line px-5 py-4">
                <h2 className="text-sm font-semibold text-ink">Where these are</h2>
                <p className="mt-1 text-sm text-ink-dim">
                  Check the pins land where you expect before creating the route.
                </p>
              </header>
              <div className="h-80 p-4">
                <LiveMap markers={markers} />
              </div>
            </section>
          )}

          <section className="rounded-xl border border-line bg-panel">
            <header className="border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">
                Confirm the stops ({usable.length})
              </h2>
              <p className="mt-1 text-sm text-ink-dim">
                Name each one so you recognise it on the round. Untick anything you don&rsquo;t
                want.
              </p>
            </header>

            <ul className="divide-y divide-line/70">
              {rows.map((row, i) =>
                row.latitude !== null ? (
                  <li key={i} className="grid gap-3 p-4 sm:grid-cols-[auto_1fr_9rem_6rem]">
                    <label className="flex items-center gap-2 sm:pt-8">
                      <input
                        type="checkbox"
                        name="stopInclude"
                        value={String(i)}
                        defaultChecked
                        className="check"
                      />
                      <span className="sr-only">Include this stop</span>
                    </label>

                    <div>
                      <span className="mb-1.5 block text-xs font-medium text-ink-dim">Name</span>
                      <input
                        name="stopName"
                        defaultValue={row.name ?? `Stop ${i + 1}`}
                        className="field"
                      />
                      <p className="numeric mt-1.5 text-xs text-ink-faint">
                        {row.latitude.toFixed(5)}, {row.longitude!.toFixed(5)} · {row.source}
                      </p>
                    </div>

                    <div>
                      <span className="mb-1.5 block text-xs font-medium text-ink-dim">Package</span>
                      <select name="stopType" className="field" defaultValue={deliveryTypes[0] ?? 'Package'}>
                        {deliveryTypes.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <span className="mb-1.5 block text-xs font-medium text-ink-dim">Qty</span>
                      <input
                        name="stopQty"
                        type="number"
                        min="1"
                        defaultValue="1"
                        inputMode="numeric"
                        className="field"
                      />
                    </div>

                    {/* Coordinates travel with the form so the server uses
                        exactly what was previewed. */}
                    <input type="hidden" name="stopLat" value={row.latitude} />
                    <input type="hidden" name="stopLng" value={row.longitude!} />
                  </li>
                ) : null,
              )}
            </ul>

            {failed.length > 0 && (
              <div className="border-t border-line bg-surface-2 p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium text-warn">
                  <TriangleAlert className="h-4 w-4" aria-hidden />
                  {failed.length} link{failed.length === 1 ? '' : 's'} could not be read
                </p>
                <ul className="space-y-2">
                  {failed.map((row, i) => (
                    <li key={i} className="rounded-lg bg-panel px-3 py-2 ring-1 ring-inset ring-line">
                      <p className="break-anywhere font-mono text-xs text-ink-dim">{row.input}</p>
                      <p className="mt-1 text-xs text-bad">{row.error}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-ink-dim">
                  These are skipped, not guessed at. Fix them and paste again, or carry on without
                  them.
                </p>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-line bg-panel">
            <header className="border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">Where do these go?</h2>
            </header>

            <div className="space-y-4 p-5">
              {/* Radio rather than a dropdown: two options, both worth seeing. */}
              <div className="grid gap-2 sm:grid-cols-2">
                <label
                  className={`cursor-pointer rounded-lg p-3 text-sm ring-1 ring-inset transition-colors ${
                    mode === 'new'
                      ? 'bg-accent-dim/30 text-ink ring-accent/50'
                      : 'bg-surface-2 text-ink-dim ring-line hover:bg-panel-2'
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value="new"
                    checked={mode === 'new'}
                    onChange={() => setMode('new')}
                    className="sr-only"
                  />
                  <span className="block font-medium text-ink">Create a new route</span>
                  <span className="mt-0.5 block text-xs">A fresh round trip from these stops.</span>
                </label>

                <label
                  className={`rounded-lg p-3 text-sm ring-1 ring-inset transition-colors ${
                    existingRoutes.length === 0
                      ? 'cursor-not-allowed bg-surface-2 text-ink-faint ring-line opacity-60'
                      : mode === 'existing'
                        ? 'cursor-pointer bg-accent-dim/30 text-ink ring-accent/50'
                        : 'cursor-pointer bg-surface-2 text-ink-dim ring-line hover:bg-panel-2'
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value="existing"
                    checked={mode === 'existing'}
                    disabled={existingRoutes.length === 0}
                    onChange={() => setMode('existing')}
                    className="sr-only"
                  />
                  <span className="block font-medium text-ink">Add to an existing route</span>
                  <span className="mt-0.5 block text-xs">
                    {existingRoutes.length === 0
                      ? 'You have no routes to add to yet.'
                      : 'Creates a new version and re-optimises the whole round.'}
                  </span>
                </label>
              </div>

              {mode === 'new' ? (
                <>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ink">
                      Route name <span className="text-accent">*</span>
                    </span>
                    <input
                      name="routeName"
                      required
                      placeholder="e.g. Tuesday fruit round"
                      className="field"
                    />
                  </label>

                  <input type="hidden" name="startLatitude" value={fix?.lat ?? ''} />
                  <input type="hidden" name="startLongitude" value={fix?.lng ?? ''} />

                  <p className="flex items-start gap-2 text-sm text-ink-dim">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                    {fix
                      ? 'Round trip starting and ending at your current position. The order is optimised for you.'
                      : 'No GPS fix, so the round trip will start and end at the first stop. Allow location access for a better order.'}
                  </p>

                  <Submit
                    label={`Create round trip with ${usable.length} stop${usable.length === 1 ? '' : 's'}`}
                    pendingLabel="Building route…"
                  />
                </>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ink">
                      Which route? <span className="text-accent">*</span>
                    </span>
                    <select name="existingRouteId" required className="field" defaultValue="">
                      <option value="" disabled>
                        Choose a route…
                      </option>
                      {existingRoutes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.stopCount} stop{r.stopCount === 1 ? '' : 's'})
                        </option>
                      ))}
                    </select>
                  </label>

                  <p className="flex items-start gap-2 text-sm text-ink-dim">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                    Existing stops are kept and everything is re-optimised together, so new houses
                    land in the right place rather than at the end. Anything already on the route is
                    skipped.
                  </p>

                  <Submit
                    label={`Add ${usable.length} stop${usable.length === 1 ? '' : 's'} to the route`}
                    pendingLabel="Updating route…"
                  />
                </>
              )}
            </div>
          </section>
        </form>
      )}
    </div>
  );
}
