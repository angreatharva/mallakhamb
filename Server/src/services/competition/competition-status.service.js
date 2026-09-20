/**
 * Competition Status Sweeper
 *
 * Moves a competition to `status: 'completed'` at the instant it locks —
 * 23:59:59.999 UTC on its `endDate` — so the stored status and the read-only
 * state are the same fact rather than two facts that can disagree.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `status` was only ever changed by hand, through
 * `PATCH /api/competitions/:id/status`. `Competition.setInitialStatus()` and
 * `updateStatus()` have always been on the model and are called by NOTHING, so
 * in practice every meet sat at `upcoming` or `ongoing` forever — including
 * meets that finished years ago. Anything reading the field got the wrong
 * answer: `getActiveCompetitions()` lists `findByStatus('ongoing')`, and closed
 * meets never left it.
 *
 * Now the calendar does it.
 *
 * ── status is a MIRROR, never the source ───────────────────────────────────
 *
 * The lock itself does not read `status` and must never be changed to. It is
 * computed per request from `endDate` by `competition-lock.util`, which cannot
 * be stale, cannot be edited, and does not depend on a sweeper having run. This
 * service only writes the field DOWN so it can be queried and displayed.
 *
 * That ordering is what makes the failure modes benign: if this sweeper never
 * runs at all, a closed meet is still fully read-only — its `status` just reads
 * `ongoing`, exactly as it did before this file existed.
 *
 * A consequence worth knowing: a super admin who sets a closed meet back to
 * `ongoing` will see the next sweep set it to `completed` again, because the
 * calendar wins. Reopening a meet means moving its `endDate` — which also
 * unlocks it. One control, not two.
 *
 * ── Why an in-process timer ────────────────────────────────────────────────
 *
 * There is no scheduler in this stack and no cron on the Render deployment.
 * `utils/auth/token.util` and `utils/auth/otp.util` already sweep on
 * `setInterval` for the same reason, so this is the established shape.
 *
 * It fires ONCE A DAY rather than on a short interval: the boundary is a
 * calendar edge, so the timer is scheduled to the next UTC midnight — the first
 * instant after 23:59:59.999 — and reschedules itself from there. A sweep also
 * runs at startup, which is what catches meets that ended while the process was
 * down or redeployed.
 *
 * Safe to run in several instances at once: the write is an idempotent
 * `updateMany` filtered on `status: { $ne: 'completed' }`.
 *
 * @module services/competition/competition-status.service
 */

const { startOfUtcDay } = require('../../utils/data/day-boundary.util');
const { isCompetitionLocked } = require('../../utils/security/competition-lock.util');

/** One day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Slack added to the scheduled wake-up.
 *
 * The timer targets 00:00:00.000 UTC, one millisecond past the lock instant.
 * Firing a hair EARLY — which clock skew and timer rounding both allow — would
 * find nothing overdue and then wait a full day to look again, leaving the
 * status a day behind the lock. A few seconds late costs nothing.
 */
const WAKE_SLACK_MS = 5_000;

class CompetitionStatusService {
  /**
   * @param {CompetitionRepository} competitionRepository
   * @param {Logger} logger
   */
  constructor(competitionRepository, logger) {
    this.competitionRepository = competitionRepository;
    this.logger = logger;
    this.timer = null;
  }

  /**
   * Mark every meet whose end date has passed as completed.
   *
   * The database query is a PREFILTER only — `endDate` before today's UTC
   * midnight is exactly the set that `isCompetitionLocked` calls locked, but
   * each candidate is still put to that predicate before it is written. The
   * rule has one home; this method is not allowed to become a second copy of
   * it.
   *
   * @param {Date} [at] - the instant to sweep for, defaults to now
   * @returns {Promise<{scanned: number, completed: number}>}
   */
  async sweep(at = new Date()) {
    const candidates = await this.competitionRepository.find(
      {
        status: { $ne: 'completed' },
        endDate: { $lt: startOfUtcDay(at) },
      },
      { select: '_id name endDate status' }
    );

    const overdue = (candidates || []).filter((c) => isCompetitionLocked(c, at));

    if (overdue.length === 0) {
      this.logger.debug('Competition status sweep: nothing to complete', {
        scanned: candidates?.length || 0,
      });
      return { scanned: candidates?.length || 0, completed: 0 };
    }

    await this.competitionRepository.updateMany(
      { _id: { $in: overdue.map((c) => c._id) }, status: { $ne: 'completed' } },
      { status: 'completed' }
    );

    this.logger.info('Competition status sweep: meets marked completed', {
      completed: overdue.length,
      competitions: overdue.map((c) => ({ id: String(c._id), name: c.name, was: c.status })),
    });

    return { scanned: candidates.length, completed: overdue.length };
  }

  /**
   * Milliseconds from `from` until the next UTC midnight, plus slack.
   *
   * @param {Date} from
   * @returns {number}
   */
  msUntilNextUtcMidnight(from = new Date()) {
    const nextMidnight = startOfUtcDay(from).getTime() + DAY_MS;
    return nextMidnight - from.getTime() + WAKE_SLACK_MS;
  }

  /**
   * Sweep now, then at every UTC midnight after.
   *
   * Started from `server.js` inside the `listen` callback, so it does not run
   * in the test harnesses that import the app without starting it.
   *
   * @returns {Promise<{scanned: number, completed: number}>} the startup sweep
   */
  async start() {
    let result = { scanned: 0, completed: 0 };

    try {
      result = await this.sweep();
    } catch (error) {
      // A failed sweep must not stop the server coming up: the lock does not
      // depend on it, so the only casualty is a stale `status` field.
      this.logger.error('Competition status sweep failed at startup', { error: error.message });
    }

    this.scheduleNext();
    return result;
  }

  /**
   * Arm the timer for the next UTC midnight, replacing any existing one.
   */
  scheduleNext() {
    this.stop();

    const delay = this.msUntilNextUtcMidnight();
    this.timer = setTimeout(async () => {
      try {
        await this.sweep();
      } catch (error) {
        this.logger.error('Competition status sweep failed', { error: error.message });
      }
      // Rescheduled from inside the tick rather than with setInterval, so a
      // slow sweep cannot overlap itself and the next wake-up is recomputed
      // against the real clock instead of drifting by the sweep's duration.
      this.scheduleNext();
    }, delay);

    // Never hold the process open. A pending day-long timer would keep `node`
    // and every jest worker alive on its own.
    if (typeof this.timer.unref === 'function') this.timer.unref();

    this.logger.debug('Competition status sweep scheduled', {
      inMs: delay,
      at: new Date(Date.now() + delay).toISOString(),
    });
  }

  /** Cancel the pending sweep. */
  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

module.exports = CompetitionStatusService;
