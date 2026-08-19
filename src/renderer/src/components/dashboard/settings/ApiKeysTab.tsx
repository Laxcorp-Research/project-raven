import { useState, useEffect } from 'react'
import { createLogger } from '../../../lib/logger'

const log = createLogger('Settings:ApiKeys')

export function ApiKeysTab() {
  const [deepgramKey, setDeepgramKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [assemblyKey, setAssemblyKey] = useState('')
  const [showAssembly, setShowAssembly] = useState(false)
  const [originalAssemblyKey, setOriginalAssemblyKey] = useState('')
  const [assemblyStatus, setAssemblyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [showOpenai, setShowOpenai] = useState(false)
  const [originalOpenaiKey, setOriginalOpenaiKey] = useState('')
  const [showDeepgram, setShowDeepgram] = useState(false)
  const [showAnthropic, setShowAnthropic] = useState(false)
  const [originalDeepgramKey, setOriginalDeepgramKey] = useState('')
  const [originalAnthropicKey, setOriginalAnthropicKey] = useState('')
  const [deepgramStatus, setDeepgramStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [anthropicStatus, setAnthropicStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [openaiStatus, setOpenaiStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
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
        const oaiKey = (await window.raven.storeGet('openaiApiKey')) as string
        if (oaiKey) {
          setOpenaiKey(oaiKey)
          setOriginalOpenaiKey(oaiKey)
          setOpenaiStatus('valid')
        }
        const aaiKey = (await window.raven.storeGet('assemblyaiApiKey')) as string
        if (aaiKey) { setAssemblyKey(aaiKey); setOriginalAssemblyKey(aaiKey); setAssemblyStatus('valid') }
      } catch (error) {
        log.error('Failed to load API keys:', error)
      }
    }
    loadKeys()
  }, [])

  const hasChanges =
    deepgramKey.trim() !== originalDeepgramKey
    || anthropicKey.trim() !== originalAnthropicKey
    || openaiKey.trim() !== originalOpenaiKey
    || assemblyKey.trim() !== originalAssemblyKey
  const canSave = hasChanges

  const validateKeys = async (showSuccessMessage = true) => {
    if (!deepgramKey.trim() && !assemblyKey.trim()) {
      setSaveMessage({ type: 'error', text: 'Add a Deepgram or AssemblyAI key for transcription' })
      return false
    }

    if (!anthropicKey.trim() && !openaiKey.trim()) {
      setSaveMessage({ type: 'error', text: 'Add an Anthropic or OpenAI key' })
      return false
    }

    if (deepgramKey.trim()) setDeepgramStatus('validating')
    if (anthropicKey.trim()) setAnthropicStatus('validating')
    if (openaiKey.trim()) setOpenaiStatus('validating')
    setSaveMessage(null)

    try {
      const firstProvider = anthropicKey.trim() ? 'anthropic' : 'openai'
      const firstKey = anthropicKey.trim() || openaiKey.trim()
      const result = await window.raven.validateKeys(deepgramKey.trim(), firstProvider, firstKey)
      if ('throttled' in result && result.throttled) {
        setSaveMessage({ type: 'error', text: 'Please wait a moment and try again.' })
        return false
      }
      if (!result.valid) {
        if (result.deepgramError) setDeepgramStatus('invalid')
        else if (deepgramKey.trim()) setDeepgramStatus('idle')
        if (result.aiError) {
          if (firstProvider === 'openai') setOpenaiStatus('invalid')
          else setAnthropicStatus('invalid')
        }
        setSaveMessage({ type: 'error', text: result.error || 'Invalid API keys' })
        return false
      }
      if (deepgramKey.trim()) setDeepgramStatus('valid')
      if (firstProvider === 'anthropic') setAnthropicStatus('valid')
      if (firstProvider === 'openai') setOpenaiStatus('valid')

      if (anthropicKey.trim() && openaiKey.trim()) {
        const openaiResult = await window.raven.validateKeys('', 'openai', openaiKey.trim())
        if ('throttled' in openaiResult && openaiResult.throttled) {
          setSaveMessage({ type: 'error', text: 'Please wait a moment and try again.' })
          return false
        }
        if (!openaiResult.valid) {
          setOpenaiStatus('invalid')
          setSaveMessage({ type: 'error', text: openaiResult.error || 'Invalid OpenAI key' })
          return false
        }
        setOpenaiStatus('valid')
      }

      if (assemblyKey.trim()) {
        setAssemblyStatus('validating')
        const aai = await window.raven.validateAssemblyAIKey(assemblyKey.trim())
        if (!aai.valid) {
          setAssemblyStatus('invalid')
          setSaveMessage({ type: 'error', text: aai.error || 'Invalid AssemblyAI key' })
          return false
        }
        setAssemblyStatus('valid')
      }

      if (showSuccessMessage) setSaveMessage({ type: 'success', text: 'Connection verified successfully' })
      return true
    } catch {
      if (deepgramKey.trim()) setDeepgramStatus('invalid')
      if (anthropicKey.trim()) setAnthropicStatus('invalid')
      if (openaiKey.trim()) setOpenaiStatus('invalid')
      setSaveMessage({ type: 'error', text: 'Failed to validate connection' })
      return false
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveMessage(null)

    const isValid = await validateKeys(false)
    if (isValid) {
      try {
        await window.raven.apiKeysSave(deepgramKey.trim(), anthropicKey.trim(), openaiKey.trim(), {
          assemblyaiApiKey: assemblyKey.trim(),
        })
        setSaveMessage({ type: 'success', text: 'API keys saved' })
        setOriginalDeepgramKey(deepgramKey.trim())
        setOriginalAnthropicKey(anthropicKey.trim())
        setOriginalOpenaiKey(openaiKey.trim())
        setOriginalAssemblyKey(assemblyKey.trim())
      } catch {
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
        Bring your own keys. They stay on this machine. Pick which model uses them under Models.
      </p>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Deepgram API Key <span className="text-gray-400 font-normal">(or AssemblyAI)</span>
          </label>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.raven.openExternal('https://console.deepgram.com/')
            }}
            className="text-xs text-blue-600 hover:text-blue-700"
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
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
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
        <p className="text-xs text-gray-400">Real-time speech-to-text. Fallback when AssemblyAI is unset or fails. Pick the engine under Language.</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            AssemblyAI API Key <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.raven.openExternal('https://www.assemblyai.com/dashboard/signup')
            }}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            Get API Key &rarr;
          </a>
        </div>
        <div className="relative">
          <input
            type={showAssembly ? 'text' : 'password'}
            value={assemblyKey}
            onChange={(e) => {
              setAssemblyKey(e.target.value)
              setAssemblyStatus('idle')
              setSaveMessage(null)
            }}
            placeholder="Enter your AssemblyAI API key"
            className={`w-full px-3 py-2 pr-20 border rounded-lg text-sm transition-colors ${
              assemblyStatus === 'invalid'
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : assemblyStatus === 'valid'
                ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
            } focus:outline-none focus:ring-1`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {getStatusIcon(assemblyStatus)}
            <button
              type="button"
              onClick={() => setShowAssembly(!showAssembly)}
              className="text-gray-400 hover:text-gray-600"
            >
              {showAssembly ? (
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
        <p className="text-xs text-gray-400">Preferred STT on native capture.</p>
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
            className="text-xs text-blue-600 hover:text-blue-700"
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
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
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
        <p className="text-xs text-gray-400">Claude. Choose where to use it under Models.</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            OpenAI API Key <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.raven.openExternal('https://platform.openai.com/api-keys')
            }}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            Get API Key &rarr;
          </a>
        </div>
        <div className="relative">
          <input
            type={showOpenai ? 'text' : 'password'}
            value={openaiKey}
            onChange={(e) => {
              setOpenaiKey(e.target.value)
              setOpenaiStatus('idle')
              setSaveMessage(null)
            }}
            placeholder="sk-..."
            className={`w-full px-3 py-2 pr-20 border rounded-lg text-sm transition-colors ${
              openaiStatus === 'invalid'
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : openaiStatus === 'valid'
                ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
            } focus:outline-none focus:ring-1`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {getStatusIcon(openaiStatus)}
            <button
              type="button"
              onClick={() => setShowOpenai(!showOpenai)}
              className="text-gray-400 hover:text-gray-600"
            >
              {showOpenai ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18" />
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
        <p className="text-xs text-gray-400">GPT. Choose where to use it under Models.</p>
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
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? 'Validating...' : hasChanges ? 'Save & Validate' : 'Saved ✓'}
        </button>
        <button
          onClick={async () => {
            setIsTesting(true)
            await validateKeys()
            setIsTesting(false)
          }}
          disabled={isSaving || isTesting}
          className="px-4 py-2 text-gray-600 text-sm font-medium hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTesting ? 'Testing...' : 'Test Connection'}
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
