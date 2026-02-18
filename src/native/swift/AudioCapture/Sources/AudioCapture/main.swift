import Foundation
import ScreenCaptureKit
import CoreMedia
import AudioToolbox
import CoreAudio

// MARK: - Audio Chunk Types
enum AudioSource: String {
    case system = "system"
    case mic = "mic"
}

// MARK: - Mic Capture (AUHAL AudioUnit — non-disruptive)
//
// Uses CoreAudio's low-level AUHAL (Hardware Abstraction Layer) AudioUnit
// instead of AVAudioEngine. The critical difference:
//
// AVAudioEngine reconfigures the hardware device (sample rate, buffer size)
// when started, which disrupts other apps (Teams, Zoom) sharing the device.
//
// AUHAL reads the hardware's CURRENT configuration and adapts to it —
// no hardware properties are changed, so other apps are unaffected.
// This is the same approach used by OBS, Logic Pro, and Audio Hijack.

@available(macOS 13.0, *)
final class MicCapture {
    private var audioUnit: AudioUnit?
    private var onData: ((Data) -> Void)?
    private let targetSampleRate: Double = 16000
    private var hwSampleRate: Double = 48000
    private let processingQueue = DispatchQueue(label: "mic.processing", qos: .userInteractive)

    func start(onData: @escaping (Data) -> Void) throws {
        self.onData = onData

        // 1. Get default input device
        var inputDeviceID = AudioDeviceID(0)
        var propSize = UInt32(MemoryLayout<AudioDeviceID>.size)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &address, 0, nil, &propSize, &inputDeviceID
        )
        guard status == noErr else {
            throw NSError(domain: "MicCapture", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Failed to get default input device"])
        }

        // 2. Read hardware sample rate (we match it, never change it)
        var nominalRate: Float64 = 0
        propSize = UInt32(MemoryLayout<Float64>.size)
        address.mSelector = kAudioDevicePropertyNominalSampleRate
        status = AudioObjectGetPropertyData(inputDeviceID, &address, 0, nil, &propSize, &nominalRate)
        guard status == noErr else {
            throw NSError(domain: "MicCapture", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Cannot read device sample rate"])
        }
        hwSampleRate = nominalRate

        // 3. Read hardware buffer frame size (we match it, never change it)
        var hwBufferSize: UInt32 = 0
        propSize = UInt32(MemoryLayout<UInt32>.size)
        address.mSelector = kAudioDevicePropertyBufferFrameSize
        address.mScope = kAudioObjectPropertyScopeGlobal
        status = AudioObjectGetPropertyData(inputDeviceID, &address, 0, nil, &propSize, &hwBufferSize)
        guard status == noErr else {
            throw NSError(domain: "MicCapture", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Cannot read device buffer size"])
        }

        fputs("[Mic] Hardware: \(nominalRate)Hz, buffer=\(hwBufferSize) frames\n", stderr)

        // 4. Create AUHAL AudioUnit
        var componentDesc = AudioComponentDescription(
            componentType: kAudioUnitType_Output,
            componentSubType: kAudioUnitSubType_HALOutput,
            componentManufacturer: kAudioUnitManufacturer_Apple,
            componentFlags: 0,
            componentFlagsMask: 0
        )
        guard let component = AudioComponentFindNext(nil, &componentDesc) else {
            throw NSError(domain: "MicCapture", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "HAL output component not found"])
        }

        var au: AudioUnit?
        status = AudioComponentInstanceNew(component, &au)
        guard status == noErr, let unit = au else {
            throw NSError(domain: "MicCapture", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Failed to create AudioUnit"])
        }
        audioUnit = unit

        // 5. Enable input (bus 1), disable output (bus 0)
        var enableIO: UInt32 = 1
        var disableIO: UInt32 = 0
        status = AudioUnitSetProperty(unit,
            kAudioOutputUnitProperty_EnableIO,
            kAudioUnitScope_Input, 1,
            &enableIO, UInt32(MemoryLayout<UInt32>.size))
        guard status == noErr else {
            throw NSError(domain: "MicCapture", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Failed to enable input"])
        }

        status = AudioUnitSetProperty(unit,
            kAudioOutputUnitProperty_EnableIO,
            kAudioUnitScope_Output, 0,
            &disableIO, UInt32(MemoryLayout<UInt32>.size))
        guard status == noErr else {
            throw NSError(domain: "MicCapture", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Failed to disable output"])
        }

        // 6. Set the input device
        var deviceID = inputDeviceID
        status = AudioUnitSetProperty(unit,
            kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global, 0,
            &deviceID, UInt32(MemoryLayout<AudioDeviceID>.size))
        guard status == noErr else {
            throw NSError(domain: "MicCapture", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Failed to set input device"])
        }

        // 7. Set stream format: Float32, mono, at HARDWARE sample rate
        //    By matching the hardware rate, we avoid triggering any reconfiguration.
        //    Resampling to 16kHz is done in software after capture.
        var streamFormat = AudioStreamBasicDescription(
            mSampleRate: nominalRate,
            mFormatID: kAudioFormatLinearPCM,
            mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked | kAudioFormatFlagIsNonInterleaved,
            mBytesPerPacket: 4,
            mFramesPerPacket: 1,
            mBytesPerFrame: 4,
            mChannelsPerFrame: 1,
            mBitsPerChannel: 32,
            mReserved: 0
        )
        status = AudioUnitSetProperty(unit,
            kAudioUnitProperty_StreamFormat,
            kAudioUnitScope_Output, 1,
            &streamFormat, UInt32(MemoryLayout<AudioStreamBasicDescription>.size))
        guard status == noErr else {
            throw NSError(domain: "MicCapture", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Failed to set stream format"])
        }

        // 8. Match the hardware buffer size on our AudioUnit
        status = AudioUnitSetProperty(unit,
            kAudioDevicePropertyBufferFrameSize,
            kAudioUnitScope_Global, 0,
            &hwBufferSize, UInt32(MemoryLayout<UInt32>.size))
        if status != noErr {
            fputs("[Mic] Warning: could not set buffer size (status \(status)), continuing\n", stderr)
        }

        // 9. Install input render callback
        var callbackStruct = AURenderCallbackStruct(
            inputProc: micInputCallback,
            inputProcRefCon: Unmanaged.passUnretained(self).toOpaque()
        )
        status = AudioUnitSetProperty(unit,
            kAudioOutputUnitProperty_SetInputCallback,
            kAudioUnitScope_Global, 0,
            &callbackStruct, UInt32(MemoryLayout<AURenderCallbackStruct>.size))
        guard status == noErr else {
            throw NSError(domain: "MicCapture", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Failed to set input callback"])
        }

        // 10. Initialize and start
        status = AudioUnitInitialize(unit)
        guard status == noErr else {
            throw NSError(domain: "MicCapture", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "AudioUnit initialize failed"])
        }

        status = AudioOutputUnitStart(unit)
        guard status == noErr else {
            throw NSError(domain: "MicCapture", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "AudioUnit start failed"])
        }

        fputs("[Mic] Started (AUHAL, non-disruptive, \(nominalRate)Hz → 16kHz)\n", stderr)
    }

    /// Called from the CoreAudio realtime thread — copies data and dispatches processing
    fileprivate func renderInput(
        ioActionFlags: UnsafeMutablePointer<AudioUnitRenderActionFlags>,
        inTimeStamp: UnsafePointer<AudioTimeStamp>,
        inBusNumber: UInt32,
        inNumberFrames: UInt32
    ) {
        guard let au = audioUnit else { return }

        let byteSize = inNumberFrames * 4
        let rawBuf = UnsafeMutableRawPointer.allocate(byteCount: Int(byteSize), alignment: 4)

        var bufferList = AudioBufferList(
            mNumberBuffers: 1,
            mBuffers: AudioBuffer(
                mNumberChannels: 1,
                mDataByteSize: byteSize,
                mData: rawBuf
            )
        )

        let status = AudioUnitRender(au, ioActionFlags, inTimeStamp, inBusNumber, inNumberFrames, &bufferList)
        if status != noErr {
            rawBuf.deallocate()
            return
        }

        let frameCount = Int(inNumberFrames)

        // Copy float samples off the realtime thread
        let floatArray = Array(UnsafeBufferPointer(
            start: rawBuf.assumingMemoryBound(to: Float.self),
            count: frameCount
        ))
        rawBuf.deallocate()

        let capturedHwRate = self.hwSampleRate
        let capturedTargetRate = self.targetSampleRate
        let capturedOnData = self.onData

        // Resample and convert on a non-realtime thread
        processingQueue.async {
            guard let onData = capturedOnData else { return }

            let ratio = capturedTargetRate / capturedHwRate
            let outputCount = Int(Double(frameCount) * ratio)

            var int16Samples = [Int16](repeating: 0, count: outputCount)
            for i in 0..<outputCount {
                let srcIdx = Double(i) / ratio
                let srcInt = Int(srcIdx)
                let frac = Float(srcIdx - Double(srcInt))

                let sample: Float
                if srcInt + 1 < frameCount {
                    sample = floatArray[srcInt] * (1 - frac) + floatArray[srcInt + 1] * frac
                } else if srcInt < frameCount {
                    sample = floatArray[srcInt]
                } else {
                    sample = 0
                }

                int16Samples[i] = Int16(max(-1.0, min(1.0, sample)) * 32767.0)
            }

            let data = int16Samples.withUnsafeBufferPointer { Data(buffer: $0) }
            onData(data)
        }
    }

    func stop() {
        if let au = audioUnit {
            AudioOutputUnitStop(au)
            AudioUnitUninitialize(au)
            AudioComponentInstanceDispose(au)
        }
        audioUnit = nil
        onData = nil
        fputs("[Mic] Stopped\n", stderr)
    }
}

/// C-style callback invoked from CoreAudio's realtime thread
private func micInputCallback(
    inRefCon: UnsafeMutableRawPointer,
    ioActionFlags: UnsafeMutablePointer<AudioUnitRenderActionFlags>,
    inTimeStamp: UnsafePointer<AudioTimeStamp>,
    inBusNumber: UInt32,
    inNumberFrames: UInt32,
    ioData: UnsafeMutablePointer<AudioBufferList>?
) -> OSStatus {
    let capture = Unmanaged<MicCapture>.fromOpaque(inRefCon).takeUnretainedValue()
    capture.renderInput(
        ioActionFlags: ioActionFlags,
        inTimeStamp: inTimeStamp,
        inBusNumber: inBusNumber,
        inNumberFrames: inNumberFrames
    )
    return noErr
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
        
        // Downsample to 16kHz using linear interpolation (matches mic resampling)
        let targetRate: Double = 16000
        let resampleRatio = targetRate / sampleRate
        let outputCount = Int(Double(floatSamples.count) * resampleRatio)
        var downsampled = [Int16]()
        downsampled.reserveCapacity(outputCount)
        
        for i in 0..<outputCount {
            let srcIdx = Double(i) / resampleRatio
            let srcInt = Int(srcIdx)
            let frac = Float(srcIdx - Double(srcInt))
            
            let sample: Float
            if srcInt + 1 < floatSamples.count {
                sample = floatSamples[srcInt] * (1 - frac) + floatSamples[srcInt + 1] * frac
            } else if srcInt < floatSamples.count {
                sample = floatSamples[srcInt]
            } else {
                sample = 0
            }
            
            downsampled.append(Int16(max(-1.0, min(1.0, sample)) * 32767.0))
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
        
        fputs("[AudioCapture] Starting dual capture (AUHAL mic + ScreenCaptureKit system)\n", stderr)
        
        // System audio capture — "Them" stream
        systemCapture = SystemAudioCapture { data in
            systemChunkCount += 1
            if systemChunkCount <= 5 || systemChunkCount % 100 == 0 {
                fputs("[SystemAudio] Chunk #\(systemChunkCount), bytes: \(data.count)\n", stderr)
            }
            writeChunk(source: .system, data: data)
        }
        
        // Mic capture — "You" stream (AUHAL, non-disruptive)
        micCapture = MicCapture()
        
        do {
            try await systemCapture?.start()
            try micCapture?.start { data in
                micChunkCount += 1
                if micChunkCount <= 5 || micChunkCount % 100 == 0 {
                    fputs("[Mic] Chunk #\(micChunkCount), bytes: \(data.count)\n", stderr)
                }
                writeChunk(source: .mic, data: data)
            }
            
            fputs("[AudioCapture] Both captures running\n", stderr)
            
            // Keep alive
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
        fputs("[AudioCapture] Cleanup complete. System: \(systemChunkCount), Mic: \(micChunkCount)\n", stderr)
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
