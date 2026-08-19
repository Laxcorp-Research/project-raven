import { describe, expect, it } from 'vitest'
import {
  MEMORY_MODELS,
  NOTES_FAST_MODELS,
  notesSlotIsExplicit,
  parseAIProviderName,
  resolveMemoryModel,
  resolveMemoryProvider,
  resolveNotesModel,
  resolveNotesProvider,
} from '../../shared/aiSlots'

const ANTHROPIC_CATALOG = ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-sonnet-5']
const OPENAI_CATALOG = ['gpt-5.6-luna', 'gpt-5.2']

describe('aiSlots', () => {
  it('parseAIProviderName accepts only anthropic and openai', () => {
    expect(parseAIProviderName('anthropic')).toBe('anthropic')
    expect(parseAIProviderName('openai')).toBe('openai')
    expect(parseAIProviderName('')).toBeNull()
    expect(parseAIProviderName('claude')).toBeNull()
    expect(parseAIProviderName(undefined)).toBeNull()
  })

  it('resolveNotesProvider uses notesProvider when set, else aiProvider, else anthropic', () => {
    expect(resolveNotesProvider('openai', 'anthropic')).toBe('openai')
    expect(resolveNotesProvider('', 'openai')).toBe('openai')
    expect(resolveNotesProvider(undefined, undefined)).toBe('anthropic')
  })

  it('resolveNotesModel uses a catalog id and otherwise the cheap default', () => {
    expect(resolveNotesModel('anthropic', 'claude-sonnet-4-6', ANTHROPIC_CATALOG)).toBe('claude-sonnet-4-6')
    expect(resolveNotesModel('anthropic', '', ANTHROPIC_CATALOG)).toBe(NOTES_FAST_MODELS.anthropic)
    expect(resolveNotesModel('anthropic', 'gpt-5.2', ANTHROPIC_CATALOG)).toBe(NOTES_FAST_MODELS.anthropic)
    expect(resolveNotesModel('openai', undefined, OPENAI_CATALOG)).toBe(NOTES_FAST_MODELS.openai)
  })

  it('notesSlotIsExplicit is true only when both provider and model are set', () => {
    expect(notesSlotIsExplicit('anthropic', 'claude-haiku-4-5')).toBe(true)
    expect(notesSlotIsExplicit('', 'claude-haiku-4-5')).toBe(false)
    expect(notesSlotIsExplicit('anthropic', '')).toBe(false)
    expect(notesSlotIsExplicit(undefined, undefined)).toBe(false)
  })

  it('resolveMemoryProvider follows Live assist, never notesProvider', () => {
    expect(resolveMemoryProvider('openai')).toBe('openai')
    expect(resolveMemoryProvider('anthropic')).toBe('anthropic')
    expect(resolveMemoryProvider('')).toBe('anthropic')
  })

  it('resolveMemoryModel is Sonnet 5 / Terra, not the notes cheap default', () => {
    expect(resolveMemoryModel('anthropic')).toBe('claude-sonnet-5')
    expect(resolveMemoryModel('openai')).toBe('gpt-5.6-terra')
    expect(MEMORY_MODELS.anthropic).not.toBe(NOTES_FAST_MODELS.anthropic)
    expect(MEMORY_MODELS.openai).not.toBe(NOTES_FAST_MODELS.openai)
  })
})
