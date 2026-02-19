import { type CSSProperties } from 'react'
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion'

export interface NotificationData {
  id: string
  title: string
  body: string
  type: 'info' | 'meeting' | 'warning'
  action?: { label: string; onClick: () => void }
  autoDismissMs?: number
}

interface OverlayNotificationProps {
  notification: NotificationData
  onDismiss: (id: string) => void
}

export function OverlayNotification({ notification, onDismiss }: OverlayNotificationProps) {
  const x = useMotionValue(0)
  const opacity = useTransform(x, [0, 150], [1, 0])

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x > 100) {
      onDismiss(notification.id)
    }
  }

  const typeColors = {
    info: 'border-blue-400/30',
    meeting: 'border-green-400/30',
    warning: 'border-yellow-400/30',
  }

  const typeIcons = {
    info: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
    ),
    meeting: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v-4zM5 8h8a2 2 0 012 2v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4a2 2 0 012-2z" />
      </svg>
    ),
    warning: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
      </svg>
    ),
  }

  return (
    <motion.div
      layout
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.01, right: 1 }}
      onDragEnd={handleDragEnd}
      style={{ x, opacity, WebkitAppRegion: 'no-drag' } as CSSProperties & { x: typeof x; opacity: typeof opacity }}
      className={`pointer-events-auto w-[320px] rounded-xl border ${typeColors[notification.type]} bg-[#18171C]/85 backdrop-blur-xl cursor-grab active:cursor-grabbing`}
    >
      <div className="p-3 flex items-start gap-3" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06), 0 4px 16px rgba(0,0,0,0.3)' }}>
        <div className="text-white/70 mt-0.5 shrink-0">
          {typeIcons[notification.type]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/90">{notification.title}</p>
          <p className="text-xs text-white/50 mt-0.5">{notification.body}</p>
          {notification.action && (
            <button
              onClick={notification.action.onClick}
              className="mt-2 px-3 py-1 text-xs font-medium rounded-md bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            >
              {notification.action.label}
            </button>
          )}
        </div>
        <button
          onClick={() => onDismiss(notification.id)}
          className="text-white/30 hover:text-white/60 transition-colors shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </motion.div>
  )
}
