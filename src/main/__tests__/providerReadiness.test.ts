import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
vi.mock('../store', () => ({ getApiKey: vi.fn(), getSetting: vi.fn() }))
import { describeDataPath, type ProviderReadiness } from '../services/providerReadiness'

function readiness(audioLeavesDevice: boolean, transcriptLeavesDevice: boolean, providers: string[], searchQueriesLeaveDevice = false): ProviderReadiness {
  return { audioReady: true, transcriptionReady: true, aiReady: true, canStartSession: true, errors: [], warnings: [], dataPath: { audioLeavesDevice, transcriptLeavesDevice, searchQueriesLeaveDevice, providers } }
}

describe('provider data-path descriptions', () => {
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
