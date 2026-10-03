/**
 * Mallakhamb alerting for Grafana Cloud (deploy/monitoring/PLAN.md, Phase 4).
 *
 * The source of truth for the alert rules, the contact point and our branch of
 * the notification policy. mallakhamb-rules.yaml is generated from this file
 * (`node deploy/monitoring/alerts/export-yaml.js`) for reading and diffing.
 *
 * To (re)apply: open https://sinceresloth366.grafana.net while signed in as an
 * admin, open the browser console, paste this whole file, press Enter.
 * It is idempotent:
 *   - creates the `owner-email` contact point if missing;
 *   - replaces only the `service=mallakhamb-api` route in the notification
 *     policy, leaving the rest of the tree alone;
 *   - replaces the `mallakhamb-api` rule group in the `mallakhamb` folder.
 * Everything is created with X-Disable-Provenance, so it stays editable in the
 * UI. A UI edit doesn't count until it's copied back here.
 *
 * Never change alerting on a competition day or within 48 h before one.
 */
(async () => {
  const OWNER_EMAIL = 'angreatharva08@gmail.com';
  const FOLDER_UID = 'mallakhamb';
  const GROUP = 'mallakhamb-api';
  const DS = 'grafanacloud-prom';
  const S = 'scrape_job="mallakhamb-api"';
  const RUNBOOK = 'https://github.com/angreatharva/mallakhamb/blob/master/deploy/monitoring/PLAN.md#8-runbook--when-an-alert-fires';

  const H = (m = '') => `http_server_requests_seconds_count{${S}${m}}`;
  const ratio5xx = `(sum(rate(${H(',outcome="SERVER_ERROR"')}[5m])) or vector(0)) / clamp_min(sum(rate(${H()}[5m])), 1e-9)`;

  // [uid, title, expr, op, threshold, for, severity, dashboardUid, panelId, summary, description]
  // Every expression returns the raw value; C compares it. A query that returns
  // nothing (no traffic, counter never incremented) is "No data" → OK.
  const RULES = [
    ['mk-api-down', 'API down', `up{${S}}`, 'lt', 1, '3m', 'critical', 'mallakhamb-api-overview', 1,
      'Mallakhamb API is DOWN: Grafana Cloud cannot scrape /metrics.',
      'First look: Render → mallakhamb-server → Events and Logs. Likely: a failed deploy (missing env var), free hours exhausted (Billing → Usage), or METRICS_TOKEN differs between Render and the Grafana scrape job. Runbook: PLAN.md §8 "API down / Scrape missing".'],
    ['mk-scrape-missing', 'Scrape missing', `absent(up{${S}})`, 'gt', 0, '10m', 'critical', 'mallakhamb-api-overview', 1,
      'No scrape results at all for mallakhamb-api for 10 minutes.',
      'The Grafana Cloud scrape job itself has stopped or was renamed (Connections → Metrics Endpoint → mallakhamb-api). Runbook: PLAN.md §8 "API down / Scrape missing".'],
    ['mk-high-5xx', 'High 5xx', `(${ratio5xx}) and on() (sum(rate(${H()}[5m])) > 0.05)`, 'gt', 0.02, '10m', 'critical', 'mallakhamb-api-overview', 13,
      'More than 2 % of API requests are failing with 5xx ({{ humanizePercentage $values.A.Value }}).',
      'First look: API overview → "Errors by route", then Render logs by correlation id. One route = a recent commit; every route = the database (Database dashboard). Runbook: PLAN.md §8 "High 5xx".'],
    ['mk-slow-api', 'Slow API', `histogram_quantile(0.95, sum by (le) (rate(http_server_requests_seconds_bucket{${S}}[5m])))`, 'gt', 1.5, '10m', 'warning', 'mallakhamb-api-overview', 8,
      'API p95 latency is above 1.5 s ({{ humanizeDuration $values.A.Value }}).',
      'First look: API overview → "Slowest routes", and the Runtime dashboard. Usually a heavy synchronous handler (results, exports) on 0.1 CPU, or long GC. Runbook: PLAN.md §8 "Slow API / Event loop blocked".'],
    ['mk-event-loop', 'Event loop blocked', `nodejs_eventloop_lag_p99_seconds{${S}}`, 'gt', 0.2, '5m', 'warning', 'mallakhamb-runtime', 8,
      'Event-loop lag p99 is above 200 ms ({{ humanizeDuration $values.A.Value }}).',
      'Every request and socket event waits behind this. First look: Runtime → CPU and GC; API overview → "Slowest routes". Runbook: PLAN.md §8 "Slow API / Event loop blocked".'],
    ['mk-memory', 'Memory near limit', `process_resident_memory_bytes{${S}}`, 'gt', 435e6, '10m', 'warning', 'mallakhamb-runtime', 6,
      'API memory is above 85 % of the 512 MB free-plan limit ({{ humanize1024 $values.A.Value }}B).',
      'Render restarts the process at 512 MiB, which drops every live tablet connection. First look: Runtime → RSS and heap. Runbook: PLAN.md §8 "Memory near limit / Restart loop".'],
    ['mk-cpu', 'CPU saturated', `rate(process_cpu_seconds_total{${S}}[5m])`, 'gt', 0.08, '15m', 'warning', 'mallakhamb-runtime', 5,
      'API CPU is above 80 % of the 0.1-core free-plan allowance for 15 minutes.',
      'Expected briefly during a meet. Persistent → consider the Starter instance. Runbook: PLAN.md §8 "CPU saturated".'],
    ['mk-restart-loop', 'Restart loop', `changes(process_start_time_seconds{${S}}[30m])`, 'gt', 2, '0s', 'critical', 'mallakhamb-api-overview', 5,
      'The API restarted more than twice in 30 minutes.',
      'A deploy is one restart; more means crashes or out-of-memory kills. First look: Render → Events, then Runtime → RSS. Runbook: PLAN.md §8 "Memory near limit / Restart loop".'],
    ['mk-db-checkout', 'DB checkout failing', `sum(increase(mongodb_driver_pool_checkout_failed_total{${S}}[5m])) or vector(0)`, 'gt', 0, '5m', 'critical', 'mallakhamb-database', 7,
      'The API cannot get MongoDB connections from its pool.',
      'First look: Database dashboard → checkout failures by reason; Atlas status page; Atlas network access list. Runbook: PLAN.md §8 "DB checkout failing / DB pool waiting".'],
    ['mk-db-pool-waiting', 'DB pool waiting', `max_over_time(mongodb_driver_pool_waitqueuesize{${S}}[5m])`, 'gt', 0, '10m', 'warning', 'mallakhamb-database', 6,
      'Requests have been queueing for a MongoDB connection for 10 minutes.',
      'The pool is exhausted or Atlas is slow to answer. First look: Database dashboard. To find the slow collection, set DB_MONITOR_COMMANDS=true for up to an hour (never on a competition day). Runbook: PLAN.md §8 "DB checkout failing / DB pool waiting".'],
    ['mk-login-failures', 'Login failures spike', `sum(increase(mallakhamb_auth_logins_total{${S},outcome="failure"}[5m])) or vector(0)`, 'gt', 25, '0s', 'warning', 'mallakhamb-competition-day', 12,
      'More than 25 failed logins in 5 minutes ({{ $values.A.Value }}).',
      'First look: Competition day → "Logins by role / outcome". Judges mistyping at venue start → ignore. One role failing steadily → possible guessing; check RATE_LIMIT_ENABLED. Runbook: PLAN.md §8 "Login failures spike".'],
    ['mk-payment-webhook', 'Payment webhook problem', `sum(increase(mallakhamb_payment_webhooks_total{${S},outcome=~"rejected_signature|error"}[15m])) or vector(0)`, 'gt', 0, '0s', 'warning', 'mallakhamb-competition-day', 13,
      'A Razorpay webhook was rejected or failed in the last 15 minutes.',
      'First look: Competition day → "Payment webhooks", and Razorpay dashboard → Webhooks. rejected_signature → RAZORPAY_WEBHOOK_SECRET mismatch; error → Render logs. Runbook: PLAN.md §8 "Payment webhook problem".'],
  ];

  const buildRule = ([uid, title, expr, op, thr, forDur, severity, dash, panel, summary, description]) => ({
    uid, title, condition: 'C', for: forDur, folderUID: FOLDER_UID, ruleGroup: GROUP,
    noDataState: 'OK',
    // A failing query pages for critical rules; warnings keep their last state.
    execErrState: severity === 'critical' ? 'Error' : 'KeepLast',
    labels: { service: 'mallakhamb-api', severity },
    annotations: { summary, description, runbook_url: RUNBOOK, __dashboardUid__: dash, __panelId__: String(panel) },
    data: [
      { refId: 'A', relativeTimeRange: { from: 1800, to: 0 }, datasourceUid: DS,
        model: { refId: 'A', expr, instant: true, range: false, intervalMs: 60000, maxDataPoints: 43200,
          datasource: { type: 'prometheus', uid: DS } } },
      { refId: 'C', relativeTimeRange: { from: 0, to: 0 }, datasourceUid: '__expr__',
        model: { refId: 'C', type: 'threshold', expression: 'A',
          conditions: [{ evaluator: { type: op, params: [thr] } }],
          datasource: { type: '__expr__', uid: '__expr__' } } },
    ],
  });

  // Our branch of the notification policy. Email only (Q1, 2026-10-03).
  const ROUTE = {
    receiver: 'owner-email', object_matchers: [['service', '=', 'mallakhamb-api']],
    group_by: ['alertname'], group_wait: '30s', group_interval: '5m', repeat_interval: '4h', continue: false,
    routes: [
      { receiver: 'owner-email', object_matchers: [['severity', '=', 'critical']], repeat_interval: '1h' },
      { receiver: 'owner-email', object_matchers: [['severity', '=', 'warning']], repeat_interval: '4h' },
    ],
  };

  // Loaded by export-yaml.js under Node: hand over the spec, apply nothing.
  if (typeof window === 'undefined') {
    module.exports = { RULES, buildRule, GROUP, FOLDER_UID, ROUTE };
    return;
  }

  const HDR = { 'Content-Type': 'application/json', 'X-Disable-Provenance': 'true' };
  const out = {};
  const call = async (name, url, method, body) => {
    const r = await fetch(url, { method, headers: HDR, body: body && JSON.stringify(body) });
    out[name] = `${r.status} ${r.ok ? 'ok' : (await r.text()).slice(0, 300)}`;
  };

  const cps = await fetch('/api/v1/provisioning/contact-points').then((r) => r.json());
  if (!cps.some((c) => c.name === 'owner-email')) {
    await call('contactPoint', '/api/v1/provisioning/contact-points', 'POST', {
      uid: 'owner-email', name: 'owner-email', type: 'email',
      settings: { addresses: OWNER_EMAIL, singleEmail: true }, disableResolveMessage: false,
    });
  } else out.contactPoint = 'exists';

  const tree = await fetch('/api/v1/provisioning/policies').then((r) => r.json());
  const ours = (r) => (r.object_matchers || []).some((m) => m[0] === 'service' && m[2] === 'mallakhamb-api');
  tree.routes = [...(tree.routes || []).filter((r) => !ours(r)), ROUTE];
  await call('policy', '/api/v1/provisioning/policies', 'PUT', tree);

  await call('ruleGroup', `/api/v1/provisioning/folder/${FOLDER_UID}/rule-groups/${GROUP}`, 'PUT', {
    title: GROUP, folderUid: FOLDER_UID, interval: 60, rules: RULES.map(buildRule),
  });

  console.table(out);
})();
