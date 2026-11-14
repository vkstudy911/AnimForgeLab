# AnimForge Worker Stdio Protocol Specification (v1)

**Entrypoint:** `node animforge-core/dist/src/worker.js <workspaceDir>`  
**Framing:** Line-delimited UTF-8 JSON (`\n` terminated) over `stdin` -> `stdout`. All non-protocol diagnostics (`console.log`, `console.info`, child FFmpeg/Chrome logs) go to `stderr`.

---

## 1. Request Envelope (`stdin` -> Worker)

```json
{
  "version": 1,
  "id": "req_1",
  "method": "create_project",
  "params": { ... }
}
```

- `version` *(optional, defaults to `1`)*: Must equal `1`. Any other value returns `{ "version": 1, "id": ..., "ok": false, "code": "UNSUPPORTED_PROTOCOL_VERSION", "error": "..." }`.
- `id` *(required)*: Non-empty string or integer correlated back onto the terminal response.
- `method` *(required)*:
  - `doctor` `{}` -> `{ node, chrome, ffmpeg, chromeOk, ffmpegOk, raw }`
  - `list_projects` `{}` -> `{ projects: ProjectSummary[] }` where `ProjectSummary` is `{ id, name, prompt, status, width, height, fps, updatedAt }`
  - `create_project` `{ projectId?, config }` -> `{ project, projectDir }`
  - `load_project` `{ projectId }` -> `{ project }`
  - `save_project` `{ project }` -> `{ project }`
  - `preview_project` `{ projectId, sceneId? }` -> `GiveMotionPreviewResult`
  - `render_project` `{ projectId }` -> `{ renderJob, videoPath }`
  - `cancel_render` `{ projectId }` -> `{ projectId, cancelled: boolean }`

---

## 2. Response & Stream Event Envelopes (Worker -> `stdout`)

### Terminal Response

```json
{ "version": 1, "id": "req_1", "ok": true, "result": { ... } }
```

Error response:

```json
{
  "version": 1,
  "id": "req_1",
  "ok": false,
  "code": "INVALID_ID",
  "error": "Invalid project id"
}
```

Standard `code` values:
- `MALFORMED_JSON`
- `INVALID_REQUEST`
- `UNSUPPORTED_PROTOCOL_VERSION`
- `UNKNOWN_METHOD`
- `INVALID_ID`
- `INVALID_PARAMS`
- `RENDER_CANCELLED`
- `INTERNAL_ERROR`

### Asynchronous Progress Stream (`render_project`)

```json
{
  "version": 1,
  "event": "render_progress",
  "jobId": "job_...",
  "projectId": "proj_...",
  "phase": "open | frames | encode | done",
  "progress": 55,
  "done": 33,
  "total": 60,
  "fps": 14.2,
  "eta": 1.9
}
```

---

## 3. Lifecycle, Cancellation & Safety

1. **Path Jail:** Every project/scene ID is validated against `/^[a-zA-Z0-9_-]{1,64}$/` and resolved inside `<workspaceDir>/projects/` preserving trailing whitespace on `workspaceDir`.
2. **Active Render Cancellation:** Sending `cancel_render` terminates the active GiveMotion render child with `SIGTERM` and causes the awaiting `render_project` call to fail with `code: "RENDER_CANCELLED"`.
3. **Clean Shutdown:** Closing `stdin` (EOF) drains active tasks then disposes adapter children & SQLite DB and exits `0`. `SIGINT`/`SIGTERM` aborts child processes immediately and exits `0`.
