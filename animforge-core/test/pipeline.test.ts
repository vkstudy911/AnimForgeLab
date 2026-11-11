import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimForgeDatabase } from '../src/database.js';
import { StoryDirectorAgent } from '../agents/storyDirector.js';
import { CharacterManagerAgent } from '../agents/characterManager.js';
import { ScenePlannerAgent } from '../agents/scenePlanner.js';
import { ProjectConfigSchema } from '../schemas/project.js';

test('ProjectConfigSchema validates valid project configurations', () => {
  const valid = ProjectConfigSchema.parse({
    name: 'Demo Story',
    prompt: 'A cute green character waves and enters a glowing door',
    width: 1280,
    height: 720,
    fps: 30,
    preferredEngine: 'givemotion',
  });
  assert.equal(valid.name, 'Demo Story');
  assert.equal(valid.fps, 30);
});

test('StoryDirectorAgent converts prompt into structured storyboard beats', async () => {
  const director = new StoryDirectorAgent();
  const storyboard = await director.createStoryboard('test_p1', 'Cute green character');
  assert.ok(storyboard.beats.length >= 3);
  assert.ok(storyboard.totalDurationSeconds > 10);
  assert.equal(storyboard.beats[0].beatNumber, 1);
});

test('CharacterManagerAgent creates segmented body parts with pivots', async () => {
  const manager = new CharacterManagerAgent();
  const char = await manager.createCharacter('Pip', 'Cute green alien');
  assert.equal(char.name, 'Pip');
  assert.ok(char.parts.some((p) => p.id === 'torso'));
  assert.ok(char.parts.some((p) => p.id === 'arm_right'));
  assert.ok(char.parts.some((p) => p.id === 'eye_left'));
});

test('ScenePlannerAgent generates timed scenes and camera moves', async () => {
  const director = new StoryDirectorAgent();
  const manager = new CharacterManagerAgent();
  const planner = new ScenePlannerAgent();

  const sb = await director.createStoryboard('test_p1', 'Demo');
  const char = await manager.createCharacter('Pip', 'Demo');
  const scenes = await planner.planScenes('test_p1', sb, char);

  assert.equal(scenes.length, sb.beats.length);
  assert.ok(scenes[0].duration > 0);
  assert.ok(scenes[1].timeline.characterActions.some((a) => a.name === 'wave'));
  assert.ok(scenes[1].timeline.cameraMoves.some((c) => c.type === 'zoom'));
});

test('AnimForgeDatabase stores and retrieves projects in SQLite', () => {
  const db = new AnimForgeDatabase(':memory:');
  const now = new Date().toISOString();
  db.saveProject({
    id: 'p_101',
    name: 'Test Project',
    prompt: 'Test prompt',
    width: 1280,
    height: 720,
    fps: 30,
    preferredEngine: 'givemotion',
    status: 'created',
    characters: [],
    assets: [],
    scenes: [],
    createdAt: now,
    updatedAt: now,
  });

  const retrieved = db.getProject('p_101');
  assert.ok(retrieved !== null);
  assert.equal(retrieved.name, 'Test Project');
  assert.equal(retrieved.status, 'created');
  db.close();
});
