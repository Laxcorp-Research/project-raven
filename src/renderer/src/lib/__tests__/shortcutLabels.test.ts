import { describe, expect, it } from 'vitest'
import { isMacPlatform, modifierLabel, shortcutKeycaps } from '../shortcutLabels'

describe('shortcutLabels', () => {
  it('treats Win32 navigator.platform as non-Mac', () => {
    expect(isMacPlatform('Win32')).toBe(false)
    expect(modifierLabel(false)).toBe('Ctrl')
  })

  it('treats MacIntel as Mac', () => {
    expect(isMacPlatform('MacIntel')).toBe(true)
    expect(modifierLabel(true)).toBe('⌘')
  })

  it('shows Ctrl+Enter for Assist on Windows, not ⌘', () => {
    expect(shortcutKeycaps('assist', false)).toEqual(['Ctrl', '↵'])
    expect(shortcutKeycaps('assist', true)).toEqual(['⌘', '↵'])
  })

  it('does not advertise Cmd/Ctrl+R for recording (retired accelerator)', () => {
    expect(shortcutKeycaps('recording', false)).toEqual(['Ctrl', '⇧', 'Space'])
    expect(shortcutKeycaps('recording', true)).toEqual(['⌘', '⇧', 'Space'])
    expect(shortcutKeycaps('recording', false)).not.toContain('R')
    expect(shortcutKeycaps('recording', true)).not.toContain('R')
  })

  it('does not advertise Shift+R for clear (now Shift+Backspace)', () => {
    expect(shortcutKeycaps('clear', false)).toEqual(['Ctrl', '⇧', 'Backspace'])
    expect(shortcutKeycaps('clear', true)).toEqual(['⌘', '⇧', '⌫'])
  })
})
