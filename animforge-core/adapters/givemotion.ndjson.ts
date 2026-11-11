import { StringDecoder } from 'node:string_decoder';

export interface GiveMotionDoctorReport {
  node: string | null;
  chrome: string | null;
  ffmpeg: string | null;
  chromeOk: boolean;
  ffmpegOk: boolean;
  raw: string;
}

export type GiveMotionProgressPhase = 'open' | 'frames' | 'encode' | 'done';

export interface GiveMotionProgressEvent {
  event: 'progress';
  phase: GiveMotionProgressPhase;
  done?: number;
  total?: number;
  fps?: number;
  eta?: number | null;
}

export type GiveMotionStderrEvent =
  | GiveMotionProgressEvent
  | { event: 'log'; message: string }
  | { event: 'warning'; code?: string; message: string }
  | { event: 'error'; message: string };

export function parseDoctorStdout(stdout: string): GiveMotionDoctorReport {
  let node: string | null = null;
  let chrome: string | null = null;
  let ffmpeg: string | null = null;

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = /^(node|chrome|ffmpeg)\s+(.+)$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (key === 'node') node = value.trim();
    else if (key === 'chrome') chrome = value.trim();
    else if (key === 'ffmpeg') ffmpeg = value.trim();
  }

  return {
    node,
    chrome,
    ffmpeg,
    chromeOk: Boolean(chrome && !/not found/i.test(chrome)),
    ffmpegOk: Boolean(ffmpeg && !/not found/i.test(ffmpeg)),
    raw: stdout,
  };
}

export function progressPercent(ev: GiveMotionProgressEvent): number {
  switch (ev.phase) {
    case 'open':
      return 2;
    case 'frames': {
      if (
        typeof ev.total === 'number' &&
        typeof ev.done === 'number' &&
        Number.isFinite(ev.total) &&
        Number.isFinite(ev.done) &&
        ev.total > 0
      ) {
        return Math.round(Math.min(90, Math.max(5, 5 + (ev.done / ev.total) * 85)));
      }
      return 5;
    }
    case 'encode':
      return 95;
    case 'done':
      return 100;
  }
}

function isPhase(v: unknown): v is GiveMotionProgressPhase {
  return v === 'open' || v === 'frames' || v === 'encode' || v === 'done';
}

function parseStderrEvent(line: string): GiveMotionStderrEvent | null {
  if (!line.startsWith('{')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const rec = parsed as Record<string, unknown>;

  if (rec.event === 'progress' && isPhase(rec.phase)) {
    return {
      event: 'progress',
      phase: rec.phase,
      done: typeof rec.done === 'number' ? rec.done : undefined,
      total: typeof rec.total === 'number' ? rec.total : undefined,
      fps: typeof rec.fps === 'number' ? rec.fps : undefined,
      eta: typeof rec.eta === 'number' || rec.eta === null ? rec.eta : undefined,
    };
  }
  if (rec.event === 'log' && typeof rec.message === 'string') {
    return { event: 'log', message: rec.message };
  }
  if (rec.event === 'warning' && typeof rec.message === 'string') {
    return {
      event: 'warning',
      code: typeof rec.code === 'string' ? rec.code : undefined,
      message: rec.message,
    };
  }
  if (rec.event === 'error' && typeof rec.message === 'string') {
    return { event: 'error', message: rec.message };
  }

  return null;
}

export interface NdjsonLineParser {
  push(chunk: Buffer | string): void;
  flush(): void;
}

export function createNdjsonLineParser(
  onEvent: (event: GiveMotionStderrEvent) => void,
  onTextLine?: (line: string) => void
): NdjsonLineParser {
  const decoder = new StringDecoder('utf8');
  let remainder = '';

  function emitLine(rawLine: string): void {
    const trimmed = rawLine.replace(/\r$/, '').trim();
    if (!trimmed) return;
    const ev = parseStderrEvent(trimmed);
    if (ev) {
      onEvent(ev);
    } else {
      onTextLine?.(trimmed);
    }
  }

  function drainLines(): void {
    let idx = remainder.indexOf('\n');
    while (idx !== -1) {
      const line = remainder.slice(0, idx);
      remainder = remainder.slice(idx + 1);
      emitLine(line);
      idx = remainder.indexOf('\n');
    }
  }

  return {
    push(chunk) {
      remainder += typeof chunk === 'string' ? chunk : decoder.write(chunk);
      drainLines();
    },
    flush() {
      remainder += decoder.end();
      drainLines();
      if (remainder.length > 0) {
        const tail = remainder;
        remainder = '';
        emitLine(tail);
      }
    },
  };
}
