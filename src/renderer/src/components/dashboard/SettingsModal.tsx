/**
 * Settings Modal
 * Multi-tab settings interface for dashboard
 */

import { useState, useEffect, useRef } from 'react'

type SettingsTab = 'api-keys' | 'audio' | 'language' | 'hotkeys' | 'about'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const tabs: { id: SettingsTab; label: string; icon: JSX.Element }[] = [
  {
    id: 'api-keys',
    label: 'API Keys',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  {
    id: 'language',
    label: 'Language',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
      </svg>
    ),
  },
  {
    id: 'hotkeys',
    label: 'Hotkeys',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
  },
  {
    id: 'about',
    label: 'About',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
    ),
  },
]

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('api-keys')

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-xl shadow-2xl w-[95vw] max-w-[800px] h-[85vh] max-h-[600px] min-h-[400px] flex overflow-hidden border border-gray-200">
        <div className="w-48 min-w-[180px] bg-gray-50 border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          </div>

          <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-cyan-50 text-cyan-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className={activeTab === tab.id ? 'text-cyan-600' : 'text-gray-400'}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-base font-semibold text-gray-900">
              {tabs.find((tab) => tab.id === activeTab)?.label}
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'api-keys' && <ApiKeysTab />}
            {activeTab === 'audio' && <AudioTab />}
            {activeTab === 'language' && <LanguageTab />}
            {activeTab === 'hotkeys' && <HotkeysTab />}
            {activeTab === 'about' && <AboutTab />}
          </div>
        </div>
      </div>
    </div>
  )
}

function ApiKeysTab() {
  const [deepgramKey, setDeepgramKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [showDeepgram, setShowDeepgram] = useState(false)
  const [showAnthropic, setShowAnthropic] = useState(false)
  const [originalDeepgramKey, setOriginalDeepgramKey] = useState('')
  const [originalAnthropicKey, setOriginalAnthropicKey] = useState('')
  const [deepgramStatus, setDeepgramStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [anthropicStatus, setAnthropicStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    async function loadKeys() {
      try {
        const dgKey = (await window.raven.storeGet('deepgramApiKey')) as string
        const anKey = (await window.raven.storeGet('anthropicApiKey')) as string
        if (dgKey) {
          setDeepgramKey(dgKey)
          setOriginalDeepgramKey(dgKey)
          setDeepgramStatus('valid')
        }
        if (anKey) {
          setAnthropicKey(anKey)
          setOriginalAnthropicKey(anKey)
          setAnthropicStatus('valid')
        }
      } catch (error) {
        console.error('Failed to load API keys:', error)
      }
    }
    loadKeys()
  }, [])

  const hasChanges =
    deepgramKey.trim() !== originalDeepgramKey || anthropicKey.trim() !== originalAnthropicKey
  const canSave = hasChanges && !!deepgramKey.trim() && !!anthropicKey.trim()

  const validateKeys = async () => {
    if (!deepgramKey.trim() || !anthropicKey.trim()) {
      setSaveMessage({ type: 'error', text: 'Both API keys are required' })
      return false
    }

    setDeepgramStatus('validating')
    setAnthropicStatus('validating')
    setSaveMessage(null)

    try {
      const result = await window.raven.validateApiKeys(deepgramKey.trim(), anthropicKey.trim())
      if (result.valid) {
        setDeepgramStatus('valid')
        setAnthropicStatus('valid')
        return true
      }

      if (result.error?.toLowerCase().includes('deepgram')) {
        setDeepgramStatus('invalid')
        setAnthropicStatus('idle')
      } else if (result.error?.toLowerCase().includes('anthropic')) {
        setDeepgramStatus('idle')
        setAnthropicStatus('invalid')
      } else {
        setDeepgramStatus('invalid')
        setAnthropicStatus('invalid')
      }
      setSaveMessage({ type: 'error', text: result.error || 'Invalid API keys' })
      return false
    } catch (error) {
      setDeepgramStatus('invalid')
      setAnthropicStatus('invalid')
      setSaveMessage({ type: 'error', text: 'Failed to validate API keys' })
      return false
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveMessage(null)

    const isValid = await validateKeys()
    if (isValid) {
      try {
        await window.raven.apiKeysSave(deepgramKey.trim(), anthropicKey.trim())
        setSaveMessage({ type: 'success', text: 'API keys saved successfully' })
        setOriginalDeepgramKey(deepgramKey.trim())
        setOriginalAnthropicKey(anthropicKey.trim())
      } catch (error) {
        setSaveMessage({ type: 'error', text: 'Failed to save API keys' })
      }
    }

    setIsSaving(false)
  }

  const getStatusIcon = (status: 'idle' | 'validating' | 'valid' | 'invalid') => {
    switch (status) {
      case 'validating':
        return (
          <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )
      case 'valid':
        return (
          <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )
      case 'invalid':
        return (
          <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <p className="text-sm text-gray-500">
        Configure your API keys for transcription and AI services. Keys are stored locally and encrypted.
      </p>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Deepgram API Key
          </label>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.raven.openExternal('https://console.deepgram.com/')
            }}
            className="text-xs text-cyan-600 hover:text-cyan-700"
          >
            Get API Key &rarr;
          </a>
        </div>
        <div className="relative">
          <input
            type={showDeepgram ? 'text' : 'password'}
            value={deepgramKey}
            onChange={(e) => {
              setDeepgramKey(e.target.value)
              setDeepgramStatus('idle')
              setSaveMessage(null)
            }}
            placeholder="Enter your Deepgram API key"
            className={`w-full px-3 py-2 pr-20 border rounded-lg text-sm transition-colors ${
              deepgramStatus === 'invalid'
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : deepgramStatus === 'valid'
                ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
                : 'border-gray-300 focus:border-cyan-500 focus:ring-cyan-500'
            } focus:outline-none focus:ring-1`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {getStatusIcon(deepgramStatus)}
            <button
              type="button"
              onClick={() => setShowDeepgram(!showDeepgram)}
              className="text-gray-400 hover:text-gray-600"
            >
              {showDeepgram ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400">Used for real-time speech-to-text transcription</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Anthropic API Key
          </label>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.raven.openExternal('https://console.anthropic.com/')
            }}
            className="text-xs text-cyan-600 hover:text-cyan-700"
          >
            Get API Key &rarr;
          </a>
        </div>
        <div className="relative">
          <input
            type={showAnthropic ? 'text' : 'password'}
            value={anthropicKey}
            onChange={(e) => {
              setAnthropicKey(e.target.value)
              setAnthropicStatus('idle')
              setSaveMessage(null)
            }}
            placeholder="sk-ant-..."
            className={`w-full px-3 py-2 pr-20 border rounded-lg text-sm transition-colors ${
              anthropicStatus === 'invalid'
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : anthropicStatus === 'valid'
                ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
                : 'border-gray-300 focus:border-cyan-500 focus:ring-cyan-500'
            } focus:outline-none focus:ring-1`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {getStatusIcon(anthropicStatus)}
            <button
              type="button"
              onClick={() => setShowAnthropic(!showAnthropic)}
              className="text-gray-400 hover:text-gray-600"
            >
              {showAnthropic ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400">Used for AI-powered meeting assistance (Claude)</p>
      </div>

      {saveMessage && (
        <div className={`p-3 rounded-lg text-sm ${
          saveMessage.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {saveMessage.text}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={isSaving || !canSave}
          className="px-4 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? 'Validating...' : hasChanges ? 'Save & Validate' : 'Saved ✓'}
        </button>
        <button
          onClick={validateKeys}
          disabled={isSaving || !deepgramKey.trim() || !anthropicKey.trim()}
          className="px-4 py-2 text-gray-600 text-sm font-medium hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Test Connection
        </button>
      </div>

      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 mt-6">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-gray-700">Your keys are secure</p>
            <p className="text-xs text-gray-500 mt-1">
              API keys are encrypted and stored locally on your device. They are never sent to our servers.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function AudioTab() {
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
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const animationRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptUnsubscribeRef = useRef<(() => void) | null>(null)

  // Load microphones
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
        console.error('Failed to load microphones:', error)
      }
    }
    void loadMicrophones()

    return () => {
      stopMicTest()
    }
  }, [])

  // Click outside to close dropdown
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

      // Start audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: micId } },
      })
      streamRef.current = stream

      // Set up audio analysis for visualization
      const audioContext = new AudioContext({ sampleRate: 16000 })
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.7
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser

      // Set up audio processing for transcription
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      source.connect(processor)
      processor.connect(audioContext.destination)

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        const int16Data = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const sample = Math.max(-1, Math.min(1, inputData[i]))
          int16Data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
        }
        void window.raven.sendTestAudio(int16Data.buffer)
      }

      processorRef.current = processor

      // Start visualization
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

      // Start test transcription (doesn't create sessions)
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
        console.error('Failed to start test transcription:', err)
      }

      // Countdown timer
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
      console.error('Failed to start mic test:', error)
      setIsTestingMic(false)
    }
  }

  const stopMicTest = () => {
    // Stop animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    // Reset bars
    barsRef.current.forEach((bar) => {
      if (bar) bar.style.height = '15%'
    })

    // Stop audio processor
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    // Stop audio context
    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
      analyserRef.current = null
    }

    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // Stop test transcription
    try {
      void window.raven.stopTestTranscription()
      transcriptUnsubscribeRef.current?.()
      transcriptUnsubscribeRef.current = null
    } catch (err) {
      console.error('Failed to stop test transcription:', err)
    }

    setIsTestingMic(false)
  }

  const getSelectedMicName = () => {
    const mic = microphones.find((m) => m.deviceId === selectedMic)
    if (!mic) return 'Select microphone'
    if (mic.deviceId === 'default') return `Default - ${mic.label || 'System Microphone'}`
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
                    mic.deviceId === selectedMic ? 'text-cyan-600 bg-cyan-50' : 'text-gray-700'
                  }`}
                >
                  <span className="truncate">
                    {mic.deviceId === 'default' ? `Default - ${mic.label || 'System Microphone'}` : mic.label || 'Unknown Microphone'}
                  </span>
                  {mic.deviceId === selectedMic && (
                    <svg className="w-4 h-4 text-cyan-600 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              className="px-4 py-2 bg-cyan-500 text-white text-sm font-medium rounded-lg hover:bg-cyan-600 transition-colors"
            >
              Test Microphone
            </button>
          ) : (
            <>
              <span className="px-4 py-2 bg-gray-200 text-gray-600 text-sm font-medium rounded-lg">
                Testing...
              </span>
              <span className="text-xs font-semibold text-cyan-700 bg-cyan-100 px-2 py-1 rounded-md">
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
                    className="flex-1 min-w-[2px] bg-cyan-500/80 rounded-sm transition-[height] duration-[60ms]"
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
              captureSystemAudio ? 'bg-cyan-500' : 'bg-gray-300'
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

function LanguageTab() {
  const [transcriptionLang, setTranscriptionLang] = useState('en')
  const [outputLang, setOutputLang] = useState('en')
  const [transcriptionDropdownOpen, setTranscriptionDropdownOpen] = useState(false)
  const [outputDropdownOpen, setOutputDropdownOpen] = useState(false)
  const transcriptionDropdownRef = useRef<HTMLDivElement>(null)
  const outputDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadSettings() {
      try {
        const tLang = (await window.raven.storeGet('transcriptionLanguage')) as string
        const oLang = (await window.raven.storeGet('outputLanguage')) as string
        if (tLang) setTranscriptionLang(tLang)
        if (oLang) setOutputLang(oLang)
      } catch (error) {
        console.error('Failed to load language settings:', error)
      }
    }
    loadSettings()
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (transcriptionDropdownRef.current && !transcriptionDropdownRef.current.contains(event.target as Node)) {
        setTranscriptionDropdownOpen(false)
      }
      if (outputDropdownRef.current && !outputDropdownRef.current.contains(event.target as Node)) {
        setOutputDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleTranscriptionLangChange = async (value: string) => {
    setTranscriptionLang(value)
    setTranscriptionDropdownOpen(false)
    await window.raven.storeSet('transcriptionLanguage', value)
  }

  const handleOutputLangChange = async (value: string) => {
    setOutputLang(value)
    setOutputDropdownOpen(false)
    await window.raven.storeSet('outputLanguage', value)
  }

  const transcriptionLanguages = [
    { value: 'en', label: 'English (recommended)' },
    { value: 'multi', label: 'Auto-detect language' },
    { value: 'hi', label: 'Hindi (हिन्दी)' },
    { value: 'es', label: 'Spanish (Español)' },
    { value: 'fr', label: 'French (Français)' },
    { value: 'de', label: 'German (Deutsch)' },
    { value: 'it', label: 'Italian (Italiano)' },
    { value: 'pt', label: 'Portuguese (Português)' },
    { value: 'ja', label: 'Japanese (日本語)' },
    { value: 'ko', label: 'Korean (한국어)' },
    { value: 'zh', label: 'Mandarin (普通话)' },
    { value: 'ar', label: 'Arabic (العربية)' },
    { value: 'bn', label: 'Bengali (বাংলা)' },
    { value: 'nl', label: 'Dutch (Nederlands)' },
    { value: 'pl', label: 'Polish (Polski)' },
    { value: 'ru', label: 'Russian (Русский)' },
    { value: 'ta', label: 'Tamil (தமிழ்)' },
    { value: 'th', label: 'Thai (ไทย)' },
    { value: 'tr', label: 'Turkish (Türkçe)' },
    { value: 'uk', label: 'Ukrainian (Українська)' },
    { value: 'vi', label: 'Vietnamese (Tiếng Việt)' },
  ]

  const outputLanguages = [
    { value: 'en', label: 'English (recommended)' },
    { value: 'auto', label: 'Auto-detect language' },
    { value: 'hi', label: 'Hindi (हिन्दी)' },
    { value: 'es', label: 'Spanish (Español)' },
    { value: 'fr', label: 'French (Français)' },
    { value: 'de', label: 'German (Deutsch)' },
    { value: 'it', label: 'Italian (Italiano)' },
    { value: 'pt', label: 'Portuguese (Português)' },
    { value: 'ja', label: 'Japanese (日本語)' },
    { value: 'ko', label: 'Korean (한국어)' },
    { value: 'zh', label: 'Mandarin (普通话)' },
  ]

  const getLanguageLabel = (languages: typeof transcriptionLanguages, value: string) => {
    return languages.find((l) => l.value === value)?.label || value
  }

  return (
    <div className="space-y-6 max-w-xl">
      <p className="text-sm text-gray-500">
        Select the languages for your meetings.
      </p>

      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">Transcription language</div>
            <div className="text-xs text-gray-500">The language you speak in meetings</div>
          </div>
        </div>

        <div className="relative" ref={transcriptionDropdownRef}>
          <button
            onClick={() => {
              setTranscriptionDropdownOpen(!transcriptionDropdownOpen)
              setOutputDropdownOpen(false)
            }}
            className="flex items-center justify-between gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-400 transition-colors min-w-[200px]"
          >
            <span className="truncate">{getLanguageLabel(transcriptionLanguages, transcriptionLang)}</span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${transcriptionDropdownOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {transcriptionDropdownOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
              {transcriptionLanguages.map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => handleTranscriptionLangChange(lang.value)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50 ${
                    lang.value === transcriptionLang ? 'text-cyan-600 bg-cyan-50' : 'text-gray-700'
                  }`}
                >
                  <span>{lang.label}</span>
                  {lang.value === transcriptionLang && (
                    <svg className="w-4 h-4 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">Output language</div>
            <div className="text-xs text-gray-500">Language for AI responses and meeting notes</div>
          </div>
        </div>

        <div className="relative" ref={outputDropdownRef}>
          <button
            onClick={() => {
              setOutputDropdownOpen(!outputDropdownOpen)
              setTranscriptionDropdownOpen(false)
            }}
            className="flex items-center justify-between gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-400 transition-colors min-w-[200px]"
          >
            <span className="truncate">{getLanguageLabel(outputLanguages as typeof transcriptionLanguages, outputLang)}</span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${outputDropdownOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {outputDropdownOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
              {outputLanguages.map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => handleOutputLangChange(lang.value)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50 ${
                    lang.value === outputLang ? 'text-cyan-600 bg-cyan-50' : 'text-gray-700'
                  }`}
                >
                  <span>{lang.label}</span>
                  {lang.value === outputLang && (
                    <svg className="w-4 h-4 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
function HotkeysTab() {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const cmdKey = isMac ? '⌘' : 'Ctrl'

  const hotkeyGroups = [
    {
      title: 'General',
      shortcuts: [
        {
          action: 'Toggle visibility of Raven',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8V6a2 2 0 012-2h2M3 16v2a2 2 0 002 2h2m10-16h2a2 2 0 012 2v2m0 8v2a2 2 0 01-2 2h-2" />
            </svg>
          ),
          keys: [cmdKey, '\\'],
        },
        {
          action: 'Ask Raven for help',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          ),
          keys: [cmdKey, '↵'],
        },
        {
          action: 'Start or stop recording',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          ),
          keys: [cmdKey, 'R'],
        },
        {
          action: 'Clear current conversation',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          ),
          keys: [cmdKey, '⇧', 'R'],
        },
      ],
    },
    {
      title: 'Window',
      shortcuts: [
        {
          action: 'Move the window position up',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          ),
          keys: [cmdKey, '↑'],
        },
        {
          action: 'Move the window position down',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          ),
          keys: [cmdKey, '↓'],
        },
        {
          action: 'Move the window position left',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          ),
          keys: [cmdKey, '←'],
        },
        {
          action: 'Move the window position right',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          ),
          keys: [cmdKey, '→'],
        },
      ],
    },
    {
      title: 'Scroll',
      shortcuts: [
        {
          action: 'Scroll the response window up',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
            </svg>
          ),
          keys: [cmdKey, '⇧', '↑'],
        },
        {
          action: 'Scroll the response window down',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25" />
            </svg>
          ),
          keys: [cmdKey, '⇧', '↓'],
        },
      ],
    },
  ]

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Keyboard shortcuts</h3>
        <p className="text-sm text-gray-500 mt-1">
          Raven works with these easy to remember commands.
        </p>
      </div>

      {hotkeyGroups.map((group, groupIndex) => (
        <div key={groupIndex} className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-900">{group.title}</h4>
          <div className="space-y-1">
            {group.shortcuts.map((shortcut, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">{shortcut.icon}</span>
                  <span className="text-sm text-gray-700">{shortcut.action}</span>
                </div>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, keyIndex) => (
                    <kbd
                      key={keyIndex}
                      className="min-w-[28px] h-7 px-2 flex items-center justify-center text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-md shadow-sm"
                    >
                      {key}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AboutTab() {
  const appVersion = '0.1.0' // TODO: Get from package.json via IPC

  const handleOpenLink = (url: string) => {
    window.raven.openExternal?.(url)
  }

  return (
    <div className="space-y-6 max-w-xl">
      {/* App Info */}
      <div className="text-center py-6">
        <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
          <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Project Raven</h2>
        <p className="text-sm text-gray-500 mt-1">Version {appVersion}</p>
        <p className="text-xs text-gray-400 mt-2">AI-powered meeting assistant</p>
      </div>

      {/* Links */}
      <div className="space-y-2">
        <button
          onClick={() => handleOpenLink('https://github.com/Laxcorp-Research/project-raven')}
          className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">GitHub Repository</div>
              <div className="text-xs text-gray-500">Star us on GitHub</div>
            </div>
          </div>
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>

        <button
          onClick={() => handleOpenLink('https://github.com/Laxcorp-Research/project-raven/issues')}
          className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">Report a Bug</div>
              <div className="text-xs text-gray-500">Found an issue? Let us know</div>
            </div>
          </div>
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>

        <button
          onClick={() => handleOpenLink('https://github.com/Laxcorp-Research/project-raven/discussions')}
          className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">Community</div>
              <div className="text-xs text-gray-500">Join the discussion</div>
            </div>
          </div>
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>

      {/* Credits */}
      <div className="pt-4 border-t border-gray-200">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Powered by</h4>
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
            Deepgram Nova-3
          </span>
          <span className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
            Claude AI
          </span>
          <span className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
            Electron
          </span>
          <span className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
            React
          </span>
        </div>
      </div>

      {/* Legal */}
      <div className="pt-4 border-t border-gray-200 text-center">
        <p className="text-xs text-gray-400">
          © 2025 Laxcorp Research. Open source under MIT license.
        </p>
      </div>
    </div>
  )
}
