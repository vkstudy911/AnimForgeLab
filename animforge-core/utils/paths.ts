import * as fs from 'node:fs';
import * as path from 'node:path';

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const ENCODED_TRAVERSAL_PATTERN = /%(?:2e|2f|5c)/i;

function dirPrefix(dir: string): string {
  return dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`;
}

function isWithinBase(base: string, candidate: string): boolean {
  return candidate === base || candidate.startsWith(dirPrefix(base));
}

function assertNoSymlinkEscape(resolvedBase: string, resolvedTarget: string): void {
  if (!fs.existsSync(resolvedBase)) return;

  const realBase = fs.realpathSync.native(resolvedBase);
  const relSegments = path.relative(resolvedBase, resolvedTarget).split(path.sep).filter(Boolean);
  let cursor = resolvedBase;

  for (const segment of relSegments) {
    cursor = path.join(cursor, segment);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(cursor);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        break;
      }
      throw err;
    }

    if (stat.isSymbolicLink()) {
      let realCursor: string;
      try {
        realCursor = fs.realpathSync.native(cursor);
      } catch {
        throw new Error('Resolved path escapes workspace jail via symlink');
      }
      if (!isWithinBase(realBase, realCursor)) {
        throw new Error('Resolved path escapes workspace jail via symlink');
      }
    }
  }
}

export function assertSafeId(id: string, label = 'id'): string {
  if (typeof id !== 'string' || !SAFE_ID_PATTERN.test(id)) {
    throw new Error(`Invalid ${label} id`);
  }
  return id;
}

export function resolveWorkspacePath(baseDir: string, relativePath: string): string {
  if (typeof baseDir !== 'string' || baseDir.length === 0 || baseDir.includes('\0')) {
    throw new Error('Invalid base directory path');
  }
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error('Invalid workspace path');
  }
  if (relativePath.includes('\0')) {
    throw new Error('Invalid workspace path: null byte not allowed');
  }
  if (ENCODED_TRAVERSAL_PATTERN.test(relativePath)) {
    throw new Error('Invalid workspace path: encoded traversal not allowed');
  }
  if (
    path.isAbsolute(relativePath) ||
    /^[a-zA-Z]:/.test(relativePath) ||
    relativePath.startsWith('\\')
  ) {
    throw new Error('Invalid workspace path: absolute path not allowed');
  }
  if (relativePath.split(/[\\/]+/).some((segment) => segment === '..')) {
    throw new Error('Invalid workspace path: traversal not allowed');
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, relativePath);
  if (resolvedTarget === resolvedBase || !resolvedTarget.startsWith(dirPrefix(resolvedBase))) {
    throw new Error('Resolved path escapes workspace jail');
  }

  assertNoSymlinkEscape(resolvedBase, resolvedTarget);
  return resolvedTarget;
}

export function resolveProjectDir(workspaceDir: string, projectId: string): string {
  const safeId = assertSafeId(projectId, 'project');
  const projectsRoot = resolveWorkspacePath(workspaceDir, 'projects');
  return resolveWorkspacePath(projectsRoot, safeId);
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return String(text).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}
