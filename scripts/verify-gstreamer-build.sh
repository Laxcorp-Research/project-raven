#!/bin/bash
# Verify GStreamer AEC native addon builds from source on macOS.
# Corresponds to checklist item O-6.
#
# Prerequisites: Homebrew GStreamer installed
#   brew install gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad
#
# Usage: ./scripts/verify-gstreamer-build.sh

set -euo pipefail

PASS=0
FAIL=0
SKIP=0

check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "  [PASS] $label"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== GStreamer AEC Build Verification ==="
echo ""

# 1. Check pkg-config
echo "Step 1: Check GStreamer installation"
check "pkg-config available" command -v pkg-config
check "gstreamer-1.0" pkg-config --exists gstreamer-1.0
check "gstreamer-app-1.0" pkg-config --exists gstreamer-app-1.0
check "gstreamer-audio-1.0" pkg-config --exists gstreamer-audio-1.0

if ! pkg-config --exists gstreamer-1.0 2>/dev/null; then
  echo ""
  echo "  GStreamer not found. Install with:"
  echo "    brew install gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad"
  echo ""
  SKIP=$((SKIP + 3))
  echo "=== Results: $PASS passed, $FAIL failed, $SKIP skipped ==="
  exit 1
fi

echo ""
echo "  GStreamer version: $(pkg-config --modversion gstreamer-1.0)"

# 2. Check cmake-js
echo ""
echo "Step 2: Check build tools"
check "cmake available" command -v cmake
check "node available" command -v node

# 3. Install AEC dependencies
echo ""
echo "Step 3: Install AEC addon dependencies"
cd src/native/aec
if npm install --cache /tmp/npm-cache-aec 2>/dev/null; then
  echo "  [PASS] npm install"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] npm install"
  FAIL=$((FAIL + 1))
fi

# 4. Build the native addon
echo ""
echo "Step 4: Build raven-aec.node"
if npx cmake-js compile --CDCMAKE_BUILD_TYPE=Release 2>&1 | tail -3; then
  echo "  [PASS] cmake-js compile"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] cmake-js compile"
  FAIL=$((FAIL + 1))
fi

# 5. Verify output binary
echo ""
echo "Step 5: Verify output"
if [ -f build/Release/raven-aec.node ]; then
  echo "  [PASS] build/Release/raven-aec.node exists ($(du -h build/Release/raven-aec.node | cut -f1))"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] build/Release/raven-aec.node not found"
  FAIL=$((FAIL + 1))
fi

cd ../../..

echo ""
echo "=== Results: $PASS passed, $FAIL failed, $SKIP skipped ==="
[ "$FAIL" -eq 0 ] && echo "All checks passed." || echo "Some checks failed — see above."
exit "$FAIL"
