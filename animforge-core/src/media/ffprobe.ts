import { ProcessRunner } from '../../adapters/process-runner.js';

export interface FfprobeMetadata {
  formatName: string | null;
  durationSeconds: number | null;
  codec: string | null;
  width: number | null;
  height: number | null;
  fps: number | undefined;
  hasVideoStream: boolean;
  hasAudioStream: boolean;
}

export class FfprobeError extends Error {
  constructor(
    readonly kind: 'MISSING_BINARY' | 'EXECUTION_FAILED' | 'INVALID_MEDIA',
    message: string
  ) {
    super(message);
    this.name = 'FfprobeError';
  }
}

function parseFrameRate(rate: unknown): number | undefined {
  if (typeof rate !== 'string' || !rate.includes('/')) return undefined;
  const [numStr, denStr] = rate.split('/');
  const num = Number(numStr);
  const den = Number(denStr);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return undefined;
  return Math.round((num / den) * 100) / 100;
}

export async function probeVideo(
  videoPath: string,
  runner: ProcessRunner
): Promise<FfprobeMetadata> {
  let res;
  try {
    res = await runner.execFile('ffprobe', [
      '-v',
      'error',
      '-show_format',
      '-show_streams',
      '-of',
      'json',
      videoPath,
    ]);
  } catch (err: unknown) {
    const errno = (err as NodeJS.ErrnoException | undefined)?.code;
    if (errno === 'ENOENT') {
      throw new FfprobeError('MISSING_BINARY', 'ffprobe binary is not available on PATH');
    }
    throw new FfprobeError(
      'EXECUTION_FAILED',
      `ffprobe failed to execute: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (res.exitCode !== 0) {
    throw new FfprobeError(
      'EXECUTION_FAILED',
      `ffprobe failed: ${res.stderr.trim() || res.stdout.trim() || `exit ${res.exitCode}`}`
    );
  }

  let parsed: {
    format?: { format_name?: string; duration?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
    }>;
  };
  try {
    parsed = JSON.parse(res.stdout) as typeof parsed;
  } catch {
    throw new FfprobeError('INVALID_MEDIA', 'ffprobe returned invalid JSON output');
  }

  const streams = parsed.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');
  const rawDuration = parsed.format?.duration ? Number(parsed.format.duration) : undefined;
  const durationSeconds =
    rawDuration !== undefined && Number.isFinite(rawDuration) ? rawDuration : null;

  return {
    formatName: parsed.format?.format_name ?? null,
    durationSeconds,
    codec: videoStream?.codec_name ?? null,
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
    fps: parseFrameRate(videoStream?.r_frame_rate),
    hasVideoStream: Boolean(videoStream),
    hasAudioStream: Boolean(audioStream),
  };
}
