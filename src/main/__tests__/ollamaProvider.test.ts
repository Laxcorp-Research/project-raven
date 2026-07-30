import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OllamaProvider, validateOllamaUrl } from '../services/ai/ollamaProvider'

const mockCreate = vi.fn()
vi.mock('openai', () => ({ default: class { chat = { completions: { create: mockCreate } } } }))

describe('OllamaProvider', () => {
  beforeEach(() => { vi.restoreAllMocks(); mockCreate.mockReset() })

  it.each(['https://localhost:11434', 'http://example.com:11434', 'http://user:pass@localhost:11434', 'file:///tmp/ollama'])('rejects unsafe URL %s', (url) => {
    expect(() => validateOllamaUrl(url)).toThrow()
  })

  it('accepts loopback HTTP URLs', () => {
    expect(validateOllamaUrl('http://127.0.0.1:11434').hostname).toBe('127.0.0.1')
    expect(validateOllamaUrl('http://[::1]:11434').hostname).toBe('[::1]')
  })

  it('reports a healthy server version without following redirects', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ version: '0.12.0' }), { status: 200 }))
    await expect(OllamaProvider.health()).resolves.toEqual({ healthy: true, version: '0.12.0' })
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: 'manual' }))
  })

  it('rejects redirects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://example.com' } }))
    const result = await OllamaProvider.health()
    expect(result.healthy).toBe(false)
    expect(result.error).toContain('redirect')
  })

  it('lists installed models and inspects vision capability', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'llava:latest' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ capabilities: ['completion', 'vision'] }), { status: 200 }))
    await expect(OllamaProvider.listModels()).resolves.toEqual([
      expect.objectContaining({ name: 'llava:latest', supportsVision: true }),
    ])
  })

  it('returns an actionable unavailable-server result', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'))
    await expect(OllamaProvider.health()).resolves.toEqual(expect.objectContaining({ healthy: false, error: expect.stringContaining('ECONNREFUSED') }))
  })

  it('streams text and forwards AbortSignal to the OpenAI-compatible request', async () => {
    vi.spyOn(OllamaProvider, 'health').mockResolvedValue({ healthy: true })
    vi.spyOn(OllamaProvider, 'listModels').mockResolvedValue([{ name: 'qwen:latest', capabilities: [], supportsVision: false }])
    mockCreate.mockResolvedValue((async function* () { yield { choices: [{ delta: { content: 'hello' } }] } })())
    const controller = new AbortController()
    const onText = vi.fn(); const onDone = vi.fn()
    await new OllamaProvider('qwen:latest').streamResponse(
      { system: 'system', messages: [{ role: 'user', content: 'prompt' }] },
      { onText, onDone, onError: vi.fn() }, { signal: controller.signal },
    )
    expect(onText).toHaveBeenCalledWith('hello')
    expect(onDone).toHaveBeenCalledWith('hello')
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ stream: true, max_tokens: 300 }), expect.objectContaining({ signal: controller.signal }))
  })

  it('rejects a missing configured model', async () => {
    vi.spyOn(OllamaProvider, 'health').mockResolvedValue({ healthy: true })
    vi.spyOn(OllamaProvider, 'listModels').mockResolvedValue([])
    await expect(new OllamaProvider('missing').generateShort({ prompt: 'x' })).rejects.toThrow('not installed')
  })
})
