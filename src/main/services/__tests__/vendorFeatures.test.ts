import { describe, it, expect, beforeEach } from 'vitest'

import {
  _resetVendorFeaturesForTesting,
  initializeVendorFeatures,
  reinitRecallFromStore,
  shutdownVendorFeatures,
} from '../vendorFeatures'

describe('vendorFeatures (Recall removed)', () => {
  beforeEach(() => {
    _resetVendorFeaturesForTesting()
  })

  it('initializeVendorFeatures is a no-op', async () => {
    await expect(initializeVendorFeatures()).resolves.toBeUndefined()
    await expect(initializeVendorFeatures()).resolves.toBeUndefined()
  })

  it('reinitRecallFromStore is a no-op even when called after a key save', async () => {
    await expect(reinitRecallFromStore()).resolves.toBeUndefined()
    await expect(reinitRecallFromStore()).resolves.toBeUndefined()
  })

  it('shutdownVendorFeatures is a no-op', async () => {
    await expect(shutdownVendorFeatures()).resolves.toBeUndefined()
  })
})
