// @ts-ignore
import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Project, RenderJob } from '../schemas/index.js';

// Type shim for built-in node:sqlite in Node >=22
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: any[]): void;
    get(...args: any[]): any;
    all(...args: any[]): any[];
  };
  close(): void;
};

export class AnimForgeDatabase {
  private db: SqliteDatabase;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || ':memory:';
    if (resolvedPath !== ':memory:') {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(resolvedPath);
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
      project.id,
      project.name,
      project.prompt,
      JSON.stringify(project),
      project.createdAt,
      project.updatedAt
    );
  }

  getProject(id: string): Project | null {
    const stmt = this.db.prepare('SELECT data FROM projects WHERE id = ?');
    const row = stmt.get(id) as { data: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.data) as Project;
  }

  saveRenderJob(job: RenderJob): void {
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
      job.id,
      job.projectId,
      job.engine,
      job.status,
      job.progress,
      job.outputFilePath || null,
      job.error || null,
      job.startedAt,
      job.finishedAt || null
    );
  }

  getRenderJob(id: string): RenderJob | null {
    const stmt = this.db.prepare('SELECT * FROM render_jobs WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      engine: row.engine,
      status: row.status,
      progress: row.progress,
      outputFilePath: row.output_path || undefined,
      error: row.error || undefined,
      startedAt: row.started_at,
      finishedAt: row.finished_at || undefined,
    };
  }

  close(): void {
    this.db.close();
  }
}
