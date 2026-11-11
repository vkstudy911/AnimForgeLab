import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { RemotionAdapter, resolveNpxInvocation } from '../adapters/remotion.adapter.js';
import { ProcessRunner, SpawnedProcess } from '../adapters/process-runner.js';
import { ProjectConfig } from '../schemas/index.js';

const BASE_CONFIG: ProjectConfig = {
  name: 'Remotion Test',
  prompt: 'Render safe spaces',
  width: 1280,
  height: 720,
  fps: 30,
  preferredEngine: 'remotion',
};

function createFakeProc(): {
  proc: SpawnedProcess;
  stdout: Readable;
  stderr: Readable;
  killed: Array<NodeJS.Signals | undefined>;
} {
  const emitter = new EventEmitter();
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const killed: Array<NodeJS.Signals | undefined> = [];
  const proc: SpawnedProcess = Object.assign(emitter, {
    stdout,
    stderr,
    killed: false,
    kill(signal?: NodeJS.Signals) {
      killed.push(signal);
      (proc as { killed: boolean }).killed = true;
      return true;
    },
  });
  return { proc, stdout, stderr, killed };
}

async function closeFake(fake: ReturnType<typeof createFakeProc>, code: number | null): Promise<void> {
  const waitEnd = (stream: Readable) =>
    new Promise<void>((resolve) => {
      if (stream.readableEnded) {
        resolve();
        return;
      }
      stream.once('end', () => resolve());
    });
  const stderrEnded = waitEnd(fake.stderr);
  const stdoutEnded = waitEnd(fake.stdout);
  fake.stdout.push(null);
  fake.stderr.push(null);
  await Promise.all([stderrEnded, stdoutEnded]);
  fake.proc.emit('close', code, null);
}

test('resolveNpxInvocation avoids win32 .cmd shell:false EINVAL', () => {
  const posix = resolveNpxInvocation('darwin', '/usr/local/bin/node', () => false);
  assert.deepEqual(posix, { cmd: 'npx', prefixArgs: [] });

  const winWithCli = resolveNpxInvocation(
    'win32',
    'C:\\Program Files\\nodejs\\node.exe',
    (candidate: string) => candidate.endsWith('npx-cli.js')
  );
  assert.equal(winWithCli.cmd, 'C:\\Program Files\\nodejs\\node.exe');
  assert.equal(winWithCli.prefixArgs.length, 1);
  assert.ok(winWithCli.prefixArgs[0].endsWith('npx-cli.js'));
  assert.ok(!winWithCli.cmd.endsWith('.cmd'));
});

test('RemotionAdapter invokes npx without shell interpolation, drains stdout, and handles failure/dispose', async () => {
  const tmpParent = await fs.mkdtemp(path.join(os.tmpdir(), 'af rm '));
  const workspaceTrailing = path.join(tmpParent, 'ws rm ');
  await fs.mkdir(path.join(workspaceTrailing, 'projects'), { recursive: true });

  const execCalls: Array<{ cmd: string; args: string[]; cwd?: string }> = [];
  const spawnCalls: Array<{ cmd: string; args: string[]; cwd?: string }> = [];
  let activeFake: ReturnType<typeof createFakeProc> | null = null;

  const runner: ProcessRunner = {
    async execFile(cmd, args, opts) {
      execCalls.push({ cmd, args, cwd: opts?.cwd });
      return { stdout: '4.0.260\n', stderr: '', exitCode: 0 };
    },
    spawnProcess(cmd, args, opts) {
      spawnCalls.push({ cmd, args, cwd: opts?.cwd });
      activeFake = createFakeProc();
      return activeFake.proc;
    },
  };

  try {
    const adapter = new RemotionAdapter(workspaceTrailing, runner);
    await adapter.initialize();
    assert.ok(execCalls[0].args.includes('--version'));

    const projectId = await adapter.createProject('proj_rm_safe', BASE_CONFIG);
    const projectDir = path.join(workspaceTrailing, 'projects', projectId);
    const job = await adapter.render(projectId);

    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0].cwd, projectDir);
    assert.deepEqual(spawnCalls[0].args.slice(-5), [
      'remotion',
      'render',
      'src/index.ts',
      'Main',
      path.join(projectDir, 'output.mp4'),
    ]);

    const okFake = activeFake!;
    okFake.stdout.push('bundle ' + 'y'.repeat(100 * 1024) + '\n');
    await closeFake(okFake, 0);

    const status = await adapter.getRenderStatus(job.id);
    assert.equal(status.status, 'completed');
    assert.equal(status.progress, 100);

    // Non-zero exit preserves stderr message
    const failJob = await adapter.render(projectId);
    const failFake = activeFake!;
    failFake.stderr.push('Missing Chrome headless');
    await closeFake(failFake, 1);
    const failStatus = await adapter.getRenderStatus(failJob.id);
    assert.equal(failStatus.status, 'failed');
    assert.ok(failStatus.error?.includes('Missing Chrome headless'));

    // dispose() sends SIGTERM to active render and error+close race stays failed
    const killJob = await adapter.render(projectId);
    const killFake = activeFake!;
    await adapter.dispose();
    assert.deepEqual(killFake.killed, ['SIGTERM']);
    killFake.proc.emit('error', new Error('ENOENT npx'));
    await closeFake(killFake, 0);
    const killStatus = await adapter.getRenderStatus(killJob.id);
    assert.equal(killStatus.status, 'failed');
    assert.ok(killStatus.error?.includes('ENOENT npx'));
  } finally {
    await fs.rm(tmpParent, { recursive: true, force: true });
  }
});
