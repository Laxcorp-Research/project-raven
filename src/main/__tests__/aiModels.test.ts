import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EFFORT,
  DEFAULT_MODELS,
  MODEL_CATALOG,
  PROVIDER_MODELS,
  buildAnthropicEffortParams,
  buildOpenAIEffortParams,
  effortLevelsForModel,
  resolveEffort,
  streamMaxTokensFor,
  contextWindowFor,
  fitMessagesToContext,
} from '../services/ai/types'
import { FAST_MODELS } from '../services/ai/providerFactory'

describe('AI model catalog (2026-08)', () => {
  it('lists every current and still-available Anthropic model', () => {
    expect(PROVIDER_MODELS.anthropic).toEqual([
      'claude-haiku-4-5',
      'claude-sonnet-5',
      'claude-sonnet-4-6',
      'claude-sonnet-4-5',
      'claude-opus-5',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-opus-4-5',
      'claude-fable-5',
    ])
    expect(DEFAULT_MODELS.anthropic).toBe('claude-haiku-4-5')
  })

  it('lists every current and still-available OpenAI model', () => {
    expect(PROVIDER_MODELS.openai).toEqual([
      'gpt-5.6-luna',
      'gpt-5.6-terra',
      'gpt-5.6-sol',
      'gpt-5.5',
      'gpt-5.4-mini',
      'gpt-5.4',
      'gpt-5.2',
    ])
    expect(DEFAULT_MODELS.openai).toBe('gpt-5.6-luna')
  })

  it('lists only the effort values each model actually accepts', () => {
    expect(effortLevelsForModel('anthropic', 'claude-haiku-4-5')).toBeNull()
    expect(effortLevelsForModel('anthropic', 'claude-sonnet-4-5')).toBeNull()
    expect(effortLevelsForModel('anthropic', 'claude-sonnet-5')).toEqual([
      'low', 'medium', 'high', 'xhigh', 'max',
    ])
    expect(effortLevelsForModel('anthropic', 'claude-fable-5')).toEqual([
      'low', 'medium', 'high', 'xhigh', 'max',
    ])
    expect(effortLevelsForModel('anthropic', 'claude-opus-5')).toEqual([
      'low', 'medium', 'high', 'xhigh', 'max',
    ])
    expect(effortLevelsForModel('anthropic', 'claude-opus-4-8')).toEqual([
      'low', 'medium', 'high', 'xhigh', 'max',
    ])
    expect(effortLevelsForModel('anthropic', 'claude-opus-4-7')).toEqual([
      'low', 'medium', 'high', 'xhigh', 'max',
    ])
    expect(effortLevelsForModel('anthropic', 'claude-sonnet-4-6')).toEqual([
      'low', 'medium', 'high', 'max',
    ])
    expect(effortLevelsForModel('anthropic', 'claude-opus-4-6')).toEqual([
      'low', 'medium', 'high', 'max',
    ])
    expect(effortLevelsForModel('anthropic', 'claude-opus-4-5')).toEqual([
      'low', 'medium', 'high',
    ])
    expect(effortLevelsForModel('openai', 'gpt-5.6-sol')).toEqual([
      'none', 'low', 'medium', 'high', 'xhigh', 'max',
    ])
    expect(effortLevelsForModel('openai', 'gpt-5.6-luna')).toEqual([
      'none', 'low', 'medium', 'high', 'xhigh', 'max',
    ])
    expect(effortLevelsForModel('openai', 'gpt-5.5')).toEqual([
      'none', 'low', 'medium', 'high', 'xhigh',
    ])
    expect(effortLevelsForModel('openai', 'gpt-5.4')).toEqual([
      'none', 'low', 'medium', 'high', 'xhigh',
    ])
    expect(effortLevelsForModel('openai', 'gpt-5.4-mini')).toEqual([
      'none', 'low', 'medium', 'high', 'xhigh',
    ])
    expect(effortLevelsForModel('openai', 'gpt-5.2')).toEqual([
      'none', 'low', 'medium', 'high', 'xhigh',
    ])
  })

  it('refuses levels the API does not accept for that model', () => {
    expect(resolveEffort('anthropic', 'claude-sonnet-4-6', 'xhigh')).toBe('low')
    expect(resolveEffort('anthropic', 'claude-opus-4-6', 'xhigh')).toBe('low')
    expect(resolveEffort('anthropic', 'claude-opus-4-5', 'max')).toBe('low')
    expect(resolveEffort('openai', 'gpt-5.5', 'max')).toBe('low')
    expect(resolveEffort('openai', 'gpt-5.2', 'max')).toBe('low')
    expect(resolveEffort('anthropic', 'claude-sonnet-5', 'max')).toBe('max')
    expect(resolveEffort('openai', 'gpt-5.4', 'xhigh')).toBe('xhigh')
    expect(resolveEffort('anthropic', 'claude-haiku-4-5', 'high')).toBeNull()
    expect(DEFAULT_EFFORT).toBe('low')
  })

  it('keeps catalog ids aligned with MODEL_CATALOG', () => {
    expect(MODEL_CATALOG.anthropic.map((m) => m.id)).toEqual(PROVIDER_MODELS.anthropic)
    expect(MODEL_CATALOG.openai.map((m) => m.id)).toEqual(PROVIDER_MODELS.openai)
  })

  it('keeps the cheap notes-slot default inside the catalog', () => {
    expect(PROVIDER_MODELS.anthropic).toContain(FAST_MODELS.anthropic)
    expect(PROVIDER_MODELS.openai).toContain(FAST_MODELS.openai)
  })

  it('uses official max output, not a product cap (64k vs 128k)', () => {
    expect(streamMaxTokensFor('anthropic', 'claude-haiku-4-5')).toBe(64000)
    expect(streamMaxTokensFor('anthropic', 'claude-sonnet-4-5')).toBe(64000)
    expect(streamMaxTokensFor('anthropic', 'claude-opus-4-5')).toBe(64000)
    expect(streamMaxTokensFor('anthropic', 'claude-sonnet-5')).toBe(128000)
    expect(streamMaxTokensFor('anthropic', 'claude-fable-5')).toBe(128000)
    expect(streamMaxTokensFor('anthropic', 'claude-opus-5')).toBe(128000)
    expect(streamMaxTokensFor('openai', 'gpt-5.6-luna')).toBe(128000)
    expect(streamMaxTokensFor('openai', 'gpt-5.2')).toBe(128000)
  })

  it('uses official context windows (200k / 400k / 1M / 1.05M)', () => {
    expect(contextWindowFor('anthropic', 'claude-haiku-4-5')).toBe(200000)
    expect(contextWindowFor('anthropic', 'claude-sonnet-4-5')).toBe(200000)
    expect(contextWindowFor('anthropic', 'claude-opus-4-5')).toBe(200000)
    expect(contextWindowFor('anthropic', 'claude-sonnet-5')).toBe(1000000)
    expect(contextWindowFor('anthropic', 'claude-opus-5')).toBe(1000000)
    expect(contextWindowFor('anthropic', 'claude-fable-5')).toBe(1000000)
    expect(contextWindowFor('openai', 'gpt-5.2')).toBe(400000)
    expect(contextWindowFor('openai', 'gpt-5.4-mini')).toBe(400000)
    expect(contextWindowFor('openai', 'gpt-5.4')).toBe(1050000)
    expect(contextWindowFor('openai', 'gpt-5.6-luna')).toBe(1050000)
  })
})

describe('fitMessagesToContext', () => {
  it('keeps the current user message and recent history when they fit', () => {
    const fitted = fitMessagesToContext({
      system: 'sys',
      maxOutputTokens: 1000,
      contextWindow: 20_000,
      messages: [
        { role: 'user', content: '[Previous request: Assist]' },
        { role: 'assistant', content: 'short answer' },
        { role: 'user', content: 'current question' },
      ],
    })

    expect(fitted.messages).toHaveLength(3)
    expect(fitted.messages[2].content).toBe('current question')
    expect(fitted.maxTokens).toBe(1000)
  })

  it('drops the oldest turn when a prior coding answer no longer fits', () => {
    const oldAnswer = 'x'.repeat(30_000)
    const recentAnswer = 'recent assistant reply'
    const fitted = fitMessagesToContext({
      system: 'sys',
      maxOutputTokens: 8_000,
      contextWindow: 20_000,
      messages: [
        { role: 'user', content: '[Previous request: Assist]' },
        { role: 'assistant', content: oldAnswer },
        { role: 'user', content: '[Previous request: Assist]' },
        { role: 'assistant', content: recentAnswer },
        { role: 'user', content: 'follow up' },
      ],
    })

    const texts = fitted.messages.map((m) =>
      typeof m.content === 'string' ? m.content : '',
    )
    expect(texts.some((t) => t.includes(oldAnswer))).toBe(false)
    expect(texts).toContain(recentAnswer)
    expect(texts[texts.length - 1]).toBe('follow up')
    expect(fitted.messages[0].role).toBe('user')
  })

  it('never drops the current user turn even if output must shrink', () => {
    const current = 'y'.repeat(9_000)
    const fitted = fitMessagesToContext({
      system: 'sys',
      maxOutputTokens: 8_000,
      contextWindow: 10_000,
      messages: [{ role: 'user', content: current }],
    })

    expect(fitted.messages).toHaveLength(1)
    expect(fitted.messages[0].content).toBe(current)
    expect(fitted.maxTokens).toBeLessThan(8_000)
    expect(fitted.maxTokens).toBeGreaterThanOrEqual(4096)
  })

  it('truncates the latest assistant reply when it alone exceeds the budget', () => {
    const huge = 'z'.repeat(40_000)
    const fitted = fitMessagesToContext({
      system: 'sys',
      maxOutputTokens: 8_000,
      contextWindow: 20_000,
      messages: [
        { role: 'user', content: '[Previous request: Assist]' },
        { role: 'assistant', content: huge },
        { role: 'user', content: 'tell me more' },
      ],
    })

    expect(fitted.messages).toHaveLength(3)
    expect(fitted.messages[0].role).toBe('user')
    expect(fitted.messages[1].role).toBe('assistant')
    expect(String(fitted.messages[1].content)).toContain('truncated to fit context')
    expect(String(fitted.messages[1].content).length).toBeLessThan(huge.length)
    expect(fitted.messages[2].content).toBe('tell me more')
  })
})

describe('buildAnthropicEffortParams', () => {
  it('sends user effort on Sonnet 5 without forcing thinking off', () => {
    expect(buildAnthropicEffortParams('claude-sonnet-5', 'high')).toEqual({
      output_config: { effort: 'high' },
    })
    expect(buildAnthropicEffortParams('claude-sonnet-5', 'low')).toEqual({
      output_config: { effort: 'low' },
    })
  })

  it('sends effort only on Fable 5 (thinking cannot be disabled)', () => {
    expect(buildAnthropicEffortParams('claude-fable-5', 'max')).toEqual({
      output_config: { effort: 'max' },
    })
  })

  it('sends the selected effort on older models instead of omitting low', () => {
    expect(buildAnthropicEffortParams('claude-opus-4-7', 'low')).toEqual({
      output_config: { effort: 'low' },
    })
    expect(buildAnthropicEffortParams('claude-opus-4-7', 'high')).toEqual({
      output_config: { effort: 'high' },
    })
  })

  it('does not send xhigh on Sonnet 4.6 (API does not accept it)', () => {
    expect(buildAnthropicEffortParams('claude-sonnet-4-6', 'xhigh')).toEqual({
      output_config: { effort: 'low' },
    })
  })

  it('sends nothing on Haiku (no effort API)', () => {
    expect(buildAnthropicEffortParams('claude-haiku-4-5', 'high')).toEqual({})
  })
})

describe('buildOpenAIEffortParams', () => {
  it('forwards reasoning_effort on GPT-5.6', () => {
    expect(buildOpenAIEffortParams('gpt-5.6-sol', 'xhigh')).toEqual({
      reasoning_effort: 'xhigh',
    })
  })

  it('forwards reasoning_effort on GPT-5.4 / 5.5', () => {
    expect(buildOpenAIEffortParams('gpt-5.4', 'none')).toEqual({
      reasoning_effort: 'none',
    })
  })

  it('forwards reasoning_effort on GPT-5.2', () => {
    expect(buildOpenAIEffortParams('gpt-5.2', 'high')).toEqual({
      reasoning_effort: 'high',
    })
  })

  it('does not send max on GPT-5.5 (API stops at xhigh)', () => {
    expect(buildOpenAIEffortParams('gpt-5.5', 'max')).toEqual({
      reasoning_effort: 'low',
    })
  })
})
