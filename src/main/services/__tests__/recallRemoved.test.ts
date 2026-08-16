import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn() },
  safeStorage: { isEncryptionAvailable: vi.fn(() => false) },
}))

vi.mock('../../store', () => ({
  getSetting: vi.fn(() => ''),
  getApiKey: vi.fn(() => ''),
  saveSetting: vi.fn(),
  isProMode: vi.fn(() => false),
  isFreeMode: vi.fn(() => true),
}))

vi.mock('../sessionManager', () => ({
  sessionManager: {
    addTranscriptEntry: vi.fn(),
    startSession: vi.fn(),
    endSession: vi.fn(),
  },
}))

vi.mock('../../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

describe('Recall is removed', () => {
  const originalPlatform = process.platform
  const originalArch = process.arch
  const originalWinFlag = process.env.RAVEN_ENABLE_RECALL_WIN

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    Object.defineProperty(process, 'arch', { value: originalArch, configurable: true })
    if (originalWinFlag === undefined) {
      delete process.env.RAVEN_ENABLE_RECALL_WIN
    } else {
      process.env.RAVEN_ENABLE_RECALL_WIN = originalWinFlag
    }
    vi.doUnmock('@recallai/desktop-sdk')
    vi.resetModules()
  })

  it('isRecallSupported is false on Windows even with RAVEN_ENABLE_RECALL_WIN=1', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    process.env.RAVEN_ENABLE_RECALL_WIN = '1'
    vi.resetModules()
    const { isRecallSupported } = await import('../recallService')
    expect(isRecallSupported()).toBe(false)
  })

  it('isRecallSupported is false on Apple Silicon macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    Object.defineProperty(process, 'arch', { value: 'arm64', configurable: true })
    vi.doMock('os', async (importOriginal) => {
      const actual = await importOriginal<typeof import('os')>()
      return { ...actual, machine: () => 'arm64' }
    })
    vi.resetModules()
    const { isRecallSupported } = await import('../recallService')
    expect(isRecallSupported()).toBe(false)
  })

  it('initRecallSdk never loads @recallai/desktop-sdk', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    Object.defineProperty(process, 'arch', { value: 'arm64', configurable: true })
    process.env.RAVEN_ENABLE_RECALL_WIN = '1'
    const sdkInit = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@recallai/desktop-sdk', () => ({
      default: { init: sdkInit, requestPermission: vi.fn(), addEventListener: vi.fn() },
    }))
    vi.resetModules()
    const { initRecallSdk, isRecallSdkReady } = await import('../recallService')
    const ready = await initRecallSdk()
    expect(ready).toBe(false)
    expect(sdkInit).not.toHaveBeenCalled()
    expect(isRecallSdkReady()).toBe(false)
  })
})
