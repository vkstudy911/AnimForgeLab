import test from 'node:test';
import assert from 'node:assert/strict';
import { ChildProcessWithoutNullStreams, execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';
// @ts-expect-error node:sqlite built-in module is missing from @types/node 20.x
import { DatabaseSync } from 'node:sqlite';

const WORKER_ENTRY = path.resolve(import.meta.dirname, '..', 'src', 'worker.js');

interface WorkerClient {
  proc: ChildProcessWithoutNullStreams;
  call(method: string, params?: unknown, id?: string, extra?: Record<string, unknown>): Promise<Record<string, unknown>>;
  sendRaw(line: string): Promise<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  closeAndWaitExit(timeoutMs?: number): Promise<number | null>;
}

function startWorkerClient(workspaceDir: string): WorkerClient {
  const proc = spawn(process.execPath, [WORKER_ENTRY, workspaceDir], {
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const pending = new Map<string, (msg: Record<string, unknown>) => void>();
  const events: Array<Record<string, unknown>> = [];
  const anonymousWaiters: Array<(msg: Record<string, unknown>) => void> = [];
  let seq = 0;

  const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const msg = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof msg.id === 'string' || typeof msg.id === 'number') {
      const key = String(msg.id);
      const waiter = pending.get(key);
      if (waiter) {
        pending.delete(key);
        waiter(msg);
      }
      return;
    }
    if (msg.event) {
      events.push(msg);
      return;
    }
    const anon = anonymousWaiters.shift();
    if (anon) anon(msg);
  });

  proc.stderr.resume();
  proc.once('exit', (code) => {
    for (const [, waiter] of pending.entries()) {
      waiter({ ok: false, error: `Worker exited early with code ${String(code)}` });
    }
    pending.clear();
    const anon = anonymousWaiters.shift();
    if (anon) anon({ ok: false, error: `Worker exited early with code ${String(code)}` });
  });

  return {
    proc,
    events,
    call(method, params, explicitId, extra) {
      const id = explicitId ?? `req_${++seq}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timed out waiting for worker RPC ${method} (${id})`));
        }, 5000);
        pending.set(id, (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
        proc.stdin.write(`${JSON.stringify({ id, method, params, ...extra })}\n`);
      });
    },
    sendRaw(line) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for malformed JSON reply')), 5000);
        anonymousWaiters.push((msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
        proc.stdin.write(`${line}\n`);
      });
    },
    closeAndWaitExit(timeoutMs = 2000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          proc.kill('SIGKILL');
          reject(new Error(`Worker did not exit within ${timeoutMs}ms after stdin close`));
        }, timeoutMs);
        proc.once('close', (code) => {
          clearTimeout(timer);
          rl.close();
          resolve(code);
        });
        proc.stdin.end();
      });
    },
  };
}

test('worker handles malformed JSON, traversal jail, CRUD persistence in DB+HTML, real doctor, and clean EOF', async () => {
  const tmpParent = await fs.mkdtemp(path.join(os.tmpdir(), 'af worker '));
  const workspaceTrailing = path.join(tmpParent, 'ws worker ');
  await fs.mkdir(workspaceTrailing, { recursive: true });

  const client = startWorkerClient(workspaceTrailing);
  try {
    // 1. Malformed JSON returns structured error with version=1 and error code without crashing worker
    const badJson = await client.sendRaw('{not valid json');
    assert.equal(badJson.version, 1);
    assert.equal(badJson.ok, false);
    assert.equal(badJson.code, 'MALFORMED_JSON');
    assert.ok(String(badJson.error).includes('JSON'));

    // Unsupported protocol version rejected cleanly even without method field
    const badVer = await client.call('doctor', {}, 'ver_2', { version: 2 });
    assert.equal(badVer.version, 1);
    assert.equal(badVer.id, 'ver_2');
    assert.equal(badVer.ok, false);
    assert.equal(badVer.code, 'UNSUPPORTED_PROTOCOL_VERSION');

    const badVerNoMethod = await client.sendRaw(JSON.stringify({ version: 2 }));
    assert.equal(badVerNoMethod.ok, false);
    assert.equal(badVerNoMethod.code, 'UNSUPPORTED_PROTOCOL_VERSION');

    const badEnvelope = await client.sendRaw(JSON.stringify({ method: 'doctor' }));
    assert.equal(badEnvelope.ok, false);
    assert.equal(badEnvelope.code, 'INVALID_REQUEST');

    const badParams = await client.call('load_project', {});
    assert.equal(badParams.ok, false);
    assert.equal(badParams.code, 'INVALID_PARAMS');

    // 2. Traversal attack rejected
    const evilCreate = await client.call('create_project', {
      projectId: '../evil',
      config: { name: 'Bad', prompt: 'Bad', width: 1280, height: 720, fps: 30, preferredEngine: 'givemotion' },
    });
    assert.equal(evilCreate.version, 1);
    assert.equal(evilCreate.ok, false);
    assert.equal(evilCreate.code, 'INVALID_ID');
    assert.match(String(evilCreate.error), /Invalid project id/);

    const evilLoad = await client.call('load_project', { projectId: '../secret' });
    assert.equal(evilLoad.ok, false);
    assert.equal(evilLoad.code, 'INVALID_ID');
    assert.match(String(evilLoad.error), /Invalid project id/);

    const evilScenePreview = await client.call('preview_project', {
      projectId: 'proj_missing',
      sceneId: '../bad',
    });
    assert.equal(evilScenePreview.ok, false);
    assert.equal(evilScenePreview.code, 'INVALID_ID');

    const unknownMethod = await client.call('no_such_method', {});
    assert.equal(unknownMethod.ok, false);
    assert.equal(unknownMethod.code, 'UNKNOWN_METHOD');

    // 3. Real doctor fallback (using AnimForgeLab engines/givemotion/src/cli.js)
    const docRes = await client.call('doctor', {});
    assert.equal(docRes.ok, true);
    const docResult = docRes.result as Record<string, unknown>;
    assert.ok(typeof docResult.node === 'string');
    assert.equal(typeof docResult.chromeOk, 'boolean');

    // 4. create_project writes DB, project.animforge.json, givemotion.json, and index.html
    const created = await client.call('create_project', {
      config: {
        name: 'Worker Story',
        prompt: 'Pip waves at the moon',
        width: 1280,
        height: 720,
        fps: 30,
        preferredEngine: 'givemotion',
      },
    });
    assert.equal(created.ok, true);
    const { project, projectDir } = created.result as {
      project: Record<string, unknown> & { id: string; scenes: Array<Record<string, unknown>> };
      projectDir: string;
    };
    assert.ok(project.id.startsWith('proj_'));
    assert.equal(projectDir, path.join(workspaceTrailing, 'projects', project.id));

    await fs.access(path.join(projectDir, 'index.html'));
    await fs.access(path.join(projectDir, 'givemotion.json'));
    await fs.access(path.join(projectDir, 'project.animforge.json'));
    await fs.access(path.join(workspaceTrailing, 'projects', 'animforge.db'));

    // 5. list_projects & load_project
    const listed = await client.call('list_projects', {});
    assert.equal(listed.ok, true);
    const listProjects = (listed.result as { projects: Array<{ id: string }> }).projects;
    assert.ok(listProjects.some((p) => p.id === project.id));

    const loaded = await client.call('load_project', { projectId: project.id });
    assert.equal(loaded.ok, true);
    const loadedProject = (loaded.result as { project: typeof project }).project;
    assert.equal(loadedProject.id, project.id);

    // save_project rejects scene.projectId mismatch with INVALID_PARAMS
    const badSceneProject = {
      ...loadedProject,
      scenes: [{ ...loadedProject.scenes[0], projectId: 'proj_other' }],
    };
    const badSave = await client.call('save_project', { project: badSceneProject });
    assert.equal(badSave.ok, false);
    assert.equal(badSave.code, 'INVALID_PARAMS');
    assert.match(String(badSave.error), /mismatch/);

    // 6. save_project updates SQLite + HTML cleanly with HTML escaping
    loadedProject.scenes[0].title = 'Pip & <Edited> Title';
    const saved = await client.call('save_project', { project: loadedProject });
    assert.equal(saved.ok, true);

    const updatedHtml = await fs.readFile(path.join(projectDir, 'index.html'), 'utf-8');
    assert.ok(updatedHtml.includes('Pip &amp; &lt;Edited&gt; Title'));

    const reloaded = await client.call('load_project', { projectId: project.id });
    assert.equal(reloaded.ok, true);
    assert.equal(
      ((reloaded.result as { project: typeof project }).project.scenes[0]).title,
      'Pip & <Edited> Title'
    );

    // 7. Disk-only project manifest fallback works cleanly and corrupted manifest does not report "not found"
    const diskProjDir = path.join(workspaceTrailing, 'projects', 'proj_disk_only');
    await fs.mkdir(diskProjDir, { recursive: true });
    await fs.writeFile(
      path.join(diskProjDir, 'project.animforge.json'),
      JSON.stringify({
        config: { name: 'Disk Only', prompt: 'From disk', width: 1280, height: 720, fps: 30, preferredEngine: 'givemotion' },
        storyboard: {
          id: 'sb_disk_1',
          projectId: 'proj_disk_only',
          logline: 'Preserved story',
          artStyle: '2D ink',
          beats: [
            {
              beatNumber: 1,
              sceneTitle: 'Beat 1',
              visualSummary: 'Opening frame',
              characterInteractions: 'Pip waves',
              cameraNotes: 'Static',
              targetDurationSeconds: 2,
            },
          ],
          totalDurationSeconds: 2,
          createdAt: new Date().toISOString(),
        },
        characters: [],
        assets: [
          {
            id: 'asset_disk_1',
            name: 'BG',
            type: 'background',
            uri: 'assets/bg.png',
            metadata: {},
            createdAt: new Date().toISOString(),
          },
        ],
        scenes: [],
      }),
      'utf-8'
    );
    const diskLoaded = await client.call('load_project', { projectId: 'proj_disk_only' });
    assert.equal(diskLoaded.ok, true);
    const loadedDiskProj = (diskLoaded.result as {
      project: { name: string; storyboard?: { logline: string }; assets: Array<{ id: string }> };
    }).project;
    assert.equal(loadedDiskProj.name, 'Disk Only');
    assert.equal(loadedDiskProj.storyboard?.logline, 'Preserved story');
    assert.equal(loadedDiskProj.assets.length, 1);
    assert.equal(loadedDiskProj.assets[0].id, 'asset_disk_1');

    const badDiskDir = path.join(workspaceTrailing, 'projects', 'proj_bad_disk');
    await fs.mkdir(badDiskDir, { recursive: true });
    await fs.writeFile(path.join(badDiskDir, 'project.animforge.json'), '{corrupt', 'utf-8');
    const badDiskLoaded = await client.call('load_project', { projectId: 'proj_bad_disk' });
    assert.equal(badDiskLoaded.ok, false);
    assert.equal(badDiskLoaded.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(String(badDiskLoaded.error), /Project not found/);

    const badDiskSceneDir = path.join(workspaceTrailing, 'projects', 'proj_bad_disk_scene');
    await fs.mkdir(badDiskSceneDir, { recursive: true });
    await fs.writeFile(
      path.join(badDiskSceneDir, 'project.animforge.json'),
      JSON.stringify({
        config: { name: 'Bad Scene', prompt: 'From disk', width: 1280, height: 720, fps: 30, preferredEngine: 'givemotion' },
        characters: [],
        scenes: [
          {
            id: '../escape',
            projectId: 'proj_bad_disk_scene',
            sequenceIndex: 0,
            title: 'Bad',
            description: 'Bad scene id',
            duration: 1,
            characterIds: [],
            timeline: { duration: 1, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
            transition: { type: 'fade', duration: 0.5 },
          },
        ],
      }),
      'utf-8'
    );
    const badDiskSceneLoaded = await client.call('load_project', { projectId: 'proj_bad_disk_scene' });
    assert.equal(badDiskSceneLoaded.ok, false);
    assert.equal(badDiskSceneLoaded.code, 'INTERNAL_ERROR');
    assert.match(String(badDiskSceneLoaded.error), /Invalid project manifest/);

    const exitCode = await client.closeAndWaitExit(2000);
    assert.equal(exitCode, 0);
  } finally {
    if (!client.proc.killed && client.proc.exitCode === null) {
      client.proc.kill('SIGKILL');
    }
    await fs.rm(tmpParent, { recursive: true, force: true });
  }
});

test('worker preview_project and render_project stream progress non-blockingly and finalize DB', async () => {
  const tmpParent = await fs.mkdtemp(path.join(os.tmpdir(), 'af worker render '));
  const workspaceTrailing = path.join(tmpParent, 'ws render ');
  const fakeEngineSrc = path.join(workspaceTrailing, 'engines', 'givemotion', 'src');
  await fs.mkdir(fakeEngineSrc, { recursive: true });

  const fakeCli = `
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
const args = process.argv.slice(2);
const cmd = args[0];
if (cmd === 'doctor') {
  console.log('node v24.19.0\\nchrome /fake/chrome\\nffmpeg 9.0.1 encoders: libx264');
  process.exit(0);
}
if (cmd === 'check') {
  console.log(JSON.stringify({ ok: true, errors: 0, warnings: 0, notes: 0, issues: [] }));
  process.exit(0);
}
if (cmd === 'bundle') {
  const outDir = args[args.indexOf('-o') + 1];
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'index.html'), '<html>bundled</html>', 'utf8');
  await fs.writeFile(path.join(outDir, 'gm-player.js'), '// player', 'utf8');
  await fs.writeFile(path.join(outDir, 'player.html'), '<gm-player></gm-player>', 'utf8');
  console.log(JSON.stringify({ outDir, files: 0, skipped: [] }));
  process.exit(0);
}
if (cmd === 'render') {
  const outMp4 = args[args.indexOf('-o') + 1];
  const slowMarker = path.join(path.dirname(outMp4), '.slow_pid');
  const fastMarker = path.join(path.dirname(outMp4), '.fast_rerender');
  const corruptMarker = path.join(path.dirname(outMp4), '.corrupt_mp4');
  const validFixture = path.join(path.dirname(outMp4), '..', 'fixture-valid.mp4');
  if (outMp4.includes('proj_signal_test') && !fsSync.existsSync(fastMarker)) {
    await fs.writeFile(slowMarker, String(process.pid), 'utf8');
    await new Promise((r) => setTimeout(r, 8000));
    process.exit(0);
  }
  console.error(JSON.stringify({ event: 'progress', phase: 'open' }));
  await new Promise((r) => setTimeout(r, 40));
  console.error(JSON.stringify({ event: 'progress', phase: 'frames', done: 10, total: 20, fps: 12, eta: 0.8 }));
  await new Promise((r) => setTimeout(r, 80));
  if (fsSync.existsSync(corruptMarker)) {
    await fs.writeFile(outMp4, 'NOT_A_VALID_MP4', 'utf8');
  } else if (fsSync.existsSync(validFixture)) {
    await fs.copyFile(validFixture, outMp4);
  } else {
    await fs.writeFile(outMp4, 'FAKE_MP4', 'utf8');
  }
  console.error(JSON.stringify({ event: 'progress', phase: 'done' }));
  process.exit(0);
}
`;
  await fs.writeFile(path.join(fakeEngineSrc, 'cli.js'), fakeCli, 'utf-8');
  await fs.mkdir(path.join(workspaceTrailing, 'projects'), { recursive: true });
  execFileSync('ffmpeg', [
    '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=0.2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y',
    path.join(workspaceTrailing, 'projects', 'fixture-valid.mp4'),
  ], { stdio: 'ignore' });

  const client = startWorkerClient(workspaceTrailing);
  try {
    const created = await client.call('create_project', {
      projectId: 'proj_render_test',
      config: { name: 'Stream', prompt: 'Stream test', width: 1280, height: 720, fps: 30, preferredEngine: 'givemotion' },
    });
    assert.equal(created.ok, true);
    const createdProject = (created.result as { project: Record<string, unknown> & { name: string } }).project;

    const previewed = await client.call('preview_project', { projectId: 'proj_render_test' });
    assert.equal(previewed.ok, true);
    const previewRes = previewed.result as Record<string, unknown>;
    assert.equal(previewRes.ok, true);
    assert.ok(String(previewRes.bundleIndexHtml).endsWith(path.join('bundle', 'index.html')));

    const renderPromise = client.call('render_project', { projectId: 'proj_render_test' });
    // Duplicate concurrent render on same project must be rejected immediately
    const duplicateRender = await client.call('render_project', { projectId: 'proj_render_test' });
    assert.equal(duplicateRender.ok, false);
    assert.match(String(duplicateRender.error), /already in progress/);

    // Concurrent save_project during render must not be clobbered when render finalizes
    const concurrentSave = await client.call('save_project', {
      project: { ...createdProject, name: 'Live Concurrent Edit' },
    });
    assert.equal(concurrentSave.ok, true);

    // Worker must still answer concurrent list_projects without waiting for render completion
    const concurrentList = await client.call('list_projects', {});
    assert.equal(concurrentList.ok, true);

    const renderRes = await renderPromise;
    assert.equal(renderRes.ok, true);
    const { renderJob, videoPath, ffprobe } = renderRes.result as {
      renderJob: { id: string; status: string; progress: number };
      videoPath: string;
      ffprobe: { codec: string; width: number; height: number; hasVideoStream: boolean };
    };
    assert.equal(renderJob.status, 'completed');
    assert.equal(renderJob.progress, 100);
    assert.equal(videoPath, path.join(workspaceTrailing, 'projects', 'proj_render_test', 'output.mp4'));
    assert.equal(ffprobe.hasVideoStream, true);
    assert.equal(ffprobe.codec, 'h264');
    assert.equal(ffprobe.width, 64);

    // list_render_jobs reads SQLite history cleanly
    const jobsRes = await client.call('list_render_jobs', { projectId: 'proj_render_test' });
    assert.equal(jobsRes.ok, true);
    const jobs = (jobsRes.result as { jobs: Array<{ id: string; status: string }> }).jobs;
    assert.ok(jobs.some((j) => j.id === renderJob.id && j.status === 'completed'));

    // Corrupt MP4 is caught by ffprobe and marks job failed
    const corruptMarker = path.join(workspaceTrailing, 'projects', 'proj_render_test', '.corrupt_mp4');
    await fs.writeFile(corruptMarker, '1', 'utf8');
    const corruptRender = await client.call('render_project', { projectId: 'proj_render_test' });
    assert.equal(corruptRender.ok, false);
    assert.match(String(corruptRender.error), /ffprobe/i);
    await fs.rm(corruptMarker, { force: true });
    assert.ok(
      client.events.some(
        (ev) =>
          ev.event === 'render_progress' &&
          ev.projectId === 'proj_render_test' &&
          typeof ev.jobId === 'string' &&
          ev.jobId === renderJob.id
      )
    );

    const afterRenderLoad = await client.call('load_project', { projectId: 'proj_render_test' });
    assert.equal(afterRenderLoad.ok, true);
    assert.equal((afterRenderLoad.result as { project: { name: string; status: string } }).project.name, 'Live Concurrent Edit');
    assert.equal((afterRenderLoad.result as { project: { name: string; status: string } }).project.status, 'rendered');

    // project.animforge.json on disk must stay synchronized with SQLite rendered status
    const manifestAfterRender = JSON.parse(
      await fs.readFile(path.join(workspaceTrailing, 'projects', 'proj_render_test', 'project.animforge.json'), 'utf-8')
    ) as { status?: string; updatedAt?: string };
    assert.equal(manifestAfterRender.status, 'rendered');
    assert.ok(typeof manifestAfterRender.updatedAt === 'string' && manifestAfterRender.updatedAt.length > 0);

    // Closing stdin (EOF) mid-render drains cleanly instead of aborting active render
    const secondRenderPromise = client.call('render_project', { projectId: 'proj_render_test' });
    await new Promise((r) => setTimeout(r, 25));
    const exitCode = await client.closeAndWaitExit(3000);
    assert.equal(exitCode, 0);
    const drainedRenderRes = await secondRenderPromise;
    assert.equal(drainedRenderRes.ok, true);
  } finally {
    if (!client.proc.killed && client.proc.exitCode === null) {
      client.proc.kill('SIGKILL');
    }
  }

  // SIGTERM during active EOF drain kills active render child and exits promptly
  const sigClient = startWorkerClient(workspaceTrailing);
  try {
    const createdSig = await sigClient.call('create_project', {
      projectId: 'proj_signal_test',
      config: { name: 'Sig', prompt: 'Signal test', width: 1280, height: 720, fps: 30, preferredEngine: 'givemotion' },
    });
    assert.equal(createdSig.ok, true);

    // cancel_render stops active render cleanly with RENDER_CANCELLED without tearing down worker
    const idleCancel = await sigClient.call('cancel_render', { projectId: 'proj_signal_test' });
    assert.equal(idleCancel.ok, true);
    assert.equal((idleCancel.result as { cancelled: boolean }).cancelled, false);

    const cancelledRenderPromise = sigClient.call('render_project', { projectId: 'proj_signal_test' });
    const markerPath = path.join(workspaceTrailing, 'projects', 'proj_signal_test', '.slow_pid');
    let cancelledPid = 0;
    for (let i = 0; i < 40; i++) {
      try {
        cancelledPid = Number((await fs.readFile(markerPath, 'utf-8')).trim());
        if (cancelledPid > 0) break;
      } catch {
        await new Promise((r) => setTimeout(r, 25));
      }
    }
    assert.ok(cancelledPid > 0, 'expected slow fake render PID marker before cancel');

    const cancelResp = await sigClient.call('cancel_render', { projectId: 'proj_signal_test' });
    assert.equal(cancelResp.ok, true);
    assert.equal((cancelResp.result as { cancelled: boolean }).cancelled, true);

    const cancelledRenderRes = await cancelledRenderPromise;
    assert.equal(cancelledRenderRes.ok, false);
    assert.equal(cancelledRenderRes.code, 'RENDER_CANCELLED');
    assert.match(String(cancelledRenderRes.error), /cancel/i);

    await fs.rm(markerPath, { force: true });
    let cancelledChildAlive = true;
    await new Promise((r) => setTimeout(r, 50));
    try {
      process.kill(cancelledPid, 0);
    } catch {
      cancelledChildAlive = false;
    }
    assert.equal(cancelledChildAlive, false);

    // Immediate re-render after cancel_render works cleanly on the same project
    const fastMarker = path.join(workspaceTrailing, 'projects', 'proj_signal_test', '.fast_rerender');
    await fs.writeFile(fastMarker, '1', 'utf-8');
    const rerenderRes = await sigClient.call('render_project', { projectId: 'proj_signal_test' });
    assert.equal(rerenderRes.ok, true);
    assert.equal(
      (rerenderRes.result as { renderJob: { status: string } }).renderJob.status,
      'completed'
    );
    await fs.rm(fastMarker, { force: true });

    void sigClient.call('render_project', { projectId: 'proj_signal_test' });
    let childPid = 0;
    for (let i = 0; i < 40; i++) {
      try {
        childPid = Number((await fs.readFile(markerPath, 'utf-8')).trim());
        if (childPid > 0) break;
      } catch {
        await new Promise((r) => setTimeout(r, 25));
      }
    }
    assert.ok(childPid > 0, 'expected slow fake render child PID marker');

    // Start EOF drain, then interrupt with SIGTERM
    sigClient.proc.stdin.end();
    await new Promise((r) => setTimeout(r, 20));
    const exitPromise = new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker did not exit quickly on SIGTERM')), 2000);
      sigClient.proc.once('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    sigClient.proc.kill('SIGTERM');
    const sigExit = await exitPromise;
    assert.equal(sigExit, 0);

    // Ensure child render process was terminated cleanly
    await new Promise((r) => setTimeout(r, 50));
    let childAlive = true;
    try {
      process.kill(childPid, 0);
    } catch {
      childAlive = false;
    }
    assert.equal(childAlive, false);
  } finally {
    if (!sigClient.proc.killed && sigClient.proc.exitCode === null) {
      sigClient.proc.kill('SIGKILL');
    }
    await fs.rm(tmpParent, { recursive: true, force: true });
  }
});

test('worker supports lifecycle CRUD, assets import, deterministic agents, config persistence, and engine dispatch', async () => {
  const tmpParent = await fs.mkdtemp(path.join(os.tmpdir(), 'af worker lifecycle '));
  const workspaceTrailing = path.join(tmpParent, 'ws lifecycle ');
  await fs.mkdir(path.join(workspaceTrailing, 'assets'), { recursive: true });
  await fs.mkdir(path.join(workspaceTrailing, 'engines', 'stretchystudio'), { recursive: true });
  await fs.writeFile(
    path.join(workspaceTrailing, 'engines', 'stretchystudio', 'package.json'),
    JSON.stringify({ name: 'stretchystudio', version: '0.1.0' }),
    'utf-8'
  );
  await fs.writeFile(path.join(workspaceTrailing, 'assets', 'sky.png'), 'PNG_FAKE_BYTES', 'utf-8');
  await fs.writeFile(path.join(workspaceTrailing, '.env'), 'SECRET=1', 'utf-8');

  const client = startWorkerClient(workspaceTrailing);
  try {
    const created = await client.call('create_project', {
      projectId: 'proj_phase2',
      config: { name: 'Alpha', prompt: 'Moon walk', width: 1280, height: 720, fps: 30, preferredEngine: 'givemotion' },
    });
    assert.equal(created.ok, true);

    // Assets list + safe import from workspace + byte import + traversal rejection
    const importedFile = await client.call('asset_import', {
      projectId: 'proj_phase2',
      sourcePath: 'assets/sky.png',
      assetType: 'background',
      name: 'Sky Backdrop',
    });
    assert.equal(importedFile.ok, true);
    const asset1 = (importedFile.result as { asset: { id: string; uri: string } }).asset;
    assert.equal(asset1.uri, 'assets/sky.png');

    const importedBytes = await client.call('asset_import_bytes', {
      projectId: 'proj_phase2',
      fileName: 'beat.wav',
      dataBase64: Buffer.from('RIFF_FAKE_WAV').toString('base64'),
      assetType: 'audio',
    });
    assert.equal(importedBytes.ok, true);

    const evilImport = await client.call('asset_import', {
      projectId: 'proj_phase2',
      sourcePath: '.env',
    });
    assert.equal(evilImport.ok, false);
    assert.equal(evilImport.code, 'PATH_VIOLATION');

    const externalAbsImport = await client.call('asset_import', {
      projectId: 'proj_phase2',
      sourcePath: '/etc/passwd',
      allowExternalSource: true,
    });
    assert.equal(externalAbsImport.ok, false);
    assert.equal(externalAbsImport.code, 'PATH_VIOLATION');

    const overwriteBytes = await client.call('asset_import_bytes', {
      projectId: 'proj_phase2',
      fileName: 'beat.wav',
      dataBase64: Buffer.from('RIFF_UPDATED_WAV').toString('base64'),
      assetType: 'audio',
      name: 'Updated Beat',
      confirmOverwrite: true,
    });
    assert.equal(overwriteBytes.ok, true);
    const overwriteProj = (overwriteBytes.result as { project: { assets: Array<{ name: string; uri: string }> } }).project;
    assert.equal(overwriteProj.assets.length, 2);
    assert.equal(
      overwriteProj.assets.find((a) => a.uri === 'assets/beat.wav')?.name,
      'Updated Beat'
    );

    const overwriteFile = await client.call('asset_import', {
      projectId: 'proj_phase2',
      sourcePath: 'assets/sky.png',
      assetType: 'background',
      name: 'Sky V2',
      confirmOverwrite: true,
    });
    assert.equal(overwriteFile.ok, true);
    const overwriteFileProj = (overwriteFile.result as { project: { assets: Array<{ name: string; uri: string }> } }).project;
    assert.equal(overwriteFileProj.assets.length, 2);
    assert.equal(
      overwriteFileProj.assets.find((a) => a.uri === 'assets/sky.png')?.name,
      'Sky V2'
    );

    const emptyJobsProjectId = await client.call('list_render_jobs', { projectId: '' });
    assert.equal(emptyJobsProjectId.ok, false);
    assert.equal(emptyJobsProjectId.code, 'INVALID_ID');

    const emptyAssetsProjectId = await client.call('assets_list', { projectId: '' });
    assert.equal(emptyAssetsProjectId.ok, false);
    assert.equal(emptyAssetsProjectId.code, 'INVALID_ID');

    const listedAssets = await client.call('assets_list', { projectId: 'proj_phase2' });
    assert.equal(listedAssets.ok, true);
    const assetListRes = listedAssets.result as {
      projectAssets: Array<{ id: string; uri: string; existsOnDisk: boolean; workspaceRelativePath?: string }>;
      workspaceLibraryFiles: string[];
    };
    assert.equal(assetListRes.projectAssets.length, 2);
    assert.ok(assetListRes.projectAssets.every((a) => a.existsOnDisk === true));
    assert.equal(
      assetListRes.projectAssets.find((a) => a.uri === 'assets/sky.png')?.workspaceRelativePath,
      'projects/proj_phase2/assets/sky.png'
    );
    assert.ok(assetListRes.workspaceLibraryFiles.includes('assets/sky.png'));

    // Deterministic agent runner
    const agentRun = await client.call('run_deterministic_agent', {
      projectId: 'proj_phase2',
      agent: 'scene_planner',
    });
    assert.equal(agentRun.ok, true);
    assert.ok(String((agentRun.result as { summary: string }).summary).includes('Planned'));

    // Duplicate copies assets + storyboard cleanly into new ID
    const duplicated = await client.call('duplicate_project', {
      projectId: 'proj_phase2',
      newName: 'Alpha Clone',
    });
    assert.equal(duplicated.ok, true);
    const dupProj = (duplicated.result as { project: { id: string; name: string; assets: unknown[] } }).project;
    assert.notEqual(dupProj.id, 'proj_phase2');
    assert.equal(dupProj.name, 'Alpha Clone');
    assert.equal(dupProj.assets.length, 2);
    await fs.access(path.join(workspaceTrailing, 'projects', dupProj.id, 'assets', 'sky.png'));

    // Import colliding ID mints new canonical ID instead of overwriting
    const originalLoaded = await client.call('load_project', { projectId: 'proj_phase2' });
    const importedProj = await client.call('import_project', {
      project: (originalLoaded.result as { project: unknown }).project,
    });
    assert.equal(importedProj.ok, true);
    const impProjId = (importedProj.result as { project: { id: string } }).project.id;
    assert.notEqual(impProjId, 'proj_phase2');

    // StretchyStudio engine dispatch produces Spine JSON honestly
    const loadedForStretch = (originalLoaded.result as { project: Record<string, unknown> }).project;
    await client.call('save_project', {
      project: { ...loadedForStretch, preferredEngine: 'stretchystudio' },
    });
    const stretchRender = await client.call('render_project', { projectId: 'proj_phase2' });
    assert.equal(stretchRender.ok, true);
    assert.equal((stretchRender.result as { artifactKind: string }).artifactKind, 'spine_json');
    assert.match(String((stretchRender.result as { videoPath: string }).videoPath), /character-rig\.spine\.json$/);

    // Remotion dispatch without Remotion CLI returns honest ENGINE_UNAVAILABLE
    await client.call('save_project', {
      project: { ...loadedForStretch, preferredEngine: 'remotion' },
    });
    const remotionRender = await client.call('render_project', { projectId: 'proj_phase2' });
    assert.equal(remotionRender.ok, false);
    assert.equal(remotionRender.code, 'ENGINE_UNAVAILABLE');

    // Composite dispatch returns honest ENGINE_UNAVAILABLE
    await client.call('save_project', {
      project: { ...loadedForStretch, preferredEngine: 'composite' },
    });
    const compositePreview = await client.call('preview_project', { projectId: 'proj_phase2' });
    assert.equal(compositePreview.ok, false);
    assert.equal(compositePreview.code, 'ENGINE_UNAVAILABLE');

    // Config get/save persists cleanly
    const cfgSave = await client.call('save_config', {
      config: {
        defaultWidth: 1280,
        defaultHeight: 720,
        defaultFps: 24,
        defaultEngine: 'givemotion',
        density: 'compact',
        reducedEffects: true,
        showSafeZonesByDefault: false,
      },
    });
    assert.equal(cfgSave.ok, true);
    const cfgGet = await client.call('get_config', {});
    assert.equal(cfgGet.ok, true);
    assert.equal((cfgGet.result as { config: { defaultFps: number } }).config.defaultFps, 24);

    // .avif and .flac asset imports must succeed with accurate inferred asset types
    const avifImport = await client.call('asset_import_bytes', {
      projectId: dupProj.id,
      fileName: 'backdrop.avif',
      dataBase64: Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]).toString('base64'),
    });
    assert.equal(avifImport.ok, true);
    assert.equal((avifImport.result as { asset: { type: string } }).asset.type, 'background');

    const flacImport = await client.call('asset_import_bytes', {
      projectId: dupProj.id,
      fileName: 'theme.flac',
      dataBase64: Buffer.from([0x66, 0x4c, 0x61, 0x43, 0x00, 0x00, 0x00, 0x22]).toString('base64'),
    });
    assert.equal(flacImport.ok, true);
    assert.equal((flacImport.result as { asset: { type: string } }).asset.type, 'audio');

    // Delete project removes DB + dir inside projects/ jail
    const deleted = await client.call('delete_project', { projectId: dupProj.id });
    assert.equal(deleted.ok, true);
    const afterDelLoad = await client.call('load_project', { projectId: dupProj.id });
    assert.equal(afterDelLoad.ok, false);

    // Corrupt SQLite JSON row can still be deleted cleanly via delete_project
    const rawDb = new DatabaseSync(path.join(workspaceTrailing, 'projects', 'animforge.db'));
    rawDb
      .prepare(
        `INSERT INTO projects (id, name, prompt, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        'proj_corrupt_sql',
        'Corrupt',
        'Corrupt prompt',
        '{not-valid-json',
        new Date().toISOString(),
        new Date().toISOString()
      );
    rawDb.close();
    const corruptDel = await client.call('delete_project', { projectId: 'proj_corrupt_sql' });
    assert.equal(corruptDel.ok, true);
    assert.equal((corruptDel.result as { deleted: boolean }).deleted, true);

    // B1 regression: DiskManifestSchema tolerates null optional fields and rejects corrupt assets cleanly
    const legacyNullDir = path.join(workspaceTrailing, 'projects', 'proj_null_compat');
    await fs.mkdir(legacyNullDir, { recursive: true });
    await fs.writeFile(
      path.join(legacyNullDir, 'project.animforge.json'),
      JSON.stringify({
        config: {
          name: 'Legacy Null Compat',
          prompt: 'Handles null optional fields',
          width: 1280,
          height: 720,
          fps: 30,
          preferredEngine: 'givemotion',
        },
        storyboard: null,
        characters: null,
        assets: null,
        scenes: null,
      }),
      'utf-8'
    );
    const loadedNullCompat = await client.call('load_project', { projectId: 'proj_null_compat' });
    assert.equal(loadedNullCompat.ok, true);
    const nullProj = (loadedNullCompat.result as { project: Record<string, unknown> }).project;
    assert.equal(nullProj.storyboard, undefined);
    assert.deepEqual(nullProj.assets, []);

    const badManifestDir = path.join(workspaceTrailing, 'projects', 'proj_bad_manifest');
    await fs.mkdir(badManifestDir, { recursive: true });
    await fs.writeFile(
      path.join(badManifestDir, 'project.animforge.json'),
      JSON.stringify({
        config: {
          name: 'Corrupt Assets',
          prompt: 'Invalid manifest field',
          width: 1280,
          height: 720,
          fps: 30,
          preferredEngine: 'givemotion',
        },
        assets: [{ id: 'bad_only_id' }],
      }),
      'utf-8'
    );
    const loadedBadManifest = await client.call('load_project', { projectId: 'proj_bad_manifest' });
    assert.equal(loadedBadManifest.ok, false);
    assert.match(String(loadedBadManifest.error), /Invalid project manifest/);

    const exitCode = await client.closeAndWaitExit(2000);
    assert.equal(exitCode, 0);
  } finally {
    if (!client.proc.killed && client.proc.exitCode === null) {
      client.proc.kill('SIGKILL');
    }
    await fs.rm(tmpParent, { recursive: true, force: true });
  }
});

test('worker supports character studio IPC commands: import, list, load, motion, preview, export', async () => {
  const tmpParent = await fs.mkdtemp(path.join(os.tmpdir(), 'af-char-worker- '));
  const ws = path.join(tmpParent, 'studio ');
  await fs.mkdir(path.join(ws, 'projects'), { recursive: true });
  await fs.mkdir(path.join(ws, 'characters'), { recursive: true });

  const client = startWorkerClient(ws);
  try {
    // 1. Create a character PNG asset
    const w = 80;
    const h = 160;
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 10; y < 150; y++) {
      for (let x = 20; x < 60; x++) {
        const idx = (y * w + x) * 4;
        rgba[idx] = 200;
        rgba[idx + 1] = 150;
        rgba[idx + 2] = 50;
        rgba[idx + 3] = 255;
      }
    }
    const pngPath = path.join(ws, 'alien.png');
    const { encodePng } = await import('../src/character/png_decoder.js');
    await fs.writeFile(pngPath, encodePng(w, h, rgba));

    // 2. character_import
    const importRes = await client.call('character_import', {
      artworkPath: pngPath,
      name: 'AlienWorkerChar',
      enableIK: true,
      enableMeshes: true,
    });
    assert.equal(importRes.ok, true);
    const charData = (importRes.result as { character: { id: string; name: string } }).character;
    assert.equal(charData.name, 'AlienWorkerChar');

    // 3. character_list
    const listRes = await client.call('character_list', {});
    assert.equal(listRes.ok, true);
    const list = (listRes.result as { characters: Array<{ id: string }> }).characters;
    assert.ok(list.some((c) => c.id === charData.id));

    // 4. character_load
    const loadRes = await client.call('character_load', { characterId: charData.id });
    assert.equal(loadRes.ok, true);
    assert.equal((loadRes.result as { character: { id: string } }).character.id, charData.id);

    // 5. character_generate_motion
    const motionRes = await client.call('character_generate_motion', {
      characterId: charData.id,
      action: 'wave',
      duration: 1.5,
    });
    assert.equal(motionRes.ok, true);
    const anim = (motionRes.result as { animation: { name: string; duration: number } }).animation;
    assert.equal(anim.name, 'wave');
    assert.equal(anim.duration, 1.5);

    // 6. character_preview
    const previewRes = await client.call('character_preview', {
      characterId: charData.id,
      animationName: 'wave',
      time: 0.5,
    });
    assert.equal(previewRes.ok, true);
    const pose = (previewRes.result as { pose: { bones: any[] } }).pose;
    assert.ok(pose.bones.length > 0);

    // 7. character_export_spine
    const spineRes = await client.call('character_export_spine', {
      characterId: charData.id,
      version: '3.8',
    });
    assert.equal(spineRes.ok, true);
    const spineJson = (spineRes.result as { spineJson: any }).spineJson;
    assert.ok(spineJson.skeleton || spineJson.bones);

    const exitCode = await client.closeAndWaitExit(2000);
    assert.equal(exitCode, 0);
  } finally {
    if (!client.proc.killed && client.proc.exitCode === null) {
      client.proc.kill('SIGKILL');
    }
    await fs.rm(tmpParent, { recursive: true, force: true });
  }
});
