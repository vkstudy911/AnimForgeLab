// @ts-expect-error node:sqlite built-in module is missing from @types/node 20.x
import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  Project,
  ProjectSchema,
  RenderJob,
  RenderJobSchema,
} from '../schemas/index.js';

type SqlParam = string | number | null;

export interface ProjectSummary {
  id: string;
  name: string;
  prompt: string;
  status: Project['status'];
  width: number;
  height: number;
  fps: number;
  updatedAt: string;
}

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: SqlParam[]): void;
    get(...args: SqlParam[]): Record<string, unknown> | undefined;
    all(...args: SqlParam[]): Record<string, unknown>[];
  };
  close(): void;
};

export class AnimForgeDatabase {
  private db: SqliteDatabase;
  private closed = false;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || ':memory:';
    if (resolvedPath !== ':memory:') {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(resolvedPath) as SqliteDatabase;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS render_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        engine TEXT NOT NULL,
        status TEXT NOT NULL,
        progress REAL NOT NULL,
        output_path TEXT,
        error TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT
      );
    `);
  }

  saveProject(project: Project): void {
    const valid = ProjectSchema.parse(project);
    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, prompt, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        prompt = excluded.prompt,
        data = excluded.data,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      valid.id,
      valid.name,
      valid.prompt,
      JSON.stringify(valid),
      valid.createdAt,
      valid.updatedAt
    );
  }

  getProject(id: string): Project | null {
    const stmt = this.db.prepare('SELECT data FROM projects WHERE id = ?');
    const row = stmt.get(id);
    if (!row || typeof row.data !== 'string') return null;
    return ProjectSchema.parse(JSON.parse(row.data));
  }

  listProjects(): ProjectSummary[] {
    const stmt = this.db.prepare('SELECT data FROM projects ORDER BY updated_at DESC');
    const rows = stmt.all();
    const summaries: ProjectSummary[] = [];
    for (const row of rows) {
      if (typeof row.data !== 'string') continue;
      try {
        const p = ProjectSchema.parse(JSON.parse(row.data));
        summaries.push({
          id: p.id,
          name: p.name,
          prompt: p.prompt,
          status: p.status,
          width: p.width,
          height: p.height,
          fps: p.fps,
          updatedAt: p.updatedAt,
        });
      } catch {
        continue;
      }
    }
    return summaries;
  }

  saveRenderJob(job: RenderJob): void {
    const valid = RenderJobSchema.parse(job);
    const stmt = this.db.prepare(`
      INSERT INTO render_jobs (id, project_id, engine, status, progress, output_path, error, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        progress = excluded.progress,
        output_path = excluded.output_path,
        error = excluded.error,
        finished_at = excluded.finished_at
    `);
    stmt.run(
      valid.id,
      valid.projectId,
      valid.engine,
      valid.status,
      valid.progress,
      valid.outputFilePath ?? null,
      valid.error ?? null,
      valid.startedAt,
      valid.finishedAt ?? null
    );
  }

  getRenderJob(id: string): RenderJob | null {
    const stmt = this.db.prepare('SELECT * FROM render_jobs WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    return RenderJobSchema.parse({
      id: row.id,
      projectId: row.project_id,
      engine: row.engine,
      status: row.status,
      progress: row.progress,
      outputFilePath: row.output_path ?? undefined,
      error: row.error ?? undefined,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
