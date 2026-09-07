/**
 * Route optimisation: nearest-neighbour construction followed by 2-opt
 * improvement, on an open path from a fixed start to a fixed end.
 *
 * Pure and synchronous so it stays unit-testable and works with no network.
 * `refineWithOsrm` optionally upgrades the haversine estimate to real road
 * distance/duration, and degrades gracefully when OSRM is unreachable — the
 * stop ORDER never depends on the network.
 */

export type Point = { id: string; name: string; lat: number; lng: number };

export type OptimizeResult = {
  order: Point[];
  totalDistance: number; // metres
  estimatedDuration: number; // seconds
  legs: { from: string; to: string; distance: number; duration: number }[];
  /** 'haversine' = straight-line estimate; 'osrm' = real road network. */
  source: 'haversine' | 'osrm';
  geometry: { type: 'LineString'; coordinates: number[][] } | null;
  droppedDuplicates: number;
};

const EARTH_RADIUS_M = 6_371_000;
/** Rough urban average used only for the offline estimate: 20 km/h. */
const FALLBACK_SPEED_MPS = 5.56;

export function isValidCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = φ2 - φ1;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function pathLength(pts: Point[]) {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += haversine(pts[i], pts[i + 1]);
  return total;
}

/**
 * Drops stops that coincide with an earlier stop (within `thresholdM`), so a
 * duplicated import doesn't produce two markers on the same doorstep.
 */
function dedupe(stops: Point[], thresholdM = 15) {
  const kept: Point[] = [];
  let dropped = 0;
  for (const s of stops) {
    if (kept.some((k) => haversine(k, s) < thresholdM)) dropped++;
    else kept.push(s);
  }
  return { kept, dropped };
}

/** Nearest-neighbour ordering from `start`, ending at `end`. */
function nearestNeighbour(start: Point, end: Point, stops: Point[]) {
  const remaining = [...stops];
  const order: Point[] = [];
  let cursor = start;
  while (remaining.length) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(cursor, remaining[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    cursor = remaining[best];
    order.push(cursor);
    remaining.splice(best, 1);
  }
  void end;
  return order;
}

/**
 * 2-opt: repeatedly reverse a segment when doing so shortens the total path.
 * Start and end are pinned, so only the interior is permuted.
 */
function twoOpt(start: Point, end: Point, stops: Point[], maxPasses = 40) {
  if (stops.length < 3) return stops;
  let best = [...stops];
  let bestLen = pathLength([start, ...best, end]);
  let improved = true;
  let passes = 0;

  while (improved && passes < maxPasses) {
    improved = false;
    passes++;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        const len = pathLength([start, ...candidate, end]);
        if (len < bestLen - 0.5) {
          best = candidate;
          bestLen = len;
          improved = true;
        }
      }
    }
  }
  return best;
}

export function optimizeRoute(
  start: Point,
  end: Point,
  stops: Point[],
): OptimizeResult {
  const valid = stops.filter((s) => isValidCoord(s.lat, s.lng));
  const { kept, dropped } = dedupe(valid);

  // 0 stops is legitimate: a start->end transit leg.
  const ordered =
    kept.length <= 1 ? kept : twoOpt(start, end, nearestNeighbour(start, end, kept));

  const full = [start, ...ordered, end];
  const legs = [];
  let totalDistance = 0;
  for (let i = 0; i < full.length - 1; i++) {
    const d = haversine(full[i], full[i + 1]);
    totalDistance += d;
    legs.push({
      from: full[i].name,
      to: full[i + 1].name,
      distance: d,
      duration: d / FALLBACK_SPEED_MPS,
    });
  }

  return {
    order: ordered,
    totalDistance,
    estimatedDuration: totalDistance / FALLBACK_SPEED_MPS,
    legs,
    source: 'haversine',
    geometry: {
      type: 'LineString',
      coordinates: full.map((p) => [p.lng, p.lat]),
    },
    droppedDuplicates: dropped,
  };
}

/** Straight-line distance of the stops in their original (unoptimised) order. */
export function originalDistance(start: Point, end: Point, stops: Point[]) {
  return pathLength([start, ...stops.filter((s) => isValidCoord(s.lat, s.lng)), end]);
}

/**
 * Upgrades a haversine result to real road distances via OSRM.
 *
 * Only the OSRM_URL host is contacted, redirects are not followed, and a short
 * timeout applies — a slow or down routing server must not hang a page render.
 */
export async function refineWithOsrm(result: OptimizeResult): Promise<OptimizeResult> {
  const base = process.env.OSRM_URL;
  if (!base || !result.geometry || result.geometry.coordinates.length < 2) return result;

  const coords = result.geometry.coordinates.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url = `${base.replace(/\/$/, '')}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });
    if (!res.ok) return result;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return result;

    const legs =
      route.legs?.map((l: { distance: number; duration: number }, i: number) => ({
        from: result.legs[i]?.from ?? '',
        to: result.legs[i]?.to ?? '',
        distance: l.distance,
        duration: l.duration,
      })) ?? result.legs;

    return {
      ...result,
      totalDistance: route.distance,
      estimatedDuration: route.duration,
      legs,
      geometry: route.geometry ?? result.geometry,
      source: 'osrm',
    };
  } catch {
    // Offline, timed out, or OSRM rate-limited us. The haversine ordering
    // stands; we just report the estimate instead of road distance.
    return result;
  }
}
