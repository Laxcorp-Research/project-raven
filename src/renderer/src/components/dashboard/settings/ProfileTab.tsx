import { useState, useEffect } from 'react'
import { ImageCropModal } from './ImageCropModal'

export function ProfileTab() {
  const [displayName, setDisplayName] = useState('')
  const [savedName, setSavedName] = useState('')
  const [profilePicData, setProfilePicData] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)

  useEffect(() => {
    void loadProfile()
  }, [])

  async function loadProfile() {
    const picPath = (await window.raven.storeGet('profilePicturePath')) as string
    if (picPath) {
      const data = await window.raven.profileGetPictureData(picPath)
      setProfilePicData(data)
    }
    const name = (await window.raven.storeGet('displayName')) as string
    setDisplayName(name || '')
    setSavedName(name || '')
  }

  async function handleSave() {
    setSaving(true)
    const trimmed = displayName.trim()
    await window.raven.storeSet('displayName', trimmed)
    setSavedName(trimmed)
    setSaving(false)
    setSaved(true)
    window.dispatchEvent(new Event('profile-updated'))
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

  return (
    <div className="space-y-8">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-1">Profile Picture</h4>
        <p className="text-sm text-gray-500 mb-4">
          Shown in the dashboard header and next to your messages in transcripts.
        </p>

        <div className="flex items-center gap-5">
          <div className="relative group">
            {profilePicData ? (
              <img
                src={profilePicData}
                alt="Profile"
                className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
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
