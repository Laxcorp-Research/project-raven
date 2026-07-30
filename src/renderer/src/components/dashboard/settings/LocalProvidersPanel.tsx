import { useEffect, useState } from 'react'

type TranscriptionProvider = 'deepgram' | 'whisperlivekit'
type AiProvider = 'anthropic' | 'openai' | 'ollama'

export function LocalProvidersPanel() {
  const [transcription, setTranscription] = useState<TranscriptionProvider>('deepgram')
  const [ai, setAi] = useState<AiProvider>('anthropic')
  const [baseURL, setBaseURL] = useState('http://127.0.0.1:11434')
  const [models, setModels] = useState<Array<{ name: string; supportsVision: boolean }>>([])
  const [model, setModel] = useState('')
  const [message, setMessage] = useState('')
  const [readiness, setReadiness] = useState<(ProviderReadiness & { summary: string }) | null>(null)

  useEffect(() => {
    void (async () => {
      const [stt, provider, url, selected] = await Promise.all([
        window.raven.storeGet('transcriptionProvider'), window.raven.storeGet('aiProvider'),
        window.raven.storeGet('ollamaBaseUrl'), window.raven.storeGet('aiModel'),
      ])
      if (stt === 'whisperlivekit') setTranscription(stt)
      if (provider === 'anthropic' || provider === 'openai' || provider === 'ollama') setAi(provider)
      if (typeof url === 'string' && url) setBaseURL(url)
      if (typeof selected === 'string') setModel(selected)
      setReadiness(await window.raven.providersReadiness())
    })()
  }, [])

  const discover = async () => {
    setMessage('Checking local services…')
    try {
      const health = await window.raven.ollamaHealth(baseURL)
      if (!health?.healthy) throw new Error(health?.error || 'Ollama is unavailable.')
      const installed = await window.raven.ollamaListModels(baseURL)
      setModels(installed)
      if (!model && installed[0]) setModel(installed[0].name)
      setMessage(installed.length ? `Ollama ${health.version || ''}: ${installed.length} installed model(s).` : 'Ollama is running, but no models are installed. Run `ollama pull <model>`.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Local AI check failed.') }
  }

  const save = async () => {
    if (ai === 'ollama' && !model) { setMessage('Select an installed Ollama model.'); return }
    await window.raven.storeSaveMany({ transcriptionProvider: transcription, aiProvider: ai, aiModel: model || await window.raven.storeGet('aiModel'), ollamaBaseUrl: baseURL })
    if (transcription === 'whisperlivekit') await window.raven.localSttStart()
    const result = await window.raven.providersReadiness()
    setReadiness(result)
    setMessage(result.canStartSession ? 'Provider configuration is ready.' : result.errors.join(' '))
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-gray-900">Meeting content providers</h4>
        <p className="text-xs text-gray-500">Choose local or cloud independently. Local services run only through Raven’s main process.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-gray-600">Transcription
          <select value={transcription} onChange={(e) => setTranscription(e.target.value as TranscriptionProvider)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm">
            <option value="deepgram">Deepgram (cloud)</option>
            <option value="whisperlivekit">WhisperLiveKit (local)</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">AI
          <select value={ai} onChange={(e) => setAi(e.target.value as AiProvider)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm">
            <option value="anthropic">Anthropic (cloud)</option>
            <option value="openai">OpenAI (cloud)</option>
            <option value="ollama">Ollama (local)</option>
          </select>
        </label>
      </div>
      {transcription === 'whisperlivekit' && (
        <div className="flex gap-2 text-xs">
          <button onClick={() => void window.raven.localSttStart().then((s) => setMessage(s.error || `WhisperLiveKit: ${s.state}`))} className="rounded-lg border border-gray-300 bg-white px-3 py-2">Start / health check</button>
          <button onClick={() => void window.raven.localSttOpenSetup()} className="rounded-lg border border-gray-300 bg-white px-3 py-2">Open setup guide</button>
        </div>
      )}
      {ai === 'ollama' && (
        <div className="space-y-2">
          <input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} aria-label="Ollama URL" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <select value={model} onChange={(e) => setModel(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm">
              <option value="">Select installed model</option>
              {models.map((item) => <option key={item.name} value={item.name}>{item.name}{item.supportsVision ? ' · vision' : ' · text'}</option>)}
            </select>
            <button onClick={discover} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs">Discover / test</button>
          </div>
        </div>
      )}
      <div className="rounded-lg bg-white px-3 py-2 text-xs text-gray-700">{readiness?.summary || 'Select providers to see which meeting content leaves this computer.'}</div>
      {message && <p className="text-xs text-gray-600">{message}</p>}
      <button onClick={save} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white">Save provider selection</button>
    </div>
  )
}
