/**
 * Shared AudioContext singleton to avoid conflicts between
 * multiple audio capture sources.
 */

let sharedContext: AudioContext | null = null
let refCount = 0

export async function getSharedAudioContext(): Promise<AudioContext> {
  if (!sharedContext || sharedContext.state === 'closed') {
    console.log('[SharedAudioContext] Creating new AudioContext...')
    sharedContext = new AudioContext()
    refCount = 0
  }

  if (sharedContext.state === 'suspended') {
    console.log('[SharedAudioContext] Resuming suspended context...')
    await sharedContext.resume()
  }

  refCount++
  console.log(
    `[SharedAudioContext] Acquired, refCount: ${refCount}, sampleRate: ${sharedContext.sampleRate}`
  )
  return sharedContext
}

export async function releaseSharedAudioContext(): Promise<void> {
  refCount--
  console.log(`[SharedAudioContext] Released, refCount: ${refCount}`)

  if (refCount <= 0 && sharedContext) {
    console.log('[SharedAudioContext] Closing context...')
    await sharedContext.close()
    sharedContext = null
    refCount = 0
  }
}
