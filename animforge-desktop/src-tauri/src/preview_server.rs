use serde::Serialize;
use std::fs::{self, File};
use std::io::{ErrorKind, Read, Seek, SeekFrom, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crate::worker_bridge::validate_safe_id;

pub const MAX_URI_BYTES: usize = 2048;
pub const MAX_HEADER_BYTES: usize = 8192;
pub const MAX_CONCURRENT_REQUESTS: usize = 32;
const IO_CHUNK_BYTES: usize = 64 * 1024;
const READ_TIMEOUT: Duration = Duration::from_secs(5);
const WRITE_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AssetResolveError {
    BadRequest(String),
    UriTooLong,
    Forbidden(String),
    NotFound(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedAsset {
    pub path: PathBuf,
    pub content_type: &'static str,
}

struct ConnectionSlot {
    counter: Arc<AtomicUsize>,
}

impl ConnectionSlot {
    fn try_acquire(counter: &Arc<AtomicUsize>) -> Option<Self> {
        let mut cur = counter.load(Ordering::Acquire);
        loop {
            if cur >= MAX_CONCURRENT_REQUESTS {
                return None;
            }
            match counter.compare_exchange_weak(
                cur,
                cur + 1,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => {
                    return Some(Self {
                        counter: counter.clone(),
                    })
                }
                Err(actual) => cur = actual,
            }
        }
    }
}

impl Drop for ConnectionSlot {
    fn drop(&mut self) {
        self.counter.fetch_sub(1, Ordering::AcqRel);
    }
}

pub struct PreviewServer {
    port: u16,
    base_url: String,
    shutdown_flag: Arc<AtomicBool>,
    #[cfg_attr(not(test), allow(dead_code))]
    active_connections: Arc<AtomicUsize>,
    accept_thread: Mutex<Option<JoinHandle<()>>>,
}

pub fn mime_type_for_extension(ext: &str) -> Option<&'static str> {
    match ext.to_ascii_lowercase().as_str() {
        "html" | "htm" => Some("text/html; charset=utf-8"),
        "js" | "mjs" => Some("text/javascript; charset=utf-8"),
        "css" => Some("text/css; charset=utf-8"),
        "json" => Some("application/json; charset=utf-8"),
        "svg" => Some("image/svg+xml"),
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "avif" => Some("image/avif"),
        "ico" => Some("image/x-icon"),
        "woff" => Some("font/woff"),
        "woff2" => Some("font/woff2"),
        "ttf" => Some("font/ttf"),
        "otf" => Some("font/otf"),
        "mp4" | "m4v" => Some("video/mp4"),
        "webm" => Some("video/webm"),
        "mov" => Some("video/quicktime"),
        "mp3" => Some("audio/mpeg"),
        "wav" => Some("audio/wav"),
        "ogg" => Some("audio/ogg"),
        "m4a" => Some("audio/mp4"),
        "aac" => Some("audio/aac"),
        "flac" => Some("audio/flac"),
        "txt" | "srt" => Some("text/plain; charset=utf-8"),
        "vtt" => Some("text/vtt; charset=utf-8"),
        "lottie" => Some("application/zip"),
        "glb" => Some("model/gltf-binary"),
        "gltf" => Some("model/gltf+json"),
        "wasm" => Some("application/wasm"),
        _ => None,
    }
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn decode_request_path(raw_target: &str) -> Result<String, AssetResolveError> {
    if raw_target.is_empty() {
        return Err(AssetResolveError::BadRequest("Empty request target".to_string()));
    }
    if raw_target.len() > MAX_URI_BYTES {
        return Err(AssetResolveError::UriTooLong);
    }

    let path_only = raw_target.split(['?', '#']).next().unwrap_or("");
    if !path_only.starts_with('/') {
        return Err(AssetResolveError::BadRequest(
            "Request target must start with '/'".to_string(),
        ));
    }
    if path_only.bytes().any(|b| b == b'\\' || b < 0x20 || b == 0x7f) {
        return Err(AssetResolveError::Forbidden(
            "Disallowed characters in path".to_string(),
        ));
    }

    let bytes = path_only.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return Err(AssetResolveError::BadRequest(
                    "Incomplete percent-encoding in URI".to_string(),
                ));
            }
            let hi = hex_val(bytes[i + 1]).ok_or_else(|| {
                AssetResolveError::BadRequest("Invalid percent-encoding in URI".to_string())
            })?;
            let lo = hex_val(bytes[i + 2]).ok_or_else(|| {
                AssetResolveError::BadRequest("Invalid percent-encoding in URI".to_string())
            })?;
            let ch = (hi << 4) | lo;
            // Reject double-encoding (%25), NUL (%00), slash (%2f), backslash (%5c), or control bytes.
            if ch == b'%' || ch == b'\\' || ch == b'/' || ch < 0x20 || ch == 0x7f {
                return Err(AssetResolveError::Forbidden(
                    "Disallowed encoded character in path".to_string(),
                ));
            }
            decoded.push(ch);
            i += 3;
        } else {
            decoded.push(bytes[i]);
            i += 1;
        }
    }

    String::from_utf8(decoded)
        .map_err(|_| AssetResolveError::BadRequest("Path is not valid UTF-8".to_string()))
}

fn verify_no_hidden_after_jail(canon_jail: &Path, target: &Path) -> Result<(), AssetResolveError> {
    if !target.starts_with(canon_jail) || target == canon_jail {
        return Err(AssetResolveError::Forbidden(
            "Resolved path escapes workspace jail".to_string(),
        ));
    }
    let rel_after_jail = target
        .strip_prefix(canon_jail)
        .map_err(|_| AssetResolveError::Forbidden("Path jail prefix mismatch".to_string()))?;
    for comp in rel_after_jail.components() {
        match comp {
            Component::Normal(part) => {
                if part.to_string_lossy().starts_with('.') {
                    return Err(AssetResolveError::Forbidden(
                        "Hidden target file is not allowed".to_string(),
                    ));
                }
            }
            _ => {
                return Err(AssetResolveError::Forbidden(
                    "Invalid canonical path component".to_string(),
                ));
            }
        }
    }
    Ok(())
}

fn check_jail_root_segments(
    canon_ws: &Path,
    jail_segments: &[&str],
) -> Result<PathBuf, AssetResolveError> {
    let mut cursor = canon_ws.to_path_buf();
    for seg in jail_segments {
        cursor.push(seg);
        match fs::symlink_metadata(&cursor) {
            Ok(meta) => {
                if meta.file_type().is_symlink() {
                    return Err(AssetResolveError::Forbidden(
                        "Symlinked workspace root directory is not allowed".to_string(),
                    ));
                }
            }
            Err(err) if err.kind() == ErrorKind::NotFound => {
                return Err(AssetResolveError::NotFound(
                    "Asset root not found".to_string(),
                ));
            }
            Err(err) => {
                return Err(AssetResolveError::Forbidden(format!(
                    "Cannot access jail root: {err}"
                )));
            }
        }
    }

    let canon_jail = fs::canonicalize(&cursor).map_err(|err| {
        if err.kind() == ErrorKind::NotFound {
            AssetResolveError::NotFound("Asset root not found".to_string())
        } else {
            AssetResolveError::Forbidden(format!("Cannot resolve jail root: {err}"))
        }
    })?;
    if canon_jail != cursor {
        return Err(AssetResolveError::Forbidden(
            "Workspace root directory mismatch".to_string(),
        ));
    }
    Ok(canon_jail)
}

fn check_candidate_segments_in_jail(
    canon_jail: &Path,
    rel_segments: &[&str],
) -> Result<PathBuf, AssetResolveError> {
    let mut cursor = canon_jail.to_path_buf();
    for seg in rel_segments {
        cursor.push(seg);
        match fs::symlink_metadata(&cursor) {
            Ok(meta) => {
                if meta.file_type().is_symlink() {
                    // Resolve symlinks eagerly per segment so escaping directory symlinks never act as a 404 oracle.
                    let resolved = fs::canonicalize(&cursor).map_err(|_| {
                        AssetResolveError::Forbidden("Dangling symlink is not allowed".to_string())
                    })?;
                    verify_no_hidden_after_jail(canon_jail, &resolved)?;
                }
            }
            Err(err) if err.kind() == ErrorKind::NotFound => {
                return Err(AssetResolveError::NotFound("Asset not found".to_string()));
            }
            Err(err) => {
                return Err(AssetResolveError::Forbidden(format!(
                    "Cannot access requested asset: {err}"
                )));
            }
        }
    }

    let canon_target = fs::canonicalize(&cursor).map_err(|err| {
        if err.kind() == ErrorKind::NotFound {
            AssetResolveError::NotFound("Asset not found".to_string())
        } else {
            AssetResolveError::Forbidden(format!("Cannot access requested asset: {err}"))
        }
    })?;
    verify_no_hidden_after_jail(canon_jail, &canon_target)?;
    Ok(canon_target)
}

pub fn resolve_safe_asset(
    workspace_root: &Path,
    request_target: &str,
) -> Result<ResolvedAsset, AssetResolveError> {
    let decoded = decode_request_path(request_target)?;
    let trimmed_leading = decoded.strip_prefix('/').unwrap_or(&decoded);
    if trimmed_leading.is_empty() {
        return Err(AssetResolveError::Forbidden(
            "Directory listing is not allowed".to_string(),
        ));
    }

    let segments: Vec<&str> = trimmed_leading.split('/').collect();
    if segments
        .iter()
        .any(|s| s.is_empty() || *s == "." || *s == ".." || s.starts_with('.'))
    {
        return Err(AssetResolveError::Forbidden(
            "Traversal, empty, or hidden path segment is not allowed".to_string(),
        ));
    }

    let (jail_segments, rel_segments): (Vec<&str>, &[&str]) = match segments.as_slice() {
        ["projects", project_id, rest @ ..] if !rest.is_empty() => {
            validate_safe_id(project_id, "project").map_err(AssetResolveError::Forbidden)?;
            (vec!["projects", project_id], rest)
        }
        ["assets", rest @ ..] if !rest.is_empty() => (vec!["assets"], rest),
        _ => {
            return Err(AssetResolveError::Forbidden(
                "Path is outside allowed workspace directories".to_string(),
            ));
        }
    };

    let requested_ext = Path::new(rel_segments[rel_segments.len() - 1])
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let requested_mime = mime_type_for_extension(requested_ext)
        .ok_or_else(|| AssetResolveError::Forbidden("Unsupported file type".to_string()))?;

    let canon_ws = fs::canonicalize(workspace_root)
        .map_err(|_| AssetResolveError::NotFound("Workspace root not found".to_string()))?;
    let canon_jail = check_jail_root_segments(&canon_ws, &jail_segments)?;
    let canon_target = check_candidate_segments_in_jail(&canon_jail, rel_segments)?;

    let meta = fs::metadata(&canon_target)
        .map_err(|err| AssetResolveError::Forbidden(format!("Stat failed: {err}")))?;
    if !meta.is_file() {
        return Err(AssetResolveError::Forbidden(
            "Directories cannot be served".to_string(),
        ));
    }

    let actual_ext = canon_target
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    if mime_type_for_extension(actual_ext) != Some(requested_mime) {
        return Err(AssetResolveError::Forbidden(
            "Unsupported or mismatched file extension".to_string(),
        ));
    }

    Ok(ResolvedAsset {
        path: canon_target,
        content_type: requested_mime,
    })
}

impl PreviewServer {
    pub fn start(workspace_root: &Path) -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .map_err(|err| format!("Failed to bind preview server on 127.0.0.1:0: {err}"))?;
        let port = listener
            .local_addr()
            .map_err(|err| format!("Failed to read preview server port: {err}"))?
            .port();
        listener
            .set_nonblocking(true)
            .map_err(|err| format!("Failed to set preview listener non-blocking: {err}"))?;

        let root = workspace_root.to_path_buf();
        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let active_connections = Arc::new(AtomicUsize::new(0));

        let thread_shutdown = shutdown_flag.clone();
        let thread_connections = active_connections.clone();
        let accept_thread = thread::Builder::new()
            .name("animforge-preview-http".to_string())
            .spawn(move || loop {
                if thread_shutdown.load(Ordering::Acquire) {
                    break;
                }
                match listener.accept() {
                    Ok((mut stream, _addr)) => {
                        let Some(slot) = ConnectionSlot::try_acquire(&thread_connections) else {
                            let _ = stream.set_nonblocking(false);
                            let _ = stream.set_write_timeout(Some(Duration::from_millis(250)));
                            let _ = write_simple_error(
                                &mut stream,
                                503,
                                "Service Unavailable",
                                "Server busy",
                                &[("Retry-After", "1")],
                                true,
                            );
                            let _ = stream.shutdown(Shutdown::Both);
                            continue;
                        };
                        let req_root = root.clone();
                        let req_shutdown = thread_shutdown.clone();
                        let _ = thread::Builder::new()
                            .name("animforge-http-req".to_string())
                            .spawn(move || {
                                let _slot_guard = slot;
                                handle_client(&req_root, port, &req_shutdown, stream);
                            });
                    }
                    Err(err) if err.kind() == ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(15));
                    }
                    Err(err)
                        if matches!(
                            err.kind(),
                            ErrorKind::Interrupted
                                | ErrorKind::ConnectionAborted
                                | ErrorKind::ConnectionReset
                        ) =>
                    {
                        continue;
                    }
                    Err(_) => break,
                }
            })
            .map_err(|err| format!("Failed to spawn preview server thread: {err}"))?;

        Ok(Self {
            port,
            base_url: format!("http://127.0.0.1:{port}"),
            shutdown_flag,
            active_connections,
            accept_thread: Mutex::new(Some(accept_thread)),
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn base_url(&self) -> String {
        self.base_url.clone()
    }

    pub fn shutdown(&self) {
        self.shutdown_flag.store(true, Ordering::Release);
        if let Ok(mut guard) = self.accept_thread.lock() {
            if let Some(handle) = guard.take() {
                let _ = handle.join();
            }
        }
    }
}

impl Drop for PreviewServer {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PreviewServerProbeResult {
    pub reachable: bool,
    pub base_url: String,
    pub latency_ms: u64,
    pub status_code: Option<u16>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn get_preview_base_url(state: tauri::State<'_, Arc<PreviewServer>>) -> String {
    state.base_url()
}

pub fn probe_loopback_health(port: u16, base_url: &str) -> PreviewServerProbeResult {
    let started = Instant::now();
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_secs(2)) {
        Ok(s) => s,
        Err(err) => {
            return PreviewServerProbeResult {
                reachable: false,
                base_url: base_url.to_string(),
                latency_ms: started.elapsed().as_millis() as u64,
                status_code: None,
                error: Some(format!("Connection failed: {err}")),
            };
        }
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let req = format!(
        "GET /__health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if let Err(err) = stream.write_all(req.as_bytes()).and_then(|()| stream.flush()) {
        return PreviewServerProbeResult {
            reachable: false,
            base_url: base_url.to_string(),
            latency_ms: started.elapsed().as_millis() as u64,
            status_code: None,
            error: Some(format!("Write failed: {err}")),
        };
    }

    let mut resp_buf = [0u8; 512];
    let n = match stream.read(&mut resp_buf) {
        Ok(n) => n,
        Err(err) => {
            return PreviewServerProbeResult {
                reachable: false,
                base_url: base_url.to_string(),
                latency_ms: started.elapsed().as_millis() as u64,
                status_code: None,
                error: Some(format!("Read failed: {err}")),
            };
        }
    };

    let head = String::from_utf8_lossy(&resp_buf[..n]);
    let status_code = head
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|s| s.parse::<u16>().ok());
    let reachable = status_code == Some(200);
    PreviewServerProbeResult {
        reachable,
        base_url: base_url.to_string(),
        latency_ms: started.elapsed().as_millis() as u64,
        status_code,
        error: if reachable {
            None
        } else {
            Some(format!("Unexpected health status: {status_code:?}"))
        },
    }
}

#[tauri::command]
pub async fn probe_preview_server(
    state: tauri::State<'_, Arc<PreviewServer>>,
) -> Result<PreviewServerProbeResult, String> {
    let port = state.port();
    let base_url = state.base_url();
    tauri::async_runtime::spawn_blocking(move || probe_loopback_health(port, &base_url))
        .await
        .map_err(|err| format!("probe_preview_server task failed: {err}"))
}

fn find_earliest_header_end(buf: &[u8]) -> Option<usize> {
    let crlf = buf.windows(4).position(|w| w == b"\r\n\r\n");
    let lf = buf.windows(2).position(|w| w == b"\n\n");
    match (crlf, lf) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    }
}

fn write_oversized_header_or_uri_error(stream: &mut TcpStream, buf: &[u8]) {
    let include_body = !buf.starts_with(b"HEAD ");
    let first_line_end = buf.iter().position(|&b| b == b'\n').unwrap_or(buf.len());
    let first_line = &buf[..first_line_end];
    if let Some(sp1) = first_line.iter().position(|&b| b == b' ') {
        let after_method = &first_line[sp1 + 1..];
        let target_len = after_method
            .iter()
            .position(|&b| b == b' ' || b == b'\r')
            .unwrap_or(after_method.len());
        if target_len > MAX_URI_BYTES {
            let _ = write_simple_error(
                stream,
                414,
                "URI Too Long",
                "Request target exceeds 2048 bytes",
                &[],
                include_body,
            );
            return;
        }
    }
    let _ = write_simple_error(
        stream,
        431,
        "Request Header Fields Too Large",
        "Request headers exceed 8192 bytes",
        &[],
        include_body,
    );
}

fn is_http_tchar(b: u8) -> bool {
    matches!(
        b,
        b'!' | b'#'
            | b'$'
            | b'%'
            | b'&'
            | b'\''
            | b'*'
            | b'+'
            | b'-'
            | b'.'
            | b'^'
            | b'_'
            | b'`'
            | b'|'
            | b'~'
            | b'0'..=b'9'
            | b'A'..=b'Z'
            | b'a'..=b'z'
    )
}

fn is_loopback_host_header(raw_host: &str, expected_port: u16) -> bool {
    let host = raw_host.trim();
    let Some((name, port_str)) = host.split_once(':') else {
        return expected_port == 80
            && (host == "127.0.0.1" || host.eq_ignore_ascii_case("localhost"));
    };
    if port_str.is_empty()
        || port_str.starts_with('0')
        || !port_str.bytes().all(|b| b.is_ascii_digit())
    {
        return false;
    }
    if port_str.parse::<u16>().ok() != Some(expected_port) {
        return false;
    }
    name == "127.0.0.1" || name.eq_ignore_ascii_case("localhost")
}

fn is_allowed_origin(raw_origin: &str, expected_port: u16) -> bool {
    let origin = raw_origin.trim();
    origin == format!("http://127.0.0.1:{expected_port}")
        || origin == format!("http://localhost:{expected_port}")
        || origin == "tauri://localhost"
        || origin == "http://tauri.localhost"
        || origin == "https://tauri.localhost"
        || origin == "http://localhost:1420"
        || origin == "http://127.0.0.1:1420"
}

#[derive(Debug)]
struct ParsedRange {
    start: u64,
    end: u64,
}

enum RangeParseResult {
    Valid(ParsedRange),
    Unsatisfiable,
    Ignore,
}

fn parse_single_byte_range(header_val: &str, file_size: u64) -> RangeParseResult {
    let trimmed = header_val.trim();
    if !trimmed
        .as_bytes()
        .get(..6)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case(b"bytes="))
    {
        return RangeParseResult::Ignore;
    }
    let spec = &trimmed[6..];
    if spec.contains(',') {
        return RangeParseResult::Ignore;
    }
    let Some((raw_start, raw_end)) = spec.split_once('-') else {
        return RangeParseResult::Unsatisfiable;
    };
    let raw_start = raw_start.trim();
    let raw_end = raw_end.trim();

    if file_size == 0 {
        return RangeParseResult::Unsatisfiable;
    }

    if raw_start.is_empty() {
        if raw_end.is_empty() || !raw_end.bytes().all(|b| b.is_ascii_digit()) {
            return RangeParseResult::Unsatisfiable;
        }
        let Ok(suffix) = raw_end.parse::<u64>() else {
            return RangeParseResult::Unsatisfiable;
        };
        if suffix == 0 {
            return RangeParseResult::Unsatisfiable;
        }
        let start = file_size.saturating_sub(suffix);
        return RangeParseResult::Valid(ParsedRange {
            start,
            end: file_size - 1,
        });
    }

    if !raw_start.bytes().all(|b| b.is_ascii_digit()) {
        return RangeParseResult::Unsatisfiable;
    }
    let Ok(start) = raw_start.parse::<u64>() else {
        return RangeParseResult::Unsatisfiable;
    };
    if start >= file_size {
        return RangeParseResult::Unsatisfiable;
    }

    let end = if raw_end.is_empty() {
        file_size - 1
    } else {
        if !raw_end.bytes().all(|b| b.is_ascii_digit()) {
            return RangeParseResult::Unsatisfiable;
        }
        let Ok(parsed_end) = raw_end.parse::<u64>() else {
            return RangeParseResult::Unsatisfiable;
        };
        if parsed_end < start {
            return RangeParseResult::Unsatisfiable;
        }
        parsed_end.min(file_size - 1)
    };

    RangeParseResult::Valid(ParsedRange { start, end })
}

fn write_simple_error(
    stream: &mut TcpStream,
    code: u16,
    reason: &str,
    body: &str,
    extra_headers: &[(&str, &str)],
    include_body: bool,
) -> std::io::Result<()> {
    let mut head = format!(
        "HTTP/1.1 {code} {reason}\r\n\
         Content-Type: text/plain; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         X-Content-Type-Options: nosniff\r\n\
         Cache-Control: no-store\r\n\
         Connection: close\r\n",
        body.len()
    );
    for (k, v) in extra_headers {
        head.push_str(&format!("{k}: {v}\r\n"));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())?;
    if include_body && !body.is_empty() {
        stream.write_all(body.as_bytes())?;
    }
    stream.flush()
}

fn handle_client(
    workspace_root: &Path,
    expected_port: u16,
    shutdown_flag: &AtomicBool,
    mut stream: TcpStream,
) {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_write_timeout(Some(WRITE_TIMEOUT));

    let header_deadline = Instant::now() + READ_TIMEOUT;
    let mut buf = Vec::with_capacity(1024);
    let mut chunk = [0u8; 2048];
    let header_end = loop {
        let now = Instant::now();
        if now >= header_deadline {
            let _ = write_simple_error(
                &mut stream,
                408,
                "Request Timeout",
                "Timed out reading request headers",
                &[],
                !buf.starts_with(b"HEAD "),
            );
            let _ = stream.shutdown(Shutdown::Both);
            return;
        }
        let _ = stream.set_read_timeout(Some(header_deadline.saturating_duration_since(now)));

        match stream.read(&mut chunk) {
            Ok(0) => {
                let _ = stream.shutdown(Shutdown::Both);
                return;
            }
            Ok(n) => {
                let take = n.min(MAX_HEADER_BYTES.saturating_sub(buf.len()) + 1);
                buf.extend_from_slice(&chunk[..take]);
                if let Some(pos) = find_earliest_header_end(&buf) {
                    if pos > MAX_HEADER_BYTES {
                        write_oversized_header_or_uri_error(&mut stream, &buf);
                        let _ = stream.shutdown(Shutdown::Both);
                        return;
                    }
                    break pos;
                }
                if buf.len() > MAX_HEADER_BYTES {
                    write_oversized_header_or_uri_error(&mut stream, &buf);
                    let _ = stream.shutdown(Shutdown::Both);
                    return;
                }
            }
            Err(err) if err.kind() == ErrorKind::Interrupted => continue,
            Err(err) if matches!(err.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {
                let _ = write_simple_error(
                    &mut stream,
                    408,
                    "Request Timeout",
                    "Timed out reading request headers",
                    &[],
                    !buf.starts_with(b"HEAD "),
                );
                let _ = stream.shutdown(Shutdown::Both);
                return;
            }
            Err(_) => {
                let _ = stream.shutdown(Shutdown::Both);
                return;
            }
        }
    };

    let include_body_guess = !buf.starts_with(b"HEAD ");
    let Ok(header_text) = std::str::from_utf8(&buf[..header_end]) else {
        let _ = write_simple_error(
            &mut stream,
            400,
            "Bad Request",
            "Non-UTF-8 request headers",
            &[],
            include_body_guess,
        );
        let _ = stream.shutdown(Shutdown::Both);
        return;
    };

    let mut lines = header_text.split('\n').map(|l| l.trim_end_matches('\r'));
    let Some(request_line) = lines.next() else {
        let _ = write_simple_error(
            &mut stream,
            400,
            "Bad Request",
            "Empty request line",
            &[],
            include_body_guess,
        );
        let _ = stream.shutdown(Shutdown::Both);
        return;
    };

    let parts: Vec<&str> = request_line.split(' ').collect();
    if parts.len() != 3
        || parts
            .iter()
            .any(|p| p.is_empty() || p.bytes().any(|b| b.is_ascii_whitespace()))
    {
        let _ = write_simple_error(
            &mut stream,
            400,
            "Bad Request",
            "Malformed request line",
            &[],
            include_body_guess,
        );
        let _ = stream.shutdown(Shutdown::Both);
        return;
    }

    let (method, target, version) = (parts[0], parts[1], parts[2]);
    let include_body = method != "HEAD";
    if version != "HTTP/1.1" && version != "HTTP/1.0" {
        let _ = write_simple_error(
            &mut stream,
            400,
            "Bad Request",
            "Unsupported HTTP version",
            &[],
            include_body,
        );
        let _ = stream.shutdown(Shutdown::Both);
        return;
    }

    if target.len() > MAX_URI_BYTES {
        let _ = write_simple_error(
            &mut stream,
            414,
            "URI Too Long",
            "Request target exceeds 2048 bytes",
            &[],
            include_body,
        );
        let _ = stream.shutdown(Shutdown::Both);
        return;
    }

    let mut host_values = Vec::new();
    let mut origin_values = Vec::new();
    let mut content_length_count = 0usize;
    let mut range_header: Option<&str> = None;

    for line in lines {
        if line.is_empty() {
            let _ = write_simple_error(
                &mut stream,
                400,
                "Bad Request",
                "Unexpected empty line in headers",
                &[],
                include_body,
            );
            let _ = stream.shutdown(Shutdown::Both);
            return;
        }
        let Some((name, val)) = line.split_once(':') else {
            let _ = write_simple_error(
                &mut stream,
                400,
                "Bad Request",
                "Malformed HTTP header",
                &[],
                include_body,
            );
            let _ = stream.shutdown(Shutdown::Both);
            return;
        };
        if name.is_empty() || !name.bytes().all(is_http_tchar) {
            let _ = write_simple_error(
                &mut stream,
                400,
                "Bad Request",
                "Invalid HTTP header name",
                &[],
                include_body,
            );
            let _ = stream.shutdown(Shutdown::Both);
            return;
        }

        let trimmed_val = val.trim();
        if name.eq_ignore_ascii_case("host") {
            host_values.push(trimmed_val);
        } else if name.eq_ignore_ascii_case("origin") {
            origin_values.push(trimmed_val);
        } else if name.eq_ignore_ascii_case("transfer-encoding") {
            let _ = write_simple_error(
                &mut stream,
                400,
                "Bad Request",
                "Transfer-Encoding is not supported",
                &[],
                include_body,
            );
            let _ = stream.shutdown(Shutdown::Both);
            return;
        } else if name.eq_ignore_ascii_case("content-length") {
            content_length_count += 1;
            if content_length_count > 1
                || trimmed_val.is_empty()
                || !trimmed_val.bytes().all(|b| b.is_ascii_digit())
                || trimmed_val.parse::<u64>().ok() != Some(0)
            {
                let _ = write_simple_error(
                    &mut stream,
                    400,
                    "Bad Request",
                    "Non-zero or invalid Content-Length is not supported",
                    &[],
                    include_body,
                );
                let _ = stream.shutdown(Shutdown::Both);
                return;
            }
        } else if name.eq_ignore_ascii_case("range") && range_header.is_none() {
            range_header = Some(trimmed_val);
        }
    }

    if host_values.len() != 1 {
        let _ = write_simple_error(
            &mut stream,
            400,
            "Bad Request",
            "Request must contain a single Host header",
            &[],
            include_body,
        );
        let _ = stream.shutdown(Shutdown::Both);
        return;
    }

    if !is_loopback_host_header(host_values[0], expected_port) {
        let _ = write_simple_error(
            &mut stream,
            403,
            "Forbidden",
            "Only loopback Host headers are allowed",
            &[],
            include_body,
        );
        let _ = stream.shutdown(Shutdown::Both);
        return;
    }

    if origin_values.len() > 1
        || origin_values
            .first()
            .is_some_and(|origin| !is_allowed_origin(origin, expected_port))
    {
        let _ = write_simple_error(
            &mut stream,
            403,
            "Forbidden",
            "Origin is not allowed",
            &[],
            include_body,
        );
        let _ = stream.shutdown(Shutdown::Both);
        return;
    }

    if method != "GET" && method != "HEAD" {
        let _ = write_simple_error(
            &mut stream,
            405,
            "Method Not Allowed",
            "Only GET and HEAD are supported",
            &[("Allow", "GET, HEAD")],
            include_body,
        );
        let _ = stream.shutdown(Shutdown::Both);
        return;
    }

    if target == "/__health" || target.starts_with("/__health?") {
        let body = b"{\"ok\":true}";
        let head = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: application/json; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             X-Content-Type-Options: nosniff\r\n\
             Cache-Control: no-store\r\n\
             Connection: close\r\n\r\n",
            body.len()
        );
        let _ = stream.write_all(head.as_bytes());
        if include_body {
            let _ = stream.write_all(body);
        }
        let _ = stream.flush();
        let _ = stream.shutdown(Shutdown::Both);
        return;
    }

    let asset = match resolve_safe_asset(workspace_root, target) {
        Ok(asset) => asset,
        Err(AssetResolveError::BadRequest(msg)) => {
            let _ = write_simple_error(&mut stream, 400, "Bad Request", &msg, &[], include_body);
            let _ = stream.shutdown(Shutdown::Both);
            return;
        }
        Err(AssetResolveError::UriTooLong) => {
            let _ = write_simple_error(
                &mut stream,
                414,
                "URI Too Long",
                "URI too long",
                &[],
                include_body,
            );
            let _ = stream.shutdown(Shutdown::Both);
            return;
        }
        Err(AssetResolveError::Forbidden(msg)) => {
            let _ = write_simple_error(&mut stream, 403, "Forbidden", &msg, &[], include_body);
            let _ = stream.shutdown(Shutdown::Both);
            return;
        }
        Err(AssetResolveError::NotFound(msg)) => {
            let _ = write_simple_error(&mut stream, 404, "Not Found", &msg, &[], include_body);
            let _ = stream.shutdown(Shutdown::Both);
            return;
        }
    };

    let Ok(mut file) = File::open(&asset.path) else {
        let _ = write_simple_error(
            &mut stream,
            404,
            "Not Found",
            "Asset disappeared",
            &[],
            include_body,
        );
        let _ = stream.shutdown(Shutdown::Both);
        return;
    };
    let Ok(open_meta) = file.metadata() else {
        let _ = write_simple_error(
            &mut stream,
            403,
            "Forbidden",
            "Asset stat failed",
            &[],
            include_body,
        );
        let _ = stream.shutdown(Shutdown::Both);
        return;
    };
    if !open_meta.is_file() {
        let _ = write_simple_error(
            &mut stream,
            403,
            "Forbidden",
            "Directories cannot be served",
            &[],
            include_body,
        );
        let _ = stream.shutdown(Shutdown::Both);
        return;
    }
    let file_size = open_meta.len();

    let (status_line, start, length, content_range_hdr) = match range_header
        .map(|raw| parse_single_byte_range(raw, file_size))
    {
        Some(RangeParseResult::Unsatisfiable) => {
            let hdr = format!("bytes */{file_size}");
            let _ = write_simple_error(
                &mut stream,
                416,
                "Range Not Satisfiable",
                "",
                &[("Content-Range", hdr.as_str())],
                false,
            );
            let _ = stream.shutdown(Shutdown::Both);
            return;
        }
        Some(RangeParseResult::Valid(range)) => {
            let len = range.end - range.start + 1;
            let cr = format!("bytes {}-{}/{}", range.start, range.end, file_size);
            ("HTTP/1.1 206 Partial Content", range.start, len, Some(cr))
        }
        None | Some(RangeParseResult::Ignore) => ("HTTP/1.1 200 OK", 0, file_size, None),
    };

    let mut head = format!(
        "{status_line}\r\n\
         Content-Type: {}\r\n\
         Content-Length: {length}\r\n\
         Accept-Ranges: bytes\r\n\
         X-Content-Type-Options: nosniff\r\n\
         Cache-Control: no-store\r\n\
         Connection: close\r\n",
        asset.content_type
    );
    if asset.content_type == "text/html; charset=utf-8" {
        head.push_str(
            "Content-Security-Policy: frame-ancestors 'self' tauri://localhost http://tauri.localhost https://tauri.localhost http://localhost:1420 http://127.0.0.1:1420\r\n",
        );
    }
    if let Some(cr) = content_range_hdr {
        head.push_str(&format!("Content-Range: {cr}\r\n"));
    }
    head.push_str("\r\n");

    if stream.write_all(head.as_bytes()).is_err() {
        let _ = stream.shutdown(Shutdown::Both);
        return;
    }

    if include_body && length > 0 && file.seek(SeekFrom::Start(start)).is_ok() {
        let mut remaining = length;
        let mut io_buf = [0u8; IO_CHUNK_BYTES];
        while remaining > 0 && !shutdown_flag.load(Ordering::Acquire) {
            let to_read = (remaining as usize).min(io_buf.len());
            match file.read(&mut io_buf[..to_read]) {
                Ok(0) => break,
                Ok(n) => {
                    if stream.write_all(&io_buf[..n]).is_err() {
                        break;
                    }
                    remaining -= n as u64;
                }
                Err(err) if err.kind() == ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }
    }

    let _ = stream.flush();
    let _ = stream.shutdown(Shutdown::Both);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::net::{SocketAddr, TcpStream};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempDirGuard(PathBuf);
    impl Drop for TempDirGuard {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn make_trailing_space_workspace(prefix: &str) -> (TempDirGuard, PathBuf) {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock ok")
            .as_nanos();
        let parent = std::env::temp_dir().join(format!("animforge_ps_{prefix}_{stamp} "));
        let ws = parent.join("AnimForgeLab");
        fs::create_dir_all(ws.join("projects").join("p1").join("bundle")).expect("bundle dir");
        fs::create_dir_all(ws.join("assets").join("characters")).expect("assets dir");
        fs::create_dir_all(ws.join("engines").join("givemotion")).expect("engines dir");
        (TempDirGuard(parent), ws)
    }

    fn send_raw_http(port: u16, raw: &[u8]) -> (u16, String, Vec<u8>) {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        let mut stream =
            TcpStream::connect_timeout(&addr, Duration::from_secs(2)).expect("connect loopback");
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .expect("read timeout");
        stream.write_all(raw).expect("write request");
        stream.flush().expect("flush");

        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).expect("read response");

        let header_end = buf
            .windows(4)
            .position(|w| w == b"\r\n\r\n")
            .expect("HTTP header separator");
        let head = String::from_utf8_lossy(&buf[..header_end]).to_string();
        let body = buf[header_end + 4..].to_vec();
        let status = head
            .lines()
            .next()
            .and_then(|l| l.split_whitespace().nth(1))
            .and_then(|s| s.parse::<u16>().ok())
            .expect("HTTP status code");
        (status, head, body)
    }

    #[test]
    fn resolves_approved_bundle_video_and_assets_preserving_trailing_space() {
        let (_guard, ws) = make_trailing_space_workspace("resolve");
        assert!(ws
            .parent()
            .expect("parent")
            .to_string_lossy()
            .ends_with(' '));

        fs::write(
            ws.join("projects/p1/bundle/index.html"),
            "<!doctype html><html></html>",
        )
        .unwrap();
        fs::write(ws.join("projects/p1/bundle/gm-player.js"), "// player").unwrap();
        fs::write(ws.join("projects/p1/output.mp4"), b"0123456789").unwrap();
        fs::write(ws.join("assets/characters/pip.svg"), "<svg/>").unwrap();

        let html = resolve_safe_asset(&ws, "/projects/p1/bundle/index.html?v=4#gm").unwrap();
        assert_eq!(html.content_type, "text/html; charset=utf-8");

        let js = resolve_safe_asset(&ws, "/projects/p1/bundle/gm-player.js").unwrap();
        assert_eq!(js.content_type, "text/javascript; charset=utf-8");

        let mp4 = resolve_safe_asset(&ws, "/projects/p1/output.mp4").unwrap();
        assert_eq!(mp4.content_type, "video/mp4");

        let svg = resolve_safe_asset(&ws, "/assets/characters/pip.svg").unwrap();
        assert_eq!(svg.content_type, "image/svg+xml");
    }

    #[test]
    fn rejects_traversal_hidden_files_disallowed_roots_extensions_and_dirs() {
        let (_guard, ws) = make_trailing_space_workspace("reject");
        fs::write(ws.join(".env"), "SECRET=1").unwrap();
        fs::write(ws.join("engines/givemotion/package.json"), "{}").unwrap();
        fs::write(ws.join("projects/animforge.db"), "sqlite").unwrap();
        fs::write(ws.join("projects/p1/.env"), "SECRET=2").unwrap();
        fs::write(ws.join("projects/p1/evil.db"), "sqlite").unwrap();
        fs::write(ws.join("assets/.DS_Store"), "mac").unwrap();
        fs::create_dir_all(ws.join("projects/.hidden")).unwrap();
        fs::write(ws.join("projects/.hidden/a.html"), "<html/>").unwrap();

        for bad in [
            "/",
            "/engines/givemotion/package.json",
            "/../.env",
            "/projects/p1/%2e%2e/%2e%2e/.env",
            "/projects/p1/%252e%252e/x.html",
            "/projects/p1/%2f..%2f.env",
            "/projects/p1/a%5cb.html",
            "/projects/p1/file%00.html",
            "/projects/p1\\evil.html",
            "/projects/.hidden/a.html",
            "/projects/p1/.env",
            "/projects/p1/evil.db",
            "/projects/animforge.db",
            "/assets/.DS_Store",
            "/projects/p1/bundle",
        ] {
            assert!(
                matches!(resolve_safe_asset(&ws, bad), Err(AssetResolveError::Forbidden(_))),
                "expected Forbidden for {bad}"
            );
        }

        assert!(matches!(
            resolve_safe_asset(&ws, "/projects/p1/bundle/missing.html"),
            Err(AssetResolveError::NotFound(_))
        ));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escaping_project_or_assets_jail() {
        use std::os::unix::fs::symlink;

        let (_guard, ws) = make_trailing_space_workspace("symlink");
        fs::create_dir_all(ws.join("projects/p2")).unwrap();
        let outside_file = ws.join("projects/p2/secret.html");
        fs::write(&outside_file, "<p>other project</p>").unwrap();

        symlink(&outside_file, ws.join("projects/p1/escape.html")).expect("create file symlink");
        assert!(matches!(
            resolve_safe_asset(&ws, "/projects/p1/escape.html"),
            Err(AssetResolveError::Forbidden(_))
        ));

        let outside_dir = ws.join("projects/p2/nested");
        fs::create_dir_all(&outside_dir).unwrap();
        fs::write(outside_dir.join("index.html"), "<p>nested</p>").unwrap();
        symlink(&outside_dir, ws.join("projects/p1/dir_escape")).expect("create dir symlink");
        assert!(matches!(
            resolve_safe_asset(&ws, "/projects/p1/dir_escape/index.html"),
            Err(AssetResolveError::Forbidden(_))
        ));
        // Even a non-existent leaf behind an escaping dir symlink must return Forbidden (no 404 oracle).
        assert!(matches!(
            resolve_safe_asset(&ws, "/projects/p1/dir_escape/nonexistent.html"),
            Err(AssetResolveError::Forbidden(_))
        ));

        fs::write(ws.join("projects/p1/real.db"), "sqlite").unwrap();
        symlink(
            ws.join("projects/p1/real.db"),
            ws.join("projects/p1/innocent.html"),
        )
        .expect("create spoof symlink");
        assert!(matches!(
            resolve_safe_asset(&ws, "/projects/p1/innocent.html"),
            Err(AssetResolveError::Forbidden(_))
        ));

        fs::create_dir_all(ws.join("projects/p1/.secret")).unwrap();
        fs::write(ws.join("projects/p1/.secret/leak.html"), "<p>hidden</p>").unwrap();
        symlink(
            ws.join("projects/p1/.secret/leak.html"),
            ws.join("projects/p1/hidden_link.html"),
        )
        .expect("create hidden-target symlink");
        assert!(matches!(
            resolve_safe_asset(&ws, "/projects/p1/hidden_link.html"),
            Err(AssetResolveError::Forbidden(_))
        ));

        symlink("/nonexistent/outside/secret.html", ws.join("projects/p1/dangling.html"))
            .expect("create dangling symlink");
        assert!(matches!(
            resolve_safe_asset(&ws, "/projects/p1/dangling.html"),
            Err(AssetResolveError::Forbidden(_))
        ));

        // Symlinked jail roots (projects/sym_proj or assets -> outside) must be rejected.
        symlink(&outside_dir, ws.join("projects/sym_proj")).expect("create project root symlink");
        assert!(matches!(
            resolve_safe_asset(&ws, "/projects/sym_proj/index.html"),
            Err(AssetResolveError::Forbidden(_))
        ));
        fs::remove_dir_all(ws.join("assets")).unwrap();
        symlink(&outside_dir, ws.join("assets")).expect("create assets root symlink");
        assert!(matches!(
            resolve_safe_asset(&ws, "/assets/index.html"),
            Err(AssetResolveError::Forbidden(_))
        ));
    }

    #[test]
    fn enforces_connection_slot_cap_and_range_edge_cases() {
        let counter = Arc::new(AtomicUsize::new(0));
        let mut held = Vec::new();
        for _ in 0..MAX_CONCURRENT_REQUESTS {
            held.push(ConnectionSlot::try_acquire(&counter).expect("slot available"));
        }
        assert!(ConnectionSlot::try_acquire(&counter).is_none());
        held.pop();
        assert!(ConnectionSlot::try_acquire(&counter).is_some());

        match parse_single_byte_range("BYTES=-4", 10) {
            RangeParseResult::Valid(r) => assert_eq!((r.start, r.end), (6, 9)),
            _ => panic!("expected valid suffix range"),
        }
        match parse_single_byte_range("bytes=5-", 10) {
            RangeParseResult::Valid(r) => assert_eq!((r.start, r.end), (5, 9)),
            _ => panic!("expected valid open-ended range"),
        }
        assert!(matches!(
            parse_single_byte_range("bytes=+1-3", 10),
            RangeParseResult::Unsatisfiable
        ));
        assert!(matches!(
            parse_single_byte_range("bytes=7-3", 10),
            RangeParseResult::Unsatisfiable
        ));
        assert!(matches!(
            parse_single_byte_range("bytes=0-1", 0),
            RangeParseResult::Unsatisfiable
        ));
        assert!(matches!(
            parse_single_byte_range("bytesé", 10),
            RangeParseResult::Ignore
        ));
    }

    #[test]
    fn loopback_http_server_serves_assets_ranges_and_security_rejections() {
        let (_guard, ws) = make_trailing_space_workspace("http");
        fs::write(ws.join("projects/p1/bundle/index.html"), "<!doctype html><h1>ok</h1>").unwrap();
        fs::write(ws.join("projects/p1/bundle/gm-player.js"), "console.log('gm');").unwrap();
        fs::write(ws.join("projects/p1/output.mp4"), b"0123456789").unwrap();
        let big_payload = vec![b'x'; 150_000];
        fs::write(ws.join("projects/p1/large.bin.txt"), &big_payload).unwrap();

        let server = PreviewServer::start(&ws).expect("server starts on 127.0.0.1:0");
        let port = server.port();
        assert_ne!(port, 0);
        assert_eq!(server.base_url(), format!("http://127.0.0.1:{port}"));

        let probe = probe_loopback_health(port, &server.base_url());
        assert!(probe.reachable, "health probe must reach loopback server");
        assert_eq!(probe.status_code, Some(200));

        // 1. Authorized HTML sets frame-ancestors CSP; JS omits frame-ancestors; allowed Origins succeed.
        let req_html = format!(
            "GET /projects/p1/bundle/index.html HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: tauri://localhost\r\n\r\n"
        );
        let (status, head, body) = send_raw_http(port, req_html.as_bytes());
        assert_eq!(status, 200);
        assert!(head.contains("Content-Security-Policy: frame-ancestors 'self' tauri://localhost"));
        assert_eq!(body, b"<!doctype html><h1>ok</h1>");

        let req_js = format!(
            "GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: http://localhost:1420\r\n\r\n"
        );
        let (status, head, body) = send_raw_http(port, req_js.as_bytes());
        assert_eq!(status, 200);
        assert!(head.contains("text/javascript; charset=utf-8"));
        assert!(head.contains("X-Content-Type-Options: nosniff"));
        assert!(head.contains("Cache-Control: no-store"));
        assert!(!head.contains("frame-ancestors"));
        assert_eq!(body, b"console.log('gm');");

        // Multi-chunk (>64KB) streaming integrity
        let req_big = format!(
            "GET /projects/p1/large.bin.txt HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n"
        );
        let (status, _head, body) = send_raw_http(port, req_big.as_bytes());
        assert_eq!(status, 200);
        assert_eq!(body.len(), 150_000);

        // 2. HEAD output.mp4 + HEAD error writes 0 body bytes
        let req_head =
            format!("HEAD /projects/p1/output.mp4 HTTP/1.1\r\nHost: localhost:{port}\r\n\r\n");
        let (status, head, body) = send_raw_http(port, req_head.as_bytes());
        assert_eq!(status, 200);
        assert!(head.contains("Content-Length: 10"));
        assert!(head.contains("Accept-Ranges: bytes"));
        assert!(body.is_empty());

        let req_head_missing =
            format!("HEAD /projects/p1/missing.html HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n");
        let (status, _head, body) = send_raw_http(port, req_head_missing.as_bytes());
        assert_eq!(status, 404);
        assert!(body.is_empty());

        // 3. Partial Range GET + out-of-bounds Range
        let req_range = format!(
            "GET /projects/p1/output.mp4 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nRange: bytes=0-3\r\n\r\n"
        );
        let (status, head, body) = send_raw_http(port, req_range.as_bytes());
        assert_eq!(status, 206);
        assert!(head.contains("Content-Range: bytes 0-3/10"));
        assert!(head.contains("Content-Length: 4"));
        assert_eq!(body, b"0123");

        let req_bad_range = format!(
            "GET /projects/p1/output.mp4 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nRange: bytes=99-120\r\n\r\n"
        );
        let (status, head, _body) = send_raw_http(port, req_bad_range.as_bytes());
        assert_eq!(status, 416);
        assert!(head.contains("Content-Range: bytes */10"));

        // 4. Method, Host & Origin security rejections
        let req_post = format!(
            "POST /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n"
        );
        let (status, head, _body) = send_raw_http(port, req_post.as_bytes());
        assert_eq!(status, 405);
        assert!(head.contains("Allow: GET, HEAD"));

        for bad_req in [
            "GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: evil.example\r\n\r\n"
                .to_string(),
            "GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n".to_string(),
            "GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: 127.0.0.1:9999\r\n\r\n"
                .to_string(),
            format!("GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: 127.0.0.1:0{port}\r\n\r\n"),
            "GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: 127.0.0.1:+5\r\n\r\n"
                .to_string(),
            format!("GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: [::1]:{port}\r\n\r\n"),
            format!(
                "GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: https://evil.example\r\n\r\n"
            ),
            format!(
                "GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: tauri://localhost\r\nOrigin: tauri://localhost\r\n\r\n"
            ),
            format!(
                "GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: null\r\n\r\n"
            ),
        ] {
            let (status, _head, _body) = send_raw_http(port, bad_req.as_bytes());
            assert_eq!(status, 403, "expected 403 for {bad_req:?}");
        }

        // 5. Missing/duplicate Host, smuggling (CL/TE/\n\n) -> 400
        for bad_syntax in [
            "GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\n\r\n".to_string(),
            format!(
                "GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nHost: localhost:{port}\r\n\r\n"
            ),
            format!(
                "GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: 5\r\n\r\n"
            ),
            format!(
                "GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nTransfer-Encoding: chunked\r\n\r\n"
            ),
            format!(
                "GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nBad Header: x\r\n\r\n"
            ),
            // Early \n\n ends headers before bogus second Host line
            "GET /projects/p1/bundle/gm-player.js HTTP/1.1\n\nHost: 127.0.0.1:1\r\n\r\n"
                .to_string(),
        ] {
            let (status, _head, _body) = send_raw_http(port, bad_syntax.as_bytes());
            assert_eq!(status, 400, "expected 400 for {bad_syntax:?}");
        }

        // 6. Oversized URI (>2048) -> 414; Oversized headers (>8192) -> 431
        let long_uri = format!("/projects/p1/bundle/{}.html", "a".repeat(2100));
        let req_long_uri = format!("GET {long_uri} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n");
        let (status, _head, _body) = send_raw_http(port, req_long_uri.as_bytes());
        assert_eq!(status, 414);

        let big_hdr = format!(
            "GET /projects/p1/bundle/gm-player.js HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-Pad: {}\r\n\r\n",
            "x".repeat(9000)
        );
        let (status, _head, _body) = send_raw_http(port, big_hdr.as_bytes());
        assert_eq!(status, 431);

        // 7. Live 503 when MAX_CONCURRENT_REQUESTS slots are saturated
        let prev = server
            .active_connections
            .swap(MAX_CONCURRENT_REQUESTS, Ordering::AcqRel);
        let (status, head, _body) = send_raw_http(port, req_js.as_bytes());
        server.active_connections.store(prev, Ordering::Release);
        assert_eq!(status, 503);
        assert!(head.contains("Retry-After: 1"));

        // 8. Drop unbinds port cleanly without explicit shutdown()
        drop(server);
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        assert!(TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_err());
    }
}
