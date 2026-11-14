#!/usr/bin/env node
import * as path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAnimForgeMcpServer } from './server.js';

function redirectConsoleToStderr(): void {
  console.log = console.error;
  console.info = console.error;
  console.warn = console.error;
  console.debug = console.error;
}

function resolveDefaultWorkspaceDir(): string {
  const cliArg = process.argv[2];
  if (cliArg !== undefined && cliArg.length > 0) {
    return cliArg;
  }
  const envDir = process.env.ANIMFORGE_WORKSPACE_DIR;
  if (envDir !== undefined && envDir.length > 0) {
    return envDir;
  }
  return path.resolve(import.meta.dirname, '..', '..', '..', '..');
}

async function main(): Promise<void> {
  redirectConsoleToStderr();

  const workspaceDir = resolveDefaultWorkspaceDir();
  const handle = await createAnimForgeMcpServer({ workspaceDir });
  const transport = new StdioServerTransport();

  let shuttingDown = false;
  const shutdown = async (exitCode: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await handle.close();
    } finally {
      process.exit(exitCode);
    }
  };

  process.once('SIGINT', () => {
    void shutdown(0);
  });
  process.once('SIGTERM', () => {
    void shutdown(0);
  });
  process.stdin.once('end', () => {
    void shutdown(0);
  });
  transport.onclose = () => {
    void shutdown(0);
  };

  await handle.server.connect(transport);
  console.error(`AnimForge MCP server running on stdio (workspace: ${handle.service.workspaceDir})`);
}

main().catch((err: unknown) => {
  console.error('AnimForge MCP fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
