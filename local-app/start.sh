#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT=8765
python3 -m http.server "$PORT" --bind 127.0.0.1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
sleep 0.4
URL="http://127.0.0.1:${PORT}/"
if command -v open >/dev/null 2>&1; then open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
fi
echo "English Guard  $URL"
echo "Close this terminal to stop."
wait "$PID"
