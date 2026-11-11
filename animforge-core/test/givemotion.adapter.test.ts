import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { GivemotionAdapter } from '../adapters/givemotion.adapter.js';
import {
  createNdjsonLineParser,
  GiveMotionStderrEvent,
  parseDoctorStdout,
  progressPercent,
} from '../adapters/givemotion.ndjson.js';
import { ProcessRunner, SpawnedProcess } from '../adapters/process-runner.js';
import { ProjectConfig } from '../schemas/index.js';
import { RenderProgressUpdate } from '../adapters/adapter.interface.js';

const BASE_CONFIG: ProjectConfig = {
  name: 'Pip Wave Story',
  prompt: 'Pip waves at the viewer',
  width: 1280,
  height: 720,
  fps: 30,
  preferredEngine: 'givemotion',
};

function createFakeSpawn(): {
  proc: SpawnedProcess;
  stdout: Readable;
  stderr: Readable;
  killedSignals: Array<NodeJS.Signals | undefined>;
} {
  const emitter = new EventEmitter();
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const killedSignals: Array<NodeJS.Signals | undefined> = [];

  const proc: SpawnedProcess = Object.assign(emitter, {
    stdout,
    stderr,
    killed: false,
    kill(signal?: NodeJS.Signals) {
      killedSignals.push(signal);
      (proc as { killed: boolean }).killed = true;
      return true;
    },
  });

  return { proc, stdout, stderr, killedSignals };
}

async function closeFakeSpawn(
  fake: { proc: SpawnedProcess; stdout: Readable; stderr: Readable },
  code: number | null,
  signal: NodeJS.Signals | null = null
): Promise<void> {
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
  fake.stderr.push(null);
  fake.stdout.push(null);
  await Promise.all([stderrEnded, stdoutEnded]);
  fake.proc.emit('close', code, signal);
}

test('parseDoctorStdout parses chrome, ffmpeg, and missing dependency lines cleanly', () => {
  const okOutput = [
    'node        v24.19.0',
    'chrome      /Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'ffmpeg      9.0.1  encoders: libx264',
    'encoder     software (x264)',
  ].join('\n');

  const ok = parseDoctorStdout(okOutput);
  assert.equal(ok.node, 'v24.19.0');
  assert.equal(ok.chromeOk, true);
  assert.equal(ok.ffmpegOk, true);

  const missingOutput = [
    'node        v24.19.0',
    'chrome      not found -> run npx givemotion install',
    'ffmpeg      not found -> install ffmpeg',
  ].join('\n');

  const missing = parseDoctorStdout(missingOutput);
  assert.equal(missing.chromeOk, false);
  assert.equal(missing.ffmpegOk, false);
});

test('createNdjsonLineParser decodes split chunks, partial lines, noise, and progressPercent', () => {
  const events: GiveMotionStderrEvent[] = [];
  const noise: string[] = [];
  const parser = createNdjsonLineParser(
    (ev) => events.push(ev),
    (line) => noise.push(line)
  );

  // Split JSON across 3 chunks + mix plain stderr noise + CR/LF
  parser.push('non-json startup note\n{"event":"pro');
  parser.push('gress","phase":"frames","done":15,"tota');
  parser.push('l":30,"fps":12.5,"eta":1.2}\r\n{"event":"error","message":"boom"');
  assert.equal(events.length, 1);
  assert.equal(noise.length, 1);

  parser.push('}\n{"event":"progress","phase":"done"}');
  parser.flush();

  assert.equal(events.length, 3);
  assert.equal(events[0].event, 'progress');
  if (events[0].event === 'progress') {
    assert.equal(progressPercent(events[0]), 48);
  }
  assert.equal(events[1].event, 'error');
  if (events[2].event === 'progress') {
    assert.equal(progressPercent(events[2]), 100);
  }

  assert.equal(progressPercent({ event: 'progress', phase: 'open' }), 2);
  assert.equal(progressPercent({ event: 'progress', phase: 'encode' }), 95);
  assert.equal(progressPercent({ event: 'progress', phase: 'frames', done: Number.NaN, total: 10 }), 5);
  assert.equal(progressPercent({ event: 'progress', phase: 'frames', done: 5, total: Number.POSITIVE_INFINITY }), 5);
});

test('GivemotionAdapter uses shell-free arg arrays, writes givemotion.json & index.html, handles check/bundle & chunked render', async () => {
  const tmpParent = await fs.mkdtemp(path.join(os.tmpdir(), 'af gm '));
  const workspaceTrailing = path.join(tmpParent, 'ws trailing ');
  await fs.mkdir(path.join(workspaceTrailing, 'projects'), { recursive: true });

  const execCalls: Array<{ cmd: string; args: string[]; cwd?: string }> = [];
  const spawnCalls: Array<{ cmd: string; args: string[]; cwd?: string }> = [];
  let activeFake: ReturnType<typeof createFakeSpawn> | null = null;
  let checkShouldFailQa = false;
  let doctorExitCode = 0;
  let doctorStderr = '';

  const fakeRunner: ProcessRunner = {
    async execFile(cmd, args, opts) {
      execCalls.push({ cmd, args, cwd: opts?.cwd });
      const subcmd = args[1];
      if (subcmd === 'doctor') {
        return {
          stdout: 'node v24.19.0\nchrome /opt/chrome\nffmpeg 9.0.1 encoders: libx264\n',
          stderr: doctorStderr,
          exitCode: doctorExitCode,
        };
      }
      if (subcmd === 'check') {
        if (checkShouldFailQa) {
          return {
            stdout: JSON.stringify({
              ok: false,
              errors: 1,
              warnings: 0,
              issues: [{ severity: 'error', code: 'text-offscreen', message: 'Text clipped' }],
            }),
            stderr: '',
            exitCode: 1,
          };
        }
        return {
          stdout: JSON.stringify({ ok: true, errors: 0, warnings: 0, issues: [] }),
          stderr: '',
          exitCode: 0,
        };
      }
      if (subcmd === 'bundle') {
        const outFlagIdx = args.indexOf('-o');
        const outDir = args[outFlagIdx + 1];
        await fs.mkdir(outDir, { recursive: true });
        await fs.writeFile(path.join(outDir, 'index.html'), '<html></html>', 'utf-8');
        await fs.writeFile(path.join(outDir, 'gm-player.js'), '// player', 'utf-8');
        return {
          stdout: JSON.stringify({ outDir, page: path.join(outDir, 'index.html'), files: 0, skipped: [] }),
          stderr: '',
          exitCode: 0,
        };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
    spawnProcess(cmd, args, opts) {
      spawnCalls.push({ cmd, args, cwd: opts?.cwd });
      activeFake = createFakeSpawn();
      return activeFake.proc;
    },
  };

  try {
    const cliPath = path.join(workspaceTrailing, 'engines/givemotion/src/cli.js');
    const adapter = new GivemotionAdapter(workspaceTrailing, cliPath, fakeRunner);
    doctorExitCode = 1;
    doctorStderr = 'doctor binary crashed';
    await assert.rejects(() => adapter.initialize(), /exit 1.*doctor binary crashed/);
    doctorExitCode = 0;
    doctorStderr = '';
    await adapter.initialize();

    assert.equal(execCalls[0].cmd, process.execPath);
    assert.deepEqual(execCalls[0].args, [cliPath, 'doctor']);

    const projectId = await adapter.createProject('proj_space_1', BASE_CONFIG);
    assert.equal(projectId, 'proj_space_1');

    const projectDir = path.join(workspaceTrailing, 'projects', 'proj_space_1');
    const gmConfig = JSON.parse(await fs.readFile(path.join(projectDir, 'givemotion.json'), 'utf-8'));
    assert.deepEqual(gmConfig, {});

    const manifestRaw = await fs.readFile(path.join(projectDir, 'project.animforge.json'), 'utf-8');
    assert.ok(manifestRaw.includes('proj_space_1'));

    // Idempotent scene updates (creating then updating scene_1 leaves 1 scene_1 in HTML)
    await adapter.createScene({
      id: 'scene_1',
      projectId,
      sequenceIndex: 0,
      title: 'Draft One',
      description: 'First',
      duration: 2,
      characterIds: [],
      timeline: { duration: 2, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
      transition: { type: 'fade', duration: 0.5 },
    });
    await adapter.createScene({
      id: 'scene_1',
      projectId,
      sequenceIndex: 0,
      title: 'Final One',
      description: 'Updated',
      duration: 2.5,
      characterIds: [],
      timeline: { duration: 2.5, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
      transition: { type: 'fade', duration: 0.5 },
    });

    const html = await fs.readFile(path.join(projectDir, 'index.html'), 'utf-8');
    assert.equal(html.match(/id="scene_1"/g)?.length, 1);
    assert.ok(html.includes('Final One'));
    assert.ok(!html.includes('Draft One'));

    // Preview handles check --json exitCode=1 cleanly and recovers QA issues
    checkShouldFailQa = true;
    const qaFailPreview = await adapter.previewProject(projectId);
    assert.equal(qaFailPreview.ok, false);
    assert.equal(qaFailPreview.errors, 1);
    assert.equal(qaFailPreview.issues[0].code, 'text-offscreen');
    await assert.rejects(() => adapter.preview('scene_1'), /Text clipped/);

    // Clean check + bundle
    checkShouldFailQa = false;
    const previewMsg = await adapter.preview('scene_1');
    assert.ok(previewMsg.includes('bundle'));

    // Unknown scene must never silently preview another project
    await assert.rejects(() => adapter.preview('scene_nonexistent'), /No Givemotion project/);

    // Render with --workers 1, large stdout (>64KB drained by adapter), and --progress json split across chunks
    const progressEvents: RenderProgressUpdate[] = [];
    const job = await adapter.render(projectId, (info) => progressEvents.push(info));

    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0].cmd, process.execPath);
    assert.ok(spawnCalls[0].args.includes('--workers'));
    assert.equal(spawnCalls[0].args[spawnCalls[0].args.indexOf('--workers') + 1], '1');
    assert.ok(spawnCalls[0].args.includes('--progress'));
    assert.equal(spawnCalls[0].args[spawnCalls[0].args.indexOf('--progress') + 1], 'json');
    assert.equal(
      spawnCalls[0].args[spawnCalls[0].args.indexOf('render') + 1],
      path.join(projectDir, 'index.html')
    );

    const proc = activeFake!;
    proc.stdout.push('{"summary": "' + 'x'.repeat(100 * 1024) + '"}\n');
    proc.stderr.push('{"event":"progress","phase":"open"}\n{"event":"progr');
    proc.stderr.push('ess","phase":"frames","done":30,"total":60,"fps":15,"eta":2}\n');
    proc.stderr.push('{"event":"progress","phase":"encode"}\n');
    await closeFakeSpawn(proc, 0, null);

    const status = await adapter.getRenderStatus(job.id);
    assert.equal(status.status, 'completed');
    assert.equal(status.progress, 100);
    assert.ok(progressEvents.some((p) => p.phase === 'frames' && p.done === 30));
    assert.ok(progressEvents.some((p) => p.phase === 'done' && p.progress === 100));
    assert.equal(await adapter.exportVideo(job.id), path.join(projectDir, 'output.mp4'));

    // Non-zero exit + stderr error JSON marks job failed
    const failJob = await adapter.render(projectId);
    const failProc = activeFake!;
    failProc.stderr.push('{"event":"error","message":"Chrome died"}\n');
    await closeFakeSpawn(failProc, 1, null);
    const failStatus = await adapter.getRenderStatus(failJob.id);
    assert.equal(failStatus.status, 'failed');
    assert.ok(failStatus.error?.includes('Chrome died'));

    // Fresh adapter instance hydrates persisted scenes safely from project.animforge.json + supports preview()
    const freshAdapter = new GivemotionAdapter(workspaceTrailing, cliPath, fakeRunner);
    const freshPreview = await freshAdapter.preview('scene_1');
    assert.ok(freshPreview.includes('bundle'));
    await freshAdapter.createScene({
      id: 'scene_2',
      projectId,
      sequenceIndex: 1,
      title: 'Second Scene',
      description: 'Hydrated continuation',
      duration: 2,
      characterIds: [],
      timeline: { duration: 2, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
      transition: { type: 'fade', duration: 0.5 },
    });
    const hydratedHtml = await fs.readFile(path.join(projectDir, 'index.html'), 'utf-8');
    assert.ok(hydratedHtml.includes('Final One'));
    assert.ok(hydratedHtml.includes('Second Scene'));

    // Corrupted project.animforge.json fails Zod hydration cleanly
    const corruptId = 'proj_corrupt_manifest';
    const corruptDir = path.join(workspaceTrailing, 'projects', corruptId);
    await fs.mkdir(corruptDir, { recursive: true });
    await fs.writeFile(path.join(corruptDir, 'project.animforge.json'), '{"config":"bad"}', 'utf-8');
    await assert.rejects(
      () =>
        freshAdapter.createScene({
          id: 'scene_bad',
          projectId: corruptId,
          sequenceIndex: 0,
          title: 'Bad',
          description: 'Invalid manifest',
          duration: 1,
          characterIds: [],
          timeline: { duration: 1, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
          transition: { type: 'fade', duration: 0.5 },
        }),
      /not found or invalid/
    );

    // Re-creating a project prunes stale sceneToProject mappings
    await adapter.createProject(projectId, BASE_CONFIG);
    await assert.rejects(() => adapter.preview('scene_1'), /No Givemotion project/);

    // dispose() sends SIGTERM to active render process and error+close race leaves job failed
    const killJob = await adapter.render(projectId);
    const killFake = activeFake!;
    await adapter.dispose();
    assert.deepEqual(killFake.killedSignals, ['SIGTERM']);
    killFake.proc.emit('error', new Error('ENOENT node'));
    await closeFakeSpawn(killFake, 0, null);
    const killStatus = await adapter.getRenderStatus(killJob.id);
    assert.equal(killStatus.status, 'failed');
    assert.ok(killStatus.error?.includes('ENOENT node'));
  } finally {
    await fs.rm(tmpParent, { recursive: true, force: true });
  }
});
