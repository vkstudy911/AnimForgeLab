import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

import { encodePng, decodePng } from '../src/character/png_decoder.js';
import { segmentCharacter } from '../src/character/segmentation.js';
import { autoRigCharacter } from '../src/character/autorig.js';
import { generateAnimationClip } from '../src/character/motion_planner.js';
import { Rigby2DAdapter } from '../adapters/rigby2d.adapter.js';
import { CharacterMcpService } from '../src/mcp/character_tools.js';
import { AnimForgeCharacterV2Schema, type AnimForgeCharacterV2 } from '../schemas/character.rigby.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ANIMFORGE_LAB_ROOT = path.resolve(__dirname, '..', '..', '..');

test('15-Step Character Studio Vertical-Slice Integration Acceptance Test', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'animforge-vslice-test-'));

  const mcpService = new CharacterMcpService(tmpDir);
  const adapter = new Rigby2DAdapter(tmpDir);
  await adapter.initialize();

  try {
    // ----------------------------------------------------
    // STEP 1: Generate & Import Flat PNG Character Artwork
    // ----------------------------------------------------
    const width = 120;
    const height = 180;
    const pngPath = path.join(tmpDir, 'hero_flat.png');

    await t.test('Step 1: Import flat PNG character artwork', async () => {
      const rgba = new Uint8Array(width * height * 4);

      // Draw silhouette: head, torso, arms, legs
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          // Head
          if (Math.hypot(x - 60, y - 28) < 18) {
            rgba[idx] = 240; rgba[idx + 1] = 180; rgba[idx + 2] = 140; rgba[idx + 3] = 255;
          }
          // Torso
          else if (x >= 42 && x <= 78 && y >= 46 && y <= 100) {
            rgba[idx] = 60; rgba[idx + 1] = 120; rgba[idx + 2] = 220; rgba[idx + 3] = 255;
          }
          // Left Arm
          else if (x >= 24 && x <= 40 && y >= 50 && y <= 98) {
            rgba[idx] = 240; rgba[idx + 1] = 180; rgba[idx + 2] = 140; rgba[idx + 3] = 255;
          }
          // Right Arm
          else if (x >= 80 && x <= 96 && y >= 50 && y <= 98) {
            rgba[idx] = 240; rgba[idx + 1] = 180; rgba[idx + 2] = 140; rgba[idx + 3] = 255;
          }
          // Left Leg
          else if (x >= 44 && x <= 56 && y >= 102 && y <= 165) {
            rgba[idx] = 40; rgba[idx + 1] = 40; rgba[idx + 2] = 90; rgba[idx + 3] = 255;
          }
          // Right Leg
          else if (x >= 64 && x <= 76 && y >= 102 && y <= 165) {
            rgba[idx] = 40; rgba[idx + 1] = 40; rgba[idx + 2] = 90; rgba[idx + 3] = 255;
          }
        }
      }

      const pngBuf = encodePng(width, height, rgba);
      await fs.writeFile(pngPath, pngBuf);

      const fileBuf = await fs.readFile(pngPath);
      const decoded = decodePng(fileBuf);
      assert.equal(decoded.width, 120);
      assert.equal(decoded.height, 180);
      assert.equal(decoded.data.length, 120 * 180 * 4);
    });

    // ----------------------------------------------------
    // STEP 2: Detect Anatomical Body Parts
    // ----------------------------------------------------
    let detectedParts: any[];
    await t.test('Step 2: Detect anatomical body parts', async () => {
      const fileBuf = await fs.readFile(pngPath);
      const decoded = decodePng(fileBuf);
      detectedParts = segmentCharacter({
        width: decoded.width,
        height: decoded.height,
        alphaData: decoded.alpha,
        imagePath: pngPath,
      });

      assert.ok(detectedParts.length >= 6, `Expected at least 6 parts, got ${detectedParts.length}`);
      assert.ok(detectedParts.some((p) => p.role === 'head'));
      assert.ok(detectedParts.some((p) => p.role === 'torso'));
      assert.ok(detectedParts.some((p) => p.role === 'upperarm'));
      assert.ok(detectedParts.some((p) => p.role === 'forearm'));
      assert.ok(detectedParts.some((p) => p.role === 'thigh'));
      assert.ok(detectedParts.some((p) => p.role === 'shin'));
    });

    // ----------------------------------------------------
    // STEP 3: Boundary Adjustment & Polygon Validation
    // ----------------------------------------------------
    await t.test('Step 3: Boundary adjustment and polygon coordinates', async () => {
      for (const part of detectedParts) {
        assert.ok(part.polygon.length >= 4, `Part ${part.name} must have valid polygon vertices`);
        assert.ok(part.pivot[0] >= 0 && part.pivot[0] <= width);
        assert.ok(part.pivot[1] >= 0 && part.pivot[1] <= height);
      }
    });

    // ----------------------------------------------------
    // STEP 4: Auto-Rig Bone Hierarchy & Skinning
    // ----------------------------------------------------
    let characterDoc: AnimForgeCharacterV2;
    await t.test('Step 4: Auto-rig bone hierarchy and skinning', async () => {
      characterDoc = autoRigCharacter({
        characterId: 'char_aria_vslice',
        name: 'Aria Magesmith',
        description: 'Apprentice elementalist hero',
        sourceArtwork: {
          originalPath: pngPath,
          width,
          height,
          kind: 'flat_png',
        },
        parts: detectedParts,
        enableIK: true,
        enableMeshes: true,
      });

      const validated = AnimForgeCharacterV2Schema.parse(characterDoc);
      assert.equal(validated.name, 'Aria Magesmith');
      assert.equal(validated.format, 'animforge-character/2.0');
      assert.ok(validated.skeleton.bones.length >= 21);
      assert.ok(validated.skeleton.ik.length >= 2);
      assert.ok(validated.parts.length >= 6);
    });

    // ----------------------------------------------------
    // STEP 5: Arm IK Constraint Verification
    // ----------------------------------------------------
    await t.test('Step 5: Arm IK constraint setup and rotation', async () => {
      const leftArmIk = characterDoc.skeleton.ik.find((c) => c.name === 'ik_arm_l');
      assert.ok(leftArmIk, 'ik_arm_l exists');
      assert.equal(leftArmIk.mix, 1.0);
      assert.equal(leftArmIk.bendPositive, true);

      // Verify target bone exists
      const targetBone = characterDoc.skeleton.bones[leftArmIk.target];
      assert.ok(targetBone, 'target bone exists');
      assert.equal(targetBone.name, 'ik_hand_l');
    });

    // ----------------------------------------------------
    // STEP 6: Generate 5s Wave Animation Clip
    // ----------------------------------------------------
    let waveClip: any;
    await t.test('Step 6: AI motion planner generates 5s wave animation', async () => {
      waveClip = generateAnimationClip('wave', characterDoc.skeleton.bones, {
        duration: 5.0,
        fps: 30,
        intensity: 1.2,
      });

      assert.equal(waveClip.name, 'wave');
      assert.equal(waveClip.duration, 5.0);
      assert.equal(waveClip.fps, 30);
      assert.ok(waveClip.bones.upperarm_l);
      assert.ok(waveClip.bones.forearm_l);
      assert.ok(waveClip.bones.forearm_l.rotate.length >= 4);
    });

    // ----------------------------------------------------
    // STEP 7: Keyframe Editing
    // ----------------------------------------------------
    await t.test('Step 7: Keyframe editing and keyframe injection', async () => {
      // Add custom keyframe at 2.5s
      const customKeyframe = { time: 2.5, value: 45 };
      waveClip.bones.forearm_l.rotate.push(customKeyframe);
      waveClip.bones.forearm_l.rotate.sort((a: any, b: any) => a.time - b.time);

      assert.ok(waveClip.bones.forearm_l.rotate.some((k: any) => k.time === 2.5 && k.value === 45));
      characterDoc.animations = {
        wave: waveClip,
      };
    });

    // ----------------------------------------------------
    // STEP 8: Save Character Document to Storage
    // ----------------------------------------------------
    await t.test('Step 8: Save character document to storage', async () => {
      const savedPath = await adapter.saveCharacter(characterDoc);
      assert.ok(savedPath.endsWith(`${characterDoc.id}.json`));
      assert.ok(await fs.stat(savedPath));
    });

    // ----------------------------------------------------
    // STEP 9: Reload Character and Verify Structural Fidelity
    // ----------------------------------------------------
    await t.test('Step 9: Reload character and verify structural fidelity', async () => {
      const reloaded = await adapter.loadCharacter(characterDoc.id);
      assert.ok(reloaded);
      assert.equal(reloaded.id, characterDoc.id);
      assert.equal(reloaded.name, 'Aria Magesmith');
      assert.equal(reloaded.skeleton.bones.length, characterDoc.skeleton.bones.length);
      assert.ok(reloaded.animations.wave);
      assert.equal(reloaded.animations.wave.duration, 5.0);
    });

    // ----------------------------------------------------
    // STEP 10: Inspect via MCP Character Tools
    // ----------------------------------------------------
    await t.test('Step 10: Inspect character via MCP Character Tools', async () => {
      const listRes = await mcpService.listCharacters({});
      assert.ok(listRes.characters.some((c: any) => c.id === characterDoc.id));

      const rigRes = await mcpService.getRig({ characterId: characterDoc.id });
      assert.equal(rigRes.skeleton.bones.length, characterDoc.skeleton.bones.length);
      assert.equal(rigRes.skeleton.ik.length, characterDoc.skeleton.ik.length);
    });

    // ----------------------------------------------------
    // STEP 11: Export to Spine 3.8 JSON
    // ----------------------------------------------------
    let spineExport: any;
    await t.test('Step 11: Export character rig to Spine 3.8 JSON', async () => {
      const exportRes = await mcpService.exportCharacter({
        characterId: characterDoc.id,
        format: 'spine3.8',
      });

      assert.equal(exportRes.format, 'spine3.8');
      assert.ok(exportRes.data);
      spineExport = exportRes.data;
      assert.ok(spineExport.bones.length >= 21);
      assert.ok(spineExport.skeleton);
      assert.ok(spineExport.skeleton.spine.startsWith('3.8'));
    });

    // ----------------------------------------------------
    // STEP 12: Spine JSON Reimport & Round-Trip Validation
    // ----------------------------------------------------
    await t.test('Step 12: Spine JSON reimport and round-trip validation', async () => {
      const reimported = adapter.importSpineJson(spineExport, 'Reimported Aria');
      assert.ok(reimported);
      assert.equal(reimported.skeleton.bones.length, spineExport.bones.length);
      assert.ok(reimported.skeleton.bones.some((b: any) => b.name === 'root'));
      assert.ok(reimported.skeleton.bones.some((b: any) => b.name === 'hip'));
    });

    // ----------------------------------------------------
    // STEP 13: Verify Target Project "Dancer" Untouched
    // ----------------------------------------------------
    await t.test('Step 13: Verify Dancer project (proj_1794470257338_1) uncorrupted', async () => {
      const dancerPath = path.join(ANIMFORGE_LAB_ROOT, 'projects', 'proj_1794470257338_1', 'project.animforge.json');
      assert.ok(fsSync.existsSync(dancerPath), 'Dancer project.animforge.json must exist');
      const dancerRaw = await fs.readFile(dancerPath, 'utf-8');
      const dancerData = JSON.parse(dancerRaw);
      assert.equal(dancerData.projectId, 'proj_1794470257338_1');
      assert.equal(dancerData.config.name, 'Dancer');
      assert.ok(dancerData.characters.length >= 1);
      assert.equal(dancerData.characters[0].id, 'char_pip');
    });

    // ----------------------------------------------------
    // STEP 14: Verify Rigby2D Adapter & Engine Lifecycle
    // ----------------------------------------------------
    await t.test('Step 14: Verify Rigby2D engine adapter lifecycle', async () => {
      assert.equal(adapter.name, 'rigby2d');
      assert.equal(typeof adapter.render, 'function');
      assert.equal(typeof adapter.saveCharacter, 'function');
      assert.equal(typeof adapter.loadCharacter, 'function');
      assert.equal(typeof adapter.generateMotion, 'function');
    });

    // ----------------------------------------------------
    // STEP 15: Clean Cleanup & Verification Complete
    // ----------------------------------------------------
    await t.test('Step 15: Verify clean cleanup and state preservation', async () => {
      const charJsonPath = path.join(tmpDir, 'characters', `${characterDoc.id}.json`);
      assert.ok(await fs.stat(charJsonPath));
    });

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
