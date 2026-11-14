import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { AnimForgeDatabase } from '../src/database.js';
import { AnimForgeMcpService } from '../src/mcp/tools.js';
import { GivemotionAdapter } from '../adapters/givemotion.adapter.js';
import { createNodeProcessRunner } from '../adapters/process-runner.js';
import { assertSafeId, resolveProjectDir, resolveWorkspacePath } from '../utils/paths.js';

function findWorkspaceRoot(startDir: string): string {
  let cur = startDir;
  while (cur !== path.dirname(cur)) {
    if (fsSync.existsSync(path.join(cur, 'animforge-core')) && fsSync.existsSync(path.join(cur, 'projects'))) {
      return cur;
    }
    cur = path.dirname(cur);
  }
  return cur;
}

const workspaceDir = findWorkspaceRoot(import.meta.dirname);

test('Workflow A: Open & Preview Existing Project Dancer (proj_1794470257338_1) in Interactive Player without MP4', async () => {
  const dancerId = 'proj_1794470257338_1';
  const projectDir = resolveProjectDir(workspaceDir, dancerId);
  const manifestPath = path.join(projectDir, 'project.animforge.json');
  assert.ok(fsSync.existsSync(manifestPath), 'Dancer manifest must exist');

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
  assert.equal(manifest.config.name, 'Dancer');
  assert.equal(manifest.scenes.length, 3, 'Dancer must retain 3 scenes');
  assert.equal(manifest.characters.some((c: { name: string }) => c.name === 'Pip'), true, 'Dancer must have Pip');

  const db = new AnimForgeDatabase(path.join(workspaceDir, 'projects', 'animforge.db'));
  try {
    const list = db.listProjects(path.join(workspaceDir, 'projects'));
    const dancerSummary = list.find((p) => p.id === dancerId);
    assert.ok(dancerSummary, 'Dancer must be indexed in project list');
    assert.equal(dancerSummary?.name, 'Dancer');
    assert.equal(dancerSummary?.hasBundle, true, 'Dancer has precompiled bundle');

    const runner = createNodeProcessRunner();
    const adapter = new GivemotionAdapter(
      workspaceDir,
      path.join(workspaceDir, 'engines', 'givemotion', 'src', 'cli.js'),
      runner
    );

    const preview = await adapter.previewProject(dancerId);
    assert.equal(preview.ok, true, 'Interactive preview must succeed without requiring MP4 export');
    assert.ok(fsSync.existsSync(preview.bundleIndexHtml), 'bundle/index.html must exist');
    assert.ok(fsSync.existsSync(preview.playerHtml), 'bundle/player.html must exist');

    const mp4Path = path.join(projectDir, 'output.mp4');
    assert.equal(fsSync.existsSync(mp4Path), false, 'Interactive preview must work WITHOUT requiring output.mp4');
  } finally {
    db.close();
  }
});

test('Workflow B: Edit Project Metadata (Name, prompt, dimensions, FPS, engine, save, discard, persist)', async () => {
  const db = new AnimForgeDatabase(path.join(workspaceDir, 'projects', 'animforge.db'));
  const runner = createNodeProcessRunner();
  const adapter = new GivemotionAdapter(
    workspaceDir,
    path.join(workspaceDir, 'engines', 'givemotion', 'src', 'cli.js'),
    runner
  );
  const testId = `proj_wf_b_${Date.now()}`;
  const projectDir = resolveProjectDir(workspaceDir, testId);

  try {
    // 1. Create initial project
    await adapter.createProject(testId, {
      name: 'Initial Name',
      prompt: 'Initial prompt describing the story',
      width: 1280,
      height: 720,
      fps: 30,
      preferredEngine: 'givemotion',
    });

    const initialProject = {
      id: testId,
      name: 'Initial Name',
      prompt: 'Initial prompt describing the story',
      width: 1280,
      height: 720,
      fps: 30,
      preferredEngine: 'givemotion' as const,
      status: 'created' as const,
      characters: [],
      assets: [],
      scenes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveProject(initialProject);

    // 2. Edit metadata
    const editedProject = {
      ...initialProject,
      name: 'Updated Cinematic Name',
      prompt: 'Updated prompt with rich cinematic lighting',
      width: 1920,
      height: 1080,
      fps: 60,
      updatedAt: new Date().toISOString(),
    };

    // 3. Save draft to disk and database
    await adapter.saveProjectState(editedProject);
    db.saveProject(editedProject);

    // 4. Verify disk manifest
    const manifestPath = path.join(projectDir, 'project.animforge.json');
    const diskState = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    assert.equal(diskState.config.name, 'Updated Cinematic Name');
    assert.equal(diskState.config.width, 1920);
    assert.equal(diskState.config.height, 1080);
    assert.equal(diskState.config.fps, 60);

    // 5. Verify database reflection
    const dbProject = db.getProject(testId);
    assert.equal(dbProject?.name, 'Updated Cinematic Name');
    assert.equal(dbProject?.width, 1920);
    assert.equal(dbProject?.height, 1080);
    assert.equal(dbProject?.fps, 60);
  } finally {
    db.deleteProject(testId);
    await fs.rm(projectDir, { recursive: true, force: true });
    db.close();
  }
});

test('Workflow C: Edit Scene (Select scene, change title, description, duration, transition, camera, save, regenerate preview)', async () => {
  const db = new AnimForgeDatabase(path.join(workspaceDir, 'projects', 'animforge.db'));
  const runner = createNodeProcessRunner();
  const adapter = new GivemotionAdapter(
    workspaceDir,
    path.join(workspaceDir, 'engines', 'givemotion', 'src', 'cli.js'),
    runner
  );
  const testId = `proj_wf_c_${Date.now()}`;
  const projectDir = resolveProjectDir(workspaceDir, testId);

  try {
    await adapter.createProject(testId, {
      name: 'Scene Edit Project',
      prompt: 'A quick scene edit test',
      width: 1280,
      height: 720,
      fps: 30,
      preferredEngine: 'givemotion',
    });

    const sceneId = 'scene_test_1';
    await adapter.createScene({
      id: sceneId,
      projectId: testId,
      sequenceIndex: 0,
      title: 'Original Scene 1',
      description: 'Original description',
      duration: 3,
      characterIds: [],
      timeline: {
        duration: 3,
        fps: 30,
        characterActions: [],
        cameraMoves: [{ type: 'pan', startX: 0, startY: 0, endX: 50, endY: 0, startZoom: 1, endZoom: 1, easing: 'ease-out', duration: 3 }],
        audioTracks: [],
      },
      transition: { type: 'fade', duration: 0.5 },
    });

    // Generate initial preview bundle
    const initialPreview = await adapter.previewProject(testId);
    assert.equal(initialPreview.ok, true);

    // Update scene properties
    await adapter.createScene({
      id: sceneId,
      projectId: testId,
      sequenceIndex: 0,
      title: 'Updated Scene Title',
      description: 'Modified camera and duration',
      duration: 4.5,
      characterIds: [],
      timeline: {
        duration: 4.5,
        fps: 30,
        characterActions: [],
        cameraMoves: [{ type: 'zoom', startX: 0, startY: 0, endX: 0, endY: 0, startZoom: 1, endZoom: 1.5, easing: 'ease-in-out', duration: 4.5 }],
        audioTracks: [],
      },
      transition: { type: 'slide', duration: 0.8 },
    });

    // Verify index.html contains updated scene title and duration
    const indexHtml = await fs.readFile(path.join(projectDir, 'index.html'), 'utf-8');
    assert.ok(indexHtml.includes('Updated Scene Title'), 'index.html must reflect edited title');

    // Regenerate preview
    const updatedPreview = await adapter.previewProject(testId);
    assert.equal(updatedPreview.ok, true);

    const bundleIndexHtml = await fs.readFile(path.join(projectDir, 'bundle', 'index.html'), 'utf-8');
    assert.ok(bundleIndexHtml.includes('Updated Scene Title'), 'bundle/index.html must reflect edited scene title');
  } finally {
    db.deleteProject(testId);
    await fs.rm(projectDir, { recursive: true, force: true });
    db.close();
  }
});

test('Workflow D: Preview Before Export (Generate preview, wait for readiness, play sequence without blank canvas)', async () => {
  const db = new AnimForgeDatabase(path.join(workspaceDir, 'projects', 'animforge.db'));
  const runner = createNodeProcessRunner();
  const adapter = new GivemotionAdapter(
    workspaceDir,
    path.join(workspaceDir, 'engines', 'givemotion', 'src', 'cli.js'),
    runner
  );
  const testId = `proj_wf_d_${Date.now()}`;
  const projectDir = resolveProjectDir(workspaceDir, testId);

  try {
    await adapter.createProject(testId, {
      name: 'Pre-Export Preview Test',
      prompt: 'Testing preview readiness',
      width: 1280,
      height: 720,
      fps: 30,
      preferredEngine: 'givemotion',
    });

    await adapter.createScene({
      id: 'scene_preview_ready',
      projectId: testId,
      sequenceIndex: 0,
      title: 'Ready Scene',
      description: 'Ready to play',
      duration: 2,
      characterIds: [],
      timeline: { duration: 2, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
      transition: { type: 'none', duration: 0 },
    });

    // Generate preview
    const result = await adapter.previewProject(testId);
    assert.equal(result.ok, true);
    assert.ok(result.bundleIndexHtml.endsWith('index.html'));
    assert.ok(result.playerHtml.endsWith('player.html'));

    // Check bundle content size
    const bundleStat = await fs.stat(result.bundleIndexHtml);
    assert.ok(bundleStat.size > 500, 'Bundle index.html must be populated with runtime HTML');

    const playerScript = await fs.stat(path.join(result.bundleDir, 'gm-player.js'));
    assert.ok(playerScript.size > 1000, 'gm-player.js must be present in bundle');
  } finally {
    db.deleteProject(testId);
    await fs.rm(projectDir, { recursive: true, force: true });
    db.close();
  }
});

test('Workflow E: MCP Synchronization (Bidirectional state synchronization between GUI and MCP tools)', async () => {
  const mcp = new AnimForgeMcpService({ workspaceDir });
  const db = new AnimForgeDatabase(path.join(workspaceDir, 'projects', 'animforge.db'));
  const testId = `proj_wf_e_${Date.now()}`;
  const projectDir = resolveProjectDir(workspaceDir, testId);

  try {
    // 1. Create project via MCP
    const created = await mcp.createProject({
      projectId: testId,
      name: 'MCP Sync Test',
      prompt: 'Synchronized project prompt',
      width: 1280,
      height: 720,
      fps: 30,
      preferredEngine: 'givemotion',
    });
    assert.equal(created.ok, true);

    // 2. Add scene via MCP
    const addedScene = await mcp.createScene({
      projectId: testId,
      sceneId: 'scene_sync_1',
      title: 'MCP Scene',
      description: 'Created by MCP',
      duration: 3,
      sequenceIndex: 0,
    });
    assert.equal(addedScene.ok, true);

    // 3. Verify GUI/Worker reads updated scene from SQLite and disk
    const dbProject = db.getProject(testId);
    assert.notEqual(dbProject, null);
    assert.equal(dbProject?.scenes.some((s) => s.id === 'scene_sync_1'), true);
    assert.equal(dbProject?.scenes.find((s) => s.id === 'scene_sync_1')?.title, 'MCP Scene');

    // 4. GUI simulates saving draft with scene title rename
    const runner = createNodeProcessRunner();
    const adapter = new GivemotionAdapter(
      workspaceDir,
      path.join(workspaceDir, 'engines', 'givemotion', 'src', 'cli.js'),
      runner
    );

    const guiModified = {
      ...dbProject!,
      name: 'GUI Renamed Project',
      scenes: [
        {
          ...dbProject!.scenes[0],
          title: 'GUI Renamed Scene',
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    await adapter.saveProjectState(guiModified);
    db.saveProject(guiModified);

    // 5. Verify MCP immediately reads the GUI-saved state
    const mcpLoaded = await mcp.getProject({ projectId: testId });
    assert.equal(mcpLoaded.ok, true);
    assert.equal((mcpLoaded.project as { name: string }).name, 'GUI Renamed Project');
    assert.equal(
      (mcpLoaded.project as { scenes: Array<{ title: string }> }).scenes[0].title,
      'GUI Renamed Scene'
    );
  } finally {
    await mcp.close();
    db.deleteProject(testId);
    await fs.rm(projectDir, { recursive: true, force: true });
    db.close();
  }
});
