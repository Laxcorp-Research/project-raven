import { getApiKey, getSetting } from '../store'
import { DEFAULT_OLLAMA_URL, OllamaProvider } from './ai/ollamaProvider'

export interface ProviderReadiness {
  audioReady: boolean
  transcriptionReady: boolean
  aiReady: boolean
  canStartSession: boolean
  errors: string[]
  warnings: string[]
  dataPath: {
    audioLeavesDevice: boolean
    transcriptLeavesDevice: boolean
    providers: string[]
  }
}

export interface LocalSttReadinessSource {
  getStatus(): { state: string; error?: string }
}

export async function evaluateProviderReadiness(localStt?: LocalSttReadinessSource): Promise<ProviderReadiness> {
  const transcriptionProvider = getSetting('transcriptionProvider') || 'deepgram'
  const aiProvider = getSetting('aiProvider') || 'anthropic'
  const errors: string[] = []
  const warnings: string[] = []
  let transcriptionReady = false
  let aiReady = false

  if (transcriptionProvider === 'deepgram') {
    transcriptionReady = Boolean(getApiKey('deepgramApiKey'))
    if (!transcriptionReady) errors.push('Add a Deepgram API key.')
  } else {
    const status = localStt?.getStatus()
    transcriptionReady = status?.state === 'ready'
    if (!transcriptionReady) errors.push(status?.error || 'Start and check the local WhisperLiveKit runtime.')
  }

  if (aiProvider === 'ollama') {
    const baseURL = String(getSetting('ollamaBaseUrl') || DEFAULT_OLLAMA_URL)
    const model = String(getSetting('aiModel') || '')
    const health = await OllamaProvider.health(baseURL)
    if (!health.healthy) errors.push(health.error || 'Start Ollama.')
    else if (!model) errors.push('Select an installed Ollama model.')
    else {
      const models = await OllamaProvider.listModels(baseURL).catch(() => [])
      aiReady = models.some((item) => item.name === model || item.name.split(':')[0] === model)
      if (!aiReady) errors.push(`Ollama model "${model}" is not installed.`)
      const selected = models.find((item) => item.name === model)
      if (selected && !selected.supportsVision) warnings.push('Selected Ollama model is text-only; screenshots will not be sent.')
    }
  } else {
    aiReady = aiProvider === 'openai' ? Boolean(getApiKey('openaiApiKey')) : Boolean(getApiKey('anthropicApiKey'))
    if (!aiReady) errors.push(`Add an ${aiProvider === 'openai' ? 'OpenAI' : 'Anthropic'} API key.`)
  }

  const audioLeavesDevice = transcriptionProvider === 'deepgram'
  const transcriptLeavesDevice = aiProvider !== 'ollama'
  const providers = [transcriptionProvider === 'deepgram' ? 'Deepgram' : 'WhisperLiveKit', aiProvider === 'ollama' ? 'Ollama' : aiProvider === 'openai' ? 'OpenAI' : 'Anthropic']
  return {
    audioReady: true,
    transcriptionReady,
    aiReady,
    canStartSession: transcriptionReady && aiReady,
    errors,
    warnings,
    dataPath: { audioLeavesDevice, transcriptLeavesDevice, providers },
  }
}

export function describeDataPath(readiness: ProviderReadiness): string {
  const { audioLeavesDevice, transcriptLeavesDevice } = readiness.dataPath
  if (!audioLeavesDevice && !transcriptLeavesDevice) return 'Meeting content stays on this computer.'
  if (!audioLeavesDevice && transcriptLeavesDevice) return `Audio transcription is local. Transcript will be sent to ${readiness.dataPath.providers[1]}.`
  if (audioLeavesDevice && !transcriptLeavesDevice) return 'Audio will be sent to Deepgram. AI response is generated locally.'
  return 'Audio and transcript use cloud providers.'
}
