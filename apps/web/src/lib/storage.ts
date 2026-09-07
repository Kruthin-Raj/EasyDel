/**
 * Photo storage on Supabase Storage.
 *
 * Images never go into Postgres — a building photo is hundreds of kilobytes and
 * would bloat every query that touches the row. They live in a **private**
 * bucket and are read back through short-lived signed URLs, so a leaked link
 * expires rather than exposing a customer's doorstep indefinitely.
 *
 * The service-role key is used here and must never be sent to the browser.
 * Every function in this file runs server-side only.
 */

const BUCKET = process.env.STORAGE_BUCKET || 'delivery-proofs';

function config() {
  /*
   * Falls back to NEXT_PUBLIC_SUPABASE_URL because it is the same value and is
   * far more likely to be present. Having storage silently disable itself
   * because only one of two identical URLs was set cost a real debugging
   * session — the project URL is not a secret, only the service key is.
   */
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(
    /\/$/,
    '',
  );
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function storageConfigured() {
  return config() !== null;
}

function headers(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

/**
 * Creates the private bucket if it is missing. Safe to call repeatedly — an
 * "already exists" response is treated as success.
 */
export async function ensureBucket(): Promise<{ ok: boolean; detail?: string }> {
  const c = config();
  if (!c) return { ok: false, detail: 'Supabase storage is not configured.' };

  const res = await fetch(`${c.url}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers(c.key, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: false,
      file_size_limit: 10 * 1024 * 1024,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    }),
  });

  if (res.ok) return { ok: true };

  const body = await res.text();
  if (/already exists|Duplicate/i.test(body)) return { ok: true };
  return { ok: false, detail: `${res.status} ${body.slice(0, 200)}` };
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const MAX_BYTES = 10 * 1024 * 1024;

export type UploadResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Uploads a photo and returns its storage path (not a URL — paths are stable,
 * signed URLs are not).
 */
export async function uploadPhoto(file: File, prefix: string): Promise<UploadResult> {
  const c = config();
  if (!c) return { ok: false, error: 'Photo storage is not configured on this server.' };

  if (file.size === 0) return { ok: false, error: 'That file was empty.' };
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `Photo is too large (max ${MAX_BYTES / 1024 / 1024} MB).` };
  }
  // Trusting the browser's content-type alone is weak, but combined with a
  // private bucket and an image-only allow-list on the bucket itself it is
  // adequate here.
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: 'Only JPEG, PNG, WebP or HEIC images are accepted.' };
  }

  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  // Random suffix so two photos taken in the same second cannot collide.
  const path = `${prefix}/${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}.${extension}`;

  const res = await fetch(`${c.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: headers(c.key, { 'Content-Type': file.type, 'x-upsert': 'false' }),
    body: await file.arrayBuffer(),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    console.error(`[storage] upload failed: ${res.status} ${detail}`);
    return { ok: false, error: 'Could not upload the photo. The server log has the reason.' };
  }

  return { ok: true, path };
}

/**
 * Mints a short-lived signed URL for a stored photo.
 *
 * Returns null rather than throwing so a missing or deleted image degrades to
 * "no photo" instead of breaking the page around it.
 */
export async function signedPhotoUrl(path: string | null, expiresIn = 60 * 60): Promise<string | null> {
  if (!path) return null;
  const c = config();
  if (!c) return null;

  try {
    const res = await fetch(`${c.url}/storage/v1/object/sign/${BUCKET}/${path}`, {
      method: 'POST',
      headers: headers(c.key, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn }),
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const { signedURL } = (await res.json()) as { signedURL?: string };
    return signedURL ? `${c.url}/storage/v1${signedURL}` : null;
  } catch {
    return null;
  }
}
