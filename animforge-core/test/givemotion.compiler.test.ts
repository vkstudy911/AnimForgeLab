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

test('compileProjectHtml compiles safe background images and non-muted audio cues while blocking unsafe URIs', () => {
  const html = compileProjectHtml({
    projectId: 'proj_media',
    config: SAMPLE_CONFIG,
    characters: [SAMPLE_CHARACTER],
    assets: [
      {
        id: 'bg_safe',
        name: 'Meadow',
        type: 'background',
        uri: 'assets/meadow.png',
        metadata: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'bg_evil',
        name: 'Evil',
        type: 'background',
        uri: '../../etc/passwd.png',
        metadata: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'bg_encoded_evil',
        name: 'EncodedEvil',
        type: 'background',
        uri: 'assets/%2e%2e/foo.png',
        metadata: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'aud_ok',
        name: 'Chime',
        type: 'audio',
        uri: 'assets/chime.wav',
        metadata: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'aud_muted',
        name: 'MutedTrack',
        type: 'audio',
        uri: 'assets/muted.mp3',
        metadata: {},
        createdAt: new Date().toISOString(),
      },
    ],
    scenes: [
      {
        ...SAMPLE_SCENES[0],
        projectId: 'proj_media',
        backgroundAssetId: 'bg_safe',
        timeline: {
          ...SAMPLE_SCENES[0].timeline,
          audioTracks: [
            { assetId: 'aud_ok', startTime: 0.5, volume: 0.8, loop: true },
            { assetId: 'aud_muted', startTime: 1, volume: 0.5, loop: false, muted: true },
          ],
        },
      },
      {
        ...SAMPLE_SCENES[1],
        projectId: 'proj_media',
        backgroundAssetId: 'bg_evil',
        timeline: {
          ...SAMPLE_SCENES[1].timeline,
          audioTracks: [{ assetId: 'aud_missing_ref', startTime: 0, volume: 1, loop: false }],
        },
      },
    ],
  });

  assert.ok(html.includes('<img class="scene-bg" src="assets/meadow.png"'));
  assert.ok(html.includes('<audio src="assets/chime.wav" data-start="0.5" data-volume="0.8" loop preload="auto"></audio>'));
  assert.ok(!html.includes('assets/muted.mp3'));
  assert.ok(!html.includes('passwd.png'));
  assert.ok(!html.includes('foo.png'));
  assert.ok(!html.includes('aud_missing_ref'));
  assert.equal((html.match(/<img class="scene-bg"/g) ?? []).length, 1);
  assert.equal((html.match(/<audio /g) ?? []).length, 1);

  const htmlEncoded = compileProjectHtml({
    projectId: 'proj_encoded',
    config: SAMPLE_CONFIG,
    characters: [],
    assets: [
      {
        id: 'bg_encoded',
        name: 'Encoded',
        type: 'background',
        uri: 'assets/%2e%2e/foo.png',
        metadata: {},
        createdAt: new Date().toISOString(),
      },
    ],
    scenes: [{ ...SAMPLE_SCENES[0], projectId: 'proj_encoded', backgroundAssetId: 'bg_encoded' }],
  });
  assert.ok(!htmlEncoded.includes('foo.png'));
  assert.equal((htmlEncoded.match(/<img class="scene-bg"/g) ?? []).length, 0);
});

test('humanoid puppet renders when a hair part exists', () => {
  const boy: Character = {
    id: 'char_boy',
    name: 'Cute Boy',
    description: 'Reference-informed 2.5D kid puppet',
    colorPalette: ['#e03a3e', '#4a72c4', '#f6c9a0', '#4a2c18', '#ffffff'],
    parts: [
      { id: 'torso', name: 'Torso', layerName: 'body_torso', pivot: { x: 0.5, y: 0.8 }, zIndex: 10 },
      { id: 'head', name: 'Head', layerName: 'body_head', pivot: { x: 0.5, y: 0.9 }, zIndex: 20, parentPartId: 'torso' },
      { id: 'hair', name: 'Hair', layerName: 'face_hair', pivot: { x: 0.5, y: 0.3 }, zIndex: 21, parentPartId: 'head' },
      { id: 'eye_left', name: 'Left Eye', layerName: 'face_eye_l', pivot: { x: 0.5, y: 0.5 }, zIndex: 22, parentPartId: 'head' },
      { id: 'eye_right', name: 'Right Eye', layerName: 'face_eye_r', pivot: { x: 0.5, y: 0.5 }, zIndex: 22, parentPartId: 'head' },
      { id: 'mouth', name: 'Mouth', layerName: 'face_mouth', pivot: { x: 0.5, y: 0.5 }, zIndex: 23, parentPartId: 'head' },
      { id: 'arm_left', name: 'Left Arm', layerName: 'limb_arm_l', pivot: { x: 0.5, y: 0.15 }, zIndex: 5, parentPartId: 'torso' },
      { id: 'arm_right', name: 'Right Arm', layerName: 'limb_arm_r', pivot: { x: 0.5, y: 0.15 }, zIndex: 25, parentPartId: 'torso' },
      { id: 'leg_left', name: 'Left Leg', layerName: 'limb_leg_l', pivot: { x: 0.5, y: 0.15 }, zIndex: 8, parentPartId: 'torso' },
      { id: 'leg_right', name: 'Right Leg', layerName: 'limb_leg_r', pivot: { x: 0.5, y: 0.15 }, zIndex: 8, parentPartId: 'torso' },
    ],
  };
  const svg = buildCharacterSvg(boy, [
    { actionId: 'a1', name: 'wave', startTime: 0, duration: 1, parameters: {} },
    { actionId: 'a2', name: 'smile', startTime: 0, duration: 1, parameters: {} },
  ]);
  // animation hooks are intact so every built-in action drives the puppet
  assert.ok(svg.includes('af-actor af-actor--wave af-actor--smile'));
  assert.ok(svg.includes('af-body-root'));
  for (const hook of ['af-head', 'af-arm-l', 'af-arm-r', 'af-leg-l', 'af-leg-r', 'af-eye-l', 'af-mouth']) {
    assert.ok(svg.includes(hook), `missing animation hook ${hook}`);
  }
  // palette drives hoodie/jeans/skin/hair, hair part triggers humanoid branch
  assert.ok(svg.includes('data-part="hair"'));
  assert.ok(svg.includes('#e03a3e'));
  assert.ok(svg.includes('#4a72c4'));
  assert.ok(svg.includes('#f6c9a0'));
  assert.ok(svg.includes('#4a2c18'));
  assert.ok(svg.includes('Q 170 132 188 114')); // open smile variant
  assert.ok(!svg.includes('af-prop-door'));
});

test('blob renderer stays the default without a hair part', () => {
  const svg = buildCharacterSvg(SAMPLE_CHARACTER, []);
  assert.ok(svg.includes('data-part="torso"'));
  assert.ok(!svg.includes('data-part="hair"'));
  assert.ok(svg.includes('#22c55e'));
});
