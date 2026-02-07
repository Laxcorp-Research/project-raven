import Foundation
import ScreenCaptureKit
import AVFoundation
import AudioToolbox
import CoreMedia
import CAecBridge

// MARK: - Audio Chunk Types
enum AudioSource: String {
    case system = "system"
    case mic = "mic"
}

// MARK: - Audio Delay Buffer
final class AudioDelayBuffer {
    private var buffer: [Int16]
    private var writeIndex = 0
    private var readIndex = 0
    private let capacity: Int
    private var filled = 0
    private let delayFrames: Int
    
    /// Create buffer with delay in milliseconds at given sample rate
    init(delayMs: Int, sampleRate: Int = 16000) {
        self.delayFrames = (delayMs * sampleRate) / 1000
        self.capacity = delayFrames * 2
        self.buffer = [Int16](repeating: 0, count: capacity)
        fputs("[DelayBuffer] Created with \(delayMs)ms delay (\(delayFrames) samples)\n", stderr)
    }
    
    /// Write samples and get delayed samples back
    func process(_ input: [Int16]) -> [Int16]? {
        for sample in input {
            buffer[writeIndex] = sample
            writeIndex = (writeIndex + 1) % capacity
            filled = min(filled + 1, capacity)
        }
        
        if filled < delayFrames {
            return nil
        }
        
        var output = [Int16](repeating: 0, count: input.count)
        for i in 0..<input.count {
            output[i] = buffer[readIndex]
            readIndex = (readIndex + 1) % capacity
        }
        
        return output
    }
    
    func reset() {
        buffer = [Int16](repeating: 0, count: capacity)
        writeIndex = 0
        readIndex = 0
        filled = 0
    }
}

// MARK: - WebRTC AEC Processor Wrapper
final class AECProcessor {
    private var processor: OpaquePointer?
    private let sampleRate: Int32
    private let frameSize: Int32  // samples per 10ms frame
    private var outputBuffer: [Int16]
    private let lock = NSLock()
    
    init(sampleRate: Int32 = 16000) {
        self.sampleRate = sampleRate
        self.frameSize = sampleRate / 100  // 10ms = 160 samples at 16kHz
        self.outputBuffer = [Int16](repeating: 0, count: Int(frameSize))
        
        processor = raven_aec_create(sampleRate)
        if processor == nil {
            fputs("[AEC] Failed to create processor\n", stderr)
        } else {
            fputs("[AEC] Created (sampleRate=\(sampleRate), frameSize=\(frameSize))\n", stderr)
        }
    }
    
    deinit {
        if let proc = processor {
            raven_aec_destroy(proc)
        }
    }
    
    /// Feed speaker/system audio as reference signal
    func processRender(samples: UnsafePointer<Int16>, count: Int) {
        guard let proc = processor else { return }
        lock.lock()
        defer { lock.unlock() }
        
        // Process in 10ms frames
        var offset = 0
        while offset + Int(frameSize) <= count {
            let result = raven_aec_process_render(proc, samples.advanced(by: offset), frameSize)
            if result != 0 {
                fputs("[AEC] processRender error: \(result)\n", stderr)
            }
            offset += Int(frameSize)
        }
    }
    
    /// Process microphone audio, removing echo
    func processCapture(samples: UnsafePointer<Int16>, count: Int) -> Data {
        guard let proc = processor else {
            return Data(bytes: samples, count: count * MemoryLayout<Int16>.size)
        }
        
        lock.lock()
        defer { lock.unlock() }
        
        var result = Data()
        result.reserveCapacity(count * MemoryLayout<Int16>.size)
        
        // Process in 10ms frames
        var offset = 0
        while offset + Int(frameSize) <= count {
            let status = raven_aec_process_capture(
                proc,
                samples.advanced(by: offset),
                &outputBuffer,
                frameSize
            )
            
            if status != 0 {
                // On error, pass through original
                let byteCount = Int(frameSize) * MemoryLayout<Int16>.size
                let rawBytes = UnsafeRawBufferPointer(
                    start: samples.advanced(by: offset),
                    count: byteCount
                )
                result.append(contentsOf: rawBytes)
            } else {
                outputBuffer.withUnsafeBufferPointer { buffer in
                    let bytes = UnsafeRawBufferPointer(buffer)
                    result.append(contentsOf: bytes)
                }
            }
            offset += Int(frameSize)
        }
        
        return result
    }
    
    func setStreamDelay(ms: Int32) {
        guard let proc = processor else { return }
        raven_aec_set_stream_delay(proc, ms)
    }

    struct Stats {
        var erl: Float = 0
        var erle: Float = 0
        var delay: Int32 = 0
        var diverged: Bool = false
    }
    
    func getStats() -> Stats {
        guard let proc = processor else {
            return Stats()
        }
        
        var cStats = RavenAecStats()
        raven_aec_get_stats(proc, &cStats)
        
        return Stats(
            erl: cStats.echo_return_loss,
            erle: cStats.echo_return_loss_enhancement,
            delay: Int32(cStats.delay_ms),
            diverged: cStats.diverged
        )
    }

    func reset() {
        guard let proc = processor else { return }
        lock.lock()
        defer { lock.unlock() }
        raven_aec_reset(proc)
    }
}

// MARK: - Mic Capture with Apple Voice Processing
@available(macOS 14.0, *)
final class MicCapture {
    private let engine = AVAudioEngine()
    private var onData: ((Data) -> Void)?
    private let targetSampleRate: Double = 16000
    
    func start(onData: @escaping (Data) -> Void) throws {
        self.onData = onData
        
        let inputNode = engine.inputNode
        
        // Enable Apple's Voice Processing (AEC + Noise Suppression + AGC)
        do {
            try inputNode.setVoiceProcessingEnabled(true)
            fputs("[Mic] Voice Processing ENABLED (Apple AEC)\n", stderr)
        } catch {
            fputs("[Mic] WARNING: Voice Processing failed: \(error). Continuing without AEC.\n", stderr)
        }
        
        let inputFormat = inputNode.outputFormat(forBus: 0)
        fputs("[Mic] Input format: \(inputFormat.sampleRate)Hz, \(inputFormat.channelCount) channels\n", stderr)
        
        // Buffer size for ~20ms at input sample rate
        let bufferSize = AVAudioFrameCount(inputFormat.sampleRate * 0.02)
        
        inputNode.installTap(onBus: 0, bufferSize: bufferSize, format: inputFormat) { [weak self] buffer, _ in
            self?.processAudioBuffer(buffer)
        }
        
        try engine.start()
        fputs("[Mic] Started with Voice Processing\n", stderr)
    }
    
    private func processAudioBuffer(_ buffer: AVAudioPCMBuffer) {
        guard let onData = self.onData,
              let floatData = buffer.floatChannelData else { return }
        
        let frameCount = Int(buffer.frameLength)
        let inputSampleRate = buffer.format.sampleRate
        
        // Extract channel 0 only (mono) - Voice Processing may return multiple channels
        let channel0 = floatData[0]
        
        // Calculate output frame count for resampling
        let ratio = targetSampleRate / inputSampleRate
        let outputFrameCount = Int(Double(frameCount) * ratio)
        
        // Simple linear resampling from input rate to 16kHz
        var resampled = [Float](repeating: 0, count: outputFrameCount)
        for i in 0..<outputFrameCount {
            let srcIndex = Double(i) / ratio
            let srcIndexInt = Int(srcIndex)
            let frac = Float(srcIndex - Double(srcIndexInt))
            
            if srcIndexInt + 1 < frameCount {
                // Linear interpolation
                resampled[i] = channel0[srcIndexInt] * (1 - frac) + channel0[srcIndexInt + 1] * frac
            } else if srcIndexInt < frameCount {
                resampled[i] = channel0[srcIndexInt]
            }
        }
        
        // Convert Float32 to Int16
        var int16Samples = [Int16](repeating: 0, count: outputFrameCount)
        for i in 0..<outputFrameCount {
            let sample = max(-1.0, min(1.0, resampled[i]))
            int16Samples[i] = Int16(sample * 32767.0)
        }
        
        // Create data
        let data = int16Samples.withUnsafeBufferPointer { buffer in
            Data(buffer: buffer)
        }
        
        onData(data)
    }
    
    func stop() {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        fputs("[Mic] Stopped\n", stderr)
    }
}

// MARK: - System Audio Capture (ScreenCaptureKit)
@available(macOS 13.0, *)
class SystemAudioCapture: NSObject, SCStreamDelegate, SCStreamOutput {
    private var stream: SCStream?
    private var isRunning = false
    private let callback: (Data) -> Void
    private var captureStarted = false
    
    init(callback: @escaping (Data) -> Void) {
        self.callback = callback
        super.init()
    }
    
    func start() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(
            false,
            onScreenWindowsOnly: false
        )
        
        guard let display = content.displays.first else {
            throw NSError(domain: "SystemAudio", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "No display found"
            ])
        }
        
        let filter = SCContentFilter(display: display, excludingWindows: [])
        
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = 48000
        config.channelCount = 1
        
        // Minimal video capture (required by ScreenCaptureKit)
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        
        stream = SCStream(filter: filter, configuration: config, delegate: self)
        guard let stream = stream else {
            throw NSError(domain: "SystemAudio", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Failed to create SCStream"
            ])
        }
        
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: .main)
        
        // Retry logic with timeout
        var lastError: Error?
        for attempt in 1...3 {
            do {
                try await withThrowingTaskGroup(of: Void.self) { group in
                    group.addTask {
                        try await stream.startCapture()
                    }
                    group.addTask {
                        try await Task.sleep(nanoseconds: 3_000_000_000)
                        throw NSError(domain: "SystemAudio", code: 3, userInfo: [
                            NSLocalizedDescriptionKey: "startCapture timed out"
                        ])
                    }
                    try await group.next()
                    group.cancelAll()
                }
                captureStarted = true
                isRunning = true
                fputs("[SystemAudio] Started (attempt \(attempt))\n", stderr)
                return
            } catch {
                lastError = error
                fputs("[SystemAudio] Attempt \(attempt) failed: \(error.localizedDescription)\n", stderr)
                if attempt < 3 {
                    try await Task.sleep(nanoseconds: UInt64(attempt) * 500_000_000)
                }
            }
        }
        
        throw lastError ?? NSError(domain: "SystemAudio", code: 4, userInfo: [
            NSLocalizedDescriptionKey: "Failed after 3 attempts"
        ])
    }
    
    func stop() {
        if let stream = stream {
            Task { try? await stream.stopCapture() }
        }
        stream = nil
        isRunning = false
        fputs("[SystemAudio] Stopped\n", stderr)
    }
    
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, captureStarted else { return }
        
        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }
        
        var length = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        let status = CMBlockBufferGetDataPointer(
            blockBuffer,
            atOffset: 0,
            lengthAtOffsetOut: nil,
            totalLengthOut: &length,
            dataPointerOut: &dataPointer
        )
        
        guard status == kCMBlockBufferNoErr, let data = dataPointer else { return }
        
        guard let formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc) else { return }
        
        let sampleRate = asbd.pointee.mSampleRate
        let bytesPerSample = asbd.pointee.mBitsPerChannel / 8
        let isFloat = (asbd.pointee.mFormatFlags & kAudioFormatFlagIsFloat) != 0
        
        let floatSamples: [Float]
        if isFloat && bytesPerSample == 4 {
            let floatPtr = UnsafeRawPointer(data).bindMemory(to: Float.self, capacity: length / 4)
            floatSamples = Array(UnsafeBufferPointer(start: floatPtr, count: length / 4))
        } else {
            return
        }
        
        // Downsample to 16kHz
        let ratio = Int(sampleRate / 16000)
        var downsampled = [Int16]()
        downsampled.reserveCapacity(floatSamples.count / max(1, ratio))
        
        for i in stride(from: 0, to: floatSamples.count, by: max(1, ratio)) {
            let sample = max(-1.0, min(1.0, floatSamples[i]))
            downsampled.append(Int16(sample * 32767))
        }
        
        let bytes = downsampled.withUnsafeBufferPointer { buffer in
            Data(bytes: buffer.baseAddress!, count: buffer.count * 2)
        }
        
        callback(bytes)
    }
    
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        if captureStarted {
            fputs("[SystemAudio] Stream stopped with error: \(error.localizedDescription)\n", stderr)
        }
    }
}

// MARK: - Main
@available(macOS 14.0, *)
struct AudioCaptureApp {
    static var systemCapture: SystemAudioCapture?
    static var micCapture: MicCapture?
    static var systemChunkCount = 0
    static var micChunkCount = 0
    
    static func main() async {
        // Setup signal handlers
        signal(SIGTERM, SIG_IGN)
        signal(SIGINT, SIG_IGN)
        
        let termSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        termSource.setEventHandler {
            fputs("[AudioCapture] Received SIGTERM\n", stderr)
            cleanup()
            exit(0)
        }
        termSource.resume()
        
        let intSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
        intSource.setEventHandler {
            fputs("[AudioCapture] Received SIGINT\n", stderr)
            cleanup()
            exit(0)
        }
        intSource.resume()
        
        fputs("[AudioCapture] Starting dual capture with Apple Voice Processing\n", stderr)
        
        // System audio capture - outputs to "Them" stream
        systemCapture = SystemAudioCapture { data in
            systemChunkCount += 1
            if systemChunkCount <= 5 || systemChunkCount % 100 == 0 {
                fputs("[SystemAudio] Chunk #\(systemChunkCount), bytes: \(data.count)\n", stderr)
            }
            
            // Output system audio directly for "Them" transcript
            writeChunk(source: .system, data: data)
        }
        
        // Mic capture - Apple Voice Processing handles AEC automatically
        micCapture = MicCapture()
        
        do {
            try await systemCapture?.start()
            try micCapture?.start { data in
                micChunkCount += 1
                if micChunkCount <= 5 || micChunkCount % 100 == 0 {
                    fputs("[Mic] Chunk #\(micChunkCount), bytes: \(data.count)\n", stderr)
                }
                
                // Output directly - Voice Processing already removed echo
                writeChunk(source: .mic, data: data)
            }
            
            fputs("[AudioCapture] Both captures running with Voice Processing\n", stderr)
            
            // Keep running
            while true {
                try await Task.sleep(nanoseconds: 1_000_000_000)
            }
        } catch {
            fputs("[AudioCapture] Fatal error: \(error.localizedDescription)\n", stderr)
            cleanup()
            exit(1)
        }
    }
    
    static func writeChunk(source: AudioSource, data: Data) {
        let sourceByte: UInt8 = source == .system ? 0x00 : 0x01
        var length = UInt32(data.count).littleEndian
        
        var packet = Data()
        packet.append(sourceByte)
        packet.append(Data(bytes: &length, count: 4))
        packet.append(data)
        
        FileHandle.standardOutput.write(packet)
    }
    
    static func cleanup() {
        systemCapture?.stop()
        micCapture?.stop()
        fputs("[AudioCapture] Cleanup complete. System chunks: \(systemChunkCount), Mic chunks: \(micChunkCount)\n", stderr)
    }
}

@available(macOS 14.0, *)
private func runAudioCapture() {
    Task {
        await AudioCaptureApp.main()
    }
    RunLoop.main.run()
}

if #available(macOS 14.0, *) {
    runAudioCapture()
} else {
    fputs("[AudioCapture] Requires macOS 14.0+\n", stderr)
    exit(1)
}
