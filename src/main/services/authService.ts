/**
 * Authentication service for the premium Raven backend.
 * Manages JWT tokens, auto-refresh, and user session state.
 * When no backend is configured (open-source mode), all auth is skipped.
 */

import { safeStorage } from 'electron'
import { createLogger } from '../logger'
import { getSetting, saveSetting } from '../store'

const log = createLogger('Auth')

const TOKEN_STORE_KEY = 'auth_tokens'
const USER_STORE_KEY = 'auth_user'

interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AuthUser {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  plan: 'FREE' | 'PRO' | 'TEAM'
  subscriptionStatus: string
}

let cachedTokens: AuthTokens | null = null
let cachedUser: AuthUser | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

function getBackendUrl(): string | null {
  const url = getSetting('backendUrl') as string | undefined
  return url || process.env.RAVEN_BACKEND_URL || null
}

function storeTokensSecurely(tokens: AuthTokens): void {
  try {
    const json = JSON.stringify(tokens)
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(json)
      saveSetting(TOKEN_STORE_KEY, encrypted.toString('base64'))
    } else {
      saveSetting(TOKEN_STORE_KEY, json)
    }
    cachedTokens = tokens
  } catch (err) {
    log.error('Failed to store tokens:', err)
  }
}

function loadStoredTokens(): AuthTokens | null {
  if (cachedTokens) return cachedTokens

  try {
    const stored = getSetting(TOKEN_STORE_KEY) as string | undefined
    if (!stored) return null

    let json: string
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(stored, 'base64')
        json = safeStorage.decryptString(buffer)
      } catch {
        json = stored
      }
    } else {
      json = stored
    }

    cachedTokens = JSON.parse(json)
    return cachedTokens
  } catch {
    return null
  }
}

function clearAuth(): void {
  cachedTokens = null
  cachedUser = null
  saveSetting(TOKEN_STORE_KEY, '')
  saveSetting(USER_STORE_KEY, '')
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const backendUrl = getBackendUrl()
  if (!backendUrl) throw new Error('Backend not configured')

  const tokens = loadStoredTokens()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (tokens?.accessToken) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`
  }

  const response = await fetch(`${backendUrl}${path}`, {
    ...options,
    headers,
  })

  if (response.status === 401 && tokens?.refreshToken) {
    // Try refreshing the token
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      headers['Authorization'] = `Bearer ${cachedTokens!.accessToken}`
      const retryResponse = await fetch(`${backendUrl}${path}`, {
        ...options,
        headers,
      })
      if (!retryResponse.ok) {
        const err = await retryResponse.json().catch(() => ({ error: 'Request failed' }))
        throw new Error((err as { error?: string }).error || `HTTP ${retryResponse.status}`)
      }
      return retryResponse.json() as Promise<T>
    }
    clearAuth()
    throw new Error('Session expired')
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error((err as { error?: string }).error || `HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}

async function refreshAccessToken(): Promise<boolean> {
  const tokens = loadStoredTokens()
  if (!tokens?.refreshToken) return false

  const backendUrl = getBackendUrl()
  if (!backendUrl) return false

  try {
    const response = await fetch(`${backendUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    })

    if (!response.ok) return false

    const data = (await response.json()) as AuthTokens
    storeTokensSecurely(data)
    scheduleRefresh()
    return true
  } catch (err) {
    log.error('Token refresh failed:', err)
    return false
  }
}

function scheduleRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  // Refresh 1 minute before expiry (assuming 15min tokens)
  refreshTimer = setTimeout(
    () => {
      refreshAccessToken().catch(() => log.warn('Auto-refresh failed'))
    },
    13 * 60 * 1000
  ) // 13 minutes
}

// Public API

export function isBackendConfigured(): boolean {
  return !!getBackendUrl()
}

export function isAuthenticated(): boolean {
  return !!loadStoredTokens()?.accessToken
}

export function getCurrentUser(): AuthUser | null {
  return cachedUser
}

export async function signup(email: string, password: string, name?: string): Promise<AuthUser> {
  const data = await apiRequest<{
    user: { id: string; email: string; name: string | null }
    accessToken: string
    refreshToken: string
  }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  })

  storeTokensSecurely({ accessToken: data.accessToken, refreshToken: data.refreshToken })
  scheduleRefresh()

  const user = await fetchProfile()
  return user
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await apiRequest<{
    user: { id: string; email: string; name: string | null; avatarUrl: string | null }
    accessToken: string
    refreshToken: string
  }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

  storeTokensSecurely({ accessToken: data.accessToken, refreshToken: data.refreshToken })
  scheduleRefresh()

  const user = await fetchProfile()
  return user
}

export async function logout(): Promise<void> {
  const tokens = loadStoredTokens()
  if (tokens?.refreshToken) {
    try {
      await apiRequest('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      })
    } catch {
      // Best effort
    }
  }
  clearAuth()
}

export async function fetchProfile(): Promise<AuthUser> {
  const user = await apiRequest<AuthUser>('/api/auth/me')
  cachedUser = user
  saveSetting(USER_STORE_KEY, JSON.stringify(user))
  return user
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export async function deleteAccount(): Promise<void> {
  await apiRequest('/api/auth/me', { method: 'DELETE' })
  clearAuth()
}

export async function getSubscriptionStatus(): Promise<{
  plan: string
  status: string
  currentPeriodEnd: string | null
}> {
  return apiRequest('/api/billing/status')
}

export async function getCheckoutUrl(plan: 'PRO' | 'TEAM'): Promise<string> {
  const data = await apiRequest<{ url: string }>('/api/billing/create-checkout', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  })
  return data.url
}

export async function getPortalUrl(): Promise<string> {
  const data = await apiRequest<{ url: string }>('/api/billing/portal', {
    method: 'POST',
  })
  return data.url
}

export async function getManagedKeys(): Promise<{
  deepgram: string
  anthropic: string
  openai: string
} | null> {
  try {
    return await apiRequest('/api/proxy/keys')
  } catch {
    return null
  }
}

export function initAuth(): void {
  if (!isBackendConfigured()) {
    log.debug('No backend configured — running in open-source mode')
    return
  }

  const tokens = loadStoredTokens()
  if (tokens) {
    log.info('Restoring auth session')
    scheduleRefresh()
    fetchProfile().catch(() => log.warn('Failed to restore user profile'))
  }
}
