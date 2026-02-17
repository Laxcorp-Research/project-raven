/**
 * Shared Electron app fixture for E2E tests.
 *
 * Launches the Electron app from the compiled output (dist-electron/).
 * Tests must run `npm run build` first or use the dev server.
 *
 * The fixture provides:
 * - `electronApp`: the Playwright ElectronApplication instance
 * - `dashboardPage`: the first (dashboard) window's Page object
 */
import { test as base, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Resolve paths relative to project root
const projectRoot = path.resolve(__dirname, '..', '..')
const mainEntry = path.join(projectRoot, 'dist-electron', 'main', 'index.js')

export const test = base.extend<{
  electronApp: ElectronApplication
  dashboardPage: Page
}>({
  electronApp: async ({}, use) => {
    // Ensure the built app exists
    if (!fs.existsSync(mainEntry)) {
      throw new Error(
        `Built app not found at ${mainEntry}. Run "npm run build" first.`
      )
    }

    const app = await electron.launch({
      args: [mainEntry],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        // Skip auto-update checks during tests
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    })

    await use(app)
    await app.close()
  },

  dashboardPage: async ({ electronApp }, use) => {
    // Wait for the first window to open (dashboard)
    const page = await electronApp.firstWindow()
    // Wait for the renderer to be ready
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  },
})

export { expect } from '@playwright/test'
