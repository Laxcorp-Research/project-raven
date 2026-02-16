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
  } catch (err) {
    return { valid: false, error: 'Could not reach Deepgram. Check your internet connection.' }
  }
}

export async function validateAnthropicKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const client = new Anthropic({ apiKey })

    // Send a minimal request to verify the key
    await client.messages.create({
      model: 'claude-sonnet-4-20250514',
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

export async function validateBothKeys(
  deepgramKey: string,
  anthropicKey: string
): Promise<{ valid: boolean; error?: string }> {
  const [deepgramResult, anthropicResult] = await Promise.all([
    validateDeepgramKey(deepgramKey),
    validateAnthropicKey(anthropicKey)
  ])

  if (!deepgramResult.valid) {
    return deepgramResult
  }

  if (!anthropicResult.valid) {
    return anthropicResult
  }

  return { valid: true }
}
