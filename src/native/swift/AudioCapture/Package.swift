// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "AudioCapture",
    platforms: [.macOS(.v12)],
    targets: [
        .executableTarget(
            name: "audiocapture",
            path: "Sources/AudioCapture"
        )
    ]
)
