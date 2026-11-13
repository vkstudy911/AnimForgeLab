use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::ffi::OsString;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

pub const WORKER_PROTOCOL_VERSION: u32 = 1;
pub const RENDER_PROGRESS_EVENT: &str = "animforge://render-progress";
const MAX_STDERR_TAIL: usize = 25;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub status: String,
    #[serde(default)]
    pub preferred_engine: Option<String>,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub project_id: Option<String>,
    pub name: String,
    pub prompt: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<u32>,
    pub preferred_engine: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectResult {
    pub project: serde_json::Value,
    pub project_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GiveMotionCheckIssue {
    pub severity: Option<String>,
    pub code: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GiveMotionPreviewResult {
    pub project_id: String,
    pub ok: bool,
    pub errors: u32,
    pub warnings: u32,
    pub notes: u32,
    pub issues: Vec<GiveMotionCheckIssue>,
    pub bundle_dir: String,
    pub bundle_index_html: String,
    pub player_html: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderProjectResult {
    pub render_job: serde_json::Value,
    pub video_path: String,
    #[serde(default)]
    pub ffprobe: Option<serde_json::Value>,
    #[serde(default)]
    pub artifact_kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteProjectResult {
    pub project_id: String,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CancelRenderResult {
    pub project_id: String,
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RenderProgressPayload {
    pub job_id: String,
    pub project_id: String,
    pub phase: String,
    pub progress: f64,
    pub done: Option<u64>,
    pub total: Option<u64>,
    pub fps: Option<f64>,
    pub eta: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct WorkerReply {
    pub version: u32,
    pub id: Option<String>,
    pub ok: bool,
    pub code: Option<String>,
    pub error: Option<String>,
    pub result: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq)]
pub enum WorkerLine {
    Reply(WorkerReply),
    RenderProgress(RenderProgressPayload),
    Ignored,
}

pub type ProgressSink = Arc<dyn Fn(RenderProgressPayload) + Send + Sync>;

struct WorkerProcess {
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<WorkerReply>>>>,
    alive: Arc<AtomicBool>,
    stderr_tail: Arc<Mutex<VecDeque<String>>>,
    child: Child,
    stdout_thread: Option<JoinHandle<()>>,
    stderr_thread: Option<JoinHandle<()>>,
}

pub struct WorkerBridge {
    workspace_root: PathBuf,
    script_path: PathBuf,
    program: PathBuf,
    path_env: Option<OsString>,
    on_progress: ProgressSink,
    next_id: AtomicU64,
    shutdown_flag: AtomicBool,
    process: Mutex<Option<WorkerProcess>>,
}

pub fn validate_safe_id(id: &str, label: &str) -> Result<String, String> {
    if !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        Ok(id.to_string())
    } else {
        Err(format!("Invalid {label} id"))
    }
}

pub fn classify_worker_line(line: &str) -> WorkerLine {
    let trimmed = line.trim();
    if !trimmed.starts_with('{') {
        return WorkerLine::Ignored;
    }

    let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) else {
        return WorkerLine::Ignored;
    };

    let Some(version) = val.get("version").and_then(|v| v.as_u64()) else {
        return WorkerLine::Ignored;
    };
    if version != u64::from(WORKER_PROTOCOL_VERSION) {
        return WorkerLine::Ignored;
    }

    if val.get("event").and_then(|v| v.as_str()) == Some("render_progress") {
        if let Ok(payload) = serde_json::from_value::<RenderProgressPayload>(val) {
            return WorkerLine::RenderProgress(payload);
        }
        return WorkerLine::Ignored;
    }

    let Some(ok) = val.get("ok").and_then(|v| v.as_bool()) else {
        return WorkerLine::Ignored;
    };

    let id = val.get("id").and_then(|v| {
        v.as_str()
            .map(str::to_owned)
            .or_else(|| v.as_i64().map(|n| n.to_string()))
    });
    let code = val
        .get("code")
        .and_then(|v| v.as_str())
        .map(str::to_owned);
    let error = val
        .get("error")
        .and_then(|v| v.as_str())
        .map(str::to_owned);
    let result = val
        .get("result")
        .cloned()
        .unwrap_or(serde_json::Value::Null);

    WorkerLine::Reply(WorkerReply {
        version: WORKER_PROTOCOL_VERSION,
        id,
        ok,
        code,
        error,
        result,
    })
}

fn push_stderr_line(buf: &Mutex<VecDeque<String>>, line: String) {
    if line.trim().is_empty() {
        return;
    }
    if let Ok(mut guard) = buf.lock() {
        guard.push_back(line);
        while guard.len() > MAX_STDERR_TAIL {
            guard.pop_front();
        }
    }
}

fn format_stderr_tail(buf: &Mutex<VecDeque<String>>) -> String {
    let Ok(guard) = buf.lock() else {
        return String::new();
    };
    guard
        .iter()
        .rev()
        .take(5)
        .cloned()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join(" | ")
}

fn format_reply_error(reply: &WorkerReply) -> String {
    let msg = reply
        .error
        .as_deref()
        .unwrap_or("Worker request failed");
    match reply.code.as_deref() {
        Some(code) => format!("[{code}] {msg}"),
        None => msg.to_string(),
    }
}

fn wait_child_exit(child: &mut Child, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return true,
            Ok(None) => {
                if Instant::now() >= deadline {
                    return false;
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(_) => return true,
        }
    }
}

fn terminate_worker_process(mut proc: WorkerProcess) {
    proc.alive.store(false, Ordering::Release);
    if let Ok(mut guard) = proc.pending.lock() {
        guard.clear();
    }
    if let Ok(mut guard) = proc.stdin.lock() {
        guard.take();
    }

    if !wait_child_exit(&mut proc.child, Duration::from_millis(300)) {
        #[cfg(unix)]
        {
            let _ = Command::new("kill")
                .arg("-TERM")
                .arg(proc.child.id().to_string())
                .output();
            if !wait_child_exit(&mut proc.child, Duration::from_millis(700)) {
                let _ = proc.child.kill();
                let _ = proc.child.wait();
            }
        }
        #[cfg(not(unix))]
        {
            let _ = proc.child.kill();
            let _ = proc.child.wait();
        }
    }

    if let Some(handle) = proc.stdout_thread.take() {
        let _ = handle.join();
    }
    if let Some(handle) = proc.stderr_thread.take() {
        let _ = handle.join();
    }
}

impl WorkerBridge {
    pub fn for_workspace(workspace_root: &Path, on_progress: ProgressSink) -> Self {
        Self::with_script(
            workspace_root,
            crate::doctor::resolve_binary("node"),
            workspace_root
                .join("animforge-core")
                .join("dist")
                .join("src")
                .join("worker.js"),
            on_progress,
        )
    }

    pub fn with_script(
        workspace_root: &Path,
        program: PathBuf,
        script_path: PathBuf,
        on_progress: ProgressSink,
    ) -> Self {
        Self {
            workspace_root: workspace_root.to_path_buf(),
            script_path,
            program,
            path_env: std::env::join_paths(crate::doctor::search_path_dirs()).ok(),
            on_progress,
            next_id: AtomicU64::new(1),
            shutdown_flag: AtomicBool::new(false),
            process: Mutex::new(None),
        }
    }

    fn spawn_process(&self) -> Result<WorkerProcess, String> {
        if !self.script_path.is_file() {
            return Err(format!(
                "AnimForge worker script not found at {}",
                self.script_path.display()
            ));
        }

        let mut cmd = Command::new(&self.program);
        cmd.arg(&self.script_path)
            .arg(&self.workspace_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(ref path_env) = self.path_env {
            cmd.env("PATH", path_env);
        }

        let mut child = cmd.spawn().map_err(|err| {
            format!(
                "Failed to spawn worker '{}': {err}",
                self.program.display()
            )
        })?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Worker stdin pipe unavailable".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Worker stdout pipe unavailable".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Worker stderr pipe unavailable".to_string())?;

        let pending = Arc::new(Mutex::new(HashMap::<String, mpsc::Sender<WorkerReply>>::new()));
        let alive = Arc::new(AtomicBool::new(true));
        let stderr_tail = Arc::new(Mutex::new(VecDeque::<String>::new()));

        let stdout_pending = pending.clone();
        let stdout_alive = alive.clone();
        let stdout_sink = self.on_progress.clone();
        let stdout_thread = std::thread::Builder::new()
            .name("animforge-worker-stdout".to_string())
            .spawn(move || {
                let mut reader = BufReader::new(stdout);
                let mut buf = Vec::<u8>::new();
                loop {
                    buf.clear();
                    match reader.read_until(b'\n', &mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {
                            let line = String::from_utf8_lossy(&buf);
                            match classify_worker_line(&line) {
                                WorkerLine::Reply(reply) => {
                                    if let Some(ref id) = reply.id {
                                        let waiter = stdout_pending
                                            .lock()
                                            .ok()
                                            .and_then(|mut map| map.remove(id));
                                        if let Some(tx) = waiter {
                                            let _ = tx.send(reply);
                                        }
                                    }
                                }
                                WorkerLine::RenderProgress(ev) => {
                                    (stdout_sink)(ev);
                                }
                                WorkerLine::Ignored => {}
                            }
                        }
                    }
                }
                stdout_alive.store(false, Ordering::Release);
                if let Ok(mut map) = stdout_pending.lock() {
                    map.clear();
                }
            })
            .map_err(|err| format!("Failed to spawn worker stdout thread: {err}"))?;

        let stderr_buf = stderr_tail.clone();
        let stderr_thread = std::thread::Builder::new()
            .name("animforge-worker-stderr".to_string())
            .spawn(move || {
                let mut reader = BufReader::new(stderr);
                let mut buf = Vec::<u8>::new();
                loop {
                    buf.clear();
                    match reader.read_until(b'\n', &mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {
                            let clean = String::from_utf8_lossy(&buf)
                                .trim_end_matches(['\r', '\n'])
                                .to_string();
                            push_stderr_line(&stderr_buf, clean);
                        }
                    }
                }
            })
            .map_err(|err| format!("Failed to spawn worker stderr thread: {err}"))?;

        Ok(WorkerProcess {
            stdin: Arc::new(Mutex::new(Some(stdin))),
            pending,
            alive,
            stderr_tail,
            child,
            stdout_thread: Some(stdout_thread),
            stderr_thread: Some(stderr_thread),
        })
    }

    pub fn call_json(
        &self,
        method: &str,
        params: serde_json::Value,
        timeout: Duration,
    ) -> Result<serde_json::Value, String> {
        let (stdin_arc, pending_arc, alive_arc, stderr_tail_arc) = {
            let mut guard = self
                .process
                .lock()
                .map_err(|_| "Worker bridge state lock poisoned".to_string())?;
            if self.shutdown_flag.load(Ordering::Acquire) {
                return Err("Worker bridge is shutting down".to_string());
            }

            if guard.as_ref().is_some_and(|p| !p.alive.load(Ordering::Acquire)) {
                if let Some(dead) = guard.take() {
                    terminate_worker_process(dead);
                }
            }

            if guard.is_none() {
                *guard = Some(self.spawn_process()?);
            }

            let proc = guard.as_ref().expect("worker process initialized");
            (
                proc.stdin.clone(),
                proc.pending.clone(),
                proc.alive.clone(),
                proc.stderr_tail.clone(),
            )
        };

        let req_id = format!("req_{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        let (tx, rx) = mpsc::channel();
        {
            let mut map = pending_arc
                .lock()
                .map_err(|_| "Worker pending map lock poisoned".to_string())?;
            if !alive_arc.load(Ordering::Acquire) {
                return Err(format!("Worker exited unexpectedly during '{method}'"));
            }
            map.insert(req_id.clone(), tx);
        }

        let payload = serde_json::json!({
            "version": WORKER_PROTOCOL_VERSION,
            "id": req_id,
            "method": method,
            "params": params,
        });
        let serialized = serde_json::to_string(&payload)
            .map_err(|err| format!("Failed to serialize worker request: {err}"))?;

        {
            let mut stdin_guard = stdin_arc
                .lock()
                .map_err(|_| "Worker stdin lock poisoned".to_string())?;
            let Some(stdin) = stdin_guard.as_mut() else {
                if let Ok(mut map) = pending_arc.lock() {
                    map.remove(&req_id);
                }
                return Err("Worker stdin is closed".to_string());
            };
            if let Err(err) = writeln!(stdin, "{serialized}").and_then(|()| stdin.flush()) {
                alive_arc.store(false, Ordering::Release);
                if let Ok(mut map) = pending_arc.lock() {
                    map.remove(&req_id);
                }
                let detail = format_stderr_tail(&stderr_tail_arc);
                return Err(if detail.is_empty() {
                    format!("Failed writing request '{method}' to worker: {err}")
                } else {
                    format!("Failed writing request '{method}' to worker: {err} ({detail})")
                });
            }
        }

        match rx.recv_timeout(timeout) {
            Ok(reply) => {
                if reply.ok {
                    Ok(reply.result)
                } else {
                    Err(format_reply_error(&reply))
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if let Ok(mut map) = pending_arc.lock() {
                    map.remove(&req_id);
                }
                // Tear down wedged worker & child render/preview processes so activeRenders cannot stay stuck.
                let timed_out_proc = self.process.lock().ok().and_then(|mut guard| {
                    if guard
                        .as_ref()
                        .is_some_and(|proc| Arc::ptr_eq(&proc.pending, &pending_arc))
                    {
                        guard.take()
                    } else {
                        None
                    }
                });
                if let Some(proc) = timed_out_proc {
                    terminate_worker_process(proc);
                }
                Err(format!(
                    "Worker request '{method}' timed out after {}s",
                    timeout.as_secs()
                ))
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                std::thread::sleep(Duration::from_millis(20));
                let detail = format_stderr_tail(&stderr_tail_arc);
                Err(if detail.is_empty() {
                    format!("Worker exited unexpectedly during '{method}'")
                } else {
                    format!("Worker exited unexpectedly during '{method}': {detail}")
                })
            }
        }
    }

    pub fn list_projects(&self) -> Result<Vec<ProjectSummary>, String> {
        let res = self.call_json("list_projects", serde_json::json!({}), Duration::from_secs(15))?;
        let projects = res
            .get("projects")
            .cloned()
            .ok_or_else(|| "Invalid list_projects response: missing projects".to_string())?;
        serde_json::from_value(projects)
            .map_err(|err| format!("Invalid list_projects response: {err}"))
    }

    pub fn create_project_from_prompt(
        &self,
        input: CreateProjectInput,
    ) -> Result<CreateProjectResult, String> {
        let name = input.name.trim();
        let prompt = input.prompt.trim();
        if name.is_empty() {
            return Err("Project name must not be empty".to_string());
        }
        if prompt.is_empty() {
            return Err("Project prompt must not be empty".to_string());
        }
        let project_id = match input.project_id {
            Some(ref id) => Some(validate_safe_id(id, "project")?),
            None => None,
        };

        let mut params = serde_json::json!({
            "config": {
                "name": name,
                "prompt": prompt,
                "width": input.width.unwrap_or(1280),
                "height": input.height.unwrap_or(720),
                "fps": input.fps.unwrap_or(30),
                "preferredEngine": input.preferred_engine.as_deref().unwrap_or("givemotion"),
            }
        });
        if let Some(id) = project_id {
            params["projectId"] = serde_json::Value::String(id);
        }

        let res = self.call_json("create_project", params, Duration::from_secs(30))?;
        serde_json::from_value(res).map_err(|err| format!("Invalid create_project response: {err}"))
    }

    pub fn load_project(&self, project_id: &str) -> Result<serde_json::Value, String> {
        let safe_id = validate_safe_id(project_id, "project")?;
        let res = self.call_json(
            "load_project",
            serde_json::json!({ "projectId": safe_id }),
            Duration::from_secs(15),
        )?;
        res.get("project")
            .filter(|v| v.is_object())
            .cloned()
            .ok_or_else(|| "Invalid load_project response: missing project object".to_string())
    }

    pub fn save_project(&self, project: serde_json::Value) -> Result<serde_json::Value, String> {
        let raw_id = project
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Project object missing string id".to_string())?;
        validate_safe_id(raw_id, "project")?;
        let res = self.call_json(
            "save_project",
            serde_json::json!({ "project": project }),
            Duration::from_secs(15),
        )?;
        res.get("project")
            .filter(|v| v.is_object())
            .cloned()
            .ok_or_else(|| "Invalid save_project response: missing project object".to_string())
    }

    pub fn preview_project(
        &self,
        project_id: &str,
        scene_id: Option<&str>,
    ) -> Result<GiveMotionPreviewResult, String> {
        let safe_id = validate_safe_id(project_id, "project")?;
        let safe_scene = match scene_id {
            Some(sid) => Some(validate_safe_id(sid, "scene")?),
            None => None,
        };
        let mut params = serde_json::json!({ "projectId": safe_id });
        if let Some(sid) = safe_scene {
            params["sceneId"] = serde_json::Value::String(sid);
        }
        let res = self.call_json("preview_project", params, Duration::from_secs(90))?;
        serde_json::from_value(res)
            .map_err(|err| format!("Invalid preview_project response: {err}"))
    }

    pub fn render_project(&self, project_id: &str) -> Result<RenderProjectResult, String> {
        let safe_id = validate_safe_id(project_id, "project")?;
        let res = self.call_json(
            "render_project",
            serde_json::json!({ "projectId": safe_id }),
            Duration::from_secs(600),
        )?;
        serde_json::from_value(res).map_err(|err| format!("Invalid render_project response: {err}"))
    }

    pub fn cancel_render(&self, project_id: &str) -> Result<CancelRenderResult, String> {
        let safe_id = validate_safe_id(project_id, "project")?;
        let res = self.call_json(
            "cancel_render",
            serde_json::json!({ "projectId": safe_id }),
            Duration::from_secs(15),
        )?;
        serde_json::from_value(res).map_err(|err| format!("Invalid cancel_render response: {err}"))
    }

    pub fn delete_project(&self, project_id: &str) -> Result<DeleteProjectResult, String> {
        let safe_id = validate_safe_id(project_id, "project")?;
        let res = self.call_json(
            "delete_project",
            serde_json::json!({ "projectId": safe_id }),
            Duration::from_secs(20),
        )?;
        serde_json::from_value(res)
            .map_err(|err| format!("Invalid delete_project response: {err}"))
    }

    pub fn duplicate_project(
        &self,
        project_id: &str,
        new_name: Option<&str>,
    ) -> Result<CreateProjectResult, String> {
        let safe_id = validate_safe_id(project_id, "project")?;
        let mut params = serde_json::json!({ "projectId": safe_id });
        if let Some(name) = new_name.map(str::trim).filter(|n| !n.is_empty()) {
            params["newName"] = serde_json::Value::String(name.to_string());
        }
        let res = self.call_json("duplicate_project", params, Duration::from_secs(30))?;
        serde_json::from_value(res)
            .map_err(|err| format!("Invalid duplicate_project response: {err}"))
    }

    pub fn import_project(&self, project: serde_json::Value) -> Result<CreateProjectResult, String> {
        let raw_id = project
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Imported project object missing string id".to_string())?;
        validate_safe_id(raw_id, "project")?;
        let res = self.call_json(
            "import_project",
            serde_json::json!({ "project": project }),
            Duration::from_secs(30),
        )?;
        serde_json::from_value(res)
            .map_err(|err| format!("Invalid import_project response: {err}"))
    }

    pub fn list_render_jobs(
        &self,
        project_id: Option<&str>,
    ) -> Result<Vec<serde_json::Value>, String> {
        let mut params = serde_json::json!({});
        if let Some(pid) = project_id {
            let safe_id = validate_safe_id(pid, "project")?;
            params["projectId"] = serde_json::Value::String(safe_id);
        }
        let res = self.call_json("list_render_jobs", params, Duration::from_secs(15))?;
        let jobs = res
            .get("jobs")
            .and_then(|v| v.as_array())
            .cloned()
            .ok_or_else(|| "Invalid list_render_jobs response: missing jobs array".to_string())?;
        Ok(jobs)
    }

    pub fn assets_list(&self, project_id: Option<&str>) -> Result<serde_json::Value, String> {
        let mut params = serde_json::json!({});
        if let Some(pid) = project_id {
            let safe_id = validate_safe_id(pid, "project")?;
            params["projectId"] = serde_json::Value::String(safe_id);
        }
        self.call_json("assets_list", params, Duration::from_secs(15))
    }

    pub fn import_asset_from_workspace(
        &self,
        project_id: &str,
        source_path: &str,
        name: Option<&str>,
        asset_type: Option<&str>,
        confirm_overwrite: bool,
    ) -> Result<serde_json::Value, String> {
        let safe_id = validate_safe_id(project_id, "project")?;
        let mut params = serde_json::json!({
            "projectId": safe_id,
            "sourcePath": source_path,
            "confirmOverwrite": confirm_overwrite,
            "allowExternalSource": false,
        });
        if let Some(n) = name.map(str::trim).filter(|s| !s.is_empty()) {
            params["name"] = serde_json::Value::String(n.to_string());
        }
        if let Some(t) = asset_type.map(str::trim).filter(|s| !s.is_empty()) {
            params["assetType"] = serde_json::Value::String(t.to_string());
        }
        self.call_json("asset_import", params, Duration::from_secs(30))
    }

    pub fn import_asset_bytes(
        &self,
        project_id: &str,
        file_name: &str,
        data_base64: &str,
        name: Option<&str>,
        asset_type: Option<&str>,
        confirm_overwrite: bool,
    ) -> Result<serde_json::Value, String> {
        let safe_id = validate_safe_id(project_id, "project")?;
        let mut params = serde_json::json!({
            "projectId": safe_id,
            "fileName": file_name,
            "dataBase64": data_base64,
            "confirmOverwrite": confirm_overwrite,
        });
        if let Some(n) = name.map(str::trim).filter(|s| !s.is_empty()) {
            params["name"] = serde_json::Value::String(n.to_string());
        }
        if let Some(t) = asset_type.map(str::trim).filter(|s| !s.is_empty()) {
            params["assetType"] = serde_json::Value::String(t.to_string());
        }
        self.call_json("asset_import_bytes", params, Duration::from_secs(30))
    }

    pub fn run_deterministic_agent(
        &self,
        project_id: &str,
        agent: &str,
    ) -> Result<serde_json::Value, String> {
        let safe_id = validate_safe_id(project_id, "project")?;
        self.call_json(
            "run_deterministic_agent",
            serde_json::json!({ "projectId": safe_id, "agent": agent }),
            Duration::from_secs(30),
        )
    }

    pub fn get_config(&self) -> Result<serde_json::Value, String> {
        self.call_json("get_config", serde_json::json!({}), Duration::from_secs(15))
    }

    pub fn save_config(&self, config: serde_json::Value) -> Result<serde_json::Value, String> {
        self.call_json(
            "save_config",
            serde_json::json!({ "config": config }),
            Duration::from_secs(15),
        )
    }

    pub fn shutdown(&self) {
        self.shutdown_flag.store(true, Ordering::Release);
        let taken = self.process.lock().ok().and_then(|mut g| g.take());
        if let Some(proc) = taken {
            terminate_worker_process(proc);
        }
    }
}

impl Drop for WorkerBridge {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[tauri::command]
pub async fn project_list(
    state: tauri::State<'_, Arc<WorkerBridge>>,
) -> Result<Vec<ProjectSummary>, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.list_projects())
        .await
        .map_err(|err| format!("project_list task failed: {err}"))?
}

#[tauri::command]
pub async fn project_create_from_prompt(
    state: tauri::State<'_, Arc<WorkerBridge>>,
    input: CreateProjectInput,
) -> Result<CreateProjectResult, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.create_project_from_prompt(input))
        .await
        .map_err(|err| format!("project_create_from_prompt task failed: {err}"))?
}

#[tauri::command]
pub async fn project_load(
    state: tauri::State<'_, Arc<WorkerBridge>>,
    project_id: String,
) -> Result<serde_json::Value, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.load_project(&project_id))
        .await
        .map_err(|err| format!("project_load task failed: {err}"))?
}

#[tauri::command]
pub async fn project_save(
    state: tauri::State<'_, Arc<WorkerBridge>>,
    project: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.save_project(project))
        .await
        .map_err(|err| format!("project_save task failed: {err}"))?
}

#[tauri::command]
pub async fn project_preview(
    state: tauri::State<'_, Arc<WorkerBridge>>,
    project_id: String,
    scene_id: Option<String>,
) -> Result<GiveMotionPreviewResult, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        bridge.preview_project(&project_id, scene_id.as_deref())
    })
    .await
    .map_err(|err| format!("project_preview task failed: {err}"))?
}

#[tauri::command]
pub async fn project_render(
    state: tauri::State<'_, Arc<WorkerBridge>>,
    project_id: String,
) -> Result<RenderProjectResult, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.render_project(&project_id))
        .await
        .map_err(|err| format!("project_render task failed: {err}"))?
}

#[tauri::command]
pub async fn project_cancel_render(
    state: tauri::State<'_, Arc<WorkerBridge>>,
    project_id: String,
) -> Result<CancelRenderResult, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.cancel_render(&project_id))
        .await
        .map_err(|err| format!("project_cancel_render task failed: {err}"))?
}

#[tauri::command]
pub async fn project_delete(
    state: tauri::State<'_, Arc<WorkerBridge>>,
    project_id: String,
) -> Result<DeleteProjectResult, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.delete_project(&project_id))
        .await
        .map_err(|err| format!("project_delete task failed: {err}"))?
}

#[tauri::command]
pub async fn project_duplicate(
    state: tauri::State<'_, Arc<WorkerBridge>>,
    project_id: String,
    new_name: Option<String>,
) -> Result<CreateProjectResult, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        bridge.duplicate_project(&project_id, new_name.as_deref())
    })
    .await
    .map_err(|err| format!("project_duplicate task failed: {err}"))?
}

#[tauri::command]
pub async fn project_import(
    state: tauri::State<'_, Arc<WorkerBridge>>,
    project: serde_json::Value,
) -> Result<CreateProjectResult, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.import_project(project))
        .await
        .map_err(|err| format!("project_import task failed: {err}"))?
}

#[tauri::command]
pub async fn project_list_render_jobs(
    state: tauri::State<'_, Arc<WorkerBridge>>,
    project_id: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.list_render_jobs(project_id.as_deref()))
        .await
        .map_err(|err| format!("project_list_render_jobs task failed: {err}"))?
}

#[tauri::command]
pub async fn project_assets_list(
    state: tauri::State<'_, Arc<WorkerBridge>>,
    project_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.assets_list(project_id.as_deref()))
        .await
        .map_err(|err| format!("project_assets_list task failed: {err}"))?
}

#[tauri::command]
pub async fn project_import_asset(
    state: tauri::State<'_, Arc<WorkerBridge>>,
    project_id: String,
    source_path: String,
    name: Option<String>,
    asset_type: Option<String>,
    confirm_overwrite: Option<bool>,
) -> Result<serde_json::Value, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        bridge.import_asset_from_workspace(
            &project_id,
            &source_path,
            name.as_deref(),
            asset_type.as_deref(),
            confirm_overwrite.unwrap_or(false),
        )
    })
    .await
    .map_err(|err| format!("project_import_asset task failed: {err}"))?
}

#[tauri::command]
pub async fn project_import_asset_bytes(
    state: tauri::State<'_, Arc<WorkerBridge>>,
    project_id: String,
    file_name: String,
    data_base64: String,
    name: Option<String>,
    asset_type: Option<String>,
    confirm_overwrite: Option<bool>,
) -> Result<serde_json::Value, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        bridge.import_asset_bytes(
            &project_id,
            &file_name,
            &data_base64,
            name.as_deref(),
            asset_type.as_deref(),
            confirm_overwrite.unwrap_or(false),
        )
    })
    .await
    .map_err(|err| format!("project_import_asset_bytes task failed: {err}"))?
}

#[tauri::command]
pub async fn run_deterministic_agent(
    state: tauri::State<'_, Arc<WorkerBridge>>,
    project_id: String,
    agent: String,
) -> Result<serde_json::Value, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.run_deterministic_agent(&project_id, &agent))
        .await
        .map_err(|err| format!("run_deterministic_agent task failed: {err}"))?
}

#[tauri::command]
pub async fn config_get(
    state: tauri::State<'_, Arc<WorkerBridge>>,
) -> Result<serde_json::Value, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.get_config())
        .await
        .map_err(|err| format!("config_get task failed: {err}"))?
}

#[tauri::command]
pub async fn config_save(
    state: tauri::State<'_, Arc<WorkerBridge>>,
    config: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.save_config(config))
        .await
        .map_err(|err| format!("config_save task failed: {err}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::Mutex as StdMutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempDirGuard(PathBuf);
    impl Drop for TempDirGuard {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn make_trailing_space_dir(prefix: &str) -> (TempDirGuard, PathBuf) {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock ok")
            .as_nanos();
        let parent = std::env::temp_dir().join(format!("animforge_wb_{prefix}_{stamp} "));
        let ws = parent.join("AnimForgeLab");
        fs::create_dir_all(ws.join("projects")).expect("create projects");
        (TempDirGuard(parent), ws)
    }

    #[test]
    fn validates_ids_and_classifies_protocol_v1_lines() {
        assert_eq!(validate_safe_id("proj_1-abc", "project").unwrap(), "proj_1-abc");
        assert!(validate_safe_id("../evil", "project").is_err());
        assert!(validate_safe_id(" proj_1", "project").is_err());
        assert!(validate_safe_id("", "project").is_err());

        match classify_worker_line(r#"{"version":1,"id":"req_1","ok":true,"result":{"projects":[]}}"#) {
            WorkerLine::Reply(r) => {
                assert_eq!(r.version, 1);
                assert_eq!(r.id.as_deref(), Some("req_1"));
                assert!(r.ok);
            }
            other => panic!("expected Reply, got {other:?}"),
        }

        match classify_worker_line(
            r#"{"version":1,"id":"req_2","ok":false,"code":"INVALID_ID","error":"Invalid project id"}"#,
        ) {
            WorkerLine::Reply(r) => {
                assert!(!r.ok);
                assert_eq!(r.code.as_deref(), Some("INVALID_ID"));
            }
            other => panic!("expected error Reply, got {other:?}"),
        }

        match classify_worker_line(
            r#"{"version":1,"event":"render_progress","jobId":"job_1","projectId":"proj_1","phase":"frames","progress":55,"done":33,"total":60,"fps":14.2,"eta":1.9}"#,
        ) {
            WorkerLine::RenderProgress(p) => {
                assert_eq!(p.job_id, "job_1");
                assert_eq!(p.project_id, "proj_1");
                assert_eq!(p.phase, "frames");
                assert_eq!(p.progress, 55.0);
                assert_eq!(p.done, Some(33));
            }
            other => panic!("expected RenderProgress, got {other:?}"),
        }

        match classify_worker_line(
            r#"{"version":1,"event":"render_progress","jobId":"job_1","projectId":"proj_1","phase":"open","progress":2}"#,
        ) {
            WorkerLine::RenderProgress(p) => {
                assert_eq!(p.phase, "open");
                assert_eq!(p.done, None);
                assert_eq!(p.total, None);
            }
            other => panic!("expected minimal RenderProgress, got {other:?}"),
        }

        assert_eq!(classify_worker_line("non-json startup banner"), WorkerLine::Ignored);
        assert_eq!(
            classify_worker_line(r#"{"version":2,"id":"req_1","ok":true}"#),
            WorkerLine::Ignored
        );
    }

    #[test]
    fn bridges_concurrent_calls_progress_crash_recovery_cancel_and_shutdown() {
        let (_guard, ws) = make_trailing_space_dir("script");
        let fake_worker = ws.join("fake_worker.mjs");
        fs::write(
            &fake_worker,
            r#"
import readline from 'node:readline';
const ws = process.argv[2];
console.log('BANNER NOISE ON STDOUT BEFORE JSON');
console.error('stderr diagnostic noise line 1');
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let slowTimer = null;
rl.on('line', (line) => {
  if (!line.trim()) return;
  const req = JSON.parse(line);
  if (req.method === 'echo_ws') {
    process.stdout.write(Buffer.from([0xff, 0xfe, 0x0a]));
    process.stderr.write(Buffer.from([0xff, 0xfe, 0x0a]));
    console.log(JSON.stringify({ version: 1, id: req.id, ok: true, result: { ws, count: req.params?.n ?? 0 } }));
    return;
  }
  if (req.method === 'crash_now') {
    console.error('fatal simulated crash');
    process.exit(17);
  }
  if (req.method === 'render_project') {
    console.log(JSON.stringify({ version: 1, event: 'render_progress', jobId: 'j1', projectId: req.params.projectId, phase: 'frames', progress: 40, done: 4, total: 10, fps: 12, eta: 0.5 }));
    slowTimer = setTimeout(() => {
      slowTimer = null;
      console.log(JSON.stringify({ version: 1, id: req.id, ok: true, result: { renderJob: { id: 'j1' }, videoPath: ws + '/output.mp4' } }));
    }, 3000);
    slowTimer.reqId = req.id;
    slowTimer.projectId = req.params.projectId;
    return;
  }
  if (req.method === 'cancel_render') {
    if (slowTimer) {
      const targetReqId = slowTimer.reqId;
      clearTimeout(slowTimer);
      slowTimer = null;
      console.log(JSON.stringify({ version: 1, id: req.id, ok: true, result: { projectId: req.params.projectId, cancelled: true } }));
      console.log(JSON.stringify({ version: 1, id: targetReqId, ok: false, code: 'RENDER_CANCELLED', error: 'Render cancelled by user' }));
      return;
    }
    console.log(JSON.stringify({ version: 1, id: req.id, ok: true, result: { projectId: req.params.projectId, cancelled: false } }));
    return;
  }
});
rl.on('close', () => process.exit(0));
"#,
        )
        .expect("write fake worker");

        let events = Arc::new(StdMutex::new(Vec::<RenderProgressPayload>::new()));
        let events_sink = events.clone();
        let bridge = Arc::new(WorkerBridge::with_script(
            &ws,
            crate::doctor::resolve_binary("node"),
            fake_worker,
            Arc::new(move |ev| {
                events_sink.lock().expect("lock").push(ev);
            }),
        ));

        // 1. Workspace path with trailing space is passed verbatim without trimming
        let echo = bridge
            .call_json("echo_ws", serde_json::json!({ "n": 42 }), Duration::from_secs(5))
            .expect("echo_ws succeeds");
        assert_eq!(echo["ws"].as_str(), Some(ws.to_string_lossy().as_ref()));
        assert!(echo["ws"].as_str().unwrap().contains(" /AnimForgeLab"));

        // 2. Active slow render streams progress AND concurrent echo + cancel run non-blockingly
        let render_bridge = bridge.clone();
        let render_thread = std::thread::spawn(move || {
            render_bridge.call_json(
                "render_project",
                serde_json::json!({ "projectId": "proj_1" }),
                Duration::from_secs(10),
            )
        });

        let mut saw_progress = false;
        for _ in 0..60 {
            if !events.lock().expect("lock").is_empty() {
                saw_progress = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(saw_progress, "expected render_progress event while render is active");

        let concurrent_echo = bridge
            .call_json("echo_ws", serde_json::json!({ "n": 99 }), Duration::from_secs(5))
            .expect("concurrent call must not deadlock behind render");
        assert_eq!(concurrent_echo["count"].as_i64(), Some(99));

        let cancelled = bridge
            .call_json(
                "cancel_render",
                serde_json::json!({ "projectId": "proj_1" }),
                Duration::from_secs(5),
            )
            .expect("cancel succeeds");
        assert_eq!(cancelled["cancelled"].as_bool(), Some(true));

        let render_err = render_thread
            .join()
            .expect("thread ok")
            .expect_err("cancelled render must fail");
        assert!(render_err.contains("RENDER_CANCELLED"), "got: {render_err}");

        // 3. Worker crash fails caller cleanly and auto-respawns on next call
        let crash_err = bridge
            .call_json("crash_now", serde_json::json!({}), Duration::from_secs(5))
            .expect_err("crash must return error");
        assert!(
            crash_err.contains("exited") || crash_err.contains("fatal simulated crash"),
            "unexpected crash message: {crash_err}"
        );

        let respawned = bridge
            .call_json("echo_ws", serde_json::json!({ "n": 7 }), Duration::from_secs(5))
            .expect("worker must respawn automatically after crash");
        assert_eq!(respawned["count"].as_i64(), Some(7));

        bridge.shutdown();

        let after_shutdown = bridge
            .call_json("echo_ws", serde_json::json!({}), Duration::from_secs(2))
            .expect_err("calls after shutdown must fail");
        assert!(after_shutdown.contains("shutting down"), "got: {after_shutdown}");
    }

    #[test]
    fn enforces_timeout_rejects_malformed_results_and_terminates_eof_ignoring_child_on_drop() {
        let (_guard, ws) = make_trailing_space_dir("drop_timeout");
        let stub_worker = ws.join("stub_worker.mjs");
        fs::write(
            &stub_worker,
            r#"
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
const ws = process.argv[2];
fs.appendFileSync(path.join(ws, '.pids'), `${process.pid}\n`);
process.on('SIGTERM', () => {
  fs.appendFileSync(path.join(ws, '.sigterm'), `${process.pid}\n`);
  process.exit(0);
});
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const req = JSON.parse(line);
  if (req.method === 'ping') {
    console.log(JSON.stringify({ version: 1, id: req.id, ok: true, result: { ok: true } }));
  } else if (req.method === 'list_projects' || req.method === 'load_project') {
    console.log(JSON.stringify({ version: 1, id: req.id, ok: true, result: {} }));
  }
});
// Intentionally keep event loop alive even if stdin closes to test SIGTERM escalation on Drop
const keepAlive = setInterval(() => {}, 10000);
"#,
        )
        .expect("write stub worker");

        let bridge = WorkerBridge::with_script(
            &ws,
            crate::doctor::resolve_binary("node"),
            stub_worker,
            Arc::new(|_| {}),
        );

        let timeout_err = bridge
            .call_json("hang_forever", serde_json::json!({}), Duration::from_millis(60))
            .expect_err("timeout must fire cleanly");
        assert!(timeout_err.contains("timed out"), "got: {timeout_err}");
        let killed_after_timeout = fs::read_to_string(ws.join(".sigterm")).expect("timeout must kill worker");
        assert_eq!(killed_after_timeout.lines().count(), 1);

        assert!(bridge
            .call_json("ping", serde_json::json!({}), Duration::from_secs(2))
            .is_ok());
        let pids_raw = fs::read_to_string(ws.join(".pids")).expect("pids file");
        let pids: Vec<&str> = pids_raw.lines().collect();
        assert_eq!(pids.len(), 2, "expected respawned second worker pid");
        assert_ne!(pids[0], pids[1]);

        let missing_projects = bridge.list_projects().expect_err("missing projects must fail");
        assert!(missing_projects.contains("missing projects"), "got: {missing_projects}");

        let missing_project = bridge
            .load_project("proj_1")
            .expect_err("missing project object must fail");
        assert!(missing_project.contains("missing project object"), "got: {missing_project}");

        drop(bridge);

        let sigterms = fs::read_to_string(ws.join(".sigterm")).expect("drop must kill respawned worker");
        assert_eq!(sigterms.lines().count(), 2, "expected timeout + drop SIGTERM");
    }

    #[test]
    fn real_animforge_core_worker_round_trip_with_trailing_space_workspace() {
        let real_workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|p| p.parent())
            .expect("repo root")
            .to_path_buf();
        let dist_worker = real_workspace
            .join("animforge-core")
            .join("dist")
            .join("src")
            .join("worker.js");
        assert!(
            dist_worker.is_file(),
            "expected compiled worker at {}",
            dist_worker.display()
        );

        let (_guard, tmp_ws) = make_trailing_space_dir("real_core");
        let fake_gm_src = tmp_ws.join("engines").join("givemotion").join("src");
        fs::create_dir_all(&fake_gm_src).expect("create fake engine dir");
        let fixture_mp4 = tmp_ws.join("projects").join("fixture-valid.mp4");
        let ffmpeg_bin = crate::doctor::resolve_binary("ffmpeg");
        let ffmpeg_status = Command::new(&ffmpeg_bin)
            .args([
                "-f",
                "lavfi",
                "-i",
                "color=c=black:s=64x64:d=0.2",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-y",
            ])
            .arg(&fixture_mp4)
            .status()
            .expect("generate tiny test mp4");
        assert!(ffmpeg_status.success(), "ffmpeg fixture generation failed");

        fs::write(
            fake_gm_src.join("cli.js"),
            r#"
import fs from 'node:fs/promises';
import path from 'node:path';
const args = process.argv.slice(2);
const cmd = args[0];
if (cmd === 'doctor') {
  console.log('node v24.19.0\nchrome /fake/chrome\nffmpeg 9.0.1 encoders: libx264');
  process.exit(0);
}
if (cmd === 'check') {
  console.log(JSON.stringify({ ok: true, errors: 0, warnings: 1, notes: 0, issues: [{ severity: 'warning', code: 'demo', message: 'Check note' }] }));
  process.exit(0);
}
if (cmd === 'bundle') {
  const outDir = args[args.indexOf('-o') + 1];
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'index.html'), '<html>bundled</html>', 'utf8');
  await fs.writeFile(path.join(outDir, 'gm-player.js'), '// player', 'utf8');
  await fs.writeFile(path.join(outDir, 'player.html'), '<gm-player></gm-player>', 'utf8');
  console.log(JSON.stringify({ outDir, files: 3, skipped: [] }));
  process.exit(0);
}
if (cmd === 'render') {
  const outMp4 = args[args.indexOf('-o') + 1];
  const validFixture = path.join(path.dirname(outMp4), '..', 'fixture-valid.mp4');
  console.error(JSON.stringify({ event: 'progress', phase: 'frames', done: 10, total: 20, fps: 12, eta: 0.5 }));
  await fs.copyFile(validFixture, outMp4);
  console.error(JSON.stringify({ event: 'progress', phase: 'done' }));
  process.exit(0);
}
"#,
        )
        .expect("write local engine cli");

        let events = Arc::new(StdMutex::new(Vec::<RenderProgressPayload>::new()));
        let events_sink = events.clone();
        let bridge = WorkerBridge::with_script(
            &tmp_ws,
            crate::doctor::resolve_binary("node"),
            dist_worker,
            Arc::new(move |ev| events_sink.lock().expect("lock").push(ev)),
        );

        let created = bridge
            .create_project_from_prompt(CreateProjectInput {
                project_id: Some("proj_bridge_real".to_string()),
                name: "Bridge Real".to_string(),
                prompt: "Pip waves under stars".to_string(),
                width: None,
                height: None,
                fps: None,
                preferred_engine: None,
            })
            .expect("real worker create_project succeeds");
        assert_eq!(created.project["id"].as_str(), Some("proj_bridge_real"));

        let listed = bridge.list_projects().expect("list_projects succeeds");
        assert!(listed.iter().any(|p| p.id == "proj_bridge_real"));

        let loaded = bridge
            .load_project("proj_bridge_real")
            .expect("load_project succeeds");
        assert_eq!(loaded["id"].as_str(), Some("proj_bridge_real"));

        let mut edited = loaded;
        edited["name"] = serde_json::Value::String("Bridge Saved".to_string());
        let saved = bridge.save_project(edited).expect("save_project succeeds");
        assert_eq!(saved["name"].as_str(), Some("Bridge Saved"));

        let preview = bridge
            .preview_project("proj_bridge_real", None)
            .expect("preview_project succeeds cleanly");
        assert!(preview.ok);
        assert_eq!(preview.warnings, 1);
        assert!(preview.bundle_index_html.contains(" /AnimForgeLab"));

        let rendered = bridge
            .render_project("proj_bridge_real")
            .expect("render_project succeeds cleanly");
        assert!(rendered.video_path.ends_with("output.mp4"));
        assert!(!events.lock().expect("lock").is_empty());

        let jobs = bridge
            .list_render_jobs(Some("proj_bridge_real"))
            .expect("list_render_jobs succeeds");
        assert!(!jobs.is_empty());

        let duplicated = bridge
            .duplicate_project("proj_bridge_real", Some("Bridge Clone"))
            .expect("duplicate_project succeeds");
        let clone_id = duplicated.project["id"].as_str().expect("clone id").to_string();
        assert_ne!(clone_id, "proj_bridge_real");

        let imported = bridge
            .import_project(duplicated.project.clone())
            .expect("import_project succeeds with colliding id minted cleanly");
        let import_id = imported.project["id"].as_str().expect("imported id").to_string();
        assert_ne!(import_id, clone_id);
        let bad_import = bridge
            .import_project(serde_json::json!({ "id": "../escape" }))
            .expect_err("traversal import id rejected at Rust boundary");
        assert!(bad_import.contains("INVALID_ID") || bad_import.contains("Invalid"));

        let deleted = bridge
            .delete_project(&clone_id)
            .expect("delete_project succeeds");
        assert!(deleted.deleted);
        let deleted_import = bridge
            .delete_project(&import_id)
            .expect("delete imported project succeeds");
        assert!(deleted_import.deleted);

        let invalid = bridge
            .call_json(
                "load_project",
                serde_json::json!({ "projectId": "../escape" }),
                Duration::from_secs(10),
            )
            .expect_err("traversal projectId rejected");
        assert!(invalid.contains("INVALID_ID"), "got: {invalid}");

        bridge.shutdown();
    }
}
