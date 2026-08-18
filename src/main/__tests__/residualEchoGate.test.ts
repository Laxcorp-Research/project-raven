import { describe, expect, it } from 'vitest'
import { ResidualEchoGate, ECHO_CORR_THRESHOLD } from '../residualEchoGate'

const SAMPLE_RATE = 16000

function pcmFromSamples(samples: number[]): Buffer {
  const buf = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i]))), i * 2)
  }
  return buf
}

function noise(samples: number, seed: number, amplitude = 8000): Buffer {
  let s = seed >>> 0
  const out: number[] = []
  for (let i = 0; i < samples; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    out.push(((s % (amplitude * 2 + 1)) - amplitude))
  }
  return pcmFromSamples(out)
}

function silence(samples: number): Buffer {
  return Buffer.alloc(samples * 2)
}

function mixPcm(a: Buffer, b: Buffer): Buffer {
  const n = Math.min(a.length, b.length)
  const out = Buffer.alloc(n)
  for (let i = 0; i < n; i += 2) {
    const mixed = a.readInt16LE(i) + b.readInt16LE(i)
    out.writeInt16LE(Math.max(-32768, Math.min(32767, mixed)), i)
  }
  return out
}

describe('ResidualEchoGate', () => {
  it('drops mic that is a delayed copy of system audio (YouTube labeled You)', () => {
    const gate = new ResidualEchoGate()
    const system = noise(6400, 42) // 400ms — stays in the far-end ring
    gate.pushSystemPcm(system)

    // Mic hears the same playback ~80ms later (1280 samples).
    const delay = 1280
    const echo = Buffer.from(system.subarray(delay * 2, delay * 2 + 1600 * 2))
    expect(gate.allowMicPcm(echo)).toBe(false)
    expect(gate.lastAbsCorr).toBeGreaterThanOrEqual(ECHO_CORR_THRESHOLD)
  })

  it('keeps uncorrelated mic while system audio plays (actual user speech)', () => {
    const gate = new ResidualEchoGate()
    gate.pushSystemPcm(noise(SAMPLE_RATE, 42))
    const speech = noise(1600, 99)
    expect(gate.allowMicPcm(speech)).toBe(true)
    expect(gate.lastAbsCorr).toBeLessThan(ECHO_CORR_THRESHOLD)
  })

  it('keeps mic when the system ring is silent (no speaker playback to match)', () => {
    const gate = new ResidualEchoGate()
    gate.pushSystemPcm(silence(SAMPLE_RATE))
    expect(gate.allowMicPcm(noise(1600, 7))).toBe(true)
  })

  it('keeps mic before the system ring has enough far-end audio', () => {
    const gate = new ResidualEchoGate()
    gate.pushSystemPcm(noise(400, 1)) // 25ms — below the 100ms ring floor
    expect(gate.allowMicPcm(noise(1600, 1))).toBe(true)
  })

  it('reset clears the ring so a later echo copy is not matched against stale audio', () => {
    const gate = new ResidualEchoGate()
    const system = noise(SAMPLE_RATE, 3)
    gate.pushSystemPcm(system)
    gate.reset()
    const echo = Buffer.from(system.subarray(0, 1600 * 2))
    expect(gate.allowMicPcm(echo)).toBe(true)
  })

  it('drops 10ms echo slices once a 100ms window is full (Mac helper chunk size)', () => {
    const gate = new ResidualEchoGate()
    const system = noise(6400, 42)
    gate.pushSystemPcm(system)
    const delay = 1280
    const echo = Buffer.from(system.subarray(delay * 2, delay * 2 + 1600 * 2))
    const slice = 320 // 10ms
    let sent: Buffer | null = null
    for (let off = 0; off < echo.length; off += slice) {
      const chunk = echo.subarray(off, off + slice)
      sent = gate.takeMicForStt(chunk, chunk)
    }
    expect(sent).toBeNull()
    expect(gate.lastDecision).toBe('echo')
  })

  it('keeps uncorrelated 10ms speech slices after a full window', () => {
    const gate = new ResidualEchoGate()
    gate.pushSystemPcm(noise(6400, 42))
    const speech = noise(1600, 99)
    const slice = 320
    let sent: Buffer | null = null
    for (let off = 0; off < speech.length; off += slice) {
      const chunk = speech.subarray(off, off + slice)
      sent = gate.takeMicForStt(chunk, chunk)
    }
    expect(sent?.length).toBe(speech.length)
    expect(gate.lastDecision).toBe('send')
  })

  it('holds a quiet residual after echo so a YouTube gap does not reopen You', () => {
    const gate = new ResidualEchoGate()
    const system = noise(6400, 11)
    gate.pushSystemPcm(system)
    const delay = 1280
    const echo = Buffer.from(system.subarray(delay * 2, delay * 2 + 1600 * 2))
    expect(gate.takeMicForStt(echo, echo)).toBeNull()
    expect(gate.lastDecision).toBe('echo')

    const residual = noise(1600, 77, 100)
    expect(gate.takeMicForStt(residual, residual)).toBeNull()
    expect(gate.lastDecision).toBe('hold')
  })

  it('sends loud uncorrelated mic during holdover (talk-over while video plays)', () => {
    const gate = new ResidualEchoGate()
    const system = noise(6400, 11)
    gate.pushSystemPcm(system)
    const delay = 1280
    const echo = Buffer.from(system.subarray(delay * 2, delay * 2 + 1600 * 2))
    expect(gate.takeMicForStt(echo, echo)).toBeNull()
    expect(gate.lastDecision).toBe('echo')

    const speech = noise(1600, 99)
    const sent = gate.takeMicForStt(speech, speech)
    expect(sent?.equals(speech)).toBe(true)
    expect(gate.lastDecision).toBe('speech')
  })

  it('sends AEC-cleaned speech when raw mic is echo plus voice (double-talk)', () => {
    const gate = new ResidualEchoGate()
    const system = noise(6400, 42)
    gate.pushSystemPcm(system)
    const delay = 1280
    const echo = Buffer.from(system.subarray(delay * 2, delay * 2 + 1600 * 2))
    const speech = noise(1600, 99)
    const raw = mixPcm(echo, speech)
    const sent = gate.takeMicForStt(raw, speech)
    expect(sent?.equals(speech)).toBe(true)
    expect(gate.lastDecision).toBe('speech')
  })
})
