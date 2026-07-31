import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
const { mockHealth, mockListModels, mockPreload } = vi.hoisted(() => ({
  mockHealth: vi.fn(),
  mockListModels: vi.fn(),
  mockPreload: vi.fn(),
}))
vi.mock('../store', () => ({ getApiKey: vi.fn(), getSetting: vi.fn() }))
vi.mock('../services/ai/ollamaProvider', () => ({
  DEFAULT_OLLAMA_URL: 'http://127.0.0.1:11434',
  OllamaProvider: { health: mockHealth, listModels: mockListModels, preload: mockPreload },
}))
import { getSetting } from '../store'
import { describeDataPath, evaluateProviderReadiness, type ProviderReadiness } from '../services/providerReadiness'

function readiness(audioLeavesDevice: boolean, transcriptLeavesDevice: boolean, providers: string[], searchQueriesLeaveDevice = false): ProviderReadiness {
  return { audioReady: true, transcriptionReady: true, aiReady: true, canStartSession: true, errors: [], warnings: [], dataPath: { audioLeavesDevice, transcriptLeavesDevice, searchQueriesLeaveDevice, providers } }
}

describe('provider data-path descriptions', () => {
  it('preloads an installed local model during readiness', async () => {
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === 'transcriptionProvider') return 'whisperlivekit'
      if (key === 'aiProvider') return 'ollama'
      if (key === 'aiModel') return 'qwen3.6:35b'
      if (key === 'ollamaBaseUrl') return 'http://127.0.0.1:11434'
      if (key === 'webSearchMode') return 'off'
      return ''
    })
    mockHealth.mockResolvedValue({ healthy: true })
    mockListModels.mockResolvedValue([{ name: 'qwen3.6:35b', capabilities: [], supportsVision: false }])
    mockPreload.mockResolvedValue(undefined)

    const result = await evaluateProviderReadiness({ getStatus: () => ({ state: 'ready' }) })

    expect(result.canStartSession).toBe(true)
    expect(mockPreload).toHaveBeenCalledWith('qwen3.6:35b', 'http://127.0.0.1:11434')
  })

  it('preloads a distinct installed complex interview model', async () => {
    vi.mocked(getSetting).mockImplementation((key: string) => ({
      transcriptionProvider: 'whisperlivekit', aiProvider: 'ollama', aiModel: 'qwen3.5:9b',
      interviewComplexModel: 'qwen3.6:35b', ollamaBaseUrl: 'http://127.0.0.1:11434', webSearchMode: 'off',
    } as Record<string, unknown>)[key] as never)
    mockHealth.mockResolvedValue({ healthy: true })
    mockListModels.mockResolvedValue([
      { name: 'qwen3.5:9b', capabilities: [], supportsVision: false },
      { name: 'qwen3.6:35b', capabilities: [], supportsVision: false },
    ])
    mockPreload.mockResolvedValue(undefined)

    const result = await evaluateProviderReadiness({ getStatus: () => ({ state: 'ready' }) })

    expect(result.canStartSession).toBe(true)
    expect(mockPreload).toHaveBeenCalledWith('qwen3.6:35b', 'http://127.0.0.1:11434')
    expect(result.warnings).toContain('Complex interview model is text-only; screenshots will not be sent on routed turns.')
  })

  it('describes local-local without claiming air-gap', () => {
    const text = describeDataPath(readiness(false, false, ['WhisperLiveKit', 'Ollama']))
    expect(text).toContain('stays on this computer')
    expect(text).not.toContain('air-gap')
  })

  it('describes local transcription with cloud AI', () => {
    expect(describeDataPath(readiness(false, true, ['WhisperLiveKit', 'OpenAI']))).toContain('Transcript will be sent to OpenAI')
  })

  it('describes cloud transcription with local AI', () => {
    expect(describeDataPath(readiness(true, false, ['Deepgram', 'Ollama']))).toContain('Audio will be sent to Deepgram')
  })

  it('discloses the optional search-query data path', () => {
    const text = describeDataPath(readiness(false, false, ['WhisperLiveKit', 'Ollama', 'Brave Search'], true))
    expect(text).toContain('audio and transcript stay')
    expect(text).toContain('search queries use Brave Search')
  })
})
