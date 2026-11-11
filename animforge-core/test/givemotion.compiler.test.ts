import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCharacterSvg,
  compileProjectHtml,
  mapCameraAttribute,
  mapTransitionAttribute,
} from '../adapters/givemotion.compiler.js';
import { Character, ProjectConfig, Scene } from '../schemas/index.js';

const SAMPLE_CONFIG: ProjectConfig = {
  name: 'Pip & <script>Adventure</script>',
  prompt: 'Cute green alien walks, waves, and enters a glowing door',
  width: 1280,
  height: 720,
  fps: 30,
  preferredEngine: 'givemotion',
};

const SAMPLE_CHARACTER: Character = {
  id: 'char_pip',
  name: 'Pip <Hero>',
  description: 'Cute green creature',
  colorPalette: ['#22c55e', '#16a34a', '#86efac', '#15803d', '#ffffff'],
  parts: [
    { id: 'torso', name: 'Torso', layerName: 'body_torso', pivot: { x: 0.5, y: 0.8 }, zIndex: 10 },
    { id: 'head', name: 'Head', layerName: 'body_head', pivot: { x: 0.5, y: 0.9 }, zIndex: 20, parentPartId: 'torso' },
    { id: 'eye_left', name: 'Left Eye', layerName: 'face_eye_l', pivot: { x: 0.5, y: 0.5 }, zIndex: 22, parentPartId: 'head' },
    { id: 'eye_right', name: 'Right Eye', layerName: 'face_eye_r', pivot: { x: 0.5, y: 0.5 }, zIndex: 22, parentPartId: 'head' },
    { id: 'mouth', name: 'Mouth', layerName: 'face_mouth', pivot: { x: 0.5, y: 0.5 }, zIndex: 23, parentPartId: 'head' },
    { id: 'arm_left', name: 'Left Arm', layerName: 'limb_arm_l', pivot: { x: 0.8, y: 0.2 }, zIndex: 5, parentPartId: 'torso' },
    { id: 'arm_right', name: 'Right Arm', layerName: 'limb_arm_r', pivot: { x: 0.2, y: 0.2 }, zIndex: 25, parentPartId: 'torso' },
    { id: 'leg_left', name: 'Left Leg', layerName: 'limb_leg_l', pivot: { x: 0.5, y: 0.1 }, zIndex: 8, parentPartId: 'torso' },
    { id: 'leg_right', name: 'Right Leg', layerName: 'limb_leg_r', pivot: { x: 0.5, y: 0.1 }, zIndex: 8, parentPartId: 'torso' },
  ],
};

const SAMPLE_SCENES: Scene[] = [
  {
    id: 'scene_1',
    projectId: 'proj_1',
    sequenceIndex: 0,
    title: 'Arrival & Wonder',
    description: 'Pip enters <the room> and looks around.',
    duration: 4,
    characterIds: ['char_pip'],
    timeline: {
      duration: 4,
      fps: 30,
      characterActions: [
        { actionId: 'a1', name: 'walk', startTime: 0, duration: 2, parameters: { speed: 1.2 } },
        { actionId: 'a2', name: 'look_around', startTime: 2, duration: 1.5, parameters: {} },
        { actionId: 'a3', name: 'blink', startTime: 1.2, duration: 0.3, parameters: {} },
      ],
      cameraMoves: [
        {
          type: 'static',
          startX: 0,
          startY: 0,
          endX: 0,
          endY: 0,
          startZoom: 1,
          endZoom: 1,
          easing: 'linear',
          duration: 4,
        },
      ],
      audioTracks: [],
    },
    transition: { type: 'fade', duration: 0.5 },
  },
  {
    id: 'scene_2',
    projectId: 'proj_1',
    sequenceIndex: 1,
    title: "Pip $'s Friendly Wave",
    description: 'Glowing door ahead as Pip waves.',
    duration: 4,
    characterIds: ['char_pip'],
    timeline: {
      duration: 4,
      fps: 30,
      characterActions: [
        { actionId: 'a4', name: 'wave', startTime: 0.5, duration: 2.5, parameters: {} },
        { actionId: 'a5', name: 'smile', startTime: 0.8, duration: 3, parameters: {} },
      ],
      cameraMoves: [
        {
          type: 'zoom',
          startX: 0,
          startY: 0,
          endX: 0,
          endY: 0,
          startZoom: 1,
          endZoom: 1.15,
          easing: 'ease-in-out',
          duration: 4,
        },
      ],
      audioTracks: [],
    },
    transition: { type: 'dissolve', duration: 0.5 },
  },
];

test('compileProjectHtml generates valid GiveMotion sequence, escaped metadata, scenes, and CSS keyframes', () => {
  const html = compileProjectHtml({
    projectId: 'proj_1',
    config: SAMPLE_CONFIG,
    scenes: SAMPLE_SCENES,
    characters: [SAMPLE_CHARACTER],
  });

  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<html lang="en" data-width="1280" data-height="720" data-fps="30">'));
  assert.ok(html.includes('<title>Pip &amp; &lt;script&gt;Adventure&lt;/script&gt;</title>'));
  assert.ok(html.includes('Pip enters &lt;the room&gt; and looks around.'));
  assert.ok(!html.includes('<script>Adventure</script>'));
  assert.ok(html.includes("Pip $&#39;s Friendly Wave"));

  assert.ok(html.includes('<main data-sequence>'));
  assert.ok(html.includes('<section class="scene" id="scene_1" data-duration="4">'));
  assert.ok(
    html.includes(
      '<section class="scene" id="scene_2" data-duration="4" data-camera="push 1.15" data-transition="fade 0.5">'
    )
  );

  // Includes CSS animations for character actions + SVG palette colors
  assert.ok(html.includes('@keyframes af-walk-bob'));
  assert.ok(html.includes('@keyframes af-wave'));
  assert.ok(html.includes('@keyframes af-blink'));
  assert.ok(html.includes('@keyframes af-look'));
  assert.ok(html.includes('#22c55e'));
  assert.ok(html.includes('data-part="arm_right"'));
  assert.ok(html.includes('data-part="mouth"'));
});

test('mapCameraAttribute and mapTransitionAttribute translate AnimForge schemas to valid GiveMotion tokens', () => {
  assert.equal(mapCameraAttribute(undefined), null);
  assert.equal(
    mapCameraAttribute({
      type: 'static',
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      startZoom: 1,
      endZoom: 1,
      easing: 'linear',
      duration: 2,
    }),
    null
  );
  assert.equal(
    mapCameraAttribute({
      type: 'zoom',
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      startZoom: 1,
      endZoom: 1.15,
      easing: 'ease-in-out',
      duration: 2,
    }),
    'push 1.15'
  );
  assert.equal(
    mapCameraAttribute({
      type: 'zoom',
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      startZoom: 1.25,
      endZoom: 1.0,
      easing: 'ease-in-out',
      duration: 2,
    }),
    'pull 1.25'
  );
  assert.equal(
    mapCameraAttribute({
      type: 'orbit' as unknown as 'zoom',
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      startZoom: 1,
      endZoom: 1,
      easing: 'linear',
      duration: 2,
    }),
    null
  );
  assert.equal(
    mapCameraAttribute({
      type: 'pull',
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      startZoom: 1.2,
      endZoom: 1,
      easing: 'ease-in-out',
      duration: 2,
    }),
    'pull 1.2'
  );
  assert.equal(
    mapCameraAttribute({
      type: 'pan',
      startX: 0,
      startY: 0,
      endX: 60,
      endY: 0,
      startZoom: 1,
      endZoom: 1,
      easing: 'ease-in-out',
      duration: 2,
    }),
    'move-right 60'
  );
  assert.equal(
    mapCameraAttribute({
      type: 'shake',
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      startZoom: 1,
      endZoom: 1,
      easing: 'linear',
      duration: 1,
    }),
    'shake 12'
  );

  assert.equal(mapTransitionAttribute({ type: 'dissolve', duration: 0.5 }), 'fade 0.5');
  assert.equal(mapTransitionAttribute({ type: 'wipe', duration: 0.4 }), 'wipe-left 0.4');
  assert.equal(mapTransitionAttribute({ type: 'slide', duration: 0.6 }), 'slide-left 0.6');
  assert.equal(mapTransitionAttribute({ type: 'none', duration: 0 }), null);
});

test('compileProjectHtml and buildCharacterSvg handle missing characters and empty scenes gracefully', () => {
  const emptySvg = buildCharacterSvg(undefined, [{ actionId: 'i1', name: 'idle', startTime: 0, duration: 2, parameters: {} }]);
  assert.ok(emptySvg.includes('<svg'));
  assert.ok(emptySvg.includes('af-actor--idle'));

  const html = compileProjectHtml({
    projectId: 'proj_empty',
    config: SAMPLE_CONFIG,
    scenes: [],
    characters: [],
  });
  assert.ok(html.includes('id="scene_intro"'));
  assert.ok(html.includes('data-duration="3"'));
  assert.ok(html.includes('aria-hidden="true"'));

  // Malicious palette strings are sanitized to default hex and negative pan maps to move-left
  const dirtyChar: Character = {
    ...SAMPLE_CHARACTER,
    colorPalette: ['red" onclick="alert(1)', '#112233'],
  };
  const unsafeSvg = buildCharacterSvg(
    dirtyChar,
    [{ actionId: 'bad', name: 'wave" onload="alert(1)' as unknown as 'wave', startTime: 0, duration: 1, parameters: {} }],
    true,
    'scene_2'
  );
  assert.ok(!unsafeSvg.includes('onclick'));
  assert.ok(!unsafeSvg.includes('onload'));
  assert.ok(unsafeSvg.includes('af-actor--idle'));
  assert.ok(unsafeSvg.includes('#112233'));
  assert.ok(unsafeSvg.includes('id="af-door-glow-scene_2"'));

  assert.equal(
    mapCameraAttribute({
      type: 'pan',
      startX: 100,
      startY: 0,
      endX: 20,
      endY: 0,
      startZoom: 1,
      endZoom: 1,
      easing: 'ease-in-out',
      duration: 2,
    }),
    'move-left 80'
  );

  assert.throws(
    () =>
      compileProjectHtml({
        projectId: 'proj_1',
        config: SAMPLE_CONFIG,
        scenes: [{ ...SAMPLE_SCENES[0], id: '../evil' }],
        characters: [],
      }),
    /Invalid scene id/
  );
});
