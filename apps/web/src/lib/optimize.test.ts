import { describe, it, expect } from 'vitest';
import {
  optimizeRoute,
  originalDistance,
  haversine,
  isValidCoord,
  type Point,
} from './optimize';

const DEPOT: Point = { id: 'start', name: 'Depot', lat: 13.6288, lng: 79.4192 };

function stop(i: number, lat: number, lng: number): Point {
  return { id: `s${i}`, name: `Stop ${i}`, lat, lng };
}

/** Deterministic pseudo-random spread so the 100-stop case is reproducible. */
function scatter(n: number): Point[] {
  const out: Point[] = [];
  let seed = 42;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const a = (seed / 2147483648 - 0.5) * 0.1;
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const b = (seed / 2147483648 - 0.5) * 0.1;
    out.push(stop(i, DEPOT.lat + a, DEPOT.lng + b));
  }
  return out;
}

describe('isValidCoord', () => {
  it('accepts in-range coordinates', () => {
    expect(isValidCoord(13.6288, 79.4192)).toBe(true);
    expect(isValidCoord(0, 0)).toBe(true);
    expect(isValidCoord(-90, -180)).toBe(true);
    expect(isValidCoord(90, 180)).toBe(true);
  });

  it('rejects out-of-range, non-finite and non-numeric values', () => {
    expect(isValidCoord(91, 0)).toBe(false);
    expect(isValidCoord(0, 181)).toBe(false);
    expect(isValidCoord(NaN, 0)).toBe(false);
    expect(isValidCoord(Infinity, 0)).toBe(false);
    expect(isValidCoord('13.6' as unknown, 79.4)).toBe(false);
    expect(isValidCoord(null as unknown, null as unknown)).toBe(false);
  });
});

describe('haversine', () => {
  it('returns 0 for identical points', () => {
    expect(haversine(DEPOT, DEPOT)).toBe(0);
  });

  it('approximates a known short distance', () => {
    // ~1.11 km per 0.01 degree of latitude.
    const d = haversine({ lat: 0, lng: 0 }, { lat: 0.01, lng: 0 });
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1120);
  });

  it('is symmetric', () => {
    const a = { lat: 13.6, lng: 79.4 };
    const b = { lat: 13.7, lng: 79.5 };
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 6);
  });
});

describe('optimizeRoute — stop counts', () => {
  it('handles 0 stops as a start-to-end transit leg', () => {
    const end = stop(99, 13.65, 79.45);
    const r = optimizeRoute(DEPOT, end, []);
    expect(r.order).toHaveLength(0);
    expect(r.legs).toHaveLength(1);
    expect(r.totalDistance).toBeCloseTo(haversine(DEPOT, end), 3);
  });

  it('handles 1 stop', () => {
    const r = optimizeRoute(DEPOT, DEPOT, [stop(1, 13.64, 79.43)]);
    expect(r.order).toHaveLength(1);
    expect(r.legs).toHaveLength(2); // depot->stop, stop->depot
  });

  it('handles 2 stops', () => {
    const r = optimizeRoute(DEPOT, DEPOT, [stop(1, 13.64, 79.43), stop(2, 13.63, 79.42)]);
    expect(r.order).toHaveLength(2);
    expect(r.legs).toHaveLength(3);
  });

  it('handles 10 stops and visits each exactly once', () => {
    const stops = scatter(10);
    const r = optimizeRoute(DEPOT, DEPOT, stops);
    expect(r.order).toHaveLength(10);
    expect(new Set(r.order.map((s) => s.id)).size).toBe(10);
  });

  it('handles 100 stops without dropping or duplicating any', () => {
    const stops = scatter(100);
    const r = optimizeRoute(DEPOT, DEPOT, stops);
    expect(r.order).toHaveLength(100);
    expect(new Set(r.order.map((s) => s.id)).size).toBe(100);
    expect(r.totalDistance).toBeGreaterThan(0);
    expect(Number.isFinite(r.totalDistance)).toBe(true);
  });
});

describe('optimizeRoute — correctness', () => {
  it('never returns a longer path than the unoptimised order', () => {
    const stops = scatter(25);
    const before = originalDistance(DEPOT, DEPOT, stops);
    const after = optimizeRoute(DEPOT, DEPOT, stops).totalDistance;
    expect(after).toBeLessThanOrEqual(before + 1e-6);
  });

  it('does not sort alphabetically — it uses geography', () => {
    // Named in reverse of their geographic order along a line east of depot.
    const stops = [
      { id: 'a', name: 'Alpha', lat: 13.6288, lng: 79.4692 }, // furthest
      { id: 'b', name: 'Bravo', lat: 13.6288, lng: 79.4492 },
      { id: 'c', name: 'Charlie', lat: 13.6288, lng: 79.4292 }, // nearest
    ];
    const r = optimizeRoute(DEPOT, { ...DEPOT, id: 'end' }, stops);
    // Nearest-neighbour from the depot must reach Charlie first, not Alpha.
    expect(r.order[0].id).toBe('c');
  });

  it('produces geometry spanning start, stops and end', () => {
    const stops = scatter(5);
    const r = optimizeRoute(DEPOT, DEPOT, stops);
    expect(r.geometry?.coordinates).toHaveLength(7); // start + 5 + end
    expect(r.geometry?.coordinates[0]).toEqual([DEPOT.lng, DEPOT.lat]);
  });

  it('reports haversine as the source when OSRM has not been consulted', () => {
    expect(optimizeRoute(DEPOT, DEPOT, scatter(3)).source).toBe('haversine');
  });

  it('leg count always equals stops + 1', () => {
    for (const n of [0, 1, 2, 7, 20]) {
      const r = optimizeRoute(DEPOT, DEPOT, scatter(n));
      expect(r.legs).toHaveLength(r.order.length + 1);
    }
  });
});

describe('optimizeRoute — duplicates', () => {
  it('drops stops that coincide with an earlier stop', () => {
    const a = stop(1, 13.64, 79.43);
    const duplicate = { ...a, id: 's1-dup' };
    const r = optimizeRoute(DEPOT, DEPOT, [a, duplicate, stop(2, 13.65, 79.44)]);
    expect(r.order).toHaveLength(2);
    expect(r.droppedDuplicates).toBe(1);
  });

  it('keeps distinct stops that are merely close but beyond the threshold', () => {
    // ~0.002 degrees latitude is roughly 222 m, well past the 15 m threshold.
    const r = optimizeRoute(DEPOT, DEPOT, [stop(1, 13.64, 79.43), stop(2, 13.642, 79.43)]);
    expect(r.order).toHaveLength(2);
    expect(r.droppedDuplicates).toBe(0);
  });
});

describe('optimizeRoute — start/end handling', () => {
  it('creates a round trip when end equals start', () => {
    const r = optimizeRoute(DEPOT, { ...DEPOT, id: 'end' }, scatter(6));
    const coords = r.geometry!.coordinates;
    expect(coords[0]).toEqual(coords[coords.length - 1]);
  });

  it('supports a distinct end point', () => {
    const end = stop(999, 13.7, 79.5);
    const r = optimizeRoute(DEPOT, end, scatter(6));
    const coords = r.geometry!.coordinates;
    expect(coords[coords.length - 1]).toEqual([end.lng, end.lat]);
    expect(coords[0]).not.toEqual(coords[coords.length - 1]);
  });
});

describe('optimizeRoute — invalid input', () => {
  it('filters out stops with invalid coordinates rather than throwing', () => {
    const stops = [
      stop(1, 13.64, 79.43),
      { id: 'bad1', name: 'NaN stop', lat: NaN, lng: 79.4 },
      { id: 'bad2', name: 'Out of range', lat: 200, lng: 79.4 },
      { id: 'bad3', name: 'Infinite', lat: Infinity, lng: Infinity },
      stop(2, 13.65, 79.44),
    ];
    const r = optimizeRoute(DEPOT, DEPOT, stops);
    expect(r.order.map((s) => s.id)).toEqual(expect.arrayContaining(['s1', 's2']));
    expect(r.order).toHaveLength(2);
    expect(Number.isFinite(r.totalDistance)).toBe(true);
  });

  it('returns an empty order when every stop is invalid', () => {
    const r = optimizeRoute(DEPOT, DEPOT, [
      { id: 'bad', name: 'bad', lat: NaN, lng: NaN },
    ]);
    expect(r.order).toHaveLength(0);
    expect(Number.isFinite(r.totalDistance)).toBe(true);
  });
});
