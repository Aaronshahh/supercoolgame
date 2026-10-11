#!/usr/bin/env bash
# Runs the audio smoke test (?audio=test) in headless Chrome and prints what it logged: every sound
# event, loop, instrument and song is started once, and the page reports how many uncaught errors
# that produced. Chrome has no speakers here; this catches bad AudioParam ramps and broken graphs.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=4798
npm run build --silent >/dev/null
python3 -m http.server "$PORT" --directory dist --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 0.5
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p shots
perl -e 'alarm 60; exec @ARGV' "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=800,600 \
  --autoplay-policy=no-user-gesture-required --enable-logging=stderr --v=0 --virtual-time-budget=12000 \
  --screenshot=shots/audio-smoke.png "http://127.0.0.1:${PORT}/index.html?audio=test&bots=0" 2>&1 \
  | grep -E 'CONSOLE|Uncaught' | grep -v 'DevTools' | sed 's/.*CONSOLE([0-9]*)\] //' || true
