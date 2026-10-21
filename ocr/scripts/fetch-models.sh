#!/usr/bin/env bash
# Download the OCR model files listed in models.lock into a directory, checking
# each against its pinned SHA-256. Files already present with the right hash
# are left alone, so this is safe to run on every deploy.
#
#   ocr/scripts/fetch-models.sh [target-dir]     (default: ocr/models)
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
target="${1:-$here/models}"
sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

grep -v '^\s*#' "$here/models.lock" | while read -r name hash url; do
  [ -z "${name:-}" ] && continue
  dest="$target/$name"
  if [ -f "$dest" ] && [ "$(sha "$dest")" = "$hash" ]; then
    echo "ok       $name"
    continue
  fi
  mkdir -p "$(dirname "$dest")"
  curl -fsSL --retry 3 -o "$dest.part" "$url"
  got="$(sha "$dest.part")"
  if [ "$got" != "$hash" ]; then
    rm -f "$dest.part"
    echo "REFUSED  $name: sha256 $got, expected $hash" >&2
    exit 1
  fi
  mv "$dest.part" "$dest"
  echo "fetched  $name"
done
