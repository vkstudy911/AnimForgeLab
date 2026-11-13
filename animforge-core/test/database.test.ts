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
