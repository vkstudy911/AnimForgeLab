import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { RenderProgressUpdate } from '../adapters/adapter.interface.js';
import { GivemotionAdapter } from '../adapters/givemotion.adapter.js';
import { CharacterManagerAgent } from '../agents/characterManager.js';

const execFileAsync = promisify(execFile);
const RUN_INTEGRATION = process.env.ANIMFORGE_INTEGRATION === '1';
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

interface FfprobeOutput {
  format?: {
    format_name?: string;
    duration?: string;
  };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
  }>;
}

test(
  'GiveMotion real Chrome + FFmpeg MP4 export and ffprobe validation in trailing-space workspace',
  { skip: !RUN_INTEGRATION, timeout: 120_000 },
  async () => {
    assert.equal(path.basename(WORKSPACE_ROOT), 'AnimForgeLab');
    assert.ok(path.dirname(WORKSPACE_ROOT).endsWith(' '), 'Expected parent directory with trailing space');

    const projectId = `proj_int_test_${Date.now()}`;
    const projectDir = path.join(WORKSPACE_ROOT, 'projects', projectId);
    const adapter = new GivemotionAdapter(WORKSPACE_ROOT);

    try {
      const doctor = await adapter.getDoctorInfo();
      assert.equal(doctor.chromeOk, true, `Chrome required for integration test: ${doctor.raw}`);
      assert.equal(doctor.ffmpegOk, true, `FFmpeg required for integration test: ${doctor.raw}`);
      await adapter.initialize();

      const pip = await new CharacterManagerAgent().createCharacter(
        'Pip',
        'Cute little green cartoon alien with expressive big eyes'
      );

      const createdId = await adapter.createProject(
        projectId,
        {
          name: 'Pip Real Render',
          prompt: 'Pip walks in and waves',
          width: 1280,
          height: 720,
          fps: 30,
          preferredEngine: 'givemotion',
        },
        [pip]
      );
      assert.equal(createdId, projectId);

      const sceneId = await adapter.createScene({
        id: 'scene_int_1',
        projectId,
        sequenceIndex: 0,
        title: 'Pip Arrival & Wave',
        description: 'Pip walks onto stage and waves cheerfully',
        duration: 2.0,
        characterIds: [pip.id],
        timeline: {
          duration: 2.0,
          fps: 30,
          characterActions: [
            { actionId: 'act_walk', name: 'walk', startTime: 0, duration: 1.5, parameters: {} },
            { actionId: 'act_wave', name: 'wave', startTime: 0.2, duration: 1.6, parameters: {} },
            { actionId: 'act_smile', name: 'smile', startTime: 0.4, duration: 1.4, parameters: {} },
          ],
          cameraMoves: [
            {
              type: 'push',
              startX: 0,
              startY: 0,
              endX: 0,
              endY: 0,
              startZoom: 1.0,
              endZoom: 1.15,
              easing: 'ease-in-out',
              duration: 2.0,
            },
          ],
          audioTracks: [],
        },
        transition: { type: 'fade', duration: 0.5 },
      });
      assert.equal(sceneId, 'scene_int_1');

      const previewRes = await adapter.previewProject(projectId);
      assert.equal(
        previewRes.ok,
        true,
        `Expected GiveMotion check ok=true, got issues: ${JSON.stringify(previewRes.issues)}`
      );
      assert.equal(previewRes.errors, 0);

      for (const bundleAsset of [
        previewRes.bundleIndexHtml,
        previewRes.playerHtml,
        path.join(previewRes.bundleDir, 'gm-player.js'),
      ]) {
        const stat = await fs.stat(bundleAsset);
        assert.ok(stat.isFile() && stat.size > 0, `Missing bundle file: ${bundleAsset}`);
      }

      const previewPath = await adapter.preview('scene_int_1');
      assert.equal(previewPath, previewRes.bundleIndexHtml);

      const progressUpdates: RenderProgressUpdate[] = [];
      const job = await adapter.render(projectId, (ev) => {
        progressUpdates.push(ev);
      });
      assert.equal(job.projectId, projectId);

      const deadline = Date.now() + 90_000;
      let status = await adapter.getRenderStatus(job.id);
      while (status.status === 'rendering' || status.status === 'queued') {
        assert.ok(Date.now() < deadline, `Render timed out after 90s (last progress ${status.progress}%)`);
        await new Promise((r) => setTimeout(r, 200));
        status = await adapter.getRenderStatus(job.id);
      }

      assert.equal(status.status, 'completed', `Render failed: ${status.error ?? 'unknown error'}`);
      assert.equal(status.progress, 100);
      assert.ok(
        progressUpdates.some((u) => u.jobId === job.id && u.progress > 0 && u.progress < 100),
        `Expected intermediate NDJSON progress events in ${JSON.stringify(progressUpdates)}`
      );
      assert.ok(
        progressUpdates.some((u) => u.jobId === job.id && u.phase === 'done' && u.progress === 100),
        'Expected done=100 progress event'
      );

      const videoPath = await adapter.exportVideo(job.id);
      const videoStat = await fs.stat(videoPath);
      assert.ok(videoStat.isFile() && videoStat.size > 1024, 'Expected non-trivial output.mp4');

      const { stdout: probeStdout } = await execFileAsync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=format_name,duration:stream=codec_type,codec_name,width,height',
        '-of',
        'json',
        videoPath,
      ]);
      const probe = JSON.parse(probeStdout) as FfprobeOutput;
      assert.match(probe.format?.format_name ?? '', /mp4/);
      assert.ok(
        Number(probe.format?.duration) >= 1.5,
        `Expected duration >= 1.5s, got ${probe.format?.duration}`
      );

      const videoStream = probe.streams?.find((s) => s.codec_type === 'video');
      assert.ok(videoStream, 'Expected video stream in ffprobe output');
      assert.equal(videoStream.codec_name, 'h264');
      assert.equal(videoStream.width, 1280);
      assert.equal(videoStream.height, 720);
    } finally {
      await adapter.dispose();
      await fs.rm(projectDir, { recursive: true, force: true });
    }
  }
);
