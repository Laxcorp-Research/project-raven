import { describe, expect, it } from 'vitest'
import { DEFAULT_MODELS, EFFORT_LABELS, MODEL_CATALOG, effortLevelsForModel, type AIProviderName } from '../aiModels'
import { NOTES_FAST_MODELS } from '../../../../shared/aiSlots'

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
})
