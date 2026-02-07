cmake_minimum_required(VERSION 3.16)
project(raven_aec VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Platform detection
if(APPLE)
    message(STATUS "Building for macOS")
    set(CMAKE_OSX_DEPLOYMENT_TARGET "12.0" CACHE STRING "Minimum macOS version")

    # WebRTC defines for macOS
    add_definitions(-DWEBRTC_POSIX)
    add_definitions(-DWEBRTC_MAC)

elseif(WIN32)
    message(STATUS "Building for Windows")
    add_definitions(-DWEBRTC_WIN)
    add_definitions(-DNOMINMAX)
endif()

# Common WebRTC defines
add_definitions(-DWEBRTC_APM_DEBUG_DUMP=0)
add_definitions(-DWEBRTC_AUDIO_PROCESSING_ONLY_BUILD)
add_definitions(-DNDEBUG)

# Include directories - the key is third_party/webrtc as root
# so that "webrtc/base/arraysize.h" resolves correctly
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party/webrtc
)

# Pre-built WebRTC libraries
if(APPLE)
    set(WEBRTC_LIB_DIR ${CMAKE_CURRENT_SOURCE_DIR}/lib/macos)
elseif(WIN32)
    set(WEBRTC_LIB_DIR ${CMAKE_CURRENT_SOURCE_DIR}/lib/windows)
endif()

# Our AEC wrapper library
add_library(raven_aec STATIC
    src/aec_api.cpp
)

target_include_directories(raven_aec PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party/webrtc
)

# Link pre-built WebRTC libraries
target_link_libraries(raven_aec
    ${WEBRTC_LIB_DIR}/libwebrtc_audio_processing.a
    ${WEBRTC_LIB_DIR}/libcommon_audio.a
    ${WEBRTC_LIB_DIR}/libsystem_wrappers.a
    ${WEBRTC_LIB_DIR}/libwebrtc.a
)

# macOS frameworks
if(APPLE)
    find_library(ACCELERATE_FRAMEWORK Accelerate)
    find_library(AUDIOTOOLBOX_FRAMEWORK AudioToolbox)
    find_library(COREAUDIO_FRAMEWORK CoreAudio)
    target_link_libraries(raven_aec
        ${ACCELERATE_FRAMEWORK}
        ${AUDIOTOOLBOX_FRAMEWORK}
        ${COREAUDIO_FRAMEWORK}
    )
endif()

# Output location
set_target_properties(raven_aec PROPERTIES
    ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/lib/${CMAKE_SYSTEM_NAME}
)

message(STATUS "Raven AEC build configured")
message(STATUS "  Platform: ${CMAKE_SYSTEM_NAME}")
message(STATUS "  WebRTC libs: ${WEBRTC_LIB_DIR}")
