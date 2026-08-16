import tls from 'node:tls'
import { createLogger } from './logger'

const log = createLogger('TLS')

type CaStore = 'default' | 'system' | 'extra' | 'bundled'

type TlsCaApi = {
  getCACertificates?: (type?: CaStore) => string[]
  setDefaultCACertificates?: (certs: readonly string[]) => void
}

/**
 * Electron's Node/undici/`ws` stack uses the Mozilla CA bundle, not the
 * Windows/macOS system store. Chromium (and electron.net.fetch) trusts
 * the OS store. On some Windows machines that mismatch throws
 * "unable to verify the first certificate" for AssemblyAI + Deepgram
 * even though the browser can reach them — mic test and live STT die.
 *
 * Merge system CAs into Node's defaults. No-op if the Node build is
 * too old or the system store is empty.
 */
export function trustSystemCAs(tlsApi: TlsCaApi = tls): boolean {
  if (
    typeof tlsApi.getCACertificates !== 'function'
    || typeof tlsApi.setDefaultCACertificates !== 'function'
  ) {
    return false
  }

  try {
    const bundled = tlsApi.getCACertificates('default')
    let system: string[] = []
    try {
      system = tlsApi.getCACertificates('system')
    } catch (err) {
      log.warn('System CA store unavailable:', err)
      return false
    }
    if (system.length === 0) return false

    const seen = new Set<string>()
    const merged: string[] = []
    for (const cert of [...bundled, ...system]) {
      if (seen.has(cert)) continue
      seen.add(cert)
      merged.push(cert)
    }
    tlsApi.setDefaultCACertificates(merged)
    log.info(`Trusted system CAs (${system.length} system, ${merged.length} total)`)
    return true
  } catch (err) {
    log.warn('Could not trust system CAs:', err)
    return false
  }
}
