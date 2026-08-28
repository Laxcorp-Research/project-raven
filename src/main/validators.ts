function isElectronRuntime(): boolean {
  return typeof process.versions.electron === 'string'
}

/**
 * Hard deadline for a key-validation probe. Without it, a stalled network
 * (blocked/slow proxy, a silently-dropped connection, a slow TLS handshake)
 * leaves the fetch pending forever, which hangs the whole "Save & Validate" /
 * "Test Connection" flow in Settings ("it keeps on loading"). Validation is a
 * cheap auth ping, so a short deadline is safe.
 */
export const VALIDATION_TIMEOUT_MS = 10_000

/**
 * Electron's Node/undici `fetch` often throws on vendor TLS (Anthropic in
 * particular). Chromium `net.fetch` uses the same cert store as the rest of
 * the app. Tests and non-Electron callers keep using global `fetch`. Every
 * request carries an abort signal so it can never hang past the deadline.
 */
async function vendorGet(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS)
  try {
    if (isElectronRuntime()) {
      const { net } = await import('electron')
      if (typeof net?.fetch === 'function') {
        return (await net.fetch(url, { headers, signal: controller.signal })) as Response
      }
    }
    return await fetch(url, { headers, signal: controller.signal })
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`timed out after ${Math.round(VALIDATION_TIMEOUT_MS / 1000)}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function vendorUnreachable(name: string, err: unknown): { valid: false; error: string } {
  const detail = err instanceof Error && err.message.trim() ? err.message.trim() : 'network error'
  return { valid: false, error: `Could not reach ${name} (${detail}).` }
}

function statusFromUnknown(err: unknown): number | undefined {
  if (err != null && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: unknown }).status
    if (typeof status === 'number' && status > 0) return status
  }
  return undefined
}

function interpretAnthropicHttpStatus(status: number): { valid: boolean; error?: string } {
  if (status >= 200 && status < 300) return { valid: true }
  if (status === 401) return { valid: false, error: 'Invalid Anthropic API key.' }
  if (status === 403) return { valid: false, error: 'Anthropic key does not have permission. Check your plan.' }
  if (status === 429) {
    return { valid: false, error: 'Anthropic rate-limited the check. Wait a few seconds and try again.' }
  }
  return { valid: false, error: `Anthropic returned status ${status}.` }
}

/** messages.create 400/404 still mean the key was accepted (model/billing). */
function interpretAnthropicSdkStatus(status: number): { valid: boolean; error?: string } {
  if (status === 400 || status === 404) return { valid: true }
  return interpretAnthropicHttpStatus(status)
}

export async function validateDeepgramKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await vendorGet('https://api.deepgram.com/v1/projects', {
      Authorization: `Token ${apiKey}`,
    })

    if (response.ok) {
      return { valid: true }
    }

    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: 'Invalid Deepgram API key.' }
    }

    return { valid: false, error: `Deepgram returned status ${response.status}.` }
  } catch (err) {
    return vendorUnreachable('Deepgram', err)
  }
}

export async function validateAnthropicKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  // Prefer GET /v1/models — auth only, no specific chat model required.
  // If that transport throws (common with Node fetch in Electron), fall
  // back to the official SDK. A 400/404 from messages.create is still a
  // valid key (model alias or billing), not "invalid key."
  try {
    const response = await vendorGet('https://api.anthropic.com/v1/models', {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    })

    if (response.ok) {
      return { valid: true }
    }
    return interpretAnthropicHttpStatus(response.status)
  } catch (httpErr) {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      // Bound the fallback too: the SDK defaults to a 10-minute timeout with
      // retries, which would re-introduce the "keeps loading" hang here.
      const client = new Anthropic({ apiKey, timeout: VALIDATION_TIMEOUT_MS, maxRetries: 0 })
      await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 8,
        messages: [{ role: 'user', content: 'ping' }],
      })
      return { valid: true }
    } catch (sdkErr) {
      const status = statusFromUnknown(sdkErr)
      if (status !== undefined) return interpretAnthropicSdkStatus(status)
      return vendorUnreachable('Anthropic', sdkErr instanceof Error ? sdkErr : httpErr)
    }
  }
}

export async function validateOpenAIKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await vendorGet('https://api.openai.com/v1/models', {
      Authorization: `Bearer ${apiKey}`,
    })

    if (response.ok) {
      return { valid: true }
    }

    if (response.status === 401) {
      return { valid: false, error: 'Invalid OpenAI API key.' }
    }
    if (response.status === 403) {
      return { valid: false, error: 'OpenAI key does not have permission. Check your plan.' }
    }

    return { valid: false, error: `OpenAI returned status ${response.status}.` }
  } catch (err) {
    return vendorUnreachable('OpenAI', err)
  }
}

export async function validateAssemblyAIKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await vendorGet('https://api.assemblyai.com/v2/account', {
      authorization: apiKey,
    })

    if (response.ok) {
      return { valid: true }
    }
    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: 'Invalid AssemblyAI API key.' }
    }
    return { valid: false, error: `AssemblyAI returned status ${response.status}.` }
  } catch (err) {
    return vendorUnreachable('AssemblyAI', err)
  }
}

export const DEFAULT_RECALL_API_URL = 'https://ap-northeast-1.recall.ai'

export function normalizeRecallApiUrl(url: string | undefined): string {
  const trimmed = (url || DEFAULT_RECALL_API_URL).trim().replace(/\/$/, '')
  return trimmed || DEFAULT_RECALL_API_URL
}

export async function validateRecallKey(
  _apiKey: string,
  _apiUrl?: string,
): Promise<{ valid: boolean; error?: string }> {
  return { valid: false, error: 'Recall is not available.' }
}

export async function validateBothKeys(
  deepgramKey: string,
  anthropicKey: string
): Promise<{ valid: boolean; error?: string }> {
  const [deepgramResult, anthropicResult] = await Promise.all([
    validateDeepgramKey(deepgramKey),
    anthropicKey === 'skip' ? { valid: true } : validateAnthropicKey(anthropicKey)
  ])

  if (!deepgramResult.valid) {
    return deepgramResult
  }

  if (!anthropicResult.valid) {
    return anthropicResult
  }

  return { valid: true }
}

export async function validateKeys(
  deepgramKey: string,
  aiProvider: 'anthropic' | 'openai',
  aiKey: string
): Promise<{ valid: boolean; error?: string; deepgramError?: string; aiError?: string }> {
  const aiValidation = aiProvider === 'openai'
    ? validateOpenAIKey(aiKey)
    : validateAnthropicKey(aiKey)

  const [deepgramResult, aiResult] = await Promise.all([
    deepgramKey ? validateDeepgramKey(deepgramKey) : Promise.resolve({ valid: true as const }),
    aiValidation
  ])

  const deepgramError = deepgramResult.valid ? undefined : (deepgramResult.error || 'Invalid Deepgram key.')
  const aiError = aiResult.valid ? undefined : (aiResult.error || `Invalid ${aiProvider === 'openai' ? 'OpenAI' : 'Anthropic'} key.`)

  if (deepgramError || aiError) {
    const invalidKeys = [
      deepgramError ? 'Deepgram' : null,
      aiError ? (aiProvider === 'openai' ? 'OpenAI' : 'Anthropic') : null,
    ].filter(Boolean)
    const error = deepgramError && aiError
      ? `Invalid ${invalidKeys.join(', ')} keys.`
      : (aiError || deepgramError) as string
    return { valid: false, error, deepgramError, aiError }
  }

  return { valid: true }
}
