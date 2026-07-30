import type { AIContentPart, AIMessage, AIProvider, AIRequestOptions, StreamCallbacks } from './types'
import type OpenAI from 'openai'

export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434'
const CONNECT_TIMEOUT_MS = 5_000

export interface OllamaModelInfo {
  name: string
  size?: number
  modifiedAt?: string
  capabilities: string[]
  supportsVision: boolean
}

export function validateOllamaUrl(value: string): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Invalid Ollama URL.') }
  if (url.protocol !== 'http:') throw new Error('Ollama URL must use HTTP.')
  if (url.username || url.password) throw new Error('Ollama URL must not contain credentials.')
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('Ollama URL must use localhost or a loopback address.')
  }
  if (url.port && (!/^\d+$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65535)) {
    throw new Error('Ollama URL has an invalid port.')
  }
  url.pathname = url.pathname.replace(/\/$/, '')
  url.search = ''
  url.hash = ''
  return url
}

async function localFetch(baseURL: string, path: string, init: RequestInit = {}, timeoutMs = CONNECT_TIMEOUT_MS): Promise<Response> {
  const base = validateOllamaUrl(baseURL)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('Ollama connection timed out.')), timeoutMs)
  const external = init.signal
  const abort = () => controller.abort(external?.reason)
  external?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(new URL(path, `${base.toString()}/`), {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
    })
    if (response.status >= 300 && response.status < 400) throw new Error('Ollama redirects are not allowed.')
    return response
  } finally {
    clearTimeout(timer)
    external?.removeEventListener('abort', abort)
  }
}

async function ollamaSdkFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const target = typeof input === 'string' || input instanceof URL ? new URL(input) : new URL(input.url)
  validateOllamaUrl(`${target.protocol}//${target.host}`)
  const response = await fetch(input, { ...init, redirect: 'manual' })
  if (response.status >= 300 && response.status < 400) throw new Error('Ollama redirects are not allowed.')
  return response
}

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama' as const

  constructor(private model: string, private baseURL = DEFAULT_OLLAMA_URL) {
    validateOllamaUrl(baseURL)
  }

  static async health(baseURL = DEFAULT_OLLAMA_URL, signal?: AbortSignal): Promise<{ healthy: boolean; version?: string; error?: string }> {
    try {
      const response = await localFetch(baseURL, '/api/version', { signal })
      if (!response.ok) return { healthy: false, error: `Ollama returned HTTP ${response.status}.` }
      const body = await response.json() as { version?: string }
      return { healthy: true, version: body.version }
    } catch (error) {
      return { healthy: false, error: error instanceof Error ? error.message : 'Ollama is unavailable.' }
    }
  }

  static async listModels(baseURL = DEFAULT_OLLAMA_URL, signal?: AbortSignal): Promise<OllamaModelInfo[]> {
    const response = await localFetch(baseURL, '/api/tags', { signal })
    if (!response.ok) throw new Error(`Unable to list Ollama models (HTTP ${response.status}).`)
    const body = await response.json() as { models?: Array<{ name?: string; model?: string; size?: number; modified_at?: string }> }
    return Promise.all((body.models || []).map(async (item) => {
      const name = item.name || item.model || ''
      const detail = await this.inspectModel(name, baseURL, signal).catch(() => ({ capabilities: [], supportsVision: false }))
      return { name, size: item.size, modifiedAt: item.modified_at, ...detail }
    }))
  }

  static async inspectModel(model: string, baseURL = DEFAULT_OLLAMA_URL, signal?: AbortSignal): Promise<{ capabilities: string[]; supportsVision: boolean }> {
    if (!model.trim()) throw new Error('Select an installed Ollama model.')
    const response = await localFetch(baseURL, '/api/show', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model }),
      signal,
    })
    if (response.status === 404) throw new Error(`Ollama model "${model}" is not installed.`)
    if (!response.ok) throw new Error(`Unable to inspect Ollama model (HTTP ${response.status}).`)
    const body = await response.json() as { capabilities?: string[] }
    const capabilities = body.capabilities || []
    return { capabilities, supportsVision: capabilities.includes('vision') }
  }

  async streamResponse(
    params: { system: string; messages: AIMessage[]; maxTokens?: number },
    callbacks: StreamCallbacks,
    options?: AIRequestOptions,
  ): Promise<void> {
    await this.requireInstalled(options?.signal)
    const OpenAIClient = (await import('openai')).default
    const client = new OpenAIClient({ apiKey: 'ollama', baseURL: `${validateOllamaUrl(this.baseURL).origin}/v1`, fetch: ollamaSdkFetch })
    let fullText = ''
    try {
      const stream = await client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'system', content: params.system }, ...params.messages.map(toOpenAIMessage)],
        max_tokens: params.maxTokens ?? 300,
        stream: true,
      }, { signal: options?.signal, timeout: 30_000 })
      for await (const chunk of stream) {
        if (options?.signal?.aborted) throw options.signal.reason || new Error('AI request cancelled.')
        const text = chunk.choices[0]?.delta?.content || ''
        if (text) { fullText += text; callbacks.onText(text) }
      }
      callbacks.onDone(fullText)
    } catch (error) {
      const message = options?.signal?.aborted
        ? 'AI request cancelled.'
        : error instanceof Error ? `Ollama error: ${error.message}` : 'Ollama request failed.'
      callbacks.onError(message)
      throw error
    }
  }

  async generateShort(params: { system?: string; prompt: string; maxTokens?: number }, options?: AIRequestOptions): Promise<string> {
    await this.requireInstalled(options?.signal)
    const OpenAIClient = (await import('openai')).default
    const client = new OpenAIClient({ apiKey: 'ollama', baseURL: `${validateOllamaUrl(this.baseURL).origin}/v1`, fetch: ollamaSdkFetch })
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []
    if (params.system) messages.push({ role: 'system', content: params.system })
    messages.push({ role: 'user', content: params.prompt })
    const response = await client.chat.completions.create({ model: this.model, messages, max_tokens: params.maxTokens ?? 60 }, { signal: options?.signal, timeout: 30_000 })
    return response.choices[0]?.message?.content?.trim() || ''
  }

  private async requireInstalled(signal?: AbortSignal): Promise<void> {
    const health = await OllamaProvider.health(this.baseURL, signal)
    if (!health.healthy) throw new Error(health.error || 'Ollama is unavailable. Start Ollama and try again.')
    const models = await OllamaProvider.listModels(this.baseURL, signal)
    if (!models.some((item) => item.name === this.model || item.name.split(':')[0] === this.model)) {
      throw new Error(`Ollama model "${this.model}" is not installed. Run: ollama pull ${this.model}`)
    }
  }
}

function toOpenAIMessage(message: AIMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  if (message.role === 'assistant') {
    return { role: 'assistant', content: contentText(message.content) }
  }
  if (typeof message.content === 'string') return { role: 'user', content: message.content }
  return { role: 'user', content: message.content.map((part) => part.type === 'text'
    ? { type: 'text' as const, text: part.text }
    : { type: 'image_url' as const, image_url: { url: `data:${part.mediaType};base64,${part.base64}` } }) }
}

function contentText(content: string | AIContentPart[]): string {
  return typeof content === 'string' ? content : content.filter((part) => part.type === 'text').map((part) => part.text).join('\n')
}
