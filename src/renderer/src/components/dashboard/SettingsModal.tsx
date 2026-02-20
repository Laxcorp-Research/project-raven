/**
 * Settings Modal
 * Multi-tab settings interface for dashboard
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppMode } from '../../hooks/useAppMode'
import { createLogger } from '../../lib/logger'

interface ImageCropModalProps {
  imageDataUrl: string
  onApply: (croppedDataUrl: string) => void
  onCancel: () => void
}

function ImageCropModal({ imageDataUrl, onApply, onCancel }: ImageCropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const [initialZoom, setInitialZoom] = useState(1)

  const CROP_SIZE = 280

  const handleImageLoad = useCallback(() => {
    if (!imgRef.current) return
    const { naturalWidth, naturalHeight } = imgRef.current
    setImgNatural({ w: naturalWidth, h: naturalHeight })
    const minDim = Math.min(naturalWidth, naturalHeight)
    const fitZoom = CROP_SIZE / minDim
    setInitialZoom(fitZoom)
    setZoom(fitZoom)
    setOffset({ x: 0, y: 0 })
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging) return
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }, [dragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setDragging(false)
  }, [])

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragging, handleMouseMove, handleMouseUp])

  const handleReset = () => {
    setZoom(initialZoom)
    setOffset({ x: 0, y: 0 })
  }

  const handleApply = () => {
    if (!imgRef.current || imgNatural.w === 0) return
    const canvas = document.createElement('canvas')
    const outputSize = 512
    canvas.width = outputSize
    canvas.height = outputSize
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scaledW = imgNatural.w * zoom
    const scaledH = imgNatural.h * zoom
    const imgX = (CROP_SIZE - scaledW) / 2 + offset.x
    const imgY = (CROP_SIZE - scaledH) / 2 + offset.y

    const cropX = -imgX / zoom
    const cropY = -imgY / zoom
    const cropW = CROP_SIZE / zoom
    const cropH = CROP_SIZE / zoom

    ctx.drawImage(imgRef.current, cropX, cropY, cropW, cropH, 0, 0, outputSize, outputSize)
    onApply(canvas.toDataURL('image/png'))
  }

  const displayW = imgNatural.w * zoom
  const displayH = imgNatural.h * zoom

  const minZoom = initialZoom || 0.1
  const maxZoom = initialZoom * 4 || 5

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Edit Image</h3>
          <button
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5">
          <div
            ref={containerRef}
            className="relative mx-auto bg-gray-100 rounded-lg overflow-hidden select-none"
            style={{ width: CROP_SIZE + 80, height: CROP_SIZE + 80, cursor: dragging ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
          >
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <img
                ref={imgRef}
                src={imageDataUrl}
                alt=""
                className="pointer-events-none"
                style={{
                  width: displayW,
                  height: displayH,
                  transform: `translate(${offset.x}px, ${offset.y}px)`,
                  transformOrigin: 'center',
                  maxWidth: 'none',
                }}
                onLoad={handleImageLoad}
                draggable={false}
              />
            </div>

            {/* Darkened overlay outside crop area */}
            <div className="absolute inset-0 pointer-events-none">
              <div
                className="absolute bg-transparent"
                style={{
                  left: 40,
                  top: 40,
                  width: CROP_SIZE,
                  height: CROP_SIZE,
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
                  border: '1.5px dashed rgba(255,255,255,0.5)',
                }}
              />
            </div>
          </div>

          {/* Zoom slider */}
          <div className="flex items-center gap-3 mt-5 px-2">
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
            <input
              type="range"
              min={minZoom}
              max={maxZoom}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
          <button
            onClick={handleReset}
            className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            Reset
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const log = createLogger('Settings')

type SettingsTab = 'profile' | 'api-keys' | 'audio' | 'language' | 'hotkeys' | 'about'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const tabs: { id: SettingsTab; label: string; icon: JSX.Element }[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    id: 'api-keys',
    label: 'API Keys',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  {
    id: 'language',
    label: 'Language',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
      </svg>
    ),
  },
  {
    id: 'hotkeys',
    label: 'Hotkeys',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
  },
  {
    id: 'about',
    label: 'About',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
    ),
  },
]

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { isPro } = useAppMode()
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')

  const visibleTabs = isPro ? tabs.filter((t) => t.id !== 'api-keys') : tabs

  useEffect(() => {
    if (isOpen) {
      setActiveTab('profile')
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-xl shadow-2xl w-[95vw] max-w-[800px] h-[85vh] max-h-[600px] min-h-[400px] flex overflow-hidden border border-gray-200">
        <div className="w-48 min-w-[180px] bg-gray-50 border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          </div>

          <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className={activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-base font-semibold text-gray-900">
              {visibleTabs.find((tab) => tab.id === activeTab)?.label}
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'profile' && <ProfileTab />}
            {activeTab === 'api-keys' && <ApiKeysTab />}
            {activeTab === 'audio' && <AudioTab />}
            {activeTab === 'language' && <LanguageTab />}
            {activeTab === 'hotkeys' && <HotkeysTab />}
            {activeTab === 'about' && <AboutTab />}
          </div>
        </div>
      </div>
    </div>
  )
}

function ProfileTab() {
  const { isPro } = useAppMode()
  const [displayName, setDisplayName] = useState('')
  const [savedName, setSavedName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [profilePicData, setProfilePicData] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [resetLinkSent, setResetLinkSent] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [isPro])

  async function loadProfile() {
    try {
      const authUser = await window.raven.authGetCurrentUser()
      if (authUser) {
        const localName = (await window.raven.storeGet('displayName')) as string
        setDisplayName(localName || authUser.name || '')
        setSavedName(localName || authUser.name || '')
        setUserEmail(authUser.email || '')
        setAvatarUrl(authUser.avatarUrl || null)
        setIsAuthenticated(true)

        const picPath = (await window.raven.storeGet('profilePicturePath')) as string
        if (picPath) {
          const data = await window.raven.profileGetPictureData(picPath)
          setProfilePicData(data)
        }
        return
      }
    } catch { /* not in pro mode or not authenticated */ }

    const name = (await window.raven.storeGet('displayName')) as string
    const picPath = (await window.raven.storeGet('profilePicturePath')) as string
    setDisplayName(name || '')
    setSavedName(name || '')
    setIsAuthenticated(false)
    if (picPath) {
      const data = await window.raven.profileGetPictureData(picPath)
      setProfilePicData(data)
    }
  }

  async function handleSave() {
    setSaving(true)
    await window.raven.storeSet('displayName', displayName.trim())
    setSavedName(displayName.trim())
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleSelectPicture() {
    const rawData = await window.raven.profileSelectPictureRaw()
    if (rawData) {
      setCropImageSrc(rawData)
    }
  }

  async function handleCropApply(croppedDataUrl: string) {
    setCropImageSrc(null)
    const path = await window.raven.profileSavePictureData(croppedDataUrl)
    if (path) {
      const data = await window.raven.profileGetPictureData(path)
      setProfilePicData(data)
      setAvatarUrl(null)
    }
  }

  async function handleRemovePicture() {
    await window.raven.profileRemovePicture()
    setProfilePicData(null)
  }

  function getInitials(name: string): string {
    if (!name.trim()) return ''
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0][0].toUpperCase()
  }

  const hasChanges = displayName.trim() !== savedName
  const hasCustomPic = !!profilePicData
  const avatarSrc = profilePicData || avatarUrl

  return (
    <div className="space-y-8">
      {/* Profile Picture */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-1">Profile Picture</h4>
        <p className="text-sm text-gray-500 mb-4">
          Shown in the dashboard header and next to your messages in transcripts.
        </p>

        <div className="flex items-center gap-5">
          <div className="relative group">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt="Profile"
                className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xl font-semibold border-2 border-gray-200">
                {getInitials(displayName) || (
                  <svg className="w-8 h-8 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={handleSelectPicture}
              className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              {hasCustomPic ? 'Change Picture' : 'Upload Picture'}
            </button>
            {hasCustomPic && (
              <button
                onClick={handleRemovePicture}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Display Name */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Display Name</h4>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your name"
            className="flex-1 max-w-xs px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hasChanges) handleSave()
            }}
          />
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              hasChanges
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {/* Account Email (pro only) */}
      {isAuthenticated && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">Account Email</h4>
          <p className="text-sm text-gray-500 mb-3">
            Your email cannot be changed. Please contact support if you need assistance.
          </p>
          <div className="px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-700 max-w-xs">
            {userEmail}
          </div>
        </div>
      )}

      {/* Password & Security (pro only) */}
      {isAuthenticated && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">Password & Security</h4>
          <p className="text-sm text-gray-500 mb-3">Secure your account with a password</p>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 max-w-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">Account password</p>
              <p className="text-xs text-gray-500 mt-0.5">Set a password to access your account. Must be at least 8 characters.</p>
            </div>
            <button
              onClick={() => { setShowPasswordModal(true); setResetLinkSent(false) }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shrink-0 ml-4"
            >
              Update
            </button>
          </div>
        </div>
      )}

      {/* Delete Account (pro only) */}
      {isAuthenticated && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">Delete Account</h4>
          <p className="text-sm text-gray-500 mb-3">
            Delete your account and all associated data. This action cannot be undone.
          </p>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
          >
            Delete my account
          </button>
        </div>
      )}

      {/* Where profile is used */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Where your profile is used</h4>
        <ul className="text-sm text-gray-500 space-y-1.5">
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 bg-gray-400 rounded-full" />
            Dashboard header avatar
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 bg-gray-400 rounded-full" />
            Transcript speaker labels
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 bg-gray-400 rounded-full" />
            Session exports and copied text
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 bg-gray-400 rounded-full" />
            AI suggestions context
          </li>
        </ul>
      </div>

      {/* Update Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowPasswordModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Update password</h3>
            <p className="text-sm text-gray-500 mb-6">
              This will send a password reset link to your email address.
            </p>
            {resetLinkSent && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                Reset link sent to {userEmail}. Check your inbox.
              </div>
            )}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setResetLinkSent(true)}
                disabled={resetLinkSent}
                className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  resetLinkSent
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                {resetLinkSent ? 'Link sent' : 'Send reset link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete account</h3>
            <p className="text-sm text-gray-500 mb-2">
              This action cannot be undone. This will permanently delete your account and all of its data.
            </p>
            <p className="text-sm text-red-600 mb-6">
              Please first cancel your subscription to continue.
            </p>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  window.raven.openExternal('https://billing.stripe.com/p/login/test')
                  setShowDeleteModal(false)
                }}
                className="px-5 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Cancel your subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Crop Modal */}
      {cropImageSrc && (
        <ImageCropModal
          imageDataUrl={cropImageSrc}
          onApply={handleCropApply}
          onCancel={() => setCropImageSrc(null)}
        />
      )}
    </div>
  )
}

function ApiKeysTab() {
  const { isPro } = useAppMode()
  const [deepgramKey, setDeepgramKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [showOpenai, setShowOpenai] = useState(false)
  const [aiProvider, setAiProvider] = useState<'anthropic' | 'openai'>('anthropic')
  const [aiModel, setAiModel] = useState('claude-haiku-4-5')
  const [originalAiProvider, setOriginalAiProvider] = useState<'anthropic' | 'openai'>('anthropic')
  const [originalAiModel, setOriginalAiModel] = useState('claude-haiku-4-5')
  const [originalOpenaiKey, setOriginalOpenaiKey] = useState('')
  const [showDeepgram, setShowDeepgram] = useState(false)
  const [showAnthropic, setShowAnthropic] = useState(false)
  const [originalDeepgramKey, setOriginalDeepgramKey] = useState('')
  const [originalAnthropicKey, setOriginalAnthropicKey] = useState('')
  const [deepgramStatus, setDeepgramStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [anthropicStatus, setAnthropicStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const modelDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadKeys() {
      try {
        const dgKey = (await window.raven.storeGet('deepgramApiKey')) as string
        const anKey = (await window.raven.storeGet('anthropicApiKey')) as string
        if (dgKey) {
          setDeepgramKey(dgKey)
          setOriginalDeepgramKey(dgKey)
          setDeepgramStatus('valid')
        }
        if (anKey) {
          setAnthropicKey(anKey)
          setOriginalAnthropicKey(anKey)
          setAnthropicStatus('valid')
        }
        const oaiKey = (await window.raven.storeGet('openaiApiKey')) as string
        if (oaiKey) { setOpenaiKey(oaiKey); setOriginalOpenaiKey(oaiKey) }
        const prov = (await window.raven.storeGet('aiProvider')) as string
        if (prov === 'anthropic' || prov === 'openai') { setAiProvider(prov); setOriginalAiProvider(prov) }
        const mdl = (await window.raven.storeGet('aiModel')) as string
        if (mdl) { setAiModel(mdl); setOriginalAiModel(mdl) }
      } catch (error) {
        log.error('Failed to load API keys:', error)
      }
    }
    loadKeys()
  }, [])

  useEffect(() => {
    if (!modelDropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [modelDropdownOpen])

  const modelOptions = aiProvider === 'anthropic'
    ? [
        { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (recommended)' },
        { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (powerful)' },
        { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      ]
    : [
        { value: 'gpt-5-mini', label: 'GPT-5 Mini (recommended)' },
        { value: 'gpt-5.2', label: 'GPT-5.2 (powerful)' },
        { value: 'gpt-4o', label: 'GPT-4o' },
      ]

  const selectedModelLabel = modelOptions.find(m => m.value === aiModel)?.label || aiModel

  const hasChanges =
    deepgramKey.trim() !== originalDeepgramKey
    || anthropicKey.trim() !== originalAnthropicKey
    || openaiKey.trim() !== originalOpenaiKey
    || aiProvider !== originalAiProvider
    || aiModel !== originalAiModel
  const canSave = hasChanges

  const validateKeys = async (showSuccessMessage = true) => {
    if (!deepgramKey.trim()) {
      setSaveMessage({ type: 'error', text: 'Deepgram API key is required' })
      return false
    }

    if (aiProvider === 'anthropic' && !anthropicKey.trim()) {
      setSaveMessage({ type: 'error', text: 'Anthropic API key is required' })
      return false
    }

    if (aiProvider === 'openai' && !openaiKey.trim()) {
      setSaveMessage({ type: 'error', text: 'OpenAI API key is required' })
      return false
    }

    setDeepgramStatus('validating')
    if (aiProvider === 'anthropic') setAnthropicStatus('validating')
    setSaveMessage(null)

    try {
      const activeAiKey = aiProvider === 'openai' ? openaiKey.trim() : anthropicKey.trim()
      const result = await window.raven.validateKeys(deepgramKey.trim(), aiProvider, activeAiKey)

      if (result.valid) {
        setDeepgramStatus('valid')
        if (aiProvider === 'anthropic') setAnthropicStatus('valid')
        if (showSuccessMessage) setSaveMessage({ type: 'success', text: 'Connection verified successfully' })
        return true
      }

      if (result.error?.toLowerCase().includes('deepgram')) {
        setDeepgramStatus('invalid')
        setAnthropicStatus('idle')
      } else if (result.error?.toLowerCase().includes('anthropic') || result.error?.toLowerCase().includes('openai')) {
        setDeepgramStatus('idle')
        setAnthropicStatus('invalid')
      } else {
        setDeepgramStatus('invalid')
        setAnthropicStatus('invalid')
      }
      setSaveMessage({ type: 'error', text: result.error || 'Invalid API keys' })
      return false
    } catch {
      setDeepgramStatus('invalid')
      setAnthropicStatus('invalid')
      setSaveMessage({ type: 'error', text: 'Failed to validate connection' })
      return false
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveMessage(null)

    const isValid = await validateKeys(false)
    if (isValid) {
      try {
        await window.raven.apiKeysSave(deepgramKey.trim(), anthropicKey.trim())
        await window.raven.storeSet('openaiApiKey', openaiKey.trim())
        await window.raven.storeSet('aiProvider', aiProvider)
        await window.raven.storeSet('aiModel', aiModel)
        setSaveMessage({ type: 'success', text: 'Settings saved successfully' })
        setOriginalDeepgramKey(deepgramKey.trim())
        setOriginalAnthropicKey(anthropicKey.trim())
        setOriginalOpenaiKey(openaiKey.trim())
        setOriginalAiProvider(aiProvider)
        setOriginalAiModel(aiModel)
      } catch (error) {
        setSaveMessage({ type: 'error', text: 'Failed to save API keys' })
      }
    }

    setIsSaving(false)
  }

  const getStatusIcon = (status: 'idle' | 'validating' | 'valid' | 'invalid') => {
    switch (status) {
      case 'validating':
        return (
          <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )
      case 'valid':
        return (
          <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )
      case 'invalid':
        return (
          <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )
      default:
        return null
    }
  }

  if (isPro) {
    return (
      <div className="space-y-6 max-w-lg">
        <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 p-4">
          <h4 className="text-sm font-semibold text-blue-900 mb-1">Pro Mode Active</h4>
          <p className="text-sm text-blue-700">
            API keys are managed by your Ciara AI subscription. Use the Fast/Deep toggle on the overlay to switch between speed and quality.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-lg">
      <p className="text-sm text-gray-500">
        Configure your API keys for transcription and AI services. Keys are stored locally and encrypted.
      </p>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Deepgram API Key
          </label>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.raven.openExternal('https://console.deepgram.com/')
            }}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            Get API Key &rarr;
          </a>
        </div>
        <div className="relative">
          <input
            type={showDeepgram ? 'text' : 'password'}
            value={deepgramKey}
            onChange={(e) => {
              setDeepgramKey(e.target.value)
              setDeepgramStatus('idle')
              setSaveMessage(null)
            }}
            placeholder="Enter your Deepgram API key"
            className={`w-full px-3 py-2 pr-20 border rounded-lg text-sm transition-colors ${
              deepgramStatus === 'invalid'
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : deepgramStatus === 'valid'
                ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
            } focus:outline-none focus:ring-1`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {getStatusIcon(deepgramStatus)}
            <button
              type="button"
              onClick={() => setShowDeepgram(!showDeepgram)}
              className="text-gray-400 hover:text-gray-600"
            >
              {showDeepgram ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400">Used for real-time speech-to-text transcription</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Anthropic API Key
          </label>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.raven.openExternal('https://console.anthropic.com/')
            }}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            Get API Key &rarr;
          </a>
        </div>
        <div className="relative">
          <input
            type={showAnthropic ? 'text' : 'password'}
            value={anthropicKey}
            onChange={(e) => {
              setAnthropicKey(e.target.value)
              setAnthropicStatus('idle')
              setSaveMessage(null)
            }}
            placeholder="sk-ant-..."
            className={`w-full px-3 py-2 pr-20 border rounded-lg text-sm transition-colors ${
              anthropicStatus === 'invalid'
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : anthropicStatus === 'valid'
                ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
            } focus:outline-none focus:ring-1`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {getStatusIcon(anthropicStatus)}
            <button
              type="button"
              onClick={() => setShowAnthropic(!showAnthropic)}
              className="text-gray-400 hover:text-gray-600"
            >
              {showAnthropic ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400">Used for AI-powered meeting assistance (Claude)</p>
      </div>

      {/* OpenAI API Key */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            OpenAI API Key <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.raven.openExternal('https://platform.openai.com/api-keys')
            }}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            Get API Key &rarr;
          </a>
        </div>
        <div className="relative">
          <input
            type={showOpenai ? 'text' : 'password'}
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:border-blue-500 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => setShowOpenai(!showOpenai)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {showOpenai ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18" />
              ) : (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </>
              )}
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-400">Required only if using OpenAI as your AI provider</p>
      </div>

      {/* AI Provider Selection */}
      <div className="mt-6 pt-6 border-t border-gray-200 space-y-4">
        <h4 className="text-sm font-medium text-gray-900">AI Provider</h4>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setAiProvider('anthropic')
              setAiModel('claude-haiku-4-5')
              setSaveMessage(null)
            }}
            className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium text-left transition-colors ${
              aiProvider === 'anthropic'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <div className="font-medium">Anthropic</div>
            <div className="text-xs mt-0.5 opacity-70">Claude models</div>
          </button>
          <button
            onClick={() => {
              setAiProvider('openai')
              setAiModel('gpt-5-mini')
              setSaveMessage(null)
            }}
            className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium text-left transition-colors ${
              aiProvider === 'openai'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <div className="font-medium">OpenAI</div>
            <div className="text-xs mt-0.5 opacity-70">GPT models</div>
          </button>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-500">Model</label>
          <div className="relative" ref={modelDropdownRef}>
            <button
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-left hover:border-gray-400 transition-colors"
            >
              <span className="truncate">{selectedModelLabel}</span>
              <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {modelDropdownOpen && (
              <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                {modelOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setAiModel(opt.value); setModelDropdownOpen(false) }}
                    className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50 ${
                      opt.value === aiModel ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.value === aiModel && (
                      <svg className="w-4 h-4 text-blue-600 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {saveMessage && (
        <div className={`p-3 rounded-lg text-sm ${
          saveMessage.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {saveMessage.text}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={isSaving || !canSave}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? 'Validating...' : hasChanges ? 'Save & Validate' : 'Saved ✓'}
        </button>
        <button
          onClick={async () => {
            setIsTesting(true)
            await validateKeys()
            setIsTesting(false)
          }}
          disabled={isSaving || isTesting}
          className="px-4 py-2 text-gray-600 text-sm font-medium hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTesting ? 'Testing...' : 'Test Connection'}
        </button>
      </div>

      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 mt-6">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-gray-700">Your keys are secure</p>
            <p className="text-xs text-gray-500 mt-1">
              API keys are encrypted and stored locally on your device. They are never sent to our servers.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function AudioTab() {
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [selectedMic, setSelectedMic] = useState<string>('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [isTestingMic, setIsTestingMic] = useState(false)
  const [testTimeRemaining, setTestTimeRemaining] = useState(10)
  const [testTranscript, setTestTranscript] = useState('')
  const [captureSystemAudio, setCaptureSystemAudio] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const barsRef = useRef<HTMLDivElement[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const animationRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptUnsubscribeRef = useRef<(() => void) | null>(null)

  // Load microphones
  useEffect(() => {
    async function loadMicrophones() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
        const devices = await navigator.mediaDevices.enumerateDevices()
        const mics = devices.filter((d) => d.kind === 'audioinput')
        setMicrophones(mics)

        const savedMic = (await window.raven.storeGet('selectedMicrophone')) as string
        if (savedMic && mics.find((m) => m.deviceId === savedMic)) {
          setSelectedMic(savedMic)
        } else if (mics.length > 0) {
          setSelectedMic(mics[0].deviceId)
        }

        const systemAudio = (await window.raven.storeGet('captureSystemAudio')) as boolean
        if (systemAudio !== undefined) setCaptureSystemAudio(systemAudio)
      } catch (error) {
        log.error('Failed to load microphones:', error)
      }
    }
    void loadMicrophones()

    return () => {
      stopMicTest()
    }
  }, [])

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMicChange = async (deviceId: string) => {
    setSelectedMic(deviceId)
    setDropdownOpen(false)
    await window.raven.storeSet('selectedMicrophone', deviceId)

    if (isTestingMic) {
      stopMicTest()
      setTimeout(() => {
        void startMicTest(deviceId)
      }, 100)
    }
  }

  const handleSystemAudioToggle = async () => {
    const newValue = !captureSystemAudio
    setCaptureSystemAudio(newValue)
    await window.raven.storeSet('captureSystemAudio', newValue)
  }

  const startMicTest = async (deviceId?: string) => {
    const micId = deviceId || selectedMic
    if (!micId) return

    try {
      setIsTestingMic(true)
      setTestTimeRemaining(10)
      setTestTranscript('')

      // Start audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: micId } },
      })
      streamRef.current = stream

      // Set up audio analysis for visualization
      const audioContext = new AudioContext({ sampleRate: 16000 })
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.7
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser

      // Set up audio processing for transcription
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      source.connect(processor)
      processor.connect(audioContext.destination)

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        const int16Data = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const sample = Math.max(-1, Math.min(1, inputData[i]))
          int16Data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
        }
        void window.raven.sendTestAudio(int16Data.buffer)
      }

      processorRef.current = processor

      // Start visualization
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const barCount = 24

      const updateBars = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        const bandSize = Math.floor(dataArray.length / barCount)
        for (let i = 0; i < barCount; i++) {
          let sum = 0
          for (let j = 0; j < bandSize; j++) {
            sum += dataArray[i * bandSize + j]
          }
          const average = sum / bandSize
          const height = Math.min(100, (average / 255) * 150)
          if (barsRef.current[i]) {
            barsRef.current[i].style.height = `${Math.max(15, height)}%`
          }
        }
        animationRef.current = requestAnimationFrame(updateBars)
      }
      updateBars()

      // Start test transcription (doesn't create sessions)
      try {
        await window.raven.startTestTranscription(micId)
        transcriptUnsubscribeRef.current?.()
        transcriptUnsubscribeRef.current = window.raven.onTestTranscriptionUpdate((data) => {
          if (data.text && data.isFinal) {
            setTestTranscript((prev) => {
              const newText = prev ? `${prev} ${data.text}` : data.text
              return newText.trim()
            })
          }
        })
      } catch (err) {
        log.error('Failed to start test transcription:', err)
      }

      // Countdown timer
      timerRef.current = setInterval(() => {
        setTestTimeRemaining((prev) => {
          if (prev <= 1) {
            stopMicTest()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (error) {
      log.error('Failed to start mic test:', error)
      setIsTestingMic(false)
    }
  }

  const stopMicTest = () => {
    // Stop animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    // Reset bars
    barsRef.current.forEach((bar) => {
      if (bar) bar.style.height = '15%'
    })

    // Stop audio processor
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    // Stop audio context
    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
      analyserRef.current = null
    }

    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // Stop test transcription
    try {
      void window.raven.stopTestTranscription()
      transcriptUnsubscribeRef.current?.()
      transcriptUnsubscribeRef.current = null
    } catch (err) {
      log.error('Failed to stop test transcription:', err)
    }

    setIsTestingMic(false)
  }

  const getSelectedMicName = () => {
    const mic = microphones.find((m) => m.deviceId === selectedMic)
    if (!mic) return 'Select microphone'
    if (mic.deviceId === 'default') return mic.label || 'Default - System Microphone'
    return mic.label || 'Unknown Microphone'
  }

  return (
    <div className="space-y-6 max-w-xl">
      <p className="text-sm text-gray-500">
        Test your audio input and transcription before you hop into a call.
      </p>

      {/* Microphone Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Microphone source
        </label>
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-left hover:border-gray-400 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
            <span className="flex-1 truncate">{getSelectedMicName()}</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
              {microphones.map((mic) => (
                <button
                  key={mic.deviceId}
                  onClick={() => handleMicChange(mic.deviceId)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50 ${
                    mic.deviceId === selectedMic ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                  }`}
                >
                  <span className="truncate">
                    {mic.deviceId === 'default' ? (mic.label || 'Default - System Microphone') : mic.label || 'Unknown Microphone'}
                  </span>
                  {mic.deviceId === selectedMic && (
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mic Test Section */}
      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
        <div className="flex items-center gap-3">
          {!isTestingMic ? (
            <button
              onClick={() => {
                void startMicTest()
              }}
              className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
            >
              Test Microphone
            </button>
          ) : (
            <>
              <span className="px-4 py-2 bg-gray-200 text-gray-600 text-sm font-medium rounded-lg">
                Testing...
              </span>
              <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-1 rounded-md">
                {testTimeRemaining}s
              </span>
              {/* Waveform Bars */}
              <div className="flex-1 flex items-end gap-[3px] h-8 px-3 py-1 bg-white rounded-lg border border-gray-200">
                {[...Array(24)].map((_, i) => (
                  <div
                    key={i}
                    ref={(el) => {
                      if (el) barsRef.current[i] = el
                    }}
                    className="flex-1 min-w-[2px] bg-blue-500/80 rounded-sm transition-[height] duration-[60ms]"
                    style={{ height: '15%' }}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {isTestingMic && (
          <button
            onClick={stopMicTest}
            className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors"
          >
            Stop Test
          </button>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-3 min-h-[86px]">
          <p className="text-xs font-medium text-gray-600 mb-1">Live transcription preview</p>
          {testTranscript ? (
            <p className="text-sm text-gray-800 leading-relaxed">{testTranscript}</p>
          ) : (
            <p className="text-sm text-gray-400 italic">
              {isTestingMic ? 'Listening... say a sentence to preview transcription.' : 'Run a 10-second test to preview transcription output.'}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Capture meeting audio
            </label>
            <p className="text-xs text-gray-400 mt-0.5">
              Include system audio in normal recording sessions
            </p>
          </div>
          <button
            onClick={handleSystemAudioToggle}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              captureSystemAudio ? 'bg-blue-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                captureSystemAudio ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
      </div>

      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 mt-6">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-gray-700">Quick tip</p>
            <p className="text-xs text-gray-500 mt-1">
              For best transcript quality, use a dedicated mic and run this test before each important meeting.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function LanguageTab() {
  const [transcriptionLang, setTranscriptionLang] = useState('en')
  const [outputLang, setOutputLang] = useState('en')
  const [transcriptionDropdownOpen, setTranscriptionDropdownOpen] = useState(false)
  const [outputDropdownOpen, setOutputDropdownOpen] = useState(false)
  const transcriptionDropdownRef = useRef<HTMLDivElement>(null)
  const outputDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadSettings() {
      try {
        const tLang = (await window.raven.storeGet('transcriptionLanguage')) as string
        const oLang = (await window.raven.storeGet('outputLanguage')) as string
        if (tLang) setTranscriptionLang(tLang)
        if (oLang) setOutputLang(oLang)
      } catch (error) {
        log.error('Failed to load language settings:', error)
      }
    }
    loadSettings()
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (transcriptionDropdownRef.current && !transcriptionDropdownRef.current.contains(event.target as Node)) {
        setTranscriptionDropdownOpen(false)
      }
      if (outputDropdownRef.current && !outputDropdownRef.current.contains(event.target as Node)) {
        setOutputDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleTranscriptionLangChange = async (value: string) => {
    setTranscriptionLang(value)
    setTranscriptionDropdownOpen(false)
    await window.raven.storeSet('transcriptionLanguage', value)
  }

  const handleOutputLangChange = async (value: string) => {
    setOutputLang(value)
    setOutputDropdownOpen(false)
    await window.raven.storeSet('outputLanguage', value)
  }

  const transcriptionLanguages = [
    { value: 'en', label: 'English (recommended)' },
    { value: 'multi', label: 'Auto-detect language' },
    { value: 'hi', label: 'Hindi (हिन्दी)' },
    { value: 'es', label: 'Spanish (Español)' },
    { value: 'fr', label: 'French (Français)' },
    { value: 'de', label: 'German (Deutsch)' },
    { value: 'it', label: 'Italian (Italiano)' },
    { value: 'pt', label: 'Portuguese (Português)' },
    { value: 'ja', label: 'Japanese (日本語)' },
    { value: 'ko', label: 'Korean (한국어)' },
    { value: 'zh', label: 'Mandarin (普通话)' },
    { value: 'ar', label: 'Arabic (العربية)' },
    { value: 'bn', label: 'Bengali (বাংলা)' },
    { value: 'nl', label: 'Dutch (Nederlands)' },
    { value: 'pl', label: 'Polish (Polski)' },
    { value: 'ru', label: 'Russian (Русский)' },
    { value: 'ta', label: 'Tamil (தமிழ்)' },
    { value: 'th', label: 'Thai (ไทย)' },
    { value: 'tr', label: 'Turkish (Türkçe)' },
    { value: 'uk', label: 'Ukrainian (Українська)' },
    { value: 'vi', label: 'Vietnamese (Tiếng Việt)' },
  ]

  const outputLanguages = [
    { value: 'en', label: 'English (recommended)' },
    { value: 'auto', label: 'Auto-detect language' },
    { value: 'hi', label: 'Hindi (हिन्दी)' },
    { value: 'es', label: 'Spanish (Español)' },
    { value: 'fr', label: 'French (Français)' },
    { value: 'de', label: 'German (Deutsch)' },
    { value: 'it', label: 'Italian (Italiano)' },
    { value: 'pt', label: 'Portuguese (Português)' },
    { value: 'ja', label: 'Japanese (日本語)' },
    { value: 'ko', label: 'Korean (한국어)' },
    { value: 'zh', label: 'Mandarin (普通话)' },
  ]

  const getLanguageLabel = (languages: typeof transcriptionLanguages, value: string) => {
    return languages.find((l) => l.value === value)?.label || value
  }

  return (
    <div className="space-y-6 max-w-xl">
      <p className="text-sm text-gray-500">
        Select the languages for your meetings.
      </p>

      <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900">Transcription language</div>
            <div className="text-xs text-gray-500">The language you speak in meetings</div>
          </div>
        </div>

        <div className="relative" ref={transcriptionDropdownRef}>
          <button
            onClick={() => {
              setTranscriptionDropdownOpen(!transcriptionDropdownOpen)
              setOutputDropdownOpen(false)
            }}
            className="flex items-center justify-between gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-400 transition-colors min-w-[200px]"
          >
            <span className="truncate">{getLanguageLabel(transcriptionLanguages, transcriptionLang)}</span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${transcriptionDropdownOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {transcriptionDropdownOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
              {transcriptionLanguages.map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => handleTranscriptionLangChange(lang.value)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50 ${
                    lang.value === transcriptionLang ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                  }`}
                >
                  <span>{lang.label}</span>
                  {lang.value === transcriptionLang && (
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900">Output language</div>
            <div className="text-xs text-gray-500">Language for AI responses and meeting notes</div>
          </div>
        </div>

        <div className="relative" ref={outputDropdownRef}>
          <button
            onClick={() => {
              setOutputDropdownOpen(!outputDropdownOpen)
              setTranscriptionDropdownOpen(false)
            }}
            className="flex items-center justify-between gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-400 transition-colors min-w-[200px]"
          >
            <span className="truncate">{getLanguageLabel(outputLanguages as typeof transcriptionLanguages, outputLang)}</span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${outputDropdownOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {outputDropdownOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
              {outputLanguages.map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => handleOutputLangChange(lang.value)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50 ${
                    lang.value === outputLang ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                  }`}
                >
                  <span>{lang.label}</span>
                  {lang.value === outputLang && (
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
function HotkeysTab() {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const cmdKey = isMac ? '⌘' : 'Ctrl'

  const hotkeyGroups = [
    {
      title: 'General',
      shortcuts: [
        {
          action: 'Toggle visibility of Raven',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8V6a2 2 0 012-2h2M3 16v2a2 2 0 002 2h2m10-16h2a2 2 0 012 2v2m0 8v2a2 2 0 01-2 2h-2" />
            </svg>
          ),
          keys: [cmdKey, '\\'],
        },
        {
          action: 'Ask Raven for help',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          ),
          keys: [cmdKey, '↵'],
        },
        {
          action: 'Start or stop recording',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          ),
          keys: [cmdKey, 'R'],
        },
        {
          action: 'Clear current conversation',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          ),
          keys: [cmdKey, '⇧', 'R'],
        },
      ],
    },
    {
      title: 'Window',
      shortcuts: [
        {
          action: 'Move the window position up',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          ),
          keys: [cmdKey, '↑'],
        },
        {
          action: 'Move the window position down',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          ),
          keys: [cmdKey, '↓'],
        },
        {
          action: 'Move the window position left',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          ),
          keys: [cmdKey, '←'],
        },
        {
          action: 'Move the window position right',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          ),
          keys: [cmdKey, '→'],
        },
      ],
    },
    {
      title: 'Scroll',
      shortcuts: [
        {
          action: 'Scroll the response window up',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
            </svg>
          ),
          keys: [cmdKey, '⇧', '↑'],
        },
        {
          action: 'Scroll the response window down',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25" />
            </svg>
          ),
          keys: [cmdKey, '⇧', '↓'],
        },
      ],
    },
  ]

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Keyboard shortcuts</h3>
        <p className="text-sm text-gray-500 mt-1">
          Raven works with these easy to remember commands.
        </p>
      </div>

      {hotkeyGroups.map((group, groupIndex) => (
        <div key={groupIndex} className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-900">{group.title}</h4>
          <div className="space-y-1">
            {group.shortcuts.map((shortcut, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">{shortcut.icon}</span>
                  <span className="text-sm text-gray-700">{shortcut.action}</span>
                </div>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, keyIndex) => (
                    <kbd
                      key={keyIndex}
                      className="min-w-[28px] h-7 px-2 flex items-center justify-center text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-md shadow-sm"
                    >
                      {key}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AboutTab() {
  const [appVersion, setAppVersion] = useState('...')

  useEffect(() => {
    window.raven.getAppVersion().then((v) => setAppVersion(v)).catch(() => {})
  }, [])

  const handleOpenLink = (url: string) => {
    window.raven.openExternal?.(url)
  }

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.15),transparent_60%)]" />
        <div className="relative flex items-center gap-4">
          <img
            src={new URL('../../../../../logo/raven.svg', import.meta.url).href}
            alt="Raven"
            className="w-14 h-14 drop-shadow-lg"
            draggable={false}
          />
          <div>
            <h2 className="text-lg font-bold text-white">Raven</h2>
            <p className="text-sm text-white/50 mt-0.5">v{appVersion}</p>
          </div>
        </div>
        <p className="relative mt-4 text-sm text-white/60 leading-relaxed">
          Real-time transcription and AI suggestions for your meetings while being invisible to screen sharing.
        </p>
        <div className="relative mt-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/20">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
            MIT License
          </span>
        </div>
      </div>

      {/* Links - compact grid */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => handleOpenLink('https://github.com/Laxcorp-Research/project-raven')}
          className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-center"
        >
          <div className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
            <svg className="w-4.5 h-4.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </div>
          <div className="text-xs font-medium text-gray-700">GitHub</div>
        </button>

        <button
          onClick={() => handleOpenLink('https://github.com/Laxcorp-Research/project-raven/issues')}
          className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-center"
        >
          <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
            <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12h.01M12 16h.01M12 8h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-xs font-medium text-gray-700">Issues</div>
        </button>

        <button
          onClick={() => handleOpenLink('https://github.com/Laxcorp-Research/project-raven/discussions')}
          className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-center"
        >
          <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
            <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div className="text-xs font-medium text-gray-700">Discussions</div>
        </button>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          Made by{' '}
          <button
            onClick={() => handleOpenLink('https://laxcorpresearch.com')}
            className="text-blue-500 hover:text-blue-700 font-medium transition-colors"
          >
            Laxcorp Research
          </button>
          {' '}· Open source under MIT license
        </p>
      </div>
    </div>
  )
}
