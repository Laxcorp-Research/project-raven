#!/bin/bash
# Verify Swift AudioCapture builds from source on macOS.
# Corresponds to checklist item O-7.
#
# Prerequisites: Xcode Command Line Tools (includes Swift 5.9+)
#   xcode-select --install
#
# Usage: ./scripts/verify-swift-build.sh

set -euo pipefail

PASS=0
FAIL=0

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

echo "=== Swift AudioCapture Build Verification ==="
echo ""

# 1. Check Swift toolchain
echo "Step 1: Check Swift installation"
check "swift available" command -v swift

if command -v swift >/dev/null 2>&1; then
  SWIFT_VERSION=$(swift --version 2>&1 | head -1)
  echo "  Version: $SWIFT_VERSION"
else
  echo "  Swift not found. Install with: xcode-select --install"
  echo ""
  echo "=== Results: $PASS passed, $FAIL failed ==="
  exit 1
fi

# 2. Check macOS version (needs 13+)
echo ""
echo "Step 2: Check macOS version"
MACOS_VERSION=$(sw_vers -productVersion 2>/dev/null || echo "unknown")
echo "  macOS: $MACOS_VERSION"
MAJOR=$(echo "$MACOS_VERSION" | cut -d. -f1)
if [ "$MAJOR" -ge 13 ] 2>/dev/null; then
  echo "  [PASS] macOS 13+ required"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] macOS 13+ required (have $MACOS_VERSION)"
  FAIL=$((FAIL + 1))
fi

# 3. Build
echo ""
echo "Step 3: Build AudioCapture (release)"
cd src/native/swift/AudioCapture

if swift build -c release 2>&1 | tail -5; then
  echo "  [PASS] swift build -c release"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] swift build -c release"
  FAIL=$((FAIL + 1))
fi

# 4. Verify binary
echo ""
echo "Step 4: Verify output binary"
BINARY_PATH=".build/release/audiocapture"
if [ -f "$BINARY_PATH" ]; then
  echo "  [PASS] $BINARY_PATH exists ($(du -h "$BINARY_PATH" | cut -f1))"
  PASS=$((PASS + 1))

  # Quick sanity: binary should be Mach-O
  if file "$BINARY_PATH" | grep -q "Mach-O"; then
    echo "  [PASS] Valid Mach-O binary"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] Not a valid Mach-O binary"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  [FAIL] $BINARY_PATH not found"
  FAIL=$((FAIL + 1))
fi

cd ../../../..

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && echo "All checks passed." || echo "Some checks failed — see above."
exit "$FAIL"
