/**
 * webcodecs.worker.ts
 *
 * Compresses a video using the browser's hardware H.264 encoder via WebCodecs,
 * with mediabunny handling demuxing, muxing and the encode pipeline.
 *
 * This is the fast path. ffmpeg.wasm (compress.worker.ts) encodes in software
 * and takes minutes on a phone; the hardware encoder takes seconds. The hook
 * tries this worker first and falls back to ffmpeg whenever this one reports
 * `unsupported` — see useVideoCompress.
 *
 * Audio is passed through, never re-encoded: mediabunny copies the encoded
 * samples straight from input to output when the codec already fits the MP4
 * container. That's faster and lossless, and it's also what makes this work on
 * iOS 16.4–18.7, which ships WebCodecs' video interfaces but no AudioEncoder.
 * If the source audio ever does need re-encoding we bail to ffmpeg rather than
 * ship a silent video.
 */

import {
  BlobSource,
  BufferTarget,
  canEncodeVideo,
  Conversion,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  Quality,
  WEBM,
} from 'mediabunny';

/**
 * Only the containers a phone or desktop actually hands us from a file picker:
 * MP4 and QuickTime/MOV (iOS), Matroska and WebM (Android, desktop capture).
 * Listing them instead of `ALL_FORMATS` keeps the MP3/Ogg/FLAC/HLS demuxers out
 * of the bundle — worth ~300 kB in this worker's chunk. Anything else falls
 * through to the ffmpeg path, which reads far more formats anyway.
 */
const INPUT_FORMATS = [MP4, QTFF, MATROSKA, WEBM];

/** Cap on the output's height, matching the ffmpeg path's `scale=-2:720`. */
const TARGET_HEIGHT = 720;

/**
 * WebCodecs has no CRF equivalent, so quality is expressed as a target bitrate.
 * 2.5 Mbps at 720p holds up on the fast movement in lifting footage, where a
 * lower rate would smear exactly the detail the trainer is looking at.
 */
const TARGET_BITRATE = 2_500_000;

/**
 * Timing and source facts for one compress, reported on success. Temporary
 * diagnostic: the encode is running on hardware but slower than an iPhone
 * should manage, and this narrows down where the time actually goes.
 */
export interface CompressStats {
  srcWidth: number;
  srcHeight: number;
  srcFps: number;
  srcCodec: string;
  outHeight: number;
  /** Milliseconds spent checking codec support before any file work. */
  probeMs: number;
  /** Milliseconds spent reading the container and sampling packet stats. */
  inspectMs: number;
  /** Milliseconds spent in the decode → scale → encode → mux pipeline. */
  convertMs: number;
  totalMs: number;
}

type Outbound =
  | { type: 'progress'; progress: number }
  | { type: 'done'; buffer: ArrayBuffer; stats: CompressStats }
  | { type: 'unsupported'; reason: string }
  | { type: 'error'; message: string };

function post(message: Outbound, transfer?: Transferable[]) {
  if (transfer) self.postMessage(message, { transfer });
  else self.postMessage(message);
}

self.onmessage = async ({ data }: MessageEvent<{ file: File }>) => {
  // Accumulated as we learn about the input, and appended to whatever reason we
  // bail out with. Without it a fallback on a real phone tells us only *that*
  // we fell back, not what about the file caused it.
  let context = '';
  const t0 = performance.now();
  // Assigned as each phase completes; only read on the success path, which is
  // reached strictly after both.
  let tProbeDone: number;
  let tInspectDone: number;

  try {
    if (typeof VideoEncoder === 'undefined') {
      post({ type: 'unsupported', reason: 'WebCodecs VideoEncoder unavailable' });
      return;
    }

    // Must be the object form: `new Quality(n)` treats a bare number as a
    // qualitative 0–1 level, so a bitrate passed that way overflows to an
    // infinite bitrate and VideoEncoder rejects the config outright.
    const quality = new Quality({ bitrate: TARGET_BITRATE });

    // Ask before building anything: a browser can expose VideoEncoder and still
    // refuse this configuration.
    if (!(await canEncodeVideo('avc', { height: TARGET_HEIGHT, quality }))) {
      post({ type: 'unsupported', reason: 'H.264 encoding not supported' });
      return;
    }

    const input = new Input({
      source: new BlobSource(data.file),
      formats: INPUT_FORMATS,
    });

    context = ` [${data.file.type || 'no mime'}]`;

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      post({ type: 'unsupported', reason: `no video track${context}` });
      return;
    }

    // Display dimensions, not coded ones — phone footage carries rotation
    // metadata, and we want the height as the viewer will see it.
    tProbeDone = performance.now();

    const displayHeight = await videoTrack.getDisplayHeight();
    const displayWidth = await videoTrack.getDisplayWidth();
    const audioTrack = await input.getPrimaryAudioTrack();

    // Sampled rather than exhaustive — scanning every packet of a 120 MB file
    // would itself cost seconds and distort what we're trying to measure.
    const packetStats = await videoTrack.computePacketStats(50);

    tInspectDone = performance.now();

    context =
      ` [${data.file.type || 'no mime'}` +
      ` ${displayWidth}x${displayHeight}` +
      ` v:${videoTrack.codec ?? 'unknown'}` +
      ` a:${audioTrack ? (audioTrack.codec ?? 'unknown') : 'none'}]`;

    // Decodability is checked separately from encodability: an iPhone shooting
    // in "High Efficiency" hands us HEVC, and a browser that can encode H.264
    // may still not decode what it's being given.
    if (!(await videoTrack.canDecode())) {
      post({ type: 'unsupported', reason: `video not decodable${context}` });
      return;
    }

    const output = new Output({
      format: new Mp4OutputFormat({
        // Equivalent of ffmpeg's `-movflags +faststart`: puts the moov box up
        // front so Drive can start playback without the whole file.
        fastStart: 'in-memory',
      }),
      target: new BufferTarget(),
    });

    const conversion = await Conversion.init({
      input,
      output,
      video: {
        codec: 'avc',
        quality,
        // Only ever scale down. Setting height unconditionally would upscale
        // already-small clips, costing bytes and gaining nothing.
        ...(displayHeight > TARGET_HEIGHT ? { height: TARGET_HEIGHT } : {}),
      },
      // No `audio` options on purpose — that leaves forceTranscode off, so the
      // encoded audio is copied rather than run through an AudioEncoder.
    });

    if (!conversion.isValid) {
      const why = conversion.discardedTracks
        .map((t) => `${t.track.type}:${t.reason}`)
        .join(', ');
      post({
        type: 'unsupported',
        reason: `conversion invalid (${why || 'no reason given'})${context}`,
      });
      return;
    }

    // A dropped audio track would mean mediabunny couldn't carry the source
    // audio across — usually no encodable target codec. Hand off to ffmpeg
    // instead of silently uploading a video with no sound.
    const droppedAudio = conversion.discardedTracks.find(
      (t) => t.track.type === 'audio',
    );
    if (droppedAudio) {
      post({
        type: 'unsupported',
        reason: `audio discarded: ${droppedAudio.reason}${context}`,
      });
      return;
    }

    conversion.onProgress = (progress: number) => {
      post({ type: 'progress', progress });
    };

    const tConvertStart = performance.now();
    await conversion.execute();
    const tEnd = performance.now();

    const buffer = output.target.buffer;
    if (!buffer) {
      post({ type: 'error', message: 'conversion produced no output' });
      return;
    }

    post(
      {
        type: 'done',
        buffer,
        stats: {
          srcWidth: displayWidth,
          srcHeight: displayHeight,
          srcFps: Math.round(packetStats.averagePacketRate * 10) / 10,
          srcCodec: videoTrack.codec ?? 'unknown',
          outHeight: Math.min(displayHeight, TARGET_HEIGHT),
          probeMs: Math.round(tProbeDone - t0),
          inspectMs: Math.round(tInspectDone - tProbeDone),
          convertMs: Math.round(tEnd - tConvertStart),
          totalMs: Math.round(tEnd - t0),
        },
      },
      [buffer],
    );
  } catch (err) {
    // Report as unsupported rather than error: ffmpeg.wasm tolerates a wider
    // range of inputs, so it's worth letting it try before failing the upload.
    post({ type: 'unsupported', reason: `${String(err)}${context}` });
  }
};
