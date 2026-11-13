# AnimForge Studio — OpenCode MCP Setup Guide

This guide configures **OpenCode** to control **AnimForge Studio** over a local stdio **Model Context Protocol (MCP)** server implemented in `animforge-core/src/mcp/`.

> **Note:** Your existing `~/.config/opencode/opencode.json` was **not modified** automatically by this repository setup. Follow the merge instructions below to enable AnimForge in OpenCode safely.

---

## 1. Prerequisites & Build

Verify Node.js (`>= 20`, verified on `v24.19.0`), Google Chrome, `ffmpeg`, and `ffprobe` are installed, then build `animforge-core`:

```bash
npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core" run build
```

Built stdio entrypoint:

```text
/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core/dist/src/mcp/index.js
```

Note the **trailing space** in `/Users/vipinkumar/Desktop/animator ` — keeping it intact inside the JSON command array (instead of shell-interpolated strings) avoids path splitting or escaping issues.

---

## 2. OpenCode Configuration (`opencode.json`)

OpenCode reads local MCP server definitions from either:
- Global user config: `~/.config/opencode/opencode.json`
- Project-scoped config: `./opencode.json` inside a repository

### Exact `animforge` Server Definition

Add the `"animforge"` entry under `"mcp"."servers"` using absolute paths:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "animforge": {
        "type": "local",
        "command": [
          "/usr/local/bin/node",
          "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core/dist/src/mcp/index.js",
          "/Users/vipinkumar/Desktop/animator /AnimForgeLab"
        ],
        "environment": {
          "ANIMFORGE_WORKSPACE_DIR": "/Users/vipinkumar/Desktop/animator /AnimForgeLab"
        }
      }
    }
  }
}
```

### Safe Merge Into Your Existing `~/.config/opencode/opencode.json`

If you already have servers configured (for example `"blender"` in `~/.config/opencode/opencode.json`), **back up your config first** and merge `"animforge"` into `"mcp"."servers"` rather than replacing the file:

```bash
cp ~/.config/opencode/opencode.json ~/.config/opencode/opencode.json.bak
```

Merged example keeping an existing `"blender"` entry intact:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "blender": {
        "type": "local",
        "command": [
          "/Users/vipinkumar/.local/bin/uvx",
          "mcp-for-blender"
        ],
        "environment": {
          "BLENDER_HOST": "localhost",
          "BLENDER_PORT": "9876"
        }
      },
      "animforge": {
        "type": "local",
        "command": [
          "/usr/local/bin/node",
          "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core/dist/src/mcp/index.js",
          "/Users/vipinkumar/Desktop/animator /AnimForgeLab"
        ],
        "environment": {
          "ANIMFORGE_WORKSPACE_DIR": "/Users/vipinkumar/Desktop/animator /AnimForgeLab"
        }
      }
    }
  }
}
```

Wait-free stdio notes:
- `stdout` carries **only** JSON-RPC frames (`console.log`/`info`/`warn`/`debug` are redirected to `stderr`).
- Workspace resolution order in `index.ts`: `process.argv[2]` -> `ANIMFORGE_WORKSPACE_DIR` -> repository root relative to `dist/src/mcp/index.js`.
- Sending `SIGINT`, `SIGTERM`, or closing `stdin` terminates any active render cleanly and closes the SQLite connection before exiting.

---

## 3. Verifying Startup & Handshake

### Standalone Stdio Smoke Check (No OpenCode CLI Required)

Start the server directly (press `Ctrl+C` or close stdin to exit):

```bash
npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core" run mcp:start -- "/Users/vipinkumar/Desktop/animator /AnimForgeLab"
```

Or run a one-shot JSON-RPC `initialize` + `tools/list` + `animforge_doctor` handshake check using Node:

```bash
node -e '
import { Client } from "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";

const ws = "/Users/vipinkumar/Desktop/animator /AnimForgeLab";
const transport = new StdioClientTransport({
  command: "/usr/local/bin/node",
  args: [ws + "/animforge-core/dist/src/mcp/index.js", ws],
});
const client = new Client({ name: "verify", version: "1.0.0" });
await client.connect(transport);
const tools = await client.listTools();
console.log("Tools:", tools.tools.map((t) => t.name));
const doc = await client.callTool({ name: "animforge_doctor", arguments: {} });
console.log("Doctor:", doc.content[0].text);
await client.close();
' --input-type=module
```

### In OpenCode

Once OpenCode is installed and started with the configuration above:
1. Confirm `animforge` appears in connected MCP tools (`16` tools starting with `animforge_`).
2. Prompt OpenCode: *"Run `animforge_doctor` and list existing projects using `animforge_list_projects`."*
3. Confirm `doctor.ok === true` and `doctor.previewServerExposed === false`.

---

## 4. Exposed Tools & Safety Rules

| Tool | Purpose | Safety / Confirmation Rule |
| :--- | :--- | :--- |
| `animforge_doctor` | Probes Node, Chrome, FFmpeg, `ffprobe`, GiveMotion, Remotion, StretchyStudio, workspace paths | Read-only; reports `previewServerExposed: false` |
| `animforge_list_projects` | Lists projects from `projects/animforge.db` + disk manifests | Read-only |
| `animforge_create_project` | Generates storyboard, characters, scenes, and `index.html` from prompt | Requires `confirmOverwrite: true` if `projectId` already exists |
| `animforge_get_project` | Returns canonical `Project` JSON | Validated `safeId` |
| `animforge_get_project_status` | Returns counts, workflow status, active render, `output.mp4` info | Validated `safeId` |
| `animforge_list_scenes` | Lists ordered scenes (`sequenceIndex`) | Read-only |
| `animforge_create_scene` | Adds a scene and recompiles `index.html` | Requires `confirmOverwrite: true` if `sceneId` exists |
| `animforge_update_scene` | Updates scene fields and recompiles `index.html` | Requires `confirmOverwrite: true` |
| `animforge_list_assets` | Lists project assets and approved `assets/` library files | Skips hidden files, symlinks, unapproved extensions |
| `animforge_import_asset` | Copies allowlisted asset from `assets/` or `projects/<id>/assets/` into project assets | Rejects `../`, symlinks, dotfiles, `.env*`, `.venv*`; `confirmOverwrite: true` to overwrite |
| `animforge_create_animation` | Appends a GiveMotion `CharacterAction` (`idle`, `walk`, `run`, `wave`, `smile`, `blink`, `look_around`) | Validated timings & action names |
| `animforge_update_keyframes` | Updates `Scene.timeline` (`characterActions`, `cameraMoves`, `audioTracks`, `duration`, `fps`) | Requires `confirmOverwrite: true` |
| `animforge_generate_preview` | Runs GiveMotion visual QA `check --fast` + standalone `bundle` | Does **not** start `PreviewServer` HTTP server |
| `animforge_get_render_status` | Polls render progress & status by `jobId` | Read-only |
| `animforge_cancel_render` | Sends `SIGTERM` -> `SIGKILL` to active GiveMotion render | Idempotent |
| `animforge_export_video` | Renders MP4 via Chrome + FFmpeg and probes stream via `ffprobe` | Requires `confirm: true`; GiveMotion engine only |

### Intentionally Excluded / Unsupported Surfaces
- **Preview HTTP Server (`PreviewServer`):** Desktop Tauri WebView only; never exposed via MCP.
- **Mesh Rigging / `.stretch` Vertex Keyframes / DWPose (`StretchyStudio`):** Milestone 2 desktop work (unsupported in headless MCP).
- **Remotion Headless Export:** Unsupported over `animforge_export_video` (returns structured `UNSUPPORTED` error).
- **Project Deletion & Arbitrary Host File Read/Write:** Intentionally omitted.
