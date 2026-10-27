/**
 * Builds the four Grafana dashboards in this folder (deploy/monitoring/PLAN.md §3).
 *
 *   node deploy/monitoring/dashboards/build-dashboards.js [outDir] [--platform=render|oci|oci-single|aws] [--staging]
 *
 * This file is the source of truth; the *.json files are generated from it.
 * Import them as described in README.md.
 *
 * --platform picks the limits preset (COMMON.md C1.7). The default, render, is
 * what production runs today and reproduces the committed *.json byte for byte.
 * The VM presets also add a Host row (Alloy, scrape_job="mallakhamb-host") to
 * the Runtime dashboard. --staging selects the mallakhamb-api-staging scrape job
 * and renames every uid/title to "… (OCI staging)", so an import can never
 * overwrite a production dashboard (COMMON.md C5.3).
 *
 * Usage gauges are "% of a limit" with bands at 70 / 80 / 90 %. The fixed
 * limits are hidden dashboard constants (LIMITS below): if the plan or the
 * pool size changes, change the preset here and re-import.
 */
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const flag = (name) => (args.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1];
const OUT = args.find((a) => !a.startsWith('--')) || __dirname;
const STAGING = args.includes('--staging');
const S = STAGING ? 'scrape_job="mallakhamb-api-staging"' : 'scrape_job="mallakhamb-api"';
const DS = { type: 'prometheus', uid: '${datasource}' };
const USAGE_DS = { type: 'prometheus', uid: '${usage_datasource}' };

const GIB = 1024 * 1024 * 1024;
// cpu: cores the Node process can use (one event loop = 1 core). mem: process RSS budget.
// host: the server is a VM with Alloy (Host row). standby: a warm standby is part of the platform.
// conn: the connection limit the API's pool is drawn against (db names it in titles and text).
const PRESETS = {
  render: { cpu: '0.1', mem: 512 * 1024 * 1024, plan: 'Render free plan', atlas: 'M0', host: false, standby: false },
  // 4 GB VMs since 2026-10-24 (IDLE-RECLAIM-PLAN.md D1). What else lives there: mongod (cache 0.75 GB,
  // ~1 GB resident), the OCR sidecar (MemoryMax 1G), the e2e mongod (700M) during a run, Caddy, Alloy.
  // That leaves the API about 1.5 GiB before the VM itself runs short.
  oci: {
    cpu: '1', mem: 1.5 * GIB, plan: 'OCI A1, 1 OCPU / 4 GB per VM', atlas: 'Flex', host: true, standby: true,
    // The self-hosted replica set: mongod takes far more, so the line is the "MongoDB connections high" alert (300 per member).
    conn: 300, db: 'MongoDB',
  },
  'oci-single': { cpu: '1', mem: 4 * GIB, plan: 'OCI A1 single VM, 2 OCPU / 12 GB', atlas: 'Flex', host: true, standby: false },
  // The AWS standby is optional (deploy/aws/PLAN.md); set standby: true if it is built.
  aws: { cpu: '1', mem: 1.5 * GIB, plan: 'AWS t4g.small, 2 vCPU / 2 GiB', atlas: 'Flex', host: true, standby: false },
};
const PLATFORM = flag('platform') || 'render';
const P = PRESETS[PLATFORM];
if (!P) throw new Error(`Unknown --platform=${PLATFORM}; use one of ${Object.keys(PRESETS).join(', ')}`);
const memText = `${P.mem / GIB >= 1 ? `${P.mem / GIB} GiB` : `${P.mem / 1024 / 1024} MiB`}`;

const LIMITS = [
  // name, value, label
  ['cpu_limit', P.cpu, P.host ? `CPU limit, cores (one Node event loop; ${P.plan})` : `CPU limit, cores (${P.plan})`],
  ['mem_limit', String(P.mem), P.host ? `Memory budget for the API process, bytes (${memText}; ${P.plan})` : `Memory limit, bytes (${P.plan}, ${memText})`],
  ['pool_max', '100', 'MongoDB pool max (DB_POOL_MAX)'],
  ['atlas_conn_limit', String(P.conn || 500), P.conn ? `${P.db} connections per member: the alert line` : `Atlas ${P.atlas} connection cap`],
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
// An allowance the plan fills on purpose (the two A1 VMs): only going past it is wrong.
const FULL_BY_DESIGN = [green, { color: 'red', value: 100.5 }];
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

function table(title, targets, gridPos, { unit = 'short', valueName = 'Value', hide = [], keep = [], description, decimals } = {}) {
  const excludeByName = { Time: true, __name__: true, job: true, scrape_job: true, instance: true };
  for (const h of hide) excludeByName[h] = true;
  for (const k of keep) delete excludeByName[k];
  return base('table', title, targets, gridPos, {
    description,
    fieldConfig: { defaults: { unit, decimals, custom: { align: 'auto' } }, overrides: [] },
    options: { showHeader: true, cellHeight: 'sm', sortBy: [{ displayName: valueName, desc: true }] },
    transformations: [{ id: 'organize', options: { excludeByName, renameByName: { Value: valueName } } }],
  });
}

/** A "% of limit" gauge with the 70 / 80 / 90 bands. */
function gauge(title, targets, gridPos, { description, ds = DS, steps = PCT_STEPS } = {}) {
  return base('gauge', title, targets.map((x) => ({ ...x, datasource: ds })), gridPos, {
    datasource: ds,
    description,
    fieldConfig: { defaults: { unit: 'percent', min: 0, max: 100, decimals: 0, thresholds: thresholds(steps), color: { mode: 'thresholds' } }, overrides: [] },
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

/**
 * `stable`: keep uid and title under --staging (the VM dashboard: the same
 * VMs become production at C7, only the API scrape job changes).
 * `variables` / `constants` are added after the shared ones.
 */
function dashboard({ uid, title, description, panels, refresh = '1m', from = 'now-6h', tags = [], stable = false, variables = [], constants = [] }) {
  if (STAGING && !stable) {
    // Kept in the Mallakhamb folder next to the Render set until the C7 cutover.
    uid = `${uid}-staging`;
    title = `${title} (${PLATFORM === 'render' ? '' : `${PLATFORM.toUpperCase()} `}staging)`;
    tags = [...tags, 'staging', PLATFORM];
  }
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
        ...variables,
        ...[...LIMITS, ...constants].map(([name, value, label]) => ({
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
  cpu: P.host
    ? `Process CPU as a share of one core (cpu_limit = ${P.cpu}): Node runs one event loop, so 100 % here is saturated whatever the VM has. Alert "CPU saturated" fires at 80 % for 15 m.`
    : 'Process CPU as a share of the plan allowance (cpu_limit, 0.1 core on Render free). Alert "CPU saturated" fires at 80 % for 15 m.',
  mem: P.host
    ? `Resident memory as a share of the API process budget (mem_limit, ${memText}; ${P.plan}). The rest of the VM is MongoDB tools, Caddy and the page cache; see the Host row. Alert "Memory near limit" fires at 85 % for 10 m.`
    : 'Resident memory as a share of the plan limit (mem_limit, 512 MiB on Render free). Render restarts the process at 100 %. Alert "Memory near limit" fires at ~81 % (435 MB) for 10 m.',
  pool: 'MongoDB connections checked out as a share of DB_POOL_MAX (pool_max). Near 100 % means requests queue (alert "DB pool waiting").',
  atlas: P.conn
    ? `Connections this API holds open as a share of ${P.conn}, the per-member line where the alert "MongoDB connections high" fires (the self-hosted replica set; mongod itself allows far more). Backups, the off-site copy and the metrics collector add a few more on the server side.`
    : `Connections this API holds open as a share of the Atlas ${P.atlas} cap (500). Other clients (scripts, Compass) count against the same cap.`,
  series: 'Active series vs. the series included in the Grafana Cloud plan. Over 100 % is billed or dropped.',
  sm: 'Synthetic check executions per month at the current rate (last 15 m, projected to 30 days), for every check in the account, vs. the monthly allowance (sm_included). Planned for the two Mallakhamb checks: 60,480, about 60 %.',
};
const CAP_TITLES = {
  cpu: 'CPU % of plan', mem: 'Memory % of plan', pool: 'DB pool in use %', atlas: P.conn ? `${P.db} connections %` : 'Atlas connections %',
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
      mappings: [{ type: 'special', options: { match: 'nan', result: { text: 'no traffic', color: 'green' } } }],
      description: 'Alert "Slow API" fires above 1.5 s for 10 m. "no traffic" = no request in the last 5 minutes.',
    }),
    stat('Restarts (24h)', [t(`changes(process_start_time_seconds{${S}}[24h])`)], { h: 4, w: 4, x: 16, y: 0 }, {
      steps: [green, { color: 'orange', value: 2 }, { color: 'red', value: 4 }],
      description: P.host
        ? 'Every deploy is one restart (mallakhamb-deploy). Several without a deploy = crash or out-of-memory kill; see Runtime → Host → OOM kills.'
        : 'Every deploy is one restart. Several without a deploy = crash or out-of-memory (512 MB).',
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

    // The two checks probe Render (synthetics/apply-checks.js); OCI staging has none, so its copy leaves them out.
    ...(STAGING ? [] : [
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
      unit: 's', min: 0, description: `Full request time as a tablet in India would see it, with DNS, TLS and the ${P.host ? 'Caddy' : 'Render'} proxy included.`,
    }),
    ]),
  ],
});

// ------------------------------------------------------------------ host (VM presets only)
// Alloy on each VM (deploy/server/alloy/config.alloy). The active reports as
// mallakhamb-host, a warm standby as mallakhamb-host-standby; both are drawn,
// one line per VM. Panel ids are referenced by the host alerts in
// alerts/apply-alerts.js (HOST_PANEL there): keep the two in step.
const HS = 'scrape_job=~"mallakhamb-host|mallakhamb-host-standby"';
const hostPct = {
  cpu: `100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{${HS},mode="idle"}[5m])))`,
  mem: `100 * (1 - node_memory_MemAvailable_bytes{${HS}} / node_memory_MemTotal_bytes{${HS}})`,
  disk: `100 * (1 - node_filesystem_avail_bytes{${HS},mountpoint="/"} / node_filesystem_size_bytes{${HS},mountpoint="/"})`,
  inodes: `100 * (1 - node_filesystem_files_free{${HS},mountpoint="/"} / node_filesystem_files{${HS},mountpoint="/"})`,
};
const hostRow = (y) => [
  row('Host: the VMs (Alloy; active = mallakhamb-host, standby = mallakhamb-host-standby)', y),
  table('Release', [instant(`mallakhamb_release_info{${HS}}`)], { h: 6, w: 12, x: 0, y: y + 1 }, {
    hide: ['Value', 'platform'], keep: ['instance'],
    description: 'Which commit each VM holds, and its role. Active and standby should show the same sha (alert "Standby behind the active").',
  }),
  stat('Last backup age (active)', [t(`time() - max by (instance) (mallakhamb_backup_last_success_timestamp_seconds{scrape_job="mallakhamb-host"})`, '{{instance}}')], { h: 6, w: 12, x: 12, y: y + 1 }, {
    unit: 's', steps: [green, { color: 'orange', value: 93600 }, { color: 'red', value: 172800 }],
    description: 'Time since mallakhamb-backup last succeeded on the active, the only VM that backs up (alert "Backup stale" above 26 h). The standby is left out: it keeps the age it was cloned with, which would read red for ever.',
  }),
  pctTs('Host CPU busy %', [t(hostPct.cpu, '{{instance}}')], { h: 8, w: 12, x: 0, y: y + 7 }, { description: 'All cores, every process on the VM. Dashed lines: 70 / 80 / 90 %.' }),
  pctTs('Host memory used %', [t(hostPct.mem, '{{instance}}')], { h: 8, w: 12, x: 12, y: y + 7 }, {
    description: '1 − MemAvailable / MemTotal. Alert "Host memory high" fires above 85 % for 10 m on the active. Dashed lines: 70 / 80 / 90 %.',
  }),
  pctTs('Root disk used %', [t(hostPct.disk, '{{instance}}')], { h: 8, w: 8, x: 0, y: y + 15 }, { description: 'Alerts "Disk filling" at 80 % (warning) and 90 % (critical).' }),
  pctTs('Inodes used %', [t(hostPct.inodes, '{{instance}}')], { h: 8, w: 8, x: 8, y: y + 15 }, { description: 'Alert "Inodes running out" below 10 % free.' }),
  ts('Load (1m)', [t(`node_load1{${HS}}`, '{{instance}}')], { h: 8, w: 8, x: 16, y: y + 15 }, { min: 0, description: 'Runnable + waiting tasks. Above the core count for long = the VM is the bottleneck.' }),
  ts('Network', [
    t(`sum by (instance) (rate(node_network_receive_bytes_total{${HS},device!="lo"}[5m]))`, '{{instance}} in'),
    t(`sum by (instance) (rate(node_network_transmit_bytes_total{${HS},device!="lo"}[5m]))`, '{{instance}} out'),
  ], { h: 8, w: 12, x: 0, y: y + 23 }, { unit: 'Bps', min: 0 }),
  ts('OOM kills (1h)', [t(`sum by (instance) (increase(node_vmstat_oom_kill{${HS}}[1h]))`, '{{instance}}')], { h: 8, w: 12, x: 12, y: y + 23 }, {
    min: 0, bars: true, description: 'The kernel killed a process for memory. Alert "Out-of-memory kill" pages on any.',
  }),
  // The nightly full-season lifecycle check (deploy/oci/PLAN.md O14), on both VMs.
  stat('Nightly e2e: last pass', [t(`time() - mallakhamb_e2e_last_success_timestamp_seconds{${HS}} > 0`, '{{instance}}')], { h: 5, w: 12, x: 0, y: y + 31 }, {
    unit: 's', steps: [green, { color: 'orange', value: 93600 }, { color: 'red', value: 172800 }],
    description: 'Time since the nightly e2e run (setup:api --drop on a throw-away _e2e database, then verifySeed) last passed on each VM. Meet days are skipped on purpose (NO_E2E or the meet backup timer).',
  }),
  stat('Nightly e2e: last result', [t(`mallakhamb_e2e_last_exit_code{${HS}}`, '{{instance}}')], { h: 5, w: 12, x: 12, y: y + 31 }, {
    steps: [green, { color: 'red', value: 1 }],
    mappings: [{ type: 'value', options: { 0: { text: 'PASS', color: 'green' } } }, { type: 'range', options: { from: 1, to: 255, result: { text: 'FAIL', color: 'red' } } }],
    description: 'Exit code of the last nightly run that was not skipped. FAIL → journalctl -u mallakhamb-e2e on that VM. Alert "E2E failed".',
  }),
];

// ------------------------------------------------------------------ runtime
id = 0;
const runtime = dashboard({
  uid: 'mallakhamb-runtime',
  title: 'Mallakhamb Runtime (Node.js)',
  description: P.host
    ? `CPU, memory, event loop and GC of the API process (one core, ${memText} budget; ${P.plan}), then the VMs themselves (Host row). Swap for jvm_* panels after the Spring Boot port. PLAN.md §3.2`
    : 'CPU, memory, event loop and GC against the Render free plan (0.1 CPU, 512 MB). Swap for jvm_* panels after the Spring Boot port. PLAN.md §3.2',
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
    ...(P.host ? hostRow(28) : []),
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
      description: P.conn
        ? 'minPoolSize is per replica-set member the driver reads from: DB_POOL_MIN=10 × 2 (app-01, app-02; db-03 is hidden) = 20 at idle.'
        : 'minPoolSize is per replica-set member: DB_POOL_MIN=10 × 3 Atlas members = 30 at idle.',
    }),
    gauge('DB pool in use %', [t(PCT.pool)], { h: 4, w: 5, x: 4, y: 0 }, { description: DESC.pool }),
    gauge(CAP_TITLES.atlas, [t(PCT.atlas)], { h: 4, w: 5, x: 9, y: 0 }, { description: DESC.atlas }),
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

    // The walk-in desk's OCR sidecar (ocr/), on the active VM only: it runs
    // where the API runs. No data on Render, where there is no sidecar.
    row('Walk-in desk OCR (active VM; deploy/oci/PLAN.md O15)', 28),
    stat('OCR reader', [t('max(mkwi_ocr_up{scrape_job="mallakhamb-host"}) or vector(0)')], { h: 8, w: 4, x: 0, y: 29 }, {
      steps: upSteps, mappings: upMappings,
      description: 'The sidecar answers /metrics on 127.0.0.1:8090. DOWN → systemctl status mallakhamb-ocr on the active. The desk still works by typing. Alert "OCR down".',
    }),
    ts('Pages read (15m) by outcome', [t('sum by (outcome) (increase(mkwi_ocr_pages_total{scrape_job="mallakhamb-host"}[15m]))', '{{outcome}}')], { h: 8, w: 8, x: 4, y: 29 }, {
      min: 0, bars: true, description: 'ok / unreadable (no corner squares or code — the desk asks for a re-take) / busy (queue full) / error (a reader crash: journalctl -u mallakhamb-ocr).',
    }),
    ts('Seconds per page', [
      t('histogram_quantile(0.95, sum by (le) (rate(mkwi_ocr_page_seconds_bucket{scrape_job="mallakhamb-host"}[15m])))', 'p95'),
      t('sum(rate(mkwi_ocr_page_seconds_sum{scrape_job="mallakhamb-host"}[15m])) / sum(rate(mkwi_ocr_page_seconds_count{scrape_job="mallakhamb-host"}[15m]))', 'mean'),
    ], { h: 8, w: 8, x: 12, y: 29 }, { unit: 's', min: 0, description: 'One page at a time on one core, at low CPU priority — live scoring always wins.' }),
    stat('OCR queue', [t('max(mkwi_ocr_queue_waiting{scrape_job="mallakhamb-host"}) or vector(0)')], { h: 8, w: 4, x: 20, y: 29 }, {
      decimals: 0, steps: [green, { color: 'orange', value: 2 }, { color: 'red', value: 4 }],
      description: 'Photos waiting for the reader. The API answers "busy, try again" beyond 3.',
    }),

    ...capacityRow(37, ['cpu', 'mem', 'pool']),
  ],
});

// ------------------------------------------------------------------ VM resources (VM presets only)
// Everything Alloy reports about the VMs themselves, one dashboard. Grafana's
// Asserts can add an asserts_env label that doubles a series, so every query
// collapses to max by (instance, …) before it sums or divides.
const vmResources = () => {
  id = 0;
  const cloud = PLATFORM.startsWith('oci') ? 'OCI' : PLATFORM.toUpperCase();
  // Every VM: app-01/app-02 (host / host-standby) and db-03 (mallakhamb-db, the replica set's third member).
  const VS = 'scrape_job=~"mallakhamb-host|mallakhamb-host-standby|mallakhamb-db"';
  const HI = `${VS},instance=~"$instance"`;
  const one = (m, by = '') => `max by (instance${by}) (${m})`;
  const cpuBusy = `100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{${HI},mode="idle"}[5m])))`;
  const memUsed = `100 * (1 - ${one(`node_memory_MemAvailable_bytes{${HI}}`)} / ${one(`node_memory_MemTotal_bytes{${HI}}`)})`;
  const rootUsed = `100 * (1 - ${one(`node_filesystem_avail_bytes{${HI},mountpoint="/"}`)} / ${one(`node_filesystem_size_bytes{${HI},mountpoint="/"}`)})`;
  const net = (dir, sel = HI) => `sum by (instance) (${one(`rate(node_network_${dir}_bytes_total{${sel},device!="lo"}[5m])`, ', device')})`;
  const cores = (sel) => `count by (instance) (${one(`node_cpu_seconds_total{${sel},mode="idle"}`, ', cpu')})`;
  const disk = 'device=~"sd.*|vd.*|nvme.*"';
  const realFs = 'fstype!~"tmpfs|ramfs|squashfs|overlay"';
  const p95over7d = (expr) => `quantile_over_time(0.95, (${expr})[7d:5m])`;
  const reclaimSteps = [{ color: 'red', value: null }, { color: 'green', value: 20 }];
  const ageSteps = [green, { color: 'orange', value: 93600 }, { color: 'red', value: 172800 }];

  const free = PLATFORM.startsWith('oci')
    ? [
      // Halved from 4 OCPU / 24 GB on 2026-06-15 (deploy/oci/PLAN.md §1.1).
      ['free_ocpu', '2', 'Always Free A1 OCPUs (whole tenancy)'],
      ['free_mem', String(12 * GIB), 'Always Free A1 memory, bytes (whole tenancy)'],
      ['free_micro', '2', 'Always Free AMD micro VMs (VM.Standard.E2.1.Micro)'],
      ['free_block', String(200 * 1000 ** 3), 'Always Free block + boot volume storage, bytes'],
      ['free_egress', String(10 * 1000 ** 4), 'Always Free outbound data per month, bytes'],
      ['nic_bps', String(1000 ** 3), 'Network bandwidth of a 1-OCPU A1 VM, bits/s'],
    ]
    : [];

  const allowance = PLATFORM.startsWith('oci') ? [
    row('Always Free allowance: the whole tenancy, every VM counted (deploy/oci/PLAN.md)', 13),
    gauge('A1 OCPUs % of free (2)', [t(`100 * sum(${cores(HS)}) / $free_ocpu`)], { h: 6, w: 5, x: 0, y: 14 }, {
      description: 'Cores of the two A1 VMs against the 2 A1 OCPUs Always Free allows since 2026-06-15. Two 1-OCPU VMs = 100 %: that is the whole allowance, by design, so it stays green up to 100 %. The root quota mallakhamb-prod-quota-free-tier stops a launch past it.',
      steps: FULL_BY_DESIGN,
    }),
    gauge('A1 memory % of free (12 GB)', [t(`100 * sum(${one(`node_memory_MemTotal_bytes{${HS}}`)}) / $free_mem`)], { h: 6, w: 5, x: 5, y: 14 }, {
      description: 'MemTotal of the two A1 VMs against the 12 GB Always Free allows. Two 4 GB VMs since 2026-10-24 (IDLE-RECLAIM-PLAN.md D1) read about 64 %; the kernel keeps some memory for itself. Green up to 100 %; never resize past it.',
      steps: FULL_BY_DESIGN,
    }),
    gauge('AMD micro VMs % of free (2)', [t('100 * count(max by (instance) (node_uname_info{scrape_job="mallakhamb-db"})) / $free_micro')], { h: 6, w: 5, x: 10, y: 14 }, {
      description: 'db-03 (VM.Standard.E2.1.Micro) against the 2 Always Free micro VMs. The root quota allows exactly 1 (standard-e2-micro-core-count = 1), so 50 % is the most this can read.',
    }),
    gauge('Boot volumes % of free (200 GB)', [t(`100 * sum(${one(`node_filesystem_size_bytes{${VS},mountpoint="/"}`)}) / $free_block`)], { h: 6, w: 5, x: 15, y: 14 }, {
      description: 'Root filesystem size of every VM (three 50 GB boot volumes) against the 200 GB of block storage Always Free allows. Volume backups are a separate allowance (5).',
    }),
    gauge('Outbound data % of free (10 TB / month)', [t(`100 * sum(${one(`increase(node_network_transmit_bytes_total{${VS},device!="lo"}[7d])`, ', device')}) * 30 / 7 / $free_egress`)], { h: 6, w: 4, x: 20, y: 14 }, {
      description: 'Bytes sent by every VM over the last 7 days, projected to 30 days, against the 10 TB a month Always Free includes.',
    }),

    row('Idle reclaim: Oracle may reclaim an Always Free VM that is idle for 7 days', 20),
    stat('CPU p95 (7d)', [t(p95over7d(cpuBusy), '{{instance}}')], { h: 6, w: 6, x: 0, y: 21 }, {
      unit: 'percent', decimals: 1, steps: reclaimSteps,
      description: "95th percentile of CPU busy % over 7 days. Oracle's rule: a VM is idle when CPU p95, network and memory are ALL below 20 % for 7 days. Red = below 20 %.",
    }),
    stat('Memory p95 (7d)', [t(p95over7d(memUsed), '{{instance}}')], { h: 6, w: 6, x: 6, y: 21 }, {
      unit: 'percent', decimals: 1, steps: reclaimSteps,
      description: 'Memory used % over 7 days (95th percentile). The memory test applies to A1 shapes. Red = below 20 %.',
    }),
    stat('Network p95 (7d)', [t(p95over7d(`100 * 8 * (${net('receive')} + ${net('transmit')}) / $nic_bps`), '{{instance}}')], { h: 6, w: 6, x: 12, y: 21 }, {
      unit: 'percent', decimals: 3, steps: reclaimSteps,
      description: 'In + out as a share of the 1 Gbps a 1-OCPU A1 VM gets. Always red here: this app never comes near 20 % of a gigabit.',
    }),
    text('Reading this row', [
      'Reclaim needs **all three** below 20 % for 7 days, measured by Oracle on its own agent; these numbers are the same tests from Alloy, so treat them as close, not exact.',
      '',
      'Light traffic leaves **both** VMs red here, not just the standby. CPU or memory steadily above 20 % on a VM takes it out of the rule.',
    ].join('\n'), { h: 6, w: 6, x: 18, y: 21 }),
  ] : [];
  const y0 = allowance.length ? 27 : 13;

  return dashboard({
    uid: `mallakhamb-${PLATFORM.startsWith('oci') ? 'oci' : PLATFORM}-resources`,
    title: `Mallakhamb ${cloud} resources`,
    description: `The VMs themselves (${P.plan}${PLATFORM === 'oci' ? ', plus db-03, the Always Free micro VM that is the replica set\'s third member' : ''}): CPU, memory, disk, network, ${PLATFORM.startsWith('oci') ? 'the Always Free allowance, idle-reclaim risk, what OCI is charging, ' : ''}and what runs on them. Alloy, scrape_job mallakhamb-host (active) / mallakhamb-host-standby / mallakhamb-db.`,
    tags: ['host', PLATFORM],
    stable: true,
    from: 'now-24h',
    variables: [{
      name: 'instance', label: 'VM', type: 'query', datasource: DS,
      query: { query: `label_values(node_uname_info{${VS}}, instance)`, refId: 'vms' },
      definition: `label_values(node_uname_info{${VS}}, instance)`,
      refresh: 2, sort: 1, multi: true, includeAll: true, hide: 0,
      current: { text: ['All'], value: ['$__all'] }, options: [],
    }],
    constants: free,
    panels: [
      row('At a glance', 0),
      table('VMs', [instant(one(`mallakhamb_release_info{${HI}}`, ', role, sha'))], { h: 6, w: 8, x: 0, y: 1 }, {
        hide: ['Value'], keep: ['instance'],
        description: 'Role and release on each VM. Both should show the same sha (alert "Standby behind the active").',
      }),
      stat('Reporting', [t(`(${one(`node_time_seconds{${HI}}`)} > bool 0) or (${one(`max_over_time(node_time_seconds{${HI}}[1d])`)} * 0)`, '{{instance}}')], { h: 6, w: 4, x: 8, y: 1 }, {
        steps: upSteps, mappings: upMappings,
        description: 'UP = Alloy sent a sample in the last 5 minutes. DOWN = it reported in the last day but has gone quiet: the VM is stopped, or Alloy is (systemctl status alloy).',
      }),
      stat('Uptime', [t(`time() - ${one(`node_boot_time_seconds{${HI}}`)}`, '{{instance}}')], { h: 6, w: 4, x: 12, y: 1 }, { unit: 's', description: 'Since the last kernel boot.' }),
      stat('OCPUs', [t(cores(HI), '{{instance}}')], { h: 6, w: 4, x: 16, y: 1 }, { decimals: 0, description: 'Cores the kernel sees. On A1, 1 OCPU = 1 core.' }),
      stat('Memory', [t(one(`node_memory_MemTotal_bytes{${HI}}`), '{{instance}}')], { h: 6, w: 4, x: 20, y: 1 }, { unit: 'bytes', decimals: 1 }),
      gauge('CPU busy %', [t(cpuBusy, '{{instance}}')], { h: 6, w: 8, x: 0, y: 7 }, { description: 'All cores, every process, last 5 minutes. Bands at 70 / 80 / 90 %.' }),
      gauge('Memory used %', [t(memUsed, '{{instance}}')], { h: 6, w: 8, x: 8, y: 7 }, { description: '1 − MemAvailable / MemTotal. Alert "Host memory high" at 85 % on the active.' }),
      gauge('Root disk used %', [t(rootUsed, '{{instance}}')], { h: 6, w: 8, x: 16, y: 7 }, { description: 'Alerts "Disk filling" at 80 % and 90 %.' }),

      ...allowance,

      row('CPU', y0),
      pctTs('CPU busy %', [t(cpuBusy, '{{instance}}')], { h: 8, w: 12, x: 0, y: y0 + 1 }, { description: 'All cores, every process. Dashed lines: 70 / 80 / 90 %.' }),
      ts('CPU steal %', [t(`100 * avg by (instance) (rate(node_cpu_seconds_total{${HI},mode="steal"}[5m]))`, '{{instance}}')], { h: 8, w: 12, x: 12, y: y0 + 1 }, {
        unit: 'percent', min: 0, softMax: 5,
        description: 'Time the hypervisor gave this core to another tenant. Steady steal above a few % makes everything slower without the VM looking busy.',
      }),
      ts('CPU by mode: $instance', [t(`100 * avg by (mode) (rate(node_cpu_seconds_total{${HI},mode!="idle"}[5m]))`, '{{mode}}')], { h: 8, w: 12, x: 0, y: y0 + 9 }, {
        unit: 'percent', min: 0, softMax: 100, stack: true,
        description: 'user = the API, OCR and scripts; system = the kernel; iowait = waiting on the boot volume; steal = the hypervisor.',
      }),
      ts('Load vs cores', [
        t(one(`node_load1{${HI}}`), '{{instance}} load 1m'),
        t(one(`node_load5{${HI}}`), '{{instance}} load 5m'),
        t(cores(HI), '{{instance}} cores'),
      ], { h: 8, w: 12, x: 0, y: y0 + 17 }, { min: 0, description: 'Runnable + waiting tasks. Load above the core count for long = the VM is the bottleneck.' }),
      ts('Pressure stall (PSI)', [
        t(one(`rate(node_pressure_cpu_waiting_seconds_total{${HI}}[5m])`), '{{instance}} cpu'),
        t(one(`rate(node_pressure_memory_waiting_seconds_total{${HI}}[5m])`), '{{instance}} memory'),
        t(one(`rate(node_pressure_io_waiting_seconds_total{${HI}}[5m])`), '{{instance}} io'),
      ], { h: 8, w: 12, x: 12, y: y0 + 17 }, {
        unit: 'percentunit', min: 0,
        description: 'Share of time at least one task was waiting for CPU, memory or disk. The earliest sign of a VM that is too small.',
      }),

      row('Memory', y0 + 25),
      ts('Memory: $instance', [
        t(`${one(`node_memory_MemTotal_bytes{${HI}}`)} - ${one(`node_memory_MemFree_bytes{${HI}}`)} - ${one(`node_memory_Buffers_bytes{${HI}}`)} - ${one(`node_memory_Cached_bytes{${HI}}`)} - ${one(`node_memory_SReclaimable_bytes{${HI}}`)}`, 'used by processes'),
        t(`${one(`node_memory_Buffers_bytes{${HI}}`)} + ${one(`node_memory_Cached_bytes{${HI}}`)} + ${one(`node_memory_SReclaimable_bytes{${HI}}`)}`, 'cache (reclaimable)'),
        t(one(`node_memory_MemFree_bytes{${HI}}`), 'free'),
      ], { h: 8, w: 12, x: 0, y: y0 + 26 }, {
        unit: 'bytes', min: 0, stack: true,
        description: 'Stacks to the VM total. The cache is given back on demand, so only "used by processes" is pressure.',
      }),
      ts('Swap used', [t(`${one(`node_memory_SwapTotal_bytes{${HI}}`)} - ${one(`node_memory_SwapFree_bytes{${HI}}`)}`, '{{instance}}')], { h: 8, w: 8, x: 0, y: y0 + 34 }, {
        unit: 'bytes', min: 0, description: 'Flat zero when the VM has no swap file.',
      }),
      ts('Major page faults/s', [t(one(`rate(node_vmstat_pgmajfault{${HI}}[5m])`), '{{instance}}')], { h: 8, w: 8, x: 8, y: y0 + 34 }, {
        unit: 'ops', min: 0, description: 'Pages read back from disk. A rise together with high memory = the VM is thrashing.',
      }),
      ts('OOM kills (1h)', [t(one(`increase(node_vmstat_oom_kill{${HI}}[1h])`), '{{instance}}')], { h: 8, w: 8, x: 16, y: y0 + 34 }, {
        min: 0, bars: true, description: 'The kernel killed a process for memory. Alert "Out-of-memory kill" pages on any.',
      }),

      row('Disk', y0 + 42),
      pctTs('Filesystem used %', [t(`100 * (1 - ${one(`node_filesystem_avail_bytes{${HI},${realFs}}`, ', mountpoint')} / ${one(`node_filesystem_size_bytes{${HI},${realFs}}`, ', mountpoint')})`, '{{instance}} {{mountpoint}}')], { h: 8, w: 12, x: 0, y: y0 + 43 }, {
        description: 'Every real mount. Dashed lines: 70 / 80 / 90 %.',
      }),
      ts('Root disk free', [t(one(`node_filesystem_avail_bytes{${HI},mountpoint="/"}`), '{{instance}}')], { h: 8, w: 12, x: 12, y: y0 + 43 }, {
        unit: 'bytes', min: 0, description: 'Backups are written locally before the upload to Object Storage, so a dip each night is normal.',
      }),
      ts('Disk throughput', [
        t(`sum by (instance) (${one(`rate(node_disk_read_bytes_total{${HI},${disk}}[5m])`, ', device')})`, '{{instance}} read'),
        t(`sum by (instance) (${one(`rate(node_disk_written_bytes_total{${HI},${disk}}[5m])`, ', device')})`, '{{instance}} write'),
      ], { h: 8, w: 8, x: 0, y: y0 + 51 }, {
        unit: 'Bps', min: 0, description: 'Boot volume. Its limits scale with size (Balanced: 60 IOPS and 480 KB/s per GB).',
      }),
      ts('Disk IOPS', [
        t(`sum by (instance) (${one(`rate(node_disk_reads_completed_total{${HI},${disk}}[5m])`, ', device')})`, '{{instance}} reads'),
        t(`sum by (instance) (${one(`rate(node_disk_writes_completed_total{${HI},${disk}}[5m])`, ', device')})`, '{{instance}} writes'),
      ], { h: 8, w: 8, x: 8, y: y0 + 51 }, { unit: 'iops', min: 0 }),
      ts('Disk busy %', [t(`100 * max by (instance) (rate(node_disk_io_time_seconds_total{${HI},${disk}}[5m]))`, '{{instance}}')], { h: 8, w: 8, x: 16, y: y0 + 51 }, {
        unit: 'percent', min: 0, softMax: 100, description: 'Share of time the volume had a request in flight. Near 100 % with iowait in the CPU panel = the disk is the bottleneck.',
      }),

      row('Network', y0 + 59),
      ts('Throughput', [
        t(`8 * ${net('receive')}`, '{{instance}} in'),
        t(`8 * ${net('transmit')}`, '{{instance}} out'),
      ], { h: 8, w: 12, x: 0, y: y0 + 60 }, { unit: 'bps', min: 0, description: 'Every interface except loopback.' }),
      ts('Errors and drops', [
        t(`sum by (instance) (${one(`rate(node_network_receive_errs_total{${HI},device!="lo"}[5m])`, ', device')})`, '{{instance}} rx errors'),
        t(`sum by (instance) (${one(`rate(node_network_transmit_errs_total{${HI},device!="lo"}[5m])`, ', device')})`, '{{instance}} tx errors'),
        t(`sum by (instance) (${one(`rate(node_network_receive_drop_total{${HI},device!="lo"}[5m])`, ', device')})`, '{{instance}} rx drops'),
        t(`sum by (instance) (${one(`rate(node_network_transmit_drop_total{${HI},device!="lo"}[5m])`, ', device')})`, '{{instance}} tx drops'),
      ], { h: 8, w: 12, x: 12, y: y0 + 60 }, { unit: 'pps', min: 0, description: 'Should be flat zero.' }),
      ts('Data sent per day', [t(`sum by (instance) (${one(`increase(node_network_transmit_bytes_total{${HI},device!="lo"}[1d])`, ', device')})`, '{{instance}}')], { h: 8, w: 24, x: 0, y: y0 + 68 }, {
        unit: 'bytes', min: 0, description: 'Rolling 24-hour total of outbound bytes. Competition days and nightly backups show as humps.',
      }),

      row('What runs on the VMs', y0 + 76),
      stat('API (active VM)', [t(`up{${S}}`)], { h: 6, w: 4, x: 0, y: y0 + 77 }, {
        steps: upSteps, mappings: upMappings, description: 'Grafana Cloud scraped the API on the reserved IP. The standby runs no API.',
      }),
      ts('API memory vs the VM', [
        t(`max(process_resident_memory_bytes{${S}})`, 'API resident memory'),
        t(`max(node_memory_MemTotal_bytes{scrape_job="mallakhamb-host"}) - max(node_memory_MemAvailable_bytes{scrape_job="mallakhamb-host"})`, 'active VM used'),
        t('max(node_memory_MemTotal_bytes{scrape_job="mallakhamb-host"})', 'active VM total'),
      ], { h: 6, w: 8, x: 4, y: y0 + 77 }, { unit: 'bytes', min: 0, description: 'How much of the active VM the API takes. The rest is Caddy, the OCR reader, Alloy and the page cache.' }),
      stat('OCR reader', [t('max(mkwi_ocr_up{scrape_job="mallakhamb-host"}) or vector(0)')], { h: 6, w: 4, x: 12, y: y0 + 77 }, {
        steps: upSteps, mappings: upMappings, description: 'Walk-in desk sidecar, active VM only (deploy/oci/PLAN.md O15).',
      }),
      stat('Last backup age (active)', [t(`time() - ${one('mallakhamb_backup_last_success_timestamp_seconds{scrape_job="mallakhamb-host"}')}`, '{{instance}}')], { h: 6, w: 8, x: 16, y: y0 + 77 }, {
        unit: 's', steps: ageSteps, description: 'The nightly backup runs on the active only; alert "Backup stale" above 26 h. The standby is left out: it keeps the age it was cloned with, which would read red for ever.',
      }),
      stat('Nightly e2e: last pass', [t(`time() - ${one(`mallakhamb_e2e_last_success_timestamp_seconds{${HI}}`)} > 0`, '{{instance}}')], { h: 5, w: 12, x: 0, y: y0 + 83 }, {
        unit: 's', steps: ageSteps, description: 'Time since the nightly lifecycle run (deploy/oci/PLAN.md O14) last passed on each VM.',
      }),
      stat('Nightly e2e: last result', [t(one(`mallakhamb_e2e_last_exit_code{${HI}}`), '{{instance}}')], { h: 5, w: 12, x: 12, y: y0 + 83 }, {
        steps: [green, { color: 'red', value: 1 }],
        mappings: [{ type: 'value', options: { 0: { text: 'PASS', color: 'green' } } }, { type: 'range', options: { from: 1, to: 255, result: { text: 'FAIL', color: 'red' } } }],
        description: 'FAIL → journalctl -u mallakhamb-e2e on that VM.',
      }),
      ...(PLATFORM.startsWith('oci') ? costRow(y0 + 88) : []),
      ...(PLATFORM.startsWith('oci') ? oracleIdleRow(y0 + 95) : []),
    ],
  });
};
// What OCI is charging (deploy/oci/PRODUCTION-READINESS.md 1.2): the budget mallakhamb-guard, read
// hourly by mallakhamb-oci-cost on both app VMs. The tenancy bills in SGD. Alerts mk-oci-cost-*.
const CJ = 'scrape_job=~"mallakhamb-host|mallakhamb-host-standby"';
const sgd = { unit: 'prefix:S$', decimals: 2 };          // Grafana has no SGD currency unit
const costRow = (y) => [
  row('OCI cost: budget mallakhamb-guard (SGD, the tenancy currency; Always Free = 0)', y),
  stat('Charged this month', [t(`max(mallakhamb_oci_cost_actual{${CJ}})`)], { h: 6, w: 6, x: 0, y: y + 1 }, {
    ...sgd, steps: [green, { color: 'red', value: 0.001 }],
    description: 'What OCI has charged so far this month. Anything above 0 means something paid exists: alert "OCI is charging money" (critical, emails the owner); OCI\'s own budget alert emails too.',
  }),
  stat('Forecast for the month', [t(`max(mallakhamb_oci_cost_forecast{${CJ}})`)], { h: 6, w: 6, x: 6, y: y + 1 }, {
    ...sgd, steps: [green, { color: 'orange', value: 0.001 }, { color: 'red', value: 1.5 }],
    description: 'OCI\'s forecast for the whole month. Alert "OCI forecast over the budget" above the SGD 1.50 guard.',
  }),
  gauge('Forecast % of the guard', [t(`100 * max(mallakhamb_oci_cost_forecast{${CJ}}) / max(mallakhamb_oci_budget_amount{${CJ}})`)], { h: 6, w: 6, x: 12, y: y + 1 }, {
    description: 'Forecast spend against the budget (SGD 1.50, about Rs 100). Bands at 70 / 80 / 90 %.',
  }),
  stat('Cost data age', [t(`time() - max(mallakhamb_oci_cost_updated_timestamp_seconds{${CJ}})`)], { h: 6, w: 6, x: 18, y: y + 1 }, {
    unit: 's', steps: [green, { color: 'orange', value: 7200 }, { color: 'red', value: 10800 }],
    description: 'Since the budget was last read (hourly). Alert "OCI cost data stale" above 3 h, because then the cost alerts are blind. OCI updates the spend a few times a day.',
  }),
];

// Oracle's own idle test (deploy/oci/IDLE-RECLAIM-PLAN.md A1): mallakhamb-oci-idle reads the OCI agent
// metrics Oracle judges by, hourly on both app VMs. The Alloy-based "Idle reclaim" row above is the
// same test from our side; this one is the one that counts. No alert: it is expected red in quiet weeks.
const OI = 'scrape_job=~"mallakhamb-host|mallakhamb-host-standby"';
const under20Red = [{ color: 'red', value: null }, { color: 'green', value: 20 }];
const oracleIdleRow = (y) => [
  row("Oracle's idle test: its own agent metrics, 7-day p95 (an Always Free VM may be stopped when every measure is under 20 %)", y),
  stat('May Oracle stop it?', [t(`max by (vm) (mallakhamb_oci_idle_eligible{${OI}})`, '{{vm}}')], { h: 6, w: 6, x: 0, y: y + 1 }, {
    steps: [green, { color: 'red', value: 1 }],
    mappings: [{ type: 'value', options: { 0: { text: 'NOT IDLE', color: 'green' }, 1: { text: 'IDLE: may stop', color: 'red' } } }],
    description: 'Oracle rule: CPU p95, network and (A1 only) memory all under 20 % for 7 days. Red is not an outage: Oracle emails mallakhambindia@gmail.com a week before it stops anything, and the Resource Scheduler starts a stopped VM within 30 min. Runbook: deploy/oci/IDLE-RECLAIM-PLAN.md.',
  }),
  stat('Memory p95 (counts for A1)', [t(`max by (vm) (mallakhamb_oci_idle_p95{${OI},metric="memory"})`, '{{vm}}')], { h: 6, w: 6, x: 6, y: y + 1 }, {
    unit: 'percent', decimals: 1, steps: under20Red,
    description: 'OCI MemoryUtilization, 7-day p95. Counts only for the A1 VMs (app-01, app-02; 4 GB since 2026-10-24); not for db-03.',
  }),
  stat('CPU p95', [t(`max by (vm) (mallakhamb_oci_idle_p95{${OI},metric="cpu"})`, '{{vm}}')], { h: 6, w: 6, x: 12, y: y + 1 }, {
    unit: 'percent', decimals: 1, steps: under20Red, description: 'OCI CpuUtilization, 7-day p95 of 5-minute means.',
  }),
  stat('Oracle data age', [t(`time() - max(mallakhamb_oci_idle_updated_timestamp_seconds{${OI}})`)], { h: 6, w: 6, x: 18, y: y + 1 }, {
    unit: 's', steps: [green, { color: 'orange', value: 7200 }, { color: 'red', value: 10800 }],
    description: 'Since mallakhamb-oci-idle last read OCI Monitoring (hourly at :41). Stale: journalctl -u mallakhamb-oci-idle; policy mallakhamb-prod-pol-metrics-read.',
  }),
];

// ------------------------------------------------------------------ MongoDB replica set (oci preset)
// deploy/oci/MONGODB-SELF-HOSTED-PLAN.md: app-01 (primary), app-02, db-03 (hidden). Gauges from
// mallakhamb-mongo-metrics on every member (Alloy textfile); backup ages from the jobs on the active.
const mongoDash = () => {
  id = 0;
  const MJ = 'scrape_job=~"mallakhamb-host|mallakhamb-host-standby|mallakhamb-db"';
  const stateMap = [{ type: 'value', options: {
    0: { text: 'STARTUP', color: 'orange' }, 1: { text: 'PRIMARY', color: 'green' }, 2: { text: 'SECONDARY', color: 'green' },
    3: { text: 'RECOVERING', color: 'orange' }, 5: { text: 'STARTUP2', color: 'orange' }, 6: { text: 'UNKNOWN', color: 'red' },
    7: { text: 'ARBITER', color: 'blue' }, 8: { text: 'DOWN', color: 'red' }, 9: { text: 'ROLLBACK', color: 'red' }, 10: { text: 'REMOVED', color: 'red' },
  } }];
  const age = (title, metric, sel, orange, red, x, description) => stat(title, [t(`time() - max(${metric}{${sel}})`)], { h: 5, w: 6, x, y: 31 }, {
    unit: 's', steps: [green, { color: 'orange', value: orange }, { color: 'red', value: red }], description,
  });
  return dashboard({
    uid: 'mallakhamb-mongo',
    title: 'Mallakhamb MongoDB replica set',
    description: 'The self-hosted replica set "mallakhamb" (app-01, app-02, db-03): members, replication, oplog, load, disks and every backup. deploy/oci/MONGODB-SELF-HOSTED-PLAN.md §6',
    tags: ['database', 'mongodb', PLATFORM],
    stable: true,
    from: 'now-24h',
    panels: [
      row('Replica set', 0),
      stat('Primary', [t(`max(mallakhamb_mongo_primary_present{${MJ}})`)], { h: 5, w: 4, x: 0, y: 1 }, {
        steps: upSteps, mappings: [{ type: 'value', options: { 0: { text: 'NONE', color: 'red' }, 1: { text: 'YES', color: 'green' } } }],
        description: 'Some member sees a PRIMARY. NONE = nothing can be written (alert "MongoDB has no primary", critical).',
      }),
      stat('Members answering', [t(`count(mallakhamb_mongo_up{${MJ}} == 1) or vector(0)`)], { h: 5, w: 4, x: 4, y: 1 }, {
        decimals: 0, steps: [{ color: 'red', value: null }, { color: 'orange', value: 2 }, { color: 'green', value: 3 }],
        description: 'Members whose health check (TLS + the monitor login) answered. 3 of 3 normal; 2 still writes but the next loss stops it.',
      }),
      stat('Member state', [t(`max by (member) (mallakhamb_mongo_member_state{${MJ}})`, '{{member}}')], { h: 5, w: 8, x: 8, y: 1 }, {
        mappings: stateMap, description: 'Each member as the set sees it. app-01 is PRIMARY normally (priority 2); db-03 is a hidden SECONDARY that never becomes primary.',
      }),
      stat('Max replication lag', [t(`max(mallakhamb_mongo_replication_lag_seconds{${MJ}})`)], { h: 5, w: 4, x: 16, y: 1 }, {
        unit: 's', steps: [green, { color: 'orange', value: 10 }, { color: 'red', value: 30 }],
        description: 'How far the furthest member is behind the primary. Alert above 30 s for 5 m. Up to ~10 s is normal: the primary writes a no-op every 10 s when idle.',
      }),
      stat('Rollback files', [t(`max(mallakhamb_mongo_rollback_files{${MJ}})`)], { h: 5, w: 4, x: 20, y: 1 }, {
        decimals: 0, steps: [green, { color: 'red', value: 1 }],
        description: 'Writes a failover undid (they had not reached a majority). Should stay 0: the app writes with w:"majority".',
      }),

      row('Replication', 6),
      ts('Replication lag by member', [t(`max by (member) (mallakhamb_mongo_replication_lag_seconds{${MJ}})`, '{{member}}')], { h: 8, w: 12, x: 0, y: 7 }, { unit: 's', min: 0 }),
      ts('Member state over time', [t(`max by (member) (mallakhamb_mongo_member_state{${MJ}})`, '{{member}}')], { h: 8, w: 12, x: 12, y: 7 }, {
        min: 0, description: '1 PRIMARY, 2 SECONDARY, 8 DOWN, 3 RECOVERING. Elections show as a primary switching to 2 while another member shows 1.',
      }),

      row('Load and oplog', 15),
      ts('Connections per member', [t(`max by (instance) (mallakhamb_mongo_connections_current{${MJ}})`, '{{instance}}')], { h: 8, w: 8, x: 0, y: 16 }, {
        min: 0, description: 'Open client connections. The API pool is up to 100 per process; alert above 300.',
      }),
      ts('Application database size', [t(`max by (db) (mallakhamb_mongo_db_bytes{${MJ}})`, '{{db}}')], { h: 8, w: 8, x: 8, y: 16 }, {
        unit: 'bytes', min: 0, description: 'Data + index bytes. Plan §4a alerts at 250 MB (Atlas M0 off-site copy limit 512 MB).',
      }),
      gauge('Oplog used %', [t(`100 * max(mallakhamb_mongo_oplog_used_ratio{${MJ}})`)], { h: 8, w: 4, x: 16, y: 16 }, {
        description: 'Share of the 2 GB oplog in use. Once full, the oldest entries roll off and the window below starts to count.',
      }),
      stat('Oplog window', [t(`min(mallakhamb_mongo_oplog_window_seconds{${MJ}})`)], { h: 8, w: 4, x: 20, y: 16 }, {
        unit: 's', steps: [{ color: 'red', value: null }, { color: 'orange', value: 86400 }, { color: 'green', value: 172800 }],
        mappings: [{ type: 'range', options: { from: 100000000, to: 10000000000, result: { text: 'not full yet', color: 'green' } } }],
        description: 'History the oplog holds once it is full (a member down longer than this needs a resync). Alert below 48 h.',
      }),

      row('Disks: every member holds a full copy', 24),
      gauge('Root disk used %', [t(`100 * (1 - max by (instance) (node_filesystem_avail_bytes{${MJ},mountpoint="/"}) / max by (instance) (node_filesystem_size_bytes{${MJ},mountpoint="/"}))`, '{{instance}}')], { h: 6, w: 12, x: 0, y: 25 }, {
        description: 'Alert "MongoDB member disk filling" above 80 % on any member. At 100 % that member\'s mongod stops (drilled: it recovers once space is freed).',
      }),
      ts('Root disk free', [t(`max by (instance) (node_filesystem_avail_bytes{${MJ},mountpoint="/"})`, '{{instance}}')], { h: 6, w: 12, x: 12, y: 25 }, { unit: 'bytes', min: 0 }),

      row('Backups (all run on the active)', 30),
      age('Nightly dump age', 'mallakhamb_backup_last_success_timestamp_seconds', 'scrape_job="mallakhamb-host"', 93600, 172800, 0,
        'mallakhamb-backup, 20:30 UTC. Alert "Backup stale" above 26 h. Restore: mallakhamb-restore-drill.'),
      age('Point-in-time base age', 'mallakhamb_pitr_base_last_success_timestamp_seconds', MJ, 93600, 172800, 6,
        'The first oplog-slice run of each UTC day takes a whole-set mongodump --oplog. Alert above 26 h.'),
      age('Oplog slice age', 'mallakhamb_oplog_slice_last_success_timestamp_seconds', MJ, 1800, 2400, 12,
        'Every 15 minutes. Point-in-time restore (mallakhamb-pitr) reaches up to the last slice. Alert above 40 m.'),
      age('Off-site copy age', 'mallakhamb_offsite_last_success_timestamp_seconds', MJ, 7200, 10800, 18,
        'Hourly to Atlas <db>_offsite, checked after each copy: the way out if Oracle is lost. Alert above 3 h.'),
    ],
  });
};

// Per-VM breakdowns repeat once per selected VM.
const withRepeats = (d) => {
  for (const pnl of d.panels) if (pnl.title.endsWith('$instance')) Object.assign(pnl, { repeat: 'instance', repeatDirection: 'h', maxPerRow: 2 });
  return d;
};

const files = {
  'mallakhamb-api-overview.json': overview,
  'mallakhamb-runtime.json': runtime,
  'mallakhamb-database.json': database,
  'mallakhamb-competition-day.json': compDay,
};
if (P.host) files[`mallakhamb-${PLATFORM.startsWith('oci') ? 'oci' : PLATFORM}-resources.json`] = withRepeats(vmResources());
if (PLATFORM === 'oci') files['mallakhamb-mongo.json'] = mongoDash();
fs.mkdirSync(OUT, { recursive: true });
for (const [name, d] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(d, null, 2) + '\n');
  console.log(name, d.panels.length, 'panels');
}
