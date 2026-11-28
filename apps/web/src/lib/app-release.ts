import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type ApkReleaseInfo = {
  available: boolean;
  version: string;
  fileName: string;
  sizeBytes: number | null;
  downloadUrl: string | null;
  source: 'env' | 'supabase-storage' | 'local-public' | 'github-release' | 'none';
  updatedAt: string | null;
};

/**
 * Resolves the latest installable Android APK without hardcoding fake builds.
 *
 * Priority:
 *  1. `APK_DOWNLOAD_URL` env var (direct release / CDN link)
 *  2. Private Supabase Storage bucket (`APK_BUCKET` / `easydel-latest.apk`)
 *  3. Local file in `public/downloads/easydel-android.apk`
 *  4. Latest `.apk` asset on GitHub Releases (`GITHUB_RELEASE_REPO` / `Kruthin-Raj/EasyDel`)
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

  const ghRepo = (process.env.GITHUB_RELEASE_REPO || 'Kruthin-Raj/EasyDel').trim();
  if (ghRepo) {
    try {
      const ghRes = await fetch(`https://api.github.com/repos/${ghRepo}/releases/latest`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'EasyDel-AppRelease',
        },
        signal: AbortSignal.timeout(4000),
        next: { revalidate: 300 },
      });
      if (ghRes.ok) {
        const rel = (await ghRes.json()) as {
          tag_name?: string;
          published_at?: string;
          assets?: { name?: string; size?: number; browser_download_url?: string }[];
        };
        const apkAsset = rel.assets?.find((a) => a.name?.toLowerCase().endsWith('.apk'));
        if (apkAsset?.browser_download_url) {
          return {
            available: true,
            version: rel.tag_name?.replace(/^v/i, '') || version,
            fileName: apkAsset.name || fileName,
            sizeBytes: apkAsset.size ?? null,
            downloadUrl: apkAsset.browser_download_url,
            source: 'github-release',
            updatedAt: rel.published_at ?? null,
          };
        }
      }
    } catch {
      // GitHub API unreachable or no release yet; fall through cleanly.
    }
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
