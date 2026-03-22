#!/bin/bash
# AEC bypass/recovery verification checklist.
# Corresponds to checklist item O-9.
#
# This is a semi-manual test — the script verifies the code configuration
# and provides instructions for the runtime test.
#
# Usage: ./scripts/verify-aec-health.sh

set -euo pipefail

PASS=0
FAIL=0

echo "=== AEC Bypass/Recovery Verification ==="
echo ""

# 1. Verify thresholds in source code
echo "Step 1: Verify AEC health thresholds in systemAudioNative.ts"

FILE="src/main/systemAudioNative.ts"
if [ ! -f "$FILE" ]; then
  echo "  [FAIL] $FILE not found"
  FAIL=$((FAIL + 1))
else
  check_threshold() {
    local name="$1"
    local expected="$2"
    if grep -q "$name = $expected" "$FILE"; then
      echo "  [PASS] $name = $expected"
      PASS=$((PASS + 1))
    else
      echo "  [FAIL] $name expected $expected"
      FAIL=$((FAIL + 1))
    fi
  }

  check_threshold "AEC_DRIFT_BYPASS_MS" "200"
  check_threshold "AEC_DRIFT_REENABLE_MS" "100"
  check_threshold "AEC_OVERFLOW_RATE_BYPASS" "10"
  check_threshold "AEC_HEALTH_CHECK_MS" "2000"
  check_threshold "AEC_REENABLE_HOLDOFF_MS" "5000"
fi

# 2. Verify AEC addon exists
echo ""
echo "Step 2: Verify AEC addon binary"
AEC_NODE="src/native/aec/build/Release/raven-aec.node"
if [ -f "$AEC_NODE" ]; then
  echo "  [PASS] $AEC_NODE exists"
  PASS=$((PASS + 1))
else
  echo "  [SKIP] $AEC_NODE not built — run scripts/verify-gstreamer-build.sh first"
fi

# 3. Verify bypass logic exists in source
echo ""
echo "Step 3: Verify bypass logic in source code"
if grep -q "AEC bypassed" "$FILE"; then
  echo "  [PASS] Bypass logging present"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] No bypass logging found in $FILE"
  FAIL=$((FAIL + 1))
fi

if grep -q "AEC re-enabled" "$FILE"; then
  echo "  [PASS] Re-enable logging present"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] No re-enable logging found in $FILE"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Code verification: $PASS passed, $FAIL failed ==="
echo ""

# 4. Runtime test instructions
echo "=== Runtime Test Checklist (manual) ==="
echo ""
echo "Run:  npm run dev"
echo "Then follow these steps:"
echo ""
echo "  1. Start a recording session (Cmd+R)"
echo "  2. Open Console/logs — look for '[SystemAudio] AEC health:' entries"
echo "  3. They appear every 2 seconds during recording"
echo ""
echo "  --- Test bypass ---"
echo "  4. Play loud system audio (e.g., YouTube video) while speaking into mic"
echo "  5. Rapidly start/stop system sounds to create drift"
echo "  6. Expected: '[SystemAudio] AEC bypassed — drift Xms exceeds 200ms threshold'"
echo "  7. When AEC is bypassed, raw mic audio is returned (no echo cancellation)"
echo ""
echo "  --- Test recovery ---"
echo "  8. Stop the disruptive system audio"
echo "  9. Wait 5+ seconds (holdoff period)"
echo "  10. Expected: '[SystemAudio] AEC re-enabled — drift Xms within 100ms threshold'"
echo ""
echo "  --- Verify normal operation ---"
echo "  11. During normal recording, AEC health logs should show drift < 50ms"
echo "  12. Transcript should still flow correctly during bypass/recovery"
echo ""
echo "Log patterns to search for:"
echo "  grep 'AEC health' (normal health check)"
echo "  grep 'AEC bypassed' (bypass triggered)"
echo "  grep 'AEC re-enabled' (recovery)"

exit "$FAIL"
