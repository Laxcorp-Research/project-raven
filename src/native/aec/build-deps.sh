#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPS_DIR="$SCRIPT_DIR/deps"
PLUGIN_DIR="$DEPS_DIR/lib/gstreamer-1.0"

echo "=== Verifying GStreamer AEC dependencies ==="

# Check for GStreamer core
if ! pkg-config --exists gstreamer-1.0; then
    echo "ERROR: gstreamer-1.0 not found."
    echo ""
    echo "Install GStreamer:"
    echo "  macOS:   brew install gstreamer"
    echo "  Linux:   sudo apt install libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev libgstreamer-plugins-bad1.0-dev"
    echo "  Windows: Download from https://gstreamer.freedesktop.org/download/"
    exit 1
fi

GST_VERSION=$(pkg-config --modversion gstreamer-1.0)
echo "  GStreamer core: $GST_VERSION"

# Check for GStreamer app (appsrc/appsink)
if ! pkg-config --exists gstreamer-app-1.0; then
    echo "ERROR: gstreamer-app-1.0 not found."
    exit 1
fi
echo "  GStreamer app (appsrc/appsink): OK"

# Check for GStreamer audio
if ! pkg-config --exists gstreamer-audio-1.0; then
    echo "ERROR: gstreamer-audio-1.0 not found."
    exit 1
fi
echo "  GStreamer audio: OK"

# Check for GStreamer bad-audio (needed by webrtcdsp plugin)
if ! pkg-config --exists gstreamer-bad-audio-1.0; then
    echo "ERROR: gstreamer-bad-audio-1.0 not found."
    exit 1
fi
echo "  GStreamer bad-audio: OK"

# Check for our custom webrtcdsp plugin
if [ -f "$PLUGIN_DIR/libgstwebrtcdsp.dylib" ] || [ -f "$PLUGIN_DIR/libgstwebrtcdsp.so" ]; then
    echo "  webrtcdsp plugin: OK (custom-built in deps/)"
else
    echo ""
    echo "  webrtcdsp plugin not found in $PLUGIN_DIR"
    echo "  Building from gst-plugins-bad source..."
    echo ""
    "$SCRIPT_DIR/build-webrtcdsp-plugin.sh"
fi

echo ""
echo "=== All GStreamer AEC dependencies satisfied ==="
echo "  Run 'npx cmake-js compile --CDCMAKE_BUILD_TYPE=Release' from src/native/aec/ to build."
