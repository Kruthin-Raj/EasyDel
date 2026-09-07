/**
 * Extracting coordinates from pasted map links.
 *
 * A driver collects a round by sharing each house from Google Maps into a note,
 * then pastes the lot in here. Every recognised shape below comes from a real
 * share/copy action in Google Maps, Apple Maps or Waze.
 *
 * Guiding rule from the spec: **never silently create an incorrect location**.
 * Anything we cannot resolve to real coordinates is returned as a failure with
 * the reason, not quietly dropped or guessed at.
 */

export type ParsedLink = {
  /** The original line, so the user can see what failed. */
  input: string;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string;
  error: string | null;
  /** True when resolving needs a network round-trip (short links). */
  needsResolution?: boolean;
};

const LAT_RANGE = 90;
const LNG_RANGE = 180;

function valid(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= LAT_RANGE &&
    Math.abs(lng) <= LNG_RANGE &&
    // 0,0 is in the Atlantic and is almost always a parsing artefact rather
    // than a real delivery address.
    !(lat === 0 && lng === 0)
  );
}

/** Google encodes place names with + for spaces and percent-escapes. */
function decodeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
    // Reject a "name" that is really a coordinate pair or a plus-code.
    if (!decoded || /^[-\d.,\s]+$/.test(decoded)) return null;
    return decoded.slice(0, 120);
  } catch {
    return null;
  }
}

/** Converts 13°37'43.7"N 79°25'09.1"E to decimal degrees. */
function parseDms(text: string): { lat: number; lng: number } | null {
  const pattern =
    /(\d+)[°º]\s*(\d+)['′]\s*([\d.]+)["″]?\s*([NS])[,\s+]+(\d+)[°º]\s*(\d+)['′]\s*([\d.]+)["″]?\s*([EW])/i;
  const m = text.match(pattern);
  if (!m) return null;

  const lat = (Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600) * (/s/i.test(m[4]) ? -1 : 1);
  const lng = (Number(m[5]) + Number(m[6]) / 60 + Number(m[7]) / 3600) * (/w/i.test(m[8]) ? -1 : 1);
  return valid(lat, lng) ? { lat, lng } : null;
}

// Genuine URL shorteners only. maps.apple.com is NOT one — listing it here
// made every Apple link without coordinates report as 'needs expanding'
// instead of reaching the Apple branch below.
const SHORT_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'g.co'];

/** Hosts we are willing to fetch when resolving a short link. */
export const RESOLVABLE_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'g.co',
  'www.google.com',
  'google.com',
  'maps.google.com',
]);

/**
 * Parses one line. Pure and synchronous — no network.
 *
 * Short links are flagged with `needsResolution` rather than failing, so the
 * caller can decide whether to resolve them.
 */
export function parseMapLink(input: string): ParsedLink {
  const line = input.trim();
  const base: ParsedLink = {
    input: line,
    name: null,
    latitude: null,
    longitude: null,
    source: 'unknown',
    error: null,
  };

  if (!line) return { ...base, error: 'Empty line.' };

  // --- bare coordinates: "13.6288, 79.4192" ---
  const bare = line.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (bare) {
    const lat = Number(bare[1]);
    const lng = Number(bare[2]);
    if (!valid(lat, lng)) return { ...base, source: 'coordinates', error: 'Coordinates out of range.' };
    return { ...base, latitude: lat, longitude: lng, source: 'coordinates' };
  }

  // --- degrees/minutes/seconds pasted directly ---
  const dms = parseDms(line);
  if (dms && !/https?:\/\//i.test(line)) {
    return { ...base, latitude: dms.lat, longitude: dms.lng, source: 'coordinates (DMS)' };
  }

  if (!/https?:\/\//i.test(line)) {
    return {
      ...base,
      error: 'Not a map link or a coordinate pair. Paste a link, or "latitude, longitude".',
    };
  }

  let url: URL;
  try {
    url = new URL(line);
  } catch {
    return { ...base, error: 'That is not a valid URL.' };
  }

  const host = url.hostname.toLowerCase();

  // --- short links need a redirect to resolve ---
  if (SHORT_HOSTS.includes(host) && !url.searchParams.has('ll') && !url.searchParams.has('q')) {
    return {
      ...base,
      source: host,
      needsResolution: true,
      error: 'Shortened link — needs expanding.',
    };
  }

  // --- Apple Maps: ?ll=lat,lng or ?q=lat,lng or ?address= ---
  if (host.endsWith('maps.apple.com')) {
    const ll = url.searchParams.get('ll') ?? url.searchParams.get('sll');
    const q = url.searchParams.get('q');
    const name = decodeName(url.searchParams.get('name') ?? q);

    const pair = (ll ?? q ?? '').match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (pair) {
      const lat = Number(pair[1]);
      const lng = Number(pair[2]);
      if (valid(lat, lng)) {
        return { ...base, latitude: lat, longitude: lng, name, source: 'Apple Maps' };
      }
    }
    return {
      ...base,
      name,
      source: 'Apple Maps',
      error: 'No coordinates in that Apple Maps link. Use "Copy Link" from a dropped pin.',
    };
  }

  // --- Waze: ?ll=lat,lng or ?latlng=lat,lng ---
  if (host.endsWith('waze.com')) {
    const raw =
      url.searchParams.get('ll') ??
      url.searchParams.get('latlng') ??
      url.searchParams.get('to')?.replace(/^ll\./, '');
    const pair = (raw ?? '').match(/(-?\d+(?:\.\d+)?)\s*[,.]\s*(-?\d+(?:\.\d+)?)/);
    if (pair) {
      const lat = Number(pair[1]);
      const lng = Number(pair[2]);
      if (valid(lat, lng)) return { ...base, latitude: lat, longitude: lng, source: 'Waze' };
    }
    return { ...base, source: 'Waze', error: 'No coordinates in that Waze link.' };
  }

  // --- Google Maps, in its several shapes ---
  if (host.endsWith('google.com') || host.endsWith('google.co.in') || host === 'maps.google.com') {
    const path = decodeURIComponent(url.pathname);

    // /maps/place/Some+Name/@13.6288,79.4192,17z
    const placeName = path.match(/\/maps\/place\/([^/@]+)/);
    const name = decodeName(placeName?.[1]);

    // Prefer !3d/!4d — these are the true place coordinates. The @ pair is the
    // map viewport centre, which can sit some distance from the pin.
    const exact = line.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (exact) {
      const lat = Number(exact[1]);
      const lng = Number(exact[2]);
      if (valid(lat, lng)) return { ...base, latitude: lat, longitude: lng, name, source: 'Google Maps' };
    }

    // ?q=lat,lng  /  ?query=lat,lng  /  ?destination=lat,lng
    const queryValue =
      url.searchParams.get('q') ??
      url.searchParams.get('query') ??
      url.searchParams.get('destination') ??
      url.searchParams.get('daddr');
    if (queryValue) {
      const pair = queryValue.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
      if (pair) {
        const lat = Number(pair[1]);
        const lng = Number(pair[2]);
        if (valid(lat, lng)) {
          return {
            ...base,
            latitude: lat,
            longitude: lng,
            name: name ?? decodeName(queryValue),
            source: 'Google Maps',
          };
        }
      }
    }

    // Place name written as DMS, e.g. /maps/place/13°37'43.7"N+79°25'09.1"E/
    const dmsInPath = parseDms(path);
    if (dmsInPath) {
      return { ...base, latitude: dmsInPath.lat, longitude: dmsInPath.lng, name, source: 'Google Maps' };
    }

    // /maps/@13.6288,79.4192,15z — viewport centre. Usable, but less precise.
    const at = path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (at) {
      const lat = Number(at[1]);
      const lng = Number(at[2]);
      if (valid(lat, lng)) {
        return { ...base, latitude: lat, longitude: lng, name, source: 'Google Maps (map centre)' };
      }
    }

    return {
      ...base,
      name,
      source: 'Google Maps',
      error:
        'That link has a place name but no coordinates. Open it, drop a pin, then use Share → Copy link.',
    };
  }

  return { ...base, source: host, error: `Unrecognised map site (${host}).` };
}

/** Splits pasted text into candidate lines — one link or coordinate each. */
export function splitLinks(blob: string): string[] {
  return blob
    .split(/[\r\n]+/)
    .flatMap((line) => {
      const trimmed = line.trim();
      // Several links pasted on one line, separated by spaces.
      if ((trimmed.match(/https?:\/\//g) ?? []).length > 1) {
        return trimmed.split(/\s+(?=https?:\/\/)/);
      }
      return [trimmed];
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Expands a shortened Google link by reading one redirect.
 *
 * Redirects are read manually and the target host is checked against an
 * allow-list before anything is parsed — following arbitrary redirects from
 * user-supplied URLs would make this an SSRF vector.
 */
export async function resolveShortLink(input: string): Promise<ParsedLink> {
  const parsed = parseMapLink(input);
  if (!parsed.needsResolution) return parsed;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ...parsed, error: 'That is not a valid URL.' };
  }

  if (!RESOLVABLE_HOSTS.has(url.hostname.toLowerCase())) {
    return { ...parsed, error: `Refusing to expand a link on ${url.hostname}.` };
  }

  try {
    let current = url.toString();

    // At most three hops: goo.gl typically bounces once via consent pages.
    for (let hop = 0; hop < 3; hop++) {
      const res = await fetch(current, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });

      const location = res.headers.get('location');
      if (!location) break;

      const next = new URL(location, current);
      if (!RESOLVABLE_HOSTS.has(next.hostname.toLowerCase())) {
        return { ...parsed, error: `Link redirected off-site to ${next.hostname}.` };
      }
      current = next.toString();

      const attempt = parseMapLink(current);
      if (attempt.latitude !== null) return { ...attempt, input, source: `${attempt.source} (expanded)` };
    }

    return { ...parsed, error: 'Could not expand that short link. Paste the full link instead.' };
  } catch {
    return { ...parsed, error: 'Could not reach that link to expand it. Paste the full link.' };
  }
}
