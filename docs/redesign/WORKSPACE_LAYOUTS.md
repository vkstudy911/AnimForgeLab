# AnimForge Studio — Workspace Layouts & Wireframes

Every workspace fits cleanly inside Tauri's **`960x640` minimum** and **`1280x820` default** windows without horizontal scrolling or obscured primary controls.

- **Breakpoints:**
  - `>= 1360px` (**Wide Studio**): Left Rail `208px` + Main Stage `1fr` + Right Inspector `288px` open simultaneously.
  - `1100px – 1359px` (**Default `1280x820`**): Left Rail `208px` (or `52px` when user collapses) + Main Stage `1fr` + Right Inspector `272px`.
  - `960px – 1099px` (**Compact Minimum**): Left Rail auto-collapses to `52px` icon strip; Right Inspector behaves as a collapsible `272px` dock drawer (toggled via `]` or selecting an item with inspector toggle) so Stage Viewport never shrinks below `560px` wide.

---

## 1. Home & Management Workspaces

### 1.1 Workspace 1: `Home Dashboard` (`home`)
**Goal:** Fast creative launch + project resume + instant health glance.

```
+---------------------------------------------------------------------------------+
| HERO PROMPT LAUNCHER CARD                                                       |
|  "Start a new cartoon animation"                                                |
|  [ Project Name * _____________ ]  [ Preset: 1280x720 30fps v ] [Engine: GM v]  |
|  [ Animation Prompt * (describe characters, action, setting)...               ] |
|                                                (o Create & Edit)  (Review Plan) |
+---------------------------------------+-----------------------------------------+
| RECENT PROJECTS (up to 6 cards)       | STUDIO SNAPSHOT                         |
|  +---------------+ +---------------+  |  [Environment] 8/8 Checks Passing ->    |
|  | Comet Chase   | | Lunar Bounce  |  |  [Active Render] None idle (or % bar)   |
|  | 1280x720 ·30f | | 1080x1920·24f |  |  [OpenCode MCP] Stdio server available  |
|  | scenes_planned| | rendered      |  |  [Shortcuts] Space Play · Cmd+K Jump    |
|  | [Open]        | | [Open]        |  |                                         |
|  +---------------+ +---------------+  |  QUICK TIPS                             |
|  "View all projects ->"               |  1. Prompt creates scenes & timeline    |
|                                       |  2. Edit cues in Animation Editor       |
+---------------------------------------+-----------------------------------------+
```

- **Backend Parity:** Uses existing `project_list`, `project_create_from_prompt` (upgraded to send optional `width`, `height`, `fps`, `preferredEngine` supported natively by `ProjectConfigSchema`), `project_load`, and `run_doctor`.

---

### 1.2 Workspace 2: `Project Manager` (`projects`)
**Goal:** Manage workspace projects (`projects/animforge.db` + disk manifests).

```
+---------------------------------------------------------------------------------+
| PROJECTS TOOLBAR                                                                |
|  [ Search projects... ]  Status: [All v]  Sort: [Updated v]    [ + New Project ]|
+---------------------------------------------------------------------------------+
| PROJECT TABLE / CARD GRID (responsive toggle)                                   |
|  Name            | Engine     | Format        | Status         | Updated  | Act |
|  ----------------+------------+---------------+----------------+----------+-----|
|  Comet Chase     | givemotion | 1280x720 @30  | scenes_planned | 2m ago   |[Open]|
|  Rocket Rabbit   | givemotion | 1920x1080 @24 | rendered       | 2d ago   |[Open]|
|                                                                                 |
| INSPECTOR (Right Zone 4 when project row highlighted):                          |
|  - Full Prompt text                                                             |
|  - Scenes count, Characters count, Assets count                                 |
|  - Workspace path / Project ID                                                  |
|  - [Open in Animation Editor]  [Export Project JSON (Track A download)]         |
|  - [Delete Project] *(Disabled/badged Track B until worker delete RPC added)*   |
+---------------------------------------------------------------------------------+
```

---

## 2. Creative Workspaces

### 2.1 Workspace 3: `Storyboard` (`storyboard`)
**Goal:** Edit narrative beats before or alongside detailed animation timing.

```
+-------------------------------------------------------+-------------------------+
| STORYBOARD HEADER (Project Logline & Art Style)       | BEAT INSPECTOR (Zone 4) |
|  Logline: [ A squirrel chases a glowing comet...    ] |  Beat #1 (Launchpad)    |
|  Art Style: [ 2D cartoon flat-vector                ] |  Scene Title: [_______] |
|  Total Duration: 12.0s · [ + Add Beat ] [ Save Draft ]|  Visual Summary:        |
+-------------------------------------------------------+  [____________________] |
| BEAT CARDS FLOW GRID (CSS Grid auto-fill minmax(260px))| Character Interactions: |
|  +--------------------+  +--------------------+       |  [____________________] |
|  | #1 · Launchpad  4s |  | #2 · Orbit Leap 5s |       |  Camera Notes:          |
|  | [Visual summary..] |  | [Visual summary..] |       |  [____________________] |
|  | Cam: Pan up        |  | Cam: Dolly zoom    |       |  Sound Notes:           |
|  | [Open in Editor ->]|  | [Open in Editor ->]|       |  [____________________] |
|  +--------------------+  +--------------------+       |  Target Dur (s): [ 4.0 ]|
|                                                       |  [Apply] [Regenerate AI*|
+-------------------------------------------------------+-------------------------+
```

- **Track A Persistence:** `storyboard` field inside `ProjectSchema` is already persisted by `project_save`! Notice if an older project has `storyboard === undefined`, UI offers **"Generate Initial Storyboard from Existing Scenes"** cleanly in-memory and persists on `project_save`.
- **Track B Placeholder:** *"Regenerate Storyboard with AI StoryDirector"* button explicitly labeled **Track B (Pending Worker RPC)** rather than faked.

---

### 2.2 Workspace 4: `Character Studio` (`characters`)
**Goal:** Inspect & edit character cast, palettes, and hierarchical rig parts (`CharacterSchema`).

```
+------------------------+------------------------------+-------------------------+
| CHARACTER ROSTER       | RIG & PALETTE CANVAS         | PART / RIG INSPECTOR    |
|  [ + Add Character ]   |  Selected: Pip the Squirrel  |  Part: Right Arm        |
|  > Pip the Squirrel    |  SVG/Canvas Hierarchy Preview|  Layer Name: [r_arm   ] |
|    - Head (z:3)        |    (Shows parts + pivot dots |  Parent: [torso       v]|
|    - Torso (z:2)       |     from character.parts[])  |  Pivot X: [120] Y: [84] |
|    - Tail (z:1)        |                              |  Z-Index: [4]           |
|    - Right Arm (z:4)   |  Color Palette Swatches:     |                         |
|  > Comet Spirit        |  [#f59e0b] [#e5e7eb] [+ Add] |  Default Rig ID:        |
|                        |                              |  [givemotion_biped_v1 ] |
|                        |  [Open StretchyStudio* (T-B)]|  [Jump to Actions ->]   |
+------------------------+------------------------------+-------------------------+
```

- **Track A:** Full CRUD on `project.characters[]`, `parts[]` (`layerName`, `pivot`, `zIndex`, `parentPartId`), `colorPalette[]`, saved via `project_save`. Interactive SVG schematic visualizes pivot points and z-order natively with zero external libs.
- **Track B:** Embedded/bridged **StretchyStudio** `.stretch` skeletal rig editor & PSD/mesh auto-rigging (`engines/stretchystudio`).

---

### 2.3 Workspace 5: `Asset Library` (`assets`)
**Goal:** Manage `project.assets[]` metadata and assign backgrounds/audio to scenes.

```
+-------------------------------------------------------+-------------------------+
| ASSET FILTERS & SOURCE TABS (role="tablist")          | ASSET INSPECTOR         |
|  [Project Assets (Track A)] [Workspace Library (T-B*)]|  Name: Forest Sky BG    |
|  Filter: [All] [Background] [Character] [Prop] [Audio]|  Type: [background   v] |
|  Search: [__________________]   [Register Metadata]   |  URI:  assets/sky.svg   |
+-------------------------------------------------------+  MIME: image/svg+xml    |
| ASSET CARDS GRID                                      |  Preview: (PreviewServer|
|  +--------------+ +--------------+ +--------------+   |   img/audio if URI safe)|
|  | [SVG Thumb]  | | [Audio Wave] | | [Prop Card]  |   |                         |
|  | Forest Sky   | | Whoosh SFX   | | Comet Trail  |   |  ASSIGN TO ACTIVE SCENE:|
|  | background   | | audio        | | prop         |   |  [Set as Scene BG]      |
|  +--------------+ +--------------+ +--------------+   |  [Add to Audio Track]   |
+-------------------------------------------------------+-------------------------+
```

- **Track A:** Inspect/register/edit `project.assets[]` and assign `scene.backgroundAssetId` or `scene.timeline.audioTracks[]` (`project_save`). Safe asset URIs under `assets/...` or `projects/<id>/...` already load over `PreviewServer` (`previewBaseUrl`).
- **Track B:** Native file picker upload (`asset_import` worker RPC) and workspace `assets/` directory scanner (`assets_list` worker RPC — logic already exists in `mcp/tools.ts`, ready to mirror into `worker.ts`).

---

### 2.4 Workspace 6: `Animation Editor` (`editor`) — **PRIMARY CREATIVE SUITE**
**Goal:** Unified Blender / After Effects / DaVinci Resolve workbench combining **Scene Outliner**, **Stage Canvas**, **Multi-Track Timeline**, and **Contextual Inspector**.

```
+------------------+--------------------------------------------+-----------------+
| SCENE & LAYER    | STAGE CANVAS TOOLBAR                       | CONTEXT         |
| OUTLINER (196px) | [Scene 1: Launchpad v] [Interactive | MP4] | INSPECTOR       |
| (Collapsible)    | [Zoom: Fit v] [Safe-Zones] [Preview] [Render| (272px)         |
|                  +--------------------------------------------+                 |
| SCENES           |                                            | Selected:       |
|  1. Launchpad  * |       +----------------------------+       |  Scene 1 /      |
|  2. Orbit Leap   |       |    <gm-player> / <video>   |       |  Walk Action /  |
|  3. Landing      |       |     16:9 Stage Canvas      |       |  Camera Move    |
|  [+ Add Scene]   |       |  with subtle checkerboard/ |       |                 |
|                  |       |   charcoal matte surround  |       | Title: [______] |
| SCENE LAYERS     |       +----------------------------+       | Duration: [2.0] |
|  v Background    |                                            | Transition:     |
|    Forest Sky    | TRANSPORT: [|<] [>] [>|]  00:01.12 / 00:04 |  [fade v] [0.4] |
|  v Characters    +--------------------------------------------+                 |
|    [x] Pip       | QA / SCRIPT DRAWER (Collapsible accordion) | ACTION FIELDS   |
|  v Camera        |  GiveMotion QA: PASS (0 err · 1 warn)      |  Name: [walk v] |
|    Pan Right     +--------------------------------------------+  Start: [0.5s]  |
+------------------+--------------------------------------------+  Dur:   [1.2s]  |
| MULTI-TRACK TIMELINE DOCK (Bottom, 210px default, resizable)  |  Easing:[ease..] |
|  Time Ruler: 0s        1s        2s        3s        4s       |  [+ Add Action] |
|  Tracks:                                                      |  [Save Project] |
|  [Scenes    ] |=== 1. Launchpad (2.0s) ===|== 2. Orbit ==|    |                 |
|  [Pip       ] |   [<> idle]   [==== walk ====]           |    |                 |
|  [Camera    ] |   [--------- pan (ease-in-out) --------] |    |                 |
|  [Audio     ] |   [~~~~ whoosh.wav (vol 0.8) ~~~~]       |    |                 |
|               ^ Playhead (red/amber hairline scrubber)        |                 |
+---------------------------------------------------------------+-----------------+
```

- **Compact `960x640` Behavior:** Left Scene Outliner toggles with a slim pill (`Scenes ▾`), Right Inspector slides cleanly over or docks narrow (`248px`), and Bottom Timeline collapses down to a `40px` Transport Strip when focusing purely on Stage playback.
- **Stage Integrity:** Preserves exact `PreviewStage.tsx` behavior (`defaultLoadPlayerScript` single-flight cache, `<gm-player src={bundleUrl}>`, `<video src={videoUrl}>`, live render progress bar with Frame/FPS/ETA & Cancel button, Accessible Scene Description `<details>`, and GiveMotion QA issues list).
- **Timeline Data Binding (100% Track A):** Reads and mutates `activeProject.scenes[]` (`title`, `description`, `duration`, `transition`, `timeline.characterActions[]`, `timeline.cameraMoves[]`, `timeline.audioTracks[]`) and saves via `project_save` + recompiles bundle via `project_preview`.

---

## 3. Production & System Workspaces

### 3.1 Workspace 7: `Render Queue` (`render-queue`)
**Goal:** Dedicated render monitoring, quality/output verification, and future batch queue.

```
+-------------------------------------------------------+-------------------------+
| ACTIVE RENDER JOB CARD                                | OUTPUT INSPECTOR        |
|  Project: Comet Chase · Engine: givemotion (--workers 1)| Codec: H.264 / MP4    |
|  Phase: encoding · Progress: [||||||||--] 78%         | Path: projects/.../output|
|  Frames: 47 / 60 · 14.2 fps · ETA: 1.1s  [Cancel]     | Video Player Quick Link |
+-------------------------------------------------------+-------------------------+
| RENDER HISTORY & ENGINE PRESETS                                                 |
|  [Track A] Current session completed job + output.mp4 quick playback            |
|  [Track B*] SQLite render_jobs history list, ffprobe stream stats, Remotion CLI |
+---------------------------------------------------------------------------------+
```

### 3.2 Workspace 8: `Agent Center` (`agents`)
**Goal:** Transparency into AnimForge's AI planning pipeline and OpenCode MCP server.

```
+-------------------------------------------------------+-------------------------+
| PIPELINE & MCP INTEGRATION OVERVIEW                   | MCP SETUP CARD          |
|  Active Project Artifacts:                            |  Server: animforge-mcp  |
|  - StoryDirectorAgent plan -> Storyboard beats (3)    |  Transport: stdio JSON  |
|  - CharacterManagerAgent -> Characters (2)            |  Tools: 16 validated    |
|  - ScenePlannerAgent -> Scenes + Keyframes (3)        |  Preview Exposure: OFF  |
+-------------------------------------------------------+-------------------------+
| AGENT WORKFLOWS                                       |                         |
|  [Track A] Inspect raw structured JSON/Markdown of Storyboard & Scene plans     |
|  [Track B*] Trigger AI StoryDirector / ScenePlanner re-run; LLM Provider Keys   |
|  [Track B*] Live MCP tool invocation feed & OpenCode connection heartbeat       |
+-------------------------------------------------------+-------------------------+
```

### 3.3 Workspace 9: `Settings` (`settings`)
**Goal:** Persistent workstation preferences tailored for macOS/Linux and low-spec laptops.

- **Appearance Section:** Theme Mode radio group (**Dark — Charcoal & Amber** [Default], **Light — Warm Paper**, **System — Follow OS**), UI Density (**Comfortable** / **Compact**), Reduced Motion override.
- **Default Composition Presets:** Default Resolution (`1280x720`, `1920x1080`, `1080x1920`, `1080x1080`), Default FPS (`24`, `30`, `60`), Preferred Engine (`givemotion` active; `remotion` / `stretchystudio` labeled preview).
- **Performance Profile:** *Standard Desktop* vs. *Low-Spec Hardware Mode* (disables subtle shadows, throttles timeline scrub preview, keeps single canvas mounted — tuned specifically for 2-core Linux targets).

### 3.4 Workspace 10: `System Diagnostics` (`diagnostics`)
**Goal:** Clean, scannable home for the existing `DoctorBar` + local server health.

- **Top Banner:** Overall health badge (`PASS` / `WARN` / `FAIL`), Workspace Root path verbatim (verifying trailing-space directory resolution), Preview Server Loopback URL (`http://127.0.0.1:<port>`), **Re-check Environment** button.
- **8-Check Diagnostic Grid:** Exact 8 checks from `doctor.rs` (`os`, `rust`, `node`, `ffmpeg`, `givemotion`, `remotion`, `stretchystudio`, `directories`) rendered as high-contrast structured cards with expandable detail logs (`<details>`).
- **Preserved Contract:** Keeps `run_doctor` StrictMode race guard and `Environment Diagnostics` heading so existing tests/users find everything effortlessly.
