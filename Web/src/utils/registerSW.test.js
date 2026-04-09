import { beforeEach, describe, expect, it, vi } from 'vitest'

const workboxInstance = {
  addEventListener: vi.fn(),
  register: vi.fn(),
  messageSkipWaiting: vi.fn(),
}

const WorkboxMock = vi.fn().mockImplementation(function Workbox() {
  return workboxInstance
})

vi.mock('workbox-window', () => ({
  Workbox: WorkboxMock,
}))

describe('registerSW utility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers service worker successfully', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      writable: true,
      value: {
        getRegistrations: vi.fn().mockResolvedValue([]),
      },
    })

    const { registerServiceWorker } = await import('./registerSW')
    const wb = registerServiceWorker()

    expect(wb).toBeTruthy()
    expect(workboxInstance.register).toHaveBeenCalledTimes(1)
  })

  it('unregisters all service worker registrations', async () => {
    const unregisterMock = vi.fn().mockResolvedValue(true)

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      writable: true,
      value: {
        getRegistrations: vi.fn().mockResolvedValue([{ unregister: unregisterMock }]),
      },
    })

    const { unregisterServiceWorker } = await import('./registerSW')
    await unregisterServiceWorker()

    expect(unregisterMock).toHaveBeenCalledTimes(1)
  })
})
