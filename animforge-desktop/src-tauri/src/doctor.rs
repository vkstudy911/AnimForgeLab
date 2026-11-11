use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum CheckStatus {
    Pass,
    Warn,
    Fail,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DoctorCheckItem {
    pub id: String,
    pub label: String,
    pub status: CheckStatus,
    pub summary: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DoctorReport {
    pub overall: CheckStatus,
    pub workspace_root: String,
    pub checks: Vec<DoctorCheckItem>,
    pub checked_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Default)]
pub struct CmdOutput {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GiveMotionDoctorParsed {
    pub ok: bool,
    pub chrome_summary: Option<String>,
    pub ffmpeg_summary: Option<String>,
    pub encoder_summary: Option<String>,
    pub errors: Vec<String>,
}

fn first_line(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("")
        .to_string()
}

pub fn parse_givemotion_doctor(
    stdout: &str,
    stderr: &str,
    exit_success: bool,
) -> GiveMotionDoctorParsed {
    let mut chrome_summary: Option<String> = None;
    let mut ffmpeg_summary: Option<String> = None;
    let mut encoder_summary: Option<String> = None;
    let mut errors = Vec::new();

    for raw_line in stdout.lines() {
        let trimmed = raw_line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Some((key, rest)) = trimmed.split_once(char::is_whitespace) else {
            continue;
        };
        let value = rest.trim();
        let lower = value.to_ascii_lowercase();
        match key {
            "chrome" => {
                if !value.is_empty() && !lower.contains("not found") {
                    chrome_summary = Some(value.to_string());
                } else if !value.is_empty() {
                    errors.push(format!("Chrome: {value}"));
                }
            }
            "ffmpeg" => {
                if !value.is_empty() && !lower.contains("not found") {
                    ffmpeg_summary = Some(value.to_string());
                } else if !value.is_empty() {
                    errors.push(format!("FFmpeg: {value}"));
                }
            }
            "encoder" if !value.is_empty() => {
                encoder_summary = Some(value.to_string());
            }
            _ => {}
        }
    }

    if chrome_summary.is_none() && !errors.iter().any(|e| e.starts_with("Chrome")) {
        errors.push("Chrome binary not reported by GiveMotion doctor".to_string());
    }
    if ffmpeg_summary.is_none() && !errors.iter().any(|e| e.starts_with("FFmpeg")) {
        errors.push("FFmpeg binary not reported by GiveMotion doctor".to_string());
    }
    if !exit_success {
        let err_line = first_line(stderr);
        if !err_line.is_empty() {
            errors.push(err_line);
        } else if errors.is_empty() {
            errors.push("GiveMotion doctor exited with non-zero status".to_string());
        }
    }

    let ok = exit_success && chrome_summary.is_some() && ffmpeg_summary.is_some();
    GiveMotionDoctorParsed {
        ok,
        chrome_summary,
        ffmpeg_summary,
        encoder_summary,
        errors,
    }
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        (meta.permissions().mode() & 0o111) != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

pub fn search_path_dirs_with(path_var: Option<&OsStr>, home_var: Option<&OsStr>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let mut push_unique = |dir: PathBuf| {
        if !dir.as_os_str().is_empty() && !dirs.contains(&dir) {
            dirs.push(dir);
        }
    };

    if let Some(raw) = path_var {
        for dir in std::env::split_paths(raw) {
            push_unique(dir);
        }
    }

    if let Some(home) = home_var {
        if !home.is_empty() {
            push_unique(PathBuf::from(home).join(".cargo").join("bin"));
        }
    }
    push_unique(PathBuf::from("/opt/homebrew/bin"));
    push_unique(PathBuf::from("/usr/local/bin"));
    push_unique(PathBuf::from("/usr/bin"));
    dirs
}

pub fn search_path_dirs() -> Vec<PathBuf> {
    search_path_dirs_with(
        std::env::var_os("PATH").as_deref(),
        std::env::var_os("HOME").as_deref(),
    )
}

pub fn resolve_binary_in(name: &str, dirs: &[PathBuf]) -> PathBuf {
    for dir in dirs {
        if dir.as_os_str().is_empty() {
            continue;
        }
        let candidate = dir.join(name);
        if is_executable_file(&candidate) {
            return candidate;
        }
        #[cfg(windows)]
        {
            let exe_candidate = dir.join(format!("{name}.exe"));
            if is_executable_file(&exe_candidate) {
                return exe_candidate;
            }
        }
    }

    PathBuf::from(name)
}

pub fn resolve_binary(name: &str) -> PathBuf {
    resolve_binary_in(name, &search_path_dirs())
}

fn run_os_command_with_dirs(
    bin: &str,
    args: &[&OsStr],
    dirs: &[PathBuf],
) -> Result<CmdOutput, String> {
    let program = resolve_binary_in(bin, dirs);
    let mut cmd = Command::new(&program);
    cmd.args(args);
    if let Ok(joined) = std::env::join_paths(dirs) {
        cmd.env("PATH", joined);
    }
    let output = cmd.output().map_err(|err| format!("{bin}: {err}"))?;
    Ok(CmdOutput {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

fn run_os_command(bin: &str, args: &[&OsStr]) -> Result<CmdOutput, String> {
    run_os_command_with_dirs(bin, args, &search_path_dirs())
}

fn parse_node_major(version_str: &str) -> Option<u32> {
    version_str
        .trim()
        .strip_prefix('v')
        .unwrap_or(version_str.trim())
        .split('.')
        .next()?
        .parse()
        .ok()
}

pub fn collect_doctor_report_with<F>(workspace_root: &Path, run_cmd: &F) -> DoctorReport
where
    F: Fn(&str, &[&OsStr]) -> Result<CmdOutput, String>,
{
    let mut checks = Vec::with_capacity(8);

    // 1. OS & Architecture
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let os_status = if matches!(os, "macos" | "linux") {
        CheckStatus::Pass
    } else {
        CheckStatus::Warn
    };
    checks.push(DoctorCheckItem {
        id: "os".to_string(),
        label: "OS & Arch".to_string(),
        status: os_status,
        summary: format!("{os} ({arch})"),
        detail: Some(if os == "macos" {
            "WKWebView system target".to_string()
        } else {
            "WebKitGTK target".to_string()
        }),
    });

    // 2. Rust & Cargo
    let rustc_res = run_cmd("rustc", &[OsStr::new("--version")]);
    let cargo_res = run_cmd("cargo", &[OsStr::new("--version")]);
    let rust_check = match (rustc_res, cargo_res) {
        (Ok(r), Ok(c)) if r.success && c.success => DoctorCheckItem {
            id: "rust".to_string(),
            label: "Rust & Cargo".to_string(),
            status: CheckStatus::Pass,
            summary: format!("{} / {}", first_line(&r.stdout), first_line(&c.stdout)),
            detail: None,
        },
        (r, c) => {
            let summarize_fail = |res: Result<CmdOutput, String>| match res {
                Ok(o) => {
                    let msg = first_line(&o.stderr);
                    if msg.is_empty() {
                        first_line(&o.stdout)
                    } else {
                        msg
                    }
                }
                Err(e) => e,
            };
            DoctorCheckItem {
                id: "rust".to_string(),
                label: "Rust & Cargo".to_string(),
                status: CheckStatus::Fail,
                summary: "Rust toolchain unavailable".to_string(),
                detail: Some(format!(
                    "rustc={}; cargo={}",
                    summarize_fail(r),
                    summarize_fail(c)
                )),
            }
        }
    };
    checks.push(rust_check);

    // 3. Node.js & npm
    let node_res = run_cmd("node", &[OsStr::new("--version")]);
    let npm_res = run_cmd("npm", &[OsStr::new("--version")]);
    let node_check = match node_res {
        Ok(n) if n.success => {
            let ver = first_line(&n.stdout);
            let major = parse_node_major(&ver).unwrap_or(0);
            if major < 20 {
                DoctorCheckItem {
                    id: "node".to_string(),
                    label: "Node & npm".to_string(),
                    status: CheckStatus::Fail,
                    summary: format!("Node {ver} < v20 required"),
                    detail: Some("Upgrade to Node.js v20+ for GiveMotion & Vite".to_string()),
                }
            } else {
                match npm_res {
                    Ok(m) if m.success => DoctorCheckItem {
                        id: "node".to_string(),
                        label: "Node & npm".to_string(),
                        status: CheckStatus::Pass,
                        summary: format!("node {ver} / npm {}", first_line(&m.stdout)),
                        detail: None,
                    },
                    Ok(m) => DoctorCheckItem {
                        id: "node".to_string(),
                        label: "Node & npm".to_string(),
                        status: CheckStatus::Warn,
                        summary: format!("node {ver}; npm exited with error"),
                        detail: Some(first_line(&m.stderr)),
                    },
                    Err(err) => DoctorCheckItem {
                        id: "node".to_string(),
                        label: "Node & npm".to_string(),
                        status: CheckStatus::Warn,
                        summary: format!("node {ver}; npm unavailable"),
                        detail: Some(err),
                    },
                }
            }
        }
        Ok(n) => DoctorCheckItem {
            id: "node".to_string(),
            label: "Node & npm".to_string(),
            status: CheckStatus::Fail,
            summary: "Node.js exited with error".to_string(),
            detail: Some(first_line(&n.stderr)),
        },
        Err(err) => DoctorCheckItem {
            id: "node".to_string(),
            label: "Node & npm".to_string(),
            status: CheckStatus::Fail,
            summary: "Node.js not found".to_string(),
            detail: Some(err),
        },
    };
    checks.push(node_check);

    // 4. FFmpeg & ffprobe
    let ff_res = run_cmd("ffmpeg", &[OsStr::new("-version")]);
    let fp_res = run_cmd("ffprobe", &[OsStr::new("-version")]);
    let ffmpeg_check = match ff_res {
        Ok(f) if f.success => {
            let ff_line = first_line(&f.stdout);
            match fp_res {
                Ok(p) if p.success => DoctorCheckItem {
                    id: "ffmpeg".to_string(),
                    label: "FFmpeg & ffprobe".to_string(),
                    status: CheckStatus::Pass,
                    summary: ff_line,
                    detail: Some(first_line(&p.stdout)),
                },
                _ => DoctorCheckItem {
                    id: "ffmpeg".to_string(),
                    label: "FFmpeg & ffprobe".to_string(),
                    status: CheckStatus::Warn,
                    summary: format!("{ff_line} (ffprobe missing)"),
                    detail: Some("ffprobe probe inspection unavailable".to_string()),
                },
            }
        }
        Ok(f) => DoctorCheckItem {
            id: "ffmpeg".to_string(),
            label: "FFmpeg & ffprobe".to_string(),
            status: CheckStatus::Fail,
            summary: "FFmpeg exited with error".to_string(),
            detail: Some(first_line(&f.stderr)),
        },
        Err(err) => DoctorCheckItem {
            id: "ffmpeg".to_string(),
            label: "FFmpeg & ffprobe".to_string(),
            status: CheckStatus::Fail,
            summary: "FFmpeg not found".to_string(),
            detail: Some(err),
        },
    };
    checks.push(ffmpeg_check);

    // 5. GiveMotion
    let gm_cli = workspace_root
        .join("engines")
        .join("givemotion")
        .join("src")
        .join("cli.js");
    let gm_check = if !gm_cli.is_file() {
        DoctorCheckItem {
            id: "givemotion".to_string(),
            label: "GiveMotion".to_string(),
            status: CheckStatus::Fail,
            summary: "engines/givemotion/src/cli.js missing".to_string(),
            detail: None,
        }
    } else {
        match run_cmd("node", &[gm_cli.as_os_str(), OsStr::new("doctor")]) {
            Ok(out) => {
                let parsed = parse_givemotion_doctor(&out.stdout, &out.stderr, out.success);
                if parsed.ok {
                    DoctorCheckItem {
                        id: "givemotion".to_string(),
                        label: "GiveMotion".to_string(),
                        status: CheckStatus::Pass,
                        summary: parsed
                            .chrome_summary
                            .unwrap_or_else(|| "Chrome + FFmpeg ready".to_string()),
                        detail: parsed.encoder_summary,
                    }
                } else {
                    DoctorCheckItem {
                        id: "givemotion".to_string(),
                        label: "GiveMotion".to_string(),
                        status: CheckStatus::Fail,
                        summary: "GiveMotion Chrome/FFmpeg probe failed".to_string(),
                        detail: Some(parsed.errors.join("; ")),
                    }
                }
            }
            Err(err) => DoctorCheckItem {
                id: "givemotion".to_string(),
                label: "GiveMotion".to_string(),
                status: CheckStatus::Fail,
                summary: "Failed to run GiveMotion doctor".to_string(),
                detail: Some(err),
            },
        }
    };
    checks.push(gm_check);

    // 6. Remotion
    let remotion_cli_pkg = workspace_root
        .join("projects")
        .join("remotion-test")
        .join("node_modules")
        .join("@remotion")
        .join("cli")
        .join("package.json");
    let remotion_repo_pkg = workspace_root
        .join("engines")
        .join("remotion")
        .join("package.json");
    let remotion_check = if remotion_cli_pkg.is_file() {
        DoctorCheckItem {
            id: "remotion".to_string(),
            label: "Remotion".to_string(),
            status: CheckStatus::Pass,
            summary: "External CLI ready (projects/remotion-test)".to_string(),
            detail: Some(
                "Custom source-available license (>3 staff requires Company License)".to_string(),
            ),
        }
    } else if remotion_repo_pkg.is_file() {
        DoctorCheckItem {
            id: "remotion".to_string(),
            label: "Remotion".to_string(),
            status: CheckStatus::Warn,
            summary: "Upstream monorepo unbuilt; external CLI absent".to_string(),
            detail: Some("Custom source-available license; install project CLI if needed".to_string()),
        }
    } else {
        DoctorCheckItem {
            id: "remotion".to_string(),
            label: "Remotion".to_string(),
            status: CheckStatus::Fail,
            summary: "Remotion directory not found".to_string(),
            detail: None,
        }
    };
    checks.push(remotion_check);

    // 7. StretchyStudio
    let ss_dir = workspace_root.join("engines").join("stretchystudio");
    let ss_check = if !ss_dir.join("package.json").is_file() {
        DoctorCheckItem {
            id: "stretchystudio".to_string(),
            label: "StretchyStudio".to_string(),
            status: CheckStatus::Fail,
            summary: "engines/stretchystudio/package.json missing".to_string(),
            detail: None,
        }
    } else if ss_dir.join("dist").join("index.html").is_file() && ss_dir.join("node_modules").is_dir()
    {
        DoctorCheckItem {
            id: "stretchystudio".to_string(),
            label: "StretchyStudio".to_string(),
            status: CheckStatus::Pass,
            summary: "Built MIT React 18 + WebGL2 rig engine ready".to_string(),
            detail: None,
        }
    } else {
        DoctorCheckItem {
            id: "stretchystudio".to_string(),
            label: "StretchyStudio".to_string(),
            status: CheckStatus::Warn,
            summary: "Source present; npm dependencies or dist build missing".to_string(),
            detail: None,
        }
    };
    checks.push(ss_check);

    // 8. Workspace Directories (assets/ & projects/ & trailing-space preservation)
    let assets_ok = workspace_root.join("assets").is_dir();
    let projects_ok = workspace_root.join("projects").is_dir();
    let core_ok = workspace_root.join("animforge-core").is_dir();
    let ws_display = workspace_root.to_string_lossy().into_owned();
    let dir_check = if assets_ok && projects_ok && core_ok {
        DoctorCheckItem {
            id: "directories".to_string(),
            label: "Workspace Paths".to_string(),
            status: CheckStatus::Pass,
            summary: "assets/, projects/, animforge-core/ verified".to_string(),
            detail: Some(ws_display.clone()),
        }
    } else {
        let mut missing = Vec::new();
        if !assets_ok {
            missing.push("assets/");
        }
        if !projects_ok {
            missing.push("projects/");
        }
        if !core_ok {
            missing.push("animforge-core/");
        }
        DoctorCheckItem {
            id: "directories".to_string(),
            label: "Workspace Paths".to_string(),
            status: CheckStatus::Fail,
            summary: format!("Missing workspace dir(s): {}", missing.join(", ")),
            detail: Some(ws_display.clone()),
        }
    };
    checks.push(dir_check);

    let overall = if checks.iter().any(|c| c.status == CheckStatus::Fail) {
        CheckStatus::Fail
    } else if checks.iter().any(|c| c.status == CheckStatus::Warn) {
        CheckStatus::Warn
    } else {
        CheckStatus::Pass
    };

    let checked_at_epoch_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    DoctorReport {
        overall,
        workspace_root: ws_display,
        checks,
        checked_at_epoch_ms,
    }
}

pub fn collect_doctor_report(workspace_root: &Path) -> DoctorReport {
    collect_doctor_report_with(workspace_root, &run_os_command)
}

#[tauri::command]
pub async fn run_doctor(
    state: tauri::State<'_, crate::AppPaths>,
) -> Result<DoctorReport, String> {
    let root = state.workspace_root.clone();
    tauri::async_runtime::spawn_blocking(move || collect_doctor_report(&root))
        .await
        .map_err(|err| format!("Doctor task failed: {err}"))
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

    fn make_workspace_fixture(
        name: &str,
        with_remotion_cli: bool,
        with_stretchy_built: bool,
        with_assets_projects: bool,
    ) -> (TempDirGuard, PathBuf) {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock ok")
            .as_nanos();
        let parent = std::env::temp_dir().join(format!("animforge_doc_{name}_{stamp} "));
        let root = parent.join("AnimForgeLab");

        fs::create_dir_all(root.join("animforge-core")).expect("core dir");
        let gm_src = root.join("engines").join("givemotion").join("src");
        fs::create_dir_all(&gm_src).expect("gm dir");
        fs::write(gm_src.join("cli.js"), "// cli stub\n").expect("cli stub");

        let rem_dir = root.join("engines").join("remotion");
        fs::create_dir_all(&rem_dir).expect("remotion dir");
        fs::write(rem_dir.join("package.json"), "{}").expect("remotion pkg");
        if with_remotion_cli {
            let cli_pkg = root
                .join("projects")
                .join("remotion-test")
                .join("node_modules")
                .join("@remotion")
                .join("cli");
            fs::create_dir_all(&cli_pkg).expect("rem cli");
            fs::write(cli_pkg.join("package.json"), r#"{"version":"4.0.542"}"#).expect("pkg");
        }

        let ss_dir = root.join("engines").join("stretchystudio");
        fs::create_dir_all(&ss_dir).expect("ss dir");
        fs::write(ss_dir.join("package.json"), "{}").expect("ss pkg");
        if with_stretchy_built {
            fs::create_dir_all(ss_dir.join("node_modules")).expect("ss nm");
            fs::create_dir_all(ss_dir.join("dist")).expect("ss dist");
            fs::write(ss_dir.join("dist").join("index.html"), "<html></html>").expect("dist html");
        }

        if with_assets_projects {
            fs::create_dir_all(root.join("assets")).expect("assets");
            fs::create_dir_all(root.join("projects")).expect("projects");
        }

        (TempDirGuard(parent), root)
    }

    #[test]
    fn parses_givemotion_doctor_macos_and_missing_linux_chrome() {
        let mac_stdout = "\
node        v24.19.0
chrome      /Applications/Google Chrome.app/Contents/MacOS/Google Chrome 157.0.8103.38
ffmpeg      9.0.1  encoders: libx264, h264_videotoolbox
encoder     software (x264): VideoToolbox did not encode the same bytes twice here
";
        let ok = parse_givemotion_doctor(mac_stdout, "", true);
        assert!(ok.ok);
        assert!(ok.chrome_summary.as_deref().unwrap_or("").contains("157"));
        assert!(ok.ffmpeg_summary.as_deref().unwrap_or("").contains("9.0.1"));
        assert!(ok
            .encoder_summary
            .as_deref()
            .unwrap_or("")
            .contains("software (x264)"));
        assert!(ok.errors.is_empty());

        let linux_missing = "\
node        v22.12.0
chrome      not found -> run npx givemotion install
ffmpeg      7.1 encoders: libx264
";
        let miss = parse_givemotion_doctor(linux_missing, "", false);
        assert!(!miss.ok);
        assert!(miss.chrome_summary.is_none());
        assert!(!miss.errors.is_empty());
    }

    #[test]
    fn evaluates_all_eight_categories_with_trailing_space_workspace() {
        let (_guard, root) = make_workspace_fixture("all_pass", true, true, true);
        let report = collect_doctor_report_with(&root, &|bin, args| {
            let ok = |out: &str| {
                Ok(CmdOutput {
                    success: true,
                    stdout: out.to_string(),
                    stderr: String::new(),
                })
            };
            match bin {
                "rustc" => ok("rustc 1.99.1 (58cf8f9c3 2026-10-13)\n"),
                "cargo" => ok("cargo 1.99.1 (5f94df478 2026-08-27)\n"),
                "node" => {
                    if args.iter().any(|a| *a == OsStr::new("doctor")) {
                        ok(
                            "node v24.19.0\nchrome /Applications/Google Chrome.app\nffmpeg 9.0.1 encoders: libx264\nencoder software (x264)\n",
                        )
                    } else {
                        ok("v24.19.0\n")
                    }
                }
                "npm" => ok("11.17.0\n"),
                "ffmpeg" => ok("ffmpeg version 9.0.1 Copyright\n"),
                "ffprobe" => ok("ffprobe version 9.0.1 Copyright\n"),
                other => Err(format!("unexpected bin {other}")),
            }
        });

        assert_eq!(report.overall, CheckStatus::Pass);
        assert_eq!(report.checks.len(), 8);
        assert!(report.checks.iter().all(|c| c.status == CheckStatus::Pass));
        assert!(report.workspace_root.contains(" /AnimForgeLab"));
    }

    #[test]
    fn marks_missing_binaries_as_fail_and_unbuilt_engines_as_warn() {
        let (_guard, root) = make_workspace_fixture("warn_fail", false, false, true);
        let report = collect_doctor_report_with(&root, &|bin, args| match bin {
            "rustc" => Ok(CmdOutput {
                success: true,
                stdout: "rustc 1.99.1\n".into(),
                stderr: String::new(),
            }),
            "cargo" => Ok(CmdOutput {
                success: true,
                stdout: "cargo 1.99.1\n".into(),
                stderr: String::new(),
            }),
            "node" => {
                if args.iter().any(|a| *a == OsStr::new("doctor")) {
                    Ok(CmdOutput {
                        success: false,
                        stdout: "node v24.19.0\nchrome not found\nffmpeg not found\n".into(),
                        stderr: String::new(),
                    })
                } else {
                    Ok(CmdOutput {
                        success: true,
                        stdout: "v24.19.0\n".into(),
                        stderr: String::new(),
                    })
                }
            }
            "npm" => Ok(CmdOutput {
                success: true,
                stdout: "11.17.0\n".into(),
                stderr: String::new(),
            }),
            "ffmpeg" | "ffprobe" => Err("not found in PATH".into()),
            _ => Err("unknown".into()),
        });

        assert_eq!(report.overall, CheckStatus::Fail);
        let by_id = |id: &str| {
            report
                .checks
                .iter()
                .find(|c| c.id == id)
                .expect("category present")
        };
        assert_eq!(by_id("ffmpeg").status, CheckStatus::Fail);
        assert_eq!(by_id("givemotion").status, CheckStatus::Fail);
        assert_eq!(by_id("remotion").status, CheckStatus::Warn);
        assert_eq!(by_id("stretchystudio").status, CheckStatus::Warn);
        assert_eq!(by_id("directories").status, CheckStatus::Pass);
    }

    #[test]
    fn search_path_filters_empty_segments_and_appends_homebrew_local_cargo() {
        let home = PathBuf::from("/Users/vipin ");
        let custom_bin = PathBuf::from("/opt/custom/bin ");
        let empty = PathBuf::new();
        let raw_path =
            std::env::join_paths([&empty, &custom_bin, &empty, Path::new("/usr/bin")]).unwrap();

        let dirs = search_path_dirs_with(Some(raw_path.as_os_str()), Some(home.as_os_str()));
        assert!(!dirs.iter().any(|d| d.as_os_str().is_empty()));
        assert!(dirs.contains(&custom_bin));
        assert!(dirs.contains(&home.join(".cargo").join("bin")));
        assert!(dirs.contains(&PathBuf::from("/opt/homebrew/bin")));
        assert!(dirs.contains(&PathBuf::from("/usr/local/bin")));
        assert!(std::env::join_paths(&dirs).is_ok());

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let (_guard, root) = make_workspace_fixture("child_path", false, false, false);
            let helper_dir = root.join("bin_extra");
            fs::create_dir_all(&helper_dir).expect("helper dir");
            let child_script = helper_dir.join("probe-parent");
            let sibling_bin = helper_dir.join("probe-sibling");
            fs::write(&sibling_bin, "#!/bin/sh\necho sibling-ok\n").expect("sibling");
            fs::write(&child_script, "#!/bin/sh\nprobe-sibling\n").expect("child");
            fs::set_permissions(&sibling_bin, fs::Permissions::from_mode(0o755)).unwrap();
            fs::set_permissions(&child_script, fs::Permissions::from_mode(0o755)).unwrap();

            let out = run_os_command_with_dirs("probe-parent", &[], &[helper_dir])
                .expect("child path propagates");
            assert!(out.success);
            assert_eq!(out.stdout.trim(), "sibling-ok");
        }
    }

    #[test]
    fn real_workspace_doctor_probes_eight_categories_cleanly() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let root = manifest
            .parent()
            .expect("desktop")
            .parent()
            .expect("AnimForgeLab");
        let report = collect_doctor_report(root);
        assert_eq!(report.checks.len(), 8);
        let dirs_check = report
            .checks
            .iter()
            .find(|c| c.id == "directories")
            .expect("directories check present");
        assert_eq!(dirs_check.status, CheckStatus::Pass);

        if std::env::var_os("ANIMFORGE_INTEGRATION").is_some()
            || Path::new("/Applications/Google Chrome.app").exists()
        {
            assert_ne!(report.overall, CheckStatus::Fail, "checks: {:?}", report.checks);
        }
    }
}
