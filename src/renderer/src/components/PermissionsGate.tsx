import { useState, useEffect, useRef } from 'react'
import ravenFullLogo from '../../../../logo/raven_full.svg'
import { createLogger } from '../lib/logger'

const log = createLogger('PermissionsGate')

type PermissionState = 'unknown' | 'granted' | 'denied'

interface PermissionsGateProps {
  /** Called once all three permissions are granted so the parent can
   *  transition out of the gate (typically back to the dashboard). */
  onAllGranted: () => void
}

/**
 * Runtime permissions gate. Rendered when a user has already completed
 * onboarding but one or more required macOS permissions (microphone,
 * screen recording, accessibility) have been revoked in System Settings
 * since. Unlike the onboarding permission step, this view blocks the
 * rest of the app until everything is granted - no "skip for now".
 *
 * Polls status every 2s so the user can grant via System Settings in
 * another window and come straight back to this screen finding a
 * green checkmark, without having to relaunch Raven.
 */
const isWindows =
  typeof navigator !== 'undefined' && navigator.platform.includes('Win')

export function PermissionsGate({ onAllGranted }: PermissionsGateProps): JSX.Element {
  const [mic, setMic] = useState<PermissionState>('unknown')
  const [screen, setScreen] = useState<PermissionState>('unknown')
  const [accessibility, setAccessibility] = useState<PermissionState>('unknown')
  const [screenNeedsRestart, setScreenNeedsRestart] = useState(false)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasCompletedRef = useRef(false)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status = await window.raven.permissionsGetStatus()
        const m: PermissionState = status.microphone === 'granted' ? 'granted' : 'denied'
        const s: PermissionState = status.screen === 'granted' ? 'granted' : 'denied'
        const a: PermissionState = status.accessibility === 'granted' ? 'granted' : 'denied'
        setMic(m)
        setScreen(s)
        setAccessibility(a)
        if (m === 'granted' && s === 'granted' && a === 'granted' && !hasCompletedRef.current) {
          hasCompletedRef.current = true
          onAllGranted()
        }
      } catch (err) {
        log.warn('Permission status check failed:', err)
      }
    }
    fetchStatus()
    pollIntervalRef.current = setInterval(fetchStatus, 2000)
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [onAllGranted])

  const handleGrantMic = async () => {
    try {
      const granted = await window.raven.permissionsRequestMicrophone()
      if (granted) {
        setMic('granted')
      } else {
        await window.raven.permissionsOpenMicrophone()
      }
    } catch (err) {
      log.warn('Microphone grant failed:', err)
    }
  }

  const handleGrantScreen = async () => {
    try {
      const hasPerm = await window.raven.systemAudioHasPermission()
      if (hasPerm) {
        setScreen('granted')
        setScreenNeedsRestart(false)
        return
      }
      await window.raven.permissionsOpenScreenRecording()
      setScreenNeedsRestart(true)
    } catch (err) {
      log.warn('Screen grant failed:', err)
    }
  }

  const handleGrantAccessibility = async () => {
    try {
      const granted = await window.raven.permissionsRequestAccessibility()
      if (granted) {
        setAccessibility('granted')
      } else {
        await window.raven.permissionsOpenAccessibility()
      }
    } catch (err) {
      log.warn('Accessibility grant failed:', err)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <img src={ravenFullLogo} alt="Raven" className="h-6" />
        <span className="text-xs text-gray-400">Permissions needed</span>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-gray-900 mb-1">Grant permissions to continue</h1>
            <p className="text-sm text-gray-500">
              {isWindows
                ? 'Raven needs microphone access to capture your voice. Windows Settings may have turned it off for desktop apps.'
                : 'Raven needs these macOS permissions to capture audio and detect meetings. It looks like one or more have been revoked since you set Raven up.'}
            </p>
          </div>

          <div className="space-y-3">
            <PermissionRow
              title="Microphone"
              description="For capturing your voice"
              state={mic}
              onGrant={handleGrantMic}
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
              iconSvg={(
                <>
                  <path d="M12 3a4 4 0 0 0-4 4v4.5a4 4 0 1 0 8 0V7a4 4 0 0 0-4-4Z" />
                  <path d="M6.25 11.5a.75.75 0 0 1 .75.75 5 5 0 0 0 10 0 .75.75 0 0 1 1.5 0 6.5 6.5 0 0 1-5.75 6.46V21a.75.75 0 0 1-1.5 0v-2.29A6.5 6.5 0 0 1 5.5 12.25a.75.75 0 0 1 .75-.75Z" />
                </>
              )}
            />

            {!isWindows && (
            <>
            <PermissionRow
              title="Screen Recording"
              description="For capturing system audio and screenshots"
              state={screen}
              onGrant={handleGrantScreen}
              iconBg="bg-purple-100"
              iconColor="text-purple-600"
              strokeIcon
              iconSvg={(
                <>
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </>
              )}
            />

            {screenNeedsRestart && screen !== 'granted' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-amber-500">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                  <path d="M12 9v4" /><path d="M12 17h.01" />
                </svg>
                <div className="flex-1">
                  <p className="text-xs font-medium text-amber-800 mb-1">Restart required</p>
                  <p className="text-xs text-amber-700 leading-relaxed mb-2">
                    After enabling Screen Recording, macOS requires a restart for it to take effect.
                  </p>
                  <button
                    onClick={() => window.raven.relaunchApp()}
                    className="text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 px-3 py-1.5 rounded-md transition-colors"
                  >
                    Quit &amp; Reopen Raven
                  </button>
                </div>
              </div>
            )}

            <PermissionRow
              title="Accessibility"
              description="For keyboard shortcuts"
              state={accessibility}
              onGrant={handleGrantAccessibility}
              iconBg="bg-amber-100"
              iconColor="text-amber-600"
              strokeIcon
              iconSvg={(
                <>
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                </>
              )}
            />
            </>
            )}
          </div>

          <p className="text-xs text-gray-400 text-center">
            {isWindows
              ? 'This screen auto-closes once the microphone shows “Granted”. You can grant it in Windows Settings → Privacy & security → Microphone.'
              : 'This screen auto-closes the moment all three show “Granted”. You can grant them in System Settings → Privacy & Security.'}
          </p>
        </div>
      </div>
    </div>
  )
}

interface PermissionRowProps {
  title: string
  description: string
  state: PermissionState
  onGrant: () => void | Promise<void>
  iconBg: string
  iconColor: string
  iconSvg: JSX.Element
  /** When true the icon uses stroke instead of fill (lucide style). */
  strokeIcon?: boolean
}

function PermissionRow({ title, description, state, onGrant, iconBg, iconColor, iconSvg, strokeIcon }: PermissionRowProps): JSX.Element {
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center`}>
          <svg width="18" height="18" viewBox="0 0 24 24" className={iconColor} fill={strokeIcon ? 'none' : 'currentColor'} stroke={strokeIcon ? 'currentColor' : undefined} strokeWidth={strokeIcon ? 2 : undefined}>
            {iconSvg}
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{title}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      {state === 'granted' ? (
        <span className="text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-md">Granted</span>
      ) : (
        <button
          onClick={() => void onGrant()}
          className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-md hover:bg-blue-100 transition-colors"
        >
          Grant
        </button>
      )}
    </div>
  )
}
