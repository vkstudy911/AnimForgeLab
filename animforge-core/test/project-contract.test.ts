import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
// @ts-expect-error node:sqlite built-in module is missing from @types/node 20.x
import { DatabaseSync } from 'node:sqlite';
import { AnimForgeDatabase } from '../src/database.js';
import { AnimForgePipeline } from '../src/pipeline.js';
import {
  AnimationEngineAdapter,
  RenderProgressUpdate,
  SceneConfig,
} from '../adapters/adapter.interface.js';
import { GivemotionAdapter } from '../adapters/givemotion.adapter.js';
import { RemotionAdapter } from '../adapters/remotion.adapter.js';
import { StretchyStudioAdapter } from '../adapters/stretchystudio.adapter.js';
import { Character, ProjectConfig, RenderJob, RenderStatus } from '../schemas/index.js';

const BASE_CONFIG: ProjectConfig = {
  name: 'Pip <Test> {Title}',
  prompt: 'A cute green character waves and walks into a glowing door',
  width: 1280,
  height: 720,
  fps: 30,
  preferredEngine: 'givemotion',
};

test('AnimForgePipeline enforces one deterministic projectId across adapter, scenes, progress, and SQLite', async () => {
  const db = new AnimForgeDatabase(':memory:');
  const calls: {
    createProjectIds: string[];
    charactersCount: number;
    sceneProjectIds: string[];
    renderProjectIds: string[];
  } = {
    createProjectIds: [],
    charactersCount: 0,
    sceneProjectIds: [],
    renderProjectIds: [],
  };

  const recordingAdapter: AnimationEngineAdapter = {
    name: 'mock-recorder',
    async initialize() {},
    async createProject(projectId: string, _config: ProjectConfig, characters?: Character[]) {
      calls.createProjectIds.push(projectId);
      calls.charactersCount = characters?.length ?? 0;
      return projectId;
    },
    async createScene(config: SceneConfig) {
      calls.sceneProjectIds.push(config.projectId);
      return config.id ?? 'scene_generated';
    },
    async preview(sceneId: string) {
      return `ok:${sceneId}`;
    },
    async render(projectId: string, onProgress?: (info: RenderProgressUpdate) => void): Promise<RenderJob> {
      calls.renderProjectIds.push(projectId);
      onProgress?.({ phase: 'frames', progress: 50, done: 15, total: 30 });
      return {
        id: 'job_rec_1',
        projectId,
        engine: 'givemotion',
        status: 'completed',
        progress: 100,
        outputFilePath: `/tmp/${projectId}/output.mp4`,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
    },
    async getRenderStatus(jobId: string): Promise<RenderStatus> {
      return {
        jobId,
        status: 'completed',
        progress: 100,
        outputFilePath: '/tmp/proj_deterministic_01/output.mp4',
      };
    },
    async exportVideo() {
      return '/tmp/proj_deterministic_01/output.mp4';
    },
  };

  const stages: string[] = [];
  const pipeline = new AnimForgePipeline(db);
  const result = await pipeline.execute(
    BASE_CONFIG,
    recordingAdapter,
    (stage) => stages.push(stage),
    { projectId: 'proj_deterministic_01' }
  );

  assert.equal(result.project.id, 'proj_deterministic_01');
  assert.deepEqual(calls.createProjectIds, ['proj_deterministic_01']);
  assert.equal(calls.charactersCount, 1);
  assert.ok(calls.sceneProjectIds.length >= 3);
  assert.ok(calls.sceneProjectIds.every((id) => id === 'proj_deterministic_01'));
  assert.deepEqual(calls.renderProjectIds, ['proj_deterministic_01']);
  assert.equal(result.renderJob.projectId, 'proj_deterministic_01');
  assert.ok(stages.includes('RENDER_PROGRESS'));

  const stored = db.getProject('proj_deterministic_01');
  assert.equal(stored?.id, 'proj_deterministic_01');
  assert.equal(stored?.status, 'rendered');

  await assert.rejects(
    () => pipeline.execute(BASE_CONFIG, recordingAdapter, undefined, { projectId: '../escape' }),
    /Invalid project id/
  );
  await assert.rejects(
    () => pipeline.execute(BASE_CONFIG, recordingAdapter, undefined, { projectId: '' }),
    /Invalid project id/
  );

  const mismatchedProjectAdapter: AnimationEngineAdapter = {
    ...recordingAdapter,
    async createProject() {
      return 'proj_wrong_id';
    },
  };
  await assert.rejects(
    () =>
      pipeline.execute(BASE_CONFIG, mismatchedProjectAdapter, undefined, {
        projectId: 'proj_expected_01',
      }),
    /violated projectId contract/
  );

  const mismatchedRenderAdapter: AnimationEngineAdapter = {
    ...recordingAdapter,
    async render() {
      return {
        id: 'job_bad_proj',
        projectId: 'proj_wrong_render',
        engine: 'givemotion',
        status: 'completed',
        progress: 100,
        outputFilePath: '/tmp/wrong.mp4',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
    },
  };
  await assert.rejects(
    () =>
      pipeline.execute(BASE_CONFIG, mismatchedRenderAdapter, undefined, {
        projectId: 'proj_expected_02',
      }),
    /violated renderJob projectId contract/
  );

  let pollTick = 0;
  const failingPollAdapter: AnimationEngineAdapter = {
    ...recordingAdapter,
    async render(projectId: string) {
      pollTick = 0;
      return {
        id: 'job_fail_poll_1',
        projectId,
        engine: 'givemotion',
        status: 'rendering',
        progress: 10,
        startedAt: new Date().toISOString(),
      };
    },
    async getRenderStatus(jobId: string) {
      pollTick++;
      if (pollTick === 1) {
        return { jobId, status: 'rendering', progress: 50 };
      }
      return { jobId, status: 'failed', progress: 50, error: 'Synthetic chrome crash' };
    },
  };
  await assert.rejects(
    () =>
      pipeline.execute(BASE_CONFIG, failingPollAdapter, undefined, {
        projectId: 'proj_fail_poll_01',
        pollIntervalMs: 5,
      }),
    /Synthetic chrome crash/
  );
  const failedJob = db.getRenderJob('job_fail_poll_1');
  assert.equal(failedJob?.status, 'failed');
  assert.equal(failedJob?.error, 'Synthetic chrome crash');

  db.close();
});

test('All three adapters accept caller projectId, jail paths in space-trailing workspace, and reject traversal', async () => {
  const tmpParent = await fs.mkdtemp(path.join(os.tmpdir(), 'af-contract '));
  const workspaceTrailing = path.join(tmpParent, 'animator space ');
  await fs.mkdir(path.join(workspaceTrailing, 'projects'), { recursive: true });

  try {
    const gm = new GivemotionAdapter(workspaceTrailing);
    const rm = new RemotionAdapter(workspaceTrailing);
    const ss = new StretchyStudioAdapter(workspaceTrailing);

    assert.equal(await gm.createProject('proj_gm_01', BASE_CONFIG), 'proj_gm_01');
    assert.equal(await rm.createProject('proj_rm_01', BASE_CONFIG), 'proj_rm_01');
    assert.equal(await ss.createProject('proj_ss_01', BASE_CONFIG), 'proj_ss_01');

    // Scene HTML replacement must not expand String.replace $' or $$ tokens
    const dollarSceneId = await gm.createScene({
      id: 'scene_dollar',
      projectId: 'proj_gm_01',
      sequenceIndex: 0,
      title: "Pip $'s Reward $$50",
      description: 'Safe $& literal description',
      duration: 2,
      characterIds: [],
      timeline: { duration: 2, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
      transition: { type: 'fade', duration: 0.5 },
    });
    assert.equal(dollarSceneId, 'scene_dollar');

    const gmHtml = await fs.readFile(
      path.join(workspaceTrailing, 'projects', 'proj_gm_01', 'index.html'),
      'utf-8'
    );
    assert.ok(gmHtml.includes('Pip &lt;Test&gt; {Title}'));
    assert.ok(gmHtml.includes("Pip $&#39;s Reward $$50"));
    assert.ok(gmHtml.includes('Safe $&amp; literal description'));
    assert.equal(gmHtml.match(/<\/body>/g)?.length, 1);

    const rmRoot = await fs.readFile(
      path.join(workspaceTrailing, 'projects', 'proj_rm_01', 'src', 'Root.tsx'),
      'utf-8'
    );
    assert.ok(rmRoot.includes('{"Pip <Test> {Title}"}'));

    const stretchyStat = await fs.stat(
      path.join(workspaceTrailing, 'projects', 'proj_ss_01', 'character.stretch')
    );
    assert.ok(stretchyStat.isFile());

    // Consecutive same-millisecond render() calls must produce distinct job IDs
    const jobA = await ss.render('proj_ss_01');
    const jobB = await ss.render('proj_ss_01');
    assert.notEqual(jobA.id, jobB.id);

    // Path/ID jail across createProject, createScene (including empty id), preview, and render
    await assert.rejects(() => gm.createProject('../evil', BASE_CONFIG), /Invalid project id/);
    await assert.rejects(() => rm.createProject('a/b', BASE_CONFIG), /Invalid project id/);
    await assert.rejects(() => ss.createProject('proj bad', BASE_CONFIG), /Invalid project id/);
    await assert.rejects(
      () =>
        gm.createScene({
          id: '',
          projectId: 'proj_gm_01',
          sequenceIndex: 0,
          title: 'Bad',
          description: 'Empty id',
          duration: 1,
          characterIds: [],
          timeline: { duration: 1, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
          transition: { type: 'fade', duration: 0.5 },
        }),
      /Invalid scene id/
    );
    await assert.rejects(
      () =>
        rm.createScene({
          id: '../evil',
          projectId: 'proj_rm_01',
          sequenceIndex: 0,
          title: 'Bad',
          description: 'Traversal id',
          duration: 1,
          characterIds: [],
          timeline: { duration: 1, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
          transition: { type: 'fade', duration: 0.5 },
        }),
      /Invalid scene id/
    );
    await assert.rejects(() => gm.preview('../evil'), /Invalid scene id/);
    await assert.rejects(() => ss.render('../evil'), /Invalid project id/);
  } finally {
    await fs.rm(tmpParent, { recursive: true, force: true });
  }
});

test('AnimForgeDatabase validates stored rows via Zod schemas without trusting raw JSON', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'af-db-'));
  const dbPath = path.join(tmpDir, 'test.db');

  try {
    const db = new AnimForgeDatabase(dbPath);
    const now = new Date().toISOString();
    db.saveRenderJob({
      id: 'job_1',
      projectId: 'proj_1',
      engine: 'givemotion',
      status: 'completed',
      progress: 100,
      outputFilePath: '/tmp/out.mp4',
      startedAt: now,
      finishedAt: now,
    });

    const job = db.getRenderJob('job_1');
    assert.equal(job?.id, 'job_1');
    assert.equal(job?.projectId, 'proj_1');
    assert.equal(db.getRenderJob('missing'), null);
    db.close();

    // Corrupt rows directly in SQLite and confirm AnimForgeDatabase rejects them
    const raw = new DatabaseSync(dbPath);
    raw.exec(`
      INSERT INTO projects (id, name, prompt, data, created_at, updated_at)
      VALUES ('proj_corrupt', 'Bad', 'Bad', '{"id":"proj_corrupt"}', '${now}', '${now}');
      INSERT INTO render_jobs (id, project_id, engine, status, progress, output_path, error, started_at, finished_at)
      VALUES ('job_corrupt', 'proj_1', 'givemotion', 'bogus_status', 50, NULL, NULL, '${now}', NULL);
    `);
    raw.close();

    const reopened = new AnimForgeDatabase(dbPath);
    assert.throws(() => reopened.getProject('proj_corrupt'));
    assert.throws(() => reopened.getRenderJob('job_corrupt'));
    reopened.close();
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
