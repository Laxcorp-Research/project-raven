cmake_minimum_required(VERSION 3.15)
cmake_policy(SET CMP0091 NEW)
project(raven-aec)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# cmake-js integration
include_directories(${CMAKE_JS_INC})

# Node-API headers
execute_process(COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
string(REPLACE "\"" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})

# --- GStreamer discovery (platform-specific) ---

if(WIN32)
  # Windows: locate via the official GStreamer MSVC installer's environment variable.
  # The installer sets GSTREAMER_1_0_ROOT_MSVC_X86_64 automatically.
  if(DEFINED ENV{GSTREAMER_1_0_ROOT_MSVC_X86_64})
    file(TO_CMAKE_PATH "$ENV{GSTREAMER_1_0_ROOT_MSVC_X86_64}" GSTREAMER_ROOT)
  elseif(EXISTS "C:/gstreamer/1.0/msvc_x86_64")
    set(GSTREAMER_ROOT "C:/gstreamer/1.0/msvc_x86_64")
  else()
    message(FATAL_ERROR
      "GStreamer not found. Install the MSVC x86_64 runtime and development "
      "packages from https://gstreamer.freedesktop.org/download/ or set the "
      "GSTREAMER_1_0_ROOT_MSVC_X86_64 environment variable.")
  endif()

  message(STATUS "GStreamer root: ${GSTREAMER_ROOT}")

  set(GST_INCLUDE_DIRS
    "${GSTREAMER_ROOT}/include/gstreamer-1.0"
    "${GSTREAMER_ROOT}/include/glib-2.0"
    "${GSTREAMER_ROOT}/lib/glib-2.0/include"
  )
  set(GST_APP_INCLUDE_DIRS ${GST_INCLUDE_DIRS})
  set(GST_AUDIO_INCLUDE_DIRS ${GST_INCLUDE_DIRS})

  set(GST_LIBRARY_DIRS "${GSTREAMER_ROOT}/lib")
  set(GST_APP_LIBRARY_DIRS "${GSTREAMER_ROOT}/lib")
  set(GST_AUDIO_LIBRARY_DIRS "${GSTREAMER_ROOT}/lib")

  find_library(GST_LIB gstreamer-1.0 PATHS "${GSTREAMER_ROOT}/lib" NO_DEFAULT_PATH REQUIRED)
  find_library(GST_BASE_LIB gstbase-1.0 PATHS "${GSTREAMER_ROOT}/lib" NO_DEFAULT_PATH REQUIRED)
  find_library(GST_APP_LIB gstapp-1.0 PATHS "${GSTREAMER_ROOT}/lib" NO_DEFAULT_PATH REQUIRED)
  find_library(GST_AUDIO_LIB gstaudio-1.0 PATHS "${GSTREAMER_ROOT}/lib" NO_DEFAULT_PATH REQUIRED)

  set(GST_LIBRARIES ${GST_LIB} ${GST_BASE_LIB})
  set(GST_APP_LIBRARIES ${GST_APP_LIB})
  set(GST_AUDIO_LIBRARIES ${GST_AUDIO_LIB})

else()
  # macOS / Linux: use pkg-config
  find_package(PkgConfig REQUIRED)
  pkg_check_modules(GST REQUIRED gstreamer-1.0)
  pkg_check_modules(GST_APP REQUIRED gstreamer-app-1.0)
  pkg_check_modules(GST_AUDIO REQUIRED gstreamer-audio-1.0)
endif()

# --- Common build targets ---

include_directories(
  ${NODE_ADDON_API_DIR}
  ${GST_INCLUDE_DIRS}
  ${GST_APP_INCLUDE_DIRS}
  ${GST_AUDIO_INCLUDE_DIRS}
)

link_directories(
  ${GST_LIBRARY_DIRS}
  ${GST_APP_LIBRARY_DIRS}
  ${GST_AUDIO_LIBRARY_DIRS}
)

add_library(${PROJECT_NAME} SHARED
  src/aec_addon.cpp
)

set_target_properties(${PROJECT_NAME} PROPERTIES
  PREFIX ""
  SUFFIX ".node"
)

target_link_libraries(${PROJECT_NAME}
  ${CMAKE_JS_LIB}
  ${GST_LIBRARIES}
  ${GST_APP_LIBRARIES}
  ${GST_AUDIO_LIBRARIES}
)

if(APPLE)
  target_link_libraries(${PROJECT_NAME}
    "-framework Foundation"
    "-framework CoreFoundation"
  )
endif()

target_compile_definitions(${PROJECT_NAME} PRIVATE
  NAPI_VERSION=8
  NODE_ADDON_API_DISABLE_DEPRECATED
)
