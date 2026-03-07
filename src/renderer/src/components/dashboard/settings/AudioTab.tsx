import { useState, useEffect, useRef } from 'react'
import { createLogger } from '../../../lib/logger'

const log = createLogger('Settings:Audio')

export function AudioTab() {
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [selectedMic, setSelectedMic] = useState<string>('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [isTestingMic, setIsTestingMic] = useState(false)
  const [testTimeRemaining, setTestTimeRemaining] = useState(10)
  const [testTranscript, setTestTranscript] = useState('')
  const [captureSystemAudio, setCaptureSystemAudio] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const barsRef = useRef<HTMLDivElement[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const animationRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptUnsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    async function loadMicrophones() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
        const devices = await navigator.mediaDevices.enumerateDevices()
        const mics = devices.filter((d) => d.kind === 'audioinput')
        setMicrophones(mics)

        const savedMic = (await window.raven.storeGet('selectedMicrophone')) as string
        if (savedMic && mics.find((m) => m.deviceId === savedMic)) {
          setSelectedMic(savedMic)
        } else if (mics.length > 0) {
          setSelectedMic(mics[0].deviceId)
        }

        const systemAudio = (await window.raven.storeGet('captureSystemAudio')) as boolean
        if (systemAudio !== undefined) setCaptureSystemAudio(systemAudio)
      } catch (error) {
        log.error('Failed to load microphones:', error)
      }
    }
    void loadMicrophones()

    return () => {
      stopMicTest()
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMicChange = async (deviceId: string) => {
    setSelectedMic(deviceId)
    setDropdownOpen(false)
    await window.raven.storeSet('selectedMicrophone', deviceId)

    if (isTestingMic) {
      stopMicTest()
      setTimeout(() => {
        void startMicTest(deviceId)
      }, 100)
    }
  }

  const handleSystemAudioToggle = async () => {
    const newValue = !captureSystemAudio
    setCaptureSystemAudio(newValue)
    await window.raven.storeSet('captureSystemAudio', newValue)
  }

  const startMicTest = async (deviceId?: string) => {
    const micId = deviceId || selectedMic
    if (!micId) return

    try {
      setIsTestingMic(true)
      setTestTimeRemaining(10)
      setTestTranscript('')

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: micId } },
      })
      streamRef.current = stream

      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.7
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser

      const nativeSampleRate = audioContext.sampleRate
      const targetRate = 16000
      const ratio = nativeSampleRate / targetRate

      const workletCode = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input.length > 0 && input[0].length > 0) {
      this.port.postMessage(input[0])
    }
    return true
  }
}
registerProcessor('pcm-capture-processor', PcmCaptureProcessor)
`
      const blob = new Blob([workletCode], { type: 'application/javascript' })
      const workletUrl = URL.createObjectURL(blob)
      await audioContext.audioWorklet.addModule(workletUrl)
      URL.revokeObjectURL(workletUrl)

      const workletNode = new AudioWorkletNode(audioContext, 'pcm-capture-processor')
      workletNode.port.onmessage = (event) => {
        const float32Data = event.data as Float32Array

        let resampled: Float32Array
        if (Math.abs(ratio - 1) < 0.01) {
          resampled = float32Data
        } else {
          const outLen = Math.round(float32Data.length / ratio)
          resampled = new Float32Array(outLen)
          for (let i = 0; i < outLen; i++) {
            const srcIdx = Math.min(Math.round(i * ratio), float32Data.length - 1)
            resampled[i] = float32Data[srcIdx]
          }
        }

        const int16Data = new Int16Array(resampled.length)
        for (let i = 0; i < resampled.length; i++) {
          const sample = Math.max(-1, Math.min(1, resampled[i]))
          int16Data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
        }
        void window.raven.sendTestAudio(int16Data.buffer)
      }
      source.connect(workletNode)
      workletNodeRef.current = workletNode

      // Visualization
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const barCount = 24

      const updateBars = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        const bandSize = Math.floor(dataArray.length / barCount)
        for (let i = 0; i < barCount; i++) {
          let sum = 0
          for (let j = 0; j < bandSize; j++) {
            sum += dataArray[i * bandSize + j]
          }
          const average = sum / bandSize
          const height = Math.min(100, (average / 255) * 150)
          if (barsRef.current[i]) {
            barsRef.current[i].style.height = `${Math.max(15, height)}%`
          }
        }
        animationRef.current = requestAnimationFrame(updateBars)
      }
      updateBars()

      try {
        await window.raven.startTestTranscription(micId)
        transcriptUnsubscribeRef.current?.()
        transcriptUnsubscribeRef.current = window.raven.onTestTranscriptionUpdate((data) => {
          if (data.text && data.isFinal) {
            setTestTranscript((prev) => {
              const newText = prev ? `${prev} ${data.text}` : data.text
              return newText.trim()
            })
          }
        })
      } catch (err) {
        log.error('Failed to start test transcription:', err)
      }

      timerRef.current = setInterval(() => {
        setTestTimeRemaining((prev) => {
          if (prev <= 1) {
            stopMicTest()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (error) {
      log.error('Failed to start mic test:', error)
      setIsTestingMic(false)
    }
  }

  const stopMicTest = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    barsRef.current.forEach((bar) => {
      if (bar) bar.style.height = '15%'
    })

    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
      analyserRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    try {
      void window.raven.stopTestTranscription()
      transcriptUnsubscribeRef.current?.()
      transcriptUnsubscribeRef.current = null
    } catch (err) {
      log.error('Failed to stop test transcription:', err)
    }

    setIsTestingMic(false)
  }

  const getSelectedMicName = () => {
    const mic = microphones.find((m) => m.deviceId === selectedMic)
    if (!mic) return 'Select microphone'
    if (mic.deviceId === 'default') return mic.label || 'Default - System Microphone'
    return mic.label || 'Unknown Microphone'
  }

  return (
    <div className="space-y-6 max-w-xl">
      <p className="text-sm text-gray-500">
        Test your audio input and transcription before you hop into a call.
      </p>

      {/* Microphone Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Microphone source
        </label>
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-left hover:border-gray-400 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
            <span className="flex-1 truncate">{getSelectedMicName()}</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
              {microphones.map((mic) => (
                <button
                  key={mic.deviceId}
                  onClick={() => handleMicChange(mic.deviceId)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50 ${
                    mic.deviceId === selectedMic ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                  }`}
                >
                  <span className="truncate">
                    {mic.deviceId === 'default' ? (mic.label || 'Default - System Microphone') : mic.label || 'Unknown Microphone'}
                  </span>
                  {mic.deviceId === selectedMic && (
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mic Test Section */}
      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
        <div className="flex items-center gap-3">
          {!isTestingMic ? (
            <button
              onClick={() => {
                void startMicTest()
              }}
              className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
            >
              Test Microphone
            </button>
          ) : (
            <>
              <span className="px-4 py-2 bg-gray-200 text-gray-600 text-sm font-medium rounded-lg">
                Testing...
              </span>
              <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-1 rounded-md">
                {testTimeRemaining}s
              </span>
              {/* Waveform Bars */}
              <div className="flex-1 flex items-end gap-[3px] h-8 px-3 py-1 bg-white rounded-lg border border-gray-200">
                {[...Array(24)].map((_, i) => (
                  <div
                    key={i}
                    ref={(el) => {
                      if (el) barsRef.current[i] = el
                    }}
                    className="flex-1 min-w-[2px] bg-blue-500/80 rounded-sm transition-[height] duration-[60ms]"
                    style={{ height: '15%' }}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {isTestingMic && (
          <button
            onClick={stopMicTest}
            className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors"
          >
            Stop Test
          </button>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-3 min-h-[86px]">
          <p className="text-xs font-medium text-gray-600 mb-1">Live transcription preview</p>
          {testTranscript ? (
            <p className="text-sm text-gray-800 leading-relaxed">{testTranscript}</p>
          ) : (
            <p className="text-sm text-gray-400 italic">
              {isTestingMic ? 'Listening... say a sentence to preview transcription.' : 'Run a 10-second test to preview transcription output.'}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Capture meeting audio
            </label>
            <p className="text-xs text-gray-400 mt-0.5">
              Include system audio in normal recording sessions
            </p>
          </div>
          <button
            onClick={handleSystemAudioToggle}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              captureSystemAudio ? 'bg-blue-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                captureSystemAudio ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
      </div>

      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 mt-6">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-gray-700">Quick tip</p>
            <p className="text-xs text-gray-500 mt-1">
              For best transcript quality, use a dedicated mic and run this test before each important meeting.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
