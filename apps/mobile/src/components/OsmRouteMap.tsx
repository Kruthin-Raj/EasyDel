import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS } from '../theme';

export type OsmStopPin = {
  id: string;
  sequence: number;
  name: string;
  latitude: number;
  longitude: number;
  state: 'completed' | 'current' | 'remaining' | 'failed';
};

type Props = {
  stops: OsmStopPin[];
  routeGeometry?: number[][] | null;
  activeLegGeometry?: number[][] | null;
  driverCoords?: { lat: number; lng: number } | null;
  startPoint?: { name: string; latitude: number; longitude: number } | null;
  endPoint?: { name: string; latitude: number; longitude: number } | null;
  height?: number;
};

/**
 * Primary OpenStreetMap + MapLibre GL + OSRM route map for mobile (Android APK & Web).
 *
 * Uses MapLibre GL JS with OpenStreetMap / Carto dark vector styles, draws the
 * OSRM road path polyline and optional active navigation leg, and automatically
 * degrades to OSM raster tiles or an offline SVG beat outline if WebGL / tile
 * servers are unreachable on a signal-dead beat.
 */
export default function OsmRouteMap({
  stops,
  routeGeometry = null,
  activeLegGeometry = null,
  driverCoords = null,
  startPoint = null,
  endPoint = null,
  height = 300,
}: Props) {
  const payloadJson = useMemo(() => {
    const safeStops = stops
      .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .map((s) => ({
        id: s.id,
        seq: s.sequence,
        name: s.name,
        lat: s.latitude,
        lng: s.longitude,
        state: s.state,
      }));
    return JSON.stringify({
      stops: safeStops,
      route: routeGeometry ?? [],
      leg: activeLegGeometry ?? [],
      driver: driverCoords,
      start: startPoint,
      end: endPoint,
    }).replace(/<\//g, '<\\/');
  }, [stops, routeGeometry, activeLegGeometry, driverCoords, startPoint, endPoint]);

  const html = useMemo(() => {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
<style>
  html,body,#map,#fallback{margin:0;padding:0;width:100%;height:100%;background:#0b0f17;color:#f1f5f9;font-family:system-ui,-apple-system,sans-serif;overflow:hidden}
  #fallback{display:none;flex-direction:column;align-items:center;justify-content:center;position:relative}
  .badge{position:absolute;left:8px;bottom:8px;z-index:10;background:rgba(15,23,42,.86);border:1px solid rgba(148,163,184,.28);color:#cbd5e1;font-size:10px;padding:3px 7px;border-radius:6px;backdrop-filter:blur(4px)}
  .pin{display:flex;align-items:center;justify-content:center;border-radius:9999px;font-weight:700;box-shadow:0 0 0 3px rgba(255,255,255,.55),0 2px 5px rgba(0,0,0,.5)}
</style>
</head>
<body>
<div id="map"></div>
<div id="fallback"></div>
<div class="badge">MapLibre · OpenStreetMap · OSRM</div>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<script>
(function(){
  const DATA = ${payloadJson};
  const osmRasterStyle = {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors'
      }
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
  };

  function collectPoints() {
    const pts = [];
    if (DATA.start) pts.push([DATA.start.longitude, DATA.start.latitude]);
    DATA.stops.forEach(s => pts.push([s.lng, s.lat]));
    if (DATA.end) pts.push([DATA.end.longitude, DATA.end.latitude]);
    if (DATA.driver) pts.push([DATA.driver.lng, DATA.driver.lat]);
    (DATA.route || []).forEach(c => pts.push([c[0], c[1]]));
    (DATA.leg || []).forEach(c => pts.push([c[0], c[1]]));
    return pts;
  }

  function renderOfflineSvg() {
    document.getElementById('map').style.display = 'none';
    const fb = document.getElementById('fallback');
    fb.style.display = 'flex';
    const pts = collectPoints();
    if (!pts.length) {
      fb.innerHTML = '<div style="font-size:12px;color:#94a3b8">No coordinates available</div>';
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(([x,y]) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    });
    const dx = Math.max(maxX - minX, 0.002);
    const dy = Math.max(maxY - minY, 0.002);
    const pad = 28, W = 360, H = 260;
    const proj = ([lng, lat]) => [
      pad + ((lng - minX) / dx) * (W - pad * 2),
      H - pad - ((lat - minY) / dy) * (H - pad * 2)
    ];
    const lineCoords = DATA.route && DATA.route.length > 1
      ? DATA.route.map(proj)
      : DATA.stops.map(s => proj([s.lng, s.lat]));
    const legCoords = (DATA.leg || []).map(proj);
    let svg = '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:100%;background:#0f172a">';
    if (lineCoords.length > 1) {
      svg += '<polyline fill="none" stroke="#38bdf8" stroke-width="3.5" stroke-dasharray="5,4" points="'+lineCoords.map(p=>p.join(',')).join(' ')+'" />';
    }
    if (legCoords.length > 1) {
      svg += '<polyline fill="none" stroke="#2563eb" stroke-width="5" points="'+legCoords.map(p=>p.join(',')).join(' ')+'" />';
    }
    DATA.stops.forEach(s => {
      const [cx, cy] = proj([s.lng, s.lat]);
      const fill = s.state === 'completed' ? '#059669' : s.state === 'failed' ? '#dc2626' : s.state === 'current' ? '#f59e0b' : '#ffffff';
      const fg = s.state === 'remaining' ? '#0f172a' : '#ffffff';
      const r = s.state === 'current' ? 12 : 9;
      svg += '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+fill+'" stroke="#1e293b" stroke-width="2" />';
      svg += '<text x="'+cx+'" y="'+(cy+3.5)+'" text-anchor="middle" font-size="10" font-weight="700" fill="'+fg+'">'+s.seq+'</text>';
    });
    if (DATA.driver) {
      const [dxp, dyp] = proj([DATA.driver.lng, DATA.driver.lat]);
      svg += '<circle cx="'+dxp+'" cy="'+dyp+'" r="7" fill="#38bdf8" stroke="#ffffff" stroke-width="2" />';
    }
    svg += '</svg>';
    fb.innerHTML = svg;
  }

  if (typeof window.maplibregl === 'undefined') {
    renderOfflineSvg();
    return;
  }

  try {
    const pts = collectPoints();
    const initialCenter = DATA.driver
      ? [DATA.driver.lng, DATA.driver.lat]
      : pts[0] || [79.4192, 13.6288];

    const map = new maplibregl.Map({
      container: 'map',
      style: osmRasterStyle,
      center: initialCenter,
      zoom: 14,
      attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    let fellBack = false;
    map.on('error', function(){
      if (!fellBack && !map.isStyleLoaded()) {
        fellBack = true;
        renderOfflineSvg();
      }
    });

    function drawLayers() {
      const routeCoords = DATA.route && DATA.route.length > 1
        ? DATA.route
        : DATA.stops.map(s => [s.lng, s.lat]);
      if (routeCoords.length > 1) {
        const data = { type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoords } };
        if (map.getSource('osrm-route')) map.getSource('osrm-route').setData(data);
        else {
          map.addSource('osrm-route', { type: 'geojson', data });
          map.addLayer({
            id: 'osrm-route',
            type: 'line',
            source: 'osrm-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#38bdf8', 'line-width': 4, 'line-opacity': 0.85 }
          });
        }
      }
      if (DATA.leg && DATA.leg.length > 1) {
        const legData = { type: 'Feature', geometry: { type: 'LineString', coordinates: DATA.leg } };
        if (map.getSource('osrm-leg')) map.getSource('osrm-leg').setData(legData);
        else {
          map.addSource('osrm-leg', { type: 'geojson', data: legData });
          map.addLayer({
            id: 'osrm-leg',
            type: 'line',
            source: 'osrm-leg',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#2563eb', 'line-width': 6, 'line-opacity': 0.95 }
          });
        }
      }
    }

    map.on('load', drawLayers);
    map.on('style.load', drawLayers);

    if (DATA.start) {
      const el = document.createElement('div');
      el.className = 'pin';
      el.style.cssText = 'width:24px;height:24px;background:#0f172a;color:#fff;font-size:11px;border:2px solid #cbd5e1';
      el.textContent = 'S';
      new maplibregl.Marker({ element: el })
        .setLngLat([DATA.start.longitude, DATA.start.latitude])
        .setPopup(new maplibregl.Popup({ offset: 14, closeButton: false }).setText(DATA.start.name || 'Start'))
        .addTo(map);
    }

    DATA.stops.forEach(s => {
      const isCurr = s.state === 'current';
      const bg = s.state === 'completed' ? '#059669' : s.state === 'failed' ? '#dc2626' : isCurr ? '#f59e0b' : '#ffffff';
      const fg = s.state === 'remaining' ? '#0f172a' : '#ffffff';
      const el = document.createElement('div');
      el.className = 'pin';
      el.style.cssText = 'width:'+(isCurr?32:26)+'px;height:'+(isCurr?32:26)+'px;background:'+bg+';color:'+fg+';font-size:'+(isCurr?13:11)+'px';
      el.textContent = String(s.seq);
      new maplibregl.Marker({ element: el })
        .setLngLat([s.lng, s.lat])
        .setPopup(new maplibregl.Popup({ offset: 16, closeButton: false }).setText('#' + s.seq + ' ' + s.name))
        .addTo(map);
    });

    if (DATA.driver) {
      const el = document.createElement('div');
      el.style.cssText = 'width:16px;height:16px;border-radius:9999px;background:#38bdf8;border:3px solid #fff;box-shadow:0 0 12px #38bdf8';
      new maplibregl.Marker({ element: el }).setLngLat([DATA.driver.lng, DATA.driver.lat]).addTo(map);
    }

    if (pts.length > 1) {
      const bounds = pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
      map.fitBounds(bounds, { padding: 42, maxZoom: 15, duration: 0 });
    }
  } catch (e) {
    renderOfflineSvg();
  }
})();
</script>
</body>
</html>`;
  }, [payloadJson]);

  return (
    <View style={[styles.wrap, { height }]}>
      {stops.length === 0 && !driverCoords ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No route coordinates to display</Text>
        </View>
      ) : Platform.OS === 'web' ? (
        // Web iframe avoids react-native-webview web limitations while running identical MapLibre + OSM HTML.
        <iframe
          title="EasyDel OpenStreetMap + OSRM Route Map"
          srcDoc={html}
          style={{ width: '100%', height: '100%', border: 'none', borderRadius: 14 }}
        />
      ) : (
        <WebView
          originWhitelist={['*']}
          source={{ html }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          nestedScrollEnabled
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panel,
  },
  webview: { flex: 1, backgroundColor: '#0b0f17' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: COLORS.inkDim, fontSize: 13 },
});
