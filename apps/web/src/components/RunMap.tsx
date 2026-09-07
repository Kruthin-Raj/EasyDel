'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Crosshair, Navigation, Compass, ArrowUp } from 'lucide-react';
import { getNavigationLegAction } from '@/lib/run-actions';


/**
 * Initial bearing from one point to another, in degrees clockwise from north.
 *
 * Needed because browsers report `coords.heading` as null on desktop and on
 * most phones unless the device is genuinely moving with GPS-grade speed. The
 * direction between two consecutive fixes is a reliable substitute.
 */
function bearingBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dLambda = toRad(b.lng - a.lng);

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Metres between two fixes — used to ignore GPS jitter when standing still. */
function metresApart(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dPhi = toRad(b.lat - a.lat);
  const dLambda = toRad(b.lng - a.lng);
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type MapStop = {
  id: string;
  sequence: number;
  name: string;
  latitude: number;
  longitude: number;
  outcome: 'DELIVERED' | 'SKIPPED' | 'FAILED' | null;
};

/**
 * The driver's navigation map.
 *
 * Shows where they are, the road path to the next stop, and every stop colour-
 * coded by outcome. The map follows the driver while "follow" is on, and stops
 * following the moment they pan — the usual behaviour, so inspecting the rest
 * of the round doesn't fight the auto-centre.
 *
 * This is a route overview, not turn-by-turn: there are no spoken directions or
 * lane guidance. The road path comes from OSRM, and the Navigate button hands
 * off to Google Maps for actual turn-by-turn, which is the arrangement the
 * whole product is built around — no paid navigation SDK.
 */
export default function RunMap({
  stops,
  current,
  routeGeometry,
}: {
  stops: MapStop[];
  current: MapStop | null;
  routeGeometry: number[][] | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const driverMarker = useRef<maplibregl.Marker | null>(null);
  const stopMarkers = useRef<maplibregl.Marker[]>([]);

  const [fix, setFix] = useState<{ lat: number; lng: number; heading: number | null } | null>(null);
  const [follow, setFollow] = useState(true);
  const [ready, setReady] = useState(false);

  /*
   * Orientation, exactly the two modes Google Maps offers:
   *   'north'   - map stays north-up, the driver marker points where you head
   *   'heading' - map rotates so your direction of travel is always up
   * Heading-up is easier to follow while driving; north-up is easier for
   * getting your bearings, so the driver picks.
   */
  const [orientation, setOrientation] = useState<'north' | 'heading'>('north');

  // Smoothed heading, from GPS when the browser gives one and from successive
  // positions when it does not.
  const [heading, setHeading] = useState<number | null>(null);
  const lastFix = useRef<{ lat: number; lng: number } | null>(null);

  // Declared here, not lower down: the leg effect lists it as a dependency,
  // and a const referenced before its initialiser runs throws on render.
  const hasFix = fix !== null;
  const [leg, setLeg] = useState<{ distance: number | null; duration: number | null }>({
    distance: null,
    duration: null,
  });

  const styleUrl =
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
    'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

  /*
   * Initial centre, read through a ref.
   *
   * `current` is a new object on every render, so depending on it here rebuilt
   * the whole map continuously and destroyed every source and layer with it —
   * which is exactly why the route line never appeared. The map is created once
   * and only re-created if the basemap style itself changes.
   */
  const initialCentre = useRef<[number, number] | null>(null);
  if (current && !initialCentre.current) {
    initialCentre.current = [current.longitude, current.latitude];
  }

  // --- create the map once ------------------------------------------------
  useEffect(() => {
    if (map.current || !container.current) return;
    const instance = new maplibregl.Map({
      container: container.current,
      style: styleUrl,
      center: initialCentre.current ?? [0, 0],
      zoom: initialCentre.current ? 14 : 2,
      attributionControl: { compact: true },
    });
    // Bottom-left: the top-right corner is taken by the orientation,
    // re-centre and navigate buttons, and overlapping them made those
    // unclickable — the zoom control was swallowing the taps.
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');

    // Any manual pan means the driver wants to look around; stop fighting them.
    instance.on('dragstart', () => setFollow(false));
    map.current = instance;
    setReady(true);

    return () => {
      instance.remove();
      map.current = null;
      setReady(false);
    };
  }, [styleUrl]);

  // --- watch position -----------------------------------------------------
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        const reported = Number.isFinite(p.coords.heading) ? (p.coords.heading as number) : null;

        /*
         * Prefer the device heading, but fall back to the direction travelled
         * since the last fix. Only recompute after 8 m of movement: a phone
         * standing still jitters by a few metres and the map would spin.
         */
        let derived = reported;
        if (derived === null && lastFix.current) {
          if (metresApart(lastFix.current, next) >= 8) {
            derived = bearingBetween(lastFix.current, next);
          }
        }
        if (derived !== null) setHeading(derived);
        if (!lastFix.current || metresApart(lastFix.current, next) >= 8) {
          lastFix.current = next;
        }

        setFix({ ...next, heading: derived });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  // --- driver marker ------------------------------------------------------
  useEffect(() => {
    const instance = map.current;
    if (!instance || !fix) return;

    if (!driverMarker.current) {
      /*
       * A cone-and-dot, like every sat-nav: the dot is the position, the cone
       * shows which way you face. In north-up mode the cone is the only thing
       * that rotates, so the map stays readable while still showing heading.
       */
      const el = document.createElement('div');
      el.className = 'easydel-driver';
      el.innerHTML = `
        <div class="easydel-driver-cone"></div>
        <div class="easydel-driver-dot"></div>
      `;
      driverMarker.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
        .setLngLat([fix.lng, fix.lat])
        .addTo(instance);
    } else {
      driverMarker.current.setLngLat([fix.lng, fix.lat]);
    }

    // Marker rotation is relative to the map, so in heading-up mode the map has
    // already turned and the marker must not turn again.
    driverMarker.current.setRotation(heading ?? 0);

    const cone = driverMarker.current.getElement().querySelector<HTMLElement>(
      '.easydel-driver-cone',
    );
    if (cone) cone.style.opacity = heading === null ? '0' : '1';

    if (follow) {
      instance.easeTo({
        center: [fix.lng, fix.lat],
        bearing: orientation === 'heading' ? (heading ?? instance.getBearing()) : 0,
        duration: 700,
      });
    }
  }, [fix, follow, ready, heading, orientation]);

  // Snap back to north the moment the driver switches out of heading-up.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    if (orientation === 'north' && instance.getBearing() !== 0) {
      instance.easeTo({ bearing: 0, duration: 400 });
    }
  }, [orientation, ready]);

  // --- stop markers -------------------------------------------------------
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    stopMarkers.current.forEach((m) => m.remove());
    stopMarkers.current = stops.map((stop) => {
      const isCurrent = stop.id === current?.id;
      const colour =
        stop.outcome === 'DELIVERED'
          ? '#059669'
          : stop.outcome === 'FAILED'
            ? '#dc2626'
            : stop.outcome
              ? '#64748b'
              : isCurrent
                ? '#f5a524'
                : '#ffffff';
      const text = stop.outcome || isCurrent ? '#ffffff' : '#0f172a';

      const el = document.createElement('div');
      el.style.cssText = `
        display:flex;align-items:center;justify-content:center;
        width:${isCurrent ? 34 : 26}px;height:${isCurrent ? 34 : 26}px;border-radius:9999px;
        background:${colour};color:${stop.outcome || isCurrent ? text : '#0f172a'};
        box-shadow:0 0 0 3px rgba(255,255,255,.6),0 1px 4px rgba(0,0,0,.45);
        font:600 ${isCurrent ? 14 : 12}px/1 ui-sans-serif,system-ui,sans-serif;
      `;
      el.textContent = String(stop.sequence);

      return new maplibregl.Marker({ element: el })
        .setLngLat([stop.longitude, stop.latitude])
        .setPopup(new maplibregl.Popup({ offset: 20, closeButton: false }).setText(stop.name))
        .addTo(instance);
    });

    return () => {
      stopMarkers.current.forEach((m) => m.remove());
      stopMarkers.current = [];
    };
  }, [stops, current, ready]);

  // --- planned route outline ---------------------------------------------
  useEffect(() => {
    const instance = map.current;
    if (!instance || !routeGeometry?.length) return;

    const draw = () => {
      const data = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: routeGeometry },
      };
      const src = instance.getSource('planned') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(data);
        return;
      }
      instance.addSource('planned', { type: 'geojson', data });
      instance.addLayer({
        id: 'planned',
        type: 'line',
        source: 'planned',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        // Dashed and muted: this is the whole round, not the leg being driven.
        paint: {
          'line-color': '#64748b',
          'line-width': 3,
          'line-opacity': 0.55,
          'line-dasharray': [2, 2],
        },
      });
    };

    if (instance.isStyleLoaded()) draw();
    else instance.once('load', draw);
  }, [routeGeometry, ready]);

  // --- live leg to the next stop -----------------------------------------
  useEffect(() => {
    if (!fix || !current) return;
    let cancelled = false;

    const fetchLeg = async () => {
      const result = await getNavigationLegAction(
        fix.lat,
        fix.lng,
        current.latitude,
        current.longitude,
      );
      if (cancelled) return;

      setLeg({ distance: result.distance, duration: result.duration });

      const instance = map.current;
      if (!instance) return;

      // Straight line when routing is unavailable — still tells the driver
      // which way to head.
      const coordinates =
        result.coordinates ??
        ([
          [fix.lng, fix.lat],
          [current.longitude, current.latitude],
        ] as number[][]);

      const data = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates },
      };

      const apply = () => {
        const src = instance.getSource('leg') as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData(data);
          return;
        }
        instance.addSource('leg', { type: 'geojson', data });
        instance.addLayer({
          id: 'leg',
          type: 'line',
          source: 'leg',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#2563eb', 'line-width': 6, 'line-opacity': 0.9 },
        });
      };

      if (instance.isStyleLoaded()) apply();
      else instance.once('load', apply);
    };

    void fetchLeg();

    /*
     * Re-route every 25s while moving. Frequent enough to stay useful, sparse
     * enough not to hammer a shared OSRM instance for a whole shift.
     */
    const timer = setInterval(() => void fetchLeg(), 25000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    /*
     * Re-runs when the target stop changes, when the map becomes available, and
     * once when the first GPS fix arrives — `hasFix` rather than `fix` itself,
     * so a moving driver does not fire a routing request on every GPS tick. The
     * interval handles refreshing while under way.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, hasFix, ready]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-line">
      <div ref={container} className="h-[22rem] w-full sm:h-[26rem]" />

      {/* Distance and time to the next stop, over the map. */}
      {current && (
        <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-between gap-2">
          <div className="pointer-events-auto rounded-lg bg-surface/90 px-3 py-2 text-sm backdrop-blur ring-1 ring-inset ring-line-bright">
            <p className="eyebrow text-accent">Next</p>
            <p className="mt-0.5 font-medium text-ink">{current.name}</p>
            <p className="numeric mt-0.5 text-xs text-ink-dim">
              {leg.distance !== null
                ? leg.distance >= 1000
                  ? `${(leg.distance / 1000).toFixed(1)} km`
                  : `${Math.round(leg.distance)} m`
                : '—'}
              {leg.duration !== null ? ` · ${Math.max(1, Math.round(leg.duration / 60))} min` : ''}
            </p>
          </div>

          <div className="pointer-events-auto flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setOrientation((o) => (o === 'north' ? 'heading' : 'north'))}
              title={
                orientation === 'heading'
                  ? 'Heading up — tap for north up'
                  : 'North up — tap to rotate with your heading'
              }
              className={`rounded-lg p-2.5 ring-1 ring-inset backdrop-blur transition-colors ${
                orientation === 'heading'
                  ? 'bg-accent/90 text-accent-ink ring-accent'
                  : 'bg-surface/90 text-ink ring-line-bright hover:bg-panel-2'
              }`}
            >
              {orientation === 'heading' ? (
                <ArrowUp className="h-4 w-4" aria-hidden />
              ) : (
                <Compass className="h-4 w-4" aria-hidden />
              )}
              <span className="sr-only">
                {orientation === 'heading' ? 'Switch to north up' : 'Switch to heading up'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFollow(true);
                if (fix && map.current) {
                  map.current.easeTo({ center: [fix.lng, fix.lat], zoom: 15, duration: 600 });
                }
              }}
              title={follow ? 'Following you' : 'Re-centre on you'}
              className={`rounded-lg p-2.5 ring-1 ring-inset backdrop-blur transition-colors ${
                follow
                  ? 'bg-accent/90 text-accent-ink ring-accent'
                  : 'bg-surface/90 text-ink ring-line-bright hover:bg-panel-2'
              }`}
            >
              <Crosshair className="h-4 w-4" aria-hidden />
              <span className="sr-only">Re-centre on my position</span>
            </button>

            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${current.latitude},${current.longitude}&travelmode=driving`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open turn-by-turn in Google Maps"
              className="rounded-lg bg-surface/90 p-2.5 text-ink ring-1 ring-inset ring-line-bright backdrop-blur transition-colors hover:bg-panel-2"
            >
              <Navigation className="h-4 w-4" aria-hidden />
              <span className="sr-only">Open turn-by-turn in Google Maps</span>
            </a>
          </div>
        </div>
      )}

      {!fix && (
        <p className="absolute inset-x-3 bottom-3 rounded-lg bg-surface/90 px-3 py-2 text-xs text-ink-dim backdrop-blur ring-1 ring-inset ring-line-bright">
          Waiting for GPS — the map will follow you once a fix arrives.
        </p>
      )}
    </div>
  );
}
