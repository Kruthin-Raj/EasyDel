'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  name: string;
  /** Sequence number shown inside the pin. Omit for unnumbered points. */
  sequence?: number;
  /** Drives the marker's visual state, per the spec's stop states. */
  state?: 'completed' | 'current' | 'remaining' | 'start' | 'end' | 'driver';
  subtitle?: string;
};

const STATE_STYLES: Record<string, { bg: string; ring: string; fg: string }> = {
  completed: { bg: '#059669', ring: '#a7f3d0', fg: '#ffffff' },
  current: { bg: '#2563eb', ring: '#bfdbfe', fg: '#ffffff' },
  remaining: { bg: '#ffffff', ring: '#cbd5e1', fg: '#0f172a' },
  start: { bg: '#0f172a', ring: '#cbd5e1', fg: '#ffffff' },
  end: { bg: '#7c3aed', ring: '#ddd6fe', fg: '#ffffff' },
  driver: { bg: '#dc2626', ring: '#fecaca', fg: '#ffffff' },
};

function markerElement(m: MapMarker) {
  const style = STATE_STYLES[m.state ?? 'remaining'];
  const el = document.createElement('div');
  el.style.cssText = `
    display:flex;align-items:center;justify-content:center;
    width:28px;height:28px;border-radius:9999px;
    background:${style.bg};color:${style.fg};
    box-shadow:0 0 0 3px ${style.ring},0 1px 3px rgba(0,0,0,.35);
    font:600 12px/1 ui-sans-serif,system-ui,sans-serif;
    cursor:pointer;
  `;
  el.textContent =
    m.sequence != null
      ? String(m.sequence)
      : m.state === 'start'
        ? 'S'
        : m.state === 'end'
          ? 'E'
          : m.state === 'driver'
            ? '•'
            : '';
  el.setAttribute('aria-label', m.name);
  return el;
}

export default function LiveMap({
  markers = [],
  /** GeoJSON LineString coordinates as [lng, lat] pairs. */
  routeGeometry,
  className = 'h-full w-full',
}: {
  markers?: MapMarker[];
  routeGeometry?: number[][] | null;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const styleUrl =
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
    'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

  useEffect(() => {
    if (map.current || !container.current) return;
    const instance = new maplibregl.Map({
      container: container.current,
      style: styleUrl,
      center: [79.4192, 13.6288],
      zoom: 11,
      attributionControl: { compact: true },
    });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
    };
  }, [styleUrl]);

  // Markers + auto-fit. Without fitBounds the default centre leaves every
  // marker off-screen, which is what made the old map look empty.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    const created = markers.map((m) =>
      new maplibregl.Marker({ element: markerElement(m) })
        .setLngLat([m.lng, m.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(
            `<strong>${m.name}</strong>${m.subtitle ? `<br><span>${m.subtitle}</span>` : ''}`,
          ),
        )
        .addTo(instance),
    );

    const points = [...markers.map((m) => [m.lng, m.lat] as [number, number])];
    if (routeGeometry?.length) {
      for (const c of routeGeometry) points.push([c[0], c[1]]);
    }

    if (points.length === 1) {
      instance.setCenter(points[0]);
      instance.setZoom(15);
    } else if (points.length > 1) {
      const bounds = points.reduce(
        (b, p) => b.extend(p),
        new maplibregl.LngLatBounds(points[0], points[0]),
      );
      instance.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 });
    }

    return () => created.forEach((m) => m.remove());
  }, [markers, routeGeometry]);

  // Route polyline.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    const SOURCE = 'route-line';
    const draw = () => {
      if (!routeGeometry?.length) {
        if (instance.getLayer(SOURCE)) instance.removeLayer(SOURCE);
        if (instance.getSource(SOURCE)) instance.removeSource(SOURCE);
        return;
      }
      const data = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: routeGeometry },
      };
      const existing = instance.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data);
        return;
      }
      instance.addSource(SOURCE, { type: 'geojson', data });
      instance.addLayer({
        id: SOURCE,
        type: 'line',
        source: SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.75 },
      });
    };

    if (instance.isStyleLoaded()) draw();
    else instance.once('load', draw);
  }, [routeGeometry]);

  return (
    <div className={`overflow-hidden rounded-lg ring-1 ring-inset ring-line ${className}`}>
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
