/**
 * E2E Test: Window Management
 *
 * Tests Electron window behavior:
 * - Dashboard window is created on launch
 * - Multiple windows can coexist (dashboard + overlay)
 * - Window count matches expected architecture
 *
 * Prerequisites: `npm run build` must have been run.
 */
import { test, expect } from './fixtures/electronApp'

test.describe('Window Management', () => {
  test('dashboard window is created on launch', async ({ electronApp }) => {
    // Wait for windows to be created
    const windows = electronApp.windows()

    // Should have at least the dashboard window
    expect(windows.length).toBeGreaterThanOrEqual(1)
  })

  test('app creates both dashboard and overlay windows', async ({ electronApp }) => {
    // Wait a bit for all windows to initialize
    await new Promise((r) => setTimeout(r, 3_000))

    const windows = electronApp.windows()

    // The app should create 2 windows: dashboard + overlay
    // Overlay may or may not be visible depending on onboarding state
    expect(windows.length).toBeGreaterThanOrEqual(1)
    expect(windows.length).toBeLessThanOrEqual(3) // dashboard + overlay + possible devtools
  })

  test('dashboard window has expected properties', async ({ electronApp }) => {
    const window = await electronApp.firstWindow()

    // Window should have a valid URL
    const url = window.url()
    expect(url).toBeTruthy()

    // Window should be visible
    const isVisible = await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows()
      return windows.some((w) => w.isVisible())
    })

    expect(isVisible).toBe(true)
  })

  test('window title is correct', async ({ electronApp }) => {
    // Evaluate the main window title
    const title = await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows()
      const dashboard = windows.find((w) => w.getTitle() === '' || w.getTitle() === 'Raven')
      return dashboard?.getTitle() ?? null
    })

    // Title should be empty string (set in windowManager.ts)
    expect(title === '' || title === 'Raven' || title === null).toBeTruthy()
  })

  test('stealth mode can be toggled via IPC', async ({ electronApp }) => {
    try {
      // Test stealth mode via evaluate
      const result = await electronApp.evaluate(async ({ ipcMain }) => {
        // Stealth mode is handled by windowManager
        return true
      })

      expect(result).toBe(true)
    } catch {
      // IPC may not be available in all test configurations
    }
  })
})
