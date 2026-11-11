# AnimForge Studio — Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Milestone 1 ("Real GiveMotion Adapter + Tauri 2 Shell Vertical Slice"): replace the `GivemotionAdapter` / `AnimForgePipeline` stubs with real GiveMotion HTML composition, QA, bundling, and NDJSON render streaming, prove it with an `ffprobe`-verified MP4 integration test, and wire it into a minimal macOS/Linux Tauri 2 + React 18 + TypeScript + Vite desktop shell with `<gm-player>` preview.

**Architecture:** `animforge-core` (Node.js ESM TypeScript) owns canonical Zod project/scene/character schemas, compiles unified scenes into standalone GiveMotion `index.html`, drives `engines/givemotion/src/cli.js` strictly via argument-safe `execFile`/`spawn` (`shell: false`), and exposes a single-process NDJSON stdio worker (`src/worker.ts`). A new Tauri 2 desktop app (`animforge-desktop/`) provides Rust host supervision (`doctor`, Node worker lifecycle, `127.0.0.1` path-jailed HTTP preview server for `<gm-player>` and `.mp4`) and a React 18 + Vite UI displaying health checks, project open/save, QA status, live render progress, and playback.

**Tech Stack:** Node.js `v24+` (ESM, `node:test`, `node:child_process`), TypeScript `^5.4`, Zod `^3.23`, GiveMotion `0.1.5` (external MIT CLI), Rust + Tauri 2 + `tauri-plugin-dialog`, React `18.3.x`, Vite `5.4.x`.

**Spec:** `documentation/REPOSITORY_AUDIT.md` (Section 10: First Integration Milestone; Section 7–8; `documentation/architecture.md`; `documentation/integration-plan.md`)

---

## Global Constraints

1. **Target OS & Stack:** macOS and Linux using **Tauri 2 + Rust + React 18.3.x + TypeScript 5.x + Vite**; reuse existing `animforge-core` (`zod ^3.23.8`, `typescript ^5.4.5`) and `engines/givemotion` (`0.1.5`) rather than adding duplicate frameworks.
2. **Upstream Preservation:** NEVER modify, overwrite, or delete files inside `engines/givemotion/`, `engines/remotion/`, `engines/stretchystudio/`, or existing sample outputs in `projects/*-test`, `projects/demo-animation`, `projects/cybersecurity-explainer`.
3. **Host Prerequisites Required Before Execution:**
   - **Git root missing:** `AnimForgeLab/` has no top-level `.git` repo (`subagent-driven-development` requires git commits/diffs per task). Task 1 creates `AnimForgeLab/.gitignore` and initializes git without staging `engines/` or build artifacts.
   - **Rust toolchain missing:** `rustc` and `cargo` are not installed on this host (`node v24.19.0`, `npm 11.17.0`, `ffmpeg 9.0.1`, Chrome `157.0.8103.38` are present). Tasks 1–6 (`animforge-core` + GiveMotion integration + worker) can run immediately; Tasks 7–9 (`animforge-desktop/`) require `rustup` + Tauri OS system libraries first.
4. **No Shell Interpolation (`shell: false`):** Workspace parent `/Users/vipinkumar/Desktop/animator /` ends with a trailing space. Never use `exec`/`execAsync` shell strings anywhere in TypeScript or `sh -c` in Rust; always pass argument arrays (`execFile`/`spawn` in Node, `Command::new` + `.arg()` in Rust).
5. **Workspace Path Jail:** All project IDs must match `/^[a-zA-Z0-9_-]{1,64}$/` and all file reads/writes/HTTP static serves must resolve strictly inside `AnimForgeLab/projects/<projectId>/`.
6. **Sandbox vs Host Integration Tests:** Sandboxed agent shells block Chrome launch and `127.0.0.1` sockets with `EPERM`. Every micro-task must include a deterministic **sandbox-safe unit test** via injectable seams, plus Task 5 adds an unmocked Chrome+FFmpeg+`ffprobe` integration test (`npm run test:integration`) to run unsandboxed / on CI.
7. **Baseline Regression:** Existing `animforge-core/test/pipeline.test.ts` (5/5 tests) and `npm run typecheck` must pass after every Task 1–6 commit.

## Review Focus

1. **Workspace path trailing space (`/Users/vipinkumar/Desktop/animator /`):** Unquoted paths or shell commands break `node`, `chrome`, and `ffmpeg` — pinned by path-with-spaces tests in Tasks 2, 4, and 7.
2. **Path traversal via `projectId` or preview HTTP URL (`../`, `%2e%2e`):** Malicious IDs or HTTP requests could escape `projects/` into `../.env` — pinned by `assertSafeId` / `resolveProjectDir` tests in Task 2 and `resolve_safe_asset` tests in Task 8.
3. **Chunked NDJSON stderr progress & non-zero `check --json` exit codes:** GiveMotion `check` exits `1` even while printing valid JSON on stdout, and `render --progress json` splits JSON lines across stderr chunks — pinned by `givemotion.ndjson` + `givemotion.adapter.test.ts` in Task 4.
4. **`<gm-player>` under Tauri WebView (`file://` fails):** GiveMotion explicitly forbids `file://` for `<gm-player>` (`bundle.js`/`cli.js`); preview must bundle via `givemotion bundle` and serve over `127.0.0.1:<port>` — pinned by bundle verification in Task 5 and HTTP serving tests in Task 8.
5. **Orphan Chrome/Node subprocesses & missing-binary `doctor` diagnostics:** Closing a render or window must terminate the Node worker and child renders, and missing Chrome/FFmpeg must produce structured UI status rather than raw crashes — pinned by worker EOF exit test in Task 6, `doctor.rs` tests in Task 7, and worker supervisor cleanup in Task 8.

---

## File Map

### Wave 1 — `animforge-core/` & Workspace Hygiene (Tasks 1–6)
- Create: `AnimForgeLab/.gitignore` — ignore `engines/`, `node_modules/`, `dist/`, `.superpowers/`, `projects/proj_*`, `src-tauri/target/`, `.DS_Store`.
- Create: `AnimForgeLab/animforge-core/utils/paths.ts` — `assertSafeId`, `resolveProjectDir`, `escapeHtml`.
- Create: `AnimForgeLab/animforge-core/adapters/givemotion.compiler.ts` — pure `Scene` + `Character` → GiveMotion HTML compiler (`compileProjectHtml`).
- Create: `AnimForgeLab/animforge-core/adapters/givemotion.ndjson.ts` — `createNdjsonParser`, `mapPhaseToPercent`, `parseDoctorStdout`.
- Create: `AnimForgeLab/animforge-core/src/worker.ts` — NDJSON stdio worker for Tauri Rust IPC.
- Modify: `AnimForgeLab/animforge-core/package.json` — add `test` glob, `test:integration`, clean scripts.
- Modify: `AnimForgeLab/animforge-core/adapters/adapter.interface.ts` — caller-supplied `projectId`, optional `characters` & `onProgress` params.
- Modify: `AnimForgeLab/animforge-core/adapters/remotion.adapter.ts` & `stretchystudio.adapter.ts` — align `createProject` signature only.
- Modify: `AnimForgeLab/animforge-core/src/pipeline.ts` — pass consistent `projectId` + `characters` + forwarded render progress callback.
- Modify: `AnimForgeLab/animforge-core/adapters/givemotion.adapter.ts` — argument-safe `execFile`/`spawn`, persisted `project.animforge.json`, real `doctor`/`check`/`still`/`bundle`/`render --progress json`.
- Tests: `AnimForgeLab/animforge-core/test/{project-contract,givemotion.compiler,givemotion.adapter,givemotion.integration,worker}.test.ts`.

### Wave 2 — `animforge-desktop/` Tauri 2 + Rust + React 18 Shell (Tasks 7–9)
- Create: `AnimForgeLab/animforge-desktop/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `vitest.config.ts`.
- Create: `AnimForgeLab/animforge-desktop/src-tauri/{Cargo.toml,build.rs,tauri.conf.json,capabilities/default.json}`.
- Create: `AnimForgeLab/animforge-desktop/src-tauri/src/{main.rs,lib.rs,doctor.rs,worker_bridge.rs,preview_server.rs}`.
- Create: `AnimForgeLab/animforge-desktop/src/{main.tsx,App.tsx,types.ts,hooks/useStudio.ts,components/DoctorBar.tsx,components/PreviewStage.tsx}`.
- Tests: `cargo test` in `src-tauri/`, `npm test` (Vitest) + `npm run build` in `animforge-desktop/`.

---

## Wave 1: `animforge-core/` & GiveMotion Real Adapter

### Task 1: Workspace Git & Test Runner Setup

**Files:**
- Create: `AnimForgeLab/.gitignore`
- Modify: `AnimForgeLab/animforge-core/package.json:7-11`

**Interfaces:**
- Consumes: none (root setup).
- Produces: `npm test` in `animforge-core` builds TS and executes all `dist/test/*.test.js` unit suites (excluding `dist/test/*.integration.test.js`); `npm run test:integration` executes real Chrome/FFmpeg integration tests separately; clean git root at `AnimForgeLab/`.

- [ ] **Step 1: Create `AnimForgeLab/.gitignore` so upstream engines, deps, and generated renders stay untracked**

Write `AnimForgeLab/.gitignore` excluding `.DS_Store`, `.superpowers/`, `engines/`, `**/node_modules/`, `**/dist/`, `projects/proj_*/`, `projects/*/out*`, `projects/*/.gm-parts/`, `animforge-desktop/src-tauri/target/`, `*.db`.

- [ ] **Step 2: Initialize git at `AnimForgeLab/` and verify upstream `engines/` stay excluded**

Run from `AnimForgeLab/`:
```bash
git init && git status --short
```
Expected: `engines/` does NOT appear in untracked files; `.gitignore`, `README.md`, `dev.sh`, `animforge-core/` (without `node_modules`/`dist`), and `documentation/` appear cleanly. Stage and commit the baseline:
```bash
git add .gitignore README.md dev.sh documentation docs animforge-core assets projects
git commit -m "chore: baseline AnimForgeLab snapshot before Milestone 1"
```

- [ ] **Step 3: Verify existing `animforge-core` tests pass as baseline before changing scripts**

Run in `AnimForgeLab/animforge-core`:
```bash
npm run typecheck && npm test
```
Expected: PASS (`5` tests in `pipeline.test.ts`).

- [ ] **Step 4: Update `animforge-core/package.json` test scripts cleanly**

Update `"scripts"` in `AnimForgeLab/animforge-core/package.json` to run all unit suites while keeping `givemotion.integration.test.ts` cleanly gated by `ANIMFORGE_INTEGRATION=1` (as added in Task 5):
```json
"build": "tsc",
"test": "tsc && node --test dist/test/*.test.js",
"test:integration": "tsc && ANIMFORGE_INTEGRATION=1 node --test dist/test/givemotion.integration.test.js",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 5: Verify scripts and commit**

Run: `cd animforge-core && npm run typecheck && npm test`
Expected: PASS (`5/5` tests).
Commit: `git add animforge-core/package.json && git commit -m "chore: configure core unit and gated integration test scripts"`

---

### Task 2: Workspace Path Safety & Deterministic `projectId` Contract

**Files:**
- Create: `AnimForgeLab/animforge-core/utils/paths.ts`
- Modify: `AnimForgeLab/animforge-core/adapters/adapter.interface.ts:16-35`
- Modify: `AnimForgeLab/animforge-core/adapters/remotion.adapter.ts:30-32`
- Modify: `AnimForgeLab/animforge-core/adapters/stretchystudio.adapter.ts:44-46`
- Modify: `AnimForgeLab/animforge-core/adapters/givemotion.adapter.ts:32-61`
- Modify: `AnimForgeLab/animforge-core/src/pipeline.ts:75-89`
- Test: `AnimForgeLab/animforge-core/test/project-contract.test.ts`

**Interfaces:**
- Consumes: `ProjectConfig`, `Character`, `RenderJob`, `RenderStatus` from `../schemas/index.js`.
- Produces:
  - `utils/paths.ts`: `assertSafeId(id: string, label?: string): string`, `resolveProjectDir(workspaceDir: string, projectId: string): string`, `escapeHtml(text: string): string`
  - `AnimationEngineAdapter.createProject(projectId: string, config: ProjectConfig, characters?: Character[]): Promise<string>`
  - `AnimationEngineAdapter.render(projectId: string, onProgress?: (info: RenderProgressUpdate) => void): Promise<RenderJob>`
  - `export interface RenderProgressUpdate { phase: 'open' | 'frames' | 'encode' | 'done'; progress: number; done?: number; total?: number; fps?: number; eta?: number | null }`

- [ ] **Step 1: Write failing unit tests in `animforge-core/test/project-contract.test.ts`**

Test assertions:
1. `assertSafeId('proj_123-abc')` returns `'proj_123-abc'`; `assertSafeId('../escape')`, `assertSafeId('a/b')`, `assertSafeId('')` throw `/Invalid .* id/i`.
2. `resolveProjectDir('/tmp/animator space/AnimForgeLab', 'proj_42')` returns `path.resolve('/tmp/animator space/AnimForgeLab', 'projects', 'proj_42')` and handles spaces in parent directory without escaping `projects/`.
3. `escapeHtml('<script>"&\'')` returns `'&lt;script&gt;&quot;&amp;&#39;'`.
4. `AnimForgePipeline.execute(config, recordingMockAdapter)` passes the exact same `projectId` (`/^proj_\d+$/`) to `createProject(projectId, config, characters)`, every `createScene(scene)` (`scene.projectId === projectId`), `render(projectId, cb)`, and persists matching `project.id === renderJob.projectId` in `:memory:` SQLite.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd animforge-core && npm test`
Expected: FAIL (`Cannot find module '../utils/paths.js'` / signature mismatch).

- [ ] **Step 3: Implement `utils/paths.ts`, update `AnimationEngineAdapter`, `AnimForgePipeline`, and align all three adapters**

1. In `utils/paths.ts`: enforce `/^[a-zA-Z0-9_-]{1,64}$/` in `assertSafeId`; verify `resolved === projectsRoot || resolved.startsWith(projectsRoot + path.sep)` (strict child: `resolved.startsWith(projectsRoot + path.sep)`) in `resolveProjectDir`; implement `escapeHtml`.
2. In `adapter.interface.ts`: export `RenderProgressUpdate`, change `createProject(projectId: string, config: ProjectConfig, characters?: Character[]): Promise<string>` and `render(projectId: string, onProgress?: (info: RenderProgressUpdate) => void): Promise<RenderJob>`.
3. In `remotion.adapter.ts` & `stretchystudio.adapter.ts`: update `createProject(projectId: string, config: ProjectConfig, _characters?: Character[])` to validate `projectId` via `assertSafeId` / `resolveProjectDir` and return `projectId` (preserving existing stub body inside).
4. In `givemotion.adapter.ts`: accept `projectId` in `createProject(projectId, config)` using `resolveProjectDir` (remove hardcoded `proj_${Date.now()}`).
5. In `pipeline.ts`: call `await adapter.createProject(projectId, config, [character])` and forward `onProgress` (`RENDER_PROGRESS`) into `adapter.render(projectId, ...)`.

- [ ] **Step 4: Run `typecheck` and unit tests**

Run: `cd animforge-core && npm run typecheck && npm test`
Expected: PASS (`pipeline.test.ts` + `project-contract.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add animforge-core/utils/paths.ts animforge-core/adapters/ animforge-core/src/pipeline.ts animforge-core/test/project-contract.test.ts
git commit -m "fix: unify projectId contract, add workspace path jail, align adapter signatures"
```

---

### Task 3: Pure GiveMotion Composition Compiler (`Scene` + `Character` → `index.html`)

**Files:**
- Create: `AnimForgeLab/animforge-core/adapters/givemotion.compiler.ts`
- Test: `AnimForgeLab/animforge-core/test/givemotion.compiler.test.ts`

**Interfaces:**
- Consumes: `ProjectConfig`, `Scene`, `Character` (`../schemas/index.js`), `escapeHtml` (`../utils/paths.js`).
- Produces:
  - `export interface GivemotionProjectState { id: string; config: ProjectConfig; characters: Character[]; scenes: Scene[] }`
  - `export function compileProjectHtml(state: GivemotionProjectState): string`
  - `export function buildCharacterSvg(character: Character, activeActions: string[]): string`

- [ ] **Step 1: Write failing tests in `animforge-core/test/givemotion.compiler.test.ts`**

Test assertions:
1. Compiling a 2-scene project (`1280x720`, `fps: 30`) with a `Character` (`Pip`, palette `['#22c55e', '#16a34a', '#86efac']`, parts `torso`, `head`, `eye_left`, `eye_right`, `arm_right`, `leg_left`, `leg_right`) and scene 1 (`walk`, `look_around`, `blink`, `cameraMoves: [{ type: 'static', ... }]`) + scene 2 (`wave`, `smile`, `cameraMoves: [{ type: 'zoom', startZoom: 1, endZoom: 1.15 }]`, `transition: { type: 'dissolve', duration: 0.5 }`):
   - Emits `<html data-width="1280" data-height="720" data-fps="30">`
   - Emits `<main data-sequence data-transition="fade 0.5">` and two `<section class="scene" id="scene_1" data-duration="...">` blocks
   - Emits `data-camera="push 1.15"` (or zoom scale > 1 mapped to GiveMotion `push <zoom>`) for scene 2 and per-scene `data-transition="fade 0.5"` when dissolve/fade requested
   - Renders SVG `<svg class="character-svg" viewBox="0 0 160 220">` containing part `<g id="arm_right" ...>` with CSS motion classes matching `CharacterActionSchema` names (`action-wave`, `action-walk`, `action-smile`, `action-blink`, `action-look_around`) driven cleanly by CSS keyframes (`animation:`) so GiveMotion's virtual clock deterministically animates every frame
   - Escapes malicious `<script>` in `config.name`, `scene.title`, and `scene.description` (`escapeHtml`).
2. Works gracefully when `characters` is empty (`[]`) — renders styled environment backdrop + readable safe-margin scene card without throwing or triggering empty-frame errors.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd animforge-core && npm test`
Expected: FAIL (`Cannot find module '../adapters/givemotion.compiler.js'`).

- [ ] **Step 3: Implement `animforge-core/adapters/givemotion.compiler.ts`**

Implement pure HTML/CSS/SVG compiler matching verified GiveMotion semantics (`<html data-width data-height data-fps>`, `<main data-sequence>`, `<section class="scene" data-duration data-camera>`, CSS keyframes for `walk`, `wave`, `smile`, `blink`, `look_around`, camera mapping `zoom`/`push`/`pull`/`pan`/`shake`/`static`, safe typography contrast >= 7:1, 60px margins so `givemotion check` passes with zero offscreen/low-contrast errors). No disk I/O inside `compileProjectHtml`.

- [ ] **Step 4: Run `typecheck` and tests**

Run: `cd animforge-core && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add animforge-core/adapters/givemotion.compiler.ts animforge-core/test/givemotion.compiler.test.ts
git commit -m "feat: compile Scene and Character IR into deterministic GiveMotion HTML/SVG"
```

---

### Task 4: Real `GivemotionAdapter` CLI Runners (`doctor`, `check` + `bundle`, `render --progress json`)

**Files:**
- Create: `AnimForgeLab/animforge-core/adapters/givemotion.ndjson.ts`
- Modify: `AnimForgeLab/animforge-core/adapters/givemotion.adapter.ts`
- Test: `AnimForgeLab/animforge-core/test/givemotion.adapter.test.ts`

**Interfaces:**
- Consumes: `compileProjectHtml`, `GivemotionProjectState` (`./givemotion.compiler.js`), `assertSafeId`, `resolveProjectDir` (`../utils/paths.js`), `RenderProgressUpdate` (`./adapter.interface.js`).
- Produces:
  - `givemotion.ndjson.ts`:
    - `export type GivemotionCliEvent = { event: 'progress'; phase: 'open' | 'frames' | 'encode' | 'done'; done?: number; total?: number; fps?: number; eta?: number | null; output?: string } | { event: 'log'; message: string } | { event: 'warning'; code: string; message: string } | { event: 'error'; message: string; issues?: unknown[] }`
    - `export interface DoctorCheckResult { ok: boolean; node: string; chrome: string | null; ffmpeg: string | null; encoder: string | null; raw: string }`
    - `export function parseDoctorStdout(stdout: string): DoctorCheckResult`
    - `export function createNdjsonLineParser(onLine: (ev: GivemotionCliEvent) => void): { push(chunk: string): void; flush(): void }`
    - `export function progressPercent(ev: Extract<GivemotionCliEvent, { event: 'progress' }>): number`
  - `GivemotionAdapter` (`adapters/givemotion.adapter.ts`):
    - `constructor(workspaceDir: string, cliPath?: string, deps?: GivemotionProcessDeps)` (defaults to `node:child_process` `execFile` + `spawn` with `shell: false`)
    - `initialize(): Promise<void>` — runs `[cliPath, 'doctor']`, fails cleanly if Chrome or FFmpeg absent
    - `getDoctorInfo(): Promise<DoctorCheckResult>` — reusable structured probe
    - `createProject(projectId, config, characters)` — writes `projects/<id>/project.animforge.json` + `projects/<id>/index.html`
    - `createScene(config)` — validates `scene.projectId`, loads & upserts scene (by `scene.id`) in `project.animforge.json`, recompiles `index.html` cleanly (idempotent!)
    - `preview(sceneId)` — resolves `projectId` (via memory map or scanning `projects/*/project.animforge.json`), runs `[cliPath, 'check', indexHtml, '--json']` (parsing stdout JSON even on exit code 1!), runs `[cliPath, 'bundle', indexHtml, '-o', bundleDir, '--json']`, returns JSON string `{ ok, errors, warnings, issues, projectId, bundleDir, entryHtml }`
    - `render(projectId, onProgress?)` — spawns `node [cliPath, 'render', indexHtml, '-o', outputMp4, '--progress', 'json', '--json']` (`shell: false`), parses `stderr` NDJSON chunks live via `createNdjsonLineParser`, updates `job.progress` (`open`: 5%, `frames`: `10 + Math.round((done/total)*75)`, `encode`: 90%, `done`: 100%) and calls `onProgress`, sets `'completed'` or `'failed'` with structured `error` on exit/error event. Tracks active child processes for cleanup (`dispose()`).

- [ ] **Step 1: Write failing tests in `animforge-core/test/givemotion.adapter.test.ts`**

Test assertions (using temp dir whose path contains a space, plus stub `execFileFn`/`spawnFn` using Node `EventEmitter` + `PassThrough` streams — zero Chrome needed):
1. `parseDoctorStdout` accurately parses Chrome `157`, FFmpeg `9.0.1`, VideoToolbox fallback (`software (x264)`) and detects missing Chrome (`chrome      not found -> ...` => `ok: false, chrome: null`).
2. `createNdjsonLineParser` handles split chunks mid-JSON line across three `push()` calls and ignores non-JSON diagnostic noise safely; `progressPercent` returns monotonic `5 -> 48 -> 90 -> 100`.
3. `GivemotionAdapter.createProject` + twice calling `createScene` with same `scene.id` persists `project.animforge.json` + `index.html` cleanly without duplicate `<section id="scene_1">` blocks, even in a workspace path with trailing space.
4. `GivemotionAdapter.preview('scene_1')` invokes `check index.html --json` & `bundle index.html -o bundle --json` via arg arrays (`shell: false` — never `/bin/sh`) and returns JSON `{ ok: true, bundleDir: ... }` when `ok`; when `check` exits `1` with `{ ok: false, errors: 1, issues: [...] }`, `preview()` throws or returns structured failure `ok: false` with the parsed issues (decide cleanly: return structured JSON `{ ok: false, errors: 1, issues, ... }` from `preview` so callers & UI inspect exact issues rather than losing them, OR document in `Interfaces`: `preview` returns JSON string `{ ok, errors, warnings, issues, bundleDir, entryHtml }`; throw only if CLI itself crashes without JSON!). Let's standardize on returning JSON string `{ ok, errors, warnings, issues, projectId, bundleDir, entryHtml }` and throwing ONLY on malformed CLI crash!
5. `GivemotionAdapter.render(projectId, cb)` streams chunked NDJSON progress events -> `getRenderStatus(jobId)` transitions `'rendering'` (with numeric progress) -> `'completed'` -> `exportVideo(jobId)` returns `output.mp4` path; and an `'error'` NDJSON event / non-zero exit sets `status: 'failed'` cleanly.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd animforge-core && npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `adapters/givemotion.ndjson.ts` and refactor `adapters/givemotion.adapter.ts`**

Implement clean argument-array execution (`execFile` + `spawn` with `shell: false`), stderr NDJSON line framing, state persistence via `project.animforge.json`, scene-to-project index lookup, and child-process tracking with `dispose()`.

- [ ] **Step 4: Run `typecheck` and tests**

Run: `cd animforge-core && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add animforge-core/adapters/givemotion.ndjson.ts animforge-core/adapters/givemotion.adapter.ts animforge-core/test/givemotion.adapter.test.ts
git commit -m "feat: implement real GivemotionAdapter CLI/NDJSON execution and QA preview"
```

---

### Task 5: Executable End-to-End Chrome + FFmpeg + `ffprobe` Integration Test

**Files:**
- Create: `AnimForgeLab/animforge-core/test/givemotion.integration.test.ts`

**Interfaces:**
- Consumes: `GivemotionAdapter`, `AnimForgePipeline`, `AnimForgeDatabase`, `CharacterManagerAgent`, `ScenePlannerAgent`, `StoryDirectorAgent`.
- Produces: runnable real Chrome+FFmpeg verification (`npm run test:integration`) validating generated HTML -> `check --json` -> `bundle` (`gm-player.js` + `index.html`) -> MP4 render -> `ffprobe` codec/resolution/duration check.

- [ ] **Step 1: Write `animforge-core/test/givemotion.integration.test.ts`**

Test behavior (runs under `ANIMFORGE_INTEGRATION=1`, skipped cleanly under sandboxed `npm test` with clear skip reason):
1. Creates isolated temp project ID `'proj_int_test_' + Date.now()` cleaned up in `finally`.
2. Instantiates `GivemotionAdapter(workspaceRoot)` (point at actual `AnimForgeLab/`, whose path contains the trailing space!).
3. Calls `await adapter.initialize()` (`doctor` passes).
4. Creates `ProjectConfig` (`1280x720`, `fps: 30`) and 1 short 2-second scene using `CharacterManagerAgent` (`Pip`) -> `adapter.createProject` -> `adapter.createScene`.
5. Calls `const previewJson = JSON.parse(await adapter.preview(scene.id))`: asserts `previewJson.ok === true`, `previewJson.errors === 0`, and `fs.existsSync(path.join(previewJson.bundleDir, 'gm-player.js'))` + `index.html`.
6. Calls `const job = await adapter.render(projectId, (ev) => observedProgress.push(ev.progress))` and waits until terminal status (`<= 60s`): asserts `status.status === 'completed'`, `observedProgress.some(p => p > 0 && p < 100)`, `status.progress === 100`.
7. Calls `execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height', '-of', 'json', videoPath])`: asserts `codec_name === 'h264'`, `width === 1280`, `height === 720`, `Number(format.duration) >= 1.5`.

- [ ] **Step 2: Run sandbox `npm test` to confirm clean integration gating, and run `npm run test:integration` in host/unsandboxed environment to confirm real pass**

Run (sandbox): `cd animforge-core && npm test` (confirms unit tests pass & integration test skips cleanly in sandbox).
Run (host / unsandboxed when approved): `cd animforge-core && npm run test:integration`
Expected: PASS — real H.264 1280×720 MP4 rendered and verified by `ffprobe` (record exact duration & output metrics).

- [ ] **Step 3: Commit**

```bash
git add animforge-core/test/givemotion.integration.test.ts
git commit -m "test: add end-to-end GiveMotion Chrome+FFmpeg+ffprobe integration test"
```

---

### Task 6: NDJSON Stdio Worker Process (`animforge-core/src/worker.ts`)

**Files:**
- Create: `AnimForgeLab/animforge-core/src/worker.ts`
- Test: `AnimForgeLab/animforge-core/test/worker.test.ts`

**Interfaces:**
- Consumes: `AnimForgeDatabase`, `AnimForgePipeline`, `GivemotionAdapter`, `StoryDirectorAgent`, `CharacterManagerAgent`, `ScenePlannerAgent`, Zod schemas (`ProjectConfigSchema`, `ProjectSchema`).
- Produces:
  - CLI entrypoint `node dist/src/worker.js <workspaceDir>` reading line-delimited JSON requests from `stdin` and writing line-delimited JSON responses/events to `stdout`:
    - Requests:
      - `{ id, method: 'doctor', params: {} }` → `{ id, ok: true, result: DoctorCheckResult }`
      - `{ id, method: 'create_project', params: { config: ProjectConfig } }` → runs planning stages (Storyboard/Character/Scenes), saves to SQLite (`projects/animforge.db`) & `GivemotionAdapter.createProject`/`createScene`, returns `{ id, ok: true, result: { project, projectDir } }`
      - `{ id, method: 'load_project', params: { projectId: string } }` → reads SQLite or `projects/<id>/project.animforge.json`, returns `{ id, ok: true, result: { project } }`
      - `{ id, method: 'save_project', params: { project: Project } }` → Zod-validates, updates SQLite + `project.animforge.json` + recompiles `index.html`, returns `{ id, ok: true, result: { project } }`
      - `{ id, method: 'preview_project', params: { projectId: string, sceneId?: string } }` → resolves `sceneId` from `params.sceneId ?? project.scenes[0]?.id` (via `load_project`), runs `adapter.preview(sceneId)`, returns `{ id, ok: true, result: PreviewResult }`
      - `{ id, method: 'render_project', params: { projectId: string } }` → streams `{ event: 'render_progress', jobId, projectId, phase, progress, eta }` events to `stdout`, waits for completion, updates SQLite, returns `{ id, ok: true, result: { renderJob, videoPath } }`
    - On invalid method, failed Zod parse, or bad `projectId`: returns `{ id, ok: false, error: string }` without crashing worker.
    - On `stdin` `close`/`end` or `SIGTERM`: calls `adapter.dispose()` + `db.close()` and exits `0`.

- [ ] **Step 1: Write failing tests in `animforge-core/test/worker.test.ts`**

Test assertions (spawning real `node dist/src/worker.js <tempWorkspaceWithSpace>` — zero Chrome/network needed):
1. Send malformed JSON and invalid `projectId` (`"../evil"`) -> receives `{ ok: false, error: ... }` and worker stays alive for subsequent commands.
2. Send `create_project` with valid `ProjectConfig` -> receives `{ ok: true, result: { project } }`, verifies `projects/<id>/index.html`, `projects/<id>/project.animforge.json`, and `projects/animforge.db` exist on disk inside temp workspace.
3. Send `load_project` & `save_project` -> verifies updated project name persists in `index.html` and SQLite.
4. Close `stdin` -> worker process exits with code `0` within `2000ms`.

- [ ] **Step 2: Run test to verify failure**

Run: `cd animforge-core && npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `animforge-core/src/worker.ts`**

Use `readline.createInterface({ input: process.stdin, crlfDelay: Infinity })` + Zod request validation; serialize `stdout` writes via JSON lines; wire `SIGINT`/`SIGTERM`/stdin close cleanup (`adapter.dispose()` + `db.close()`). Note: ensure `AnimForgePipeline` / `StoryDirectorAgent` + `create_project` share one clean helper without duplicating scene assembly logic.

- [ ] **Step 4: Run `typecheck` and tests**

Run: `cd animforge-core && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add animforge-core/src/worker.ts animforge-core/test/worker.test.ts
git commit -m "feat: add NDJSON stdio worker bridge for desktop IPC"
```

---

## Wave 2: `animforge-desktop/` (Tauri 2 + Rust + React 18 + TS + Vite)

> **Toolchain Gate:** Before starting Task 7, verify `rustc --version` and `cargo --version` exist (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh` if absent; plus Xcode CLT on macOS or `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` on Linux).

### Task 7: Initialize `animforge-desktop/` Tauri 2 Shell & Rust `doctor` Health Check

**Files:**
- Create: `AnimForgeLab/animforge-desktop/package.json`
- Create: `AnimForgeLab/animforge-desktop/tsconfig.json`
- Create: `AnimForgeLab/animforge-desktop/vite.config.ts`
- Create: `AnimForgeLab/animforge-desktop/index.html`
- Create: `AnimForgeLab/animforge-desktop/src/main.tsx` & `src/App.tsx` (minimal stub)
- Create: `AnimForgeLab/animforge-desktop/src-tauri/Cargo.toml`
- Create: `AnimForgeLab/animforge-desktop/src-tauri/build.rs`
- Create: `AnimForgeLab/animforge-desktop/src-tauri/tauri.conf.json`
- Create: `AnimForgeLab/animforge-desktop/src-tauri/capabilities/default.json`
- Create: `AnimForgeLab/animforge-desktop/src-tauri/src/doctor.rs`
- Create: `AnimForgeLab/animforge-desktop/src-tauri/src/lib.rs` & `src/main.rs`

**Interfaces:**
- Consumes: `engines/givemotion/src/cli.js doctor` output format (`node`, `chrome`, `ffmpeg`, `encoder` lines).
- Produces:
  - Rust `doctor::DoctorReport { ok: bool, node_version: Option<String>, chrome_summary: Option<String>, ffmpeg_summary: Option<String>, encoder_summary: Option<String>, errors: Vec<String> }` (`#[derive(Serialize, Debug, Clone, PartialEq)]`, `#[serde(rename_all = "camelCase")]`)
  - Pure fn `parse_doctor_output(stdout: &str, stderr: &str, exit_success: bool) -> DoctorReport`
  - Tauri command `#[tauri::command] pub async fn run_doctor(state: tauri::State<'_, AppPaths>) -> Result<DoctorReport, String>`

- [ ] **Step 1: Write failing Rust unit tests in `src-tauri/src/doctor.rs`**

Test cases inside `#[cfg(test)] mod tests`:
1. Given macOS `doctor` stdout (`node v24.19.0`, `chrome /Applications/... 157...`, `ffmpeg 9.0.1 encoders: ...`, `encoder software (x264): VideoToolbox...`) with `exit_success = true` -> returns `ok: true`, populated `node_version`, `chrome_summary`, `ffmpeg_summary`, `encoder_summary`, `errors: []`.
2. Given Linux `chrome-headless-shell` missing (`chrome not found -> ...`) with `exit_success = false` -> returns `ok: false`, `chrome_summary: None`, `errors` non-empty naming Chrome.
3. Given both `node` command launch error -> returns `ok: false` with actionable message.

- [ ] **Step 2: Scaffold minimal Tauri 2 + React 18.3 + Vite 5.4 workspace & run `cargo test` to verify failing test**

Create `package.json` (`react@^18.3.1`, `react-dom@^18.3.1`, `@tauri-apps/api@^2`, `@tauri-apps/plugin-dialog@^2`, devDeps `@tauri-apps/cli@^2`, `vite@^5.4.0`, `@vitejs/plugin-react@^4.3.0`, `typescript@^5.4.5`, `vitest@^2`), install dependencies, create `Cargo.toml` (`tauri = "2"`, `tauri-plugin-dialog = "2"`, `serde`, `serde_json`), stub `doctor.rs` (`todo!()`), and run:
```bash
cd animforge-desktop/src-tauri && cargo test
```
Expected: FAIL (panic / unimplemented).

- [ ] **Step 3: Implement `doctor::parse_doctor_output` and `run_doctor` using `std::process::Command` (no shell)**

Resolve `AnimForgeLab` workspace root cleanly (`ANIMFORGE_WORKSPACE_DIR` override or walking up from exe/current dir to directory containing `engines/givemotion/src/cli.js`), invoke `Command::new("node").arg(&cli_path).arg("doctor")`, handle missing binary or spaces in path safely. Allow `http://127.0.0.1:*` in `tauri.conf.json` `app.security.csp` for `<gm-player>` iframe playback in Task 8/9.

- [ ] **Step 4: Run `cargo test` and Vite `npm run build`**

Run:
```bash
cd animforge-desktop/src-tauri && cargo test
cd .. && npm run build
```
Expected: `cargo test` PASS (3/3), `vite build` PASS.

- [ ] **Step 5: Commit**

```bash
git add animforge-desktop/
git commit -m "feat: scaffold Tauri 2 desktop app with React 18 + Vite and Rust doctor check"
```

---

### Task 8: Rust Node-Worker Supervisor, Render Progress Events & Localhost Preview Server

**Files:**
- Create: `AnimForgeLab/animforge-desktop/src-tauri/src/preview_server.rs`
- Create: `AnimForgeLab/animforge-desktop/src-tauri/src/worker_bridge.rs`
- Modify: `AnimForgeLab/animforge-desktop/src-tauri/Cargo.toml` (add `tokio` / `tiny_http` only if needed, OR pure `std::net::TcpListener` HTTP/1.1 static handler + `tauri::async_runtime` so zero bloat!)
- Modify: `AnimForgeLab/animforge-desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: Node worker stdio JSON-RPC (`animforge-core/dist/src/worker.js` from Task 6), `AppPaths` from Task 7.
- Produces:
  - `preview_server.rs`:
    - `pub fn resolve_safe_asset(projects_root: &Path, request_path: &str) -> Result<PathBuf, u16>`
    - `pub struct PreviewServer` bound to `127.0.0.1:0` serving `GET /<projectId>/<file>` (HTML, JS, CSS, SVG, PNG, JPG, MP4 with simple single-range `Range: bytes=start-end` `206 Partial Content` support for `<video>` scrubbing!) and clean shutdown on `Drop`.
  - `worker_bridge.rs`:
    - `pub struct WorkerBridge` spawning single `node worker.js <workspaceDir>`, reading `stdout` in a background thread, resolving pending oneshot response channels by `id`, emitting `"animforge://render-progress"` Tauri event for `{ event: "render_progress", ... }` lines, and killing the child on `Drop`.
  - Tauri commands in `lib.rs`:
    - `get_preview_base_url() -> String`
    - `project_create_from_prompt(name: String, prompt: String) -> Result<serde_json::Value, String>`
    - `project_load(project_id_or_file: String) -> Result<serde_json::Value, String>` (if given a `.animforge.json` path from the file picker, canonicalizes & verifies it sits at `projects/<id>/project.animforge.json`, extracts `<id>`, and forwards `load_project { projectId }` to the worker)
    - `project_save(project: serde_json::Value) -> Result<serde_json::Value, String>`
    - `project_preview(project_id: String) -> Result<serde_json::Value, String>`
    - `project_render(project_id: String) -> Result<serde_json::Value, String>`

- [ ] **Step 1: Write failing Rust unit tests for `preview_server.rs` and `worker_bridge.rs` framing**

Test assertions in `#[cfg(test)]`:
1. `resolve_safe_asset(projects_root, "/proj_1/bundle/index.html")` resolves inside `projects_root/proj_1/bundle/index.html`.
2. `resolve_safe_asset(projects_root, "/../.env")`, `"/proj_1/%2e%2e/%2e%2e/.env"`, `"/proj_1/symlink_outside"` return `Err(403 | 400)`.
3. Spawn `PreviewServer` on `127.0.0.1:0` pointing at temp dir containing a sample `index.html` + `gm-player.js`, issue raw `TcpStream` `GET /p1/bundle/gm-player.js HTTP/1.1` -> receives `200 OK` with `application/javascript` content-type; `GET /../secret` -> `403`.
4. `worker_bridge::classify_worker_line` distinguishes `{ "event": "render_progress", ... }` event notifications from `{ "id": "...", "ok": true, ... }` RPC replies cleanly.

- [ ] **Step 2: Run `cargo test` to verify failure**

Run: `cd animforge-desktop/src-tauri && cargo test`
Expected: FAIL.

- [ ] **Step 3: Implement `preview_server.rs`, `worker_bridge.rs`, and wire commands + `RunEvent::Exit` cleanup into `lib.rs`**

Keep `preview_server.rs` small and dependency-free using `std::net::TcpListener` + threadpool/spawn-per-request (loopback UI only), strict canonicalization (`fs::canonicalize`), query/fragment stripping, `Content-Type` table (`html`, `js`, `css`, `svg`, `png`, `webp`, `woff2`, `mp4`), and `bytes=` range header support for `.mp4`. Implement `WorkerBridge::drop` and Tauri `RunEvent::Exit` cleanup so closing the app never orphans Node/Chrome processes.

- [ ] **Step 4: Run `cargo test` and `cargo check`**

Run: `cd animforge-desktop/src-tauri && cargo test && cargo check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add animforge-desktop/src-tauri/
git commit -m "feat: add Rust Node worker supervisor, render progress events, and jailed HTTP preview server"
```

---

### Task 9: Unified React 18 Studio UI & Desktop E2E Vertical Slice Verification

**Files:**
- Create: `AnimForgeLab/animforge-desktop/vitest.config.ts`
- Create: `AnimForgeLab/animforge-desktop/src/types.ts`
- Create: `AnimForgeLab/animforge-desktop/src/hooks/useStudio.ts`
- Create: `AnimForgeLab/animforge-desktop/src/components/DoctorBar.tsx`
- Create: `AnimForgeLab/animforge-desktop/src/components/PreviewStage.tsx`
- Modify: `AnimForgeLab/animforge-desktop/src/App.tsx`
- Test: `AnimForgeLab/animforge-desktop/src/hooks/useStudio.test.ts`
- Test: `AnimForgeLab/animforge-desktop/src/components/PreviewStage.test.tsx`

**Interfaces:**
- Consumes: Tauri commands (`run_doctor`, `get_preview_base_url`, `project_create_from_prompt`, `project_load`, `project_save`, `project_preview`, `project_render`), `@tauri-apps/plugin-dialog` (`open`), Tauri event `"animforge://render-progress"`.
- Produces:
  - Minimal unified single-window GUI with:
    - `DoctorBar`: Node/Chrome/FFmpeg/Encoder badges + re-check button.
    - Project Controls: Create from Name + Prompt, Open `project.animforge.json`, Save Project JSON, editable scene title/duration inputs.
    - Pipeline Actions: **Preview QA** button (shows `check --json` error/warning badge + loads `<gm-player src="${baseUrl}/${project.id}/bundle/index.html" controls>` via injected `gm-player.js` script from `${baseUrl}/${project.id}/bundle/gm-player.js`) and **Render MP4** button + live progress bar (`phase` + `%` + ETA) + `<video controls>` toggle on completion.

- [ ] **Step 1: Write failing UI/hook tests (`src/hooks/useStudio.test.ts` + `src/components/PreviewStage.test.tsx`)**

Test assertions (Vitest + mocked `@tauri-apps/api/core` `invoke` & `@tauri-apps/api/event` `listen` — runs purely headless with `npm test`):
1. `useStudio` loads `doctor` report & `previewBaseUrl` on mount; calling `createProject(name, prompt)` updates active `project` and triggers `preview` so `bundleUrl` becomes `${baseUrl}/${id}/bundle/index.html`.
2. Incoming `"animforge://render-progress"` event `{ phase: 'frames', progress: 55 }` updates `renderState.progress === 55` and `phase === 'frames'`; `project_render` completion sets `videoUrl` to `${baseUrl}/${id}/output.mp4`.
3. `PreviewStage` renders `<gm-player>` custom element when `bundleUrl` is present (and QA issue list when `previewResult.errors > 0`).

- [ ] **Step 2: Run `npm test` in `animforge-desktop/` to verify failure**

Run: `cd animforge-desktop && npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `types.ts`, `useStudio.ts`, `DoctorBar.tsx`, `PreviewStage.tsx`, and `App.tsx`**

Keep layout clean & YAGNI (no extra timeline scrubber widgets beyond `<gm-player>` controls, no Rig/Remotion/MCP panels in Milestone 1). Declare JSX IntrinsicElements for `'gm-player'` in `src/types.ts` cleanly. Dynamically inject `<script src="${bundleBase}/gm-player.js">` once before mounting `<gm-player>`.

- [ ] **Step 4: Run automated checks + Desktop Smoke Verification**

1. Unit/UI tests + TS + Vite build:
   ```bash
   cd animforge-desktop && npx tsc --noEmit && npm test && npm run build
   ```
   Expected: PASS.
2. Rust build & tests:
   ```bash
   cd animforge-desktop/src-tauri && cargo test && cargo build
   ```
   Expected: PASS.
3. Unsandboxed macOS Desktop Vertical Slice Check (`npm run tauri dev` or debug binary + Linux CI check):
   - Launch app -> verify `DoctorBar` reports Node/Chrome/FFmpeg green.
   - Create project from prompt -> click **Preview QA** -> verify `0 errors` and interactive `<gm-player>` plays frames cleanly in WebView.
   - Click **Render MP4** -> verify live progress bar `0% -> 100%` -> verify `projects/<id>/output.mp4` exists, `ffprobe` confirms H.264 MP4, and `<video>` / `<gm-player>` plays inside GUI.

- [ ] **Step 5: Final Milestone Commit**

```bash
git add animforge-desktop/
git commit -m "feat: add unified React 18 Studio UI with doctor status, render progress, and gm-player stage"
```
