import { useEffect, useState } from 'react'

type TranscriptionProvider = 'deepgram' | 'whisperlivekit'
type AiProvider = 'anthropic' | 'openai' | 'ollama'
type WebSearchMode = 'off' | 'explicit' | 'automatic'
type WebSearchBackend = 'brave' | 'searxng'

export function LocalProvidersPanel() {
  const [transcription, setTranscription] = useState<TranscriptionProvider>('deepgram')
  const [ai, setAi] = useState<AiProvider>('anthropic')
  const [baseURL, setBaseURL] = useState('http://127.0.0.1:11434')
  const [models, setModels] = useState<Array<{ name: string; supportsVision: boolean }>>([])
  const [model, setModel] = useState('')
  const [interviewComplexModel, setInterviewComplexModel] = useState('')
  const [message, setMessage] = useState('')
  const [webSearchMode, setWebSearchMode] = useState<WebSearchMode>('off')
  const [webSearchBackend, setWebSearchBackend] = useState<WebSearchBackend>('searxng')
  const [braveKey, setBraveKey] = useState('')
  const [hasBraveKey, setHasBraveKey] = useState(false)
  const [searxngUrl, setSearxngUrl] = useState('http://127.0.0.1:8080')
  const [localSearch, setLocalSearch] = useState<LocalSearchStatus | null>(null)
  const [installingSearch, setInstallingSearch] = useState(false)
  const [readiness, setReadiness] = useState<(ProviderReadiness & { summary: string }) | null>(null)

  useEffect(() => {
    void (async () => {
      const [stt, provider, url, selected, savedComplexModel, searchMode, searchBackend, savedSearxngUrl, searchStatus] = await Promise.all([
        window.raven.storeGet('transcriptionProvider'), window.raven.storeGet('aiProvider'),
        window.raven.storeGet('ollamaBaseUrl'), window.raven.storeGet('aiModel'),
        window.raven.storeGet('interviewComplexModel'),
        window.raven.storeGet('webSearchMode'), window.raven.storeGet('webSearchBackend'),
        window.raven.storeGet('searxngBaseUrl'), window.raven.webSearchStatus(),
      ])
      if (stt === 'whisperlivekit') setTranscription(stt)
      if (provider === 'anthropic' || provider === 'openai' || provider === 'ollama') setAi(provider)
      if (typeof url === 'string' && url) setBaseURL(url)
      if (typeof selected === 'string') setModel(selected)
      if (typeof savedComplexModel === 'string') setInterviewComplexModel(savedComplexModel)
      if (searchMode === 'off' || searchMode === 'explicit' || searchMode === 'automatic') setWebSearchMode(searchMode)
      if (searchBackend === 'brave' || searchBackend === 'searxng') setWebSearchBackend(searchBackend)
      if (typeof savedSearxngUrl === 'string' && savedSearxngUrl) setSearxngUrl(savedSearxngUrl)
      setHasBraveKey(searchStatus.hasBraveKey)
      setLocalSearch(searchStatus.localSearch)
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
    if (webSearchMode !== 'off' && webSearchBackend === 'brave' && !hasBraveKey && !braveKey.trim()) {
      setMessage('Add a Brave Search API key or choose SearXNG.'); return
    }
    if (braveKey.trim()) {
      await window.raven.webSearchSaveBraveKey(braveKey.trim())
      setHasBraveKey(true)
      setBraveKey('')
    }
    await window.raven.storeSaveMany({
      transcriptionProvider: transcription,
      aiProvider: ai,
      aiModel: model || await window.raven.storeGet('aiModel'),
      ollamaBaseUrl: baseURL,
      interviewComplexModel,
      webSearchMode,
      webSearchBackend,
      searxngBaseUrl: searxngUrl,
    })
    if (transcription === 'whisperlivekit') await window.raven.localSttStart()
    const result = await window.raven.providersReadiness()
    setReadiness(result)
    setMessage(result.canStartSession ? 'Provider configuration is ready.' : result.errors.join(' '))
  }

  const testWebSearch = async () => {
    setMessage('Testing web search…')
    try {
      if (braveKey.trim()) {
        await window.raven.webSearchSaveBraveKey(braveKey.trim())
        setHasBraveKey(true)
        setBraveKey('')
      }
      const result = await window.raven.webSearchTest(webSearchBackend, searxngUrl)
      if (!result?.healthy) throw new Error('Web search test failed. Check the key or local SearXNG service.')
      setMessage(`Web search is ready (${result.resultCount} test results).`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Web search test failed.')
    }
  }

  const setupLocalSearch = async () => {
    setInstallingSearch(true)
    setMessage('Installing free local search… This one-time setup can take several minutes.')
    try {
      const status = await window.raven.localSearchSetup()
      setLocalSearch(status)
      if (status.state === 'failed') throw new Error(status.error || 'Local-search setup failed.')
      const started = await window.raven.localSearchStart(searxngUrl)
      setLocalSearch(started)
      setMessage(started.state === 'ready' || started.state === 'external'
        ? 'Free local search is ready. Docker is not required.'
        : started.error || `Local search: ${started.state}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Local-search setup failed.')
    } finally {
      setInstallingSearch(false)
    }
  }

  const startLocalSearch = async () => {
    setMessage('Starting free local search…')
    try {
      const status = await window.raven.localSearchStart(searxngUrl)
      setLocalSearch(status)
      setMessage(status.error || `Local search: ${status.state}. Docker is not required.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Local search could not start.')
    }
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
          <label className="block text-xs text-gray-600">Complex interview model
            <select value={interviewComplexModel} onChange={(e) => setInterviewComplexModel(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm">
              <option value="">Same as primary model</option>
              {models.map((item) => <option key={`complex-${item.name}`} value={item.name}>{item.name}{item.supportsVision ? ' · vision' : ' · text'}</option>)}
            </select>
            <span className="mt-1 block text-[11px] text-gray-500">Used only for coding, corrections, multipart questions, synthesis, and ambiguous technical questions.</span>
          </label>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
            <div>
              <p className="text-xs font-medium text-gray-800">Optional internet search</p>
              <p className="text-[11px] text-gray-600">The model stays local, but each search query leaves this computer. Raven never sends the complete transcript to the search API.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-gray-600">Permission
                <select value={webSearchMode} onChange={(e) => setWebSearchMode(e.target.value as WebSearchMode)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm">
                  <option value="off">Off</option>
                  <option value="explicit">Only when I ask</option>
                  <option value="automatic">Automatic when required</option>
                </select>
              </label>
              <label className="text-xs text-gray-600">Backend
                <select value={webSearchBackend} onChange={(e) => setWebSearchBackend(e.target.value as WebSearchBackend)} disabled={webSearchMode === 'off'} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm disabled:opacity-50">
                  <option value="searxng">Free local search (managed SearXNG)</option>
                  <option value="brave">Brave Search (paid API)</option>
                </select>
              </label>
            </div>
            {webSearchMode !== 'off' && webSearchBackend === 'brave' && (
              <div className="space-y-2">
                <input type="password" value={braveKey} onChange={(e) => setBraveKey(e.target.value)} placeholder={hasBraveKey ? 'Brave key saved · enter to replace' : 'Brave Search API key'} aria-label="Brave Search API key" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                <div className="flex gap-2">
                  <button onClick={() => void window.raven.openExternal('https://api-dashboard.search.brave.com/')} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs">Get Brave API key</button>
                  {hasBraveKey && <button onClick={() => void window.raven.webSearchSaveBraveKey('').then(() => { setHasBraveKey(false); setMessage('Saved Brave key removed.') })} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs">Remove saved key</button>}
                </div>
              </div>
            )}
            {webSearchMode !== 'off' && webSearchBackend === 'searxng' && (
              <div className="space-y-2">
                <p className="text-[11px] text-gray-600">Raven installs and starts this private loopback service automatically. No Docker, paid API, or manual startup is required after setup.</p>
                <input value={searxngUrl} onChange={(e) => setSearxngUrl(e.target.value)} aria-label="SearXNG URL" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                <div className="flex flex-wrap items-center gap-2">
                  {!localSearch?.installed && (
                    <button disabled={installingSearch} onClick={() => void setupLocalSearch()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                      {installingSearch ? 'Installing…' : 'Install free local search'}
                    </button>
                  )}
                  {localSearch?.installed && (
                    <button onClick={() => void startLocalSearch()} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs">Start / health check</button>
                  )}
                  <span className="text-[11px] text-gray-600">Status: {localSearch?.state || 'checking'}</span>
                </div>
              </div>
            )}
            {webSearchMode !== 'off' && <button onClick={() => void testWebSearch()} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs">Test web search</button>}
          </div>
        </div>
      )}
      <div className="rounded-lg bg-white px-3 py-2 text-xs text-gray-700">{readiness?.summary || 'Select providers to see which meeting content leaves this computer.'}</div>
      {message && <p className="text-xs text-gray-600">{message}</p>}
      <button onClick={save} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white">Save provider selection</button>
    </div>
  )
}
