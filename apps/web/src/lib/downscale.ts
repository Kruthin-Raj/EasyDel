/**
 * Shrinks a photo in the browser before it is uploaded.
 *
 * Why this is not optional
 * ------------------------
 * A checkpoint photo goes through a Server Action, and two separate ceilings
 * apply: Next's `serverActions.bodySizeLimit` (1MB by default) and Vercel's
 * hard 4.5MB cap on a serverless function's request body. A photo straight off
 * a phone is 2-8MB, so it breached both — the upload failed with a 500 and the
 * checkpoint was silently lost.
 *
 * Raising the Next limit alone would have "fixed" it locally and still failed
 * in production. Shrinking the file is what actually makes it fit.
 *
 * It also matters on the round itself: a driver on mobile data logging fifty
 * houses would otherwise push several hundred megabytes uphill, one slow
 * upload at a time. A 1600px JPEG is plenty to recognise a doorway.
 *
 * Never throws. Any failure — an unsupported codec, a browser without canvas,
 * a decode error — returns the original file, because a slightly-too-big photo
 * is a far better outcome than a driver stuck at a gate.
 */

/** Longest edge, in pixels, of the downscaled image. */
const MAX_EDGE = 1600;

/** JPEG quality. 0.8 keeps doorways and house numbers legible. */
const QUALITY = 0.8;

/** Below this, shrinking is not worth the work or the quality loss. */
const SKIP_BELOW_BYTES = 600 * 1024;

export type DownscaleResult = {
  file: File;
  /** True when the returned file is the original, untouched. */
  original: boolean;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      // HEIC on a non-Apple browser lands here, which is exactly why the
      // caller falls back to the original rather than surfacing an error.
      reject(new Error('The browser could not decode that image.'));
    };
    image.src = url;
  });
}

export async function downscaleImage(file: File): Promise<DownscaleResult> {
  if (!file.type.startsWith('image/')) return { file, original: true };
  if (file.size <= SKIP_BELOW_BYTES) return { file, original: true };

  try {
    const image = await loadImage(file);

    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    if (!longest) return { file, original: true };

    const scale = Math.min(1, MAX_EDGE / longest);
    const width = Math.round(image.naturalWidth * scale);
    const height = Math.round(image.naturalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return { file, original: true };
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    );
    if (!blob) return { file, original: true };

    // A tiny or already-optimised source can come out larger re-encoded. Keep
    // whichever is actually smaller.
    if (blob.size >= file.size) return { file, original: true };

    const renamed = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return {
      file: new File([blob], `${renamed}.jpg`, {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      }),
      original: false,
    };
  } catch {
    return { file, original: true };
  }
}

/** Human-readable size, for telling the driver what happened. */
export function readableSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
