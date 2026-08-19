import { describe, expect, it } from 'vitest'
import { DEFAULT_MODELS, EFFORT_LABELS, MODEL_CATALOG, effortLevelsForModel, type AIProviderName } from '../aiModels'
import { MEMORY_MODELS, NOTES_FAST_MODELS } from '../../../../shared/aiSlots'

describe('Settings model catalog', () => {
  it('shows every Anthropic and OpenAI id the main process allows', () => {
    expect(MODEL_CATALOG.anthropic.map((m) => m.id)).toEqual([
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
    expect(MODEL_CATALOG.openai.map((m) => m.id)).toEqual([
      'gpt-5.6-luna',
      'gpt-5.6-terra',
      'gpt-5.6-sol',
      'gpt-5.5',
      'gpt-5.4-mini',
      'gpt-5.4',
      'gpt-5.2',
    ])
    expect(MODEL_CATALOG['opencode-go'].map((m) => m.id)).toEqual([
      'grok-4.5',
      'glm-5.2',
      'glm-5.1',
      'kimi-k3',
      'kimi-k2.7-code',
      'kimi-k2.6',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'mimo-v2.5',
      'mimo-v2.5-pro',
      'hy3',
    ])
  })

  it('hides effort when the API has no effort parameter', () => {
    expect(effortLevelsForModel('anthropic', 'claude-haiku-4-5')).toBeNull()
    expect(effortLevelsForModel('anthropic', 'claude-sonnet-4-5')).toBeNull()
  })

  it('shows only the selected model ladder, never a global effort list', () => {
    const globalList = Object.keys(EFFORT_LABELS)
    for (const provider of ['anthropic', 'openai'] as AIProviderName[]) {
      for (const model of MODEL_CATALOG[provider]) {
        const shown = effortLevelsForModel(provider, model.id)
        expect(shown).toEqual(model.effort)
        if (shown && shown.length < globalList.length) {
          expect(shown).not.toEqual(globalList)
        }
      }
    }
  })

  it('does not offer xhigh on Sonnet 4.6 or max on GPT-5.5', () => {
    expect(effortLevelsForModel('anthropic', 'claude-sonnet-4-6')).toEqual([
      'low', 'medium', 'high', 'max',
    ])
    expect(effortLevelsForModel('openai', 'gpt-5.5')).toEqual([
      'none', 'low', 'medium', 'high', 'xhigh',
    ])
    expect(effortLevelsForModel('openai', 'gpt-5.2')).toContain('xhigh')
    expect(effortLevelsForModel('openai', 'gpt-5.2')).not.toContain('max')
  })

  it('keeps Settings defaults aligned with the notes-slot cheap models', () => {
    expect(DEFAULT_MODELS).toEqual(NOTES_FAST_MODELS)
  })

  it('shows Sonnet 5 / Terra for session memory, not Haiku / Luna', () => {
    expect(MODEL_CATALOG.anthropic.some((m) => m.id === MEMORY_MODELS.anthropic)).toBe(true)
    expect(MODEL_CATALOG.openai.some((m) => m.id === MEMORY_MODELS.openai)).toBe(true)
    expect(MODEL_CATALOG['opencode-go'].some((m) => m.id === MEMORY_MODELS['opencode-go'])).toBe(true)
    expect(MEMORY_MODELS).not.toEqual(NOTES_FAST_MODELS)
  })
})
