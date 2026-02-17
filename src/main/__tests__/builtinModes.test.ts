import { vi, describe, it, expect } from 'vitest'

const { mockUpdateMode } = vi.hoisted(() => ({
  mockUpdateMode: vi.fn(),
}))

vi.mock('../services/database', () => ({
  databaseService: {
    updateMode: mockUpdateMode,
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

import { seedBuiltinModes, resetBuiltinMode, getBuiltinModeDefaults, BUILTIN_MODES } from '../services/builtinModes'

describe('builtinModes', () => {
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
        expect(mode.quickActions.length).toBeGreaterThan(0)
      }
    })

    it('each quick action has id, label, and prompt', () => {
      for (const mode of BUILTIN_MODES) {
        for (const action of mode.quickActions) {
          expect(action.id).toBeTruthy()
          expect(action.label).toBeTruthy()
          expect(action.prompt).toBeTruthy()
        }
      }
    })
  })

  describe('seedBuiltinModes', () => {
    it('is a no-op (templates are on-demand)', () => {
      seedBuiltinModes()
      // Should not throw or interact with database
      expect(mockUpdateMode).not.toHaveBeenCalled()
    })
  })

  describe('resetBuiltinMode', () => {
    it('calls updateMode with correct defaults for a valid mode', () => {
      const result = resetBuiltinMode('mode-interview')

      expect(result).toBe(true)
      expect(mockUpdateMode).toHaveBeenCalledWith('mode-interview', {
        name: 'Interview',
        systemPrompt: expect.stringContaining('expert interview coach'),
        icon: '💼',
        color: '#8b5cf6',
        quickActions: expect.arrayContaining([
          expect.objectContaining({ id: 'interview-assist' }),
        ]),
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
