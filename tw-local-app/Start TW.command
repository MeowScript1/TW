#!/bin/zsh
# Serves the TW site from the repo root (one level up) on this Mac only.
cd "$(dirname "$0")/.." || exit 1
PORT=8765
python3 -m http.server "$PORT" --bind 127.0.0.1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT INT TERM
sleep 1
open "http://localhost:$PORT"
wait "$SERVER_PID"
