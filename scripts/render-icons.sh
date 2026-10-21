#!/bin/sh
# Regenerates extension/icons/icon-{16,32,48,128}.png from the PNG
# master artwork (src/assets/icon.png — the user's own artwork,
# installed 2026-10-21) by scaling with ffmpeg, preserving alpha.
# Run only when the icon design changes; the PNGs are committed.
set -eu
cd "$(dirname "$0")/.."
for size in 16 32 48 128; do
  ffmpeg -y -v error -i src/assets/icon.png -vf "scale=${size}:${size}:flags=lanczos" "extension/icons/icon-${size}.png"
  echo "wrote extension/icons/icon-${size}.png"
done
