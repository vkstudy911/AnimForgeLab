import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ALLOWED_ASSET_EXTENSIONS } from '../mcp/validation.js';
import { assertSafeId, resolveProjectDir, resolveWorkspacePath } from '../../utils/paths.js';

export const MAX_IMPORTED_ASSET_BYTES = 50 * 1024 * 1024;
export const SAFE_ASSET_FILENAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export function sanitizeImportedFilename(rawName: string): string {
  const base = path.basename(rawName.trim());
  if (!base || base.startsWith('.')) {
    throw new Error(`Hidden or empty asset filename not allowed: ${rawName}`);
  }
  const ext = path.extname(base).toLowerCase();
  if (!ALLOWED_ASSET_EXTENSIONS.has(ext)) {
    throw new Error(
      `Unsupported asset extension '${ext || '(none)'}'. Allowed: ${[...ALLOWED_ASSET_EXTENSIONS].join(', ')}`
    );
  }
  const stem = base.slice(0, base.length - ext.length);
  const cleanedStem = stem
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, Math.max(1, 128 - ext.length));
  const candidate = `${cleanedStem || 'asset'}${ext}`;
  if (!SAFE_ASSET_FILENAME_PATTERN.test(candidate) || candidate.includes('..')) {
    throw new Error(`Unsafe asset filename: ${rawName}`);
  }
  return candidate;
}

export async function listSafeFilesRecursive(
  baseDir: string,
  workspaceRoot: string,
  maxDepth = 3,
  depth = 0
): Promise<string[]> {
  if (depth > maxDepth || !fsSync.existsSync(baseDir)) return [];
  const baseLstat = await fs.lstat(baseDir).catch(() => null);
  if (!baseLstat || baseLstat.isSymbolicLink() || !baseLstat.isDirectory()) return [];

  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(baseDir, entry.name);
    let lstat;
    try {
      lstat = await fs.lstat(fullPath);
    } catch {
      continue;
    }
    if (lstat.isSymbolicLink()) continue;

    if (lstat.isDirectory()) {
      const nested = await listSafeFilesRecursive(fullPath, workspaceRoot, maxDepth, depth + 1);
      results.push(...nested);
    } else if (lstat.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ALLOWED_ASSET_EXTENSIONS.has(ext)) {
        results.push(path.relative(workspaceRoot, fullPath).split(path.sep).join('/'));
      }
    }
  }
  return results.sort();
}

export async function copyDirectoryFilesSafe(
  srcDir: string,
  destDir: string,
  depth = 0
): Promise<void> {
  if (depth > 4 || !fsSync.existsSync(srcDir)) return;
  const srcStat = await fs.lstat(srcDir).catch(() => null);
  if (!srcStat || srcStat.isSymbolicLink() || !srcStat.isDirectory()) return;

  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    const lstat = await fs.lstat(srcPath).catch(() => null);
    if (!lstat || lstat.isSymbolicLink()) continue;
    if (lstat.isDirectory()) {
      await copyDirectoryFilesSafe(srcPath, destPath, depth + 1);
    } else if (lstat.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_ASSET_EXTENSIONS.has(ext)) continue;
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export async function resolveProjectAssetDestPath(
  workspaceDir: string,
  projectId: string,
  fileName: string
): Promise<{ projectDir: string; assetsDir: string; destPath: string; safeFileName: string }> {
  const safeProjectId = assertSafeId(projectId, 'project');
  const safeFileName = sanitizeImportedFilename(fileName);
  const projectDir = resolveProjectDir(workspaceDir, safeProjectId);
  const assetsDir = resolveWorkspacePath(projectDir, 'assets');
  const destPath = resolveWorkspacePath(assetsDir, safeFileName);
  return { projectDir, assetsDir, destPath, safeFileName };
}

export function inferAssetTypeFromFilename(
  fileName: string
): 'background' | 'audio' | 'model' | 'character' | 'prop' {
  const ext = path.extname(fileName).toLowerCase();
  if (
    ext === '.mp3' ||
    ext === '.wav' ||
    ext === '.ogg' ||
    ext === '.m4a' ||
    ext === '.aac' ||
    ext === '.flac'
  ) {
    return 'audio';
  }
  if (ext === '.stretch' || ext === '.json') {
    return 'character';
  }
  return 'background';
}
