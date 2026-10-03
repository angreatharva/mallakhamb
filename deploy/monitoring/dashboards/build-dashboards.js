/**
 * Builds the four Grafana dashboards in this folder (deploy/monitoring/PLAN.md §3).
 *
 *   node deploy/monitoring/dashboards/build-dashboards.js
 *
 * This file is the source of truth; the *.json files are generated from it.
 * Import them as described in README.md.
 *
 * Usage gauges are "% of a limit" with bands at 70 / 80 / 90 %. The fixed
 * limits are hidden dashboard constants (LIMITS below): if the Render plan or
 * the pool size changes, change them here and re-import.
 */
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || __dirname;
const S = 'scrape_job="mallakhamb-api"';
const DS = { type: 'prometheus', uid: '${datasource}' };
const USAGE_DS = { type: 'prometheus', uid: '${usage_datasource}' };

const LIMITS = [
  // name, value, label
  ['cpu_limit', '0.1', 'CPU limit, cores (Render free plan)'],
  ['mem_limit', String(512 * 1024 * 1024), 'Memory limit, bytes (Render free plan, 512 MiB)'],
  ['pool_max', '100', 'MongoDB pool max (DB_POOL_MAX)'],
  ['atlas_conn_limit', '500', 'Atlas M0 connection cap'],
  ['sm_included', '100000', 'Synthetic check executions included per month (free tier)'],
];

/** Usage bands: 70 % yellow, 80 % orange, 90 % red. */
const PCT_STEPS = [
  { color: 'green', value: null }, { color: 'yellow', value: 70 },
  { color: 'orange', value: 80 }, { color: 'red', value: 90 },
];

const t = (expr, legendFormat = '', extra = {}) => ({ datasource: DS, expr, legendFormat, ...extra });
const instant = (expr) => t(expr, '', { instant: true, range: false, format: 'table' });

let id = 0;
const base = (type, title, targets, gridPos, extra = {}) => ({
  id: ++id, type, title, datasource: DS, gridPos,
  targets: targets.map((x, i) => ({ ...x, refId: String.fromCharCode(65 + i) })),
  ...extra,
});

const thresholds = (steps) => ({ mode: 'absolute', steps });
const green = { color: 'green', value: null };
const upMappings = [{ type: 'value', options: { 0: { text: 'DOWN', color: 'red' }, 1: { text: 'UP', color: 'green' } } }];
const upSteps = [{ color: 'red', value: null }, { color: 'green', value: 1 }];

function stat(title, targets, gridPos, { unit = 'short', steps = [green], mappings = [], description, decimals } = {}) {
  return base('stat', title, targets, gridPos, {
    description,
    fieldConfig: { defaults: { unit, decimals, mappings, thresholds: thresholds(steps), color: { mode: 'thresholds' } }, overrides: [] },
    options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'background', graphMode: 'area', textMode: 'auto', justifyMode: 'center' },
  });
}

/** `line`: a dashed red reference line at that value (e.g. the free-plan limit). */
function ts(title, targets, gridPos, { unit = 'short', line, description, min, softMax, stack = false, bars = false } = {}) {
  const steps = line === undefined ? [green] : [green, { color: 'red', value: line }];
  return base('timeseries', title, targets, gridPos, {
    description,
    fieldConfig: {
      defaults: {
        unit, min, softMax,
        thresholds: thresholds(steps),
        custom: {
          drawStyle: bars ? 'bars' : 'line', lineWidth: 1, fillOpacity: bars ? 80 : 10, showPoints: 'never', spanNulls: true,
          stacking: { mode: stack ? 'normal' : 'none', group: 'A' },
          thresholdsStyle: { mode: line === undefined ? 'off' : 'dashed' },
        },
      },
      overrides: [],
    },
    options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'multi', sort: 'desc' } },
  });
}

function table(title, targets, gridPos, { unit = 'short', valueName = 'Value', hide = [], description, decimals } = {}) {
  const excludeByName = { Time: true, __name__: true, job: true, scrape_job: true, instance: true };
  for (const h of hide) excludeByName[h] = true;
  return base('table', title, targets, gridPos, {
    description,
    fieldConfig: { defaults: { unit, decimals, custom: { align: 'auto' } }, overrides: [] },
    options: { showHeader: true, cellHeight: 'sm', sortBy: [{ displayName: valueName, desc: true }] },
    transformations: [{ id: 'organize', options: { excludeByName, renameByName: { Value: valueName } } }],
  });
}

/** A "% of limit" gauge with the 70 / 80 / 90 bands. */
function gauge(title, targets, gridPos, { description, ds = DS } = {}) {
  return base('gauge', title, targets.map((x) => ({ ...x, datasource: ds })), gridPos, {
    datasource: ds,
    description,
    fieldConfig: { defaults: { unit: 'percent', min: 0, max: 100, decimals: 0, thresholds: thresholds(PCT_STEPS), color: { mode: 'thresholds' } }, overrides: [] },
    options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, showThresholdMarkers: true, showThresholdLabels: false, orientation: 'auto' },
  });
}

/** A "% of limit" time series with dashed lines at 70 / 80 / 90. */
function pctTs(title, targets, gridPos, { description } = {}) {
  return base('timeseries', title, targets, gridPos, {
    description,
    fieldConfig: {
      defaults: {
        unit: 'percent', min: 0, softMax: 100, decimals: 1,
        thresholds: thresholds(PCT_STEPS),
        custom: {
          drawStyle: 'line', lineWidth: 1, fillOpacity: 10, showPoints: 'never', spanNulls: true,
          stacking: { mode: 'none', group: 'A' }, thresholdsStyle: { mode: 'dashed' },
        },
      },
      overrides: [],
    },
    options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'multi', sort: 'desc' } },
  });
}

const text = (title, content, gridPos) => ({ id: ++id, type: 'text', title, gridPos, options: { mode: 'markdown', content } });
const row = (title, y) => ({ id: ++id, type: 'row', title, collapsed: false, gridPos: { h: 1, w: 24, x: 0, y }, panels: [] });

function dashboard({ uid, title, description, panels, refresh = '1m', from = 'now-6h', tags = [] }) {
  return {
    uid, title, description, tags: ['mallakhamb', ...tags],
    timezone: 'browser', editable: true, graphTooltip: 1, schemaVersion: 39, version: 1,
    refresh, time: { from, to: 'now' },
    templating: {
      list: [
        {
          name: 'datasource', label: 'Data source', type: 'datasource', query: 'prometheus',
          current: { text: 'grafanacloud-sinceresloth366-prom', value: 'grafanacloud-prom' },
          regex: '', hide: 0, refresh: 1,
        },
        {
          // Grafana Cloud's own usage and plan limits (active series, check executions).
          name: 'usage_datasource', label: 'Usage data source', type: 'datasource', query: 'prometheus',
          current: { text: 'grafanacloud-usage', value: 'grafanacloud-usage' },
          regex: '/usage/', hide: 2, refresh: 1,
        },
        ...LIMITS.map(([name, value, label]) => ({
          name, label, type: 'constant', query: value, hide: 2,
          current: { text: value, value }, options: [{ text: value, value, selected: true }],
        })),
      ],
    },
    annotations: {
      list: [{
        name: 'API restarts (deploys)', enable: true, iconColor: 'orange', datasource: DS,
        expr: `changes(process_start_time_seconds{${S}}[2m]) > 0`, step: '60s', titleFormat: 'API restarted',
      }],
    },
    links: [{ title: 'Mallakhamb dashboards', type: 'dashboards', tags: ['mallakhamb'], asDropdown: true, includeVars: false, keepTime: true }],
    panels,
  };
}

const httpCount = (m = '') => `http_server_requests_seconds_count{${S}${m}}`;
const httpBucket = (m = '') => `http_server_requests_seconds_bucket{${S}${m}}`;
const p = (q, m = '', by = 'le', w = '5m') => `histogram_quantile(${q}, sum by (${by}) (rate(${httpBucket(m)}[${w}])))`;
const ratio5xx = `(sum(rate(${httpCount(',outcome="SERVER_ERROR"')}[5m])) or vector(0)) / clamp_min(sum(rate(${httpCount()}[5m])), 1e-9)`;

// Current usage as % of each limit.
const SM = 'job=~"api-ready|web-home"';
const PCT = {
  cpu: `100 * rate(process_cpu_seconds_total{${S}}[5m]) / $cpu_limit`,
  mem: `100 * process_resident_memory_bytes{${S}} / $mem_limit`,
  pool: `100 * mongodb_driver_pool_checkedout{${S}} / $pool_max`,
  atlas: `100 * mongodb_driver_pool_size{${S}} / $atlas_conn_limit`,
  // Both numbers come from Grafana Cloud's usage data source.
  series: '100 * sum(grafanacloud_instance_active_series) / sum(grafanacloud_org_metrics_included_series)',
  // probe_all_success_count goes up once per execution (probe_success is
  // re-published between runs, so counting its samples overstates). Rate over
  // 15 m, projected to a 30-day month: exact once a check is 15 m old. No job
  // filter: the allowance is shared by every check in the account.
  sm: '100 * sum(rate(probe_all_success_count[15m])) * 86400 * 30 / $sm_included',
};
const DESC = {
  cpu: 'Process CPU as a share of the plan allowance (cpu_limit, 0.1 core on Render free). Alert "CPU saturated" fires at 80 % for 15 m.',
  mem: 'Resident memory as a share of the plan limit (mem_limit, 512 MiB on Render free). Render restarts the process at 100 %. Alert "Memory near limit" fires at ~81 % (435 MB) for 10 m.',
  pool: 'MongoDB connections checked out as a share of DB_POOL_MAX (pool_max). Near 100 % means requests queue (alert "DB pool waiting").',
  atlas: 'Connections this API holds open as a share of the Atlas M0 cap (500). Other clients (scripts, Compass) count against the same cap.',
  series: 'Active series vs. the series included in the Grafana Cloud plan. Over 100 % is billed or dropped.',
  sm: 'Synthetic check executions per month at the current rate (last 15 m, projected to 30 days), for every check in the account, vs. the monthly allowance (sm_included). Planned for the two Mallakhamb checks: 60,480, about 60 %.',
};
const CAP_TITLES = {
  cpu: 'CPU % of plan', mem: 'Memory % of plan', pool: 'DB pool in use %', atlas: 'Atlas connections %',
  series: 'Grafana series % of included', sm: 'Synthetic executions % of included',
};
const capacityRow = (y, which) => {
  const panels = [row('Capacity: current usage as % of each limit (70 / 80 / 90 %)', y)];
  const w = 24 / which.length;
  which.forEach((k, i) => {
    panels.push(gauge(CAP_TITLES[k], [t(PCT[k])], { h: 6, w, x: i * w, y: y + 1 }, { description: DESC[k], ds: k === 'series' ? USAGE_DS : DS }));
  });
  return panels;
};

// ------------------------------------------------------------------ overview
id = 0;
const overview = dashboard({
  uid: 'mallakhamb-api-overview',
  title: 'Mallakhamb API overview',
  description: 'Is the API up, how busy, how fast, how many errors. deploy/monitoring/PLAN.md §3.1',
  tags: ['api'],
  panels: [
    stat('Up', [t(`up{${S}}`)], { h: 4, w: 4, x: 0, y: 0 }, {
      steps: upSteps, mappings: upMappings,
      description: 'Grafana Cloud scraped /metrics successfully on the last attempt.',
    }),
    stat('Requests/s', [t(`sum(rate(${httpCount()}[5m])) or vector(0)`)], { h: 4, w: 4, x: 4, y: 0 }, { unit: 'reqps', decimals: 2 }),
    stat('5xx ratio (5m)', [t(ratio5xx)], { h: 4, w: 4, x: 8, y: 0 }, {
      unit: 'percentunit', decimals: 2,
      steps: [green, { color: 'orange', value: 0.005 }, { color: 'red', value: 0.02 }],
      description: 'Alert "High 5xx" fires above 2 % for 10 m (with at least 0.05 req/s).',
    }),
    stat('p95 latency (5m)', [t(p(0.95))], { h: 4, w: 4, x: 12, y: 0 }, {
      unit: 's', decimals: 3, steps: [green, { color: 'orange', value: 0.75 }, { color: 'red', value: 1.5 }],
      description: 'Alert "Slow API" fires above 1.5 s for 10 m.',
    }),
    stat('Restarts (24h)', [t(`changes(process_start_time_seconds{${S}}[24h])`)], { h: 4, w: 4, x: 16, y: 0 }, {
      steps: [green, { color: 'orange', value: 2 }, { color: 'red', value: 4 }],
      description: 'Every deploy is one restart. Several without a deploy = crash or out-of-memory (512 MB).',
    }),
    table('Version', [instant(`app_info{${S}}`)], { h: 4, w: 4, x: 20, y: 0 }, { hide: ['Value'] }),

    ts('Requests/s by outcome', [t(`sum by (outcome) (rate(${httpCount()}[5m]))`, '{{outcome}}')], { h: 8, w: 12, x: 0, y: 4 }, { unit: 'reqps', stack: true }),
    ts('Latency p50 / p95 / p99', [t(p(0.5), 'p50'), t(p(0.95), 'p95'), t(p(0.99), 'p99')], { h: 8, w: 12, x: 12, y: 4 }, {
      unit: 's', line: 1.5, description: 'Dashed line: the "Slow API" alert threshold on p95.',
    }),

    ts('5xx ratio', [t(ratio5xx, '5xx / all')], { h: 8, w: 12, x: 0, y: 12 }, { unit: 'percentunit', line: 0.02, min: 0, softMax: 0.05 }),
    ts('4xx by status', [t(`sum by (status) (rate(${httpCount(',outcome="CLIENT_ERROR"')}[5m]))`, '{{status}}')], { h: 8, w: 12, x: 12, y: 12 }, {
      unit: 'reqps', stack: true,
      description: '401s at a venue: judges signing in. A burst of 403s on writes: CSRF.',
    }),

    table('Slowest routes (p95, 15m)', [instant(`topk(10, ${p(0.95, '', 'le, method, uri', '15m')} > 0)`)], { h: 9, w: 8, x: 0, y: 20 }, { unit: 's', valueName: 'p95', decimals: 3 }),
    table('Busiest routes (req/s, 15m)', [instant(`topk(10, sum by (method, uri) (rate(${httpCount()}[15m])) > 0)`)], { h: 9, w: 8, x: 8, y: 20 }, { unit: 'reqps', valueName: 'req/s', decimals: 3 }),
    table('Errors by route (15m)', [instant(`topk(15, sum by (method, uri, status) (increase(${httpCount(',outcome=~"CLIENT_ERROR|SERVER_ERROR"')}[15m])) > 0)`)], { h: 9, w: 8, x: 16, y: 20 }, {
      valueName: 'count', decimals: 0, description: 'First look for "High 5xx": one route = a recent commit; every route = the database.',
    }),

    ...capacityRow(29, ['cpu', 'mem', 'pool', 'atlas', 'series', 'sm']),

    row('Outside-in: Synthetic Monitoring from Mumbai and Hyderabad (PLAN.md Phase 5)', 36),
    stat('API reachable (1h)', [t('100 * avg(avg_over_time(probe_success{job="api-ready"}[1h]))')], { h: 4, w: 6, x: 0, y: 37 }, {
      unit: 'percent', decimals: 2, steps: [{ color: 'red', value: null }, { color: 'orange', value: 99 }, { color: 'green', value: 99.9 }],
      description: 'Share of api-ready checks (GET /api/health/ready) that passed in the last hour, across both probes.',
    }),
    stat('Web reachable (1h)', [t('100 * avg(avg_over_time(probe_success{job="web-home"}[1h]))')], { h: 4, w: 6, x: 6, y: 37 }, {
      unit: 'percent', decimals: 2, steps: [{ color: 'red', value: null }, { color: 'orange', value: 99 }, { color: 'green', value: 99.9 }],
      description: 'Share of web-home checks (GET the SPA) that passed in the last hour, across both probes.',
    }),
    ts('Check result by probe', [t(`probe_success{${SM}}`, '{{job}} / {{probe}}')], { h: 8, w: 12, x: 12, y: 37 }, {
      min: 0, description: '1 = passed, 0 = failed. Alert "Uptime check failing" fires when both probes fail one check for 5 m.',
    }),
    ts('Check duration by probe', [t(`probe_duration_seconds{${SM}}`, '{{job}} / {{probe}}')], { h: 4, w: 12, x: 0, y: 41 }, {
      unit: 's', min: 0, description: 'Full request time as a tablet in India would see it, with DNS, TLS and the Render proxy included.',
    }),
  ],
});

// ------------------------------------------------------------------ runtime
id = 0;
const runtime = dashboard({
  uid: 'mallakhamb-runtime',
  title: 'Mallakhamb Runtime (Node.js)',
  description: 'CPU, memory, event loop and GC against the Render free plan (0.1 CPU, 512 MB). Swap for jvm_* panels after the Spring Boot port. PLAN.md §3.2',
  tags: ['runtime'],
  panels: [
    stat('Uptime', [t(`time() - process_start_time_seconds{${S}}`)], { h: 4, w: 6, x: 0, y: 0 }, { unit: 's' }),
    gauge('CPU % of plan', [t(PCT.cpu)], { h: 4, w: 6, x: 6, y: 0 }, { description: DESC.cpu }),
    gauge('Memory % of plan', [t(PCT.mem)], { h: 4, w: 6, x: 12, y: 0 }, { description: DESC.mem }),
    stat('Event-loop lag p99', [t(`nodejs_eventloop_lag_p99_seconds{${S}}`)], { h: 4, w: 6, x: 18, y: 0 }, {
      unit: 's', decimals: 3, steps: [green, { color: 'orange', value: 0.1 }, { color: 'red', value: 0.2 }],
    }),

    pctTs('CPU: % of plan', [t(PCT.cpu, 'cpu')], { h: 8, w: 12, x: 0, y: 4 }, { description: `${DESC.cpu} Dashed lines: 70 / 80 / 90 %.` }),
    pctTs('Memory: % of plan', [t(PCT.mem, 'rss')], { h: 8, w: 12, x: 12, y: 4 }, { description: `${DESC.mem} Dashed lines: 70 / 80 / 90 %.` }),
    ts('Heap used / total', [t(`nodejs_heap_size_used_bytes{${S}}`, 'used'), t(`nodejs_heap_size_total_bytes{${S}}`, 'total')], { h: 8, w: 12, x: 0, y: 12 }, { unit: 'bytes', min: 0 }),
    ts('Event-loop lag', [
      t(`nodejs_eventloop_lag_p50_seconds{${S}}`, 'p50'), t(`nodejs_eventloop_lag_p90_seconds{${S}}`, 'p90'), t(`nodejs_eventloop_lag_p99_seconds{${S}}`, 'p99'),
    ], { h: 8, w: 12, x: 12, y: 12 }, { unit: 's', line: 0.2, min: 0, description: 'Dashed line: the "Event loop blocked" alert (p99 > 0.2 s for 5 m).' }),
    ts('GC time share', [t(`sum by (kind) (rate(nodejs_gc_duration_seconds_sum{${S}}[5m]))`, '{{kind}}')], { h: 8, w: 12, x: 0, y: 20 }, {
      unit: 'percentunit', stack: true, min: 0, description: 'Fraction of wall time spent in GC. Rising with RSS = memory pressure.',
    }),
    ts('Active handles / requests', [
      t(`sum(nodejs_active_handles_total{${S}})`, 'handles'), t(`sum(nodejs_active_requests_total{${S}})`, 'requests'),
    ], { h: 8, w: 12, x: 12, y: 20 }, { min: 0, description: 'Handles include sockets: tablets connected over Socket.IO show up here.' }),
  ],
});

// ------------------------------------------------------------------ database
id = 0;
const cmdNote = '(only with DB_MONITOR_COMMANDS=true)';
const database = dashboard({
  uid: 'mallakhamb-database',
  title: 'Mallakhamb Database (MongoDB)',
  description: 'Connection pool always; per-command timing only while DB_MONITOR_COMMANDS=true (it costs ~25% latency). PLAN.md §3.3',
  tags: ['database'],
  panels: [
    stat('Pool open', [t(`mongodb_driver_pool_size{${S}}`)], { h: 4, w: 4, x: 0, y: 0 }, {
      description: 'minPoolSize is per replica-set member: DB_POOL_MIN=10 × 3 Atlas members = 30 at idle.',
    }),
    gauge('DB pool in use %', [t(PCT.pool)], { h: 4, w: 5, x: 4, y: 0 }, { description: DESC.pool }),
    gauge('Atlas connections %', [t(PCT.atlas)], { h: 4, w: 5, x: 9, y: 0 }, { description: DESC.atlas }),
    stat('Waiting for a connection', [t(`mongodb_driver_pool_waitqueuesize{${S}}`)], { h: 4, w: 5, x: 14, y: 0 }, {
      steps: [green, { color: 'red', value: 1 }], description: 'Above 0 for 10 m fires "DB pool waiting".',
    }),
    stat('Checkout failures (1h)', [t(`sum(increase(mongodb_driver_pool_checkout_failed_total{${S}}[1h])) or vector(0)`)], { h: 4, w: 5, x: 19, y: 0 }, {
      decimals: 0, steps: [green, { color: 'red', value: 1 }],
    }),

    ts('Pool in use / open', [t(`mongodb_driver_pool_checkedout{${S}}`, 'in use'), t(`mongodb_driver_pool_size{${S}}`, 'open')], { h: 8, w: 12, x: 0, y: 4 }, { min: 0 }),
    ts('Wait queue', [t(`mongodb_driver_pool_waitqueuesize{${S}}`, 'waiting')], { h: 8, w: 6, x: 12, y: 4 }, { min: 0 }),
    ts('Checkout failures by reason (15m)', [t(`sum by (reason) (increase(mongodb_driver_pool_checkout_failed_total{${S}}[15m]))`, '{{reason}}')], { h: 8, w: 6, x: 18, y: 4 }, { min: 0, bars: true }),

    row('Per-command timing — diagnostic, off by default', 12),
    text('How to use these panels', [
      'These stay empty in normal running. Command monitoring makes the MongoDB driver deserialize every reply twice, which cost **~25 % latency** in the Phase 1 benchmark.',
      '',
      'To find a slow collection: Render → `mallakhamb-server` → Environment → `DB_MONITOR_COMMANDS=true` → save (redeploys). Read these panels for up to an hour, then set it back to `false`. **Never on a competition day.**',
    ].join('\n'), { h: 5, w: 24, x: 0, y: 13 }),
    table(`Command p95 by collection, 15m ${cmdNote}`, [instant(`topk(10, histogram_quantile(0.95, sum by (le, command, collection) (rate(mongodb_driver_commands_seconds_bucket{${S}}[15m]))) > 0)`)], { h: 9, w: 8, x: 0, y: 18 }, { unit: 's', valueName: 'p95', decimals: 3 }),
    ts(`Commands/s ${cmdNote}`, [t(`sum by (command) (rate(mongodb_driver_commands_seconds_count{${S}}[5m]))`, '{{command}}')], { h: 9, w: 8, x: 8, y: 18 }, { unit: 'ops', stack: true }),
    ts(`Failed commands ${cmdNote}`, [t(`sum by (command, collection) (rate(mongodb_driver_commands_seconds_count{${S},status="FAILED"}[5m]))`, '{{command}} {{collection}}')], { h: 9, w: 8, x: 16, y: 18 }, { unit: 'ops' }),
  ],
});

// ------------------------------------------------------------------ competition day
id = 0;
const scoreUri = 'uri=~".*/(scores/save|save-score)"';
const compDay = dashboard({
  uid: 'mallakhamb-competition-day',
  title: 'Mallakhamb Competition day',
  description: 'The screen to leave open during a meet: tablets, live scoring, logins, payments. PLAN.md §3.4',
  tags: ['competition'],
  refresh: '30s', from: 'now-3h',
  panels: [
    stat('API', [t(`up{${S}}`)], { h: 4, w: 4, x: 0, y: 0 }, { steps: upSteps, mappings: upMappings }),
    stat('Connected tablets', [t(`socketio_connected_clients{${S}}`)], { h: 4, w: 4, x: 4, y: 0 }, { description: 'Socket.IO connections (judges, scorers, admin screens).' }),
    stat('Live rooms', [t(`socketio_rooms{${S}}`)], { h: 4, w: 4, x: 8, y: 0 }, { description: 'Scoring and competition rooms in use, not counting each socket\'s own room.' }),
    stat('Scores/min (5m)', [t(`sum(rate(mallakhamb_scores_submitted_total{${S},outcome="accepted"}[5m])) * 60 or vector(0)`)], { h: 4, w: 4, x: 12, y: 0 }, { decimals: 1 }),
    stat('Score-submit p95', [t(p(0.95, `,method="POST",${scoreUri}`))], { h: 4, w: 4, x: 16, y: 0 }, {
      unit: 's', decimals: 3, steps: [green, { color: 'orange', value: 0.75 }, { color: 'red', value: 1.5 }],
    }),
    stat('Handler errors (15m)', [t(`sum(increase(socketio_event_errors_total{${S}}[15m])) or vector(0)`)], { h: 4, w: 4, x: 20, y: 0 }, {
      decimals: 0, steps: [green, { color: 'orange', value: 1 }, { color: 'red', value: 10 }],
    }),

    ts('Socket events/s by type', [t(`sum by (event) (rate(socketio_events_received_total{${S}}[1m]))`, '{{event}}')], { h: 8, w: 12, x: 0, y: 4 }, { unit: 'ops', stack: true }),
    ts('Socket handler p95 by event', [t(`histogram_quantile(0.95, sum by (le, event) (rate(socketio_event_handler_seconds_bucket{${S}}[5m])))`, '{{event}}')], { h: 8, w: 12, x: 12, y: 4 }, { unit: 's' }),

    ts('Scores/min by outcome', [t(`sum by (outcome) (rate(mallakhamb_scores_submitted_total{${S}}[5m])) * 60`, '{{outcome}}')], { h: 8, w: 12, x: 0, y: 12 }, {
      min: 0, description: 'Every score-sheet write: judge, admin, superadmin and public save-score. "rejected" = validation or a lock refused it.',
    }),
    ts('Score-submit latency', [t(p(0.5, `,method="POST",${scoreUri}`), 'p50'), t(p(0.95, `,method="POST",${scoreUri}`), 'p95')], { h: 8, w: 12, x: 12, y: 12 }, { unit: 's', line: 1.5 }),

    ts('Socket handler errors by event (5m)', [t(`sum by (event) (increase(socketio_event_errors_total{${S}}[5m]))`, '{{event}}')], { h: 8, w: 8, x: 0, y: 20 }, { min: 0, bars: true }),
    ts('Logins by role / outcome (15m)', [t(`sum by (role, outcome) (increase(mallakhamb_auth_logins_total{${S}}[15m]))`, '{{role}} {{outcome}}')], { h: 8, w: 8, x: 8, y: 20 }, {
      min: 0, description: 'A burst of judge failures at venue start is usually mistyping; one role failing steadily is worth a look.',
    }),
    ts('Payment webhooks (1h)', [t(`sum by (event, outcome) (increase(mallakhamb_payment_webhooks_total{${S}}[1h]))`, '{{event}} {{outcome}}')], { h: 8, w: 8, x: 16, y: 20 }, {
      min: 0, description: 'rejected_signature → RAZORPAY_WEBHOOK_SECRET mismatch; error → server logs.',
    }),

    ...capacityRow(28, ['cpu', 'mem', 'pool']),
  ],
});

const files = {
  'mallakhamb-api-overview.json': overview,
  'mallakhamb-runtime.json': runtime,
  'mallakhamb-database.json': database,
  'mallakhamb-competition-day.json': compDay,
};
fs.mkdirSync(OUT, { recursive: true });
for (const [name, d] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(d, null, 2) + '\n');
  console.log(name, d.panels.length, 'panels');
}
