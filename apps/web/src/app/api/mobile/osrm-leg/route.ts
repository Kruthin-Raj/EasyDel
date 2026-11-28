import { NextResponse } from 'next/server';
import { isValidCoord } from '@/lib/optimize';

export const dynamic = 'force-dynamic';

/**
 * Proxies a single OSRM driving leg (`from -> to`) for the mobile app so
 * `OSRM_URL` stays server-side while rendering road paths in MapLibre + OSM.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fromLat = Number(searchParams.get('fromLat'));
  const fromLng = Number(searchParams.get('fromLng'));
  const toLat = Number(searchParams.get('toLat'));
  const toLng = Number(searchParams.get('toLng'));

  if (!isValidCoord(fromLat, fromLng) || !isValidCoord(toLat, toLng)) {
    return NextResponse.json({ error: 'Valid coordinates required.' }, { status: 400 });
  }

  const base = process.env.OSRM_URL || 'https://router.project-osrm.org';
  const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
  const url = `${base.replace(/\/$/, '')}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ coordinates: null, distance: null, duration: null });
    }
    const data = (await res.json()) as {
      routes?: { geometry?: { coordinates?: number[][] }; distance?: number; duration?: number }[];
    };
    const route = data?.routes?.[0];
    return NextResponse.json({
      coordinates: route?.geometry?.coordinates ?? null,
      distance: route?.distance ?? null,
      duration: route?.duration ?? null,
    });
  } catch {
    return NextResponse.json({ coordinates: null, distance: null, duration: null });
  }
}
