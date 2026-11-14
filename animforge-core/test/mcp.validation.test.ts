import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { McpToolError, toToolErrorResult } from '../src/mcp/errors.js';
import {
  assertApprovedAssetSourcePath,
  assertAllowedAssetExtension,
  requireConfirmation,
  validateWorkspaceDir,
} from '../src/mcp/validation.js';
import { ToolInputSchemas } from '../src/mcp/schemas.js';

describe('MCP validation, path jail, and schemas', () => {
  it('preserves trailing spaces on workspace dir and rejects invalid workspaces', async () => {
    const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'af-mcp-val- '));
    const ws = path.join(tmpBase, 'ws ');
    await fs.mkdir(ws, { recursive: true });

    try {
      const resolved = await validateWorkspaceDir(ws);
      assert.equal(resolved.endsWith('ws '), true);

      await assert.rejects(() => validateWorkspaceDir(''), /workspace/i);
      await assert.rejects(() => validateWorkspaceDir('foo\0bar'), /workspace/i);
      await assert.rejects(
        () => validateWorkspaceDir(path.join(tmpBase, 'missing ')),
        /workspace/i
      );
    } finally {
      await fs.rm(tmpBase, { recursive: true, force: true });
    }
  });

  it('allows safe workspace assets and blocks traversal, .env, outside paths, and symlink escapes', async () => {
    const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'af-mcp-src- '));
    const ws = path.join(tmpBase, 'workspace ');
    const outside = path.join(tmpBase, 'outside-secret.png');
    await fs.mkdir(path.join(ws, 'assets', 'characters'), { recursive: true });
    await fs.mkdir(path.join(ws, 'projects', 'proj_1', 'assets'), { recursive: true });
    await fs.writeFile(path.join(ws, 'assets', 'characters', 'pip.png'), 'pngdata');
    await fs.writeFile(path.join(ws, '.env'), 'SECRET=1');
    await fs.writeFile(path.join(ws, 'projects', 'animforge.db'), 'sqlite');
    await fs.writeFile(outside, 'secret');
    await fs.symlink(outside, path.join(ws, 'assets', 'characters', 'escape.png'));

    try {
      const ok = await assertApprovedAssetSourcePath(ws, 'assets/characters/pip.png');
      assert.equal(ok, path.join(path.resolve(ws), 'assets', 'characters', 'pip.png'));

      await assert.rejects(
        () => assertApprovedAssetSourcePath(ws, '../outside-secret.png'),
        /traversal|jail|outside/i
      );
      await assert.rejects(
        () => assertApprovedAssetSourcePath(ws, '.env'),
        /approved|hidden|extension/i
      );
      await assert.rejects(
        () => assertApprovedAssetSourcePath(ws, '/etc/passwd'),
        /absolute/i
      );
      await assert.rejects(
        () => assertApprovedAssetSourcePath(ws, 'projects/animforge.db'),
        /approved|extension|project/i
      );
      await assert.rejects(
        () => assertApprovedAssetSourcePath(ws, 'assets/characters/escape.png'),
        /symlink/i
      );
      await assert.rejects(
        () => assertApprovedAssetSourcePath(ws, 'engines/givemotion/src/cli.js'),
        /approved|assets/i
      );
    } finally {
      await fs.rm(tmpBase, { recursive: true, force: true });
    }
  });

  it('enforces asset extension allowlist, confirmation helper, and error serialization', () => {
    assert.equal(assertAllowedAssetExtension('hero.PNG'), '.png');
    assert.throws(() => assertAllowedAssetExtension('payload.sh'), /unsupported/i);
    assert.throws(() => assertAllowedAssetExtension('.env'), /unsupported|hidden/i);

    assert.doesNotThrow(() => requireConfirmation(true, 'export video'));
    assert.throws(() => requireConfirmation(false, 'export video'), McpToolError);

    const errRes = toToolErrorResult(new McpToolError('CONFIRMATION_REQUIRED', 'Need confirm: true'));
    assert.equal(errRes.isError, true);
    const parsed = JSON.parse(errRes.content[0].text) as { ok: boolean; code: string };
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, 'CONFIRMATION_REQUIRED');
  });

  it('enforces strict Zod input schemas for all 16 tools', () => {
    assert.equal(Object.keys(ToolInputSchemas).length, 16);

    const okCreate = ToolInputSchemas.animforge_create_project.safeParse({
      name: 'Demo',
      prompt: 'Pip waves',
    });
    assert.equal(okCreate.success, true);

    const badProjectId = ToolInputSchemas.animforge_get_project.safeParse({
      projectId: '../evil',
    });
    assert.equal(badProjectId.success, false);

    const badDuration = ToolInputSchemas.animforge_create_scene.safeParse({
      projectId: 'proj_1',
      title: 'Intro',
      description: 'desc',
      duration: -2,
      sequenceIndex: 0,
    });
    assert.equal(badDuration.success, false);

    const badAction = ToolInputSchemas.animforge_create_animation.safeParse({
      projectId: 'proj_1',
      sceneId: 'scene_1',
      characterId: 'char_pip',
      actionName: 'rm -rf /',
      startTime: 0,
      duration: 1,
    });
    assert.equal(badAction.success, false);

    const exportUnconfirmed = ToolInputSchemas.animforge_export_video.safeParse({
      projectId: 'proj_1',
    });
    assert.equal(exportUnconfirmed.success, false);
  });
});
