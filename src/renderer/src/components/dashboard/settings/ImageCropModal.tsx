import { useState, useEffect, useRef, useCallback } from 'react'

interface ImageCropModalProps {
  imageDataUrl: string
  onApply: (croppedDataUrl: string) => void
  onCancel: () => void
}

export function ImageCropModal({ imageDataUrl, onApply, onCancel }: ImageCropModalProps) {
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
