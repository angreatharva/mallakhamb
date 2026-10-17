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
 *
 * PLATFORM picks the thresholds and wording (COMMON.md C1.7). It stays
 * 'render' until the cutover (COMMON.md C7, step 55): only then change it to
 * the new platform before pasting. The VM platforms also add the host rules,
 * which need Alloy on the servers; on Render they would fire at once.
 */
(async () => {
  const PLATFORM = 'render'; // render | oci | oci-single | aws
  const OWNER_EMAIL = 'angreatharva08@gmail.com';
  const FOLDER_UID = 'mallakhamb';
  const GROUP = 'mallakhamb-api';
  const DS = 'grafanacloud-prom';
  const S = 'scrape_job="mallakhamb-api"';
  const RUNBOOK = 'https://github.com/angreatharva/mallakhamb/blob/master/deploy/monitoring/PLAN.md#8-runbook--when-an-alert-fires';

  const H = (m = '') => `http_server_requests_seconds_count{${S}${m}}`;
  const ratio5xx = `(sum(rate(${H(',outcome="SERVER_ERROR"')}[5m])) or vector(0)) / clamp_min(sum(rate(${H()}[5m])), 1e-9)`;

  // Same presets as dashboards/build-dashboards.js. cpu = cores for the one
  // Node event loop, mem = the API process's RSS budget in bytes.
  const GIB = 1024 * 1024 * 1024;
  const PRESETS = {
    render: { cpu: 0.1, mem: 512 * 1024 * 1024, host: false, standby: false },
    oci: { cpu: 1, mem: 3 * GIB, host: true, standby: true, failover: 'deploy/oci/PLAN.md O13' },
    'oci-single': { cpu: 1, mem: 4 * GIB, host: true, standby: false, failover: 'rebuild from the golden backup, deploy/oci/PLAN.md §5' },
    aws: { cpu: 1, mem: 1.5 * GIB, host: true, standby: false, failover: 'deploy/aws/PLAN.md' },
  };
  // Panel ids in the Runtime dashboard's Host row (build-dashboards.js hostRow).
  const HOST_PANEL = { release: 12, backup: 13, cpu: 14, mem: 15, disk: 16, inodes: 17, oom: 20, e2ePass: 21, e2eResult: 22 };

  // The rules for one platform. Render keeps its exact wording and thresholds.
  const spec = (platform) => {
    const P = PRESETS[platform];
    if (!P) throw new Error(`Unknown platform ${platform}; use one of ${Object.keys(PRESETS).join(', ')}`);
    const V = (render, vm) => (P.host ? vm : render);
    const memText = P.mem >= GIB ? `${P.mem / GIB} GiB` : `${P.mem / 1024 / 1024} MiB`;
    const HJ = 'scrape_job="mallakhamb-host"';
    const fsRatio = (avail, size) => `${avail}{${HJ},mountpoint="/"} / ${size}{${HJ},mountpoint="/"}`;

  // [uid, title, expr, op, threshold, for, severity, dashboardUid, panelId, summary, description]
  // Every expression returns the raw value; C compares it. A query that returns
  // nothing (no traffic, counter never incremented) is "No data" → OK.
  const RULES = [
    ['mk-api-down', 'API down', `up{${S}}`, 'lt', 1, '3m', 'critical', 'mallakhamb-api-overview', 1,
      'Mallakhamb API is DOWN: Grafana Cloud cannot scrape /metrics.',
      V('First look: Render → mallakhamb-server → Events and Logs. Likely: a failed deploy (missing env var), free hours exhausted (Billing → Usage), or METRICS_TOKEN differs between Render and the Grafana scrape job. Runbook: PLAN.md §8 "API down / Scrape missing".',
        `First look, over the Bastion on the active: systemctl status mallakhamb caddy; journalctl -u mallakhamb -n 200. Likely: a failed deploy (sudo mallakhamb-rollback), a missing env var (sudo mallakhamb-envcheck), or METRICS_TOKEN differs between the server and the Grafana scrape job. If the VM itself is gone: ${P.failover}. Runbook: PLAN.md §8 "API down / Scrape missing".`)],
    ['mk-scrape-missing', 'Scrape missing', `absent(up{${S}})`, 'gt', 0, '10m', 'critical', 'mallakhamb-api-overview', 1,
      'No scrape results at all for mallakhamb-api for 10 minutes.',
      'The Grafana Cloud scrape job itself has stopped or was renamed (Connections → Metrics Endpoint → mallakhamb-api). Runbook: PLAN.md §8 "API down / Scrape missing".'],
    ['mk-high-5xx', 'High 5xx', `(${ratio5xx}) and on() (sum(rate(${H()}[5m])) > 0.05)`, 'gt', 0.02, '10m', 'critical', 'mallakhamb-api-overview', 13,
      'More than 2 % of API requests are failing with 5xx ({{ humanizePercentage $values.A.Value }}).',
      V('First look: API overview → "Errors by route", then Render logs by correlation id. One route = a recent commit; every route = the database (Database dashboard). Runbook: PLAN.md §8 "High 5xx".',
        'First look: API overview → "Errors by route", then journalctl -u mallakhamb on the active by correlation id. One route = a recent commit; every route = the database (Database dashboard). Runbook: PLAN.md §8 "High 5xx".')],
    ['mk-slow-api', 'Slow API', `histogram_quantile(0.95, sum by (le) (rate(http_server_requests_seconds_bucket{${S}}[5m])))`, 'gt', 1.5, '10m', 'warning', 'mallakhamb-api-overview', 8,
      'API p95 latency is above 1.5 s ({{ humanizeDuration $values.A.Value }}).',
      V('First look: API overview → "Slowest routes", and the Runtime dashboard. Usually a heavy synchronous handler (results, exports) on 0.1 CPU, or long GC. Runbook: PLAN.md §8 "Slow API / Event loop blocked".',
        'First look: API overview → "Slowest routes", and the Runtime dashboard. Usually a heavy synchronous handler (results, exports) blocking the one event loop, or long GC. Runbook: PLAN.md §8 "Slow API / Event loop blocked".')],
    ['mk-event-loop', 'Event loop blocked', `nodejs_eventloop_lag_p99_seconds{${S}}`, 'gt', 0.2, '5m', 'warning', 'mallakhamb-runtime', 8,
      'Event-loop lag p99 is above 200 ms ({{ humanizeDuration $values.A.Value }}).',
      'Every request and socket event waits behind this. First look: Runtime → CPU and GC; API overview → "Slowest routes". Runbook: PLAN.md §8 "Slow API / Event loop blocked".'],
    ['mk-memory', 'Memory near limit', `process_resident_memory_bytes{${S}}`, 'gt', V(435e6, Math.round(0.85 * P.mem)), '10m', 'warning', 'mallakhamb-runtime', 6,
      V('API memory is above 435 MB, about 81 % of the 512 MiB free-plan limit ({{ humanize1024 $values.A.Value }}B).',
        `API memory is above 85 % of its ${memText} budget ({{ humanize1024 $values.A.Value }}B).`),
      V('Render restarts the process at 512 MiB, which drops every live tablet connection. First look: Runtime → RSS and heap. Runbook: PLAN.md §8 "Memory near limit / Restart loop".',
        'Past the budget the VM swaps, then the kernel may kill the process, which drops every live tablet connection (systemd restarts it). First look: Runtime → RSS and heap, then the Host row. Runbook: PLAN.md §8 "Memory near limit / Restart loop".')],
    ['mk-cpu', 'CPU saturated', `rate(process_cpu_seconds_total{${S}}[5m])`, 'gt', V(0.08, 0.8 * P.cpu), '15m', 'warning', 'mallakhamb-runtime', 5,
      V('API CPU is above 80 % of the 0.1-core free-plan allowance for 15 minutes.',
        'API CPU is above 80 % of one core (the Node event loop) for 15 minutes.'),
      V('Expected briefly during a meet. Persistent → consider the Starter instance. Runbook: PLAN.md §8 "CPU saturated".',
        'Expected briefly during a meet. Persistent → one handler is hogging the event loop (API overview → "Slowest routes"); more cores will not help a single event loop. Runbook: PLAN.md §8 "CPU saturated".')],
    ['mk-restart-loop', 'Restart loop', `changes(process_start_time_seconds{${S}}[30m])`, 'gt', 2, '0s', 'critical', 'mallakhamb-api-overview', 5,
      'The API restarted more than twice in 30 minutes.',
      V('A deploy is one restart; more means crashes or out-of-memory kills. First look: Render → Events, then Runtime → RSS. Runbook: PLAN.md §8 "Memory near limit / Restart loop".',
        'A deploy is one restart; more means crashes or out-of-memory kills. First look: journalctl -u mallakhamb on the active, then Runtime → Host → OOM kills. Runbook: PLAN.md §8 "Memory near limit / Restart loop".')],
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
      V('First look: Competition day → "Payment webhooks", and Razorpay dashboard → Webhooks. rejected_signature → RAZORPAY_WEBHOOK_SECRET mismatch; error → Render logs. Runbook: PLAN.md §8 "Payment webhook problem".',
        'First look: Competition day → "Payment webhooks", and Razorpay dashboard → Webhooks. rejected_signature → RAZORPAY_WEBHOOK_SECRET mismatch; error → journalctl -u mallakhamb on the active. Runbook: PLAN.md §8 "Payment webhook problem".')],
    // Phase 5: outside-in. Synthetic checks from Mumbai and Hyderabad
    // (deploy/monitoring/synthetics/apply-checks.js). Fires when every probe —
    // both of them — fails the same check, so one probe's bad network is not a page.
    ['mk-uptime-check', 'Uptime check failing', 'count by (job) (probe_success{job=~"api-ready|web-home"} == 0)', 'gt', 1, '5m', 'critical', 'mallakhamb-api-overview', 24,
      'Outside-in check {{ $labels.job }} is failing from both Mumbai and Hyderabad.',
      V('This is what a tablet in India sees, including DNS, TLS and Render\'s proxy. api-ready → GET /api/health/ready (needs the database); web-home → the SPA. First look: API overview → "Outside-in" row, then Render → Events. If /metrics still scrapes (API down is quiet), suspect DNS/TLS/Render routing or the database. Runbook: PLAN.md §8 "Uptime check failing".',
        'This is what a tablet in India sees, including DNS, TLS and Caddy. api-ready → GET /api/health/ready (needs the database); web-home → the SPA. First look: API overview → "Outside-in" row, then on the active: systemctl status caddy mallakhamb. If /metrics still scrapes (API down is quiet), suspect DNS, the certificate (journalctl -u caddy) or the database. Runbook: PLAN.md §8 "Uptime check failing".')],
  ];

  // COMMON.md C1.7: the VM itself (Alloy). Active only (scrape_job="mallakhamb-host"),
  // except the two standby rules.
  if (P.host) RULES.push(
    ['mk-host-missing', 'Host metrics missing', `absent(up{${HJ}})`, 'gt', 0, '10m', 'critical', 'mallakhamb-runtime', HOST_PANEL.cpu,
      'No host metrics from the active server for 10 minutes.',
      `Alloy on the active has stopped (systemctl status alloy; journalctl -u alloy), its Grafana token was revoked, or the VM is down; check "API down" too. If the VM is gone: ${P.failover}. Runbook: PLAN.md §8.`],
    ['mk-host-memory', 'Host memory high', `1 - node_memory_MemAvailable_bytes{${HJ}} / node_memory_MemTotal_bytes{${HJ}}`, 'gt', 0.85, '10m', 'warning', 'mallakhamb-runtime', HOST_PANEL.mem,
      'The active server is using more than 85 % of its memory ({{ humanizePercentage $values.A.Value }}).',
      'First look: Runtime → "Memory: % of plan" (is it the API?) and the Host row. Something besides the API (a stuck mongodump, a runaway script) shows as host memory without API RSS. Runbook: PLAN.md §8.'],
    ['mk-disk-filling', 'Disk filling', `1 - ${fsRatio('node_filesystem_avail_bytes', 'node_filesystem_size_bytes')}`, 'gt', 0.80, '10m', 'warning', 'mallakhamb-runtime', HOST_PANEL.disk,
      'The active server\'s root disk is more than 80 % full ({{ humanizePercentage $values.A.Value }}).',
      'First look: sudo du -xh / --max-depth=2 | sort -h | tail; journalctl --disk-usage; /var/log/mallakhamb; /opt/mallakhamb/releases (the deploy keeps the live one + 4). Runbook: PLAN.md §8.'],
    ['mk-disk-critical', 'Disk almost full', `1 - ${fsRatio('node_filesystem_avail_bytes', 'node_filesystem_size_bytes')}`, 'gt', 0.90, '10m', 'critical', 'mallakhamb-runtime', HOST_PANEL.disk,
      'The active server\'s root disk is more than 90 % full ({{ humanizePercentage $values.A.Value }}).',
      'At 100 % MongoDB tools, logging and deploys fail. Free space now (see "Disk filling"); sudo journalctl --vacuum-time=7d is safe. Runbook: PLAN.md §8.'],
    ['mk-backup-stale', 'Backup stale', `time() - mallakhamb_backup_last_success_timestamp_seconds{${HJ}}`, 'gt', 93600, '10m', 'warning', 'mallakhamb-runtime', HOST_PANEL.backup,
      'The last successful backup on the active is more than 26 hours old.',
      'First look: systemctl status mallakhamb-backup.timer mallakhamb-backup; journalctl -u mallakhamb-backup -n 100. Usually Atlas unreachable or the bucket upload refused. Runbook: PLAN.md §8.'],
    ['mk-oom-kill', 'Out-of-memory kill', `sum by (instance) (increase(node_vmstat_oom_kill{${HJ}}[15m]))`, 'gt', 0, '0m', 'critical', 'mallakhamb-runtime', HOST_PANEL.oom,
      'The kernel killed a process for memory on the active server.',
      'If it was the API, every tablet lost its connection (systemd restarted it). First look: sudo journalctl -k | grep -i oom, then Runtime → RSS and the Host row. Runbook: PLAN.md §8 "Memory near limit / Restart loop".'],
    ['mk-inodes', 'Inodes running out', fsRatio('node_filesystem_files_free', 'node_filesystem_files'), 'lt', 0.10, '10m', 'warning', 'mallakhamb-runtime', HOST_PANEL.inodes,
      'Less than 10 % of inodes are free on the active server\'s root disk.',
      'Millions of small files, usually a temp or session directory. First look: sudo du -x --inodes / --max-depth=3 | sort -n | tail. Runbook: PLAN.md §8.'],
    // The nightly full-season lifecycle check (deploy/oci/PLAN.md O14) runs on BOTH VMs.
    ['mk-e2e-failed', 'E2E failed', 'max by (instance) (mallakhamb_e2e_last_exit_code{scrape_job=~"mallakhamb-host|mallakhamb-host-standby"})', 'gt', 0, '0m', 'warning', 'mallakhamb-runtime', HOST_PANEL.e2eResult,
      'The nightly full-season check failed on {{ $labels.instance }} (exit {{ $values.A.Value }}).',
      'A real flow broke on that release (registration, squads, payment, panels, scoring or publishing), or the e2e database/Atlas user is wrong. First look, on that VM: journalctl -u mallakhamb-e2e -n 200 (the step report is at the end), then /var/log/mallakhamb-e2e. Fix before the next meet. Runbook: PLAN.md §8.'],
    ['mk-e2e-stale', 'E2E stale', 'time() - max by (instance) (mallakhamb_e2e_last_run_timestamp_seconds{scrape_job=~"mallakhamb-host|mallakhamb-host-standby"})', 'gt', 93600, '10m', 'warning', 'mallakhamb-runtime', HOST_PANEL.e2ePass,
      'The nightly e2e timer has not fired on {{ $labels.instance }} for more than 26 hours.',
      'Meet days still count as a run (skipped), so this means the timer itself stopped: systemctl status mallakhamb-e2e.timer mallakhamb-e2e; a run longer than 2 h is killed (TimeoutStartSec). Runbook: PLAN.md §8.'],
  );
  if (P.standby) RULES.push(
    ['mk-standby-missing', 'Standby missing', 'absent(up{scrape_job="mallakhamb-host-standby"})', 'gt', 0, '30m', 'warning', 'mallakhamb-runtime', HOST_PANEL.release,
      'No metrics from the warm standby for 30 minutes: there is nothing to fail over to.',
      `Over the Bastion on the standby: systemctl status alloy. If the VM is stopped or gone, rebuild it from the golden backup (${P.failover.replace(' O13', ' O12')}). Runbook: PLAN.md §8.`],
    ['mk-standby-behind', 'Standby behind the active', 'count(count by (sha) (mallakhamb_release_info))', 'gt', 1, '2h', 'warning', 'mallakhamb-runtime', HOST_PANEL.release,
      'The active and the standby hold different releases for 2 hours.',
      'A deploy reached one server only (Runtime → Host → Release shows the short shas). On the active: basename $(readlink /opt/mallakhamb/current) | cut -c1-40 gives the full sha; on the standby: sudo mallakhamb-deploy <that full 40-char sha>. Runbook: PLAN.md §8.'],
  );
    return { RULES };
  };

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

  /*
   * Until the cutover (COMMON.md C7) the OCI servers are staging and GROUP is
   * Render's. The nightly e2e check (deploy/oci/PLAN.md O14) already runs on
   * them, so its two alerts live now in a small group of their own: copies of
   * the OCI rules with a "-stg" uid, without the dashboard link (Render's
   * Runtime dashboard has no e2e panels). At the cutover PLATFORM='oci' puts
   * the originals in GROUP and this paste deletes the staging group.
   */
  const STAGING_GROUP = 'mallakhamb-oci-staging';
  const stagingRules = () => spec('oci').RULES
    .filter(([uid]) => uid.startsWith('mk-e2e-'))
    .map((r) => {
      const rule = buildRule([`${r[0]}-stg`, ...r.slice(1)]);
      delete rule.annotations.__dashboardUid__;
      delete rule.annotations.__panelId__;
      return { ...rule, ruleGroup: STAGING_GROUP };
    });

  // Loaded by export-yaml.js under Node: hand over the spec, apply nothing.
  if (typeof window === 'undefined') {
    module.exports = { spec, PLATFORMS: Object.keys(PRESETS), buildRule, GROUP, FOLDER_UID, ROUTE, STAGING_GROUP, stagingRules };
    return;
  }
  const { RULES } = spec(PLATFORM);

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

  const stagingUrl = `/api/v1/provisioning/folder/${FOLDER_UID}/rule-groups/${STAGING_GROUP}`;
  if (PLATFORM === 'render') {
    await call('stagingGroup', stagingUrl, 'PUT', {
      title: STAGING_GROUP, folderUid: FOLDER_UID, interval: 60, rules: stagingRules(),
    });
  } else {
    await call('stagingGroup', stagingUrl, 'DELETE');
  }

  console.table(out);
})();
