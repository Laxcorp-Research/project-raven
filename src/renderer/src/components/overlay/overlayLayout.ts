export const SPLIT_VIEW_BREAKPOINT = 900
export const PREFERRED_SPLIT_WIDTH = 1050
export const DEFAULT_SPLIT_RATIO = 0.45
export const MIN_SPLIT_RATIO = 0.32
export const MAX_SPLIT_RATIO = 0.58
export const SPLIT_VIEW_MARGIN = 20

export function shouldUseSplitView(panelWidth: number, hasResponse: boolean): boolean {
  return hasResponse && panelWidth >= SPLIT_VIEW_BREAKPOINT
}

export function clampSplitRatio(value: number): number {
  return Math.min(Math.max(value, MIN_SPLIT_RATIO), MAX_SPLIT_RATIO)
}

export function normalizeSavedSplitRatio(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SPLIT_RATIO
  if (value < MIN_SPLIT_RATIO || value > MAX_SPLIT_RATIO) return DEFAULT_SPLIT_RATIO
  return value
}

export function preferredSplitWidth(viewportWidth: number): number | null {
  const available = Math.max(0, viewportWidth - SPLIT_VIEW_MARGIN * 2)
  if (available < SPLIT_VIEW_BREAKPOINT) return null
  return Math.min(PREFERRED_SPLIT_WIDTH, available)
}
