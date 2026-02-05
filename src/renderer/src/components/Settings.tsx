import { useEffect, useState } from 'react'
import { useAppStore } from '../stores/appStore'

export function Settings() {
  const {
    showSettings,
    setShowSettings,
    deepgramApiKey,
    anthropicApiKey,
    setDeepgramApiKey,
    setAnthropicApiKey,
  } = useAppStore()

  const [dgKey, setDgKey] = useState(deepgramApiKey)
  const [anKey, setAnKey] = useState(anthropicApiKey)

  useEffect(() => {
    if (showSettings) {
      setDgKey(deepgramApiKey)
      setAnKey(anthropicApiKey)
    }
  }, [showSettings])

  if (!showSettings) return null

  const handleSave = async () => {
    setDeepgramApiKey(dgKey)
    setAnthropicApiKey(anKey)
    await window.raven.saveSettings({
      deepgramApiKey: dgKey,
      anthropicApiKey: anKey,
    })
    setShowSettings(false)
  }

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 rounded-xl">
      <div className="bg-gray-800 rounded-lg w-[90%] max-w-sm p-4 shadow-xl border border-white/10">
        <h2 className="text-sm font-semibold text-white mb-3">Settings</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Deepgram API Key</label>
            <input
              type="password"
              value={dgKey}
              onChange={(e) => setDgKey(e.target.value)}
              placeholder="Enter Deepgram API key..."
              className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Anthropic API Key</label>
            <input
              type="password"
              value={anKey}
              onChange={(e) => setAnKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
        </div>

        <p className="text-[10px] text-gray-600 mt-3">🌐 Language is auto-detected · 🔐 Keys stored locally</p>

        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setShowSettings(false)}
            className="flex-1 py-1.5 text-xs text-gray-400 hover:text-gray-200 bg-white/5 hover:bg-white/10 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-500 rounded font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
