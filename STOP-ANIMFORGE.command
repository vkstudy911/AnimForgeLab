#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LOCK_DIR="${TMPDIR:-/tmp}/animforge-studio.lock"
LOCK_PID_FILE="$LOCK_DIR/pid"
LOCK_WS_FILE="$LOCK_DIR/workspace"

for p in "/opt/homebrew/bin" "/usr/local/bin" "$HOME/.cargo/bin"; do
  case ":$PATH:" in
    *":$p:"*) ;;
    *) [ -d "$p" ] && PATH="$p:$PATH" ;;
  esac
done
export PATH

find_workspace_pids() {
  local line=""
  local pid=""
  local cmd=""
  local found=""

  if [ -f "$LOCK_PID_FILE" ]; then
    local lock_ws=""
    local lpid=""
    lock_ws="$(cat "$LOCK_WS_FILE" 2>/dev/null || true)"
    lpid="$(cat "$LOCK_PID_FILE" 2>/dev/null || true)"
    if { [ -z "$lock_ws" ] || [ "$lock_ws" = "$SCRIPT_DIR" ]; } && [ -n "$lpid" ] && [ "$lpid" -eq "$lpid" ] 2>/dev/null; then
      if kill -0 "$lpid" 2>/dev/null; then
        found="$found $lpid"
      fi
    fi
  fi

  while IFS= read -r line; do
    pid="${line%% *}"
    cmd="${line#* }"
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    case "$cmd" in
      *"$SCRIPT_DIR/animforge-desktop/src-tauri/target/"*"animforge-desktop"*|*"$SCRIPT_DIR/animforge-core/dist/src/worker.js"*|*"$SCRIPT_DIR/animforge-desktop/node_modules/.bin/tauri"*|*"$SCRIPT_DIR/animforge-desktop/node_modules/.bin/vite"*|"target/debug/animforge-desktop"*|"target/release/animforge-desktop"*)
        if kill -0 "$pid" 2>/dev/null; then
          case " $found " in
            *" $pid "*) ;;
            *) found="$found $pid" ;;
          esac
        fi
        ;;
    esac
  done < <(ps -axo pid=,command= | sed 's/^ *//')

  echo "$found" | xargs 2>/dev/null || true
}

echo "=========================================================="
echo "  AnimForge Studio — Graceful Shutdown Helper"
echo "=========================================================="

PIDS="$(find_workspace_pids)"
if [ -z "$PIDS" ]; then
  if [ -d "$LOCK_DIR" ]; then
    lock_ws="$(cat "$LOCK_WS_FILE" 2>/dev/null || true)"
    if [ -z "$lock_ws" ] || [ "$lock_ws" = "$SCRIPT_DIR" ]; then
      rm -rf "$LOCK_DIR"
      echo "Cleaned stale launcher lock."
    fi
  fi
  echo "AnimForge Studio is not currently running."
  exit 0
fi

echo "Sending SIGTERM to AnimForge Studio processes: $PIDS"
for pid in $PIDS; do
  kill -TERM "$pid" 2>/dev/null || true
done

i=0
while [ "$i" -lt 25 ]; do
  REMAINING="$(find_workspace_pids)"
  if [ -z "$REMAINING" ]; then
    break
  fi
  sleep 0.2
  i=$((i + 1))
done

REMAINING="$(find_workspace_pids)"
if [ -n "$REMAINING" ]; then
  echo "Escalating SIGKILL for remaining processes: $REMAINING"
  for pid in $REMAINING; do
    kill -KILL "$pid" 2>/dev/null || true
  done
  sleep 0.3
fi

if [ -d "$LOCK_DIR" ]; then
  lock_ws="$(cat "$LOCK_WS_FILE" 2>/dev/null || true)"
  if [ -z "$lock_ws" ] || [ "$lock_ws" = "$SCRIPT_DIR" ]; then
    rm -rf "$LOCK_DIR"
  fi
fi

FINAL="$(find_workspace_pids)"
if [ -z "$FINAL" ]; then
  echo "AnimForge Studio stopped cleanly."
  exit 0
else
  echo "[ERROR] Some processes could not be stopped: $FINAL" >&2
  exit 1
fi
