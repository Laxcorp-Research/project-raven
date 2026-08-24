import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  showSaveDialog,
  writeFileSync,
  unlinkSync,
  printToPDF,
  loadFile,
  destroy,
  BrowserWindowMock,
} = vi.hoisted(() => {
  const _loadFile = vi.fn()
  const _printToPDF = vi.fn()
  const _destroy = vi.fn()
  return {
    showSaveDialog: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    printToPDF: _printToPDF,
    loadFile: _loadFile,
    destroy: _destroy,
    BrowserWindowMock: vi.fn(function MockBrowserWindow() {
      return {
        loadFile: _loadFile,
        webContents: { printToPDF: _printToPDF },
        destroy: _destroy,
      }
    }),
  }
})

vi.mock('electron', () => ({
  dialog: { showSaveDialog: (...args: unknown[]) => showSaveDialog(...args) },
  app: { getPath: () => '/tmp' },
  BrowserWindow: BrowserWindowMock,
}))

vi.mock('fs', () => ({
  default: {
    writeFileSync: (...args: unknown[]) => writeFileSync(...args),
    unlinkSync: (...args: unknown[]) => unlinkSync(...args),
  },
}))

vi.mock('../../logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { exportSession } from '../sessionExportService'
import type { SessionExportData } from '../../../shared/sessionExport'

const DATA: SessionExportData = {
  title: 'Test Session',
  startedAt: Date.now(),
  durationSeconds: 60,
  summary: 'A short summary',
  actionItemsJson: null,
  transcript: [{ source: 'mic', text: 'hello', isFinal: true }],
  displayName: 'You',
}

describe('exportSession', () => {
  beforeEach(() => {
    loadFile.mockResolvedValue(undefined)
  })

  it('writes nothing and reports canceled when the Markdown save dialog is dismissed', async () => {
    showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: undefined })

    const result = await exportSession({ data: DATA, format: 'markdown' })

    expect(result).toEqual({ ok: false, canceled: true })
    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('writes a Markdown file with the recap contents on success', async () => {
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '/out/session.md' })

    const result = await exportSession({ data: DATA, format: 'markdown' })

    expect(result).toEqual({ ok: true, filePath: '/out/session.md' })
    expect(writeFileSync).toHaveBeenCalledWith(
      '/out/session.md',
      expect.stringContaining('# Test Session'),
      'utf-8',
    )
  })

  it('writes nothing and does not open a window when the PDF dialog is dismissed', async () => {
    showSaveDialog.mockResolvedValueOnce({ canceled: true })

    const result = await exportSession({ data: DATA, format: 'pdf' })

    expect(result).toEqual({ ok: false, canceled: true })
    expect(writeFileSync).not.toHaveBeenCalled()
    expect(BrowserWindowMock).not.toHaveBeenCalled()
  })

  it('renders a PDF via a hidden window on success and cleans up the temp file', async () => {
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '/out/session.pdf' })
    printToPDF.mockResolvedValueOnce(Buffer.from('PDFDATA'))

    const result = await exportSession({ data: DATA, format: 'pdf' })

    expect(result).toEqual({ ok: true, filePath: '/out/session.pdf' })
    expect(printToPDF).toHaveBeenCalled()
    // final write is the PDF buffer to the chosen path
    expect(writeFileSync).toHaveBeenCalledWith('/out/session.pdf', expect.any(Buffer))
    expect(destroy).toHaveBeenCalled()
    expect(unlinkSync).toHaveBeenCalled()
  })

  it('returns an error result (not a throw) when saving fails', async () => {
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '/out/session.md' })
    writeFileSync.mockImplementationOnce(() => {
      throw new Error('disk full')
    })

    const result = await exportSession({ data: DATA, format: 'markdown' })

    expect(result).toEqual({ ok: false, error: 'disk full' })
  })
})
