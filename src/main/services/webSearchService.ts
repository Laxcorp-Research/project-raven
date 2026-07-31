import { createLogger } from '../logger'
import { localSearchProcessManager } from './localSearch/localSearchProcessManager'

const log = createLogger('WebSearch')
const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search'
const SEARCH_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 1_000_000
const MAX_QUERY_CHARS = 300
const MAX_RESULTS = 5

export type WebSearchBackend = 'brave' | 'searxng'

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface WebSearchConfig {
  backend: WebSearchBackend
  braveApiKey?: string
  searxngBaseUrl?: string
}

export interface LocalSearchAvailability {
  ensureAvailable(baseUrl: string): Promise<unknown>
}

export function validateSearxngUrl(value: string): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Invalid SearXNG URL.') }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error('SearXNG URL must use HTTP on localhost.')
  }
  if (url.username || url.password) throw new Error('SearXNG URL must not contain credentials.')
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname.replace(/\/$/, '')
  return url
}

export class WebSearchService {
  constructor(private readonly localSearch: LocalSearchAvailability = localSearchProcessManager) {}

  async search(config: WebSearchConfig, rawQuery: string, signal?: AbortSignal): Promise<WebSearchResult[]> {
    const query = normalizeQuery(rawQuery)
    if (!query) throw new Error('Web search query is empty.')
    log.info(`Search requested (backend=${config.backend}, chars=${query.length})`)
    return config.backend === 'brave'
      ? this.searchBrave(config.braveApiKey || '', query, signal)
      : this.searchSearxng(config.searxngBaseUrl || '', query, signal)
  }

  private async searchBrave(apiKey: string, query: string, signal?: AbortSignal): Promise<WebSearchResult[]> {
    if (!apiKey.trim()) throw new Error('Add a Brave Search API key in Settings.')
    const url = new URL(BRAVE_SEARCH_URL)
    url.searchParams.set('q', query)
    url.searchParams.set('count', String(MAX_RESULTS))
    url.searchParams.set('safesearch', 'moderate')
    const body = await fetchJson(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
      signal,
    }) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }
    return sanitizeResults((body.web?.results || []).map((item) => ({
      title: item.title || '', url: item.url || '', snippet: item.description || '',
    })))
  }

  private async searchSearxng(baseUrl: string, query: string, signal?: AbortSignal): Promise<WebSearchResult[]> {
    const url = validateSearxngUrl(baseUrl)
    await this.localSearch.ensureAvailable(url.toString())
    url.pathname = `${url.pathname.replace(/\/$/, '')}/search`
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('safesearch', '1')
    const body = await fetchJson(url, { signal }) as {
      results?: Array<{ title?: string; url?: string; content?: string }>
    }
    return sanitizeResults((body.results || []).map((item) => ({
      title: item.title || '', url: item.url || '', snippet: item.content || '',
    })))
  }
}

function normalizeQuery(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_CHARS)
}

function sanitizeResults(results: WebSearchResult[]): WebSearchResult[] {
  return results.flatMap((result) => {
    let url: URL
    try { url = new URL(result.url) } catch { return [] }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return []
    return [{
      title: cleanText(result.title, 200) || url.hostname,
      url: url.toString(),
      snippet: cleanText(result.snippet, 700),
    }]
  }).slice(0, MAX_RESULTS)
}

function cleanText(value: string, max: number): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function fetchJson(url: URL, init: RequestInit): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('Web search timed out.')), SEARCH_TIMEOUT_MS)
  const abort = () => controller.abort(init.signal?.reason)
  init.signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) throw new Error('Web search redirects are not allowed.')
    if (!response.ok) throw new Error(`Web search failed (HTTP ${response.status}).`)
    const declaredSize = Number(response.headers.get('content-length') || 0)
    if (declaredSize > MAX_RESPONSE_BYTES) throw new Error('Web search response was too large.')
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('Web search response was too large.')
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', abort)
  }
}

export const webSearchService = new WebSearchService()
