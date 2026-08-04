/**
 * useVideoCompress
 *
 * Compresses a video to 720p H.264 and exposes a compress() function.
 *
 * Two paths, tried in order:
 *
 *   1. WebCodecs (webcodecs.worker.ts) — the browser's hardware H.264 encoder,
 *      driven by mediabunny. Takes seconds. Needs Chrome/Edge 94+, or iOS 16.4+
 *      on any iOS browser (they're all WebKit, so Chrome on iOS tracks the iOS
 *      version rather than the Chrome version).
 *
 *   2. ffmpeg.wasm (compress.worker.ts) — software encoding, minutes on a
 *      phone. The fallback for older browsers, and for inputs the WebCodecs
 *      path won't take. Its ~10 MB WASM binary is only fetched if we get here,
 *      so devices on the fast path never pay for it.
 *
 * The WebCodecs worker reports `unsupported` rather than throwing whenever it
 * can't produce a faithful result, which is what triggers the fallback.
 *
 * Returns:
 *   compress(file, onProgress?) → Promise<{ buffer: ArrayBuffer; compressedSizeMB: number }>
 *   compressing: boolean
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { CompressStats } from '../workers/webcodecs.worker';

export interface CompressResult {
  buffer: ArrayBuffer;
  compressedSizeMB: number;
  /** Present only when the hardware path ran. Temporary diagnostic. */
  stats?: CompressStats;
}

type FfmpegMessage =
  | { type: 'progress'; progress: number }
  | { type: 'done'; buffer: ArrayBuffer }
  | { type: 'error'; message: string };

type WebCodecsMessage =
  | { type: 'progress'; progress: number }
  | { type: 'done'; buffer: ArrayBuffer; stats: CompressStats }
  | { type: 'unsupported'; reason: string }
  | { type: 'error'; message: string };

/** Raised by the WebCodecs attempt to signal "try ffmpeg instead". */
class UnsupportedError extends Error {}

export function useVideoCompress() {
  const webCodecsRef = useRef<Worker | null>(null);
  const ffmpegRef = useRef<Worker | null>(null);
  const [compressing, setCompressing] = useState(false);

  // Workers outlive a single compress() call so a batch upload reuses one
  // instance — which for ffmpeg also means loading its WASM only once.
  useEffect(() => {
    return () => {
      webCodecsRef.current?.terminate();
      ffmpegRef.current?.terminate();
      webCodecsRef.current = null;
      ffmpegRef.current = null;
    };
  }, []);

  const runWebCodecs = useCallback(
    (
      file: File,
      onProgress?: (progress: number) => void,
    ): Promise<{ buffer: ArrayBuffer; stats: CompressStats }> => {
      return new Promise((resolve, reject) => {
        if (!webCodecsRef.current) {
          webCodecsRef.current = new Worker(
            new URL('../workers/webcodecs.worker.ts', import.meta.url),
            { type: 'module' },
          );
        }
        const worker = webCodecsRef.current;

        worker.onmessage = ({ data }: MessageEvent<WebCodecsMessage>) => {
          if (data.type === 'progress') {
            onProgress?.(data.progress);
          } else if (data.type === 'done') {
            resolve({ buffer: data.buffer, stats: data.stats });
          } else if (data.type === 'unsupported') {
            reject(new UnsupportedError(data.reason));
          } else {
            reject(new Error(data.message));
          }
        };
        // A worker-level failure (module didn't load, mediabunny threw outside
        // the handler) is still worth falling back on.
        worker.onerror = (e) => reject(new UnsupportedError(e.message));

        worker.postMessage({ file });
      });
    },
    [],
  );

  const runFfmpeg = useCallback(
    (file: File, onProgress?: (progress: number) => void): Promise<ArrayBuffer> => {
      return new Promise((resolve, reject) => {
        if (!ffmpegRef.current) {
          ffmpegRef.current = new Worker(
            new URL('../workers/compress.worker.ts', import.meta.url),
            { type: 'module' },
          );
        }
        const worker = ffmpegRef.current;

        worker.onmessage = ({ data }: MessageEvent<FfmpegMessage>) => {
          if (data.type === 'progress') {
            onProgress?.(data.progress);
          } else if (data.type === 'done') {
            resolve(data.buffer);
          } else {
            reject(new Error(data.message));
          }
        };
        worker.onerror = (e) => reject(new Error(e.message));

        worker.postMessage({ file });
      });
    },
    [],
  );

  const compress = useCallback(
    async (
      file: File,
      onProgress?: (progress: number) => void,
      /**
       * Called with the reason when the WebCodecs path bails and ffmpeg takes
       * over. Surfaced in the UI because iOS browsers give no reachable
       * console, and "which encoder ran" is the difference between a
       * seconds-long compress and a minutes-long one.
       */
      onFallback?: (reason: string) => void,
    ): Promise<CompressResult> => {
      setCompressing(true);
      try {
        let buffer: ArrayBuffer;
        let stats: CompressStats | undefined;
        try {
          ({ buffer, stats } = await runWebCodecs(file, onProgress));
        } catch (err) {
          if (!(err instanceof UnsupportedError)) throw err;
          console.info('WebCodecs path unavailable, using ffmpeg:', err.message);
          onFallback?.(err.message);
          // Reset progress: the fallback restarts from zero, and leaving the
          // bar wherever WebCodecs stopped would read as a stall.
          onProgress?.(0);
          buffer = await runFfmpeg(file, onProgress);
        }
        return { buffer, compressedSizeMB: buffer.byteLength / 1_048_576, stats };
      } finally {
        setCompressing(false);
      }
    },
    [runWebCodecs, runFfmpeg],
  );

  return { compress, compressing };
}
