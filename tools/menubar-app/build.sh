#!/usr/bin/env bash
# Build CheckvistTimer.app (a native menu-bar agent) from CheckvistTimer.swift.
# Usage: ./build.sh [output-dir]   (default: ~/Applications)
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$HOME/Applications}"
APP="$OUT/CheckvistTimer.app"

mkdir -p "$APP/Contents/MacOS"
cp "$DIR/Info.plist" "$APP/Contents/Info.plist"

swiftc -O "$DIR/CheckvistTimer.swift" \
    -o "$APP/Contents/MacOS/CheckvistTimer" \
    -framework Cocoa

# Ad-hoc sign so macOS is happy launching a locally-built app.
codesign --force --deep --sign - "$APP" 2>/dev/null || true

echo "Built: $APP"
echo "Run:   open \"$APP\"   (or it will auto-start if added as a Login Item)"
