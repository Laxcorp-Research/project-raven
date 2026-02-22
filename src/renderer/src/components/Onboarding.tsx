import { useState, useEffect, useRef } from 'react'
import { Key, Shield, Keyboard, ExternalLink, ArrowRight, ArrowLeft, Check, Loader2, Eye, EyeOff, Sparkles } from 'lucide-react'
import ravenFullLogo from '../../../../logo/raven_full.svg'

interface OnboardingProps {
  onComplete: () => void
}

type AiProvider = 'anthropic' | 'openai'

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown')
  const [screenPermission, setScreenPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown')
  const [accessibilityPermission, setAccessibilityPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown')
  const [deepgramKey, setDeepgramKey] = useState('')
  const [aiProvider, setAiProvider] = useState<AiProvider>('anthropic')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deepgramInvalid, setDeepgramInvalid] = useState(false)
  const [aiKeyInvalid, setAiKeyInvalid] = useState(false)
  const [validating, setValidating] = useState(false)
  const [fadeKey, setFadeKey] = useState(0)
  const [showDeepgramKey, setShowDeepgramKey] = useState(false)
  const [showAiKey, setShowAiKey] = useState(false)

  const aiKey = aiProvider === 'anthropic' ? anthropicKey : openaiKey

  const TOTAL_STEPS = 5

  const handleNext = async () => {
    if (step === 2) {
      if (!deepgramKey.trim() || !aiKey.trim()) {
        setError('Both API keys are required.')
        setDeepgramInvalid(!deepgramKey.trim())
        setAiKeyInvalid(!aiKey.trim())
        return
      }
      setValidating(true)
      setError(null)
      setDeepgramInvalid(false)
      setAiKeyInvalid(false)
      try {
        const result = await window.raven.validateKeys(
          deepgramKey.trim(),
          aiProvider,
          aiKey.trim()
        )
        if (!result.valid) {
          setError(result.error || 'Invalid API keys.')
          setDeepgramInvalid(!!result.deepgramError)
          setAiKeyInvalid(!!result.aiError)
          setValidating(false)
          return
        }
      } catch {
        setError('Failed to validate keys. Check your internet connection.')
        setValidating(false)
        return
      }
      setValidating(false)
      setDeepgramInvalid(false)
      setAiKeyInvalid(false)
    }

    if (step < TOTAL_STEPS) {
      setFadeKey((k) => k + 1)
      setError(null)
      setStep((s) => Math.min(s + 1, TOTAL_STEPS) as typeof step)
    }
  }

  const handleBack = () => {
    if (step > 1) {
      setFadeKey((k) => k + 1)
      setStep((s) => Math.max(s - 1, 1) as typeof step)
    }
    setError(null)
  }

  const screenPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (screenPollRef.current) clearInterval(screenPollRef.current)
    }
  }, [])

  useEffect(() => {
    if (step === 3) {
      const fetchStatus = async () => {
        try {
          const status = await window.raven.permissionsGetStatus()
          if (status.microphone === 'granted') setMicPermission('granted')
          if (status.screen === 'granted') setScreenPermission('granted')
          if (status.accessibility === 'granted') setAccessibilityPermission('granted')
        } catch { /* ignore */ }
      }
      fetchStatus()
      const pollId = setInterval(fetchStatus, 2000)
      return () => clearInterval(pollId)
    }
  }, [step])

  const requestMicPermission = async () => {
    try {
      const granted = await window.raven.permissionsRequestMicrophone()
      if (granted) {
        setMicPermission('granted')
      } else {
        await window.raven.permissionsOpenMicrophone()
      }
    } catch {
      setMicPermission('denied')
    }
  }

  const requestScreenPermission = async () => {
    try {
      const hasPermission = await window.raven.systemAudioHasPermission()
      if (hasPermission) {
        setScreenPermission('granted')
        return
      }

      await window.raven.permissionsOpenScreenRecording()

      if (screenPollRef.current) clearInterval(screenPollRef.current)
      screenPollRef.current = setInterval(async () => {
        try {
          const status = await window.raven.permissionsGetStatus()
          if (status.screen === 'granted') {
            setScreenPermission('granted')
            if (screenPollRef.current) {
              clearInterval(screenPollRef.current)
              screenPollRef.current = null
            }
          }
        } catch { /* ignore */ }
      }, 1500)
    } catch {
      setScreenPermission('denied')
    }
  }

  const handleSaveKeys = async () => {
    setValidating(true)
    setError(null)

    try {
      await window.raven.apiKeysSave(
        deepgramKey.trim(),
        aiProvider === 'anthropic' ? anthropicKey.trim() : ''
      )
      await window.raven.storeSet('aiProvider', aiProvider)
      await window.raven.storeSet(
        'aiModel',
        aiProvider === 'anthropic' ? 'claude-haiku-4-5' : 'gpt-5-mini'
      )
      if (aiProvider === 'openai') {
        await window.raven.storeSet('openaiApiKey', openaiKey.trim())
      }
      await window.raven.storeSet('onboardingComplete', true)
      onComplete()
    } catch {
      setError('Failed to save keys. Please try again.')
    }

    setValidating(false)
  }

  const isMac =
    typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const cmdKey = isMac ? '⌘' : 'Ctrl'

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Draggable title bar area */}
      <div
        className="shrink-0 h-9"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Fixed stepper - always in the same spot */}
      <div className="pb-6 flex justify-center">
        <div className="flex items-center gap-0">
          {[1, 2, 3, 4, 5].map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                  s < step
                    ? 'bg-blue-600 text-white'
                    : s === step
                      ? 'bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-md'
                      : 'bg-gray-100 text-gray-400 border border-gray-200'
                }`}
              >
                {s < step ? <Check size={12} strokeWidth={2.5} /> : s}
              </div>
              {i < TOTAL_STEPS - 1 && (
                <div
                  className={`w-12 h-[2px] mx-2 rounded-full transition-colors duration-300 ${
                    s < step ? 'bg-blue-500' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content area - fills remaining space, centers vertically */}
      <div className="flex-1 flex items-center justify-center overflow-y-auto">
        <div className="w-full max-w-lg mx-auto px-8 py-4">
          <div key={fadeKey} className="animate-fade-in">
            {/* Step 1: Welcome */}
            {step === 1 && (
              <div className="text-center">
                <img
                  src={ravenFullLogo}
                  alt="Raven"
                  className="h-10 mx-auto mb-5 object-contain"
                  draggable={false}
                />

                <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto mb-6">
                  Real-time transcription and AI suggestions for your meetings while being invisible to screen sharing.
                </p>

                <button
                  onClick={handleNext}
                  className="w-full max-w-[280px] mx-auto flex items-center justify-center gap-2 py-2.5 bg-gradient-to-b from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 text-white rounded-xl text-sm font-medium shadow-sm transition-all"
                >
                  Get Started
                  <ArrowRight size={15} />
                </button>

                <p className="text-xs text-gray-400 mt-5">
                  All keys stored locally and encrypted.
                </p>
              </div>
            )}

            {/* Step 2: API Keys */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="text-center mb-1">
                  <h2 className="text-lg font-semibold text-gray-900 mb-0.5">API Keys</h2>
                  <p className="text-xs text-gray-500">
                    Stored locally and encrypted. Never leave your machine.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Deepgram */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Deepgram</label>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          window.raven.openExternal('https://console.deepgram.com')
                        }}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Get key
                        <ExternalLink size={10} />
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showDeepgramKey ? 'text' : 'password'}
                        value={deepgramKey}
                        onChange={(e) => { setDeepgramKey(e.target.value); setDeepgramInvalid(false); setError(null) }}
                        placeholder="Enter your Deepgram API key"
                        className={`w-full px-3 py-2.5 pr-10 bg-white border rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 transition-colors ${
                          deepgramInvalid
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                        }`}
                      />
                      {deepgramKey && (
                        <button
                          type="button"
                          onClick={() => setShowDeepgramKey(!showDeepgramKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showDeepgramKey ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">Speech-to-text. Free tier: $200 credit.</p>
                  </div>

                  {/* AI Provider Toggle */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">AI Provider</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setAiProvider('anthropic')
                          setError(null)
                        }}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          aiProvider === 'anthropic'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        Anthropic
                      </button>
                      <button
                        onClick={() => {
                          setAiProvider('openai')
                          setError(null)
                        }}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          aiProvider === 'openai'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        OpenAI
                      </button>
                    </div>
                  </div>

                  {/* AI Key Input */}
                  {aiProvider === 'anthropic' ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-700">Anthropic Key</label>
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault()
                            window.raven.openExternal('https://console.anthropic.com')
                          }}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Get key
                          <ExternalLink size={10} />
                        </a>
                      </div>
                      <div className="relative">
                        <input
                          type={showAiKey ? 'text' : 'password'}
                          value={anthropicKey}
                          onChange={(e) => { setAnthropicKey(e.target.value); setAiKeyInvalid(false); setError(null) }}
                          placeholder="sk-ant-..."
                          className={`w-full px-3 py-2.5 pr-10 bg-white border rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 transition-colors ${
                            aiKeyInvalid
                              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                          }`}
                        />
                        {anthropicKey && (
                          <button
                            type="button"
                            onClick={() => setShowAiKey(!showAiKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {showAiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        Claude models. Pay-as-you-go.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-700">OpenAI Key</label>
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault()
                            window.raven.openExternal('https://platform.openai.com/api-keys')
                          }}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Get key
                          <ExternalLink size={10} />
                        </a>
                      </div>
                      <div className="relative">
                        <input
                          type={showAiKey ? 'text' : 'password'}
                          value={openaiKey}
                          onChange={(e) => { setOpenaiKey(e.target.value); setAiKeyInvalid(false); setError(null) }}
                          placeholder="sk-..."
                          className={`w-full px-3 py-2.5 pr-10 bg-white border rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 transition-colors ${
                            aiKeyInvalid
                              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                          }`}
                        />
                        {openaiKey && (
                          <button
                            type="button"
                            onClick={() => setShowAiKey(!showAiKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {showAiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        GPT models. Pay-as-you-go.
                      </p>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <svg
                      className="w-4 h-4 text-red-500 mt-0.5 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleBack}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors"
                  >
                    <ArrowLeft size={14} />
                    Back
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={!deepgramKey.trim() || !aiKey.trim() || validating}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-b from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium shadow-sm transition-all"
                  >
                    {validating ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        Next
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Permissions */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="text-center mb-1">
                  <h2 className="text-lg font-semibold text-gray-900 mb-0.5">Permissions</h2>
                  <p className="text-xs text-gray-500">
                    Raven needs these permissions to work properly.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                        <svg width="18" height="18" viewBox="0 0 24 24" className="text-blue-600" fill="currentColor">
                          <path d="M12 3a4 4 0 0 0-4 4v4.5a4 4 0 1 0 8 0V7a4 4 0 0 0-4-4Z" />
                          <path d="M6.25 11.5a.75.75 0 0 1 .75.75 5 5 0 0 0 10 0 .75.75 0 0 1 1.5 0 6.5 6.5 0 0 1-5.75 6.46V21a.75.75 0 0 1-1.5 0v-2.29A6.5 6.5 0 0 1 5.5 12.25a.75.75 0 0 1 .75-.75Z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Microphone</p>
                        <p className="text-xs text-gray-500">For capturing your voice</p>
                      </div>
                    </div>
                    {micPermission === 'granted' ? (
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-md">Granted</span>
                    ) : (
                      <button
                        onClick={requestMicPermission}
                        className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-md hover:bg-blue-100 transition-colors"
                      >
                        Grant
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between bg-gray-50 rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
                        <svg width="18" height="18" viewBox="0 0 24 24" className="text-purple-600" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="3" width="20" height="14" rx="2" />
                          <path d="M8 21h8M12 17v4" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Screen Recording</p>
                        <p className="text-xs text-gray-500">For capturing system audio and screenshots</p>
                      </div>
                    </div>
                    {screenPermission === 'granted' ? (
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-md">Granted</span>
                    ) : (
                      <button
                        onClick={requestScreenPermission}
                        className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-md hover:bg-blue-100 transition-colors"
                      >
                        Grant
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between bg-gray-50 rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                        <svg width="18" height="18" viewBox="0 0 24 24" className="text-amber-600" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <circle cx="12" cy="12" r="3" />
                          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Accessibility</p>
                        <p className="text-xs text-gray-500">For keyboard shortcuts to move the overlay</p>
                      </div>
                    </div>
                    {accessibilityPermission === 'granted' ? (
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-md">Granted</span>
                    ) : (
                      <button
                        onClick={async () => {
                          const granted = await window.raven.permissionsRequestAccessibility()
                          if (granted) {
                            setAccessibilityPermission('granted')
                          } else {
                            await window.raven.permissionsOpenAccessibility()
                          }
                        }}
                        className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-md hover:bg-blue-100 transition-colors"
                      >
                        Grant
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-gray-400 text-center">
                  You can grant permissions later in System Preferences if needed.
                </p>

                <div className="flex gap-3 pt-1">
                  <button onClick={handleBack} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">
                    <ArrowLeft size={14} /> Back
                  </button>
                  <button onClick={handleNext} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-b from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 text-white rounded-xl text-sm font-medium shadow-sm transition-all">
                    Next <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Shortcut Tutorial */}
            {step === 4 && (
              <div className="space-y-5">
                <div className="text-center mb-1">
                  <h2 className="text-lg font-semibold text-gray-900 mb-0.5">Learn the Shortcuts</h2>
                  <p className="text-xs text-gray-500">
                    These are the essential keyboard shortcuts you'll use.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
                  {[
                    { keys: [cmdKey, '\\'], label: 'Show / Hide Overlay', description: 'Toggle Raven visibility anytime' },
                    { keys: [cmdKey, '↵'], label: 'AI Assist', description: 'Screenshot + transcript analysis' },
                    { keys: [cmdKey, 'R'], label: 'Start / Stop Session', description: 'Begin or end a recording' },
                    { keys: [cmdKey, '⇧', 'R'], label: 'Clear Conversation', description: 'Reset the AI conversation' },
                  ].map((shortcut) => (
                    <div key={shortcut.label} className="flex items-center justify-between py-1">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{shortcut.label}</p>
                        <p className="text-xs text-gray-500">{shortcut.description}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, ki) => (
                          <kbd
                            key={ki}
                            className="min-w-[26px] h-6 px-1.5 flex items-center justify-center text-[11px] font-medium text-gray-600 bg-white border border-gray-200 rounded shadow-sm"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 pt-1">
                  <button onClick={handleBack} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">
                    <ArrowLeft size={14} /> Back
                  </button>
                  <button onClick={handleNext} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-b from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 text-white rounded-xl text-sm font-medium shadow-sm transition-all">
                    Next <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Confirm & Save */}
            {step === 5 && (
              <div className="space-y-5">
                <div className="text-center mb-1">
                  <h2 className="text-lg font-semibold text-gray-900 mb-0.5">Ready to Go</h2>
                  <p className="text-xs text-gray-500">Your keys have been validated. You're all set.</p>
                </div>

                {/* Summary card */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <Key size={13} className="text-gray-400" />
                      <span className="text-sm text-gray-600">Deepgram</span>
                    </div>
                    <span className="text-xs font-mono text-green-600 bg-green-50 px-2 py-0.5 rounded-md">
                      {deepgramKey.slice(0, 6)}...{deepgramKey.slice(-4)}
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <Key size={13} className="text-gray-400" />
                      <span className="text-sm text-gray-600">
                        {aiProvider === 'anthropic' ? 'Anthropic' : 'OpenAI'}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-green-600 bg-green-50 px-2 py-0.5 rounded-md">
                      {aiKey.slice(0, 6)}...{aiKey.slice(-4)}
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <Sparkles size={13} className="text-gray-400" />
                      <span className="text-sm text-gray-600">Model</span>
                    </div>
                    <span className="text-xs text-gray-700 font-medium">
                      {aiProvider === 'anthropic' ? 'Claude Haiku 4.5' : 'GPT-5 Mini'}
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield size={13} className="text-gray-400" />
                      <span className="text-sm text-gray-600">Storage</span>
                    </div>
                    <span className="text-xs text-gray-700 font-medium">Encrypted, local only</span>
                  </div>
                </div>

                {/* Shortcuts card */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Keyboard size={13} className="text-gray-500" />
                    <p className="text-sm font-medium text-gray-700">Shortcuts</p>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { keys: [cmdKey, '↵'], label: 'AI Suggestion' },
                      { keys: [cmdKey, 'R'], label: 'Toggle Recording' },
                      { keys: [cmdKey, '\\'], label: 'Toggle Overlay' },
                    ].map((shortcut) => (
                      <div
                        key={shortcut.label}
                        className="flex items-center justify-between"
                      >
                        <span className="text-xs text-gray-500">{shortcut.label}</span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, ki) => (
                            <kbd
                              key={ki}
                              className="min-w-[24px] h-5 px-1.5 flex items-center justify-center text-[10px] font-medium text-gray-600 bg-white border border-gray-200 rounded shadow-sm"
                            >
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <svg
                      className="w-4 h-4 text-red-500 mt-0.5 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleBack}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors"
                  >
                    <ArrowLeft size={14} />
                    Back
                  </button>
                  <button
                    onClick={handleSaveKeys}
                    disabled={validating}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-b from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 disabled:from-blue-400 disabled:to-blue-600 disabled:opacity-70 text-white rounded-xl text-sm font-medium shadow-sm transition-all"
                  >
                    {validating ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        Launch Raven
                        <ArrowRight size={15} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
