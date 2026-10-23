const v8 = require('v8');
const HealthMonitor = require('../../../src/infrastructure/health-monitor');

describe('HealthMonitor.checkMemory', () => {
  afterEach(() => jest.restoreAllMocks());

  const mem = (heapUsedMB, heapTotalMB) => jest.spyOn(process, 'memoryUsage').mockReturnValue({
    heapUsed: heapUsedMB * 1024 * 1024,
    heapTotal: heapTotalMB * 1024 * 1024,
    rss: 120 * 1024 * 1024,
    external: 0
  });
  const limit = (mb) => jest.spyOn(v8, 'getHeapStatistics').mockReturnValue({ heap_size_limit: mb * 1024 * 1024 });

  it('stays healthy right after a restart, when heapUsed is most of a small heapTotal', () => {
    mem(46, 49);
    limit(2048);
    const result = new HealthMonitor({}).checkMemory();
    expect(result.heap).toEqual(expect.objectContaining({ used: 46, total: 49, limit: 2048, usagePercent: 2 }));
    expect(result.status).not.toBe('unhealthy');
  });

  it('goes unhealthy when the heap nears the V8 limit', () => {
    mem(1900, 1950);
    limit(2048);
    const result = new HealthMonitor({}).checkMemory();
    expect(result.heap.usagePercent).toBe(93);
    expect(result.status).toBe('unhealthy');
  });
});
