import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

self.onmessage = async ({ data }: MessageEvent<{ file: File }>) => {
  try {
    await ffmpeg.load({
      coreURL: await toBlobURL(
        'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
        'text/javascript',
      ),
      wasmURL: await toBlobURL(
        'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
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
      '-preset', 'fast',
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
