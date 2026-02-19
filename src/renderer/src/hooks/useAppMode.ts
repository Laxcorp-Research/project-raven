import { useState, useEffect } from 'react'

let cachedMode: 'free' | 'pro' | null = null
let pendingPromise: Promise<boolean> | null = null

export function useAppMode() {
  const [isPro, setIsPro] = useState(cachedMode === 'pro')
  const [isLoaded, setIsLoaded] = useState(cachedMode !== null)

  useEffect(() => {
    if (cachedMode !== null) return

    if (!pendingPromise) {
      pendingPromise = window.raven.planIsPro().catch(() => false)
    }

    let cancelled = false
    pendingPromise.then((pro) => {
      cachedMode = pro ? 'pro' : 'free'
      pendingPromise = null
      if (!cancelled) {
        setIsPro(pro)
        setIsLoaded(true)
      }
    })

    return () => { cancelled = true }
  }, [])

  return { isPro, isFree: !isPro, isLoaded }
}
