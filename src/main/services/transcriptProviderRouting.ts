/**
 * Client-side STT routing previously owned by the backend proxy.
 * Language + user preference live in src/shared/sttCapabilities.ts so the
 * Language settings UI uses the same pick as recording.
 */

import {
  pickTranscriptProvider,
  type TranscriptProviderConfig,
} from '../../shared/sttCapabilities'

export {
  U3_RT_PRO_LANGUAGES,
  pickTranscriptProvider,
  chooseNativeSttStrategy,
  assemblyaiSupportsLanguage,
  parseSttProviderPreference,
  effectiveSttEngine,
  type TranscriptProviderConfig,
  type NativeSttStrategy,
  type SttProviderPreference,
} from '../../shared/sttCapabilities'

export const MANDATORY_KEYTERMS = ['Raven'] as const
export const MAX_KEYTERMS = 100

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
