'use strict'

/**
 * Ad-hoc fallback only. Developer ID packs (CSC_LINK / CSC_NAME, or
 * keychain auto-discovery) are signed by electron-builder after this
 * hook — do not overwrite that with `codesign --sign -`.
 *
 * Unsigned packs (`identity=null` / CSC_IDENTITY_AUTO_DISCOVERY=false)
 * leave Electron's default adhoc signature (Identifier=Electron,
 * Info.plist not bound). TCC then shows a "Raven" row in Screen
 * Recording while getMediaAccessStatus('screen') stays denied. Re-sign
 * the .app adhoc with our bundle id so the plist is bound. Helpers are
 * left alone (no --deep).
 *
 * Windows afterPack is a no-op.
 */

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const BUNDLE_ID = 'com.laxcorpresearch.raven'

/**
 * True when electron-builder will not apply a Developer ID signature.
 * @param {NodeJS.ProcessEnv} [env]
 */
function shouldAdhocSignMacApp(env = process.env) {
  if (env.CSC_LINK || env.CSC_NAME) return false
  return env.CSC_IDENTITY_AUTO_DISCOVERY === 'false'
}

/**
 * @param {string} appPath
 * @param {{ execFileSync: typeof execFileSync, existsSync: (p: string) => boolean }} [deps]
 */
function adhocSignMacApp(appPath, deps) {
  const run = deps?.execFileSync ?? execFileSync
  const exists = deps?.existsSync ?? fs.existsSync
  if (!exists(appPath)) {
    throw new Error(`afterPack: Mac app not found at ${appPath}`)
  }
  run(
    'codesign',
    ['--force', '--sign', '-', '--identifier', BUNDLE_ID, appPath],
    { stdio: 'inherit' },
  )
}

/**
 * @param {{ electronPlatformName: string, appOutDir: string, packager: { appInfo: { productFilename: string } } }} context
 */
async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (!shouldAdhocSignMacApp()) return
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  )
  adhocSignMacApp(appPath)
}

module.exports = afterPack
module.exports._adhocSignMacApp = adhocSignMacApp
module.exports._shouldAdhocSignMacApp = shouldAdhocSignMacApp
module.exports._BUNDLE_ID = BUNDLE_ID
