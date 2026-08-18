import { describe, it, expect } from 'vitest'
import {
  pickTranscriptProvider,
  chooseNativeSttStrategy,
  sanitizeKeyterms,
  buildProviderBody,
  parseVocabulary,
  buildSdkUploadBody,
  assemblyaiSupportsLanguage,
  parseSttProviderPreference,
} from '../transcriptProviderRouting'

describe('pickTranscriptProvider', () => {
  it('routes English to AssemblyAI u3-rt-pro', () => {
    expect(pickTranscriptProvider('en')).toEqual({ kind: 'assemblyai', speechModel: 'u3-rt-pro' })
  })

  it('routes en-US to AssemblyAI', () => {
    expect(pickTranscriptProvider('en-US').kind).toBe('assemblyai')
  })

  it('routes auto-detect and empty to Deepgram multi', () => {
    expect(pickTranscriptProvider(undefined)).toEqual({
      kind: 'deepgram',
      model: 'nova-3',
      language: 'multi',
    })
    expect(pickTranscriptProvider('multi').kind).toBe('deepgram')
  })

  it('routes Hindi to Deepgram nova-3', () => {
    expect(pickTranscriptProvider('hi')).toEqual({
      kind: 'deepgram',
      model: 'nova-3',
      language: 'hi',
    })
  })
})

describe('chooseNativeSttStrategy', () => {
  it('uses Assembly retry when language routes to Assembly and that key exists', () => {
    expect(chooseNativeSttStrategy({
      language: 'en',
      hasAssemblyKey: true,
      hasDeepgramKey: true,
    })).toBe('assembly-retry')
  })

  it('uses Deepgram for auto-detect even when an Assembly key exists', () => {
    expect(chooseNativeSttStrategy({
      language: 'multi',
      hasAssemblyKey: true,
      hasDeepgramKey: true,
    })).toBe('deepgram')
  })

  it('uses Deepgram for Hindi when both keys exist', () => {
    expect(chooseNativeSttStrategy({
      language: 'hi',
      hasAssemblyKey: true,
      hasDeepgramKey: true,
    })).toBe('deepgram')
  })

  it('falls back to Assembly when language prefers Deepgram but only Assembly is keyed', () => {
    expect(chooseNativeSttStrategy({
      language: 'multi',
      hasAssemblyKey: true,
      hasDeepgramKey: false,
    })).toBe('assembly-retry')
  })

  it('returns none when no STT key is present', () => {
    expect(chooseNativeSttStrategy({
      language: 'en',
      hasAssemblyKey: false,
      hasDeepgramKey: false,
    })).toBe('none')
  })

  it('uses Deepgram when the user prefers it even if Assembly is the language default', () => {
    expect(chooseNativeSttStrategy({
      language: 'en',
      hasAssemblyKey: true,
      hasDeepgramKey: true,
      preferredProvider: 'deepgram',
    })).toBe('deepgram')
  })

  it('uses Assembly when the user prefers it and the language is supported', () => {
    expect(chooseNativeSttStrategy({
      language: 'en',
      hasAssemblyKey: true,
      hasDeepgramKey: true,
      preferredProvider: 'assemblyai',
    })).toBe('assembly-retry')
  })

  it('does not use Assembly for auto-detect even when the user prefers it', () => {
    expect(chooseNativeSttStrategy({
      language: 'multi',
      hasAssemblyKey: true,
      hasDeepgramKey: true,
      preferredProvider: 'assemblyai',
    })).toBe('deepgram')
  })

  it('falls back to Deepgram when Assembly is preferred but that key is missing', () => {
    expect(chooseNativeSttStrategy({
      language: 'en',
      hasAssemblyKey: false,
      hasDeepgramKey: true,
      preferredProvider: 'assemblyai',
    })).toBe('deepgram')
  })
})

describe('assemblyaiSupportsLanguage', () => {
  it('is true only for the six Universal-3 realtime languages', () => {
    expect(assemblyaiSupportsLanguage('en')).toBe(true)
    expect(assemblyaiSupportsLanguage('es-MX')).toBe(true)
    expect(assemblyaiSupportsLanguage('multi')).toBe(false)
    expect(assemblyaiSupportsLanguage('hi')).toBe(false)
  })
})

describe('parseSttProviderPreference', () => {
  it('defaults unknown values to auto', () => {
    expect(parseSttProviderPreference('deepgram')).toBe('deepgram')
    expect(parseSttProviderPreference('nope')).toBe('auto')
    expect(parseSttProviderPreference(undefined)).toBe('auto')
  })
})

describe('sanitizeKeyterms', () => {
  it('always prepends Raven and dedupes case-insensitively', () => {
    expect(sanitizeKeyterms(['raven', 'Zoom', 'Raven'])).toEqual(['Raven', 'Zoom'])
  })

  it('caps at 100 terms', () => {
    const many = Array.from({ length: 120 }, (_, i) => `term-${i}`)
    expect(sanitizeKeyterms(many)).toHaveLength(100)
    expect(sanitizeKeyterms(many)[0]).toBe('Raven')
  })
})

describe('buildProviderBody', () => {
  it('emits assembly_ai_v3_streaming with keyterms_prompt', () => {
    expect(
      buildProviderBody({ kind: 'assemblyai', speechModel: 'u3-rt-pro' }, ['Raven', 'Zoom']),
    ).toEqual({
      assembly_ai_v3_streaming: {
        speech_model: 'u3-rt-pro',
        keyterms_prompt: 'Raven, Zoom',
      },
    })
  })

  it('emits deepgram_streaming with string smart_format', () => {
    const body = buildProviderBody(
      { kind: 'deepgram', model: 'nova-3', language: 'hi' },
      ['Raven'],
    )
    expect(body.deepgram_streaming).toMatchObject({
      model: 'nova-3',
      language: 'hi',
      smart_format: 'true',
      keyterms: ['Raven'],
    })
  })
})

describe('parseVocabulary / buildSdkUploadBody', () => {
  it('splits comma vocabulary', () => {
    expect(parseVocabulary('Zoom, Teams,  ')).toEqual(['Zoom', 'Teams'])
  })

  it('builds a Recall sdk_upload body with desktop_sdk_callback events', () => {
    const { body, provider } = buildSdkUploadBody({
      transcriptionLanguage: 'en',
      keyterms: ['Zoom'],
    })
    expect(provider.kind).toBe('assemblyai')
    const rec = body.recording_config as {
      transcript: { provider: Record<string, unknown> }
      realtime_endpoints: Array<{ type: string; events: string[] }>
    }
    expect(rec.transcript.provider.assembly_ai_v3_streaming).toBeDefined()
    expect(rec.realtime_endpoints[0].type).toBe('desktop_sdk_callback')
    expect(rec.realtime_endpoints[0].events).toContain('transcript.data')
  })
})
