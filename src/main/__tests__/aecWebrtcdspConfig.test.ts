import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

describe('webrtcdsp AEC config', () => {
  const src = readFileSync(join(process.cwd(), 'src/native/aec/src/aec_addon.cpp'), 'utf8')

  it('disables AGC so residual speaker echo is not amplified into Deepgram', () => {
    expect(src).toMatch(/"gain-control",\s*FALSE/)
  })

  it('uses delay-agnostic + extended-filter + high echo suppression', () => {
    expect(src).toMatch(/"delay-agnostic",\s*TRUE/)
    expect(src).toMatch(/"extended-filter",\s*TRUE/)
    expect(src).toMatch(/"echo-suppression-level",\s*3/)
  })
})
