import { useState } from 'react';
import { ExternalLink, Video } from 'lucide-react';
import type { SessionVideo } from '../types';
import { fmtBytes } from '../utils/format';

/**
 * Square thumbnail for an uploaded video. Uses the stored thumbnail if present,
 * otherwise Drive's on-the-fly thumbnail, falling back to a video glyph.
 */
export function VideoThumb({ video }: { video: SessionVideo }) {
  const [errored, setErrored] = useState(false);
  const src =
    video.driveThumbnailUrl ??
    `https://drive.google.com/thumbnail?id=${video.driveFileId}&sz=w200`;
  return (
    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
      {src && !errored ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <Video className="h-6 w-6 text-indigo-500" />
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
