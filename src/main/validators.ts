import Anthropic from '@anthropic-ai/sdk'

export async function validateDeepgramKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.deepgram.com/v1/projects', {
      headers: {
        Authorization: `Token ${apiKey}`
      }
    })

    if (response.ok) {
      return { valid: true }
    }

    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: 'Invalid Deepgram API key.' }
    }

    return { valid: false, error: `Deepgram returned status ${response.status}.` }
  } catch {
    return { valid: false, error: 'Could not reach Deepgram. Check your internet connection.' }
  }
}

export async function validateAnthropicKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const client = new Anthropic({ apiKey })

    await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
    })

    return { valid: true }
  } catch (err: unknown) {
    const status = err != null && typeof err === 'object' && 'status' in err
      ? (err as { status: number }).status
      : undefined;
    if (status === 401) {
      return { valid: false, error: 'Invalid Anthropic API key.' }
    }
    if (status === 403) {
      return { valid: false, error: 'Anthropic key does not have permission. Check your plan.' }
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('fetch')) {
      return { valid: false, error: 'Could not reach Anthropic. Check your internet connection.' }
    }
    return { valid: false, error: `Anthropic error: ${msg || 'Unknown error'}` }
  }
}

export async function validateOpenAIKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
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
  } catch {
    return { valid: false, error: 'Could not reach OpenAI. Check your internet connection.' }
  }
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
    validateDeepgramKey(deepgramKey),
    aiValidation
  ])

  const deepgramError = deepgramResult.valid ? undefined : (deepgramResult.error || 'Invalid Deepgram key.')
  const aiError = aiResult.valid ? undefined : (aiResult.error || `Invalid ${aiProvider === 'openai' ? 'OpenAI' : 'Anthropic'} key.`)

  if (deepgramError || aiError) {
    const invalidKeys = [
      deepgramError ? 'Deepgram' : null,
      aiError ? (aiProvider === 'openai' ? 'OpenAI' : 'Anthropic') : null,
    ].filter(Boolean)
    const error = `Invalid ${invalidKeys.join(', ')} key${invalidKeys.length > 1 ? 's' : ''}.`
    return { valid: false, error, deepgramError, aiError }
  }

  return { valid: true }
}
