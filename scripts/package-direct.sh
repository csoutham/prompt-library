#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd -L "$(dirname "$0")/.." && pwd -L)"
RELEASE_DIR="$ROOT_DIR/release"

mkdir -p "$RELEASE_DIR"
rm -rf "$RELEASE_DIR/mac-arm64" "$RELEASE_DIR/mac-arm64-unpacked"
find "$RELEASE_DIR" -maxdepth 1 \( -name '*.dmg' -o -name '*.zip' \) -delete

echo "Building direct macOS distribution..."
(
	cd "$ROOT_DIR"
	bun run build:direct
)

echo "Created direct distribution artefacts:"
find "$RELEASE_DIR" -maxdepth 1 \( -name '*.dmg' -o -name '*.zip' \) -print | sort
