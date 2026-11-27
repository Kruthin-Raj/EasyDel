'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Eye,
  EyeOff,
  HelpCircle,
  MapPin,
  Navigation,
  Play,
  RotateCcw,
} from 'lucide-react';
import LiveMap, { type MapMarker } from '@/components/Map';

export type MemorizeStop = {
  id: string;
  sequence: number;
  locationId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  notes: string | null;
  previousNote: string | null;
  floor: string | null;
  unit: string | null;
  entranceInstructions: string | null;
  securityInstructions: string | null;
  photoUrl: string | null;
  subscriptions: {
    id: string;
    customer: string | null;
    productType: string;
    quantity: number;
    specialInstructions: string | null;
  }[];
};

const R = 6_371_000;
function metresBetween(a: { lat: number; lng: number }, b: { latitude: number; longitude: number }) {
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.latitude * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b.longitude - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Interactive route memorization & practice console.
 *
 * Built for someone learning a new beat (like a newspaper carrier taking over
 * a morning round): step through every stop in sequence with photos, entrance
 * notes, and exact drop quantities, optionally test memory in Quiz mode, or
 * walk/ride along with live GPS proximity.
 */
export default function MemorizeConsole({
  routeId,
  routeName,
  stops,
  geofenceMetres,
  routeGeometry,
  startPoint,
  endPoint,
}: {
  routeId: string;
  routeName: string;
  stops: MemorizeStop[];
  geofenceMetres: number;
  routeGeometry: number[][] | null;
  startPoint: { name: string; lat: number; lng: number } | null;
  endPoint: { name: string; lat: number; lng: number } | null;
}) {
  const [index, setIndex] = useState(0);
  const [quizMode, setQuizMode] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [mastered, setMastered] = useState<Record<string, 'got_it' | 'review'>>({});
  const [useGps, setUseGps] = useState(false);
  const [fix, setFix] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!useGps) return;
    if (!('geolocation' in navigator)) return;
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        setGeoError(null);
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      () => setGeoError('Could not read GPS position. Check browser location permissions.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [useGps]);

  const current = stops[index] ?? null;

  function selectStop(nextIndex: number) {
    setIndex(nextIndex);
    setRevealed(false);
  }

  function markStop(status: 'got_it' | 'review') {
    if (!current) return;
    const updated = { ...mastered, [current.id]: status };
    setMastered(updated);

    // Advance to the next stop that isn't marked "got_it" yet, or just next.
    if (stops.length > 1) {
      const nextUnmastered = stops.findIndex(
        (s, i) => i > index && updated[s.id] !== 'got_it',
      );
      if (nextUnmastered !== -1) {
        selectStop(nextUnmastered);
      } else {
        const wrap = stops.findIndex((s) => s.id !== current.id && updated[s.id] !== 'got_it');
        if (wrap !== -1) selectStop(wrap);
        else if (index + 1 < stops.length) selectStop(index + 1);
      }
    }
  }

  const masteredCount = stops.filter((s) => mastered[s.id] === 'got_it').length;
  const reviewCount = stops.filter((s) => mastered[s.id] === 'review').length;

  const distance = fix && current ? metresBetween(fix, current) : null;
  const isNear = distance !== null && distance <= geofenceMetres;

  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    if (startPoint) {
      out.push({
        id: 'start',
        lat: startPoint.lat,
        lng: startPoint.lng,
        name: startPoint.name,
        state: 'start',
      });
    }
    stops.forEach((s, i) => {
      const state: MapMarker['state'] =
        i === index ? 'current' : mastered[s.id] === 'got_it' ? 'completed' : 'remaining';
      out.push({
        id: s.id,
        lat: s.latitude,
        lng: s.longitude,
        name: quizMode && i === index && !revealed ? `Stop #${s.sequence}` : s.name,
        sequence: s.sequence,
        state,
        subtitle: quizMode && i === index && !revealed ? 'Tap Reveal to check' : s.address,
      });
    });
    if (endPoint) {
      out.push({
        id: 'end',
        lat: endPoint.lat,
        lng: endPoint.lng,
        name: endPoint.name,
        state: 'end',
      });
    }
    if (fix) {
      out.push({
        id: 'me',
        lat: fix.lat,
        lng: fix.lng,
        name: 'Your position',
        state: 'driver',
      });
    }
    return out;
  }, [startPoint, endPoint, stops, index, mastered, quizMode, revealed, fix]);

  if (!current) {
    return (
      <div className="rounded-xl border border-line bg-panel p-8 text-center">
        <p className="text-sm text-ink-dim">This route has no stops to memorize yet.</p>
      </div>
    );
  }

  const hideDetails = quizMode && !revealed;
  const totalItems = current.subscriptions.reduce((sum, s) => sum + s.quantity, 0);

  return (
    <div className="space-y-5">
      {/* ---------------- progress & mode controls ---------------- */}
      <div className="grid gap-3 rounded-xl border border-line bg-panel p-4 sm:flex sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow text-ink-faint">Memorization progress</span>
            <span className="numeric text-xs font-semibold text-ink">
              {masteredCount}/{stops.length} got it
              {reviewCount > 0 ? ` · ${reviewCount} to review` : ''}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel-2">
            <div
              className="h-full rounded-full bg-ok transition-all duration-300"
              style={{ width: `${stops.length ? (masteredCount / stops.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setQuizMode((q) => !q);
              setRevealed(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ring-1 ring-inset transition-colors ${
              quizMode
                ? 'bg-accent text-accent-ink ring-accent'
                : 'bg-surface-2 text-ink ring-line-bright hover:bg-panel-2'
            }`}
          >
            {quizMode ? <HelpCircle className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
            {quizMode ? 'Memory quiz: ON' : 'Test my memory'}
          </button>

          <button
            type="button"
            onClick={() => {
              if (useGps) {
                setUseGps(false);
                setFix(null);
                setGeoError(null);
              } else if (!('geolocation' in navigator)) {
                setGeoError('This browser cannot report GPS position.');
              } else {
                setUseGps(true);
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ring-1 ring-inset transition-colors ${
              useGps
                ? 'bg-ok-dim text-ok ring-ok/40'
                : 'bg-surface-2 text-ink-dim ring-line-bright hover:bg-panel-2 hover:text-ink'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            {useGps ? 'Live GPS: ON' : 'Practice with GPS'}
          </button>

          {Object.keys(mastered).length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMastered({});
                selectStop(0);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-xs font-medium text-ink-dim ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2 hover:text-ink"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {geoError && (
        <p className="rounded-lg bg-warn-dim/60 px-4 py-2.5 text-sm text-ink ring-1 ring-inset ring-warn/30">
          {geoError}
        </p>
      )}

      {/* ---------------- map + active flashcard ---------------- */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-panel">
            <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Route map</h2>
                <p className="text-xs text-ink-dim">
                  Blue = studying now · Green = memorized · White = remaining
                </p>
              </div>
              {distance !== null && (
                <span
                  className={`numeric rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                    isNear
                      ? 'bg-ok-dim text-ok ring-ok/40'
                      : 'bg-surface-2 text-ink-dim ring-line-bright'
                  }`}
                >
                  {isNear
                    ? 'At this stop!'
                    : distance >= 1000
                      ? `${(distance / 1000).toFixed(1)} km away`
                      : `${Math.round(distance)} m away`}
                </span>
              )}
            </header>
            <div className="h-80 p-3 sm:h-96">
              <LiveMap markers={markers} routeGeometry={routeGeometry} />
            </div>
          </div>

          {/* Stop sequence jump strip */}
          <div className="rounded-xl border border-line bg-panel">
            <header className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">
                Stop sequence ({stops.length} stops)
              </h2>
            </header>
            <ul className="max-h-72 divide-y divide-line/70 overflow-y-auto">
              {stops.map((s, i) => {
                const state = mastered[s.id];
                const isCurrent = i === index;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => selectStop(i)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isCurrent ? 'bg-panel-2' : 'hover:bg-panel-2/60'
                      }`}
                    >
                      <span
                        className={`numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold ring-1 ring-inset ${
                          isCurrent
                            ? 'bg-accent text-accent-ink ring-accent'
                            : state === 'got_it'
                              ? 'bg-ok-dim text-ok ring-ok/30'
                              : state === 'review'
                                ? 'bg-warn-dim text-warn ring-warn/30'
                                : 'bg-surface-2 text-ink-dim ring-line-bright'
                        }`}
                      >
                        {state === 'got_it' && !isCurrent ? <Check className="h-3.5 w-3.5" /> : s.sequence}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {quizMode && state !== 'got_it' ? `Stop #${s.sequence}` : s.name}
                        </span>
                        <span className="block truncate text-xs text-ink-dim">
                          {quizMode && state !== 'got_it' ? 'Tap to study or test' : s.address}
                        </span>
                      </span>
                      <span className="numeric shrink-0 text-xs text-ink-faint">
                        {s.subscriptions.reduce((n, x) => n + x.quantity, 0)} items
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* ---------------- study card ---------------- */}
        <div className="space-y-4">
          <section className="overflow-hidden rounded-xl border border-accent/40 bg-panel ring-1 ring-inset ring-accent/20">
            <header className="flex items-center justify-between gap-3 border-b border-line bg-panel-2 px-5 py-4">
              <div>
                <p className="eyebrow text-accent">
                  Stop {current.sequence} of {stops.length}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-ink">
                  {hideDetails ? 'Try to recall this stop…' : current.name}
                </h2>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => selectStop((index - 1 + stops.length) % stops.length)}
                  aria-label="Previous stop"
                  className="rounded-lg bg-surface-2 p-2 text-ink-dim ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel hover:text-ink"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => selectStop((index + 1) % stops.length)}
                  aria-label="Next stop"
                  className="rounded-lg bg-surface-2 p-2 text-ink-dim ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel hover:text-ink"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="space-y-4 p-5">
              {hideDetails ? (
                <div className="rounded-xl border border-dashed border-line-bright bg-surface-2/70 p-6 text-center">
                  <EyeOff className="mx-auto h-7 w-7 text-ink-faint" aria-hidden />
                  <p className="mt-3 text-sm font-medium text-ink">
                    Look at pin #{current.sequence} on the map
                  </p>
                  <p className="mt-1 text-xs text-ink-dim">
                    Can you remember the building name, what items to drop, and any gate or
                    entrance instructions?
                  </p>
                  <button
                    type="button"
                    onClick={() => setRevealed(true)}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
                  >
                    <Eye className="h-4 w-4" />
                    Reveal stop details
                  </button>
                </div>
              ) : (
                <>
                  {current.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={current.photoUrl}
                      alt={`House photo for ${current.name}`}
                      className="h-48 w-full rounded-lg object-cover ring-1 ring-inset ring-line"
                    />
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-line-bright text-xs text-ink-faint">
                      No photo recorded for this stop
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-ink-dim">{current.address}</p>
                    {(current.floor || current.unit) && (
                      <p className="mt-0.5 text-sm text-ink">
                        {[current.floor && `Floor ${current.floor}`, current.unit && `Unit ${current.unit}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    <p className="numeric mt-1 text-xs text-ink-faint">
                      {current.latitude.toFixed(5)}, {current.longitude.toFixed(5)}
                    </p>
                  </div>

                  <div>
                    <p className="eyebrow mb-2 text-ink-faint">
                      What to deliver ({totalItems} item{totalItems === 1 ? '' : 's'})
                    </p>
                    <ul className="divide-y divide-line/70 overflow-hidden rounded-lg ring-1 ring-inset ring-line">
                      {current.subscriptions.map((sub) => (
                        <li
                          key={sub.id}
                          className="flex items-baseline justify-between gap-3 bg-surface-2 px-4 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink">
                              {sub.customer ?? 'Customer'}
                            </p>
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
                          No active delivery items listed at this stop.
                        </li>
                      )}
                    </ul>
                  </div>

                  {(current.entranceInstructions ||
                    current.securityInstructions ||
                    current.notes ||
                    current.previousNote) && (
                    <div className="space-y-2 rounded-lg bg-surface-2 p-4 ring-1 ring-inset ring-line">
                      <p className="eyebrow text-ink-faint">Drop &amp; access notes</p>
                      {current.entranceInstructions && (
                        <p className="text-sm text-ink">
                          <span className="font-medium text-accent">Entrance:</span>{' '}
                          {current.entranceInstructions}
                        </p>
                      )}
                      {current.securityInstructions && (
                        <p className="text-sm text-ink">
                          <span className="font-medium text-accent">Security:</span>{' '}
                          {current.securityInstructions}
                        </p>
                      )}
                      {current.notes && (
                        <p className="text-sm text-ink-dim">{current.notes}</p>
                      )}
                      {current.previousNote && (
                        <p className="rounded-md bg-info-dim/50 px-3 py-2 text-xs text-ink ring-1 ring-inset ring-info/25">
                          <span className="font-semibold">Next-visit note:</span>{' '}
                          {current.previousNote}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => markStop('review')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-warn-dim/70 px-3 py-3 text-sm font-semibold text-warn ring-1 ring-inset ring-warn/30 transition-colors hover:bg-warn-dim"
                >
                  <MapPin className="h-4 w-4" />
                  Needs review
                </button>
                <button
                  type="button"
                  onClick={() => markStop('got_it')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-ok px-3 py-3 text-sm font-semibold text-surface transition-colors hover:brightness-110"
                >
                  <Check className="h-4 w-4" />
                  Got it!
                </button>
              </div>

              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${current.latitude},${current.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
              >
                <Navigation className="h-4 w-4" aria-hidden />
                Preview directions in Google Maps
              </a>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel p-4">
            <div>
              <p className="text-sm font-semibold text-ink">Ready to deliver {routeName}?</p>
              <p className="text-xs text-ink-dim">
                Start a live delivery run whenever you&rsquo;re on the beat.
              </p>
            </div>
            <Link
              href={`/routes/${routeId}/run`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
            >
              <Play className="h-4 w-4" aria-hidden />
              Start delivery run
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
