/**
 * System audio capture via Swift helper (audiocapture).
 * Spawns a child process and streams PCM audio via stdout.
 */

import { BrowserWindow, ipcMain } from 'electron'
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'
import { createLogger } from './logger'

const log = createLogger('SystemAudio')

type AudioChunk = {
  data: Buffer
  sampleRate: number
  channels: number
  timestamp: number
}

let overlayWindow: BrowserWindow | null = null
let dashboardWindow: BrowserWindow | null = null
let systemChunkCount = 0
let micChunkCount = 0
let captureProcess: ChildProcessWithoutNullStreams | null = null
let windowsModule: WindowsAudioModule | null = null
let parseBuffer = Buffer.alloc(0)

const STREAM_SAMPLE_RATE = 16000
const STREAM_CHANNELS = 1
const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'
const require = createRequire(import.meta.url)

interface WindowsAudioModule {
  isSystemAudioAvailable: () => boolean
  hasPermission: () => boolean
  requestPermission: () => boolean
  isCapturing: () => boolean
  startSystemAudioCapture: (callback: (chunk: { data: Buffer; timestamp: number }) => void) => boolean
  stopSystemAudioCapture: () => boolean
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

export function setSystemAudioWindows(
  dashboard: BrowserWindow | null,
  overlay: BrowserWindow | null
): void {
  dashboardWindow = dashboard
  overlayWindow = overlay
}

function broadcastSystemChunk(chunk: AudioChunk): void {
  const payload = {
    data: chunk.data,
    sampleRate: chunk.sampleRate,
    channels: chunk.channels,
    timestamp: chunk.timestamp
  }

  try {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('system-audio:chunk', payload)
    }
  } catch (err) {
    log.error('Failed to send to overlay:', err)
  }

  try {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('system-audio:chunk', payload)
    }
  } catch (err) {
    log.error('Failed to send to dashboard:', err)
  }
}

function broadcastNativeMicChunk(chunk: AudioChunk): void {
  const payload = {
    data: chunk.data,
    sampleRate: chunk.sampleRate,
    channels: chunk.channels,
    timestamp: chunk.timestamp
  }

  try {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('native-mic:chunk', payload)
    }
  } catch (err) {
    log.error('Failed to send native mic to overlay:', err)
  }

  try {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('native-mic:chunk', payload)
    }
  } catch (err) {
    log.error('Failed to send native mic to dashboard:', err)
  }
}

export function registerSystemAudioHandlers(): void {
  ipcMain.handle('system-audio:is-available', () => {
    if (isMac) return !!getBinaryPath()
    if (isWindows) return !!loadWindowsModule()?.isSystemAudioAvailable()
    return false
  })

  ipcMain.handle('system-audio:has-permission', () => {
    if (isMac) return true
    if (isWindows) return !!loadWindowsModule()?.hasPermission()
    return false
  })

  ipcMain.handle('system-audio:request-permission', () => {
    if (isMac) return true
    if (isWindows) return !!loadWindowsModule()?.requestPermission()
    return false
  })

  ipcMain.handle('system-audio:start', () => {
    systemChunkCount = 0
    micChunkCount = 0
    if (isMac) return startMacCapture()
    if (isWindows) return startWindowsCapture()
    return false
  })

  ipcMain.handle('system-audio:stop', () => {
    if (isMac) return stopMacCapture()
    if (isWindows) return stopWindowsCapture()
    return false
  })
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

  captureProcess.stdout.on('data', (data: Buffer) => {
    parseBuffer = Buffer.concat([parseBuffer, data])

    while (parseBuffer.length >= 5) {
      const sourceByte = parseBuffer[0]
      const length = parseBuffer.readUInt32LE(1)

      if (parseBuffer.length < 5 + length) {
        break
      }

      const audioData = parseBuffer.subarray(5, 5 + length)
      parseBuffer = parseBuffer.subarray(5 + length)

      if (sourceByte === 0x00) {
        systemChunkCount++
        if (systemChunkCount <= 5 || systemChunkCount % 100 === 0) {
          log.debug(
            `System chunk #${systemChunkCount}, bytes: ${audioData.length}`
          )
        }

        broadcastSystemChunk({
          data: audioData,
          sampleRate: STREAM_SAMPLE_RATE,
          channels: STREAM_CHANNELS,
          timestamp: Date.now()
        })
      } else {
        micChunkCount++
        if (micChunkCount <= 5 || micChunkCount % 100 === 0) {
          log.debug(
            `Mic chunk #${micChunkCount}, bytes: ${audioData.length}`
          )
        }

        broadcastNativeMicChunk({
          data: audioData,
          sampleRate: STREAM_SAMPLE_RATE,
          channels: STREAM_CHANNELS,
          timestamp: Date.now()
        })
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

  return mod.startSystemAudioCapture((chunk) => {
    systemChunkCount++
    if (systemChunkCount <= 5 || systemChunkCount % 100 === 0) {
      log.debug(
        `Chunk #${systemChunkCount}, bytes: ${chunk.data.length}`
      )
    }

    broadcastSystemChunk({
      data: chunk.data,
      sampleRate: STREAM_SAMPLE_RATE,
      channels: STREAM_CHANNELS,
      timestamp: chunk.timestamp
    })
  })
}

function stopWindowsCapture(): boolean {
  const mod = loadWindowsModule()
  if (!mod) return false
  const stopped = mod.stopSystemAudioCapture()
  log.info(`Capture stopped. Total chunks: ${systemChunkCount}`)
  return stopped
}
