/**
 * Shared Electron app fixture for E2E tests.
 *
 * Launches the Electron app from the compiled Vite output (dist/).
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
import os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Resolve paths relative to project root
const projectRoot = path.resolve(__dirname, '..', '..')
const mainEntry = path.join(projectRoot, 'dist', 'main', 'index.js')

export const test = base.extend<{
  electronApp: ElectronApplication
  dashboardPage: Page
}>({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    // Playwright's fixture signature requires `{}` as the first arg even
    // when we don't read any dependencies — disabling no-empty-pattern
    // locally so the signature is preserved verbatim.
    // Ensure the built app exists
    if (!fs.existsSync(mainEntry)) {
      throw new Error(
        `Built app not found at ${mainEntry}. Run "npm run build" first.`
      )
    }

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raven-e2e-'))
    const app = await electron.launch({
      args: [mainEntry, `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        // Skip auto-update checks during tests
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    })

    try {
      await use(app)
    } finally {
      await app.close()
      fs.rmSync(userDataDir, { recursive: true, force: true })
    }
  },

  dashboardPage: async ({ electronApp }, use) => {
    // Raven may create the compact overlay before the dashboard. Select the
    // widest renderer instead of relying on Electron window creation order.
    await electronApp.firstWindow()
    let page: Page | undefined
    for (let attempt = 0; attempt < 20 && !page; attempt++) {
      for (const candidate of electronApp.windows()) {
        const body = await candidate.locator('body').innerText().catch(() => '')
        if (/Get Started|API Keys|Recent Sessions|Settings/i.test(body)) {
          page = candidate
          break
        }
      }
      if (!page) await new Promise((resolve) => setTimeout(resolve, 250))
    }
    page ??= electronApp.windows().sort((left, right) =>
      (right.viewportSize()?.width ?? 0) - (left.viewportSize()?.width ?? 0)
    )[0]
    if (!page) throw new Error('Raven dashboard window was not created.')
    // Wait for the renderer to be ready
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  },
})

export { expect } from '@playwright/test'
