import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const runIntegration = process.env.ANIMFORGE_INTEGRATION === '1';

function parsePayload(res: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = res.content[0];
  assert.equal(first?.type, 'text');
  return JSON.parse(first.text as string) as Record<string, unknown>;
}

describe('AnimForge MCP Real Chrome + FFmpeg E2E Integration', () => {
  it(
    'runs full OpenCode stdio workflow: handshake -> doctor -> project -> scene -> preview -> real MP4 export + ffprobe -> mid-render cancel -> clean exit',
    { skip: !runIntegration, timeout: 90_000 },
    async () => {
      const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'af-mcp-e2e- '));
      const ws = path.join(tmpBase, 'workspace ');
      await fs.mkdir(path.join(ws, 'assets', 'props'), { recursive: true });
      await fs.mkdir(path.join(ws, 'projects'), { recursive: true });

      const serverEntry = path.resolve(import.meta.dirname, '..', 'src', 'mcp', 'index.js');
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [serverEntry, ws],
        stderr: 'pipe',
      });
      const client = new Client({ name: 'opencode-e2e-test', version: '1.0.0' });

      try {
        await client.connect(transport);
        const tools = await client.listTools();
        assert.equal(tools.tools.length, 16);

        const doc = parsePayload(
          (await client.callTool({ name: 'animforge_doctor', arguments: {} })) as {
            content: Array<{ type: string; text?: string }>;
          }
        );
        assert.equal(doc.ok, true);
        assert.equal((doc.doctor as Record<string, unknown>).chromeOk, true);
        assert.equal((doc.doctor as Record<string, unknown>).ffmpegOk, true);
        assert.equal((doc.doctor as Record<string, unknown>).ffprobeOk, true);

        await client.callTool({
          name: 'animforge_create_project',
          arguments: {
            projectId: 'proj_mcp_e2e',
            name: 'MCP Real MP4',
            prompt: 'Pip waves in studio',
            width: 1280,
            height: 720,
            fps: 30,
          },
        });

        // Shorten total scenes to 1 scene (~1.5s) for crisp real Chrome + FFmpeg test speed
        await client.callTool({
          name: 'animforge_create_scene',
          arguments: {
            projectId: 'proj_mcp_e2e',
            sceneId: 'scene_1',
            title: 'Quick Intro',
            description: 'Pip waves cheerfully',
            duration: 1.5,
            sequenceIndex: 0,
            confirmOverwrite: true,
          },
        });

        await client.callTool({
          name: 'animforge_create_animation',
          arguments: {
            projectId: 'proj_mcp_e2e',
            sceneId: 'scene_1',
            characterId: 'char_pip',
            actionName: 'wave',
            startTime: 0,
            duration: 1.2,
          },
        });

        const preview = parsePayload(
          (await client.callTool({
            name: 'animforge_generate_preview',
            arguments: { projectId: 'proj_mcp_e2e' },
          })) as { content: Array<{ type: string; text?: string }> }
        );
        assert.equal(preview.ok, true);
        await fs.access(preview.bundleIndexHtml as string);
        await fs.access(path.join(preview.bundleDir as string, 'gm-player.js'));

        // Real Chrome + FFmpeg export + ffprobe verification
        const exported = await client.callTool({
          name: 'animforge_export_video',
          arguments: {
            projectId: 'proj_mcp_e2e',
            confirm: true,
            wait: true,
            timeoutMs: 60_000,
          },
        });
        assert.notEqual(exported.isError, true);
        const exportData = parsePayload(exported as { content: Array<{ type: string; text?: string }> });
        assert.equal(exportData.ok, true);
        assert.equal(typeof exportData.videoPath, 'string');
        assert.ok((exportData.fileSizeBytes as number) > 10_000);

        const ffprobe = exportData.ffprobe as Record<string, unknown>;
        assert.equal(ffprobe.codec, 'h264');
        assert.equal(ffprobe.width, 1280);
        assert.equal(ffprobe.height, 720);
        assert.ok((ffprobe.durationSeconds as number) >= 1.0);

        const statusAfter = parsePayload(
          (await client.callTool({
            name: 'animforge_get_render_status',
            arguments: { jobId: exportData.jobId as string },
          })) as { content: Array<{ type: string; text?: string }> }
        );
        assert.equal(statusAfter.status, 'completed');

        // Real mid-render cancellation via non-blocking wait=false + animforge_cancel_render
        const asyncStart = parsePayload(
          (await client.callTool({
            name: 'animforge_export_video',
            arguments: { projectId: 'proj_mcp_e2e', confirm: true, wait: false },
          })) as { content: Array<{ type: string; text?: string }> }
        );
        assert.equal(asyncStart.started, true);
        await new Promise((r) => setTimeout(r, 250));
        const cancelled = parsePayload(
          (await client.callTool({
            name: 'animforge_cancel_render',
            arguments: { projectId: 'proj_mcp_e2e' },
          })) as { content: Array<{ type: string; text?: string }> }
        );
        assert.equal(cancelled.cancelled, true);
      } finally {
        await client.close();
        await fs.rm(tmpBase, { recursive: true, force: true });
      }
    }
  );
});
