qq# AnimForge AI — Human-Language-to-Animated-Video Production System

AnimForge AI turns natural-language story ideas into finished animated MP4 videos using an AI-orchestrated multi-engine pipeline. Rather than rebuilding animation engines from scratch, AnimForge integrates three specialized open-source engines via a decoupled adapter architecture:

1. **Givemotion:** Fast agentic HTML/CSS motion graphics, camera moves, and automated visual QA.
2. **Remotion:** React component-based video production with programmatic SSR and audio waveform sync.
3. **Stretchy Studio:** 2D character layer decomposition, skeletal bone rigging, and organic mesh deformation.

---

## Workspace Structure

```text
AnimForgeLab/
│
├── engines/
│   ├── givemotion/        # Upstream Givemotion repository (MIT)
│   ├── remotion/          # Upstream Remotion monorepo (Custom license)
│   └── stretchystudio/    # Upstream Stretchy Studio repository (MIT)
│
├── animforge-core/        # Orchestration layer (TypeScript + Zod + SQLite)
│   ├── src/               # Pipeline, database, and index exports
│   ├── agents/            # Story Director, Character Manager, Scene Planner
│   ├── schemas/           # Zod schemas for Storyboard, Scene, Character, RenderJob
│   ├── adapters/          # GivemotionAdapter, RemotionAdapter, StretchyStudioAdapter
│   └── test/              # Self-contained pipeline and schema tests
│
├── projects/
│   ├── demo-animation/    # 12s animated demo (Pip's Glowing Door Adventure)
│   ├── givemotion-test/   # Verified Givemotion standalone render
│   └── remotion-test/     # Verified Remotion standalone render
│
├── assets/
│   ├── characters/
│   ├── backgrounds/
│   ├── props/
│   ├── audio/
│   └── references/
│
├── documentation/
│   ├── repository-analysis.md # Detailed engine audit, licenses & capabilities
│   ├── architecture.md        # System architecture, data flow & adapter contracts
│   ├── integration-plan.md    # Future Model Context Protocol (MCP) server spec
│   └── setup-guide.md         # Engine-by-engine setup & execution guide
│
├── dev.sh                 # Master one-step verification script
└── README.md
```

---

## Quick Start

### 1. Run Master Verification Script
```bash
./AnimForgeLab/dev.sh
```

### 2. Run AnimForge Core Tests
```bash
cd AnimForgeLab/animforge-core
npm test
```

### 3. Play the Rendered Demo Animation
```bash
open AnimForgeLab/projects/demo-animation/demo-pip-adventure.mp4
```

---

## Verification & Test Results

Each engine was independently tested and verified on macOS (Apple Silicon arm64, 16 GB RAM):

| Engine | Verification Action | Result | Output File |
| :--- | :--- | :--- | :--- |
| **Givemotion** | Lint check + 3.5s render | ✅ 105 frames @ 18 fps | `projects/givemotion-test/out.mp4` |
| **Remotion** | React bundle + 3.0s render | ✅ 90 frames in 1.7s | `projects/remotion-test/out.mp4` |
| **Stretchy Studio**| Vite build + Dev server | ✅ Build passed, HTTP 200 OK | `engines/stretchystudio/dist/` |
| **AnimForge Core** | 5 unit & integration tests | ✅ Passed in 86ms | In-memory SQLite + Zod |
| **Demo Project** | 12.0s multi-scene animation | ✅ 360 frames @ 26.8 fps | `projects/demo-animation/demo-pip-adventure.mp4` |

---

## The Demo Story

> *"A cute green cartoon character enters a room, looks around, waves at the camera, smiles, and walks toward a glowing door."*

- **Character:** "Pip", an emerald-green cartoon alien with layered body parts (head, antenna, torso, legs with hip pivots, arms with shoulder pivots, blinking glossy eyes, rosy cheeks, and smile shape).
- **Scene 1 (4s):** Pip enters the room with a bobbing stride, pauses at center, and looks around curiously while blinking.
- **Scene 2 (4s):** Camera pushes in 1.15x. Pip looks directly at the camera, smiles broadly, and waves his right hand back and forth.
- **Scene 3 (4s):** A mystical glowing portal archway illuminates at the back wall with pulsing rays. Pip turns and walks toward the light, bathing in the glow before disappearing into the doorway.
- **Render Output:** H.264 1280x720 30fps MP4 (`projects/demo-animation/demo-pip-adventure.mp4`, 1.1 MB).
- **Frame Inspection:** Contact sheet generated at `projects/demo-animation/snapshots/sheet.png`.

---

## Documentation Links

- [Repository & License Analysis](documentation/repository-analysis.md)
- [System Architecture](documentation/architecture.md)
- [Future MCP Integration Plan](documentation/integration-plan.md)
- [Setup & Operation Guide](documentation/setup-guide.md)
