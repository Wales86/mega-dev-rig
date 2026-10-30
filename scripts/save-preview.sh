#!/usr/bin/env bash
# Plan § 3: run rig and save one page as a single HTML file (ADR 0001: the page is self-contained).
# Usage: scripts/save-preview.sh <night> <out-file>. LANE_MARKER comes from the environment or .env;
# set but empty, the banner reads "no marker set" (plan § 4).
set -euo pipefail
night=${1:?night, e.g. 2026-10-28}
out=${2:?output file}
port=${PREVIEW_PORT:-8799}

if curl -sf "http://localhost:$port/health" >/dev/null; then
  echo "port $port is already serving; stop that rig first" >&2
  exit 1
fi

# Own process group, so the trap stops pnpm, tsx and the server together.
PORT=$port setsid pnpm -s start >/dev/null 2>&1 &
pid=$!
trap 'kill -- -$pid 2>/dev/null || true' EXIT

for _ in $(seq 1 50); do
  curl -sf "http://localhost:$port/health" >/dev/null && break
  sleep 0.2
done

mkdir -p "$(dirname "$out")"
curl -sf "http://localhost:$port/digest/$night" -o "$out"
echo "saved /digest/$night to $out"
