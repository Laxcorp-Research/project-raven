import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  clampSplitRatio,
  normalizeSavedSplitRatio,
  preferredSplitWidth,
  shouldUseSplitView,
} from '../../renderer/src/components/overlay/overlayLayout'

describe('adaptive overlay layout', () => {
  it('uses split view only when a response exists and the panel is wide enough', () => {
    expect(shouldUseSplitView(899, true)).toBe(false)
    expect(shouldUseSplitView(900, false)).toBe(false)
    expect(shouldUseSplitView(900, true)).toBe(true)
  })

  it('clamps divider drags to readable pane ratios', () => {
    expect(clampSplitRatio(0.1)).toBe(MIN_SPLIT_RATIO)
    expect(clampSplitRatio(0.5)).toBe(0.5)
    expect(clampSplitRatio(0.9)).toBe(MAX_SPLIT_RATIO)
  })

  it('restores valid saved ratios and defaults malformed or out-of-range values', () => {
    expect(normalizeSavedSplitRatio(0.4)).toBe(0.4)
    expect(normalizeSavedSplitRatio('0.4')).toBe(DEFAULT_SPLIT_RATIO)
    expect(normalizeSavedSplitRatio(Number.NaN)).toBe(DEFAULT_SPLIT_RATIO)
    expect(normalizeSavedSplitRatio(0.8)).toBe(DEFAULT_SPLIT_RATIO)
  })

  it('selects a preferred width only when the viewport can support split view', () => {
    expect(preferredSplitWidth(800)).toBeNull()
    expect(preferredSplitWidth(920)).toBeNull()
    expect(preferredSplitWidth(1000)).toBe(960)
    expect(preferredSplitWidth(1600)).toBe(1050)
  })
})
