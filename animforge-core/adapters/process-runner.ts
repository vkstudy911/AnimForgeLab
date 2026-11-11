import { execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SpawnedProcess extends EventEmitter {
  readonly stdout: Readable | null;
  readonly stderr: Readable | null;
  readonly killed: boolean;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface ProcessRunner {
  execFile(
    cmd: string,
    args: string[],
    opts?: { cwd?: string; timeoutMs?: number }
  ): Promise<ExecResult>;
  spawnProcess(
    cmd: string,
    args: string[],
    opts?: { cwd?: string }
  ): SpawnedProcess;
}

type ExecFileError = NodeJS.ErrnoException & { killed?: boolean; signal?: string | null };

export function createNodeProcessRunner(): ProcessRunner {
  return {
    execFile(cmd, args, opts) {
      return new Promise((resolve, reject) => {
        execFile(
          cmd,
          args,
          {
            cwd: opts?.cwd,
            shell: false,
            maxBuffer: 10 * 1024 * 1024,
            timeout: opts?.timeoutMs,
          },
          (err, stdout, stderr) => {
            const out = typeof stdout === 'string' ? stdout : String(stdout);
            const errText = typeof stderr === 'string' ? stderr : String(stderr);
            if (!err) {
              resolve({ stdout: out, stderr: errText, exitCode: 0 });
              return;
            }
            const execErr = err as ExecFileError;
            if (typeof execErr.code === 'number' && !execErr.killed) {
              resolve({ stdout: out, stderr: errText, exitCode: execErr.code });
              return;
            }
            reject(
              new Error(
                `${cmd} failed: ${execErr.message}${errText ? ` (${errText.trim()})` : ''}`
              )
            );
          }
        );
      });
    },
    spawnProcess(cmd, args, opts) {
      return spawn(cmd, args, {
        cwd: opts?.cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    },
  };
}
