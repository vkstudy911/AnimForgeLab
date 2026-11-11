# AnimForge AI — Architectural Specification

## 1. System Vision

**AnimForge AI** is an AI-orchestrated, human-language-to-animated-video production system. It allows non-technical creators and AI agents to transform natural-language creative prompts into broadcast-quality 2D animated videos without requiring manual frame-by-frame animation or complex CGI modeling.

Rather than reinventing rendering engines from scratch, AnimForge operates on an **Engine-Agnostic Adapter Pattern**, harnessing the best capabilities of established open-source technologies:
- **Givemotion:** High-speed agentic HTML/CSS motion graphics, camera moves, and automatic visual QA.
- **Remotion:** Component-driven React programmatic video rendering and complex multi-track audio/visual sync.
- **Stretchy Studio:** 2D character layer decomposition, skeletal bone rigging, and organic mesh deformation.

---

## 2. High-Level Architecture

```
                       ┌────────────────────────────────────────────────────────┐
                       │                   Human Creative Idea                  │
                       │           (Natural Language Story Prompt)              │
                       └───────────────────────────┬────────────────────────────┘
                                                   │
                                                   ▼
                       ┌────────────────────────────────────────────────────────┐
                       │                  AnimForge Core Pipeline               │
                       │                                                        │
                       │  ┌──────────────────┐        ┌──────────────────────┐  │
                       │  │ AI Story Director│───────►│ Storyboard Generator │  │
                       │  └──────────────────┘        └──────────┬───────────┘  │
                       │                                         │              │
                       │  ┌──────────────────┐        ┌──────────▼───────────┐  │
                       │  │ Character/Assets │◄───────┤    Scene Planner     │  │
                       │  └────────┬─────────┘        └──────────┬───────────┘  │
                       │           │                             │              │
                       │  ┌────────▼─────────┐        ┌──────────▼───────────┐  │
                       │  │ Animation Engine │───────►│ Camera/Motion Director│  │
                       │  └──────────────────┘        └──────────┬───────────┘  │
                       │                                         │              │
                       │  ┌──────────────────┐        ┌──────────▼───────────┐  │
                       │  │ SQLite Meta Store│        │ Visual Quality QA    │  │
                       │  └──────────────────┘        └──────────┬───────────┘  │
                       └───────────────────────────┬────────────────────────────┘
                                                   │
                         ┌─────────────────────────┴─────────────────────────┐
                         ▼                                                   ▼
         ┌───────────────────────────────┐                   ┌───────────────────────────────┐
         │     Givemotion Adapter        │                   │       Remotion Adapter        │
         ├───────────────────────────────┤                   ├───────────────────────────────┤
         │ • Fast agentic HTML/CSS       │                   │ • React component trees       │
         │ • Deterministic virtual clock │                   │ • Multi-layer React comp      │
         │ • Headless Chrome capture     │                   │ • SSR Puppeteer render        │
         │ • FFmpeg VideoToolbox MP4     │                   │ • High-complexity VFX         │
         └───────────────┬───────────────┘                   └───────────────┬───────────────┘
                         │                                                   │
                         └─────────────────────────┬─────────────────────────┘
                                                   │
                                                   ▼
                                     ┌───────────────────────────┐
                                     │      Final MP4 Video      │
                                     └───────────────────────────┘
```

---

## 3. Core Subsystems

### A. AnimForge Core (`animforge-core`)
- **Technology:** TypeScript, Node.js (>=20), Zod for schema validation, `node:sqlite` for persistent metadata.
- **Isolation Principle:** AnimForge Core does not import or couple to the internal source tree of any single engine. All communication is routed through the standard `AnimationEngineAdapter` contract.
- **Data Persistence:**
  - `projects` table: JSON serialization of project configurations, characters, and scenes.
  - `render_jobs` table: status tracking, progress metrics, and output paths.

### B. Adapter Layer (`animforge-core/adapters`)
Each adapter implements the unified interface:
```ts
export interface AnimationEngineAdapter {
  readonly name: string;
  initialize(): Promise<void>;
  createProject(config: ProjectConfig): Promise<string>;
  createScene(config: SceneConfig): Promise<string>;
  preview(sceneId: string): Promise<string>;
  render(projectId: string): Promise<RenderJob>;
  getRenderStatus(jobId: string): Promise<RenderStatus>;
  exportVideo(jobId: string): Promise<string>;
}
```

- **GivemotionAdapter:** Generates standalone semantic HTML5 compositions. Leverages `givemotion check` for automated heuristic linting (cutting off, low contrast, overlapping elements) and uses hardware-accelerated FFmpeg for rendering.
- **RemotionAdapter:** Compiles React compositions via `@remotion/bundler` and renders frames with `@remotion/renderer`.
- **StretchyStudioAdapter:** Bridges character rigging data. Translates layer hierarchies, bone armatures, and mesh deformations into Spine 2D JSON or spritesheet sequences.

---

## 4. Pipeline Stages & Data Contracts

All data transferred between agents and stages is strictly typed using Zod schemas:

| Stage | Input Schema | Output Schema | Purpose |
| :--- | :--- | :--- | :--- |
| **Story Director** | `ProjectConfig` | `Storyboard` | Converts prompt into visual beats and target pacing |
| **Character Manager**| `Storyboard` | `Character` | Decomposes character layers (head, torso, limbs, eyes, pivots) |
| **Scene Planner** | `Storyboard`, `Character` | `Scene[]` | Creates sequential scenes with camera moves and transitions |
| **Motion Director** | `Scene` | `AnimationTimeline` | Attaches keyframe actions (walk, wave, smile, blink) |
| **Quality Checker** | `Scene[]` | Visual QA Report | Validates readability, framing, and contrast |
| **Render Engine** | `Project` | `RenderJob` | Compiles frames and encodes MP4 video |

---

## 5. Security & Isolation Guidelines

1. **No Arbitrary Shell Execution:** AI agents are never given raw shell execution capabilities. They operate exclusively through validated, schema-constrained adapter functions or MCP tool calls.
2. **Path Sanitization:** File operations are restricted to the designated project directory (`AnimForgeLab/projects/`). Path traversal (e.g. `../../`) is rejected by schema parsers.
3. **Resource Throttling:** Concurrency limits on headless browsers prevent memory exhaustion on local developer machines.
