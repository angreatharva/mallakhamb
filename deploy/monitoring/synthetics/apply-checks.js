/**
 * Mallakhamb outside-in uptime checks (deploy/monitoring/PLAN.md, Phase 5).
 *
 * Source of truth for the Grafana Cloud Synthetic Monitoring checks. These
 * test the API and the web site the way a judge's tablet in India sees them
 * — DNS, TLS, Render's proxy — which the server's own /metrics cannot.
 *
 * To (re)apply: open https://sinceresloth366.grafana.net signed in as an
 * admin, open the browser console, paste this file, press Enter. Idempotent:
 * a check is matched by its `job` name and updated in place, otherwise added.
 *
 * Budget: free tier includes 100,000 executions/month.
 *   api-ready: 2 probes × every 2 min = 43,200/month
 *   web-home:  2 probes × every 5 min = 17,280/month
 *   total ≈ 60,480 (60 %). The Overview dashboard's "Synthetic executions"
 *   gauge shows the live share against the included amount.
 */
(async () => {
  // Public probes nearest the venues: Mumbai (16) and Hyderabad (101).
  // Looked up by name below so a renumbering on Grafana's side can't break it.
  const PROBES = ['Mumbai', 'Hyderabad'];

  const http = (validStatusCodes = [200]) => ({
    http: {
      method: 'GET', ipVersion: 'V4', noFollowRedirects: false,
      failIfSSL: false, failIfNotSSL: true, validStatusCodes, tlsConfig: {},
    },
  });

  const CHECKS = [
    {
      job: 'api-ready',
      target: 'https://mallakhamb-server.onrender.com/api/health/ready',
      frequency: 120000, // 2 min
      timeout: 10000,
      settings: http([200]),
    },
    {
      job: 'web-home',
      target: 'https://mallakhamb-web.onrender.com/',
      frequency: 300000, // 5 min
      timeout: 10000,
      settings: http([200]),
    },
  ];

  const sm = (await fetch('/api/datasources').then((r) => r.json()))
    .find((d) => d.type === 'synthetic-monitoring-datasource');
  if (!sm) throw new Error('Synthetic Monitoring is not initialised: Testing & synthetics → Synthetics → Get started');
  const api = (path, body) => fetch(`/api/datasources/proxy/uid/${sm.uid}/sm/${path}`, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : undefined);

  const probes = await api('probe/list').then((r) => r.json());
  const probeIds = PROBES.map((name) => {
    const p = probes.find((x) => x.name === name && x.public);
    if (!p) throw new Error(`Probe not found: ${name}`);
    return p.id;
  });

  const existing = await api('check/list').then((r) => r.json());
  const out = {};
  for (const c of CHECKS) {
    const body = {
      ...c, enabled: true, probes: probeIds,
      labels: [{ name: 'service', value: 'mallakhamb' }],
      alertSensitivity: 'none', basicMetricsOnly: true,
    };
    const found = existing.find((e) => e.job === c.job);
    const r = found
      ? await api('check/update', { ...body, id: found.id, tenantId: found.tenantId })
      : await api('check/add', body);
    const text = await r.text();
    out[c.job] = `${found ? 'updated' : 'added'} ${r.status} ${r.ok ? `id=${JSON.parse(text).id}` : text.slice(0, 200)}`;
  }
  console.table(out);
  return out;
})();
