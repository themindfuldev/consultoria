import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Video } from 'lucide-react';
import type { SessionVideo } from '../types';
import { fmtBytes } from '../utils/format';
import {
  generateVideoThumbnail,
  getUploadedThumbnail,
} from '../utils/videoThumbnails';

/** Shared 64px thumbnail frame. */
const THUMB_FRAME =
  'flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-indigo-50 dark:bg-indigo-900/30';

/** Small inline spinner, matching the app's LoadingSpinner style. */
function ThumbSpinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
  );
}

/** Placeholder glyph shown when no thumbnail can be produced. */
function ThumbFallback() {
  return <Video className="h-6 w-6 text-indigo-500" />;
}

/** How many times to (re)try a Drive thumbnail before giving up. Drive often
 *  hasn't finished generating one in the seconds right after an upload. */
const MAX_DRIVE_ATTEMPTS = 4;

/**
 * Square thumbnail for an uploaded video.
 *
 * Prefers a locally-generated frame when the video was just uploaded this
 * session (instant, no network). Otherwise loads Google Drive's thumbnail,
 * showing a spinner while it loads and retrying a few times with backoff before
 * dropping to the placeholder glyph — Drive's thumbnail is frequently not ready
 * immediately after upload.
 */
export function VideoThumb({ video }: { video: SessionVideo }) {
  const local = getUploadedThumbnail(video.driveFileId);
  const baseSrc =
    video.driveThumbnailUrl ??
    `https://drive.google.com/thumbnail?id=${video.driveFileId}&sz=w200`;

  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const retryTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
    },
    [],
  );

  // Just-uploaded video: use the frame we already have in memory.
  if (local) {
    return (
      <div className={THUMB_FRAME}>
        <img src={local} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  // Cache-bust each retry so the browser actually refetches.
  const src =
    attempt === 0
      ? baseSrc
      : `${baseSrc}${baseSrc.includes('?') ? '&' : '?'}_r=${attempt}`;

  const handleError = () => {
    if (attempt < MAX_DRIVE_ATTEMPTS) {
      const delay = 1000 * 2 ** attempt; // 1s, 2s, 4s, 8s
      setStatus('loading');
      retryTimer.current = window.setTimeout(
        () => setAttempt((a) => a + 1),
        delay,
      );
    } else {
      setStatus('error');
    }
  };

  return (
    <div className={THUMB_FRAME}>
      {status !== 'error' && (
        <img
          key={src}
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          onLoad={() => setStatus('loaded')}
          onError={handleError}
          className={`h-full w-full object-cover ${status === 'loaded' ? '' : 'hidden'}`}
        />
      )}
      {status === 'loading' && <ThumbSpinner />}
      {status === 'error' && <ThumbFallback />}
    </div>
  );
}

/**
 * Square thumbnail for a *local* video file that hasn't been uploaded yet
 * (used in the upload sheet). Shows a spinner while the frame is decoded and
 * falls back to the placeholder glyph if decoding fails.
 */
export function LocalVideoThumb({ file }: { file: File }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    generateVideoThumbnail(file)
      .then((dataUrl) => {
        if (active) setSrc(dataUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [file]);

  return (
    <div className={THUMB_FRAME}>
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : failed ? (
        <ThumbFallback />
      ) : (
        <ThumbSpinner />
      )}
    </div>
  );
}

/**
 * Read-only uploaded-video card: thumbnail on the left, a full-width title on
 * the first line, and the size line pinned to the top-left of the remaining
 * space with the "open" action pinned to the bottom-right.
 */
export function ReadOnlyVideoCard({
  video,
  title,
}: {
  video: SessionVideo;
  title?: string;
}) {
  return (
    <div className="glass-premium flex items-stretch gap-3 rounded-xl p-3">
      <VideoThumb video={video} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-sm font-medium text-slate-800 dark:text-white">
          {title ?? video.exerciseName ?? 'Vídeo geral'}
        </p>
        <div className="flex flex-1 items-end justify-between gap-2">
          <p className="self-start text-xs text-slate-500 dark:text-slate-400">
            {fmtBytes(video.compressedSizeMB)}
            {video.originalSizeMB > 0 &&
              ` (original: ${fmtBytes(video.originalSizeMB)})`}
          </p>
          <a
            href={video.driveFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir vídeo"
            className="flex-shrink-0 rounded-lg p-2 text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
