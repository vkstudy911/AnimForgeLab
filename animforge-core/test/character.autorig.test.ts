import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentCharacter } from '../src/character/segmentation.js';
import { autoRigCharacter } from '../src/character/autorig.js';
import { AnimForgeCharacterV2Schema } from '../schemas/character.rigby.js';
import { generateAnimationClip } from '../src/character/motion_planner.js';

test('character segmentation identifies standard anatomical parts from silhouette', () => {
  const width = 500;
  const height = 800;
  const alphaData = new Uint8Array(width * height);

  // Fill humanoid silhouette
  // Head
  for (let y = 50; y < 200; y++) {
    for (let x = 200; x < 300; x++) {
      alphaData[y * width + x] = 255;
    }
  }
  // Torso
  for (let y = 200; y < 500; y++) {
    for (let x = 160; x < 340; x++) {
      alphaData[y * width + x] = 255;
    }
  }
  // Legs
  for (let y = 500; y < 750; y++) {
    for (let x = 180; x < 320; x++) {
      alphaData[y * width + x] = 255;
    }
  }

  const parts = segmentCharacter({ width, height, alphaData });
  assert.ok(parts.length >= 10, `Expected at least 10 parts, got ${parts.length}`);

  const roles = new Set(parts.map((p) => p.role));
  assert.ok(roles.has('head'), 'Missing head part');
  assert.ok(roles.has('torso'), 'Missing torso part');
  assert.ok(roles.has('upperarm'), 'Missing upperarm part');
  assert.ok(roles.has('forearm'), 'Missing forearm part');
  assert.ok(roles.has('thigh'), 'Missing thigh part');
  assert.ok(roles.has('shin'), 'Missing shin part');

  for (const part of parts) {
    assert.ok(part.polygon.length >= 4, `Part ${part.name} has invalid polygon`);
    assert.ok(part.confidence > 0.8, `Part ${part.name} confidence too low: ${part.confidence}`);
  }
});

test('autoRigCharacter generates validated AnimForgeCharacterV2 document', () => {
  const width = 400;
  const height = 600;
  const parts = segmentCharacter({ width, height });

  const character = autoRigCharacter({
    characterId: 'char_test_alien',
    name: 'Cosmo Alien',
    description: 'Friendly alien character',
    sourceArtwork: {
      originalPath: 'assets/characters/alien.png',
      width,
      height,
      kind: 'flat_png',
    },
    parts,
    enableIK: true,
    enableMeshes: true,
  });

  // Validate with Zod schema
  const parsed = AnimForgeCharacterV2Schema.safeParse(character);
  assert.ok(parsed.success, `Schema validation failed: ${JSON.stringify(parsed.error?.format())}`);

  // Verify skeleton properties
  assert.equal(character.format, 'animforge-character/2.0');
  assert.equal(character.engine, 'rigby2d');
  assert.ok(character.skeleton.bones.length >= 15, `Bone count ${character.skeleton.bones.length} < 15`);
  assert.ok(character.skeleton.slots.length >= 10, `Slot count ${character.skeleton.slots.length} < 10`);
  assert.ok(character.skeleton.ik.length >= 2, `IK constraints count ${character.skeleton.ik.length} < 2`);

  // Verify bone hierarchy
  const rootBone = character.skeleton.bones.find((b) => b.name === 'root');
  assert.ok(rootBone, 'Root bone missing');
  assert.equal(rootBone?.parentIndex, null, 'Root bone should have null parent');

  const chestBone = character.skeleton.bones.find((b) => b.name === 'chest');
  assert.ok(chestBone, 'Chest bone missing');

  // Verify meshes generated
  assert.ok(Object.keys(character.meshes).length > 0, 'Meshes not generated');

  // Verify motion clips generated
  assert.ok(character.animations.idle, 'Missing idle animation');
  assert.ok(character.animations.walk, 'Missing walk animation');
  assert.ok(character.animations.wave, 'Missing wave animation');

  // Verify wave animation has bone rotation tracks
  const wave = character.animations.wave;
  assert.ok(wave.bones.upperarm_l?.rotate || wave.bones.upperarm_r?.rotate, 'Wave missing arm rotation');
});

test('motion_planner generates all required action types', () => {
  const bones = [
    { id: '1', name: 'root', parentIndex: null, length: 0, setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } },
    { id: '2', name: 'hip', parentIndex: 0, length: 30, setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } },
    { id: '3', name: 'chest', parentIndex: 1, length: 40, setup: { x: 0, y: 30, rotation: 0, scaleX: 1, scaleY: 1 } },
    { id: '4', name: 'head', parentIndex: 2, length: 30, setup: { x: 0, y: 40, rotation: 0, scaleX: 1, scaleY: 1 } },
    { id: '5', name: 'upperarm_l', parentIndex: 2, length: 35, setup: { x: 20, y: 35, rotation: 0, scaleX: 1, scaleY: 1 } },
    { id: '6', name: 'forearm_l', parentIndex: 4, length: 30, setup: { x: 35, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } },
    { id: '7', name: 'hand_l', parentIndex: 5, length: 15, setup: { x: 30, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } },
    { id: '8', name: 'thigh_l', parentIndex: 1, length: 45, setup: { x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } },
    { id: '9', name: 'shin_l', parentIndex: 7, length: 40, setup: { x: 45, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } },
    { id: '10', name: 'eye_l', parentIndex: 3, length: 5, setup: { x: 5, y: 15, rotation: 0, scaleX: 1, scaleY: 1 } },
    { id: '11', name: 'mouth', parentIndex: 3, length: 5, setup: { x: 0, y: 5, rotation: 0, scaleX: 1, scaleY: 1 } },
  ];

  const actions = ['idle', 'walk', 'run', 'wave', 'jump', 'dance', 'breathing', 'blink', 'head_turn', 'smile', 'hand_gesture'] as const;
  for (const act of actions) {
    const clip = generateAnimationClip(act, bones);
    assert.equal(clip.name, act);
    assert.ok(clip.duration > 0);
    assert.ok(Object.keys(clip.bones).length > 0, `Action ${act} should generate bone tracks`);
  }
});
