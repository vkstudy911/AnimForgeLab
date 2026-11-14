import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  assertSafeId,
  resolveProjectDir,
  resolveWorkspacePath,
  escapeHtml,
} from '../utils/paths.js';

test('assertSafeId accepts safe IDs and rejects traversal or untrimmed IDs', () => {
  assert.equal(assertSafeId('proj_123-abc', 'project'), 'proj_123-abc');
  assert.throws(() => assertSafeId('', 'project'), /Invalid project id/);
  assert.throws(() => assertSafeId(' proj_1', 'project'), /Invalid project id/);
  assert.throws(() => assertSafeId('proj_1 ', 'project'), /Invalid project id/);
  assert.throws(() => assertSafeId('../escape', 'project'), /Invalid project id/);
  assert.throws(() => assertSafeId('a/b', 'project'), /Invalid project id/);
  assert.throws(() => assertSafeId('a\\b', 'project'), /Invalid project id/);
  assert.throws(() => assertSafeId('.hidden', 'project'), /Invalid project id/);
  assert.throws(() => assertSafeId('bad\0id', 'project'), /Invalid project id/);
  assert.throws(() => assertSafeId('x'.repeat(65), 'project'), /Invalid project id/);
});

test('resolveProjectDir preserves leading/trailing spaces and blocks symlinked projects dir', async () => {
  const workspaceWithTrailingSpace = '/Users/vipinkumar/Desktop/animator /AnimForgeLab';
  const projectDir = resolveProjectDir(workspaceWithTrailingSpace, 'proj_42');
  assert.equal(
    projectDir,
    path.join('/Users/vipinkumar/Desktop/animator ', 'AnimForgeLab', 'projects', 'proj_42')
  );
  assert.ok(projectDir.includes('/animator /AnimForgeLab/'));
  assert.throws(() => resolveProjectDir(workspaceWithTrailingSpace, '../.env'), /Invalid project id/);

  const spacedBase = '/tmp/ workspace trailing ';
  const dirFromSpaces = resolveProjectDir(spacedBase, 'proj_spaces');
  assert.equal(dirFromSpaces, path.resolve('/tmp/ workspace trailing ', 'projects', 'proj_spaces'));
  assert.ok(dirFromSpaces.includes('/ workspace trailing /projects/'));

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'af-projdir '));
  try {
    const ws = path.join(tmpRoot, 'ws');
    const outside = path.join(tmpRoot, 'outside-projects');
    await fs.mkdir(ws, { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    await fs.symlink(outside, path.join(ws, 'projects'));

    assert.throws(() => resolveProjectDir(ws, 'proj_1'), /symlink|escapes/i);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('resolveWorkspacePath blocks traversal, encoded variants, Windows paths, and symlink escapes', async () => {
  const tmpParent = await fs.mkdtemp(path.join(os.tmpdir(), 'af-paths-space '));
  const jailDir = path.join(tmpParent, 'workspace with trailing space ');
  const outsideDir = path.join(tmpParent, 'outside-secret');
  const insideShared = path.join(jailDir, 'shared');
  await fs.mkdir(path.join(jailDir, 'sub'), { recursive: true });
  await fs.mkdir(insideShared, { recursive: true });
  await fs.mkdir(outsideDir, { recursive: true });
  await fs.writeFile(path.join(outsideDir, '.env'), 'SECRET=1', 'utf-8');
  await fs.symlink(outsideDir, path.join(jailDir, 'escape-link'));
  await fs.symlink(path.join(outsideDir, 'missing-new.txt'), path.join(jailDir, 'dangling-file'));
  await fs.symlink(path.join(outsideDir, 'missing-dir'), path.join(jailDir, 'dangling-dir'));
  await fs.symlink(path.join(jailDir, 'sub'), path.join(outsideDir, 'back-in'));
  await fs.symlink(insideShared, path.join(jailDir, 'internal-assets'));

  try {
    const valid = resolveWorkspacePath(jailDir, 'scenes/intro.html');
    assert.equal(valid, path.join(jailDir, 'scenes', 'intro.html'));

    const validInternalSymlink = resolveWorkspacePath(jailDir, 'internal-assets/pip.png');
    assert.equal(validInternalSymlink, path.join(jailDir, 'internal-assets', 'pip.png'));

    // Case-insensitive base path on macOS with internal symlink must still succeed cleanly
    if (process.platform === 'darwin') {
      const lowerJail = jailDir.toLowerCase();
      assert.equal(
        resolveWorkspacePath(lowerJail, 'internal-assets/pip.png'),
        path.join(lowerJail, 'internal-assets', 'pip.png')
      );
    }

    assert.throws(() => resolveWorkspacePath(jailDir, ''), /Invalid workspace path/);
    assert.throws(() => resolveWorkspacePath(jailDir, '.'), /escapes/i);
    assert.throws(() => resolveWorkspacePath(jailDir, './'), /escapes/i);
    assert.throws(() => resolveWorkspacePath(jailDir, '../outside-secret/.env'), /escapes|traversal/i);
    assert.throws(() => resolveWorkspacePath(jailDir, 'scenes/../../.env'), /escapes|traversal/i);
    assert.throws(() => resolveWorkspacePath(jailDir, '%2e%2e/.env'), /encoded|traversal/i);
    assert.throws(() => resolveWorkspacePath(jailDir, '%2E%2E/.env'), /encoded|traversal/i);
    assert.throws(() => resolveWorkspacePath(jailDir, 'a%2fb'), /encoded|traversal/i);
    assert.throws(() => resolveWorkspacePath(jailDir, 'a%5cb'), /encoded|traversal/i);
    assert.throws(() => resolveWorkspacePath(jailDir, 'a%5Cb'), /encoded|traversal/i);
    assert.throws(() => resolveWorkspacePath(jailDir, '/etc/passwd'), /absolute/i);
    assert.throws(() => resolveWorkspacePath(jailDir, 'C:\\Windows\\win.ini'), /absolute/i);
    assert.throws(() => resolveWorkspacePath(jailDir, 'C:foo'), /absolute/i);
    assert.throws(() => resolveWorkspacePath(jailDir, '\\\\server\\share\\file'), /absolute/i);
    assert.throws(() => resolveWorkspacePath(jailDir, 'bad\0file.html'), /null byte/i);
    assert.throws(() => resolveWorkspacePath(jailDir, 'escape-link/.env'), /symlink|escapes/i);
    assert.throws(() => resolveWorkspacePath(jailDir, 'dangling-file'), /symlink|escapes/i);
    assert.throws(() => resolveWorkspacePath(jailDir, 'dangling-dir/payload.html'), /symlink|escapes/i);
    assert.throws(() => resolveWorkspacePath(jailDir, 'escape-link/back-in/file.txt'), /symlink|escapes/i);
  } finally {
    await fs.rm(tmpParent, { recursive: true, force: true });
  }
});

test('escapeHtml escapes HTML special characters cleanly', () => {
  assert.equal(
    escapeHtml('<script src="x">&\'test\'</script>'),
    '&lt;script src=&quot;x&quot;&gt;&amp;&#39;test&#39;&lt;/script&gt;'
  );
});
