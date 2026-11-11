pub mod doctor;

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

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
    tauri::Builder::default()
        .manage(AppPaths { workspace_root })
        .invoke_handler(tauri::generate_handler![doctor::run_doctor])
        .run(tauri::generate_context!())
        .expect("error while running AnimForge Studio");
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
}
