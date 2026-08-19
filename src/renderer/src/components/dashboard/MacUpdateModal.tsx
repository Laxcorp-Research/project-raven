import { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { detectMacPlatform } from '../../lib/shortcutLabels'
import { MAC_UPDATE_PROMPT_EVENT } from '../../lib/macUpdatePrompt'
import { shouldShowMacUpdateModal } from '../../../../shared/macManualUpdate'

interface UpdateState {
  status: string
  version?: string
  install?: 'auto' | 'mac-dmg'
  dmgUrl?: string
  forcePrompt?: boolean
}

export function MacUpdateModal({ isRecording }: { isRecording: boolean }) {
  const isMac = detectMacPlatform()
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })
  const [dismissedVersion, setDismissedVersion] = useState('')
  const [busy, setBusy] = useState(false)
  const [laterUntilNextCheck, setLaterUntilNextCheck] = useState(false)
  const [settingsPrompt, setSettingsPrompt] = useState(false)

  useEffect(() => {
    if (!isMac) return
    void window.raven.storeGet('macUpdateDismissedVersion').then((value) => {
      if (typeof value === 'string') setDismissedVersion(value)
    })
    void window.raven.updateGetState().then((state) => setUpdateState(state as UpdateState))
  }, [isMac])

  useEffect(() => {
    if (!isMac) return
    return window.raven.onUpdateStateChanged((state) => {
      const typed = state as UpdateState
      setUpdateState(typed)
      if (typed.status === 'checking') setLaterUntilNextCheck(false)
    })
  }, [isMac])

  useEffect(() => {
    if (!isMac) return
    const onSettingsPrompt = () => {
      setLaterUntilNextCheck(false)
      setSettingsPrompt(true)
    }
    window.addEventListener(MAC_UPDATE_PROMPT_EVENT, onSettingsPrompt)
    return () => window.removeEventListener(MAC_UPDATE_PROMPT_EVENT, onSettingsPrompt)
  }, [isMac])

  const open = shouldShowMacUpdateModal({
    isMac,
    isRecording,
    status: updateState.status,
    install: updateState.install,
    version: updateState.version,
    dismissedVersion,
    forcePrompt:
      settingsPrompt || (Boolean(updateState.forcePrompt) && !laterUntilNextCheck),
  })

  const handleLater = useCallback(async () => {
    const version = updateState.version
    if (!version) return
    setDismissedVersion(version)
    setSettingsPrompt(false)
    setLaterUntilNextCheck(true)
    await window.raven.storeSet('macUpdateDismissedVersion', version)
  }, [updateState.version])

  const handleDownload = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const result = await window.raven.updateDownload()
      if (!result?.success && updateState.dmgUrl) {
        await window.raven.openExternal(updateState.dmgUrl)
      }
    } finally {
      setBusy(false)
    }
  }, [busy, updateState.dmgUrl])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      void handleLater()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, handleLater])

  if (!open) return null

  const version = updateState.version ?? ''

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/25" />
      <div
        role="dialog"
        aria-labelledby="mac-update-title"
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-[440px] p-6"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
            <Download size={18} className="text-white" />
          </div>
          <div>
            <h2 id="mac-update-title" className="text-lg font-semibold text-gray-900 leading-snug">
              {version ? `Raven ${version} is ready` : 'An update is ready'}
            </h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              On Mac, install this update from a disk image. It takes about a minute — follow the
              three steps below so macOS lets Raven open.
            </p>
          </div>
        </div>

        <ol className="space-y-3 mb-6">
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold flex items-center justify-center">
              1
            </span>
            <p className="text-sm text-gray-700 leading-relaxed pt-0.5">
              Click <span className="font-medium text-gray-900">Download installer</span>. Your
              browser saves a <span className="font-medium">.dmg</span> file.
            </p>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold flex items-center justify-center">
              2
            </span>
            <p className="text-sm text-gray-700 leading-relaxed pt-0.5">
              Open the <span className="font-medium">.dmg</span> and drag{' '}
              <span className="font-medium text-gray-900">Raven</span> into{' '}
              <span className="font-medium text-gray-900">Applications</span>. Choose Replace if
              macOS asks.
            </p>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold flex items-center justify-center">
              3
            </span>
            <p className="text-sm text-gray-700 leading-relaxed pt-0.5">
              In Applications, <span className="font-medium text-gray-900">right-click Raven</span>
              {' '}and choose <span className="font-medium text-gray-900">Open</span>. If macOS says
              it is damaged, click <span className="font-medium">Cancel</span>, then right-click
              {' '}→ Open again. After that, double-click works as usual.
            </p>
          </li>
        </ol>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => void handleLater()}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={busy}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
          >
            {busy ? 'Opening download…' : 'Download installer'}
          </button>
        </div>
      </div>
    </div>
  )
}
