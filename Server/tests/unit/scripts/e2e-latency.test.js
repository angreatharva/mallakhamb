/**
 * The nightly e2e's request latency, read off the API's own histogram
 * (scripts/e2eLatency.js) and published by mallakhamb-e2e.
 */
const { parseHistogram, quantile, summarise } = require('../../../scripts/e2eLatency');

const series = (method, uri, buckets, sum) => [
  ...Object.entries(buckets).map(([le, c]) => `http_server_requests_seconds_bucket{method="${method}",uri="${uri}",status="200",le="${le}"} ${c}`),
  `http_server_requests_seconds_sum{method="${method}",uri="${uri}",status="200"} ${sum}`,
  `http_server_requests_seconds_count{method="${method}",uri="${uri}",status="200"} ${buckets['+Inf']}`,
].join('\n');

// 90 fast reads, 10 bcrypt logins at about half a second.
const METRICS = [
  '# HELP http_server_requests_seconds Duration of HTTP requests',
  '# TYPE http_server_requests_seconds histogram',
  series('GET', '/api/competitions', { 0.01: 40, 0.025: 80, 0.05: 90, 0.5: 90, 1: 90, '+Inf': 90 }, 1.2),
  series('POST', '/api/auth/login', { 0.01: 0, 0.025: 0, 0.05: 0, 0.5: 4, 1: 10, '+Inf': 10 }, 5.5),
  'nodejs_heap_size_used_bytes 123',
].join('\n');

describe('e2eLatency parseHistogram', () => {
  it('sums the buckets of every route into one histogram', () => {
    const h = parseHistogram(METRICS);
    expect(h.count).toBe(100);
    expect(h.sum).toBeCloseTo(6.7);
    expect(h.all.get(0.05)).toBe(90);
    expect(h.all.get(Infinity)).toBe(100);
    expect(h.routes.size).toBe(2);
  });

  it('folds the /api/v1 alias into /api', () => {
    const h = parseHistogram([
      series('GET', '/api/teams', { 0.1: 3, '+Inf': 3 }, 0.1),
      series('GET', '/api/v1/teams', { 0.1: 2, '+Inf': 2 }, 0.1),
    ].join('\n'));
    expect([...h.routes.keys()]).toEqual(['GET /api/teams']);
    expect(h.routes.get('GET /api/teams').get(Infinity)).toBe(5);
  });
});

describe('e2eLatency quantile', () => {
  const b = new Map([[0.01, 40], [0.025, 80], [0.05, 90], [0.5, 94], [1, 100], [Infinity, 100]]);

  it('interpolates inside the bucket, as histogram_quantile does', () => {
    expect(quantile(b, 0.5)).toBeCloseTo(0.01 + 0.015 * (10 / 40));
    expect(quantile(b, 0.95)).toBeCloseTo(0.5 + 0.5 * (1 / 6));
    expect(quantile(b, 0.99)).toBeCloseTo(0.5 + 0.5 * (5 / 6));
  });

  it('answers the highest finite bound when the quantile is in +Inf', () => {
    expect(quantile(new Map([[0.1, 1], [Infinity, 10]]), 0.9)).toBe(0.1);
  });

  it('is null for an empty histogram', () => {
    expect(quantile(new Map(), 0.5)).toBeNull();
    expect(quantile(new Map([[0.1, 0], [Infinity, 0]]), 0.5)).toBeNull();
  });
});

describe('e2eLatency summarise', () => {
  const report = summarise(parseHistogram(METRICS));

  it('reports the count, mean and the three quantiles', () => {
    expect(report.requests).toBe(100);
    expect(report.meanSeconds).toBeCloseTo(0.067);
    expect(Object.keys(report.quantiles)).toEqual(['0.5', '0.95', '0.99']);
    expect(report.quantiles['0.5']).toBeCloseTo(0.01 + 0.015 * (10 / 40), 5);
    expect(report.quantiles['0.99']).toBeGreaterThan(0.5);
  });

  it('gives the share under each fixed time', () => {
    expect(report.sharePctUnderSeconds['0.05']).toBe(90);
    expect(report.sharePctUnderSeconds['1']).toBe(100);
  });

  it('ranks the slowest routes by p95 and drops rarely called ones', () => {
    expect(report.slowestRoutes.map((r) => r.route)).toEqual(['POST /api/auth/login', 'GET /api/competitions']);
    expect(report.slowestRoutes[0].calls).toBe(10);
    const rare = summarise(parseHistogram(series('GET', '/api/rare', { 1: 2, '+Inf': 2 }, 1)));
    expect(rare.slowestRoutes).toEqual([]);
  });
});
