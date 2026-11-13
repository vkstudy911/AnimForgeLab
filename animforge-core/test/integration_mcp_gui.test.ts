import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { AnimForgeDatabase } from '../src/database.js';
import { AnimForgeMcpService } from '../src/mcp/tools.js';
import { createNodeProcessRunner } from '../adapters/process-runner.js';
import { resolveWorkspacePath } from '../utils/paths.js';

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

test('E2E Integration Test 1: MCP create project -> Indexed in SQLite and retrievable via worker project_list', async () => {
  const mcp = new AnimForgeMcpService({ workspaceDir });
  const db = new AnimForgeDatabase(path.join(workspaceDir, 'projects', 'animforge.db'));
  const testId = `proj_e2e_mcp_${Date.now()}`;

  try {
    const createRes = await mcp.createProject({
      projectId: testId,
      name: 'E2E MCP Test Project',
      prompt: 'A boy and a robotic dog dance in a neon city.',
      width: 1920,
      height: 1080,
      fps: 30,
      preferredEngine: 'givemotion',
    });
    assert.equal(createRes.ok, true);

    // Verify row in SQLite
    const row = db.getProject(testId);
    assert.notEqual(row, null);
    assert.equal(row?.name, 'E2E MCP Test Project');

    // Verify file on disk
    const diskPath = path.join(workspaceDir, 'projects', testId, 'project.animforge.json');
    assert.equal(fsSync.existsSync(diskPath), true);

    // Verify listProjects reconciles and includes it
    const list = db.listProjects(path.join(workspaceDir, 'projects'));
    const found = list.find((p) => p.id === testId);
    assert.notEqual(found, undefined);
    assert.equal(found?.name, 'E2E MCP Test Project');
  } finally {
    await mcp.close();
    db.deleteProject(testId);
    await fs.rm(path.join(workspaceDir, 'projects', testId), { recursive: true, force: true });
    db.close();
  }
});

test('E2E Integration Test 2: GUI project update -> MCP immediately observes updated state', async () => {
  const mcp = new AnimForgeMcpService({ workspaceDir });
  const db = new AnimForgeDatabase(path.join(workspaceDir, 'projects', 'animforge.db'));
  const testId = `proj_e2e_gui_${Date.now()}`;

  try {
    // Create baseline via MCP
    await mcp.createProject({
      projectId: testId,
      name: 'GUI Baseline',
      prompt: 'Initial prompt',
    });

    // Simulate GUI saving updated name and prompt to SQLite and disk
    const project = db.getProject(testId)!;
    const updated = {
      ...project,
      name: 'GUI Updated Name',
      prompt: 'Prompt edited in Desktop GUI',
      updatedAt: new Date().toISOString(),
    };
    db.saveProject(updated);
    const diskPath = path.join(workspaceDir, 'projects', testId, 'project.animforge.json');
    await fs.writeFile(
      diskPath,
      JSON.stringify({
        config: { name: updated.name, prompt: updated.prompt, width: updated.width, height: updated.height, fps: updated.fps, preferredEngine: updated.preferredEngine },
        scenes: updated.scenes,
        characters: updated.characters,
        assets: updated.assets,
        updatedAt: updated.updatedAt,
      }),
      'utf-8'
    );

    // MCP retrieves project via getProject
    const mcpRes = await mcp.getProject({ projectId: testId });
    assert.equal(mcpRes.ok, true);
    const mcpProj = mcpRes.project as { name: string; prompt: string };
    assert.equal(mcpProj.name, 'GUI Updated Name');
    assert.equal(mcpProj.prompt, 'Prompt edited in Desktop GUI');
  } finally {
    await mcp.close();
    db.deleteProject(testId);
    await fs.rm(path.join(workspaceDir, 'projects', testId), { recursive: true, force: true });
    db.close();
  }
});

test('E2E Integration Test 3: MCP adds scene -> Worker/GUI immediately reloads updated scenes', async () => {
  const mcp = new AnimForgeMcpService({ workspaceDir });
  const db = new AnimForgeDatabase(path.join(workspaceDir, 'projects', 'animforge.db'));
  const testId = `proj_e2e_scene_${Date.now()}`;

  try {
    await mcp.createProject({
      projectId: testId,
      name: 'Scene Test Project',
      prompt: 'A girl discovers a secret garden.',
    });

    // MCP adds a new scene
    const addSceneRes = await mcp.createScene({
      projectId: testId,
      sceneId: 'scene_bonus_e2e',
      title: 'Bonus Scene by Agent',
      description: 'The golden flower blooms.',
      duration: 3,
    });
    assert.equal(addSceneRes.ok, true);

    // Worker loads project from DB or disk
    db.reconcileDiskProjects(path.join(workspaceDir, 'projects'));
    const reloaded = db.getProject(testId);
    assert.notEqual(reloaded, null);
    const hasBonus = reloaded?.scenes.some((s) => s.id === 'scene_bonus_e2e');
    assert.equal(hasBonus, true);
    assert.equal(reloaded?.scenes.find((s) => s.id === 'scene_bonus_e2e')?.title, 'Bonus Scene by Agent');
  } finally {
    await mcp.close();
    db.deleteProject(testId);
    await fs.rm(path.join(workspaceDir, 'projects', testId), { recursive: true, force: true });
    db.close();
  }
});

test('E2E Integration Test 4: Existing project Dancer (proj_1794470257338_1) integrity and non-destructive load', async () => {
  const db = new AnimForgeDatabase(path.join(workspaceDir, 'projects', 'animforge.db'));
  const mcp = new AnimForgeMcpService({ workspaceDir });

  try {
    const dancerId = 'proj_1794470257338_1';
    db.reconcileDiskProjects(path.join(workspaceDir, 'projects'));
    const dancer = db.getProject(dancerId);
    assert.notEqual(dancer, null, 'Dancer project must exist in SQLite or disk');
    assert.equal(dancer?.name, 'Dancer');
    assert.equal(dancer?.scenes.length, 3);
    assert.equal(dancer?.characters.length, 1);
    assert.equal(dancer?.characters[0].id, 'char_pip');

    // Verify bundle exists on disk
    const bundleIndex = path.join(workspaceDir, 'projects', dancerId, 'bundle', 'index.html');
    assert.equal(fsSync.existsSync(bundleIndex), true, 'bundle/index.html must exist for Dancer');

    // Verify MCP getProject loads Dancer cleanly
    const mcpRes = await mcp.getProject({ projectId: dancerId });
    assert.equal(mcpRes.ok, true);
    const mcpDancer = mcpRes.project as { name: string; scenes: Array<{ id: string }> };
    assert.equal(mcpDancer.name, 'Dancer');
    assert.equal(mcpDancer.scenes.length, 3);
  } finally {
    await mcp.close();
    db.close();
  }
});
