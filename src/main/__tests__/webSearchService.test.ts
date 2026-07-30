import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateSearxngUrl, WebSearchService } from '../services/webSearchService'

describe('WebSearchService', () => {
  beforeEach(() => vi.restoreAllMocks())

  it.each([
    'https://127.0.0.1:8080',
    'http://example.com:8080',
    'http://user:pass@localhost:8080',
    'file:///tmp/search',
  ])('rejects unsafe SearXNG URL %s', (url) => {
    expect(() => validateSearxngUrl(url)).toThrow()
  })

  it('accepts loopback SearXNG and requests JSON results', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      results: [{ title: '<b>Result</b>', url: 'https://example.com/page', content: '<p>Useful snippet</p>' }],
    }), { status: 200 }))
    const results = await new WebSearchService().search({
      backend: 'searxng', searxngBaseUrl: 'http://127.0.0.1:8080/',
    }, ' current facts\nprivate tail ')
    expect(results).toEqual([{ title: 'Result', url: 'https://example.com/page', snippet: 'Useful snippet' }])
    const url = fetchMock.mock.calls[0][0] as URL
    expect(url.origin).toBe('http://127.0.0.1:8080')
    expect(url.pathname).toBe('/search')
    expect(url.searchParams.get('format')).toBe('json')
    expect(url.searchParams.get('q')).toBe('current facts private tail')
  })

  it('uses Brave fixed HTTPS endpoint and protected header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      web: { results: [{ title: 'Official', url: 'https://example.org', description: 'Current answer' }] },
    }), { status: 200 }))
    const results = await new WebSearchService().search({ backend: 'brave', braveApiKey: 'secret-key' }, 'release status')
    expect(results).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect((url as URL).origin).toBe('https://api.search.brave.com')
    expect((init?.headers as Record<string, string>)['X-Subscription-Token']).toBe('secret-key')
    expect(init).toEqual(expect.objectContaining({ redirect: 'manual' }))
  })

  it('rejects redirects and missing Brave keys', async () => {
    const service = new WebSearchService()
    await expect(service.search({ backend: 'brave' }, 'query')).rejects.toThrow('Brave')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 302 }))
    await expect(service.search({ backend: 'brave', braveApiKey: 'key' }, 'query')).rejects.toThrow('redirect')
  })
})
