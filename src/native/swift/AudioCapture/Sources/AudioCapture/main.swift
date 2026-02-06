import AppKit
import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

enum Log {
    static func error(_ message: String) {
        write("[AudioCapture] ERROR: \(message)")
    }

    static func info(_ message: String) {
        write("[AudioCapture] \(message)")
    }

    private static func write(_ message: String) {
        let line = "\(message)\n"
        if let data = line.data(using: .utf8) {
            FileHandle.standardError.write(data)
        }
    }
}

@available(macOS 13.0, *)
final class AudioCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    private let outputHandle = FileHandle.standardOutput
    private let audioQueue = DispatchQueue(label: "raven.audiocapture.audio")
    private var stream: SCStream?
    private var captureStarted = false

    func start() async throws {
        Log.info("Getting shareable content...")
        let content = try await SCShareableContent.excludingDesktopWindows(
            false,
            onScreenWindowsOnly: true
        )

        Log.info("Got shareable content")
        Log.info("Displays: \(content.displays.count), Windows: \(content.windows.count), Apps: \(content.applications.count)")

        if content.displays.isEmpty {
            Log.error("No displays returned in shareable content")
        }

        guard let display = content.displays.first else {
            throw NSError(domain: "AudioCapture", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "No displays available"
            ])
        }

        let displayId = display.displayID
        let displayName = resolveDisplayName(displayId: displayId) ?? "unknown"
        Log.info("Using display id=\(displayId), name=\"\(displayName)\", size=\(display.width)x\(display.height)")
        Log.info("Display description: \(String(describing: display))")

        Log.info("Creating content filter...")
        let filter = SCContentFilter(display: display, excludingWindows: [])
        Log.info("Creating stream configuration...")
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = false
        config.sampleRate = 48_000
        config.channelCount = 1
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)

        Log.info(
            "Stream config: capturesAudio=\(config.capturesAudio), excludesCurrentProcessAudio=\(config.excludesCurrentProcessAudio), sampleRate=\(config.sampleRate), channels=\(config.channelCount), size=\(config.width)x\(config.height)"
        )

        Log.info("Creating stream...")
        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        Log.info("Stream created: \(stream)")
        Log.info("Adding audio output...")
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: audioQueue)
        Log.info("Stream output added")
        self.stream = stream

        Log.info("Starting capture (delayed 100ms)...")
        try await Task.sleep(nanoseconds: 100_000_000)

        let maxAttempts = 3
        var lastError: Error? = nil

        for attempt in 1...maxAttempts {
            Log.info("Start capture attempt \(attempt)/\(maxAttempts)")
            
            do {
                // Timeout after 3 seconds using task group race
                try await withThrowingTaskGroup(of: Void.self) { group in
                    group.addTask {
                        try await stream.startCapture()
                    }
                    group.addTask {
                        try await Task.sleep(nanoseconds: 3_000_000_000) // 3 sec timeout
                        throw NSError(domain: "AudioCapture", code: 3, 
                            userInfo: [NSLocalizedDescriptionKey: "startCapture timed out"])
                    }
                    // First to complete wins, cancel the other
                    try await group.next()
                    group.cancelAll()
                }
                
                captureStarted = true
                Log.info("Audio capture started")
                return
            } catch {
                lastError = error
                Log.error("startCapture failed: \(error.localizedDescription)")
                if attempt < maxAttempts {
                    let delayMs = attempt * 500 // 500ms, 1000ms increasing backoff
                    Log.info("Retrying in \(delayMs)ms...")
                    try await Task.sleep(nanoseconds: UInt64(delayMs) * 1_000_000)
                }
            }
        }

        throw lastError ?? NSError(
            domain: "AudioCapture",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey: "startCapture failed after \(maxAttempts) retries"]
        )
    }

    func stop() async {
        guard let stream = stream else { return }
        do {
            try await stream.stopCapture()
        } catch {
            Log.error("Failed to stop capture: \(error)")
        }
        self.stream = nil
        Log.info("Audio capture stopped")
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        Log.error("Stream stopped with error: \(error.localizedDescription) (\(error))")
        if captureStarted {
            exit(1)
        }
    }

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType
    ) {
        guard type == .audio else { return }
        guard CMSampleBufferDataIsReady(sampleBuffer) else { return }

        guard let formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc)?.pointee
        else {
            Log.error("Missing audio format description (formatDesc or ASBD is nil)")
            return
        }

        let sampleRate = asbd.mSampleRate
        let channels = Int(asbd.mChannelsPerFrame)

        var blockBuffer: CMBlockBuffer?
        var audioBufferList = AudioBufferList(
            mNumberBuffers: 1,
            mBuffers: AudioBuffer(mNumberChannels: 0, mDataByteSize: 0, mData: nil)
        )

        let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer,
            bufferListSizeNeededOut: nil,
            bufferListOut: &audioBufferList,
            bufferListSize: MemoryLayout<AudioBufferList>.size,
            blockBufferAllocator: nil,
            blockBufferMemoryAllocator: nil,
            flags: 0,
            blockBufferOut: &blockBuffer
        )

        guard status == noErr else {
            Log.error("AudioBufferList extract failed: \(status)")
            return
        }

        let audioBuffer = audioBufferList.mBuffers
        guard let dataPtr = audioBuffer.mData else {
            Log.error("Audio buffer data is null")
            return
        }

        let byteCount = Int(audioBuffer.mDataByteSize)
        if byteCount == 0 { return }

        let floatCount = byteCount / MemoryLayout<Float>.size
        let floatPtr = dataPtr.bindMemory(to: Float.self, capacity: floatCount)
        let floatBuf = UnsafeBufferPointer(start: floatPtr, count: floatCount)

        let mono: [Float]
        if channels <= 1 {
            mono = Array(floatBuf)
        } else {
            let frames = floatCount / channels
            var downmixed = [Float](repeating: 0, count: frames)
            for i in 0..<frames {
                downmixed[i] = floatBuf[i * channels]
            }
            mono = downmixed
        }

        let int16 = downsampleToInt16(mono, fromRate: sampleRate, toRate: 16_000)
        if int16.isEmpty { return }

        let data = int16.withUnsafeBufferPointer { Data(buffer: $0) }
        do {
            try outputHandle.write(contentsOf: data)
        } catch {
            Log.error("stdout write failed: \(error) (\(String(reflecting: error)))")
        }
    }
}

func downsampleToInt16(_ input: [Float], fromRate: Double, toRate: Double) -> [Int16] {
    guard !input.isEmpty else { return [] }
    let ratio = fromRate / toRate

    if ratio > 0.999 && ratio < 1.001 {
        return input.map(floatToInt16)
    }

    let newLen = Int(Double(input.count) / ratio)
    if newLen <= 0 { return [] }

    var output = [Int16](repeating: 0, count: newLen)
    for i in 0..<newLen {
        let srcIndex = min(Int(Double(i) * ratio), input.count - 1)
        output[i] = floatToInt16(input[srcIndex])
    }
    return output
}

func floatToInt16(_ value: Float) -> Int16 {
    let clamped = max(-1.0, min(1.0, value))
    if clamped < 0 {
        return Int16(clamped * 32768.0)
    }
    return Int16(clamped * 32767.0)
}

@available(macOS 13.0, *)
func resolveDisplayName(displayId: CGDirectDisplayID) -> String? {
    for screen in NSScreen.screens {
        if let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber,
           number.uint32Value == displayId {
            return screen.localizedName
        }
    }
    return nil
}

@available(macOS 13.0, *)
func checkPermission() async -> Bool {
    do {
        _ = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        return true
    } catch {
        Log.error("Permission check failed: \(error)")
        return false
    }
}

@available(macOS 13.0, *)
func installSignalHandlers(capture: AudioCapture) {
    signal(SIGTERM, SIG_IGN)
    signal(SIGINT, SIG_IGN)

    let termSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    termSource.setEventHandler {
        Log.info("Received SIGTERM, shutting down")
        Task {
            await capture.stop()
            exit(0)
        }
    }
    termSource.resume()

    let intSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
    intSource.setEventHandler {
        Log.info("Received SIGINT, shutting down")
        Task {
            await capture.stop()
            exit(0)
        }
    }
    intSource.resume()
}

@main
struct Runner {
    static func main() {
        guard #available(macOS 13.0, *) else {
            Log.error("System audio capture requires macOS 13.0 or newer")
            exit(1)
        }

        let capture = AudioCapture()
        installSignalHandlers(capture: capture)

        if CommandLine.arguments.contains("--check") ||
            CommandLine.arguments.contains("--request") {
            let semaphore = DispatchSemaphore(value: 0)
            var ok = false
            Task {
                ok = await checkPermission()
                semaphore.signal()
            }
            semaphore.wait()
            exit(ok ? 0 : 1)
        }

        Task {
            do {
                try await capture.start()
            } catch {
                Log.error("Failed to start capture: \(error)")
                exit(1)
            }
        }

        dispatchMain()
    }
}
