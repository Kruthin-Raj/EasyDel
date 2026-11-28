import type maplibregl from 'maplibre-gl';

/**
 * Fallback OpenStreetMap raster style when a remote vector style JSON
 * (Carto / custom tiles) fails to load in the client browser.
 */
export const OSM_RASTER_FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

/** Resolves the primary MapLibre style JSON URL configured for the web client. */
export function resolveMapStyleUrl(): string {
  return (
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
    'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
  );
}

/**
 * Attaches a one-shot style fallback to OpenStreetMap raster tiles if the
 * configured remote style or vector tile source errors out on load.
 */
export function attachOsmFallback(instance: maplibregl.Map): void {
  let switched = false;
  instance.on('error', () => {
    if (switched) return;
    if (!instance.isStyleLoaded()) {
      switched = true;
      instance.setStyle(OSM_RASTER_FALLBACK_STYLE);
    }
  });
}
