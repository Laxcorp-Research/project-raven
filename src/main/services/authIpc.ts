/**
 * IPC handlers for authentication.
 * Bridges the renderer auth UI to the main process authService.
 */

import { ipcMain, shell } from 'electron'
import {
  isBackendConfigured,
  isAuthenticated,
  getCurrentUser,
  signup,
  login,
  logout,
  fetchProfile,
  changePassword,
  deleteAccount,
  getSubscriptionStatus,
  getCheckoutUrl,
  getPortalUrl,
  getManagedKeys,
  initAuth,
} from './authService'
import { createLogger } from '../logger'

const log = createLogger('AuthIPC')

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:is-backend-configured', () => isBackendConfigured())

  ipcMain.handle('auth:is-authenticated', () => isAuthenticated())

  ipcMain.handle('auth:get-current-user', () => getCurrentUser())

  ipcMain.handle('auth:signup', async (_event, email: string, password: string, name: string) => {
    try {
      const user = await signup(email, password, name)
      return { success: true, user }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signup failed'
      log.error('Signup failed:', message)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('auth:login', async (_event, email: string, password: string) => {
    try {
      const user = await login(email, password)
      return { success: true, user }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      log.error('Login failed:', message)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('auth:logout', async () => {
    await logout()
    return { success: true }
  })

  ipcMain.handle('auth:fetch-profile', async () => {
    try {
      const user = await fetchProfile()
      return { success: true, user }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch profile'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('auth:change-password', async (_event, currentPassword: string, newPassword: string) => {
    try {
      await changePassword(currentPassword, newPassword)
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change password'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('auth:delete-account', async () => {
    try {
      await deleteAccount()
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete account'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('auth:get-subscription', async () => {
    try {
      return await getSubscriptionStatus()
    } catch {
      return { plan: 'FREE', status: 'ACTIVE', currentPeriodEnd: null }
    }
  })

  ipcMain.handle('auth:open-checkout', async (_event, plan: 'PRO' | 'TEAM') => {
    try {
      const url = await getCheckoutUrl(plan)
      if (url) await shell.openExternal(url)
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open checkout'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('auth:open-billing-portal', async () => {
    try {
      const url = await getPortalUrl()
      if (url) await shell.openExternal(url)
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open billing portal'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('auth:get-managed-keys', async () => {
    return await getManagedKeys()
  })

  // Initialize auth on app startup
  initAuth()
}
