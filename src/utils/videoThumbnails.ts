/**
 * Client-side video thumbnails.
 *
 * Two concerns live here:
 *
 *  1. Generating a poster frame from a *local* `File` (before it's compressed
 *     or uploaded) so the upload sheet can preview each clip. Works on the
 *     original file — no compression needed — by decoding a single frame into
 *     a canvas and reading it back as a JPEG data URL.
 *
 *  2. A tiny in-memory cache, keyed by the uploaded Drive file id, so the
 *     "Vídeos enviados" list can reuse the frame we already generated for a
 *     video that was *just uploaded this session*. It is deliberately not
 *     persisted: after a refresh the cache is empty and the list falls back to
 *     Google Drive's own thumbnail.
 */

/** Per-File promise cache so the sheet preview and the upload flow share one
 *  decode instead of doing it twice. WeakMap → entries vanish with the File. */
const fileThumbCache = new WeakMap<File, Promise<string>>();

/** driveFileId → data URL, for videos uploaded in the current page session. */
const uploadedThumbCache = new Map<string, string>();

/** Reuse a just-uploaded video's locally-generated thumbnail, if we still have
 *  it in memory (i.e. it was uploaded this session and no refresh happened). */
export function getUploadedThumbnail(driveFileId: string): string | undefined {
  return uploadedThumbCache.get(driveFileId);
}

/** Remember a locally-generated thumbnail against its uploaded Drive file id. */
export function rememberUploadedThumbnail(driveFileId: string, dataUrl: string): void {
  uploadedThumbCache.set(driveFileId, dataUrl);
}

/** Generate (or reuse a pending/finished) thumbnail data URL for a local file. */
export function generateVideoThumbnail(file: File): Promise<string> {
  const cached = fileThumbCache.get(file);
  if (cached) return cached;
  const p = decodeFrame(file).catch((err) => {
    // Don't cache the failure — a later caller may succeed (or we just fall
    // back to the placeholder glyph).
    fileThumbCache.delete(file);
    throw err;
  });
  fileThumbCache.set(file, p);
  return p;
}

const THUMB_WIDTH = 240;

function decodeFrame(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    // iOS needs these to decode an off-screen muted video without a gesture.
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      fn();
    };

    const capture = () => {
      try {
        const w = THUMB_WIDTH;
        const ratio = video.videoWidth ? video.videoHeight / video.videoWidth : 1;
        const h = Math.max(1, Math.round(w * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable');
        ctx.drawImage(video, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        finish(() => resolve(dataUrl));
      } catch (err) {
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      }
    };

    video.onloadedmetadata = () => {
      // Seek a little past the start to avoid an all-black opening frame,
      // clamped so very short clips still land inside their duration.
      const target = Number.isFinite(video.duration)
        ? Math.min(0.5, video.duration / 2)
        : 0.1;
      try {
        video.currentTime = target;
      } catch {
        // Some decoders can't seek; grab whatever the first frame is.
        capture();
      }
    };
    video.onseeked = capture;
    video.onerror = () =>
      finish(() => reject(new Error('Video could not be decoded for a thumbnail')));

    // Safety net: a handful of codecs never fire onseeked. Bail after 8s so the
    // UI can drop back to the placeholder instead of spinning forever.
    const timer = window.setTimeout(
      () => finish(() => reject(new Error('Thumbnail generation timed out'))),
      8000,
    );

    video.src = url;
  });
}
