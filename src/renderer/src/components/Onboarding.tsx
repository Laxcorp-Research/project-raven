import { useState } from 'react'

interface OnboardingProps {
  onComplete: () => void
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [deepgramKey, setDeepgramKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)

  const handleNext = () => {
    if (step < 3) setStep((s) => (s + 1) as 1 | 2 | 3)
  }

  const handleBack = () => {
    if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3)
    setError(null)
  }

  const handleSaveKeys = async () => {
    if (!deepgramKey.trim() || !anthropicKey.trim()) {
      setError('Both API keys are required.')
      return
    }

    setValidating(true)
    setError(null)

    try {
      const result = await window.raven.validateApiKeys(deepgramKey.trim(), anthropicKey.trim())

      if (!result.valid) {
        setError(result.error || 'Invalid API keys.')
        setValidating(false)
        return
      }

      await window.raven.apiKeysSave(deepgramKey.trim(), anthropicKey.trim())
      await window.raven.storeSet('onboardingComplete', true)
      onComplete()
    } catch (err) {
      setError('Failed to save keys. Please try again.')
    }

    setValidating(false)
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <div className="w-full max-w-md mx-auto p-8">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                s === step ? 'bg-cyan-500' : s < step ? 'bg-cyan-700' : 'bg-gray-600'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="text-center space-y-6">
            <div className="text-6xl mb-4">🐦‍⬛</div>
            <h1 className="text-3xl font-bold">Welcome to Raven</h1>
            <p className="text-gray-400 leading-relaxed">
              Your AI-powered meeting assistant. Raven transcribes your conversations in real-time
              and provides intelligent suggestions — all while staying invisible to screen sharing.
            </p>
            <p className="text-gray-500 text-sm">
              You'll need API keys from Deepgram and Anthropic to get started. They're stored
              locally and encrypted on your machine.
            </p>
            <button
              onClick={handleNext}
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-medium transition-colors"
            >
              Get Started
            </button>
          </div>
        )}

        {/* Step 2: API Keys */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Enter API Keys</h2>
              <p className="text-gray-400 text-sm">
                Your keys are stored locally and encrypted. They never leave your machine.
              </p>
            </div>

            <div className="space-y-4">
              {/* Deepgram */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-300">Deepgram API Key</label>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      window.raven.openExternal('https://console.deepgram.com')
                    }}
                    className="text-xs text-cyan-500 hover:text-cyan-400"
                  >
                    Get a key →
                  </a>
                </div>
                <input
                  type="password"
                  value={deepgramKey}
                  onChange={(e) => setDeepgramKey(e.target.value)}
                  placeholder="Enter your Deepgram API key"
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Free tier: $200 credit. Used for real-time transcription.
                </p>
              </div>

              {/* Anthropic */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-300">Anthropic API Key</label>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      window.raven.openExternal('https://console.anthropic.com')
                    }}
                    className="text-xs text-cyan-500 hover:text-cyan-400"
                  >
                    Get a key →
                  </a>
                </div>
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Pay-as-you-go. Used for AI suggestions.
                </p>
              </div>
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-500 rounded-lg p-3 text-red-300 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleNext}
                disabled={!deepgramKey.trim() || !anthropicKey.trim()}
                className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm & Save */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Ready to Go</h2>
              <p className="text-gray-400 text-sm">
                Confirm your setup. We'll validate both keys before saving.
              </p>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Deepgram Key</span>
                <span className="text-green-400 font-mono">
                  {deepgramKey.slice(0, 8)}...{deepgramKey.slice(-4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Anthropic Key</span>
                <span className="text-green-400 font-mono">
                  {anthropicKey.slice(0, 12)}...{anthropicKey.slice(-4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Storage</span>
                <span className="text-gray-300">Encrypted, local only</span>
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-gray-300">Quick shortcuts:</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                <div>
                  <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300">⌘+Enter</kbd>{' '}
                  AI Suggestion
                </div>
                <div>
                  <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300">⌘+⇧+R</kbd>{' '}
                  Toggle Recording
                </div>
                <div>
                  <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300">⌘+⇧+H</kbd>{' '}
                  Toggle Overlay
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-500 rounded-lg p-3 text-red-300 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSaveKeys}
                disabled={validating}
                className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800 rounded-lg font-medium transition-colors"
              >
                {validating ? 'Validating...' : 'Launch Raven'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
