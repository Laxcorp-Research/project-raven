import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OllamaProvider, validateOllamaUrl } from '../services/ai/ollamaProvider'

describe('OllamaProvider', () => {
  beforeEach(() => { vi.restoreAllMocks() })

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

  it('streams native Ollama text with thinking disabled by default', async () => {
    vi.spyOn(OllamaProvider, 'health').mockResolvedValue({ healthy: true })
    vi.spyOn(OllamaProvider, 'inspectModel').mockResolvedValue({ capabilities: ['thinking'], supportsVision: false })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      '{"message":{"content":"hel"},"done":false}\n{"message":{"content":"lo"},"done":true}\n',
      { status: 200 },
    ))
    const controller = new AbortController()
    const onText = vi.fn(); const onDone = vi.fn()
    await new OllamaProvider('qwen:latest').streamResponse(
      { system: 'system', messages: [{ role: 'user', content: 'prompt' }] },
      { onText, onDone, onError: vi.fn() }, { signal: controller.signal },
    )
    expect(onText).toHaveBeenNthCalledWith(1, 'hel')
    expect(onText).toHaveBeenNthCalledWith(2, 'lo')
    expect(onDone).toHaveBeenCalledWith('hello')
    const [, request] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(request?.body))
    expect(body).toEqual(expect.objectContaining({ think: false, stream: true, options: { num_predict: 300 } }))
    expect(request).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('enables thinking, expands its token budget, and sends images in native format', async () => {
    vi.spyOn(OllamaProvider, 'health').mockResolvedValue({ healthy: true })
    vi.spyOn(OllamaProvider, 'inspectModel').mockResolvedValue({ capabilities: ['vision', 'thinking'], supportsVision: true })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      '{"message":{"thinking":"hidden","content":"answer"},"done":true}\n',
      { status: 200 },
    ))
    const onText = vi.fn()
    await new OllamaProvider('qwen:latest').streamResponse(
      {
        system: 'system',
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'read this' },
          { type: 'image', mediaType: 'image/png', base64: 'abc123' },
        ] }],
        maxTokens: 300,
      },
      { onText, onDone: vi.fn(), onError: vi.fn() },
      { thinking: true },
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.think).toBe(true)
    expect(body.options.num_predict).toBe(4096)
    expect(body.messages[1]).toEqual({ role: 'user', content: 'read this', images: ['abc123'] })
    expect(onText).toHaveBeenCalledWith('answer')
  })

  it('uses direct mode for short generations', async () => {
    vi.spyOn(OllamaProvider, 'health').mockResolvedValue({ healthy: true })
    vi.spyOn(OllamaProvider, 'inspectModel').mockResolvedValue({ capabilities: [], supportsVision: false })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ message: { content: '  A title  ' } }), { status: 200 },
    ))
    await expect(new OllamaProvider('qwen:latest').generateShort({ prompt: 'title' })).resolves.toBe('A title')
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toEqual(expect.objectContaining({ think: false, stream: false }))
  })

  it('executes the controlled web-search tool and grounds the streamed answer', async () => {
    vi.spyOn(OllamaProvider, 'health').mockResolvedValue({ healthy: true })
    vi.spyOn(OllamaProvider, 'inspectModel').mockResolvedValue({ capabilities: ['tools'], supportsVision: false })
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        message: { tool_calls: [
          { function: { name: 'web_search', arguments: { query: 'current Raven release' } } },
          { function: { name: 'web_search', arguments: { query: 'duplicate unnecessary query' } } },
        ] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(
        '{"message":{"content":"Grounded [source](https://example.com)"},"done":true}\n',
        { status: 200 },
      ))
    const search = vi.fn().mockResolvedValue([
      { title: 'Source', url: 'https://example.com', snippet: 'Current information' },
    ])
    const onText = vi.fn(); const onSearch = vi.fn()

    await new OllamaProvider('qwen:latest').streamResponse(
      { system: 'system', messages: [{ role: 'user', content: 'look this up' }] },
      { onText, onDone: vi.fn(), onError: vi.fn() },
      { webSearch: { force: true, fallbackQuery: 'look this up', search, onSearch } },
    )

    expect(search).toHaveBeenCalledWith('current Raven release', undefined)
    expect(onSearch).toHaveBeenCalledWith(1)
    const decisionBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(decisionBody.tools[0].function.name).toBe('web_search')
    expect(decisionBody.messages.at(-1).content).toContain('Do not search for timeless concepts')
    expect(decisionBody.messages.at(-1).content).toContain('verify a claim against current documentation')
    expect(decisionBody.messages.at(-1).content).toContain('primary or official sources')
    expect(search).toHaveBeenCalledTimes(1)
    const answerBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(answerBody.tools).toBeUndefined()
    expect(answerBody.options.num_predict).toBe(600)
    expect(answerBody.messages.at(-1).content).toContain('https://example.com')
    expect(answerBody.messages.at(-1).content).toContain('untrusted data')
    expect(answerBody.messages.at(-1).content).toContain('no more than 180 words')
    expect(answerBody.messages.at(-1).content).toContain('copied, transferred, and genuinely shared state')
    expect(answerBody.messages.at(-1).content).toContain('Cite only URLs present in the evidence')
    expect(answerBody.messages.at(-1).content).toContain('identify which component owns network listeners')
    expect(answerBody.messages.at(-1).content).toContain('separate V8 isolates/heaps')
    expect(answerBody.messages.at(-1).content).toContain('[Source](https://example.com)')
    expect(onText).toHaveBeenCalledWith('Grounded [source](https://example.com)')
  })

  it('uses the explicit request as a fallback query when the model omits a tool call', async () => {
    vi.spyOn(OllamaProvider, 'health').mockResolvedValue({ healthy: true })
    vi.spyOn(OllamaProvider, 'inspectModel').mockResolvedValue({ capabilities: ['tools'], supportsVision: false })
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: 'No tool' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: 'query: site:nodejs.org worker_threads SharedArrayBuffer' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{"message":{"content":"answer"},"done":true}\n', { status: 200 }))
    const search = vi.fn().mockResolvedValue([])
    await new OllamaProvider('qwen:latest').streamResponse(
      { system: 'system', messages: [{ role: 'user', content: 'search now' }] },
      { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
      { webSearch: { force: true, fallbackQuery: 'search now', search } },
    )
    expect(search).toHaveBeenCalledWith('site:nodejs.org worker_threads SharedArrayBuffer', undefined)
    expect(search).toHaveBeenCalledWith('worker_threads SharedArrayBuffer', undefined)
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('fails closed when a forced verification search returns no evidence', async () => {
    vi.spyOn(OllamaProvider, 'health').mockResolvedValue({ healthy: true })
    vi.spyOn(OllamaProvider, 'inspectModel').mockResolvedValue({ capabilities: ['tools'], supportsVision: false })
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { tool_calls: [{ function: { name: 'web_search', arguments: { query: 'current facts' } } }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{"message":{"content":"cautious"},"done":true}\n', { status: 200 }))
    const search = vi.fn().mockResolvedValue([])
    await new OllamaProvider('qwen:latest').streamResponse(
      { system: 'system', messages: [{ role: 'user', content: 'verify this' }] },
      { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
      { webSearch: { force: true, fallbackQuery: 'verify this', search } },
    )
    const answerBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(answerBody.messages.at(-1).content).toContain('verification failed')
    expect(answerBody.messages.at(-1).content).toContain('Do not invent or cite sources')
  })

  it('rejects a missing configured model', async () => {
    vi.spyOn(OllamaProvider, 'health').mockResolvedValue({ healthy: true })
    vi.spyOn(OllamaProvider, 'inspectModel').mockRejectedValue(new Error('Ollama model "missing" is not installed.'))
    await expect(new OllamaProvider('missing').generateShort({ prompt: 'x' })).rejects.toThrow('not installed')
  })
})
