'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Crosshair } from 'lucide-react';

export type RecordedPoint = {
  id: string;
  sequence: number;
  name: string;
  latitude: number;
  longitude: number;
  completed: boolean;
};

/**
 * Live map for the recording screen.
 *
 * Its job is reassurance: the driver should be able to glance down and see that
 * their position is being read and that each house they logged landed where
 * they expected. A checkpoint appearing on the map the instant it is saved is
 * the difference between trusting the round and re-doing it.
 *
 * The breadcrumb trail is drawn client-side from the positions seen in this
 * session — the authoritative track still goes to the server separately.
 */
export default function RecordMap({ checkpoints }: { checkpoints: RecordedPoint[] }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const driverMarker = useRef<maplibregl.Marker | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const trail = useRef<number[][]>([]);

  const [fix, setFix] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [follow, setFollow] = useState(true);

  const styleUrl =
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
    'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

  // Created once. Depending on anything that changes per render would tear the
  // map down and wipe its layers — the bug that hid the route on the run screen.
  useEffect(() => {
    if (map.current || !container.current) return;
    const instance = new maplibregl.Map({
      container: container.current,
      style: styleUrl,
      center: [0, 0],
      zoom: 2,
      attributionControl: { compact: true },
    });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');
    instance.on('dragstart', () => setFollow(false));
    map.current = instance;
    setReady(true);

    return () => {
      instance.remove();
      map.current = null;
      setReady(false);
    };
  }, [styleUrl]);

  // --- position + breadcrumb ---------------------------------------------
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        const next = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        };
        setFix(next);

        const last = trail.current[trail.current.length - 1];
        // ~5 m before adding a point, so a parked phone doesn't fill the trail.
        if (!last || Math.abs(last[0] - next.lng) > 0.00005 || Math.abs(last[1] - next.lat) > 0.00005) {
          trail.current = [...trail.current, [next.lng, next.lat]].slice(-500);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready || !fix) return;

    if (!driverMarker.current) {
      const el = document.createElement('div');
      el.className = 'easydel-driver';
      el.innerHTML = '<div class="easydel-driver-dot"></div>';
      driverMarker.current = new maplibregl.Marker({ element: el })
        .setLngLat([fix.lng, fix.lat])
        .addTo(instance);
      instance.easeTo({ center: [fix.lng, fix.lat], zoom: 16, duration: 0 });
    } else {
      driverMarker.current.setLngLat([fix.lng, fix.lat]);
      if (follow) instance.easeTo({ center: [fix.lng, fix.lat], duration: 600 });
    }

    // Breadcrumb of where the driver has been this session.
    const data = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: trail.current },
    };
    const draw = () => {
      const src = instance.getSource('trail') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(data);
        return;
      }
      if (trail.current.length < 2) return;
      instance.addSource('trail', { type: 'geojson', data });
      instance.addLayer({
        id: 'trail',
        type: 'line',
        source: 'trail',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2f7dfb', 'line-width': 4, 'line-opacity': 0.75 },
      });
    };
    if (instance.isStyleLoaded()) draw();
    else instance.once('load', draw);
  }, [fix, ready, follow]);

  // --- checkpoint pins, appearing as they are saved -----------------------
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    markers.current.forEach((m) => m.remove());
    markers.current = checkpoints.map((c) => {
      const el = document.createElement('div');
      el.style.cssText = `
        display:flex;align-items:center;justify-content:center;
        width:26px;height:26px;border-radius:9999px;
        background:${c.completed ? '#059669' : '#f5a524'};color:#0b0f14;
        box-shadow:0 0 0 3px rgba(255,255,255,.5),0 1px 4px rgba(0,0,0,.5);
        font:600 12px/1 ui-sans-serif,system-ui,sans-serif;
      `;
      el.textContent = String(c.sequence);
      return new maplibregl.Marker({ element: el })
        .setLngLat([c.longitude, c.latitude])
        .setPopup(new maplibregl.Popup({ offset: 20, closeButton: false }).setText(c.name))
        .addTo(instance);
    });

    return () => {
      markers.current.forEach((m) => m.remove());
      markers.current = [];
    };
  }, [checkpoints, ready]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-line">
      <div ref={container} className="h-64 w-full sm:h-72" />

      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
        <div className="pointer-events-auto rounded-lg bg-surface/90 px-3 py-2 text-xs backdrop-blur ring-1 ring-inset ring-line-bright">
          <p className="eyebrow text-accent">Recording</p>
          <p className="numeric mt-0.5 text-ink">
            {checkpoints.length} logged
            {fix ? ` · ±${Math.round(fix.accuracy)} m` : ' · waiting for GPS'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFollow(true);
            if (fix && map.current) {
              map.current.easeTo({ center: [fix.lng, fix.lat], zoom: 16, duration: 600 });
            }
          }}
          title={follow ? 'Following you' : 'Re-centre on you'}
          className={`pointer-events-auto rounded-lg p-2.5 ring-1 ring-inset backdrop-blur transition-colors ${
            follow
              ? 'bg-accent/90 text-accent-ink ring-accent'
              : 'bg-surface/90 text-ink ring-line-bright hover:bg-panel-2'
          }`}
        >
          <Crosshair className="h-4 w-4" aria-hidden />
          <span className="sr-only">Re-centre on my position</span>
        </button>
      </div>

      {!fix && (
        <p className="absolute inset-x-3 bottom-3 rounded-lg bg-surface/90 px-3 py-2 text-xs text-ink-dim backdrop-blur ring-1 ring-inset ring-line-bright">
          Waiting for GPS — checkpoints need a position before they can be saved.
        </p>
      )}
    </div>
  );
}
