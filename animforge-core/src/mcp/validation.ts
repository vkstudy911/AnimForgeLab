import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { assertSafeId, resolveProjectDir, resolveWorkspacePath } from '../../utils/paths.js';
import { McpToolError } from './errors.js';

export const ALLOWED_ASSET_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.avif',
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.aac',
  '.flac',
  '.json',
  '.stretch',
]);

const SAFE_FILENAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export async function validateWorkspaceDir(workspaceDir: string): Promise<string> {
  if (typeof workspaceDir !== 'string' || workspaceDir.length === 0 || workspaceDir.includes('\0')) {
    throw new McpToolError('PATH_VIOLATION', 'Invalid workspace directory path');
  }
  const resolved = path.resolve(workspaceDir);
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new McpToolError('PATH_VIOLATION', `Workspace directory does not exist: ${resolved}`);
  }
  if (!stat.isDirectory()) {
    throw new McpToolError('PATH_VIOLATION', `Workspace path is not a directory: ${resolved}`);
  }
  return resolved;
}

export function assertNoHiddenSegments(relPath: string): void {
  const segments = relPath.split(/[\\/]+/).filter((s) => s.length > 0);
  if (segments.length === 0) {
    throw new McpToolError('PATH_VIOLATION', 'Path cannot be empty');
  }
  for (const segment of segments) {
    if (segment === '.' || segment === '..' || segment.startsWith('.')) {
      throw new McpToolError('PATH_VIOLATION', `Hidden or traversal path segment not allowed: ${segment}`);
    }
  }
}

export function assertAllowedAssetExtension(filePath: string): string {
  const base = path.basename(filePath);
  if (!base || base.startsWith('.')) {
    throw new McpToolError('PATH_VIOLATION', `Hidden or empty filename not allowed: ${base}`);
  }
  const ext = path.extname(base).toLowerCase();
  if (!ALLOWED_ASSET_EXTENSIONS.has(ext)) {
    throw new McpToolError(
      'PATH_VIOLATION',
      `Unsupported asset extension '${ext || '(none)'}'. Allowed: ${[...ALLOWED_ASSET_EXTENSIONS].join(', ')}`
    );
  }
  return ext;
}

export async function assertApprovedAssetSourcePath(
  workspaceDir: string,
  sourcePath: string
): Promise<string> {
  assertNoHiddenSegments(sourcePath);

  let resolvedSource: string;
  try {
    resolvedSource = resolveWorkspacePath(workspaceDir, sourcePath);
  } catch (err: unknown) {
    throw new McpToolError(
      'PATH_VIOLATION',
      err instanceof Error ? err.message : String(err)
    );
  }

  const normalizedRel = path.relative(path.resolve(workspaceDir), resolvedSource);
  const parts = normalizedRel.split(path.sep).filter(Boolean);
  const inSharedAssets = parts[0] === 'assets' && parts.length >= 2;
  const inProjectAssets =
    parts[0] === 'projects' &&
    parts.length >= 4 &&
    parts[2] === 'assets';

  if (inProjectAssets) {
    assertSafeId(parts[1], 'project');
  } else if (!inSharedAssets) {
    throw new McpToolError(
      'PATH_VIOLATION',
      'Asset imports are restricted to files inside approved workspace directories (assets/ or projects/<id>/assets/)'
    );
  }

  assertAllowedAssetExtension(resolvedSource);

  let stat;
  try {
    stat = await fs.stat(resolvedSource);
  } catch {
    throw new McpToolError('NOT_FOUND', `Source asset not found: ${sourcePath}`);
  }
  if (!stat.isFile()) {
    throw new McpToolError('PATH_VIOLATION', `Source asset must be a regular file: ${sourcePath}`);
  }

  return resolvedSource;
}

export async function resolveSafeDestAssetPath(
  workspaceDir: string,
  projectId: string,
  fileName: string
): Promise<{ projectDir: string; assetsDir: string; destPath: string }> {
  const safeProjectId = assertSafeId(projectId, 'project');
  if (!SAFE_FILENAME_PATTERN.test(fileName) || fileName.includes('..')) {
    throw new McpToolError('PATH_VIOLATION', `Unsafe asset filename: ${fileName}`);
  }
  assertAllowedAssetExtension(fileName);

  const projectDir = resolveProjectDir(workspaceDir, safeProjectId);
  const assetsDir = resolveWorkspacePath(projectDir, 'assets');
  const destPath = resolveWorkspacePath(assetsDir, fileName);
  return { projectDir, assetsDir, destPath };
}

export function requireConfirmation(confirmed: boolean | undefined, action: string): void {
  if (confirmed !== true) {
    throw new McpToolError(
      'CONFIRMATION_REQUIRED',
      `Explicit confirmation required to ${action}. Pass confirm/confirmOverwrite: true to proceed.`
    );
  }
}
