/**
 * The Prometheus registry (deploy/monitoring/PLAN.md §5).
 *
 * The label allow-list test is the important one: it is the guard against a
 * future change adding `userId`, `email` or `competitionId` as a label, which
 * would be both unbounded and personal.
 */

const { EventEmitter } = require('events');
const {
  createMetrics,
  noopMetrics,
  outcomeFor,
  ALLOWED_LABEL_NAMES,
} = require('../../../src/infrastructure/prometheus/registry');

/** value of a sample in the exposition JSON, matched on a subset of labels */
async function sample(metrics, name, labels = {}) {
  const all = await metrics.registry.getMetricsAsJSON();
  const metric = all.find((m) => m.name === name);
  if (!metric) return undefined;
  const hit = metric.values.find((v) =>
    Object.entries(labels).every(([k, val]) => v.labels[k] === val)
    && (v.metricName === undefined || v.metricName === name || v.metricName === `${name}_count`));
  return hit?.value;
}

/** Fire every instrument once, so every label set exists. */
function exerciseEverything(metrics) {
  metrics.http.observe('get', '/api/teams/:teamId', 200, 0.05);
  metrics.http.observe('post', '/api/judge/scores/save', '499', 1.2);

  const client = new EventEmitter();
  metrics.mongo.attach(client);
  client.emit('connectionCreated', {});
  client.emit('connectionCheckOutStarted', {});
  client.emit('connectionCheckedOut', {});
  client.emit('connectionCheckedIn', {});
  client.emit('connectionCheckOutFailed', { reason: 'timeout' });
  client.emit('commandStarted', { commandName: 'find', requestId: 1, command: { find: 'teams' } });
  client.emit('commandSucceeded', { commandName: 'find', requestId: 1, duration: 12 });

  metrics.socket.connected();
  metrics.socket.startEvent('score_update')(true);

  metrics.business.scoreSubmitted('accepted');
  metrics.business.login('judge', 'locked');
  metrics.business.paymentWebhook('payment.captured', 'processed');
  metrics.business.emailSent('resend', 'sent');
}

describe('createMetrics', () => {
  test('builds a fresh registry per call — two in one process do not collide', () => {
    expect(() => {
      createMetrics({ collectDefaults: true });
      createMetrics({ collectDefaults: true });
    }).not.toThrow();
  });

  test('every label name is on the allow-list', async () => {
    const metrics = createMetrics();
    exerciseEverything(metrics);

    const offending = [];
    for (const metric of await metrics.registry.getMetricsAsJSON()) {
      for (const value of metric.values) {
        for (const label of Object.keys(value.labels)) {
          if (!ALLOWED_LABEL_NAMES.has(label)) offending.push(`${metric.name}{${label}}`);
        }
      }
    }
    expect(offending).toEqual([]);
  });

  test('exposes the Micrometer-named HTTP histogram with outcome derived from status', async () => {
    const metrics = createMetrics({ collectDefaults: false });
    metrics.http.observe('get', '/api/x', 503, 0.2);
    metrics.http.observe('get', '/api/x', '499', 0.2);

    const text = await metrics.metrics();
    expect(text).toMatch(/http_server_requests_seconds_count\{method="GET",uri="\/api\/x",status="503",outcome="SERVER_ERROR"\} 1/);
    expect(text).toMatch(/http_server_requests_seconds_count\{method="GET",uri="\/api\/x",status="499",outcome="UNKNOWN"\} 1/);
  });

  test('app_info carries the short commit and service name', async () => {
    const metrics = createMetrics({
      collectDefaults: false,
      env: { RENDER_GIT_COMMIT: 'abcdef1234567890', RENDER_SERVICE_NAME: 'mallakhamb-server' },
    });
    expect(await sample(metrics, 'app_info', { version: 'abcdef1', service: 'mallakhamb-server' })).toBe(1);
  });
});

describe('business labels are forced through allow-lists', () => {
  test('an attacker-chosen webhook event never becomes a label value', async () => {
    const metrics = createMetrics({ collectDefaults: false });
    metrics.business.paymentWebhook('<script>user@example.com', 'processed');
    expect(await sample(metrics, 'mallakhamb_payment_webhooks_total', { event: 'other', outcome: 'processed' })).toBe(1);
    expect(await metrics.metrics()).not.toMatch(/example\.com/);
  });

  test('unknown roles and outcomes collapse to other', async () => {
    const metrics = createMetrics({ collectDefaults: false });
    metrics.business.login('wizard', 'maybe');
    expect(await sample(metrics, 'mallakhamb_auth_logins_total', { role: 'other', outcome: 'other' })).toBe(1);
  });
});

describe('mongo.attach', () => {
  test('counts pool state and command timings, keyed by collection', async () => {
    const metrics = createMetrics({ collectDefaults: false });
    const client = new EventEmitter();
    expect(metrics.mongo.attach(client)).toBe(true);

    client.emit('connectionCreated', {});
    client.emit('connectionCreated', {});
    client.emit('connectionCheckOutStarted', {});
    client.emit('connectionCheckedOut', {});
    client.emit('commandStarted', { commandName: 'aggregate', requestId: 7, command: { aggregate: 'competitions' } });
    client.emit('commandSucceeded', { commandName: 'aggregate', requestId: 7, duration: 30 });
    client.emit('commandStarted', { commandName: 'getMore', requestId: 8, command: { getMore: 1, collection: 'scores' } });
    client.emit('commandFailed', { commandName: 'getMore', requestId: 8, duration: 5 });

    expect(await sample(metrics, 'mongodb_driver_pool_size')).toBe(2);
    expect(await sample(metrics, 'mongodb_driver_pool_checkedout')).toBe(1);
    expect(await sample(metrics, 'mongodb_driver_pool_waitqueuesize')).toBe(0);

    const text = await metrics.metrics();
    expect(text).toMatch(/mongodb_driver_commands_seconds_count\{command="aggregate",collection="competitions",status="SUCCESS"\} 1/);
    expect(text).toMatch(/mongodb_driver_commands_seconds_count\{command="getMore",collection="scores",status="FAILED"\} 1/);
  });

  test('ignores handshake commands and buckets unknown ones as other', async () => {
    const metrics = createMetrics({ collectDefaults: false });
    const client = new EventEmitter();
    metrics.mongo.attach(client);

    client.emit('commandStarted', { commandName: 'hello', requestId: 1, command: { hello: 1 } });
    client.emit('commandSucceeded', { commandName: 'hello', requestId: 1, duration: 1 });
    client.emit('commandStarted', { commandName: 'listCollections', requestId: 2, command: { listCollections: 1 } });
    client.emit('commandSucceeded', { commandName: 'listCollections', requestId: 2, duration: 1 });

    const text = await metrics.metrics();
    expect(text).not.toMatch(/command="hello"/);
    expect(text).toMatch(/command="other",collection="none"/);
  });

  test('gauges never go negative and attaching twice is a no-op', async () => {
    const metrics = createMetrics({ collectDefaults: false });
    const client = new EventEmitter();
    metrics.mongo.attach(client);
    expect(metrics.mongo.attach(client)).toBe(false);

    client.emit('connectionClosed', {});
    client.emit('connectionCheckedIn', {});
    client.emit('connectionCreated', {});

    expect(await sample(metrics, 'mongodb_driver_pool_size')).toBe(1);
    expect(await sample(metrics, 'mongodb_driver_pool_checkedout')).toBe(0);
  });

  test('a checkout failure counts by reason and leaves the wait queue', async () => {
    const metrics = createMetrics({ collectDefaults: false });
    const client = new EventEmitter();
    metrics.mongo.attach(client);
    client.emit('connectionCheckOutStarted', {});
    client.emit('connectionCheckOutFailed', { reason: 'timeout' });

    expect(await sample(metrics, 'mongodb_driver_pool_checkout_failed_total', { reason: 'timeout' })).toBe(1);
    expect(await sample(metrics, 'mongodb_driver_pool_waitqueuesize')).toBe(0);
  });
});

describe('socket metrics', () => {
  test('startEvent counts the event, times it and counts a failure', async () => {
    const metrics = createMetrics({ collectDefaults: false });
    metrics.socket.startEvent('score_update')(false);
    metrics.socket.startEvent('score_update')(true);

    expect(await sample(metrics, 'socketio_events_received_total', { event: 'score_update' })).toBe(2);
    expect(await sample(metrics, 'socketio_event_errors_total', { event: 'score_update' })).toBe(1);
  });

  test('rooms are read from the source at scrape time, and a throwing source reads 0', async () => {
    const metrics = createMetrics({ collectDefaults: false });
    metrics.socket.setRoomsSource(() => 4);
    expect(await sample(metrics, 'socketio_rooms')).toBe(4);
    metrics.socket.setRoomsSource(() => { throw new Error('adapter gone'); });
    expect(await sample(metrics, 'socketio_rooms')).toBe(0);
  });
});

describe('outcomeFor', () => {
  test.each([
    [101, 'INFORMATIONAL'], [204, 'SUCCESS'], [304, 'REDIRECTION'],
    [404, 'CLIENT_ERROR'], [502, 'SERVER_ERROR'], [0, 'UNKNOWN'],
  ])('%i → %s', (status, outcome) => {
    expect(outcomeFor(status)).toBe(outcome);
  });
});

describe('noopMetrics', () => {
  test('has the same surface and does nothing', () => {
    expect(() => {
      noopMetrics.http.observe('GET', '/x', 200, 1);
      noopMetrics.mongo.attach(new EventEmitter());
      noopMetrics.socket.startEvent('x')(true);
      noopMetrics.business.login('admin', 'success');
    }).not.toThrow();
  });
});
