pub mod doctor;
pub mod preview_server;
pub mod worker_bridge;

use preview_server::PreviewServer;
use std::ffi::OsStr;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use worker_bridge::{WorkerBridge, RENDER_PROGRESS_EVENT};

pub fn resolve_safe_reveal_target(workspace_root: &Path, raw_path: &str) -> Result<PathBuf, String> {
    if raw_path.is_empty() || raw_path.contains('\0') || raw_path.contains('\\') {
        return Err("Invalid path for workspace reveal".to_string());
    }
    let canon_ws = std::fs::canonicalize(workspace_root)
        .map_err(|err| format!("Workspace root is inaccessible: {err}"))?;

    let candidate_input = Path::new(raw_path);
    let candidate = if candidate_input.is_absolute() {
        candidate_input.to_path_buf()
    } else {
        for comp in candidate_input.components() {
            match comp {
                Component::Normal(part) => {
                    if part.to_string_lossy().starts_with('.') {
                        return Err("Hidden path segments cannot be revealed".to_string());
                    }
                }
                Component::CurDir => {}
                _ => {
                    return Err("Traversal path segments are not allowed".to_string());
                }
            }
        }
        canon_ws.join(candidate_input)
    };

    let canon_target = std::fs::canonicalize(&candidate)
        .map_err(|err| format!("Target path does not exist: {err}"))?;
    if !canon_target.starts_with(&canon_ws) {
        return Err("Target path escapes workspace root".to_string());
    }
    let rel = canon_target
        .strip_prefix(&canon_ws)
        .map_err(|_| "Workspace jail prefix mismatch".to_string())?;
    for comp in rel.components() {
        if let Component::Normal(part) = comp {
            if part.to_string_lossy().starts_with('.') {
                return Err("Hidden path segments cannot be revealed".to_string());
            }
        }
    }
    Ok(canon_target)
}

#[tauri::command]
fn reveal_in_workspace(
    state: tauri::State<'_, AppPaths>,
    path: String,
) -> Result<String, String> {
    let target = resolve_safe_reveal_target(&state.workspace_root, &path)?;
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg("-R")
            .arg(&target)
            .status()
            .map_err(|err| format!("Failed to launch Finder: {err}"))?;
        if !status.success() {
            return Err("Finder reveal command exited with error".to_string());
        }
    }
    #[cfg(target_os = "linux")]
    {
        let open_dir = if target.is_dir() {
            target.clone()
        } else {
            target
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| target.clone())
        };
        let status = Command::new("xdg-open")
            .arg(&open_dir)
            .status()
            .map_err(|err| format!("Failed to open file manager: {err}"))?;
        if !status.success() {
            return Err("xdg-open exited with error".to_string());
        }
    }
    #[cfg(target_os = "windows")]
    {
        let raw_win = target.to_string_lossy();
        let win_path = raw_win.strip_prefix(r"\\?\").unwrap_or(&raw_win);
        let mut cmd = Command::new("explorer");
        if target.is_file() {
            cmd.arg(format!("/select,{win_path}"));
        } else {
            cmd.arg(win_path);
        }
        let status = cmd
            .status()
            .map_err(|err| format!("Failed to open Explorer: {err}"))?;
        if !status.success() {
            return Err("Explorer exited with error".to_string());
        }
    }
    Ok(target.to_string_lossy().into_owned())
}

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub workspace_root: PathBuf,
}

pub fn looks_like_workspace_root(dir: &Path) -> bool {
    dir.join("animforge-core").is_dir() && dir.join("engines").join("givemotion").is_dir()
}

pub fn resolve_workspace_root_from(start_dirs: &[PathBuf]) -> Option<PathBuf> {
    for start in start_dirs {
        let mut cursor = Some(start.as_path());
        while let Some(dir) = cursor {
            if looks_like_workspace_root(dir) {
                return Some(dir.to_path_buf());
            }
            cursor = dir.parent();
        }
    }
    None
}

pub fn resolve_workspace_root_with(
    explicit: Option<&OsStr>,
    seeds: &[PathBuf],
) -> Result<PathBuf, String> {
    if let Some(raw) = explicit {
        if !raw.is_empty() {
            let candidate = PathBuf::from(raw);
            if looks_like_workspace_root(&candidate) {
                return Ok(candidate);
            }
            return Err(format!(
                "ANIMFORGE_WORKSPACE_DIR is not a valid AnimForgeLab root: {}",
                candidate.display()
            ));
        }
    }

    resolve_workspace_root_from(seeds)
        .ok_or_else(|| "Could not locate AnimForgeLab workspace root".to_string())
}

pub fn resolve_workspace_root() -> Result<PathBuf, String> {
    let explicit = std::env::var_os("ANIMFORGE_WORKSPACE_DIR");

    let mut seeds = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        seeds.push(cwd);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            seeds.push(parent.to_path_buf());
        }
    }
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    seeds.push(manifest_dir);

    resolve_workspace_root_with(explicit.as_deref(), &seeds)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let workspace_root =
        resolve_workspace_root().expect("AnimForgeLab workspace root must be resolvable");
    let worker_root = workspace_root.clone();
    let preview_root = workspace_root.clone();

    let app = tauri::Builder::default()
        .manage(AppPaths { workspace_root })
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let bridge = Arc::new(WorkerBridge::for_workspace(
                &worker_root,
                Arc::new(move |payload| {
                    let _ = app_handle.emit(RENDER_PROGRESS_EVENT, &payload);
                }),
            ));
            let preview_server = Arc::new(
                PreviewServer::start(&preview_root).map_err(std::io::Error::other)?,
            );
            app.manage(bridge);
            app.manage(preview_server);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            doctor::run_doctor,
            preview_server::get_preview_base_url,
            preview_server::probe_preview_server,
            reveal_in_workspace,
            worker_bridge::project_list,
            worker_bridge::project_create_from_prompt,
            worker_bridge::project_load,
            worker_bridge::project_save,
            worker_bridge::project_delete,
            worker_bridge::project_duplicate,
            worker_bridge::project_import,
            worker_bridge::project_list_render_jobs,
            worker_bridge::project_assets_list,
            worker_bridge::project_import_asset,
            worker_bridge::project_import_asset_bytes,
            worker_bridge::run_deterministic_agent,
            worker_bridge::config_get,
            worker_bridge::config_save,
            worker_bridge::project_preview,
            worker_bridge::project_render,
            worker_bridge::project_cancel_render,
        ])
        .build(tauri::generate_context!())
        .expect("error while building AnimForge Studio");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(bridge) = app_handle.try_state::<Arc<WorkerBridge>>() {
                bridge.shutdown();
            }
            if let Some(server) = app_handle.try_state::<Arc<PreviewServer>>() {
                server.shutdown();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempDirGuard(PathBuf);
    impl Drop for TempDirGuard {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn make_trailing_space_fixture(suffix: &str) -> (TempDirGuard, PathBuf, PathBuf) {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock ok")
            .as_nanos();
        let parent = std::env::temp_dir().join(format!("animforge_ws_{suffix}_{stamp} "));
        let root = parent.join("AnimForgeLab");
        let nested = root.join("animforge-desktop").join("src-tauri");

        fs::create_dir_all(root.join("animforge-core")).expect("create core");
        fs::create_dir_all(root.join("engines").join("givemotion")).expect("create givemotion");
        fs::create_dir_all(&nested).expect("create nested");

        (TempDirGuard(parent), root, nested)
    }

    #[test]
    fn resolves_workspace_root_with_trailing_space_parent() {
        let (_guard, root, nested) = make_trailing_space_fixture("walkup");
        let found = resolve_workspace_root_with(None, &[nested]).expect("workspace resolves");
        assert_eq!(found, root);
        assert!(found
            .parent()
            .expect("parent")
            .to_string_lossy()
            .ends_with(' '));
    }

    #[test]
    fn honors_and_validates_explicit_workspace_override() {
        let (_guard, root, _nested) = make_trailing_space_fixture("override");
        let ok = resolve_workspace_root_with(Some(root.as_os_str()), &[])
            .expect("explicit override should pass");
        assert_eq!(ok, root);

        let err = resolve_workspace_root_with(
            Some(OsStr::new("/nonexistent/animforge_invalid ")),
            &[],
        )
        .expect_err("invalid override must error");
        assert!(err.contains("ANIMFORGE_WORKSPACE_DIR"));
    }

    #[test]
    fn reveal_target_enforces_workspace_jail_and_trailing_space() {
        let (_guard, root, _nested) = make_trailing_space_fixture("reveal");
        let proj_dir = root.join("projects").join("proj_1");
        fs::create_dir_all(&proj_dir).expect("proj_dir");
        let asset_file = proj_dir.join("output.mp4");
        fs::write(&asset_file, b"mp4").expect("file");
        fs::write(root.join(".secret"), b"secret").expect("hidden");

        let ok = resolve_safe_reveal_target(&root, "projects/proj_1/output.mp4")
            .expect("relative inside workspace should pass");
        assert_eq!(ok, fs::canonicalize(&asset_file).unwrap());

        assert!(resolve_safe_reveal_target(&root, "../escape").is_err());
        assert!(resolve_safe_reveal_target(&root, ".secret").is_err());
        assert!(resolve_safe_reveal_target(&root, "/etc/passwd").is_err());

        #[cfg(unix)]
        {
            let outside_file = root.parent().expect("parent").join("outside.txt");
            fs::write(&outside_file, b"outside").expect("outside");
            let link_path = proj_dir.join("escape_link.txt");
            std::os::unix::fs::symlink(&outside_file, &link_path).expect("symlink");
            let link_err = resolve_safe_reveal_target(&root, "projects/proj_1/escape_link.txt")
                .expect_err("escaping symlink must be rejected");
            assert!(link_err.contains("escapes workspace root"));
        }
    }
}
