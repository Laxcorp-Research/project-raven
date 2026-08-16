/**
 * Client-side STT routing previously owned by the backend proxy.
 * Picks AssemblyAI Universal-3 Pro for the six European languages it
 * actually supports; everything else (including auto-detect) goes to
 * Deepgram nova-3.
 */

export const U3_RT_PRO_LANGUAGES = new Set(['en', 'es', 'fr', 'de', 'pt', 'it'])
export const MANDATORY_KEYTERMS = ['Raven'] as const
export const MAX_KEYTERMS = 100

export type TranscriptProviderConfig =
  | { kind: 'assemblyai'; speechModel: 'u3-rt-pro' }
  | { kind: 'deepgram'; model: 'nova-3'; language: string }

export type NativeSttStrategy = 'assembly-retry' | 'deepgram' | 'none'

/**
 * Native-capture STT pick. Language routing wins when the routed
 * provider is keyed. If the user only has the other vendor key, use
 * that rather than failing the session.
 */
export function chooseNativeSttStrategy(opts: {
  language: string | undefined
  hasAssemblyKey: boolean
  hasDeepgramKey: boolean
}): NativeSttStrategy {
  const routed = pickTranscriptProvider(opts.language)
  if (routed.kind === 'assemblyai' && opts.hasAssemblyKey) return 'assembly-retry'
  if (opts.hasDeepgramKey) return 'deepgram'
  if (opts.hasAssemblyKey) return 'assembly-retry'
  return 'none'
}

export function pickTranscriptProvider(language: string | undefined): TranscriptProviderConfig {
  if (!language || language === 'multi') {
    return { kind: 'deepgram', model: 'nova-3', language: 'multi' }
  }
  const normalized = language.toLowerCase().split(/[-_]/)[0] ?? ''
  if (U3_RT_PRO_LANGUAGES.has(normalized)) {
    return { kind: 'assemblyai', speechModel: 'u3-rt-pro' }
  }
  return { kind: 'deepgram', model: 'nova-3', language: normalized }
}

export function sanitizeKeyterms(userTerms: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const term of MANDATORY_KEYTERMS) {
    const norm = term.trim()
    if (!norm) continue
    const key = norm.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(norm)
    if (out.length >= MAX_KEYTERMS) return out
  }
  for (const raw of userTerms ?? []) {
    if (typeof raw !== 'string') continue
    const norm = raw.trim()
    if (!norm) continue
    const key = norm.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(norm)
    if (out.length >= MAX_KEYTERMS) return out
  }
  return out
}

export function buildProviderBody(
  config: TranscriptProviderConfig,
  keyterms: string[],
): Record<string, unknown> {
  if (config.kind === 'assemblyai') {
    const body: Record<string, unknown> = { speech_model: config.speechModel }
    if (keyterms.length > 0) {
      body.keyterms_prompt = keyterms.join(', ')
    }
    return { assembly_ai_v3_streaming: body }
  }
  const body: Record<string, unknown> = {
    model: config.model,
    language: config.language,
    smart_format: 'true',
  }
  if (keyterms.length > 0) {
    body.keyterms = keyterms
  }
  return { deepgram_streaming: body }
}

export function parseVocabulary(vocabString: string | undefined): string[] {
  if (!vocabString) return []
  return vocabString
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

export function buildSdkUploadBody(opts: {
  transcriptionLanguage?: string
  keyterms?: string[]
}): { body: Record<string, unknown>; provider: TranscriptProviderConfig } {
  const providerConfig = pickTranscriptProvider(opts.transcriptionLanguage)
  const keyterms = sanitizeKeyterms(opts.keyterms)
  return {
    provider: providerConfig,
    body: {
      recording_config: {
        video_mixed_mp4: null,
        transcript: {
          provider: buildProviderBody(providerConfig, keyterms),
        },
        realtime_endpoints: [
          {
            type: 'desktop_sdk_callback',
            events: [
              'transcript.data',
              'transcript.partial_data',
              'participant_events.join',
              'participant_events.leave',
              'participant_events.speech_on',
              'participant_events.speech_off',
            ],
          },
        ],
        retention: {
          type: 'timed',
          hours: 168,
        },
      },
    },
  }
}
