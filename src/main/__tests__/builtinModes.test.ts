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

import { createDefaultMode, ensureActiveMode, resetBuiltinMode, getBuiltinModeDefaults, BUILTIN_MODES } from '../services/builtinModes'

describe('builtinModes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('BUILTIN_MODES', () => {
    it('defines expected mode IDs', () => {
      const ids = BUILTIN_MODES.map((m) => m.id)
      expect(ids).toContain('mode-interview')
      expect(ids).toContain('mode-sales')
      expect(ids).toContain('mode-meeting')
      expect(ids).toContain('mode-learning')
    })

    it('every mode has required fields', () => {
      for (const mode of BUILTIN_MODES) {
        expect(mode.id).toBeTruthy()
        expect(mode.name).toBeTruthy()
        expect(mode.icon).toBeTruthy()
        expect(mode.color).toBeTruthy()
        expect(mode.systemPrompt).toBeTruthy()
      }
    })
  })

  describe('createDefaultMode', () => {
    it('creates General Assistant when no modes exist', () => {
      mockGetAllModes.mockReturnValue([])
      mockCreateMode.mockReturnValue({ id: 'new-mode', name: 'General Assistant' })

      createDefaultMode()

      expect(mockCreateMode).toHaveBeenCalledTimes(1)
      expect(mockCreateMode).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'General Assistant',
          isDefault: true,
        })
      )
    })

    it('does not create mode when user already has modes', () => {
      mockGetAllModes.mockReturnValue([{ id: 'existing', isDefault: true }])

      createDefaultMode()

      expect(mockCreateMode).not.toHaveBeenCalled()
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

  describe('resetBuiltinMode', () => {
    it('calls updateMode with correct defaults for a valid mode', () => {
      const result = resetBuiltinMode('mode-interview')

      expect(result).toBe(true)
      expect(mockUpdateMode).toHaveBeenCalledWith('mode-interview', {
        name: 'Interview',
        systemPrompt: expect.stringContaining('coaching the user through a live job interview'),
        icon: '💼',
        color: '#8b5cf6',
      })
    })

    it('returns false for unknown mode ID', () => {
      const result = resetBuiltinMode('mode-nonexistent')

      expect(result).toBe(false)
      expect(mockUpdateMode).not.toHaveBeenCalled()
    })
  })

  describe('getBuiltinModeDefaults', () => {
    it('returns mode definition for valid ID', () => {
      const mode = getBuiltinModeDefaults('mode-sales')

      expect(mode).not.toBeNull()
      expect(mode!.name).toBe('Sales Call')
      expect(mode!.icon).toBe('📈')
    })

    it('returns null for unknown ID', () => {
      const mode = getBuiltinModeDefaults('mode-unknown')

      expect(mode).toBeNull()
    })
  })
})
