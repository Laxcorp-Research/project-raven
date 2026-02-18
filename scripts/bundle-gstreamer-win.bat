@echo off
setlocal enabledelayedexpansion

:: Collect GStreamer DLLs needed for the Electron app on Windows.
:: Creates build\gstreamer-bundle-win\ with plugins\ and lib\ directories
:: that electron-builder copies into app resources.

set "PROJ_DIR=%~dp0.."
set "BUNDLE_DIR=%PROJ_DIR%\build\gstreamer-bundle-win"
set "PLUGINS_OUT=%BUNDLE_DIR%\plugins"
set "LIB_OUT=%BUNDLE_DIR%\lib"

:: Clean previous bundle
if exist "%BUNDLE_DIR%" rmdir /s /q "%BUNDLE_DIR%"
mkdir "%PLUGINS_OUT%"
mkdir "%LIB_OUT%"

echo === Bundling GStreamer for Windows ===
echo.

:: Locate GStreamer installation
set "GST_ROOT=%GSTREAMER_1_0_ROOT_MSVC_X86_64%"
if "%GST_ROOT%"=="" (
    if exist "C:\gstreamer\1.0\msvc_x86_64" (
        set "GST_ROOT=C:\gstreamer\1.0\msvc_x86_64"
    ) else (
        echo ERROR: GStreamer not found.
        echo Install from https://gstreamer.freedesktop.org/download/
        echo Run build-deps-win.bat first to verify your installation.
        exit /b 1
    )
)

if "%GST_ROOT:~-1%"=="\" set "GST_ROOT=%GST_ROOT:~0,-1%"

echo   GStreamer root: %GST_ROOT%
echo.

set "GST_BIN=%GST_ROOT%\bin"
set "GST_PLUGIN_DIR=%GST_ROOT%\lib\gstreamer-1.0"

:: ---- GStreamer plugins needed by our AEC pipeline ----

echo   --- Plugins ---
set "PLUGIN_COUNT=0"
set "PLUGIN_MISSING=0"

for %%P in (
    gstapp.dll
    gstaudioconvert.dll
    gstaudioresample.dll
    gstcoreelements.dll
    gstwebrtcdsp.dll
) do (
    if exist "%GST_PLUGIN_DIR%\%%P" (
        copy /y "%GST_PLUGIN_DIR%\%%P" "%PLUGINS_OUT%\%%P" >nul
        echo   + %%P
        set /a PLUGIN_COUNT+=1
    ) else (
        echo   ! MISSING: %%P  (expected at %GST_PLUGIN_DIR%\%%P^)
        set /a PLUGIN_MISSING+=1
    )
)

if %PLUGIN_MISSING% GTR 0 (
    echo.
    echo   WARNING: %PLUGIN_MISSING% plugin(s) missing. AEC may not work.
)

:: ---- Shared libraries (DLLs from bin\) ----

echo.
echo   --- Shared Libraries ---
set "LIB_COUNT=0"

:: Core GStreamer runtime DLLs
for %%L in (
    gstreamer-1.0-0.dll
    gstbase-1.0-0.dll
    gstapp-1.0-0.dll
    gstaudio-1.0-0.dll
    gstbadaudio-1.0-0.dll
    gsttag-1.0-0.dll
) do (
    if exist "%GST_BIN%\%%L" (
        copy /y "%GST_BIN%\%%L" "%LIB_OUT%\%%L" >nul
        echo   + %%L
        set /a LIB_COUNT+=1
    ) else (
        echo   - %%L  (not found, may be optional^)
    )
)

:: GLib / GObject / GIO / GModule
for %%L in (
    glib-2.0-0.dll
    gobject-2.0-0.dll
    gmodule-2.0-0.dll
    gio-2.0-0.dll
) do (
    if exist "%GST_BIN%\%%L" (
        copy /y "%GST_BIN%\%%L" "%LIB_OUT%\%%L" >nul
        echo   + %%L
        set /a LIB_COUNT+=1
    ) else (
        echo   - %%L  (not found^)
    )
)

:: Common transitive dependencies
:: Names can vary across GStreamer releases; we try known variants.
for %%L in (
    intl-8.dll
    orc-0.4-0.dll
    pcre2-8-0.dll
) do (
    if exist "%GST_BIN%\%%L" (
        copy /y "%GST_BIN%\%%L" "%LIB_OUT%\%%L" >nul
        echo   + %%L
        set /a LIB_COUNT+=1
    ) else (
        echo   - %%L  (not found, may be optional^)
    )
)

:: libffi — try both version 8 and 7
if exist "%GST_BIN%\ffi-8.dll" (
    copy /y "%GST_BIN%\ffi-8.dll" "%LIB_OUT%\ffi-8.dll" >nul
    echo   + ffi-8.dll
    set /a LIB_COUNT+=1
) else if exist "%GST_BIN%\ffi-7.dll" (
    copy /y "%GST_BIN%\ffi-7.dll" "%LIB_OUT%\ffi-7.dll" >nul
    echo   + ffi-7.dll
    set /a LIB_COUNT+=1
) else (
    echo   - ffi-*.dll  (not found, may be optional^)
)

:: zlib — try common names
if exist "%GST_BIN%\z-1.dll" (
    copy /y "%GST_BIN%\z-1.dll" "%LIB_OUT%\z-1.dll" >nul
    echo   + z-1.dll
    set /a LIB_COUNT+=1
) else if exist "%GST_BIN%\zlib1.dll" (
    copy /y "%GST_BIN%\zlib1.dll" "%LIB_OUT%\zlib1.dll" >nul
    echo   + zlib1.dll
    set /a LIB_COUNT+=1
) else (
    echo   - zlib  (not found, may be optional^)
)

:: webrtc-audio-processing (needed by webrtcdsp plugin at runtime)
for %%L in (
    webrtc-audio-processing-1.dll
    webrtc-audio-processing-1-3.dll
) do (
    if exist "%GST_BIN%\%%L" (
        copy /y "%GST_BIN%\%%L" "%LIB_OUT%\%%L" >nul
        echo   + %%L
        set /a LIB_COUNT+=1
    )
)

:: ---- Summary ----

echo.
echo === Bundle complete ===
echo   Output:  %BUNDLE_DIR%
echo   Plugins: !PLUGIN_COUNT! files  (%PLUGINS_OUT%^)
echo   Libs:    !LIB_COUNT! files  (%LIB_OUT%^)
echo.

if %PLUGIN_MISSING% GTR 0 (
    echo   WARNING: Some plugins were missing. Run build-deps-win.bat to diagnose.
    echo.
)

echo   electron-builder will copy these from:
echo     build/gstreamer-bundle-win/plugins/  -^>  resources/gstreamer-1.0/
echo     build/gstreamer-bundle-win/lib/      -^>  resources/gstreamer-lib/
echo.

endlocal
exit /b 0
