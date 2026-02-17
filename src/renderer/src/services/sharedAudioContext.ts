/**
 * Shared AudioContext singleton to avoid conflicts between
 * multiple audio capture sources.
 */

import { createLogger } from '../lib/logger'

const log = createLogger('SharedAudioContext')

let sharedContext: AudioContext | null = null
let refCount = 0

export async function getSharedAudioContext(): Promise<AudioContext> {
  if (!sharedContext || sharedContext.state === 'closed') {
    log.log('Creating new AudioContext...')
    sharedContext = new AudioContext()
    refCount = 0
  }

  if (sharedContext.state === 'suspended') {
    log.log('Resuming suspended context...')
    await sharedContext.resume()
  }

  refCount++
  log.log(
    `Acquired, refCount: ${refCount}, sampleRate: ${sharedContext.sampleRate}`
  )
  return sharedContext
}

export async function releaseSharedAudioContext(): Promise<void> {
  refCount--
  log.log(`Released, refCount: ${refCount}`)

  if (refCount <= 0 && sharedContext) {
    log.log('Closing context...')
    await sharedContext.close()
    sharedContext = null
    refCount = 0
  }
}
