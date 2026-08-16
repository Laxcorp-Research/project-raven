import { describe, expect, it, vi } from 'vitest'
import { trustSystemCAs } from '../trustSystemCAs'

describe('trustSystemCAs', () => {
  it('merges bundled + system CAs and installs them as Node defaults', () => {
    const setDefaultCACertificates = vi.fn()
    const applied = trustSystemCAs({
      getCACertificates: (type?: string) => {
        if (type === 'system') return ['SYSTEM_CERT']
        return ['BUNDLED_CERT']
      },
      setDefaultCACertificates,
    })

    expect(applied).toBe(true)
    expect(setDefaultCACertificates).toHaveBeenCalledWith(['BUNDLED_CERT', 'SYSTEM_CERT'])
  })

  it('does not replace defaults when the system store is empty', () => {
    const setDefaultCACertificates = vi.fn()
    const applied = trustSystemCAs({
      getCACertificates: () => [],
      setDefaultCACertificates,
    })

    expect(applied).toBe(false)
    expect(setDefaultCACertificates).not.toHaveBeenCalled()
  })

  it('returns false when Node has no CA APIs (does not throw)', () => {
    expect(trustSystemCAs({})).toBe(false)
  })

  it('returns false when reading the system store throws', () => {
    const setDefaultCACertificates = vi.fn()
    const applied = trustSystemCAs({
      getCACertificates: (type?: string) => {
        if (type === 'system') throw new Error('no store')
        return ['BUNDLED_CERT']
      },
      setDefaultCACertificates,
    })

    expect(applied).toBe(false)
    expect(setDefaultCACertificates).not.toHaveBeenCalled()
  })
})
