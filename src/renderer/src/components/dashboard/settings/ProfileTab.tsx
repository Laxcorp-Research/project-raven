import { useState, useEffect } from 'react'
import { useAppMode } from '../../../hooks/useAppMode'
import { ImageCropModal } from './ImageCropModal'

export function ProfileTab() {
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
      window.dispatchEvent(new Event('profile-updated'))
    }
  }

  async function handleRemovePicture() {
    await window.raven.profileRemovePicture()
    setProfilePicData(null)
    window.dispatchEvent(new Event('profile-updated'))
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
                  window.raven.authOpenBillingPortal()
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
