/**
 * STT engine pick shared by main (recording) and the Language settings UI.
 * AssemblyAI Universal-3 Pro realtime only covers six languages; Deepgram
 * nova-3 covers the rest, including auto-detect.
 */

export const U3_RT_PRO_LANGUAGES = new Set(['en', 'es', 'fr', 'de', 'pt', 'it'])

export const ASSEMBLYAI_LIVE_LANGUAGE_LABELS =
  'English, Spanish, French, German, Portuguese, and Italian'

export type TranscriptProviderConfig =
  | { kind: 'assemblyai'; speechModel: 'u3-rt-pro' }
  | { kind: 'deepgram'; model: 'nova-3'; language: string }

export type NativeSttStrategy = 'assembly-retry' | 'deepgram' | 'none'

export type SttProviderPreference = 'auto' | 'assemblyai' | 'deepgram'

export function parseSttProviderPreference(value: unknown): SttProviderPreference {
  if (value === 'assemblyai' || value === 'deepgram' || value === 'auto') return value
  return 'auto'
}

export function assemblyaiSupportsLanguage(language: string | undefined): boolean {
  if (!language || language === 'multi') return false
  const normalized = language.toLowerCase().split(/[-_]/)[0] ?? ''
  return U3_RT_PRO_LANGUAGES.has(normalized)
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

/**
 * Native-capture STT pick. Explicit preference wins when that engine is
 * keyed and (for Assembly) language-supported. Otherwise language routing,
 * then whichever key exists.
 */
export function chooseNativeSttStrategy(opts: {
  language: string | undefined
  hasAssemblyKey: boolean
  hasDeepgramKey: boolean
  preferredProvider?: unknown
}): NativeSttStrategy {
  const preferred = parseSttProviderPreference(opts.preferredProvider)
  const assemblyUsable = assemblyaiSupportsLanguage(opts.language) && opts.hasAssemblyKey

  if (preferred === 'deepgram') {
    if (opts.hasDeepgramKey) return 'deepgram'
    if (opts.hasAssemblyKey) return 'assembly-retry'
    return 'none'
  }

  if (preferred === 'assemblyai') {
    if (assemblyUsable) return 'assembly-retry'
    if (opts.hasDeepgramKey) return 'deepgram'
    if (opts.hasAssemblyKey) return 'assembly-retry'
    return 'none'
  }

  const routed = pickTranscriptProvider(opts.language)
  if (routed.kind === 'assemblyai' && opts.hasAssemblyKey) return 'assembly-retry'
  if (opts.hasDeepgramKey) return 'deepgram'
  if (opts.hasAssemblyKey) return 'assembly-retry'
  return 'none'
}

export function effectiveSttEngine(
  opts: Parameters<typeof chooseNativeSttStrategy>[0],
): 'assemblyai' | 'deepgram' | 'none' {
  const strategy = chooseNativeSttStrategy(opts)
  if (strategy === 'assembly-retry') return 'assemblyai'
  if (strategy === 'deepgram') return 'deepgram'
  return 'none'
}
