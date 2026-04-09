const METRIC_THRESHOLDS = {
  CLS: 0.1,
  FCP: 1800,
  FID: 100,
  INP: 200,
  LCP: 2500,
  TTFB: 800,
}

export const isPoorMetric = (metric) => {
  if (!metric || !metric.name) {
    return false
  }

  const threshold = METRIC_THRESHOLDS[metric.name]
  if (typeof threshold !== 'number') {
    return metric.rating === 'poor'
  }

  return metric.value > threshold || metric.rating === 'poor'
}

export const reportWebVitals = async (onPerfEntry = () => {}) => {
  if (typeof window === 'undefined') {
    return
  }

  const { onCLS, onFCP, onFID, onINP, onLCP, onTTFB } = await import('web-vitals')

  const reportMetric = (metric) => {
    onPerfEntry(metric)

    if (import.meta.env.DEV) {
      console.log('[Web Vitals]', metric.name, {
        value: metric.value,
        rating: metric.rating,
        id: metric.id,
      })

      if (isPoorMetric(metric)) {
        console.warn(
          `[Web Vitals] ${metric.name} is poor (${metric.value}). Investigate performance bottlenecks.`,
        )
      }
    }
  }

  onCLS(reportMetric)
  onFCP(reportMetric)
  onLCP(reportMetric)
  onTTFB(reportMetric)

  if (typeof onFID === 'function') {
    onFID(reportMetric)
  }

  if (typeof onINP === 'function') {
    onINP(reportMetric)
  }
}
