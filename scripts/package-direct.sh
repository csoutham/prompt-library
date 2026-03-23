#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd -L "$(dirname "$0")/.." && pwd -L)"
RELEASE_DIR="$ROOT_DIR/release"

mkdir -p "$RELEASE_DIR"
rm -rf "$RELEASE_DIR/mac-arm64" "$RELEASE_DIR/mac-arm64-unpacked"
find "$RELEASE_DIR" -maxdepth 1 \( -name '*.dmg' -o -name '*.zip' \) -delete

function has_notarisation_credentials() {
	[[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]
}

function notarise_and_staple_dmg() {
	local dmg_path="$1"

	if ! has_notarisation_credentials; then
		echo "Skipping DMG notarisation - Apple notarisation credentials are not set."
		return
	fi

	echo "Submitting DMG for notarisation: $dmg_path"
	xcrun notarytool submit "$dmg_path" \
		--apple-id "$APPLE_ID" \
		--password "$APPLE_APP_SPECIFIC_PASSWORD" \
		--team-id "$APPLE_TEAM_ID" \
		--wait

	echo "Stapling DMG: $dmg_path"
	xcrun stapler staple "$dmg_path"
}

function validate_direct_artifacts() {
	local dmg_path="$1"
	local app_path="$2"

	echo "Validating stapled DMG: $dmg_path"
	xcrun stapler validate "$dmg_path"

	echo "Validating notarized app bundle: $app_path"
	spctl -a -t exec -vv "$app_path"
}

echo "Building direct macOS distribution..."
(
	cd "$ROOT_DIR"
	bun run build:direct
)

DMG_PATHS=("${(@f)$(find "$RELEASE_DIR" -maxdepth 1 -name '*.dmg' | sort)}")

for dmg_path in "${DMG_PATHS[@]}"; do
	[[ -n "$dmg_path" ]] || continue
	notarise_and_staple_dmg "$dmg_path"
done

APP_PATH="$RELEASE_DIR/mac-arm64/Your Prompt Library.app"

for dmg_path in "${DMG_PATHS[@]}"; do
	[[ -n "$dmg_path" ]] || continue
	validate_direct_artifacts "$dmg_path" "$APP_PATH"
done

echo "Created direct distribution artefacts:"
find "$RELEASE_DIR" -maxdepth 1 \( -name '*.dmg' -o -name '*.zip' \) -print | sort
