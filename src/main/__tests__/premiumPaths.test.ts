/**
 * The main-only premium guard failed after OSS notarize shipped
 * entitlements.mac.plist. PRs skipped that job, so CI looked green.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

function premiumOnlyPaths(repoRoot: string): string[] {
  const raw = readFileSync(join(repoRoot, '.premium-paths'), 'utf8')
  const section1 = raw.split(/^---\s*$/m)[0] ?? raw
  const paths: string[] = []
  for (let line of section1.split('\n')) {
    line = line.replace(/#.*$/, '').trim()
    if (!line) continue
    paths.push(line.replace(/\/$/, ''))
  }
  return paths
}

describe('.premium-paths vs OSS Mac notarize', () => {
  const root = process.cwd()

  it('forbids Pro-only trees but not build/entitlements.mac.plist', () => {
    const forbidden = premiumOnlyPaths(root)
    expect(forbidden).toContain('src/pro')
    expect(forbidden).not.toContain('build/entitlements.mac.plist')
  })

  it('keeps the entitlements plist that electron-builder notarize requires', () => {
    expect(existsSync(join(root, 'build/entitlements.mac.plist'))).toBe(true)
    const builder = readFileSync(join(root, 'electron-builder.json5'), 'utf8')
    expect(builder).toMatch(/"entitlements":\s*"build\/entitlements\.mac\.plist"/)
  })
})
