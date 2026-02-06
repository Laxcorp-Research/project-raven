/**
 * System audio capture via Swift helper (audiocapture).
 * Spawns a child process and streams PCM audio via stdout.
 */

import { BrowserWindow, ipcMain } from 'electron'
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

type AudioChunk = {
  data: Buffer
  sampleRate: number
  channels: number
  timestamp: number
}

let overlayWindow: BrowserWindow | null = null
let dashboardWindow: BrowserWindow | null = null
let chunkCount = 0
let captureProcess: ChildProcessWithoutNullStreams | null = null

const STREAM_SAMPLE_RATE = 16000
const STREAM_CHANNELS = 1

function getBinaryPath(): string | null {
  if (process.platform !== 'darwin') return null

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

function runHelperSync(args: string[]): boolean {
  const binaryPath = getBinaryPath()
  if (!binaryPath) {
    console.error('[SystemAudioNative] audiocapture binary not found')
    return false
  }

  const result = spawnSync(binaryPath, args, {
    stdio: ['ignore', 'ignore', 'pipe']
  })

  if (result.stderr && result.stderr.length > 0) {
    console.error(`[SystemAudioNative] audiocapture stderr: ${result.stderr.toString()}`)
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

function broadcastChunk(chunk: AudioChunk): void {
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
    console.error('[SystemAudioNative] Failed to send to overlay:', err)
  }

  try {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('system-audio:chunk', payload)
    }
  } catch (err) {
    console.error('[SystemAudioNative] Failed to send to dashboard:', err)
  }
}

export function registerSystemAudioHandlers(): void {
  ipcMain.handle('system-audio:is-available', () => {
    return !!getBinaryPath()
  })

  ipcMain.handle('system-audio:has-permission', () => {
    return runHelperSync(['--check'])
  })

  ipcMain.handle('system-audio:request-permission', () => {
    return runHelperSync(['--request'])
  })

  ipcMain.handle('system-audio:start', () => {
    if (captureProcess) {
      console.warn('[SystemAudioNative] audiocapture already running')
      return true
    }

    const binaryPath = getBinaryPath()
    if (!binaryPath) {
      console.error('[SystemAudioNative] audiocapture binary not found')
      return false
    }

    chunkCount = 0

    captureProcess = spawn(binaryPath, [], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    captureProcess.stdout.on('data', (data: Buffer) => {
      chunkCount++
      if (chunkCount <= 5 || chunkCount % 100 === 0) {
        console.log(
          `[SystemAudioNative] Chunk #${chunkCount}, bytes: ${data.length}`
        )
      }

      broadcastChunk({
        data,
        sampleRate: STREAM_SAMPLE_RATE,
        channels: STREAM_CHANNELS,
        timestamp: Date.now()
      })
    })

    captureProcess.stderr.on('data', (data: Buffer) => {
      const message = data.toString().trim()
      if (message.length > 0) {
        console.error(`[SystemAudioNative] audiocapture: ${message}`)
      }
    })

    captureProcess.on('exit', (code, signal) => {
      console.warn(
        `[SystemAudioNative] audiocapture exited (code=${code}, signal=${signal})`
      )
      captureProcess = null
    })

    captureProcess.on('error', (err) => {
      console.error('[SystemAudioNative] audiocapture error:', err)
      captureProcess = null
    })

    return true
  })

  ipcMain.handle('system-audio:stop', () => {
    if (!captureProcess) return false
    captureProcess.kill('SIGTERM')
    captureProcess = null
    console.log(`[SystemAudioNative] Capture stopped. Total chunks: ${chunkCount}`)
    return true
  })
}
