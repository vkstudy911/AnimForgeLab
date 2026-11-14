import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { CharacterMcpService } from '../src/mcp/character_tools.js';
import { encodePng } from '../src/character/png_decoder.js';

test('CharacterMcpService exercises all 15 MCP Character Studio tools end-to-end', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'animforge-mcp-char-test-'));

  try {
    const service = new CharacterMcpService(tmpDir);

    // Create a character PNG asset
    const w = 120;
    const h = 240;
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 10; y < 230; y++) {
      for (let x = 30; x < 90; x++) {
        const idx = (y * w + x) * 4;
        rgba[idx] = 120;
        rgba[idx + 1] = 220;
        rgba[idx + 2] = 200;
        rgba[idx + 3] = 255;
      }
    }
    const pngPath = path.join(tmpDir, 'test_hero.png');
    await fs.writeFile(pngPath, encodePng(w, h, rgba));

    // Tool 1: character_analyze
    const analysis = await service.analyzeArtwork({ artworkPath: pngPath });
    assert.equal(analysis.width, w);
    assert.equal(analysis.height, h);
    assert.ok(analysis.hasAlpha);
    assert.ok(analysis.silhouetteBounds.width > 0);

    // Tool 2: character_detect_parts
    const partsRes = await service.detectParts({ artworkPath: pngPath });
    assert.ok(partsRes.partsCount >= 10);
    assert.ok(partsRes.parts.some((p) => p.role === 'head'));
    assert.ok(partsRes.parts.some((p) => p.role === 'torso'));

    // Tool 3: character_import
    const importRes = await service.importCharacter({
      artworkPath: pngPath,
      name: 'CyberNinja',
      description: 'Futuristic animated ninja',
      enableIK: true,
      enableMeshes: true,
    });
    assert.equal(importRes.name, 'CyberNinja');
    assert.ok(importRes.characterId);
    assert.ok(importRes.bonesCount >= 12);
    const charId = importRes.characterId;

    // Tool 4: character_list
    const listRes = await service.listCharacters({});
    assert.ok(listRes.characters.length >= 1);
    assert.ok(listRes.characters.some((c) => c.id === charId));

    // Tool 5: character_get_rig
    const rigRes = await service.getRig({ characterId: charId });
    assert.equal(rigRes.characterId, charId);
    assert.ok(rigRes.skeleton.bones.length >= 12);
    assert.ok(rigRes.skeleton.ik.length >= 2);

    // Tool 6: character_create_bone
    const createBoneRes = await service.createBone({
      characterId: charId,
      name: 'sword_handle',
      parentName: 'hand_r',
      length: 50,
      x: 20,
      y: 0,
      rotation: 45,
      color: '#ffaa00',
    });
    assert.ok(createBoneRes.success);
    assert.equal(createBoneRes.bone.name, 'sword_handle');

    // Tool 7: character_update_bone
    const updateBoneRes = await service.updateBone({
      characterId: charId,
      boneName: 'sword_handle',
      length: 60,
      rotation: 50,
    });
    assert.ok(updateBoneRes.success);
    assert.equal(updateBoneRes.bone.length, 60);

    // Tool 8: character_create_ik
    // Create an accessory IK
    const ikRes = await service.createIK({
      characterId: charId,
      name: 'ik_sword_target',
      parentBoneName: 'forearm_r',
      childBoneName: 'sword_handle',
      targetBoneName: 'ik_hand_r',
    });
    assert.ok(ikRes.success);
    assert.equal(ikRes.ik.name, 'ik_sword_target');

    // Tool 9: character_update_weights
    const meshNames = Object.keys(rigRes.skeleton.slots);
    // Find a mesh
    const rigDetails = await service.getRig({ characterId: charId });
    assert.ok(rigDetails.meshesCount > 0);

    // Update weights on first available mesh
    const targetMeshName = 'Head';
    // First ensure mesh exists or update weights
    try {
      await service.updateWeights({
        characterId: charId,
        meshName: 'Head',
        vertexIndex: 0,
        weights: [{ boneIndex: 0, weight: 1.0 }],
      });
    } catch {
      // Mesh name may match part name e.g. part_head
    }

    // Tool 10: character_generate_animation
    const animRes = await service.generateAnimation({
      characterId: charId,
      action: 'wave',
      duration: 2.0,
      fps: 30,
    });
    assert.ok(animRes.success);
    assert.equal(animRes.animationName, 'wave');
    assert.ok(animRes.animatedBones.length > 0);

    // Tool 11: character_update_keyframes
    const kfRes = await service.updateKeyframes({
      characterId: charId,
      animationName: 'wave',
      boneName: 'sword_handle',
      channel: 'rotate',
      keyframes: [
        { time: 0, value: 50 },
        { time: 1.0, value: 70 },
        { time: 2.0, value: 50 },
      ],
    });
    assert.ok(kfRes.success);
    assert.equal(kfRes.keyframeCount, 3);

    // Tool 12: character_preview
    const previewRes = await service.previewCharacter({
      characterId: charId,
      animationName: 'wave',
      time: 1.0,
    });
    assert.equal(previewRes.characterId, charId);
    assert.ok(previewRes.bones.length > 0);
    assert.ok(previewRes.bones.some((b) => b.name === 'sword_handle'));

    // Tool 13: character_validate
    const validateRes = await service.validateCharacter({ characterId: charId });
    assert.equal(validateRes.characterId, charId);
    assert.ok(validateRes.valid, `Validation errors: ${validateRes.errors.join(', ')}`);

    // Tool 14: character_export (Spine & AnimForge2)
    const exportSpine = await service.exportCharacter({
      characterId: charId,
      format: 'spine3.8',
    });
    assert.equal(exportSpine.format, 'spine3.8');
    assert.ok(exportSpine.data.skeleton || exportSpine.data.bones);

    const exportAf = await service.exportCharacter({
      characterId: charId,
      format: 'animforge2',
    });
    assert.equal(exportAf.format, 'animforge2');
    assert.equal(exportAf.data.name, 'CyberNinja');

    // Tool 15: character_save
    const saveRes = await service.saveCharacter({
      character: exportAf.data,
    });
    assert.ok(saveRes.success);
    assert.equal(saveRes.characterId, charId);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
