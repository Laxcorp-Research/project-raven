import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockUpdateMode, mockGetAllModes, mockCreateMode, mockSetActiveMode } = vi.hoisted(() => ({
  mockUpdateMode: vi.fn(),
  mockGetAllModes: vi.fn(),
  mockCreateMode: vi.fn(),
  mockSetActiveMode: vi.fn(),
}))

vi.mock('../services/database', () => ({
  databaseService: {
    updateMode: mockUpdateMode,
    getAllModes: mockGetAllModes,
    createMode: mockCreateMode,
    setActiveMode: mockSetActiveMode,
  },
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { createDefaultMode, ensureActiveMode, migrateGeneralAssistantPromptV21 } from '../services/builtinModes'

describe('builtinModes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createDefaultMode', () => {
    it('creates General Assistant when no modes exist', async () => {
      mockGetAllModes.mockReturnValue([])
      mockCreateMode.mockReturnValue({ id: 'new-mode', name: 'General Assistant' })

      await createDefaultMode()

      expect(mockCreateMode).toHaveBeenCalledTimes(1)
      expect(mockCreateMode).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'General Assistant',
          isDefault: true,
        })
      )
    })

    it('ships a structured notesTemplate matching the backend seed', async () => {
      mockGetAllModes.mockReturnValue([])
      mockCreateMode.mockReturnValue({ id: 'new-mode', name: 'General Assistant' })

      await createDefaultMode()

      const created = mockCreateMode.mock.calls[0]![0]
      expect(created.notesTemplate).toEqual([
        expect.objectContaining({ title: 'Summary' }),
        expect.objectContaining({ title: 'Key points' }),
        expect.objectContaining({ title: 'Action items' }),
        expect.objectContaining({ title: 'Follow-up' }),
      ])
    })

    it('ships a systemPrompt aligned with the new XML-aware prompt contract', async () => {
      mockGetAllModes.mockReturnValue([])
      mockCreateMode.mockReturnValue({ id: 'new-mode', name: 'General Assistant' })

      await createDefaultMode()

      const created = mockCreateMode.mock.calls[0]![0]
      expect(created.systemPrompt).toContain('General Assistant mode')
      expect(created.systemPrompt).toContain('<transcript>')
    })

    it('does not create mode when user already has modes', async () => {
      mockGetAllModes.mockReturnValue([{ id: 'existing', isDefault: true }])

      await createDefaultMode()

      expect(mockCreateMode).not.toHaveBeenCalled()
    })

    it('always uses the bundled prompt (no server-seeded Pro overlay)', async () => {
      mockGetAllModes.mockReturnValue([])
      mockCreateMode.mockReturnValue({ id: 'new-mode' })

      await createDefaultMode()

      const created = mockCreateMode.mock.calls[0]![0]
      expect(created.systemPrompt).toContain('General Assistant mode')
    })
  })

  describe('ensureActiveMode', () => {
    it('sets first mode as active when no active mode exists', () => {
      mockGetAllModes.mockReturnValue([
        { id: 'mode-1', isDefault: false },
        { id: 'mode-2', isDefault: false },
      ])

      ensureActiveMode()

      expect(mockSetActiveMode).toHaveBeenCalledWith('mode-1')
      expect(mockCreateMode).not.toHaveBeenCalled()
    })

    it('does nothing when active mode already exists', () => {
      mockGetAllModes.mockReturnValue([
        { id: 'mode-1', isDefault: true },
        { id: 'mode-2', isDefault: false },
      ])

      ensureActiveMode()

      expect(mockCreateMode).not.toHaveBeenCalled()
      expect(mockSetActiveMode).not.toHaveBeenCalled()
    })

    it('does nothing when no modes exist', () => {
      mockGetAllModes.mockReturnValue([])

      ensureActiveMode()

      expect(mockCreateMode).not.toHaveBeenCalled()
      expect(mockSetActiveMode).not.toHaveBeenCalled()
    })
  })

  describe('migrateGeneralAssistantPromptV21', () => {
    const PRE_V21_PROMPT = `Adapt your coaching style based on the conversation context. You may be in an interview, meeting, sales call, lecture, or casual discussion.

- Read the room from the transcript and adjust your approach
- For formal contexts (interviews, client calls): be professional and structured
- For casual contexts (team chats, brainstorms): be conversational and direct
- If you detect a specific context (interview questions, sales objections, action items), adopt that style automatically

Match the formality of the conversation. Be direct and actionable. Concise by default, thorough when solving problems.`

    // Same content but with a trailing period on the "automatically" bullet -
    // a drift variant seen in production DBs (origin unclear).
    const PRE_V21_PROMPT_PERIOD_VARIANT = `Adapt your coaching style based on the conversation context. You may be in an interview, meeting, sales call, lecture, or casual discussion.

- Read the room from the transcript and adjust your approach
- For formal contexts (interviews, client calls): be professional and structured
- For casual contexts (team chats, brainstorms): be conversational and direct
- If you detect a specific context (interview questions, sales objections, action items), adopt that style automatically.

Match the formality of the conversation. Be direct and actionable. Concise by default, thorough when solving problems.`

    it('upgrades an unmodified pre-v2.1 General Assistant mode', () => {
      mockGetAllModes.mockReturnValue([
        {
          id: 'mode-1',
          name: 'General Assistant',
          systemPrompt: PRE_V21_PROMPT,
          isDefault: true,
          isBuiltin: false,
        },
      ])

      migrateGeneralAssistantPromptV21()

      expect(mockUpdateMode).toHaveBeenCalledTimes(1)
      expect(mockUpdateMode).toHaveBeenCalledWith(
        'mode-1',
        expect.objectContaining({
          systemPrompt: expect.stringContaining('General Assistant mode'),
          notesTemplate: expect.arrayContaining([
            expect.objectContaining({ title: 'Summary' }),
          ]),
        })
      )
    })

    it('upgrades the "automatically." period-drift variant too', () => {
      mockGetAllModes.mockReturnValue([
        {
          id: 'mode-2',
          name: 'General Assistant',
          systemPrompt: PRE_V21_PROMPT_PERIOD_VARIANT,
          isDefault: true,
          isBuiltin: false,
        },
      ])

      migrateGeneralAssistantPromptV21()

      expect(mockUpdateMode).toHaveBeenCalledTimes(1)
      expect(mockUpdateMode).toHaveBeenCalledWith(
        'mode-2',
        expect.objectContaining({
          systemPrompt: expect.stringContaining('General Assistant mode'),
        })
      )
    })

    it('leaves a user-edited General Assistant mode alone', () => {
      mockGetAllModes.mockReturnValue([
        {
          id: 'mode-1',
          name: 'General Assistant',
          systemPrompt: 'My custom prompt',
          isDefault: true,
          isBuiltin: false,
        },
      ])

      migrateGeneralAssistantPromptV21()

      expect(mockUpdateMode).not.toHaveBeenCalled()
    })

    it('leaves a renamed General Assistant mode alone even with pre-v2.1 prompt', () => {
      mockGetAllModes.mockReturnValue([
        {
          id: 'mode-1',
          name: 'My General',
          systemPrompt: PRE_V21_PROMPT,
          isDefault: true,
          isBuiltin: false,
        },
      ])

      migrateGeneralAssistantPromptV21()

      expect(mockUpdateMode).not.toHaveBeenCalled()
    })

    it('is idempotent - second run does nothing because the match is gone', () => {
      mockGetAllModes.mockReturnValueOnce([
        {
          id: 'mode-1',
          name: 'General Assistant',
          systemPrompt: PRE_V21_PROMPT,
          isDefault: true,
          isBuiltin: false,
        },
      ])

      migrateGeneralAssistantPromptV21()
      expect(mockUpdateMode).toHaveBeenCalledTimes(1)

      // Simulate DB post-migration - prompt is now the new v2.1 text
      mockGetAllModes.mockReturnValueOnce([
        {
          id: 'mode-1',
          name: 'General Assistant',
          systemPrompt: 'new v2.1 prompt',
          isDefault: true,
          isBuiltin: false,
        },
      ])

      migrateGeneralAssistantPromptV21()
      expect(mockUpdateMode).toHaveBeenCalledTimes(1) // still just the one call
    })

    it('does not throw when getAllModes fails', () => {
      mockGetAllModes.mockImplementation(() => { throw new Error('db down') })
      expect(() => migrateGeneralAssistantPromptV21()).not.toThrow()
      expect(mockUpdateMode).not.toHaveBeenCalled()
    })
  })

})
