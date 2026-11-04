#!/usr/bin/env bash
WORKSPACE="$HOME/alpha"
echo "[Alpha v6.1 Watcher] Starting inotifywait loop on $WORKSPACE..."

while true; do
    inotifywait -qq -e modify,create,close_write --exclude 'audit_log\.json|auto_watcher\.log|watch_and_test\.log' "$WORKSPACE"
    echo "[Alpha v6.1 Watcher] File change detected. Executing CLI test suite..."
    node "$WORKSPACE/test_cli_rejection.js"
done
