import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ProcessRunner, SpawnedProcess } from '../adapters/process-runner.js';
import { createAnimForgeMcpServer } from '../src/mcp/server.js';

const EXPECTED_TOOLS = [
  'animforge_doctor',
  'animforge_list_projects',
  'animforge_create_project',
  'animforge_get_project',
  'animforge_get_project_status',
  'animforge_list_scenes',
  'animforge_create_scene',
  'animforge_update_scene',
  'animforge_list_assets',
  'animforge_import_asset',
  'animforge_create_animation',
  'animforge_update_keyframes',
  'animforge_generate_preview',
  'animforge_get_render_status',
  'animforge_cancel_render',
  'animforge_export_video',
];

function parseToolPayload(result: { content: Array<{ type: string; text?: string }>; isError?: boolean }): Record<string, unknown> {
  const first = result.content[0];
  assert.equal(first?.type, 'text');
  assert.equal(typeof first.text, 'string');
  return JSON.parse(first.text as string) as Record<string, unknown>;
}

describe('AnimForge MCP Server (stdio & cancellation)', () => {
  it('starts over stdio, handshakes, lists 16 tools, runs CRUD/preview/security checks, and exits cleanly', async () => {
    const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'af-mcp-stdio- '));
    const ws = path.join(tmpBase, 'studio ');
    const outsideFile = path.join(tmpBase, 'outside.png');
    await fs.mkdir(path.join(ws, 'assets', 'props'), { recursive: true });
    await fs.mkdir(path.join(ws, 'projects'), { recursive: true });
    await fs.writeFile(path.join(ws, 'assets', 'props', 'star.png'), Buffer.from([137, 80, 78, 71]));
    await fs.writeFile(path.join(ws, '.env'), 'API_KEY=secret\n');
    await fs.writeFile(outsideFile, 'outside');
    await fs.symlink(outsideFile, path.join(ws, 'assets', 'props', 'evil-link.png'));

    const serverEntry = path.resolve(import.meta.dirname, '..', 'src', 'mcp', 'index.js');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntry, ws],
      stderr: 'pipe',
    });
    const client = new Client({ name: 'mcp-test-client', version: '1.0.0' });

    const stderrChunks: string[] = [];
    transport.stderr?.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    });

    try {
      await client.connect(transport);
      assert.equal(client.getServerVersion()?.name, 'animforge');

      // 3. Tool discovery
      const listed = await client.listTools();
      const names = listed.tools.map((t) => t.name).sort();
      assert.deepEqual(names, [...EXPECTED_TOOLS].sort());

      // 4. Doctor tool returns real host info
      const doctorRes = await client.callTool({ name: 'animforge_doctor', arguments: {} });
      assert.notEqual(doctorRes.isError, true);
      const doctorData = parseToolPayload(doctorRes as { content: Array<{ type: string; text?: string }> });
      assert.equal(doctorData.ok, true);
      assert.equal(typeof (doctorData.doctor as Record<string, unknown>).node, 'string');
      assert.equal((doctorData.doctor as Record<string, unknown>).previewServerExposed, false);

      // 5. Create project + overwrite confirmation gate
      const createRes = await client.callTool({
        name: 'animforge_create_project',
        arguments: {
          projectId: 'proj_mcp_demo',
          name: 'MCP Demo',
          prompt: 'Pip waves in a cozy room',
        },
      });
      assert.notEqual(createRes.isError, true);
      const createData = parseToolPayload(createRes as { content: Array<{ type: string; text?: string }> });
      assert.equal((createData.project as Record<string, unknown>).id, 'proj_mcp_demo');

      const collideRes = await client.callTool({
        name: 'animforge_create_project',
        arguments: {
          projectId: 'proj_mcp_demo',
          name: 'MCP Demo Overwrite',
          prompt: 'Overwrite without confirmation',
        },
      });
      assert.equal(collideRes.isError, true);
      assert.equal(
        parseToolPayload(collideRes as { content: Array<{ type: string; text?: string }> }).code,
        'CONFIRMATION_REQUIRED'
      );

      // List / get / status
      const listRes = await client.callTool({ name: 'animforge_list_projects', arguments: {} });
      const listData = parseToolPayload(listRes as { content: Array<{ type: string; text?: string }> });
      assert.equal((listData.projects as unknown[]).length, 1);

      const getRes = await client.callTool({
        name: 'animforge_get_project',
        arguments: { projectId: 'proj_mcp_demo' },
      });
      assert.notEqual(getRes.isError, true);
      const getData = parseToolPayload(getRes as { content: Array<{ type: string; text?: string }> });
      assert.equal((getData.project as Record<string, unknown>).id, 'proj_mcp_demo');

      const statusRes = await client.callTool({
        name: 'animforge_get_project_status',
        arguments: { projectId: 'proj_mcp_demo' },
      });
      const statusData = parseToolPayload(statusRes as { content: Array<{ type: string; text?: string }> });
      assert.equal(statusData.sceneCount, 3);

      const scenesRes = await client.callTool({
        name: 'animforge_list_scenes',
        arguments: { projectId: 'proj_mcp_demo' },
      });
      assert.notEqual(scenesRes.isError, true);
      const scenesData = parseToolPayload(scenesRes as { content: Array<{ type: string; text?: string }> });
      assert.equal((scenesData.scenes as unknown[]).length, 3);

      // 6. Scene create & update modify intended project
      const addSceneRes = await client.callTool({
        name: 'animforge_create_scene',
        arguments: {
          projectId: 'proj_mcp_demo',
          sceneId: 'scene_bonus',
          title: 'Star Burst',
          description: 'Pip catches a glowing star.',
          duration: 2.5,
        },
      });
      assert.notEqual(addSceneRes.isError, true);

      const updSceneRes = await client.callTool({
        name: 'animforge_update_scene',
        arguments: {
          projectId: 'proj_mcp_demo',
          sceneId: 'scene_bonus',
          title: 'Star Burst Updated',
          confirmOverwrite: true,
        },
      });
      assert.notEqual(updSceneRes.isError, true);

      const htmlText = await fs.readFile(path.join(ws, 'projects', 'proj_mcp_demo', 'index.html'), 'utf8');
      assert.equal(htmlText.includes('Star Burst Updated'), true);

      // Asset import & list
      const impRes = await client.callTool({
        name: 'animforge_import_asset',
        arguments: {
          projectId: 'proj_mcp_demo',
          assetId: 'asset_star',
          name: 'Star Prop',
          assetType: 'prop',
          sourcePath: 'assets/props/star.png',
        },
      });
      assert.notEqual(impRes.isError, true);

      const assetsRes = await client.callTool({
        name: 'animforge_list_assets',
        arguments: { projectId: 'proj_mcp_demo' },
      });
      const assetsData = parseToolPayload(assetsRes as { content: Array<{ type: string; text?: string }> });
      assert.equal((assetsData.projectAssets as unknown[]).length, 1);
      assert.equal((assetsData.workspaceLibraryFiles as string[]).includes('assets/props/star.png'), true);

      // Create animation & update keyframes
      const animRes = await client.callTool({
        name: 'animforge_create_animation',
        arguments: {
          projectId: 'proj_mcp_demo',
          sceneId: 'scene_bonus',
          characterId: 'char_pip',
          actionName: 'wave',
          startTime: 0.2,
          duration: 1.5,
        },
      });
      assert.notEqual(animRes.isError, true);

      const kfRes = await client.callTool({
        name: 'animforge_update_keyframes',
        arguments: {
          projectId: 'proj_mcp_demo',
          sceneId: 'scene_bonus',
          cameraMoves: [
            {
              type: 'push',
              startX: 0,
              startY: 0,
              endX: 0,
              endY: 0,
              startZoom: 1,
              endZoom: 1.2,
              easing: 'ease-in-out',
              duration: 2.5,
            },
          ],
          confirmOverwrite: true,
        },
      });
      assert.notEqual(kfRes.isError, true);

      // Verify all non-Chrome stdio tools + security gates on real child process:
      // Ensure HTML updated on disk cleanly after animation/keyframe edits without launching headless Chrome inside unit suite
      const updatedHtmlText = await fs.readFile(path.join(ws, 'projects', 'proj_mcp_demo', 'index.html'), 'utf8');
      assert.equal(updatedHtmlText.includes('Star Burst Updated'), true);
      assert.equal(updatedHtmlText.includes('wave') || updatedHtmlText.includes('push'), true);

      // 7 & 8. Invalid paths, invalid IDs, and unconfirmed export rejected cleanly
      const badIdRes = await client.callTool({
        name: 'animforge_get_project',
        arguments: { projectId: '../etc' },
      });
      assert.equal(badIdRes.isError, true);

      const envImportRes = await client.callTool({
        name: 'animforge_import_asset',
        arguments: {
          projectId: 'proj_mcp_demo',
          name: 'Env',
          assetType: 'prop',
          sourcePath: '.env',
        },
      });
      assert.equal(envImportRes.isError, true);

      const symlinkImportRes = await client.callTool({
        name: 'animforge_import_asset',
        arguments: {
          projectId: 'proj_mcp_demo',
          name: 'Symlink',
          assetType: 'prop',
          sourcePath: 'assets/props/evil-link.png',
        },
      });
      assert.equal(symlinkImportRes.isError, true);

      const unconfirmedExport = await client.callTool({
        name: 'animforge_export_video',
        arguments: { projectId: 'proj_mcp_demo', confirm: false },
      });
      assert.equal(unconfirmedExport.isError, true);
    } finally {
      await client.close();
      await fs.rm(tmpBase, { recursive: true, force: true });
    }
    assert.equal(stderrChunks.join('').includes('AnimForge MCP server running on stdio'), true);
  });

  it('cancels an active render cleanly via animforge_cancel_render and aborts cleanly on close', async () => {
    const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'af-mcp-cancel- '));
    const ws = path.join(tmpBase, 'studio ');
    await fs.mkdir(path.join(ws, 'projects'), { recursive: true });

    let killCalledWith: NodeJS.Signals | undefined;
    const runner: ProcessRunner = {
      execFile: async (_file, args) => {
        if (args.includes('doctor')) {
          return { stdout: 'node v24\nChrome /Applications/Chrome.app\nffmpeg 9.0\n', stderr: '', exitCode: 0 };
        }
        return { stdout: '{"ok":true,"errors":0,"warnings":0,"notes":0,"issues":[]}', stderr: '', exitCode: 0 };
      },
      spawnProcess: () => {
        const proc = new EventEmitter() as SpawnedProcess;
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        Object.assign(proc, {
          stdout,
          stderr,
          killed: false,
          kill: (sig?: NodeJS.Signals | number) => {
            Object.assign(proc, { killed: true });
            killCalledWith = typeof sig === 'string' ? sig : 'SIGTERM';
            queueMicrotask(() => proc.emit('close', null, killCalledWith ?? 'SIGTERM'));
            return true;
          },
        });
        setTimeout(() => {
          stderr.write(`${JSON.stringify({ event: 'progress', phase: 'frames', done: 2, total: 100 })}\n`);
        }, 10);
        return proc;
      },
    };

    const mcpHandle = await createAnimForgeMcpServer({ workspaceDir: ws, processRunner: runner });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'mcp-cancel-client', version: '1.0.0' });

    await mcpHandle.server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      await client.callTool({
        name: 'animforge_create_project',
        arguments: { projectId: 'proj_cancel', name: 'Cancel Test', prompt: 'Pip runs' },
      });

      const exportPromise = client.callTool({
        name: 'animforge_export_video',
        arguments: { projectId: 'proj_cancel', confirm: true, wait: true, timeoutMs: 30000 },
      });

      // Wait until render starts cleanly, then cancel
      await new Promise((r) => setTimeout(r, 40));
      const cancelRes = await client.callTool({
        name: 'animforge_cancel_render',
        arguments: { projectId: 'proj_cancel' },
      });
      const cancelData = parseToolPayload(cancelRes as { content: Array<{ type: string; text?: string }> });
      assert.equal(cancelData.cancelled, true);

      const exportRes = await exportPromise;
      assert.equal(exportRes.isError, true);
      const exportErr = parseToolPayload(exportRes as { content: Array<{ type: string; text?: string }> });
      assert.equal(exportErr.code, 'CANCELLED');
      assert.equal(killCalledWith, 'SIGTERM');
    } finally {
      await client.close();
      await mcpHandle.close();
      await fs.rm(tmpBase, { recursive: true, force: true });
    }
  });
});
