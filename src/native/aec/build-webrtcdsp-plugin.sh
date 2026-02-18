#!/bin/bash
set -e

# Build the webrtcdsp GStreamer plugin from gst-plugins-bad source.
# This plugin provides webrtcdsp and webrtcechoprobe elements for AEC.
# Homebrew's GStreamer formula doesn't include this plugin because it
# requires libwebrtc-audio-processing as a build dependency.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPS_DIR="$SCRIPT_DIR/deps"
PLUGIN_DIR="$DEPS_DIR/lib/gstreamer-1.0"
BUILD_DIR="/tmp/webrtcdsp-plugin-build"

GST_VERSION=$(pkg-config --modversion gstreamer-1.0)
echo "Building webrtcdsp plugin for GStreamer $GST_VERSION"

# Check that webrtc-audio-processing static libs exist
if [ ! -f "$DEPS_DIR/lib/libwebrtc-audio-processing-1.a" ]; then
    echo "ERROR: libwebrtc-audio-processing not found in $DEPS_DIR/lib/"
    echo "Run the original build-deps.sh to build it first."
    exit 1
fi

# Clone GStreamer monorepo (shallow, matching version)
SRC_DIR="/tmp/gst-mono-${GST_VERSION}"
if [ ! -d "$SRC_DIR/subprojects/gst-plugins-bad/ext/webrtcdsp" ]; then
    echo "Cloning GStreamer $GST_VERSION source..."
    rm -rf "$SRC_DIR"
    git clone --depth 1 --branch "$GST_VERSION" \
        https://gitlab.freedesktop.org/gstreamer/gstreamer.git "$SRC_DIR"
fi

WEBRTCDSP_SRC="$SRC_DIR/subprojects/gst-plugins-bad/ext/webrtcdsp"
echo "Source files: $WEBRTCDSP_SRC"

# Create build dir and config.h
mkdir -p "$BUILD_DIR"
cat > "$BUILD_DIR/config.h" << EOF
#ifndef __GST_WEBRTCDSP_CONFIG_H__
#define __GST_WEBRTCDSP_CONFIG_H__
#define HAVE_WEBRTC1 1
#define PACKAGE "gst-plugins-bad"
#define VERSION "$GST_VERSION"
#define GST_LICENSE "LGPL"
#define GST_PACKAGE_NAME "GStreamer Bad Plug-ins"
#define GST_PACKAGE_ORIGIN "https://gstreamer.freedesktop.org"
#endif
EOF

# Compile
echo "Compiling webrtcdsp plugin..."
c++ -std=c++17 -shared -fPIC \
    -DHAVE_CONFIG_H \
    -I"$BUILD_DIR" \
    -I"$DEPS_DIR/include/webrtc-audio-processing-1" \
    -I"$DEPS_DIR/include" \
    $(pkg-config --cflags gstreamer-1.0 gstreamer-base-1.0 gstreamer-audio-1.0 gstreamer-bad-audio-1.0) \
    "$WEBRTCDSP_SRC/gstwebrtcdsp.cpp" \
    "$WEBRTCDSP_SRC/gstwebrtcechoprobe.cpp" \
    "$WEBRTCDSP_SRC/gstwebrtcdspplugin.cpp" \
    -o "$BUILD_DIR/libgstwebrtcdsp.dylib" \
    $(pkg-config --libs gstreamer-1.0 gstreamer-base-1.0 gstreamer-audio-1.0 gstreamer-bad-audio-1.0) \
    -L"$DEPS_DIR/lib" \
    -lwebrtc-audio-processing-1 \
    -lcommon_audio -llibapi -llibbase -lsystem_wrappers -llibfft -llibpffft -llibrnnoise \
    -labsl_base -labsl_flags -labsl_strings -labsl_synchronization -labsl_time \
    -labsl_debugging -labsl_numeric -labsl_profiling -labsl_hash -labsl_status \
    -labsl_types -labsl_container -labsl_crc -labsl_log -labsl_random \
    -framework Foundation -framework CoreFoundation

# Install into deps
mkdir -p "$PLUGIN_DIR"
cp "$BUILD_DIR/libgstwebrtcdsp.dylib" "$PLUGIN_DIR/"

echo "Plugin installed to $PLUGIN_DIR/libgstwebrtcdsp.dylib"

# Verify
GST_PLUGIN_PATH="$PLUGIN_DIR" gst-inspect-1.0 webrtcdsp > /dev/null 2>&1 \
    && echo "Verification: webrtcdsp element loads OK" \
    || echo "WARNING: webrtcdsp element failed to load"

GST_PLUGIN_PATH="$PLUGIN_DIR" gst-inspect-1.0 webrtcechoprobe > /dev/null 2>&1 \
    && echo "Verification: webrtcechoprobe element loads OK" \
    || echo "WARNING: webrtcechoprobe element failed to load"
