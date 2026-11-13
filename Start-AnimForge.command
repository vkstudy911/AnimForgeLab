#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/animforge-desktop"
CORE_DIR="$SCRIPT_DIR/animforge-core"
LOCK_DIR="${TMPDIR:-/tmp}/animforge-studio.lock"
LOCK_PID_FILE="$LOCK_DIR/pid"
LOCK_WS_FILE="$LOCK_DIR/workspace"

CHILD_PID=""
STOP_REQUESTED=0
CLEANED_UP=0

# Ensure Homebrew, Node, and Rust/Cargo are on PATH when launched from Finder/Terminal.
if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
fi
for p in "/opt/homebrew/bin" "/usr/local/bin" "$HOME/.cargo/bin"; do
  case ":$PATH:" in
    *":$p:"*) ;;
    *) [ -d "$p" ] && PATH="$p:$PATH" ;;
  esac
done
export PATH
export ANIMFORGE_WORKSPACE_DIR="$SCRIPT_DIR"

pause_on_error() {
  if [ -t 0 ] && [ "${ANIMFORGE_NO_PAUSE:-0}" != "1" ]; then
    echo ""
    read -r -p "Press Enter to close this Terminal window..." _
  fi
}

fail() {
  echo ""
  echo "[ERROR] $1" >&2
  if [ -n "${2:-}" ]; then
    echo "        $2" >&2
  fi
  pause_on_error
  exit 1
}

kill_tree() {
  local target_pid="$1"
  local sig="$2"
  local kids=""
  local kid=""

  [ -n "$target_pid" ] || return 0
  if command -v pgrep >/dev/null 2>&1; then
    kids="$(pgrep -P "$target_pid" 2>/dev/null || true)"
    for kid in $kids; do
      kill_tree "$kid" "$sig"
    done
  fi
  if kill -0 "$target_pid" 2>/dev/null; then
    kill "-$sig" "$target_pid" 2>/dev/null || true
  fi
}

cleanup_workspace_processes() {
  local sig="$1"
  local pid=""
  local cmd=""

  while IFS= read -r line; do
    pid="${line%% *}"
    cmd="${line#* }"
    [ -n "$pid" ] || continue
    case "$cmd" in
      *"$SCRIPT_DIR/animforge-desktop/src-tauri/target/"*"animforge-desktop"*|*"$SCRIPT_DIR/animforge-core/dist/src/worker.js"*|"target/debug/animforge-desktop"*|"target/release/animforge-desktop"*)
        if kill -0 "$pid" 2>/dev/null; then
          kill "-$sig" "$pid" 2>/dev/null || true
        fi
        ;;
    esac
  done < <(ps -axo pid=,command= | sed 's/^ *//')
}

cleanup() {
  local i=0
  if [ "$CLEANED_UP" -eq 1 ]; then
    return 0
  fi
  CLEANED_UP=1

  if [ -n "$CHILD_PID" ]; then
    kill_tree "$CHILD_PID" TERM
    cleanup_workspace_processes TERM
    while [ "$i" -lt 25 ]; do
      if ! kill -0 "$CHILD_PID" 2>/dev/null; then
        break
      fi
      sleep 0.2
      i=$((i + 1))
    done
    if kill -0 "$CHILD_PID" 2>/dev/null; then
      kill_tree "$CHILD_PID" KILL
      cleanup_workspace_processes KILL
    fi
    wait "$CHILD_PID" 2>/dev/null || true
  fi

  if [ -f "$LOCK_PID_FILE" ] && [ "$(cat "$LOCK_PID_FILE" 2>/dev/null || true)" = "$$" ]; then
    rm -rf "$LOCK_DIR"
  fi
}

on_signal() {
  local sig_code="${1:-143}"
  STOP_REQUESTED=1
  echo ""
  echo "Stopping AnimForge Studio cleanly..."
  cleanup
  exit "$sig_code"
}

trap 'on_signal 130' INT
trap 'on_signal 143' TERM
trap 'on_signal 129' HUP
trap 'cleanup' EXIT

acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    printf '%s\n' "$$" > "$LOCK_PID_FILE"
    printf '%s\n' "$SCRIPT_DIR" > "$LOCK_WS_FILE"
    return 0
  fi

  local existing_pid=""
  existing_pid="$(cat "$LOCK_PID_FILE" 2>/dev/null || true)"
  if [ -n "$existing_pid" ] && [ "$existing_pid" -eq "$existing_pid" ] 2>/dev/null; then
    if kill -0 "$existing_pid" 2>/dev/null; then
      fail \
        "AnimForge Studio is already running (launcher PID $existing_pid)." \
        "Use the open window, or double-click STOP-ANIMFORGE.command to shut it down."
    fi
  fi

  rm -rf "$LOCK_DIR"
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    printf '%s\n' "$$" > "$LOCK_PID_FILE"
    printf '%s\n' "$SCRIPT_DIR" > "$LOCK_WS_FILE"
    return 0
  fi

  fail \
    "Could not acquire launcher lock at $LOCK_DIR." \
    "Run STOP-ANIMFORGE.command and try again."
}

echo "=========================================================="
echo "  AnimForge Studio — Native Desktop Launcher"
echo "=========================================================="
echo "Workspace: $SCRIPT_DIR"
echo ""

# 1. Prevent duplicate launches or port 1420 collisions.
acquire_lock

if command -v lsof >/dev/null 2>&1; then
  PORT_PID="$(lsof -tiTCP:1420 -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [ -n "$PORT_PID" ]; then
    fail \
      "Port 1420 is already in use by PID $PORT_PID (required by Tauri Vite devUrl)." \
      "Run STOP-ANIMFORGE.command if AnimForge is active, or stop the process on port 1420."
  fi
fi

# 2. Check repository layout without modifying files or installing packages.
[ -f "$APP_DIR/package.json" ] || fail "Missing desktop package.json at $APP_DIR/package.json."
[ -f "$APP_DIR/src-tauri/Cargo.toml" ] || fail "Missing Tauri Cargo manifest at $APP_DIR/src-tauri/Cargo.toml."
[ -f "$CORE_DIR/package.json" ] || fail "Missing core package.json at $CORE_DIR/package.json."
[ -f "$SCRIPT_DIR/engines/givemotion/src/cli.js" ] || fail "Missing GiveMotion CLI at $SCRIPT_DIR/engines/givemotion/src/cli.js."

# 3. Check required toolchains (Node.js, npm, Rust, Cargo) & media tools.
echo "[1/3] Checking system toolchains..."

command -v node >/dev/null 2>&1 || fail "Node.js (>= 20) was not found in PATH." "Install Node.js 20+ before launching."
NODE_VER="$(node -v)"
NODE_MAJOR="${NODE_VER#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if ! [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null; then
  fail "Node.js $NODE_VER is too old; v20+ is required (v24 recommended)."
fi

command -v npm >/dev/null 2>&1 || fail "npm was not found in PATH."
NPM_VER="$(npm -v)"

command -v rustc >/dev/null 2>&1 || fail "Rust (rustc) was not found in PATH." "Install Rust via https://rustup.rs and reopen Terminal."
RUST_VER="$(rustc --version)"

command -v cargo >/dev/null 2>&1 || fail "Cargo was not found in PATH." "Install Rust/Cargo via https://rustup.rs and reopen Terminal."
CARGO_VER="$(cargo --version)"

echo "  • Node.js: $NODE_VER (npm $NPM_VER)"
echo "  • Rust:    $RUST_VER"
echo "  • Cargo:   $CARGO_VER"

if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
  echo "  • FFmpeg:  $(ffmpeg -version 2>/dev/null | head -n 1)"
else
  echo "  • FFmpeg:  [WARN] ffmpeg/ffprobe not found in PATH (MP4 export will fail until installed)"
fi

if [ -d "/Applications/Google Chrome.app" ] || command -v google-chrome >/dev/null 2>&1 || command -v chromium >/dev/null 2>&1; then
  echo "  • Video Renderer: Chrome/Chromium detected (used by GiveMotion headless video exporter, not used as the GUI)"
else
  echo "  • Video Renderer: [WARN] Google Chrome not found in /Applications (GiveMotion headless MP4 render needs Chrome)"
fi

# 4. Check installed dependencies & compiled worker artifacts (never auto-install).
echo ""
echo "[2/3] Checking installed dependencies..."

[ -d "$CORE_DIR/node_modules" ] || fail \
  "animforge-core dependencies are not installed." \
  "Run manually: cd \"$CORE_DIR\" && npm install && npm run build"

[ -f "$CORE_DIR/dist/src/worker.js" ] || fail \
  "animforge-core worker is not built ($CORE_DIR/dist/src/worker.js missing)." \
  "Run manually: cd \"$CORE_DIR\" && npm run build"

[ -d "$APP_DIR/node_modules" ] && [ -x "$APP_DIR/node_modules/.bin/tauri" ] && [ -x "$APP_DIR/node_modules/.bin/vite" ] || fail \
  "animforge-desktop dependencies are not installed." \
  "Run manually: cd \"$APP_DIR\" && npm install"

echo "  • animforge-core dependencies & worker.js: OK"
echo "  • animforge-desktop Tauri & Vite CLI:      OK"

# 5. Launch native Tauri desktop window (never fall back to browser).
RELEASE_APP="$APP_DIR/src-tauri/target/release/bundle/macos/AnimForge Studio.app"
USE_RELEASE=0
if [ "${1:-}" = "--release" ] || [ "${ANIMFORGE_MODE:-}" = "release" ]; then
  USE_RELEASE=1
fi

echo ""
if [ "$USE_RELEASE" -eq 1 ] && [ -d "$RELEASE_APP" ]; then
  echo "[3/3] Starting AnimForge Studio (Native Packaged Release Bundle)..."
  echo "      Application: $RELEASE_APP"
  echo "      Press Ctrl+C here (or quit the app window) to exit cleanly."
  echo ""
  "$RELEASE_APP/Contents/MacOS/animforge-desktop" &
  CHILD_PID=$!
else
  echo "[3/3] Starting AnimForge Studio native window (Tauri 2 + Rust + WebKit)..."
  echo "      Command: (cd \"$APP_DIR\" && npm run tauri dev)"
  echo "      Note: Frontend runs strictly inside native Tauri desktop window, not a browser tab."
  echo "      Press Ctrl+C here (or quit the app window) to exit cleanly."
  echo ""
  cd "$APP_DIR" || fail "Cannot enter $APP_DIR"
  npm run tauri dev &
  CHILD_PID=$!
fi

set +e
wait "$CHILD_PID"
EXIT_STATUS=$?
set -e

if [ "$STOP_REQUESTED" -eq 1 ]; then
  exit 0
fi

if [ "$EXIT_STATUS" -ne 0 ]; then
  fail \
    "AnimForge Studio exited with status $EXIT_STATUS." \
    "Check the output above for Vite, TypeScript, or Rust/Cargo build errors."
fi

echo ""
echo "AnimForge Studio closed cleanly."
