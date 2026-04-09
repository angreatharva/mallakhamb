import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isPoorMetric, reportWebVitals } from './webVitals'

const webVitalsMock = {
  onCLS: vi.fn(),
  onFCP: vi.fn(),
  onFID: vi.fn(),
  onINP: vi.fn(),
  onLCP: vi.fn(),
  onTTFB: vi.fn(),
}

vi.mock('web-vitals', () => webVitalsMock)

describe('webVitals utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('detects poor metrics by threshold or rating', () => {
    expect(isPoorMetric({ name: 'LCP', value: 3000, rating: 'needs-improvement' })).toBe(true)
    expect(isPoorMetric({ name: 'CLS', value: 0.05, rating: 'good' })).toBe(false)
    expect(isPoorMetric({ name: 'CUSTOM', value: 1, rating: 'poor' })).toBe(true)
  })

  it('registers web-vitals callbacks and reports received metrics', async () => {
    const onPerfEntry = vi.fn()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    webVitalsMock.onLCP.mockImplementation((cb) =>
      cb({ name: 'LCP', value: 3000, rating: 'poor', id: 'lcp-1' }),
    )
    webVitalsMock.onCLS.mockImplementation((cb) =>
      cb({ name: 'CLS', value: 0.02, rating: 'good', id: 'cls-1' }),
    )

    await reportWebVitals(onPerfEntry)

    expect(webVitalsMock.onCLS).toHaveBeenCalledTimes(1)
    expect(webVitalsMock.onFCP).toHaveBeenCalledTimes(1)
    expect(webVitalsMock.onFID).toHaveBeenCalledTimes(1)
    expect(webVitalsMock.onINP).toHaveBeenCalledTimes(1)
    expect(webVitalsMock.onLCP).toHaveBeenCalledTimes(1)
    expect(webVitalsMock.onTTFB).toHaveBeenCalledTimes(1)
    expect(onPerfEntry).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'LCP', id: 'lcp-1' }),
    )
    expect(onPerfEntry).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'CLS', id: 'cls-1' }),
    )
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
