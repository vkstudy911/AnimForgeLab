# AnimForge AI — Setup and Operation Guide

## 1. Prerequisites

Before running the engines or the AnimForge pipeline, verify your local host environment:
- **Operating System:** macOS (Apple Silicon arm64 recommended).
- **Node.js:** `v20.0.0` or higher (tested with `v24.19.0`).
- **npm:** `v10.0.0` or higher (tested with `11.17.0`).
- **FFmpeg:** Installed on your PATH with `libx264` and `videotoolbox` support (`brew install ffmpeg`).
- **Google Chrome:** Installed in standard macOS location (`/Applications/Google Chrome.app`).

---

## 2. Independent Engine Operation

All three engines are isolated inside `AnimForgeLab/engines/`.

### Engine A: Givemotion
- **Location:** `AnimForgeLab/engines/givemotion`
- **Zero-Dependency Check:**
  ```bash
  node engines/givemotion/src/cli.js doctor
  ```
- **Automated Scene Linting (QA):**
  ```bash
  node engines/givemotion/src/cli.js check projects/demo-animation/index.html
  ```
- **Render Video to MP4:**
  ```bash
  node engines/givemotion/src/cli.js render projects/demo-animation/index.html -o projects/demo-animation/out.mp4
  ```
- **Keyframe Contact Sheet Snapshot:**
  ```bash
  node engines/givemotion/src/cli.js snapshot projects/demo-animation/index.html
  ```

---

### Engine B: Remotion
- **Location:** `AnimForgeLab/projects/remotion-test`
- **Installation:**
  ```bash
  cd projects/remotion-test
  npm install
  ```
- **Interactive Studio Preview:**
  ```bash
  cd projects/remotion-test
  npm run start
  ```
- **Render Composition to MP4:**
  ```bash
  cd projects/remotion-test
  npm run build
  ```

---

### Engine C: Stretchy Studio
- **Location:** `AnimForgeLab/engines/stretchystudio`
- **Installation:**
  ```bash
  cd engines/stretchystudio
  npm install
  ```
- **Launch Interactive WebGL Rigging Editor:**
  ```bash
  cd engines/stretchystudio
  npm run dev
  ```
  Open `http://localhost:5173` in your browser.
- **Production Build:**
  ```bash
  cd engines/stretchystudio
  npm run build
  ```

---

## 3. AnimForge Core

The core orchestration engine is located in `AnimForgeLab/animforge-core`.

### Installation & Build
```bash
cd animforge-core
npm install
npm run build
```

### Running Test Suite
```bash
cd animforge-core
npm test
```
The test suite validates:
- Project configuration parsing (Zod).
- Storyboard beat generation from natural language prompts.
- Character layer decomposition and pivot setup.
- Scene sequence generation and camera choreography.
- SQLite persistence using Node.js built-in `node:sqlite`.

---

## 4. Viewing the Demo Animation

The animated demo (`Pip's Glowing Door Adventure`) has been pre-rendered and verified:
- **HTML Source:** `AnimForgeLab/projects/demo-animation/index.html`
- **Rendered MP4:** `AnimForgeLab/projects/demo-animation/demo-pip-adventure.mp4`
- **Keyframe Contact Sheet:** `AnimForgeLab/projects/demo-animation/snapshots/sheet.png`

To play the video on macOS:
```bash
open AnimForgeLab/projects/demo-animation/demo-pip-adventure.mp4
```
