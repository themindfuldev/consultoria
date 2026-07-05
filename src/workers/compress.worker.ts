import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

self.onmessage = async ({ data }: MessageEvent<{ file: File }>) => {
  try {
    // NOTE: must use the ESM build, not UMD. The worker is created with
    // `{ type: 'module' }`, so `importScripts()` is unavailable inside it;
    // @ffmpeg/ffmpeg falls back to a dynamic `import()` of the core script,
    // which requires an ES module with `export default` (the UMD build only
    // assigns a global `var createFFmpegCore`, causing ERROR_IMPORT_FAILURE).
    await ffmpeg.load({
      coreURL: await toBlobURL(
        'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
        'text/javascript',
      ),
      wasmURL: await toBlobURL(
        'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
        'application/wasm',
      ),
    });

    ffmpeg.on('progress', ({ progress }: { progress: number }) => {
      self.postMessage({ type: 'progress', progress });
    });

    await ffmpeg.writeFile('input', await fetchFile(data.file));
    await ffmpeg.exec([
      '-i', 'input',
      '-vf', 'scale=-2:720',
      '-c:v', 'libx264',
      '-crf', '28',
      '-preset', 'superfast',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      'output.mp4',
    ]);

    const output = await ffmpeg.readFile('output.mp4');
    const buffer = (output as Uint8Array).buffer;
    self.postMessage({ type: 'done', buffer }, { transfer: [buffer] });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
