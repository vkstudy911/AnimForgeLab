#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "  AnimForge AI — Master Development & Verification Script"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[1/4] Checking System & Host Tools..."
echo "  • Architecture: $(uname -m)"
echo "  • Node:         $(node -v)"
echo "  • npm:          $(npm -v)"
echo "  • FFmpeg:       $(ffmpeg -version | head -n 1)"

echo ""
echo "[2/4] Testing AnimForge Core Pipeline..."
cd "$SCRIPT_DIR/animforge-core"
npm test

echo ""
echo "[3/4] Verifying Engine Health..."
cd "$SCRIPT_DIR"
node engines/givemotion/src/cli.js doctor

echo ""
echo "[4/4] Verifying Demo Animations..."
ls -lh "$SCRIPT_DIR/projects/cybersecurity-explainer/output/ai-cybersecurity-explainer.mp4"
ls -lh "$SCRIPT_DIR/projects/demo-animation/output/lost-star-final.mp4"
ls -lh "$SCRIPT_DIR/projects/demo-animation/demo-pip-adventure.mp4"
echo "✓ Master verification succeeded! All films, engines, and AnimForge Core are active."
