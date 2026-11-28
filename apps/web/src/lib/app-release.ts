import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type ApkReleaseInfo = {
  available: boolean;
  version: string;
  fileName: string;
  sizeBytes: number | null;
  downloadUrl: string | null;
  source: 'env' | 'supabase-storage' | 'local-public' | 'none';
  updatedAt: string | null;
};

/**
 * Resolves the latest installable Android APK without hardcoding fake builds.
 *
 * Priority:
 *  1. `APK_DOWNLOAD_URL` env var (direct release / CDN link)
 *  2. Private Supabase Storage bucket (`APK_BUCKET` / `easydel-latest.apk`)
 *  3. Local file in `public/downloads/easydel-android.apk`
 */
export async function resolveApkRelease(): Promise<ApkReleaseInfo> {
  const version = process.env.MOBILE_APP_VERSION || '1.0.0';
  const fileName = 'easydel-android.apk';

  const explicitUrl = process.env.APK_DOWNLOAD_URL?.trim();
  if (explicitUrl) {
    return {
      available: true,
      version,
      fileName,
      sizeBytes: Number(process.env.APK_SIZE_BYTES) || null,
      downloadUrl: explicitUrl,
      source: 'env',
      updatedAt: process.env.APK_UPDATED_AT || null,
    };
  }

  const supaUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(
    /\/$/,
    '',
  );
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supaUrl && serviceKey) {
    const bucket = process.env.APK_BUCKET || 'app-releases';
    const objectPath = process.env.APK_OBJECT_PATH || 'easydel-latest.apk';
    try {
      const res = await fetch(`${supaUrl}/storage/v1/object/sign/${bucket}/${objectPath}`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 60 * 30 }),
        cache: 'no-store',
      });
      if (res.ok) {
        const data = (await res.json()) as { signedURL?: string };
        if (data.signedURL) {
          return {
            available: true,
            version,
            fileName,
            sizeBytes: Number(process.env.APK_SIZE_BYTES) || null,
            downloadUrl: `${supaUrl}/storage/v1${data.signedURL}`,
            source: 'supabase-storage',
            updatedAt: process.env.APK_UPDATED_AT || null,
          };
        }
      }
    } catch {
      // Storage unavailable or object not uploaded yet; fall through cleanly.
    }
  }

  const localPath = join(process.cwd(), 'public', 'downloads', fileName);
  if (existsSync(localPath)) {
    const stats = statSync(localPath);
    return {
      available: true,
      version,
      fileName,
      sizeBytes: stats.size,
      downloadUrl: `/downloads/${fileName}`,
      source: 'local-public',
      updatedAt: stats.mtime.toISOString(),
    };
  }

  return {
    available: false,
    version,
    fileName,
    sizeBytes: null,
    downloadUrl: null,
    source: 'none',
    updatedAt: null,
  };
}
