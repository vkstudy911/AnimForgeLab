import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Rigby2DAdapter } from '../adapters/rigby2d.adapter.js';
import { encodePng } from '../src/character/png_decoder.js';

test('Rigby2DAdapter lifecycle, character import, rigging, pose, and Spine interop', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'animforge-rigby-test-'));

  try {
    const adapter = new Rigby2DAdapter(tmpDir);

    // 1. Initialize
    await adapter.initialize();
    assert.equal(adapter.name, 'rigby2d');

    // 2. Create Project
    const manifestPath = await adapter.createProject('test_proj_char', {
      name: 'Character Showcase',
      prompt: 'Animated character showcase',
      width: 1920,
      height: 1080,
      fps: 30,
      preferredEngine: 'rigby2d',
    });
    assert.ok(manifestPath.endsWith('project.json'));

    // 3. Create a test character PNG asset
    const charW = 100;
    const charH = 200;
    const rgba = new Uint8Array(charW * charH * 4);
    // Draw character silhouette
    for (let y = 10; y < 190; y++) {
      for (let x = 30; x < 70; x++) {
        const idx = (y * charW + x) * 4;
        rgba[idx] = 100;
        rgba[idx + 1] = 200;
        rgba[idx + 2] = 250;
        rgba[idx + 3] = 255;
      }
    }
    const pngPath = path.join(tmpDir, 'alien_asset.png');
    await fs.writeFile(pngPath, encodePng(charW, charH, rgba));

    // 4. Import & Auto-Rig Character
    const character = await adapter.importCharacter(pngPath, {
      name: 'AlienHero',
      projectId: 'test_proj_char',
      enableIK: true,
      enableMeshes: true,
    });

    assert.equal(character.name, 'AlienHero');
    assert.equal(character.format, 'animforge-character/2.0');
    assert.ok(character.skeleton.bones.length >= 10, 'Expected >= 10 bones');
    assert.ok(character.skeleton.ik.length >= 2, 'Expected >= 2 IK constraints');
    assert.ok(character.animations.idle, 'Expected idle animation');
    assert.ok(character.animations.wave, 'Expected wave animation');

    // 5. Save & Load Character
    await adapter.saveCharacter(character, 'test_proj_char');
    const loaded = await adapter.loadCharacter(character.id, 'test_proj_char');
    assert.ok(loaded, 'Failed to load saved character');
    assert.equal(loaded?.id, character.id);
    assert.equal(loaded?.skeleton.bones.length, character.skeleton.bones.length);

    // 6. List Characters
    const list = await adapter.listCharacters('test_proj_char');
    assert.ok(list.length >= 1);
    assert.ok(list.some((c) => c.id === character.id));

    // 7. Generate Motion
    const danceClip = adapter.generateMotion(character, 'dance', { duration: 2.0 });
    assert.equal(danceClip.name, 'dance');
    assert.equal(danceClip.duration, 2.0);
    assert.ok(character.animations.dance);

    // 8. Evaluate Pose
    const poseAt0 = adapter.evaluatePose(character, 'idle', 0.5);
    assert.ok(poseAt0.bones.length > 0);
    assert.ok(poseAt0.bones.some((b) => b.name === 'head'));

    // 9. Spine Export
    const spineJson = adapter.exportSpineJson(character, '3.8');
    assert.ok(spineJson, 'Spine JSON should not be null');
    assert.ok(spineJson.skeleton || spineJson.bones, 'Should have standard Spine structure');

    // 10. Spine Import
    const reimported = adapter.importSpineJson(spineJson, 'ReimportedHero');
    assert.equal(reimported.name, 'ReimportedHero');
    assert.ok(reimported.skeleton.bones.length > 0);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
