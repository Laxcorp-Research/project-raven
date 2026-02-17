import { vi, describe, it, expect } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  screen: {
    getDisplayMatching: vi.fn((bounds) => ({
      workArea: {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      },
    })),
    getPrimaryDisplay: vi.fn(() => ({
      workAreaSize: { width: 1920, height: 1080 },
    })),
  },
  app: {
    getPath: vi.fn(() => '/tmp'),
  },
}))

vi.mock('../store', () => ({
  getSetting: vi.fn(),
  saveSetting: vi.fn(),
}))

import { clampOverlayBoundsToDisplay } from '../windowManager'

describe('windowManager', () => {
  describe('clampOverlayBoundsToDisplay', () => {
    it('returns same bounds when within display area', () => {
      const bounds = { x: 100, y: 100, width: 400, height: 300 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(result).toEqual({ x: 100, y: 100, width: 400, height: 300 })
    })

    it('clamps x to left edge when negative', () => {
      const bounds = { x: -50, y: 100, width: 400, height: 300 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(result.x).toBe(0)
    })

    it('clamps x to right edge when overflowing', () => {
      const bounds = { x: 1800, y: 100, width: 400, height: 300 }
      const result = clampOverlayBoundsToDisplay(bounds)

      // maxX = 0 + 1920 - 400 = 1520
      expect(result.x).toBe(1520)
    })

    it('clamps y to top edge when negative', () => {
      const bounds = { x: 100, y: -20, width: 400, height: 300 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(result.y).toBe(0)
    })

    it('clamps y to bottom edge when overflowing', () => {
      const bounds = { x: 100, y: 900, width: 400, height: 300 }
      const result = clampOverlayBoundsToDisplay(bounds)

      // maxY = 0 + 1080 - 300 = 780
      expect(result.y).toBe(780)
    })

    it('clamps width to display width when too large', () => {
      const bounds = { x: 0, y: 0, width: 3000, height: 300 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(result.width).toBe(1920)
    })

    it('clamps height to display height when too large', () => {
      const bounds = { x: 0, y: 0, width: 400, height: 2000 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(result.height).toBe(1080)
    })

    it('handles window larger than display in both dimensions', () => {
      const bounds = { x: 500, y: 500, width: 3000, height: 2000 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(result.width).toBe(1920)
      expect(result.height).toBe(1080)
      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('rounds fractional values', () => {
      const bounds = { x: 100.7, y: 200.3, width: 400.5, height: 300.9 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(Number.isInteger(result.x)).toBe(true)
      expect(Number.isInteger(result.y)).toBe(true)
      expect(Number.isInteger(result.width)).toBe(true)
      expect(Number.isInteger(result.height)).toBe(true)
    })
  })
})
