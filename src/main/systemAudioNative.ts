/**
 * System audio capture via Swift helper (audiocapture).
 * Spawns a child process and streams PCM audio via stdout.
 *
 * Integrates GStreamer-based AEC pipeline (webrtcechoprobe/webrtcdsp)
 * for echo cancellation using the WebRTC AEC3 engine.
 * GStreamer handles synchronization, resampling, gain control, and buffering.
 */

import { ipcMain, systemPreferences } from 'electron'
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'
import { createLogger } from './logger'

const log = createLogger('SystemAudio')

type AudioSource = 'mic' | 'system'
type ProcessedAudioCallback = (buffer: Buffer, source: AudioSource) => void

let systemChunkCount = 0
let micChunkCount = 0
let captureProcess: ChildProcessWithoutNullStreams | null = null
let windowsModule: WindowsAudioModule | null = null
let parseBuffer = Buffer.alloc(0)
let processedAudioCallback: ProcessedAudioCallback | null = null

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'
const require = createRequire(import.meta.url)

// --- GStreamer AEC Module with Resilience ---

interface AecStats {
  driftMs: number
  systemBuffers: number
  micBuffers: number
  outputBuffers: number
  systemOverflows: number
  micOverflows: number
  systemAudioMs: number
  micAudioMs: number
  systemRms: number
  micRms: number
  outputRms: number
  consecutiveEmptyPulls: number
}

interface AecModule {
  init(pluginPath?: string): void
  destroy(): void
  pushSystemAudio(systemAudio: Buffer): void
  pushMicAudio(micAudio: Buffer): void
  pullCleanMic(): Buffer | null
  drainOutput(): void
  getStats(): AecStats | null
}

let aecModule: AecModule | null = null
let aecInitialized = false

// --- AEC bypass state (mirrors Recall.ai's resilience logic) ---
let aecBypassed = false
let healthCheckInterval: NodeJS.Timeout | null = null
let prevOverflows = { system: 0, mic: 0 }

const AEC_DRIFT_BYPASS_MS = 200
const AEC_DRIFT_REENABLE_MS = 100
const AEC_OVERFLOW_RATE_BYPASS = 10     // overflows per health check interval
const AEC_STALL_BYPASS_PULLS = 200      // ~2s at 10ms chunks with no output
const AEC_HEALTH_CHECK_MS = 2000
const AEC_REENABLE_HOLDOFF_MS = 5000
const AEC_DIAGNOSTIC_INTERVAL_MS = 10000
let lastBypassTime = 0
let lastDiagnosticTime = 0

function loadAecModule(): AecModule | null {
  if (aecModule) return aecModule

  ensureGstLibsOnPath()

  const devPath = join(
    process.cwd(),
    'src',
    'native',
    'aec',
    'build',
    'Release',
    'raven-aec.node'
  )

  const packagedPath = join(
    process.resourcesPath,
    'raven-aec.node'
  )

  try {
    aecModule = require(devPath) as AecModule
    log.info('GStreamer AEC module loaded (dev)')
    return aecModule
  } catch (err) {
    log.debug('AEC module not found at dev path, trying packaged:', err)
    try {
      aecModule = require(packagedPath) as AecModule
      log.info('GStreamer AEC module loaded (packaged)')
      return aecModule
    } catch (err2) {
      log.warn('GStreamer AEC module not available, echo cancellation disabled:', err2)
      return null
    }
  }
}

function getGstPluginPath(): string {
  // Dev mode: custom-built plugins (macOS needs webrtcdsp built from source)
  const devPluginDir = join(
    process.cwd(),
    'src',
    'native',
    'aec',
    'deps',
    'lib',
    'gstreamer-1.0'
  )
  if (existsSync(devPluginDir)) return devPluginDir

  // Packaged mode: bundled plugins directory
  const packagedPluginDir = join(
    process.resourcesPath,
    'gstreamer-1.0'
  )
  if (existsSync(packagedPluginDir)) return packagedPluginDir

  // Windows dev mode: the official GStreamer installer includes all plugins
  if (isWindows) {
    const gstRoot = process.env.GSTREAMER_1_0_ROOT_MSVC_X86_64
    if (gstRoot) {
      const gstPluginDir = join(gstRoot, 'lib', 'gstreamer-1.0')
      if (existsSync(gstPluginDir)) return gstPluginDir
    }
    const defaultWinPluginDir = 'C:\\gstreamer\\1.0\\msvc_x86_64\\lib\\gstreamer-1.0'
    if (existsSync(defaultWinPluginDir)) return defaultWinPluginDir
  }

  return ''
}

/**
 * On Windows, GStreamer DLLs must be on PATH before loading raven-aec.node.
 * In packaged mode we bundled them into resources/gstreamer-lib/;
 * in dev mode the GStreamer installer's bin/ should already be on PATH.
 */
function ensureGstLibsOnPath(): void {
  if (!isWindows) return

  const bundledLibDir = join(process.resourcesPath, 'gstreamer-lib')
  if (existsSync(bundledLibDir)) {
    const currentPath = process.env.PATH || ''
    if (!currentPath.includes(bundledLibDir)) {
      process.env.PATH = bundledLibDir + ';' + currentPath
    }
    return
  }

  const gstRoot = process.env.GSTREAMER_1_0_ROOT_MSVC_X86_64
  if (gstRoot) {
    const gstBin = join(gstRoot, 'bin')
    const currentPath = process.env.PATH || ''
    if (!currentPath.includes(gstBin)) {
      process.env.PATH = gstBin + ';' + currentPath
    }
  }
}

function initAec(): void {
  if (aecInitialized) return

  const mod = loadAecModule()
  if (mod) {
    try {
      const pluginPath = getGstPluginPath()
      log.info(`GStreamer plugin path: ${pluginPath || '(system default)'}`)
      mod.init(pluginPath)
      aecInitialized = true
      aecBypassed = false
      prevOverflows = { system: 0, mic: 0 }
      lastBypassTime = 0
      lastDiagnosticTime = Date.now()
      log.info('GStreamer AEC pipeline initialized (webrtcechoprobe + webrtcdsp)')
      startHealthMonitor()
    } catch (err) {
      log.error('Failed to initialize GStreamer AEC pipeline:', err)
    }
  }
}

function destroyAec(): void {
  stopHealthMonitor()
  if (aecInitialized && aecModule) {
    try {
      // Log final stats before teardown
      const stats = aecModule.getStats()
      if (stats) {
        log.info(
          `AEC final stats: sys=${stats.systemBuffers} mic=${stats.micBuffers} ` +
          `out=${stats.outputBuffers} drift=${stats.driftMs.toFixed(1)}ms ` +
          `overflows=sys:${stats.systemOverflows}/mic:${stats.micOverflows} ` +
          `bypassed=${aecBypassed}`
        )
      }
      aecModule.destroy()
    } catch (err) {
      log.error('Failed to destroy AEC pipeline:', err)
    }
    aecInitialized = false
    aecBypassed = false
  }
}

/**
 * Periodic health check — detects drift, overflow, and stalls.
 * Bypasses AEC when the pipeline is struggling and re-enables
 * when conditions improve (same pattern as Recall.ai).
 */
function runHealthCheck(): void {
  if (!aecInitialized || !aecModule) return

  let stats: AecStats | null
  try {
    stats = aecModule.getStats()
  } catch (err) {
    log.debug('Failed to get AEC stats:', err)
    return
  }
  if (!stats) return

  const overflowDelta = {
    system: stats.systemOverflows - prevOverflows.system,
    mic: stats.micOverflows - prevOverflows.mic
  }
  prevOverflows = {
    system: stats.systemOverflows,
    mic: stats.micOverflows
  }

  const absDrift = Math.abs(stats.driftMs)
  const overflowRate = overflowDelta.system + overflowDelta.mic
  const stalled = stats.consecutiveEmptyPulls >= AEC_STALL_BYPASS_PULLS &&
    stats.micBuffers > AEC_STALL_BYPASS_PULLS

  if (!aecBypassed) {
    let reason = ''
    if (absDrift > AEC_DRIFT_BYPASS_MS) {
      reason = `drift=${stats.driftMs.toFixed(1)}ms exceeds ${AEC_DRIFT_BYPASS_MS}ms`
    } else if (overflowRate >= AEC_OVERFLOW_RATE_BYPASS) {
      reason = `overflow rate=${overflowRate} (sys:${overflowDelta.system} mic:${overflowDelta.mic})`
    } else if (stalled) {
      reason = `pipeline stalled (${stats.consecutiveEmptyPulls} consecutive empty pulls)`
    }

    if (reason) {
      aecBypassed = true
      lastBypassTime = Date.now()
      log.warn(`AEC BYPASSED: ${reason}`)
    }
  } else {
    const holdoffElapsed = Date.now() - lastBypassTime >= AEC_REENABLE_HOLDOFF_MS
    const driftOk = absDrift < AEC_DRIFT_REENABLE_MS
    const overflowOk = overflowRate === 0
    const outputFlowing = stats.consecutiveEmptyPulls < 10

    if (holdoffElapsed && driftOk && overflowOk && outputFlowing) {
      aecBypassed = false
      log.info(
        `AEC RE-ENABLED: drift=${stats.driftMs.toFixed(1)}ms, ` +
        `overflows=0, output flowing`
      )
    }
  }

  const now = Date.now()
  if (now - lastDiagnosticTime >= AEC_DIAGNOSTIC_INTERVAL_MS) {
    lastDiagnosticTime = now
    log.debug(
      `AEC health: drift=${stats.driftMs.toFixed(1)}ms ` +
      `rms=sys:${stats.systemRms.toFixed(0)}/mic:${stats.micRms.toFixed(0)}/out:${stats.outputRms.toFixed(0)} ` +
      `bufs=sys:${stats.systemBuffers}/mic:${stats.micBuffers}/out:${stats.outputBuffers} ` +
      `overflows=sys:${stats.systemOverflows}/mic:${stats.micOverflows} ` +
      `bypassed=${aecBypassed}`
    )
  }
}

function startHealthMonitor(): void {
  stopHealthMonitor()
  healthCheckInterval = setInterval(runHealthCheck, AEC_HEALTH_CHECK_MS)
}

function stopHealthMonitor(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval)
    healthCheckInterval = null
  }
}

function pushSystemAudio(audioData: Buffer): void {
  if (!aecInitialized || !aecModule) return
  try {
    aecModule.pushSystemAudio(audioData)
  } catch (err) {
    log.error('AEC pushSystemAudio error:', err)
  }
}

/**
 * Push mic audio through the AEC pipeline and pull clean output.
 * When bypassed, still feeds the pipeline (so the AEC filter can
 * re-converge) but returns the raw mic audio for transcription.
 */
function processAndPullMicAudio(audioData: Buffer): Buffer {
  if (!aecInitialized || !aecModule) return audioData
  try {
    aecModule.pushMicAudio(audioData)

    if (aecBypassed) {
      // Drain pipeline output in C++ without allocating JS Buffers.
      // Keeps the adaptive filter running and prevents backpressure.
      aecModule.drainOutput()
      return audioData
    }

    const chunks: Buffer[] = []
    let cleaned = aecModule.pullCleanMic()
    while (cleaned) {
      chunks.push(cleaned)
      cleaned = aecModule.pullCleanMic()
    }

    if (chunks.length === 0) return audioData
    if (chunks.length === 1) return chunks[0]
    return Buffer.concat(chunks)
  } catch (err) {
    log.error('AEC mic processing error:', err)
    return audioData
  }
}

/**
 * Register a callback to receive AEC-processed audio directly in the main process.
 * This bypasses the renderer round-trip for transcription.
 */
export function setProcessedAudioCallback(callback: ProcessedAudioCallback): void {
  processedAudioCallback = callback
}

interface WindowsAudioModule {
  isSystemAudioAvailable: () => boolean
  hasPermission: () => boolean
  requestPermission: () => boolean
  isCapturing: () => boolean
  startSystemAudioCapture: (callback: (chunk: { data: Buffer; timestamp: number }) => void) => boolean
  stopSystemAudioCapture: () => boolean
  startMicCapture: (callback: (chunk: { data: Buffer; timestamp: number }) => void) => boolean
  stopMicCapture: () => boolean
}

function getBinaryPath(): string | null {
  if (!isMac) return null

  const devPath = join(
    process.cwd(),
    'src',
    'native',
    'swift',
    'AudioCapture',
    '.build',
    'release',
    'audiocapture'
  )

  const packagedPath = join(process.resourcesPath, 'swift', 'audiocapture')

  if (existsSync(devPath)) return devPath
  if (existsSync(packagedPath)) return packagedPath

  return null
}

function loadWindowsModule(): WindowsAudioModule | null {
  if (!isWindows || windowsModule) return windowsModule

  const devPath = join(
    process.cwd(),
    'src',
    'native',
    'windows',
    'raven-windows-audio.win32-x64-msvc.node'
  )

  const packagedPath = join(
    process.resourcesPath,
    'raven-windows-audio.win32-x64-msvc.node'
  )

  try {
    windowsModule = require(devPath) as WindowsAudioModule
    log.info('Windows module loaded (dev)')
    return windowsModule
  } catch (err) {
    try {
      windowsModule = require(packagedPath) as WindowsAudioModule
      log.info('Windows module loaded (packaged)')
      return windowsModule
    } catch (err2) {
      log.error('Failed to load Windows module:', err2)
      return null
    }
  }
}

function runHelperSync(args: string[]): boolean {
  const binaryPath = getBinaryPath()
  if (!binaryPath) {
    log.error('audiocapture binary not found')
    return false
  }

  const result = spawnSync(binaryPath, args, {
    stdio: ['ignore', 'ignore', 'pipe']
  })

  if (result.stderr && result.stderr.length > 0) {
    log.error(`audiocapture stderr: ${result.stderr.toString()}`)
  }

  return result.status === 0
}

/**
 * Start native audio capture + AEC pipeline.
 * Called directly by AudioManager — no renderer round-trip needed.
 */
export function startCapture(): boolean {
  systemChunkCount = 0
  micChunkCount = 0
  aecBypassed = false
  initAec()
  if (isMac) return startMacCapture()
  if (isWindows) return startWindowsCapture()
  return false
}

/**
 * Stop native audio capture + tear down AEC pipeline.
 */
export function stopCapture(): boolean {
  stopHealthMonitor()
  destroyAec()
  if (isMac) return stopMacCapture()
  if (isWindows) return stopWindowsCapture()
  return false
}


function handleSystemChunk(audioData: Buffer): void {
  systemChunkCount++
  if (systemChunkCount <= 5 || systemChunkCount % 100 === 0) {
    log.debug(`System chunk #${systemChunkCount}, bytes: ${audioData.length}`)
  }

  pushSystemAudio(audioData)

  if (processedAudioCallback) {
    processedAudioCallback(audioData, 'system')
  }
}

function handleMicChunk(audioData: Buffer): void {
  micChunkCount++
  if (micChunkCount <= 5 || micChunkCount % 100 === 0) {
    log.debug(`Mic chunk #${micChunkCount}, bytes: ${audioData.length}`)
  }

  const cleanMicData = processAndPullMicAudio(audioData)

  if (processedAudioCallback) {
    processedAudioCallback(cleanMicData, 'mic')
  }
}

export function registerSystemAudioHandlers(): void {
  ipcMain.handle('system-audio:is-available', () => {
    if (isMac) return !!getBinaryPath()
    if (isWindows) return !!loadWindowsModule()?.isSystemAudioAvailable()
    return false
  })

  ipcMain.handle('system-audio:has-permission', () => {
    if (isMac) return systemPreferences.getMediaAccessStatus('screen') === 'granted'
    if (isWindows) return !!loadWindowsModule()?.hasPermission()
    return false
  })

  ipcMain.handle('system-audio:request-permission', () => {
    if (isMac) return systemPreferences.getMediaAccessStatus('screen') === 'granted'
    if (isWindows) return !!loadWindowsModule()?.requestPermission()
    return false
  })

  ipcMain.handle('system-audio:start', () => startCapture())
  ipcMain.handle('system-audio:stop', () => stopCapture())
}

function startMacCapture(): boolean {
  if (captureProcess) {
    log.warn('audiocapture already running')
    return true
  }

  const binaryPath = getBinaryPath()
  if (!binaryPath) {
    log.error('audiocapture binary not found')
    return false
  }

  captureProcess = spawn(binaryPath, [], {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  parseBuffer = Buffer.alloc(0)

  const MAX_PARSE_BUFFER = 10 * 1024 * 1024

  captureProcess.stdout.on('data', (data: Buffer) => {
    parseBuffer = Buffer.concat([parseBuffer, data])

    if (parseBuffer.length > MAX_PARSE_BUFFER) {
      log.error(`Audio parse buffer exceeded ${MAX_PARSE_BUFFER} bytes — resetting (possible frame corruption)`)
      parseBuffer = Buffer.alloc(0)
      return
    }

    while (parseBuffer.length >= 5) {
      const sourceByte = parseBuffer[0]
      const length = parseBuffer.readUInt32LE(1)

      if (parseBuffer.length < 5 + length) {
        break
      }

      const audioData = Buffer.from(parseBuffer.subarray(5, 5 + length))
      parseBuffer = parseBuffer.subarray(5 + length)

      if (sourceByte === 0x00) {
        handleSystemChunk(audioData)
      } else {
        handleMicChunk(audioData)
      }
    }
  })

  captureProcess.stderr.on('data', (data: Buffer) => {
    const message = data.toString().trim()
    if (message.length > 0) {
      log.error(`audiocapture: ${message}`)
    }
  })

  captureProcess.on('exit', (code, signal) => {
    log.warn(
      `audiocapture exited (code=${code}, signal=${signal})`
    )
    captureProcess = null
  })

  captureProcess.on('error', (err) => {
    log.error('audiocapture error:', err)
    captureProcess = null
  })

  return true
}

function stopMacCapture(): boolean {
  if (!captureProcess) return false
  captureProcess.kill('SIGTERM')
  captureProcess = null
  log.info(
    `Capture stopped. System: ${systemChunkCount}, Mic: ${micChunkCount}`
  )
  return true
}

function startWindowsCapture(): boolean {
  const mod = loadWindowsModule()
  if (!mod) return false

  const systemStarted = mod.startSystemAudioCapture((chunk) => {
    handleSystemChunk(chunk.data)
  })

  const micStarted = mod.startMicCapture((chunk) => {
    handleMicChunk(chunk.data)
  })

  log.info(`Windows capture started — system: ${systemStarted}, mic: ${micStarted}`)
  return systemStarted
}

function stopWindowsCapture(): boolean {
  const mod = loadWindowsModule()
  if (!mod) return false
  const systemStopped = mod.stopSystemAudioCapture()
  const micStopped = mod.stopMicCapture()
  log.info(
    `Windows capture stopped — system: ${systemStopped} (${systemChunkCount} chunks), mic: ${micStopped} (${micChunkCount} chunks)`
  )
  return systemStopped
}
