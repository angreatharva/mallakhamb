/**
 * Keep-alive — stops Render's free plan putting the API to sleep.
 *
 * A free Render web service spins down after 15 minutes without INBOUND
 * traffic, and the next request then waits ~50 s for a cold start — long enough
 * that a judge's tablet or a coach's payment times out. This pings the
 * service's own PUBLIC URL on an interval shorter than that window. The request
 * leaves the instance and comes back in through Render's proxy, so it counts as
 * inbound traffic exactly as a user's request would.
 *
 * What it cannot do is wake an instance that is already asleep — a sleeping
 * process runs no timers. It keeps a running instance running; an outside
 * pinger (UptimeRobot, cron-job.org) on `/api/health/ping` covers the rest.
 *
 * Configuration (all optional):
 *
 *   KEEP_ALIVE_URL               full URL to ping. Defaults to
 *                                `${RENDER_EXTERNAL_URL}/api/health/ping`;
 *                                Render sets RENDER_EXTERNAL_URL on every web
 *                                service, so on Render this needs no setup.
 *   KEEP_ALIVE_INTERVAL_MINUTES  default 10, clamped to 1–14.
 *   KEEP_ALIVE=false             turn it off.
 *
 * Off locally: without RENDER_EXTERNAL_URL or KEEP_ALIVE_URL there is nothing
 * to ping, so a laptop never pings itself.
 *
 * @module infrastructure/keep-alive
 */

const PING_PATH = '/api/health/ping';
const DEFAULT_INTERVAL_MINUTES = 10;
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * What to ping and how often, or null when keep-alive is off.
 *
 * @param {Object} [env=process.env]
 * @returns {{url: string, intervalMs: number} | null}
 */
function resolveKeepAlive(env = process.env) {
  if (String(env.KEEP_ALIVE).toLowerCase() === 'false') return null;

  const base = env.RENDER_EXTERNAL_URL ? String(env.RENDER_EXTERNAL_URL).replace(/\/+$/, '') : '';
  const url = env.KEEP_ALIVE_URL || (base ? `${base}${PING_PATH}` : '');
  if (!url) return null;

  const minutes = Number(env.KEEP_ALIVE_INTERVAL_MINUTES) || DEFAULT_INTERVAL_MINUTES;
  // Under 15 or the service sleeps between pings; at least 1 so a typo cannot
  // turn this into a request loop.
  const clamped = Math.min(14, Math.max(1, minutes));

  return { url, intervalMs: clamped * 60_000 };
}

/**
 * Start pinging. Safe to call when keep-alive is off — it does nothing.
 *
 * @param {Object} options
 * @param {Object} options.logger
 * @param {Object} [options.env=process.env]
 * @param {Function} [options.fetchImpl=globalThis.fetch]
 * @returns {{stop: Function, url: string|null, intervalMs: number|null}}
 */
function startKeepAlive({ logger, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const settings = resolveKeepAlive(env);
  if (!settings || typeof fetchImpl !== 'function') {
    return { stop: () => {}, url: null, intervalMs: null };
  }

  const ping = async () => {
    try {
      const response = await fetchImpl(settings.url, {
        headers: { 'User-Agent': 'mallakhamb-keep-alive' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        logger?.warn?.('Keep-alive ping answered with an error', { url: settings.url, status: response.status });
      } else {
        logger?.debug?.('Keep-alive ping ok', { url: settings.url });
      }
    } catch (error) {
      // Never fatal: a missed ping costs, at worst, one cold start.
      logger?.warn?.('Keep-alive ping failed', { url: settings.url, error: error.message });
    }
  };

  const timer = setInterval(ping, settings.intervalMs);
  // Must not hold the process open on shutdown.
  timer.unref?.();

  logger?.info?.('Keep-alive started', { url: settings.url, everyMinutes: settings.intervalMs / 60_000 });

  return { stop: () => clearInterval(timer), url: settings.url, intervalMs: settings.intervalMs };
}

module.exports = { resolveKeepAlive, startKeepAlive, PING_PATH };
