#!/bin/sh
# Regenerates extension/icons/icon-{16,32,48,128}.png from the SVG
# source of truth (src/assets/icon.svg) using ffmpeg's SVG rasteriser.
# Run only when the icon design changes; the PNGs are committed.
set -eu
cd "$(dirname "$0")/.."
for size in 16 32 48 128; do
  ffmpeg -y -v error -i src/assets/icon.svg -vf "scale=${size}:${size}" "extension/icons/icon-${size}.png"
  echo "wrote extension/icons/icon-${size}.png"
done
