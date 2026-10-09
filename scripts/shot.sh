#!/usr/bin/env bash
# Renders deterministic frames of the built demo with headless Chrome, served over HTTP
# (module scripts won't load from file://).
# Usage: scripts/shot.sh <tick>[,<tick>...] [extra query, e.g. 'seed=3&light=0']
set -euo pipefail
cd "$(dirname "$0")/.."
TICKS="${1:-120}"
EXTRA="${2:-}"
PORT=4799
mkdir -p shots

# always shoot the current source, not whatever dist/ happens to hold
npm run build --silent >/dev/null

python3 -m http.server "$PORT" --directory dist --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 0.5

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
IFS=',' read -ra LIST <<< "$TICKS"
for TICK in "${LIST[@]}"; do
  OUT="shots/t${TICK}${EXTRA:+-$(echo "$EXTRA" | tr '=&' '-_')}.png"
  URL="http://127.0.0.1:${PORT}/index.html?t=${TICK}${EXTRA:+&$EXTRA}"
  perl -e 'alarm 40; exec @ARGV' "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1920,1200 \
    --enable-logging=stderr --v=0 --virtual-time-budget=1500 --screenshot="$OUT" "$URL" 2>&1 \
    | grep -E 'CONSOLE|Uncaught' | grep -v 'DevTools' || true
  echo "$OUT"
done
