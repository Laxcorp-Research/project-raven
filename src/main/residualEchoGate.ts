/**
 * Last-line defense when AEC leaves a transcribable YouTube residual in the mic.
 *
 * "You" is mic STT, not diarization. Laptop speakers + a built-in mic means the
 * same system-audio line is in both streams. Decide on RAW mic vs recent system
 * PCM (AEC residual is too distorted for Pearson) and accumulate ~100ms so 10ms
 * helper chunks are not skipped.
 *
 * Holdover only covers a quiet residual after an echo hit (YouTube gap). It
 * must not suppress barge-in: AEC-cleaned speech has high RMS and does not
 * correlate with the far-end, even when the raw mic still does.
 */

const SAMPLE_RATE = 16000
const RING_SAMPLES = (SAMPLE_RATE * 400) / 1000
const CORR_WINDOW = 1600 // 100ms
const MIN_WINDOW = 80 // 5ms — Mac helper chunks are ~10ms (171 samples)
const LAG_STEP = 80 // 5ms
export const ECHO_CORR_THRESHOLD = 0.32
const HOLDOVER_SAMPLES = (SAMPLE_RATE * 400) / 1000
const SILENCE_RMS = 50
/** AEC residual of speaker echo sits around RMS 6–8; loud barge-in was ~411. */
export const NEAR_END_SEND_RMS = 80

export class ResidualEchoGate {
  private readonly ring = new Int16Array(RING_SAMPLES)
  private write = 0
  private filled = 0
  lastAbsCorr = 0
  lastCleanRms = 0
  lastDecision: 'pending' | 'echo' | 'hold' | 'send' | 'speech' = 'pending'
  private holdSamples = 0
  private pendingRaw: Buffer[] = []
  private pendingRawSamples = 0
  private pendingClean: Buffer[] = []

  reset(): void {
    this.ring.fill(0)
    this.write = 0
    this.filled = 0
    this.lastAbsCorr = 0
    this.lastCleanRms = 0
    this.lastDecision = 'pending'
    this.holdSamples = 0
    this.pendingRaw = []
    this.pendingRawSamples = 0
    this.pendingClean = []
  }

  pushSystemPcm(buf: Buffer): void {
    const samples = toInt16(buf)
    for (let i = 0; i < samples.length; i++) {
      this.ring[this.write] = samples[i]
      this.write = (this.write + 1) % this.ring.length
      if (this.filled < this.ring.length) this.filled++
    }
  }

  /**
   * Accumulate raw + cleaned mic. Returns cleaned PCM to send to STT, or
   * null to withhold (still buffering, echo, or echo holdover).
   */
  takeMicForStt(raw: Buffer, cleaned: Buffer | null): Buffer | null {
    this.pendingRaw.push(raw)
    this.pendingRawSamples += Math.floor(raw.length / 2)
    if (cleaned && cleaned.length > 0) this.pendingClean.push(cleaned)

    if (this.pendingRawSamples < CORR_WINDOW) {
      this.lastDecision = 'pending'
      return null
    }

    const rawWindow = Buffer.concat(this.pendingRaw)
    const cleanWindow = this.pendingClean.length > 0 ? Buffer.concat(this.pendingClean) : null
    this.pendingRaw = []
    this.pendingClean = []
    this.pendingRawSamples = 0

    const rawIsEcho = this.looksLikeEcho(rawWindow)
    const rawCorr = this.lastAbsCorr
    this.lastCleanRms = cleanWindow ? rms(toInt16(cleanWindow)) : 0
    const cleanIsEcho =
      cleanWindow && this.lastCleanRms >= NEAR_END_SEND_RMS
        ? this.looksLikeEcho(cleanWindow)
        : false
    this.lastAbsCorr = rawCorr

    const nearEnd = this.lastCleanRms >= NEAR_END_SEND_RMS && !cleanIsEcho
    const wouldDrop = rawIsEcho || cleanIsEcho || this.holdSamples > 0
    if (nearEnd && cleanWindow && cleanWindow.length > 0) {
      this.holdSamples = 0
      this.lastDecision = wouldDrop ? 'speech' : 'send'
      return cleanWindow
    }

    if (rawIsEcho || cleanIsEcho) {
      this.holdSamples = HOLDOVER_SAMPLES
      this.lastDecision = 'echo'
      return null
    }
    if (this.holdSamples > 0) {
      this.holdSamples -= CORR_WINDOW
      this.lastDecision = 'hold'
      return null
    }
    this.lastDecision = 'send'
    return cleanWindow && cleanWindow.length > 0 ? cleanWindow : null
  }

  /** false = this mic chunk is speaker playback; skip STT. */
  allowMicPcm(buf: Buffer): boolean {
    return !this.looksLikeEcho(buf)
  }

  private looksLikeEcho(buf: Buffer): boolean {
    this.lastAbsCorr = 0
    const mic = toInt16(buf)
    if (mic.length < MIN_WINDOW) return false
    if (rms(mic) < SILENCE_RMS) return false
    if (this.filled < CORR_WINDOW) return false
    if (ringRms(this.ring, this.write, this.filled) < SILENCE_RMS) return false

    const windowLen = Math.min(CORR_WINDOW, mic.length)
    const micWindow = mic.subarray(mic.length - windowLen)
    if (rms(micWindow) < SILENCE_RMS) return false

    const maxLag = this.filled - windowLen
    let peak = 0
    for (let lag = 0; lag <= maxLag; lag += LAG_STEP) {
      const far = ringSlice(this.ring, this.write, this.filled, lag, windowLen)
      if (!far) break
      if (rms(far) < SILENCE_RMS) continue
      const corr = Math.abs(pearson(micWindow, far))
      if (corr > peak) peak = corr
      if (peak >= ECHO_CORR_THRESHOLD) break
    }
    this.lastAbsCorr = peak
    return peak >= ECHO_CORR_THRESHOLD
  }
}

export function toInt16(buf: Buffer): Int16Array {
  return new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2))
}

export function pearson(a: Int16Array, b: Int16Array): number {
  const n = a.length
  if (n === 0 || n !== b.length) return 0
  let sa = 0
  let sb = 0
  let sab = 0
  let sa2 = 0
  let sb2 = 0
  for (let i = 0; i < n; i++) {
    const x = a[i]
    const y = b[i]
    sa += x
    sb += y
    sab += x * y
    sa2 += x * x
    sb2 += y * y
  }
  const cov = sab - (sa * sb) / n
  const da = sa2 - (sa * sa) / n
  const db = sb2 - (sb * sb) / n
  if (da < 1e-6 || db < 1e-6) return 0
  return cov / Math.sqrt(da * db)
}

function rms(samples: Int16Array): number {
  if (samples.length === 0) return 0
  let ss = 0
  for (let i = 0; i < samples.length; i++) ss += samples[i] * samples[i]
  return Math.sqrt(ss / samples.length)
}

function ringRms(ring: Int16Array, write: number, filled: number): number {
  if (filled === 0) return 0
  let ss = 0
  const start = write - filled
  for (let i = 0; i < filled; i++) {
    const s = ring[((start + i) % ring.length + ring.length) % ring.length]
    ss += s * s
  }
  return Math.sqrt(ss / filled)
}

function ringSlice(
  ring: Int16Array,
  write: number,
  filled: number,
  lagSamples: number,
  length: number,
): Int16Array | null {
  if (lagSamples + length > filled) return null
  const out = new Int16Array(length)
  let start = write - lagSamples - length
  while (start < 0) start += ring.length
  for (let i = 0; i < length; i++) {
    out[i] = ring[(start + i) % ring.length]
  }
  return out
}
