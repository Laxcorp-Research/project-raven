/**
 * Session export orchestration: show a save dialog, then write Markdown
 * directly or render HTML to PDF via a hidden BrowserWindow. Kept separate
 * from the pure serializers (src/shared/sessionExport) so the file/dialog/PDF
 * side effects are isolated and testable.
 */

import { dialog, BrowserWindow, app } from 'electron'
import fs from 'fs'
import path from 'path'
import {
  buildSessionMarkdown,
  buildSessionHtml,
  type SessionExportData,
} from '../../shared/sessionExport'
import { createLogger } from '../logger'

const log = createLogger('SessionExport')

export type ExportResult =
  | { ok: true; filePath: string }
  | { ok: false; canceled?: boolean; error?: string }

function safeFileName(title: string): string {
  const base = (title || 'session')
    .replace(/[^\w\d\-. ]+/g, '_')
    .trim()
    .slice(0, 80)
  return base || 'session'
}

export async function exportSession(params: {
  data: SessionExportData
  format: 'markdown' | 'pdf'
}): Promise<ExportResult> {
  const { data, format } = params
  const base = safeFileName(data.title)

  try {
    if (format === 'markdown') {
      const res = await dialog.showSaveDialog({
        defaultPath: `${base}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (res.canceled || !res.filePath) return { ok: false, canceled: true }
      fs.writeFileSync(res.filePath, buildSessionMarkdown(data), 'utf-8')
      return { ok: true, filePath: res.filePath }
    }

    const res = await dialog.showSaveDialog({
      defaultPath: `${base}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }

    const html = buildSessionHtml(data)
    const tmpHtml = path.join(app.getPath('temp'), `raven-export-${Date.now()}.html`)
    fs.writeFileSync(tmpHtml, html, 'utf-8')

    const win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    })
    try {
      await win.loadFile(tmpHtml)
      const pdf = await win.webContents.printToPDF({ printBackground: true })
      fs.writeFileSync(res.filePath, pdf)
    } finally {
      win.destroy()
      try {
        fs.unlinkSync(tmpHtml)
      } catch {
        /* temp cleanup best-effort */
      }
    }
    return { ok: true, filePath: res.filePath }
  } catch (err) {
    log.error('Session export failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Export failed' }
  }
}
