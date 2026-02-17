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
            path: "Sources/AudioCapture",
            linkerSettings: [
                .linkedFramework("Accelerate"),
                .linkedFramework("AudioToolbox"),
                .linkedFramework("CoreAudio"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("ScreenCaptureKit")
            ]
        )
    ]
)
