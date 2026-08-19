import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

function readme(): string {
  return readFileSync(join(process.cwd(), 'README.md'), 'utf8')
}

describe('README matches the OSS runtime', () => {
  it('does not claim store.ts is SQLite or mention a missing aiService.ts', () => {
    const text = readme()
    expect(text).toMatch(/store\.ts\s+#\s+electron-store/)
    expect(text).toMatch(/database\.ts\s+#\s+SQLite/)
    expect(text).toContain('claudeService.ts')
    expect(text).not.toMatch(/aiService\.ts/)
    expect(text).not.toMatch(/store\.ts\s+#\s+SQLite/)
  })

  it('documents AssemblyAI routing and residual echo gate, not Deepgram-only STT', () => {
    const text = readme()
    expect(text).toMatch(/AssemblyAI/)
    expect(text).toMatch(/u3-rt-pro/)
    expect(text).toMatch(/nova-3/)
    expect(text).toMatch(/ResidualEchoGate|residual echo gate/)
    expect(text).not.toMatch(/two parallel WebSocket connections to Deepgram Nova-3/)
  })

  it('describes RAG as local MiniLM per mode, not cross-meeting memory', () => {
    const text = readme()
    expect(text).toMatch(/Xenova\/all-MiniLM-L6-v2/)
    expect(text).toMatch(/sessionMemory/)
    expect(text).toMatch(/cross-meeting user-memory/)
    expect(text).toMatch(/There is no global/)
    expect(text).not.toMatch(/Raven Backend/)
    expect(text).not.toMatch(/Pro Loader/)
  })

  it('lists current global hotkeys, not Cmd+R recording', () => {
    const text = readme()
    expect(text).toMatch(/Cmd \+ Shift \+ Space/)
    expect(text).toMatch(/Cmd \+ Shift \+ Backspace/)
    expect(text).not.toMatch(/Start\/Stop Recording \| `Cmd \+ R`/)
    expect(text).not.toMatch(/Clear Conversation \| `Cmd \+ Shift \+ R`/)
  })

  it('does not advertise hosted Pro, login, or Recall as available', () => {
    const text = readme()
    expect(text).toMatch(/no Raven account/)
    expect(text).toMatch(/does not ship login, hosted Pro/)
    expect(text).toMatch(/Recall meeting-bot capture/)
  })

  it('points maintainers at CONTRIBUTING.md for cutting a notarized Mac release', () => {
    const text = readme()
    expect(text).toMatch(/CONTRIBUTING\.md#releasing/)
  })
})

describe('CONTRIBUTING.md documents the Mac release loop', () => {
  it('states that publishing a GitHub Release is the notarize trigger', () => {
    const text = readFileSync(join(process.cwd(), 'CONTRIBUTING.md'), 'utf8')
    expect(text).toMatch(/## Releasing/)
    expect(text).toMatch(/Dispatch notarized Mac release/)
    expect(text).toMatch(/Release OSS macOS/)
    expect(text).toMatch(/PRIVATE_DISPATCH_TOKEN/)
    expect(text).toMatch(/OSS_RELEASE_GITHUB_TOKEN/)
    expect(text).toMatch(/project-raven-private/)
    expect(text).toMatch(/Free Apps/)
    expect(text).not.toMatch(/release-electron\.yml/)
  })
})