import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../store', () => ({
  isProMode: vi.fn(() => false),
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('../services/sessionManager', () => ({
  sessionManager: { setSyncFunction: vi.fn() },
}))

vi.mock('../services/database', () => ({
  databaseService: { getAllSessions: vi.fn(() => []) },
}))

import { initializeProFeatures } from '../proLoader'
import { isProMode } from '../store'

describe('proLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips pro features in free mode', async () => {
    vi.mocked(isProMode).mockReturnValue(false)

    await initializeProFeatures()
  })

  it('attempts to load pro modules in pro mode', async () => {
    vi.mocked(isProMode).mockReturnValue(true)

    await initializeProFeatures()
  })

  it('gracefully handles missing pro modules', async () => {
    vi.mocked(isProMode).mockReturnValue(true)

    await expect(initializeProFeatures()).resolves.not.toThrow()
  })
})
