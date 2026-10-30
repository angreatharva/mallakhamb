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
    // 4 GB VMs since 2026-10-24; mongod, the OCR sidecar and the e2e mongod share them (build-dashboards.js).
    oci: { cpu: 1, mem: 1.5 * GIB, host: true, standby: true, mongo: true, failover: 'deploy/oci/PLAN.md O13' },
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
      `Alloy on the active has stopped (systemctl status alloy; journalctl -u alloy), its Grafana token was revoked, or the VM is down; check "API down" too.${P.mongo ? ' Console → Instances: if it is STOPPED (Oracle idle reclaim) the Resource Scheduler starts it within 30 min; to serve sooner, or if the start fails (no A1 capacity), fail over. deploy/oci/IDLE-RECLAIM-PLAN.md §3C.' : ''} If the VM is gone: ${P.failover}. Runbook: PLAN.md §8.`],
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
    // The full-season lifecycle check (deploy/oci/PLAN.md O14) runs four times a day (IST 00/06/12/18):
    // 00 and 18 on whichever VM is active, 06 and 12 on the standby — so each VM's gap is at most 18 h.
    ['mk-e2e-failed', 'E2E failed', 'max by (instance) (mallakhamb_e2e_last_exit_code{scrape_job=~"mallakhamb-host|mallakhamb-host-standby"})', 'gt', 0, '0m', 'warning', 'mallakhamb-runtime', HOST_PANEL.e2eResult,
      'The full-season e2e check failed on {{ $labels.instance }} (exit {{ $values.A.Value }}).',
      'A real flow broke on that release (registration, squads, payment, panels, scoring or publishing), or the e2e database/Atlas user is wrong. First look, on that VM: journalctl -u mallakhamb-e2e -n 200 (the step report is at the end), then /var/log/mallakhamb-e2e. Fix before the next meet. Runbook: PLAN.md §8.'],
    ['mk-e2e-stale', 'E2E stale', 'time() - max by (instance) (mallakhamb_e2e_last_run_timestamp_seconds{scrape_job=~"mallakhamb-host|mallakhamb-host-standby"})', 'gt', 72000, '10m', 'warning', 'mallakhamb-runtime', HOST_PANEL.e2ePass,
      'The e2e check has not run on {{ $labels.instance }} for more than 20 hours.',
      'Each VM runs two of the four daily slots (its role decides which), and a skip — a meet today or tomorrow, a busy API, a desk in use, NO_E2E — still counts as a run. So this means the timer stopped, or the VM kept the wrong role for a day: systemctl status mallakhamb-e2e.timer mallakhamb-e2e; a run longer than 1 h is killed (TimeoutStartSec). Runbook: PLAN.md §8.'],
  );
  // The walk-in desk's OCR sidecar (deploy/oci/PLAN.md O15): bound to the API
  // unit, so it runs only on the active. Warning, not critical — the desk
  // still works by typing the form in.
  if (P.host) RULES.push(
    ['mk-ocr-down', 'OCR down on the active', `absent(mkwi_ocr_up{${HJ}})`, 'gt', 0, '10m', 'warning', 'mallakhamb-competition-day', 15,
      'The walk-in desk form reader has not reported for 10 minutes on the active server.',
      'Walk-in registration still works by typing each row. On the active: systemctl status mallakhamb-ocr; journalctl -u mallakhamb-ocr -n 100. Usually the model folder (/opt/mallakhamb/ocr-models) or the virtualenv of the current release; sudo mallakhamb-deploy <sha> rebuilds both. Runbook: deploy/oci/PLAN.md O15.'],
  );
  if (P.standby) RULES.push(
    ['mk-standby-missing', 'Standby missing', 'absent(up{scrape_job="mallakhamb-host-standby"})', 'gt', 0, '30m', 'warning', 'mallakhamb-runtime', HOST_PANEL.release,
      'No metrics from the warm standby for 30 minutes: there is nothing to fail over to.',
      `Over the Bastion on the standby: systemctl status alloy. If the VM is stopped${P.mongo ? ' (Oracle idle reclaim: the Resource Scheduler starts it within 30 min, IDLE-RECLAIM-PLAN.md §3C)' : ''} or gone, rebuild it from the golden backup (${P.failover.replace(' O13', ' O12')}). Runbook: PLAN.md §8.`],
    ['mk-standby-behind', 'Standby behind the active', 'count(count by (sha) (mallakhamb_release_info))', 'gt', 1, '2h', 'warning', 'mallakhamb-runtime', HOST_PANEL.release,
      'The active and the standby hold different releases for 2 hours.',
      'A deploy reached one server only (Runtime → Host → Release shows the short shas). On the active: basename $(readlink /opt/mallakhamb/current) | cut -c1-40 gives the full sha; on the standby: sudo mallakhamb-deploy <that full 40-char sha>. Runbook: PLAN.md §8.'],
  );
  // The self-hosted replica set (deploy/oci/MONGODB-SELF-HOSTED-PLAN.md §6). Gauges come from
  // mallakhamb-mongo-metrics on every member (app-01, app-02, db-03) through Alloy's textfile
  // collector; the backup ages from mallakhamb-oplog-slice / -offsite-copy on the active.
  const MJ = 'scrape_job=~"mallakhamb-host|mallakhamb-host-standby|mallakhamb-db"';
  const MDOC = 'Runbook: deploy/oci/MONGODB-SELF-HOSTED-PLAN.md §2 (failure matrix).';
  if (P.mongo) RULES.push(
    ['mk-mongo-no-primary', 'MongoDB has no primary', `max(mallakhamb_mongo_primary_present{${MJ}})`, 'lt', 1, '1m', 'critical', 'mallakhamb-database', 1,
      'No replica-set member sees a PRIMARY: nothing can be written.',
      `Two of three members are down or cut off from each other. On each VM over the Bastion: systemctl status mongod; journalctl -u mongod -n 100. Bring a second member back and the set elects a primary by itself. Only if two members are gone for good: forced reconfig to the survivor (owner decision; it can undo unreplicated writes). ${MDOC}`],
    ['mk-mongo-members-missing', 'MongoDB members not all answering', `count(mallakhamb_mongo_up{${MJ}} == 1) or vector(0)`, 'lt', 3, '5m', 'warning', 'mallakhamb-database', 1,
      'Only {{ $values.A.Value }} of the 3 replica-set members answer their health check.',
      `One member's mongod, VM or collector is down. Writes continue while two of three are up, but the next loss stops them. On the missing VM: systemctl status mongod mallakhamb-mongo-metrics.timer alloy. ${MDOC}`],
    ['mk-mongo-member-unhealthy', 'MongoDB member not healthy', `count(max by (member) (mallakhamb_mongo_member_state{${MJ}}) != 1 != 2) or vector(0)`, 'gt', 0, '2m', 'warning', 'mallakhamb-database', 1,
      'A replica-set member is not PRIMARY or SECONDARY (down, recovering or unreachable).',
      `See which in mallakhamb_mongo_member_state (8 = down, 3 = recovering, 6 = unknown). On that VM: journalctl -u mongod -n 100. A member that fell off the oplog needs a resync (empty its dbPath and restart). ${MDOC}`],
    ['mk-mongo-lag', 'MongoDB replication lag', `max(mallakhamb_mongo_replication_lag_seconds{${MJ}})`, 'gt', 30, '5m', 'warning', 'mallakhamb-database', 1,
      'A member is {{ humanizeDuration $values.A.Value }} behind the primary.',
      `Usually db-03 (the 1/8-OCPU micro) under heavy writes, or a slow disk. Harmless while app-01 and app-02 both run; with one of them down it slows every majority write. ${MDOC}`],
    ['mk-mongo-oplog-window', 'MongoDB oplog window short', `min(mallakhamb_mongo_oplog_window_seconds{${MJ}})`, 'lt', 172800, '30m', 'warning', 'mallakhamb-database', 1,
      'The oplog holds less than 48 h of history.',
      `A member down longer than the window must be resynced, and point-in-time restore depends on the slices keeping up. Raise replication.oplogSizeMB in install-mongo.sh (rolling restart) or find what writes so much. ${MDOC}`],
    ['mk-mongo-connections', 'MongoDB connections high', `max(mallakhamb_mongo_connections_current{${MJ}})`, 'gt', 300, '5m', 'warning', 'mallakhamb-database', 1,
      '{{ $values.A.Value }} open connections on one member.',
      `The API pool is up to 100 per process; more means a leak, a reconnect storm, or several API processes. ${MDOC}`],
    ['mk-mongo-rollback', 'MongoDB rollback files', `max(mallakhamb_mongo_rollback_files{${MJ}})`, 'gt', 0, '0m', 'warning', 'mallakhamb-database', 1,
      'A failover undid writes that had not reached a majority (files in mongod rollback/).',
      `The app writes with w:"majority", so these should never be acknowledged writes. Look at /var/lib/mongodb/rollback on that member (bsondump) before deleting. ${MDOC}`],
    // The host "Disk filling" rules watch the active only; every member holds a full copy of
    // the data (and db-03 runs on a 1 GB micro), so the members' disks get their own rule.
    ['mk-mongo-disk', 'MongoDB member disk filling', `max by (instance) (1 - node_filesystem_avail_bytes{${MJ},mountpoint="/"} / node_filesystem_size_bytes{${MJ},mountpoint="/"})`, 'gt', 0.80, '10m', 'warning', 'mallakhamb-runtime', HOST_PANEL.disk,
      'The root disk of {{ $labels.instance }} is more than 80 % full ({{ humanizePercentage $values.A.Value }}).',
      `At 100 % mongod on that member stops (drilled: it recovers by itself once space is freed). First look on that VM: sudo du -xh / --max-depth=2 | sort -h | tail; journalctl --disk-usage; /var/log/mongodb. ${MDOC}`],
    ['mk-mongo-data-size', 'Database growing past the free-tier plan', `max(mallakhamb_mongo_db_bytes{${MJ}})`, 'gt', 250e6, '1h', 'warning', 'mallakhamb-database', 1,
      'The application database is {{ humanize1024 $values.A.Value }}B (plan §4a alerts at 250 MB, Atlas M0 copy limit 512 MB).',
      'Check plan §4a: the M0 off-site copy, the bucket and db-03 run out first. Look for files or logs stored in MongoDB.'],
    ['mk-oplog-slice-stale', 'Point-in-time backups stalled', `time() - max(mallakhamb_oplog_slice_last_success_timestamp_seconds{${MJ}})`, 'gt', 2400, '10m', 'warning', 'mallakhamb-runtime', HOST_PANEL.backup,
      'No oplog slice for more than 40 minutes.',
      `On the active: systemctl status mallakhamb-oplog-slice.timer; journalctl -u mallakhamb-oplog-slice -n 50. Point-in-time restore cannot go past the last slice. ${MDOC}`],
    ['mk-pitr-base-stale', 'Point-in-time base stale', `time() - max(mallakhamb_pitr_base_last_success_timestamp_seconds{${MJ}})`, 'gt', 93600, '10m', 'warning', 'mallakhamb-runtime', HOST_PANEL.backup,
      'No point-in-time base dump for more than 26 hours.',
      `The first slice of each UTC day takes the base; see journalctl -u mallakhamb-oplog-slice. ${MDOC}`],
    ['mk-offsite-stale', 'Off-site copy stale', `time() - max(mallakhamb_offsite_last_success_timestamp_seconds{${MJ}})`, 'gt', 10800, '10m', 'warning', 'mallakhamb-runtime', HOST_PANEL.backup,
      'The hourly copy to Atlas has not succeeded for 3 hours.',
      `On the active: journalctl -u mallakhamb-offsite-copy -n 50. Usually Atlas's network access list (the active's public IP), the Atlas user, or M0's 512 MB limit. This copy is the way out if Oracle is lost. ${MDOC}`],
    ['mk-mongo-e2e-left', 'E2E database left behind', `max(mallakhamb_mongo_e2e_db_present{${MJ}}) > 0 and on() max(mallakhamb_e2e_last_exit_code{scrape_job=~"mallakhamb-host|mallakhamb-host-standby"}) == 0`, 'gt', 0, '6h', 'warning', 'mallakhamb-runtime', HOST_PANEL.e2eResult,
      'The nightly e2e database still exists 6 hours after a passing run.',
      'The run drops it after a pass (a failed run keeps it for inspection). Cleanup broke: journalctl -u mallakhamb-e2e -n 50; it is excluded from backups but takes space.'],
  );
  // db-03, the replica set's third member (readiness §3, IDLE-RECLAIM-PLAN.md A4): the app VMs have
  // mk-host-missing / mk-standby-missing; this is the same check for the micro VM.
  if (P.mongo) RULES.push(
    ['mk-vm-db-missing', 'db-03 VM silent', 'absent(up{scrape_job="mallakhamb-db"})', 'gt', 0, '10m', 'warning', 'mallakhamb-oci-resources', 1,
      'No metrics from db-03, the replica set third member, for 10 minutes.',
      'Console → Instances → mallakhamb-prod-db-03. STOPPED (Oracle idle reclaim, or a manual stop): the Resource Scheduler starts it within 30 min; the set keeps its primary on 2 of 3 members meanwhile, but the next loss stops writes. Running: systemctl status alloy over the Bastion. Runbook: deploy/oci/IDLE-RECLAIM-PLAN.md §3C.'],
  );
  // OCI money (deploy/oci/PRODUCTION-READINESS.md 1.2). The tenancy is Always Free, so ANY charge is a
  // mistake. mallakhamb-oci-cost reads the budget mallakhamb-guard (SGD 1.50, the tenancy bills in
  // SGD) hourly on both app VMs; OCI's own budget alerts email the same addresses as a second path.
  const CJ = 'scrape_job=~"mallakhamb-host|mallakhamb-host-standby"';
  if (P.mongo) RULES.push(
    ['mk-oci-cost-actual', 'OCI is charging money', `max(mallakhamb_oci_cost_actual{${CJ}})`, 'gt', 0, '0m', 'critical', 'mallakhamb-oci-resources', 1,
      'OCI has charged {{ $values.A.Value }} SGD this month. Always Free should cost nothing.',
      'Something paid exists or a free limit was crossed. Console → Billing & Cost Management → Cost Analysis, grouped by service, to find it; then delete or shrink it. The root quota mallakhamb-prod-quota-free-tier should make this impossible, so also check whether the quota changed. Runbook: deploy/oci/PRODUCTION-READINESS.md 1.2.'],
    ['mk-oci-cost-forecast', 'OCI forecast over the budget', `max(mallakhamb_oci_cost_forecast{${CJ}}) / max(mallakhamb_oci_budget_amount{${CJ}})`, 'gt', 1, '0m', 'warning', 'mallakhamb-oci-resources', 1,
      'OCI forecasts this month at {{ humanizePercentage $values.A.Value }} of the SGD 1.50 guard.',
      'Something will be billed before the month ends. Cost Analysis → forecast, grouped by service. Runbook: deploy/oci/PRODUCTION-READINESS.md 1.2.'],
    ['mk-oci-cost-stale', 'OCI cost data stale', `time() - max(mallakhamb_oci_cost_updated_timestamp_seconds{${CJ}})`, 'gt', 10800, '10m', 'warning', 'mallakhamb-oci-resources', 1,
      'The OCI budget has not been read for more than 3 hours, so the cost alerts are blind.',
      'On either app VM: sudo mallakhamb-oci-cost (prints the error); journalctl -u mallakhamb-oci-cost. Usually the policy mallakhamb-prod-pol-budget-read, or the budget mallakhamb-guard was renamed or deleted. OCI still emails its own budget alerts meanwhile.'],
  );
  // Automatic web failover (deploy/oci/AUTO-FAILOVER.md): mallakhamb-role on both app VMs. The
  // site's reserved IP decides the active; the standby takes it over when the active machine is gone.
  const ADOC = 'Runbook: deploy/oci/AUTO-FAILOVER.md.';
  if (P.mongo) RULES.push(
    ['mk-role-auto-failover', 'Automatic failover happened', `time() - max(mallakhamb_role_auto_failover_timestamp_seconds{${CJ}})`, 'lt', 3600, '0m', 'critical', 'mallakhamb-oci-resources', 1,
      'The standby took over the site in the last hour because the active VM was gone.',
      `The site should be up on the other VM. Find out why the old active died (Console → Instances; OCI audit; journalctl on it once it is back). When it returns it demotes itself. Fail back in a quiet window: sudo mallakhamb-role takeover on the VM that should be active. ${ADOC}`],
    ['mk-role-no-holder', 'Site IP attached to no VM', `max(mallakhamb_role_holds_service_ip{${CJ}})`, 'lt', 1, '3m', 'critical', 'mallakhamb-oci-resources', 1,
      'Neither app VM holds the site\'s reserved IP (137.23.63.84): the site is unreachable.',
      `Cloud Shell: bash ~/service-ip-setup.sh status. Put it back: sudo mallakhamb-role takeover on the VM that should be active, or deploy/oci/scripts/failover-ip.sh move <nn>. ${ADOC}`],
    ['mk-role-two-active', 'Two app VMs configured active', `sum(mallakhamb_role_is_active{${CJ}})`, 'gt', 1, '5m', 'warning', 'mallakhamb-oci-resources', 1,
      'Both app VMs run as the active (no STANDBY marker) for 5 minutes.',
      `Only the IP holder gets traffic, but both take backups. The non-holder's mallakhamb-role should demote it within a minute: journalctl -u mallakhamb-role -n 30 on it; is it in observe mode, or blind to OCI? ${ADOC}`],
    ['mk-role-judging', 'Standby thinks the active is gone', `max(mallakhamb_role_failover_bad_ticks{${CJ}})`, 'gt', 0, '0m', 'warning', 'mallakhamb-oci-resources', 1,
      'The standby has counted {{ $values.A.Value }} ticks of the active looking gone (it takes over at 6).',
      `Early warning. journalctl -u mallakhamb-role -n 20 on the standby shows why (site, OCI state, both database views). To stop a takeover during planned work: sudo touch /etc/mallakhamb/NO_AUTO_FAILOVER on the standby. ${ADOC}`],
    ['mk-role-stale', 'Role reconciler not running', `time() - min(mallakhamb_role_reconcile_timestamp_seconds{${CJ}})`, 'gt', 300, '5m', 'warning', 'mallakhamb-oci-resources', 1,
      'mallakhamb-role has not run on one app VM for more than 5 minutes.',
      `Automatic failover and self-demotion are off on that VM. systemctl status mallakhamb-role.timer; journalctl -u mallakhamb-role -n 30. ${ADOC}`],
    ['mk-role-oci-blind', 'Automatic failover cannot see OCI', `min(mallakhamb_role_oci_ok{${CJ}})`, 'lt', 1, '15m', 'warning', 'mallakhamb-oci-resources', 1,
      'An app VM cannot ask OCI who holds the site\'s IP, so it can neither take over nor step aside.',
      `On that VM: sudo mallakhamb-role status. Usually the policy mallakhamb-prod-pol-failover, or OCI's API is unreachable. Backups fall back to the STANDBY marker meanwhile. ${ADOC}`],
    ['mk-role-observe', 'Automatic failover only observing', `min(mallakhamb_role_mode_act{${CJ}})`, 'lt', 1, '1h', 'warning', 'mallakhamb-oci-resources', 1,
      'mallakhamb-role runs in observe mode on an app VM: it logs decisions but will not take over.',
      `Intended only while testing. Set ROLE_MODE=act in /etc/mallakhamb/role.env on both app VMs. ${ADOC}`],
    ['mk-mongo-cert-expiry', 'MongoDB member certificate expiring', `min(mallakhamb_mongo_member_cert_expiry_timestamp_seconds{${MJ}}) - time()`, 'lt', 60 * 86400, '1h', 'warning', 'mallakhamb-database', 1,
      'A replica-set member certificate expires in {{ humanizeDuration $values.A.Value }}.',
      `When it expires the members refuse each other and the set falls apart. Re-issue from the private CA (Vault secrets mallakhamb-prod-bom-secret-mongo-*, deploy/server/mongo-tls-fetch.sh) and restart one member at a time. ${MDOC}`],
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
  // Since M4 staging runs on the self-hosted replica set, so its rules are live here too.
  // Since 2026-10-24 also the VM-silent rules (idle reclaim, readiness §3): a stopped VM must page now.
  const STAGING_PREFIXES = ['mk-e2e-', 'mk-role-', 'mk-mongo-', 'mk-oplog-', 'mk-pitr-', 'mk-offsite-', 'mk-oci-cost-', 'mk-host-missing', 'mk-standby-missing', 'mk-vm-'];
  const stagingRules = () => spec('oci').RULES
    .filter(([uid]) => STAGING_PREFIXES.some((p) => uid.startsWith(p)))
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
