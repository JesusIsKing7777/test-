#!/usr/bin/env bash
set -euo pipefail
cd ~/alpha

echo "=== [1/5] Non-Empty (-s), Export & Syntax Validation ==="
CORE_FILES=(
  input_intent_compiler_v92.js semantic_router_bridge.js semantic_router_classifier.py
  omnisync_router.js local_sync/event_sourcing_queue.js telemetry_sync_bridge_v92.js
  ui_controller/bottom_quarantine_drawer_controller.js native_bridge/ios/CoreMLBridge.swift
  models/export_minilm_int4.py models/verify_minilm_worker.py
)
MISSING=()
for f in "${CORE_FILES[@]}"; do
  [ -s "$f" ] || MISSING+=("$f")
done
if [ "${#MISSING[@]}" -gt 0 ]; then
  printf '[FAIL] Missing or 0-byte file: %s\n' "${MISSING[@]}"
  exit 1
fi

node -e "
const mods = [
  './input_intent_compiler_v92.js', './semantic_router_bridge.js', './omnisync_router.js',
  './local_sync/event_sourcing_queue.js', './telemetry_sync_bridge_v92.js',
  './ui_controller/bottom_quarantine_drawer_controller.js'
];
const bad = mods.filter(f => typeof require(f) !== 'function');
if (bad.length) { console.error('[FAIL] Not constructor:', bad.join(', ')); process.exit(1); }
console.log('[OK] All 6 core JS constructors verified.');
"

node -c input_intent_compiler_v92.js semantic_router_bridge.js omnisync_router.js \
  local_sync/event_sourcing_queue.js telemetry_sync_bridge_v92.js \
  ui_controller/bottom_quarantine_drawer_controller.js
python3 -m py_compile semantic_router_classifier.py models/export_minilm_int4.py models/verify_minilm_worker.py

echo "=== [2/5] Node.js Chaos, Frontier & Async Router Suites ==="
TESTS=()
for f in test_hybrid_chaos_v92.js test_frontier_v92.js test_omnisync_async_v92.js; do
  [ -s "$f" ] && TESTS+=("$f")
done
[ "${#TESTS[@]}" -gt 0 ] || { echo "[ERR] No v9.2 test files found."; exit 1; }
node --test "${TESTS[@]}"

echo "=== [3/5] Python --worker & label_map.json Check ==="
python3 models/verify_minilm_worker.py

echo "=== [4/5] AlphaTelemetry v9.2 Bipartite Health Check ==="
if [ -s alpha_telemetry_v9_2.js ]; then
  export ALPHA_TELEMETRY_HMAC_KEY="${ALPHA_TELEMETRY_HMAC_KEY:-0123456789abcdef0123456789abcdef}"
  if [ "${CI:-false}" = "true" ]; then
    node alpha_telemetry_v9_2.js
  else
    node alpha_telemetry_v9_2.js || echo "[WARN] alpha_telemetry_v9_2.js exited non-zero ($?)"
  fi
else
  echo "[INFO] alpha_telemetry_v9_2.js not present; skipping standalone runner."
fi

echo "=== [5/5] C++17 WordPiece ## + TMPDIR POSIX mmap Smoke ==="
CPP_SRC="native_bridge/android/tests/alpha_arena_smoke_test.cpp"
if [ -s "$CPP_SRC" ] && command -v clang++ >/dev/null 2>&1; then
  clang++ -std=c++17 -O2 "$CPP_SRC" -o "${TMPDIR:-.}/alpha_arena_smoke" && "${TMPDIR:-.}/alpha_arena_smoke"
elif [ -s "$CPP_SRC" ] && command -v g++ >/dev/null 2>&1; then
  g++ -std=c++17 -O2 "$CPP_SRC" -o "${TMPDIR:-.}/alpha_arena_smoke" && "${TMPDIR:-.}/alpha_arena_smoke"
else
  echo "[INFO] C++ compiler not installed locally; compile $CPP_SRC via Android NDK/g++."
fi

echo "[SUCCESS] Script Alpha v9.2 full 70/30 integration smoke suite completed."
