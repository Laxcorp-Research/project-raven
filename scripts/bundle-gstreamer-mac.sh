#!/bin/bash
set -e

# Collect GStreamer dylibs needed for the Electron app bundle on macOS.
# This creates build/gstreamer-bundle/ with plugins/ and lib/ directories
# that electron-builder copies into app resources.

PROJ_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE_DIR="$PROJ_DIR/build/gstreamer-bundle"
PLUGINS_OUT="$BUNDLE_DIR/plugins"
LIB_OUT="$BUNDLE_DIR/lib"

rm -rf "$BUNDLE_DIR"
mkdir -p "$PLUGINS_OUT" "$LIB_OUT"

echo "=== Bundling GStreamer for macOS ==="

# GStreamer plugin dir (from Homebrew)
GST_PLUGIN_DIR=$(pkg-config --variable=pluginsdir gstreamer-1.0 2>/dev/null)
if [ -z "$GST_PLUGIN_DIR" ]; then
    GST_PLUGIN_DIR="/opt/homebrew/lib/gstreamer-1.0"
fi
echo "GStreamer plugin dir: $GST_PLUGIN_DIR"

# Core plugins needed by our pipeline
CORE_PLUGINS=(
    "libgstapp.dylib"           # appsrc, appsink
    "libgstaudioconvert.dylib"  # audioconvert
    "libgstaudioresample.dylib" # audioresample
    "libgstcoreelements.dylib"  # fakesink, identity, etc.
)

for plugin in "${CORE_PLUGINS[@]}"; do
    src="$GST_PLUGIN_DIR/$plugin"
    if [ -f "$src" ]; then
        cp "$src" "$PLUGINS_OUT/"
        echo "  Plugin: $plugin"
    else
        echo "  WARNING: $plugin not found at $src"
    fi
done

# Shared libraries needed by raven-aec.node and the plugins
GST_LIB_DIR=$(pkg-config --variable=libdir gstreamer-1.0)
GLIB_LIB_DIR=$(pkg-config --variable=libdir glib-2.0)

SHARED_LIBS=(
    "$GST_LIB_DIR/libgstreamer-1.0.0.dylib"
    "$GST_LIB_DIR/libgstbase-1.0.0.dylib"
    "$GST_LIB_DIR/libgstapp-1.0.0.dylib"
    "$GST_LIB_DIR/libgstaudio-1.0.0.dylib"
    "$GST_LIB_DIR/libgstbadaudio-1.0.0.dylib"
    "$GST_LIB_DIR/libgsttag-1.0.0.dylib"
    "$GLIB_LIB_DIR/libglib-2.0.0.dylib"
    "$GLIB_LIB_DIR/libgobject-2.0.0.dylib"
    "$GLIB_LIB_DIR/libgmodule-2.0.0.dylib"
    "$GLIB_LIB_DIR/libgio-2.0.0.dylib"
)

# Also get libintl from gettext
INTL_LIB="/opt/homebrew/opt/gettext/lib/libintl.8.dylib"
if [ -f "$INTL_LIB" ]; then
    SHARED_LIBS+=("$INTL_LIB")
fi

# liborc (used by audioresample)
ORC_LIB="/opt/homebrew/opt/orc/lib/liborc-0.4.0.dylib"
if [ -f "$ORC_LIB" ]; then
    SHARED_LIBS+=("$ORC_LIB")
fi

# libffi (used by glib)
FFI_LIB="/opt/homebrew/opt/libffi/lib/libffi.8.dylib"
if [ -f "$FFI_LIB" ]; then
    SHARED_LIBS+=("$FFI_LIB")
fi

# pcre2 (used by glib)
PCRE_LIB="/opt/homebrew/opt/pcre2/lib/libpcre2-8.0.dylib"
if [ -f "$PCRE_LIB" ]; then
    SHARED_LIBS+=("$PCRE_LIB")
fi

for lib in "${SHARED_LIBS[@]}"; do
    if [ -f "$lib" ]; then
        base=$(basename "$lib")
        cp "$lib" "$LIB_OUT/$base"
        echo "  Lib: $base"
    else
        echo "  WARNING: $(basename "$lib") not found at $lib"
    fi
done

echo ""
echo "Bundle created at $BUNDLE_DIR"
echo "  Plugins: $(ls "$PLUGINS_OUT" | wc -l | tr -d ' ') files"
echo "  Libs: $(ls "$LIB_OUT" | wc -l | tr -d ' ') files"
echo ""
echo "NOTE: For production builds, you'll also need to run install_name_tool"
echo "to rewrite dylib paths to use @rpath or @loader_path references."
