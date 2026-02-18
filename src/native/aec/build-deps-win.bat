@echo off
setlocal enabledelayedexpansion

echo === Verifying GStreamer AEC dependencies (Windows) ===
echo.

:: Locate GStreamer installation via the official installer's environment variable
set "GSTREAMER_ROOT=%GSTREAMER_1_0_ROOT_MSVC_X86_64%"

if "%GSTREAMER_ROOT%"=="" (
    if exist "C:\gstreamer\1.0\msvc_x86_64" (
        set "GSTREAMER_ROOT=C:\gstreamer\1.0\msvc_x86_64"
    ) else (
        echo ERROR: GStreamer not found.
        echo.
        echo Install GStreamer from https://gstreamer.freedesktop.org/download/
        echo You need BOTH packages for MSVC x86_64:
        echo   1. Runtime installer  (gstreamer-1.0-msvc-x86_64-*.msi^)
        echo   2. Development installer (gstreamer-1.0-devel-msvc-x86_64-*.msi^)
        echo.
        echo Choose the "Complete" installation to include all plugins (including webrtcdsp^).
        echo.
        echo After installation, the GSTREAMER_1_0_ROOT_MSVC_X86_64 environment variable
        echo should be set automatically. You may need to restart your terminal.
        exit /b 1
    )
)

:: Strip trailing backslash if present
if "%GSTREAMER_ROOT:~-1%"=="\" set "GSTREAMER_ROOT=%GSTREAMER_ROOT:~0,-1%"

echo   GStreamer root: %GSTREAMER_ROOT%

:: --- Check runtime ---

if not exist "%GSTREAMER_ROOT%\bin\gst-inspect-1.0.exe" (
    echo ERROR: gst-inspect-1.0.exe not found in %GSTREAMER_ROOT%\bin\
    echo The GStreamer runtime package may not be installed.
    exit /b 1
)
echo   gst-inspect-1.0: OK

:: --- Check development headers ---

if not exist "%GSTREAMER_ROOT%\include\gstreamer-1.0\gst\gst.h" (
    echo ERROR: GStreamer development headers not found.
    echo Install the GStreamer development package (gstreamer-1.0-devel-msvc-x86_64-*.msi^).
    exit /b 1
)
echo   GStreamer dev headers: OK

if not exist "%GSTREAMER_ROOT%\include\glib-2.0\glib.h" (
    echo ERROR: GLib headers not found. Development package may be incomplete.
    exit /b 1
)
echo   GLib dev headers: OK

:: --- Check import libraries ---

set "LIB_DIR=%GSTREAMER_ROOT%\lib"
set "MISSING_LIBS=0"
for %%L in (gstreamer-1.0 gstbase-1.0 gstapp-1.0 gstaudio-1.0) do (
    if not exist "%LIB_DIR%\%%L.lib" (
        echo   WARNING: %%L.lib not found in %LIB_DIR%
        set /a MISSING_LIBS+=1
    ) else (
        echo   %%L.lib: OK
    )
)
if %MISSING_LIBS% GTR 0 (
    echo ERROR: %MISSING_LIBS% import libraries missing. CMake build will fail.
    echo Ensure the GStreamer development package is installed.
    exit /b 1
)

:: --- Check runtime DLLs ---

set "BIN_DIR=%GSTREAMER_ROOT%\bin"
echo.
echo   Checking runtime DLLs...
for %%D in (
    gstreamer-1.0-0.dll
    gstbase-1.0-0.dll
    gstapp-1.0-0.dll
    gstaudio-1.0-0.dll
    glib-2.0-0.dll
    gobject-2.0-0.dll
) do (
    if not exist "%BIN_DIR%\%%D" (
        echo   WARNING: %%D not found in %BIN_DIR%
    ) else (
        echo   %%D: OK
    )
)

:: --- Check for webrtcdsp plugin (included in complete installation) ---

echo.
set "PLUGIN_DIR=%GSTREAMER_ROOT%\lib\gstreamer-1.0"

if not exist "%PLUGIN_DIR%\gstwebrtcdsp.dll" (
    echo ERROR: webrtcdsp plugin not found at %PLUGIN_DIR%\gstwebrtcdsp.dll
    echo.
    echo This plugin is included in the "Complete" GStreamer installation.
    echo Please reinstall GStreamer and select "Complete" during setup.
    echo Download: https://gstreamer.freedesktop.org/download/
    exit /b 1
)
echo   webrtcdsp plugin DLL: OK

:: Verify the elements actually load
echo.
echo   Verifying plugin elements load...

"%BIN_DIR%\gst-inspect-1.0.exe" webrtcdsp >nul 2>&1
if errorlevel 1 (
    echo   WARNING: webrtcdsp element failed to load via gst-inspect-1.0.
    echo   The DLL exists but may have unresolved dependencies.
) else (
    echo   webrtcdsp element: loads OK
)

"%BIN_DIR%\gst-inspect-1.0.exe" webrtcechoprobe >nul 2>&1
if errorlevel 1 (
    echo   WARNING: webrtcechoprobe element failed to load via gst-inspect-1.0.
) else (
    echo   webrtcechoprobe element: loads OK
)

:: --- Check for core pipeline plugins ---

echo.
echo   Checking core pipeline plugins...
for %%P in (gstapp.dll gstaudioconvert.dll gstaudioresample.dll gstcoreelements.dll) do (
    if not exist "%PLUGIN_DIR%\%%P" (
        echo   WARNING: %%P not found in %PLUGIN_DIR%
    ) else (
        echo   %%P: OK
    )
)

:: --- Summary ---

echo.
echo === All GStreamer AEC dependencies satisfied ===
echo   Root:    %GSTREAMER_ROOT%
echo   Libs:    %LIB_DIR%
echo   Plugins: %PLUGIN_DIR%
echo.
echo   Next steps:
echo     1. npx cmake-js compile --CDCMAKE_BUILD_TYPE=Release   (from src\native\aec\)
echo     2. scripts\bundle-gstreamer-win.bat                     (collect DLLs for packaging)
echo.

endlocal
exit /b 0
