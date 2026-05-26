/**
 * useVideoCompress
 *
 * Lazily loads the ffmpeg.wasm Web Worker and exposes a compress() function.
 * The WASM binary (~10 MB) is fetched from unpkg CDN on first use and cached
 * by the browser thereafter.
 *
 * Returns:
 *   compress(file, onProgress?) → Promise<{ buffer: ArrayBuffer; compressedSizeMB: number }>
 *   compressing: boolean
 */

import { useCallback, useRef, useState } from 'react';

export interface CompressResult {
  buffer: ArrayBuffer;
  compressedSizeMB: number;
}

export function useVideoCompress() {
  const workerRef = useRef<Worker | null>(null);
  const [compressing, setCompressing] = useState(false);

  const compress = useCallback(
    (
      file: File,
      onProgress?: (progress: number) => void,
    ): Promise<CompressResult> => {
      return new Promise((resolve, reject) => {
        setCompressing(true);

        // Lazy-instantiate worker once per hook instance.
        if (!workerRef.current) {
          workerRef.current = new Worker(
            new URL('../workers/compress.worker.ts', import.meta.url),
            { type: 'module' },
          );
        }

        const worker = workerRef.current;

        worker.onmessage = ({
          data,
        }: MessageEvent<
          | { type: 'progress'; progress: number }
          | { type: 'done'; buffer: ArrayBuffer }
          | { type: 'error'; message: string }
        >) => {
          if (data.type === 'progress') {
            onProgress?.(data.progress);
          } else if (data.type === 'done') {
            setCompressing(false);
            resolve({
              buffer: data.buffer,
              compressedSizeMB: data.buffer.byteLength / 1_048_576,
            });
          } else {
            setCompressing(false);
            reject(new Error(data.message));
          }
        };

        worker.onerror = (e) => {
          setCompressing(false);
          reject(new Error(e.message));
        };

        worker.postMessage({ file });
      });
    },
    [],
  );

  return { compress, compressing };
}
