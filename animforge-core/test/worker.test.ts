import test from 'node:test';
import assert from 'node:assert/strict';
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';

const WORKER_ENTRY = path.resolve(import.meta.dirname, '..', 'src', 'worker.js');

interface WorkerClient {
  proc: ChildProcessWithoutNullStreams;
  call(method: string, params?: unknown, id?: string): Promise<Record<string, unknown>>;
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
    call(method, params, explicitId) {
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
        proc.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
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
    // 1. Malformed JSON returns structured error without crashing worker
    const badJson = await client.sendRaw('{not valid json');
    assert.equal(badJson.ok, false);
    assert.ok(String(badJson.error).includes('JSON'));

    // 2. Traversal attack rejected
    const evilCreate = await client.call('create_project', {
      projectId: '../evil',
      config: { name: 'Bad', prompt: 'Bad', width: 1280, height: 720, fps: 30, preferredEngine: 'givemotion' },
    });
    assert.equal(evilCreate.ok, false);
    assert.match(String(evilCreate.error), /Invalid project id/);

    const evilLoad = await client.call('load_project', { projectId: '../secret' });
    assert.equal(evilLoad.ok, false);
    assert.match(String(evilLoad.error), /Invalid project id/);

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

    // save_project rejects scene.projectId mismatch
    const badSceneProject = {
      ...loadedProject,
      scenes: [{ ...loadedProject.scenes[0], projectId: 'proj_other' }],
    };
    const badSave = await client.call('save_project', { project: badSceneProject });
    assert.equal(badSave.ok, false);
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
        characters: [],
        scenes: [],
      }),
      'utf-8'
    );
    const diskLoaded = await client.call('load_project', { projectId: 'proj_disk_only' });
    assert.equal(diskLoaded.ok, true);
    assert.equal((diskLoaded.result as { project: { name: string } }).project.name, 'Disk Only');

    const badDiskDir = path.join(workspaceTrailing, 'projects', 'proj_bad_disk');
    await fs.mkdir(badDiskDir, { recursive: true });
    await fs.writeFile(path.join(badDiskDir, 'project.animforge.json'), '{corrupt', 'utf-8');
    const badDiskLoaded = await client.call('load_project', { projectId: 'proj_bad_disk' });
    assert.equal(badDiskLoaded.ok, false);
    assert.doesNotMatch(String(badDiskLoaded.error), /Project not found/);

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
  if (outMp4.includes('proj_signal_test')) {
    await fs.writeFile(slowMarker, String(process.pid), 'utf8');
    await new Promise((r) => setTimeout(r, 8000));
    process.exit(0);
  }
  console.error(JSON.stringify({ event: 'progress', phase: 'open' }));
  await new Promise((r) => setTimeout(r, 40));
  console.error(JSON.stringify({ event: 'progress', phase: 'frames', done: 10, total: 20, fps: 12, eta: 0.8 }));
  await new Promise((r) => setTimeout(r, 80));
  await fs.writeFile(outMp4, 'FAKE_MP4', 'utf8');
  console.error(JSON.stringify({ event: 'progress', phase: 'done' }));
  process.exit(0);
}
`;
  await fs.writeFile(path.join(fakeEngineSrc, 'cli.js'), fakeCli, 'utf-8');

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
    const { renderJob, videoPath } = renderRes.result as {
      renderJob: { id: string; status: string; progress: number };
      videoPath: string;
    };
    assert.equal(renderJob.status, 'completed');
    assert.equal(renderJob.progress, 100);
    assert.equal(videoPath, path.join(workspaceTrailing, 'projects', 'proj_render_test', 'output.mp4'));
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

    void sigClient.call('render_project', { projectId: 'proj_signal_test' });
    const markerPath = path.join(workspaceTrailing, 'projects', 'proj_signal_test', '.slow_pid');
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
