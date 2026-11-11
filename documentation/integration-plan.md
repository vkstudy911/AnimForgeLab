# AnimForge AI — Future MCP Server Integration Plan

## 1. Overview

This document specifies the Model Context Protocol (MCP) interface that will allow external AI agents (such as Google Antigravity, OpenCode, and Hermes) to interact with AnimForge through safe, structured, and auditable tool calls.

Rather than exposing arbitrary shell execution or file access, the AnimForge MCP Server exposes high-level domain tools governed by strict Zod schemas and workspace path sandboxing.

---

## 2. Documented MCP Tool Contract

### 1. `animforge.create_project`
- **Description:** Initialize a new AnimForge animation project with target dimensions and frame rate.
- **Input Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "prompt": { "type": "string" },
      "width": { "type": "integer", "default": 1280 },
      "height": { "type": "integer", "default": 720 },
      "fps": { "type": "integer", "default": 30 },
      "preferredEngine": { "type": "string", "enum": ["givemotion", "remotion", "stretchystudio", "composite"], "default": "givemotion" }
    },
    "required": ["name", "prompt"]
  }
  ```
- **Returns:** `{ "projectId": "string", "projectPath": "string" }`

### 2. `animforge.import_assets`
- **Description:** Register or import an asset (character artwork, PSD layer decomposition, background, or audio file) into the project.
- **Input Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "projectId": { "type": "string" },
      "name": { "type": "string" },
      "assetType": { "type": "string", "enum": ["character", "background", "prop", "audio", "font"] },
      "sourcePath": { "type": "string" }
    },
    "required": ["projectId", "name", "assetType", "sourcePath"]
  }
  ```
- **Returns:** `{ "assetId": "string", "uri": "string" }`

### 3. `animforge.create_storyboard`
- **Description:** Generates structured narrative beats, target durations, and visual summaries from the story prompt.
- **Input Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "projectId": { "type": "string" },
      "storyPrompt": { "type": "string" },
      "targetTotalDuration": { "type": "number" }
    },
    "required": ["projectId", "storyPrompt"]
  }
  ```
- **Returns:** `Storyboard` object with beats and camera notes.

### 4. `animforge.create_character`
- **Description:** Define a character, color palette, and body part layer decomposition.
- **Input Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "projectId": { "type": "string" },
      "characterName": { "type": "string" },
      "description": { "type": "string" },
      "parts": { "type": "array", "items": { "type": "object" } }
    },
    "required": ["projectId", "characterName"]
  }
  ```
- **Returns:** `{ "characterId": "string", "partsCount": "integer" }`

### 5. `animforge.rig_character`
- **Description:** Define skeletal bone hierarchy, pivot origins, and deformation mesh bindings for a character.
- **Input Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "characterId": { "type": "string" },
      "bones": { "type": "array", "items": { "type": "object" } },
      "pivots": { "type": "object" }
    },
    "required": ["characterId", "bones"]
  }
  ```
- **Returns:** `{ "rigId": "string", "status": "rigged" }`

### 6. `animforge.create_scene`
- **Description:** Create a scene slot with sequence position, background, and duration.
- **Input Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "projectId": { "type": "string" },
      "title": { "type": "string" },
      "duration": { "type": "number" },
      "sequenceIndex": { "type": "integer" }
    },
    "required": ["projectId", "title", "duration", "sequenceIndex"]
  }
  ```
- **Returns:** `{ "sceneId": "string" }`

### 7. `animforge.generate_animation`
- **Description:** Attach character animation actions (walk, wave, smile, blink, look around) to a scene timeline.
- **Input Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "sceneId": { "type": "string" },
      "characterId": { "type": "string" },
      "actionName": { "type": "string" },
      "startTime": { "type": "number" },
      "duration": { "type": "number" },
      "parameters": { "type": "object" }
    },
    "required": ["sceneId", "characterId", "actionName", "startTime", "duration"]
  }
  ```
- **Returns:** `{ "actionId": "string", "status": "attached" }`

### 8. `animforge.add_camera_motion`
- **Description:** Configure dynamic camera choreography (push, zoom, pan, shake) for a scene.
- **Input Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "sceneId": { "type": "string" },
      "type": { "type": "string", "enum": ["push", "pull", "zoom", "pan", "shake", "static"] },
      "zoomLevel": { "type": "number" },
      "duration": { "type": "number" },
      "easing": { "type": "string" }
    },
    "required": ["sceneId", "type", "duration"]
  }
  ```
- **Returns:** `{ "cameraMoveId": "string" }`

### 9. `animforge.preview_scene`
- **Description:** Run visual QA checks and launch a fast local preview server or generate frame stills.
- **Input Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "sceneId": { "type": "string" }
    },
    "required": ["sceneId"]
  }
  ```
- **Returns:** `{ "previewUrl": "string", "qaPassed": "boolean", "issues": "array" }`

### 10. `animforge.inspect_frames`
- **Description:** Generate contact sheet thumbnails of key timeline beats for automated visual inspection by AI.
- **Input Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "projectId": { "type": "string" },
      "timestamps": { "type": "array", "items": { "type": "number" } }
    },
    "required": ["projectId"]
  }
  ```
- **Returns:** `{ "contactSheetPath": "string", "framePaths": "array" }`

### 11. `animforge.render_video`
- **Description:** Queue and start final MP4 video rendering.
- **Input Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "projectId": { "type": "string" },
      "quality": { "type": "string", "enum": ["draft", "standard", "high"], "default": "standard" }
    },
    "required": ["projectId"]
  }
  ```
- **Returns:** `{ "jobId": "string", "status": "rendering" }`

### 12. `animforge.check_render_status`
- **Description:** Check progress of an active render job.
- **Input Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "jobId": { "type": "string" }
    },
    "required": ["jobId"]
  }
  ```
- **Returns:** `{ "jobId": "string", "status": "queued|rendering|completed|failed", "progress": "number" }`

### 13. `animforge.export_video`
- **Description:** Retrieve the absolute path of the verified playable MP4 file once rendering is complete.
- **Input Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "jobId": { "type": "string" }
    },
    "required": ["jobId"]
  }
  ```
- **Returns:** `{ "videoPath": "string", "fileSizeBytes": "integer", "durationSeconds": "number" }`

---

## 3. Security and Permission Boundaries

To ensure safe operation when accessed by autonomous AI agents:
1. **Workspace Root Jail:** All paths passed to tool calls are validated to reside strictly within `AnimForgeLab/`. Attempting to access parent directories (`/`, `..`) results in immediate validation failure.
2. **Deterministic Output Guarantees:** Tools produce structured JSON responses rather than raw terminal output, preventing hallucinated parsing errors.
3. **Hardware Protection:** Background renders are throttled to a maximum worker count equal to physical performance cores to prevent freezing the developer machine.
