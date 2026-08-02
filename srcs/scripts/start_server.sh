#!/bin/bash
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
export PATH=$PATH:/usr/local/bin:/Users/seanjung/.nvm/versions/node/v24.14.0/bin
export GEMINI_API_KEY="${GEMINI_API_KEY}"

while true; do
  echo "[Auto-Restart Sentinel] Starting node src/server.js on port 3003..."
  node src/server.js
  EXIT_CODE=$?
  echo "[Auto-Restart Sentinel] Server stopped with exit code $EXIT_CODE. Restarting in 1 second..."
  sleep 1
done
