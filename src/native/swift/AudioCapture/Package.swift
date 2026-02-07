// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AudioCapture",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "audiocapture", targets: ["AudioCapture"])
    ],
    targets: [
        .executableTarget(
            name: "AudioCapture",
            dependencies: ["CAecBridge"],
            path: "Sources/AudioCapture",
            linkerSettings: [
                .unsafeFlags([
                    "-L", "../../webrtc-aec/lib/macos",
                    "-L", "../../webrtc-aec/lib/Darwin",
                    "-lraven_aec",
                    "-lwebrtc_audio_processing",
                    "-lcommon_audio",
                    "-lsystem_wrappers",
                    "-lwebrtc",
                    "-lc++",
                    "-lc++abi"
                ]),
                .linkedFramework("Accelerate"),
                .linkedFramework("AudioToolbox"),
                .linkedFramework("CoreAudio"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("ScreenCaptureKit")
            ]
        ),
        .target(
            name: "CAecBridge",
            path: "Sources/CAecBridge",
            publicHeadersPath: "include"
        )
    ],
    cxxLanguageStandard: .cxx14
)
