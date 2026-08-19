import { describe, expect, it } from 'vitest'
import { shouldOpenAccessibilitySettingsAfterPrompt } from '../../shared/macAccessibilityGrant'

describe('shouldOpenAccessibilitySettingsAfterPrompt', () => {
  it('never opens System Settings after the TCC prompt, even when the prompt returns false immediately', () => {
    expect(shouldOpenAccessibilitySettingsAfterPrompt(false)).toBe(false)
    expect(shouldOpenAccessibilitySettingsAfterPrompt(true)).toBe(false)
  })
})
