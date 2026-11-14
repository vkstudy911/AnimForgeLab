import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { AnimForgeDatabase } from '../src/database.js';
import type { Project, RenderJob } from '../schemas/index.js';

function makeProject(id: string, name: string): Project {
  const now = new Date('2026-11-12T10:00:00.000Z').toISOString();
  return {
    id,
    name,
    prompt: `Prompt for ${name}`,
    width: 1280,
    height: 720,
    fps: 30,
    preferredEngine: 'givemotion',
    status: 'created',
    characters: [],
    assets: [],
    scenes: [],
    createdAt: now,
    updatedAt: now,
  };
}

function makeRenderJob(id: string, projectId: string, startedAt: string, status: RenderJob['status'] = 'completed'): RenderJob {
  return {
    id,
    projectId,
    engine: 'givemotion',
    status,
    progress: status === 'completed' ? 100 : 25,
    outputFilePath: `/tmp/${projectId}/output.mp4`,
    startedAt,
    ...(status === 'completed' ? { finishedAt: startedAt } : {}),
  };
}

test('AnimForgeDatabase deleteProject removes project + render_jobs transactionally and listRenderJobs filters cleanly', async () => {
  const tmpParent = await fs.mkdtemp(path.join(os.tmpdir(), 'af db trailing '));
  const dbPath = path.join(tmpParent, 'nested ', 'animforge.db');
  const db = new AnimForgeDatabase(dbPath);

  try {
    db.saveProject(makeProject('proj_a', 'Project Alpha'));
    db.saveProject(makeProject('proj_b', 'Project Beta'));

    db.saveRenderJob(makeRenderJob('job_a1', 'proj_a', '2026-11-12T10:01:00.000Z', 'failed'));
    db.saveRenderJob(makeRenderJob('job_a2', 'proj_a', '2026-11-12T10:02:00.000Z', 'completed'));
    db.saveRenderJob(makeRenderJob('job_b1', 'proj_b', '2026-11-12T10:03:00.000Z', 'completed'));

    const allJobs = db.listRenderJobs();
    assert.deepEqual(
      allJobs.map((j) => j.id),
      ['job_b1', 'job_a2', 'job_a1']
    );

    const aJobs = db.listRenderJobs('proj_a');
    assert.deepEqual(
      aJobs.map((j) => j.id),
      ['job_a2', 'job_a1']
    );

    assert.deepEqual(db.listRenderJobs('proj_unknown'), []);
    assert.equal(db.deleteProject('proj_unknown'), false);

    assert.equal(db.deleteProject('proj_a'), true);
    assert.equal(db.getProject('proj_a'), null);
    assert.deepEqual(db.listRenderJobs('proj_a'), []);

    // Project B and its render job must remain intact
    assert.equal(db.getProject('proj_b')?.name, 'Project Beta');
    assert.deepEqual(
      db.listRenderJobs('proj_b').map((j) => j.id),
      ['job_b1']
    );
    assert.equal(db.listProjects().length, 1);
    assert.equal(db.listProjects()[0].preferredEngine, 'givemotion');
  } finally {
    db.close();
    await fs.rm(tmpParent, { recursive: true, force: true });
  }
});

test('AnimForgeDatabase reconcileDiskProjects synchronizes unindexed disk projects and newer manifests into SQLite', async () => {
  const tmpParent = await fs.mkdtemp(path.join(os.tmpdir(), 'af db reconcile '));
  const projectsDir = path.join(tmpParent, 'projects');
  const dbPath = path.join(projectsDir, 'animforge.db');
  await fs.mkdir(projectsDir, { recursive: true });
  const db = new AnimForgeDatabase(dbPath);

  try {
    // 1. Initial db is empty
    assert.equal(db.listProjects().length, 0);

    // 2. Add a project on disk without adding to db
    const proj1Dir = path.join(projectsDir, 'proj_disk_1');
    await fs.mkdir(proj1Dir, { recursive: true });
    await fs.writeFile(
      path.join(proj1Dir, 'project.animforge.json'),
      JSON.stringify({
        config: { name: 'Disk Project One', prompt: 'Prompt 1', width: 1920, height: 1080, fps: 30, preferredEngine: 'givemotion' },
        scenes: [],
        characters: [],
        assets: [],
      }),
      'utf-8'
    );

    // 3. listProjects without projectsDir returns 0
    assert.equal(db.listProjects().length, 0);

    // 4. listProjects with projectsDir reconciles the project into SQLite
    const reconciled = db.listProjects(projectsDir);
    assert.equal(reconciled.length, 1);
    assert.equal(reconciled[0].id, 'proj_disk_1');
    assert.equal(reconciled[0].name, 'Disk Project One');

    // 5. Subsequent getProject finds it in SQLite
    const loaded = db.getProject('proj_disk_1');
    assert.equal(loaded?.name, 'Disk Project One');

    // 6. External update to disk manifest updates SQLite when reconciled
    await new Promise((r) => setTimeout(r, 600)); // ensure mtime advances > 500ms
    await fs.writeFile(
      path.join(proj1Dir, 'project.animforge.json'),
      JSON.stringify({
        config: { name: 'Disk Project Renamed', prompt: 'Prompt 1', width: 1920, height: 1080, fps: 30, preferredEngine: 'givemotion' },
        scenes: [],
        characters: [],
        assets: [],
      }),
      'utf-8'
    );

    const refreshed = db.listProjects(projectsDir);
    assert.equal(refreshed.length, 1);
    assert.equal(refreshed[0].name, 'Disk Project Renamed');
  } finally {
    db.close();
    await fs.rm(tmpParent, { recursive: true, force: true });
  }
});
