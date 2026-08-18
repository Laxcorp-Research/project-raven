import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

function loadBuilderConfig(): Record<string, unknown> {
  const raw = readFileSync(join(process.cwd(), 'electron-builder.json5'), 'utf8')
  const stripped = raw.replace(/^\s*\/\/.*$/gm, '')
  return JSON.parse(stripped) as Record<string, unknown>
}

describe('electron-builder packaging (OSS Mac/Windows)', () => {
  it('copies resources/tray into extraResources so packaged tray icons exist', () => {
    const config = loadBuilderConfig()
    const extras = config.extraResources as Array<{ from: string; to: string }>
    expect(extras).toEqual(
      expect.arrayContaining([{ from: 'resources/tray', to: 'tray' }]),
    )
    expect(extras.some((e) => e.from.includes('.raven-pro'))).toBe(false)
  })

  it('declares NSScreenCaptureUsageDescription so macOS screen TCC can grant', () => {
    const config = loadBuilderConfig()
    const mac = config.mac as { extendInfo?: { NSScreenCaptureUsageDescription?: string } }
    expect(mac.extendInfo?.NSScreenCaptureUsageDescription).toMatch(/Screen Recording/)
  })

  it('re-signs the Mac .app adhoc with the Raven bundle id after pack', () => {
    const config = loadBuilderConfig()
    expect(config.afterPack).toBe('./scripts/afterPack-mac-identity.cjs')
  })
})

describe('vite dev server (npm run dev)', () => {
  it('binds 127.0.0.1 so Electron does not hang on localhost IPv6', () => {
    const raw = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8')
    expect(raw).toMatch(/host:\s*'127\.0\.0\.1'/)
  })
})
