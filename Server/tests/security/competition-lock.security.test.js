/**
 * A competition freezes at 23:59 UTC on its end date.
 *
 * From that instant nobody writes to it — not the admins running it, not the
 * panel scoring it, not the coaches entered in it. Only a super admin, who has
 * to be able to fix a transcription error found the next morning or push the
 * end date out when an event overruns.
 *
 * Two things are exercised here: the RULE (`competition-lock.util`, a pure
 * function of a competition and an instant) and the GUARD
 * (`competition-lock.middleware`, which resolves which meet a request is about
 * and turns the rule into a 423). They are tested directly rather than through
 * a mounted app for the same reason `competition-scope.security.test.js` is —
 * the decision is not in the routing.
 */

const mongoose = require('mongoose');

const {
  isCompetitionLocked,
  lockInstant,
  mayBypassCompetitionLock,
  describeCompetitionLock,
  LOCKED_STATUS,
  LOCKED_CODE,
} = require('../../src/utils/security/competition-lock.util');
const { createCompetitionLockGuard } = require('../../src/middleware/competition-lock.middleware');
const { resolveFeeWindow, FEE_PHASE } = require('../../src/config/payment.config');

const oid = () => new mongoose.Types.ObjectId();

const MEET = oid();
const ENDED = { _id: MEET, name: 'Pune State 2025', endDate: new Date('2025-03-14T00:00:00.000Z') };

/** The two edges of the last day: still writable, and the first frozen instant. */
const LAST_WRITABLE = new Date('2025-03-14T23:59:59.999Z');
const FIRST_FROZEN = new Date('2025-03-15T00:00:00.000Z');

const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

/**
 * A container holding just what the guard resolves.
 * @param {Object} [overrides] - `competition` served by findById, or `null`
 */
function containerWith({ competition = ENDED, score = null } = {}) {
  return {
    resolve(name) {
      if (name === 'competitionRepository') return { findById: async () => competition };
      if (name === 'scoreRepository') return { findById: async () => score };
      if (name === 'logger') return quiet;
      throw new Error(`not registered: ${name}`);
    },
  };
}

/** A fake res that records the status and body a middleware terminated with. */
function recorder() {
  const sent = {};
  return {
    sent,
    status(code) { sent.status = code; return this; },
    json(body) { sent.body = body; return this; },
  };
}

/**
 * Run the guard once.
 * @param {Function} guard - the middleware under test
 * @param {Object} req - partial request
 * @returns {Promise<{sent: Object, nexted: boolean, error: Error|undefined}>}
 */
async function run(guard, req) {
  const res = recorder();
  let nexted = false;
  let error;
  await guard(
    { method: 'POST', path: '/x', originalUrl: '/x', headers: {}, body: {}, query: {}, params: {}, ...req },
    res,
    (err) => { nexted = !err; error = err; }
  );
  return { sent: res.sent, nexted, error };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('the lock boundary is 23:59:59.999 UTC on the end date', () => {
  it('is still open on the final millisecond of the end date', () => {
    expect(isCompetitionLocked(ENDED, LAST_WRITABLE)).toBe(false);
  });

  it('is locked one millisecond later', () => {
    expect(isCompetitionLocked(ENDED, FIRST_FROZEN)).toBe(true);
  });

  it('reads the day in UTC, not the host zone', () => {
    // The whole point of endOfUtcDay: `<input type="date">` sends YYYY-MM-DD,
    // which is parsed as UTC midnight. A local-time boundary would move this
    // instant whenever the process is deployed to another region.
    expect(lockInstant(ENDED).toISOString()).toBe('2025-03-14T23:59:59.999Z');
  });

  it('never locks a competition with no end date', () => {
    // Fails OPEN, deliberately — see the module header. Every access rule still
    // applies underneath.
    expect(lockInstant({ name: 'No end' })).toBeNull();
    expect(isCompetitionLocked({ name: 'No end' }, FIRST_FROZEN)).toBe(false);
    expect(isCompetitionLocked(null, FIRST_FROZEN)).toBe(false);
  });

  it('closes at the same instant the fee window does', () => {
    // These two must not be able to drift: a gap either way is a window where
    // money moves into a meet nobody can record it against, or registration
    // 423s while still advertising itself as open. Both read
    // `endOfUtcDay(endDate)` from `utils/data/day-boundary.util`.
    const window = resolveFeeWindow(ENDED, FIRST_FROZEN);

    expect(window.closesAt.getTime()).toBe(lockInstant(ENDED).getTime());
    expect(window.phase).toBe(FEE_PHASE.CLOSED);
    expect(resolveFeeWindow(ENDED, LAST_WRITABLE).canPay).toBe(true);
  });

  it('names the meet and the day it closed', () => {
    const { locked, message } = describeCompetitionLock(ENDED, FIRST_FROZEN);

    expect(locked).toBe(true);
    expect(message).toContain('Pune State 2025');
    expect(message).toContain('2025-03-14');
  });
});

describe('only a super admin may write to a frozen meet', () => {
  it('admits both spellings of the role, from the claim or the document', () => {
    expect(mayBypassCompetitionLock(null, 'superadmin')).toBe(true);
    expect(mayBypassCompetitionLock(null, 'super_admin')).toBe(true);
    expect(mayBypassCompetitionLock({ role: 'superadmin' }, 'admin')).toBe(true);
  });

  it('admits nobody else', () => {
    expect(mayBypassCompetitionLock({ role: 'admin' }, 'admin')).toBe(false);
    expect(mayBypassCompetitionLock({}, 'judge')).toBe(false);
    expect(mayBypassCompetitionLock({}, 'coach')).toBe(false);
    expect(mayBypassCompetitionLock(null, undefined)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('the guard refuses writes to a closed meet', () => {
  const guard = createCompetitionLockGuard(containerWith())();

  beforeAll(() => { jest.useFakeTimers().setSystemTime(FIRST_FROZEN); });
  afterAll(() => { jest.useRealTimers(); });

  it('answers 423 with COMPETITION_LOCKED', async () => {
    const { sent, nexted } = await run(guard, {
      user: { _id: oid(), role: 'admin' },
      userType: 'admin',
      body: { competitionId: String(MEET) },
    });

    expect(nexted).toBe(false);
    expect(sent.status).toBe(LOCKED_STATUS);
    expect(sent.status).toBe(423);
    expect(sent.body.error.code).toBe(LOCKED_CODE);
    expect(sent.body.error.lockedAt).toBe('2025-03-14T23:59:59.999Z');
  });

  it('does NOT answer 403 — that code means something else to the client', () => {
    // `Web/src/services/api-client.js` treats a 403 mentioning a competition as
    // a stale context and bounces the user to competition selection. Reusing it
    // here would log an admin out of a meet they are legitimately reading.
    expect(LOCKED_STATUS).not.toBe(403);
  });

  it('refuses a judge the same way', async () => {
    const { sent } = await run(guard, {
      user: { _id: oid() },
      userType: 'judge',
      body: { competitionId: String(MEET) },
    });

    expect(sent.status).toBe(423);
  });

  it('refuses a coach the same way', async () => {
    const { sent } = await run(guard, {
      user: { _id: oid() },
      userType: 'coach',
      body: { competitionId: String(MEET) },
    });

    expect(sent.status).toBe(423);
  });

  it('lets a superadmin through', async () => {
    const { nexted, sent } = await run(guard, {
      user: { _id: oid(), role: 'superadmin' },
      userType: 'superadmin',
      body: { competitionId: String(MEET) },
    });

    expect(nexted).toBe(true);
    expect(sent.status).toBeUndefined();
  });

  it('lets every read through, whoever asks', async () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const { nexted } = await run(guard, {
        method,
        user: { _id: oid(), role: 'admin' },
        userType: 'admin',
        query: { competitionId: String(MEET) },
      });
      expect(nexted).toBe(true);
    }
  });

  it('reads the meet from the route param when told to', async () => {
    // `/api/competitions/:id` names its meet in the PATH, and the shared
    // resolution chain deliberately does not read `:id` — so an admin whose
    // TOKEN names a live meet cannot edit a closed one by putting its id in the
    // URL.
    const byParam = createCompetitionLockGuard(containerWith())({ param: 'id' });

    const { sent } = await run(byParam, {
      method: 'PUT',
      user: { _id: oid(), role: 'admin' },
      userType: 'admin',
      params: { id: String(MEET) },
      user_currentCompetition: undefined,
    });

    expect(sent.status).toBe(423);
  });

  it('reads the meet off a score document when told to', async () => {
    // `/api/scoring/:scoreId` names a SCORE; the meet is a field on it.
    const byScore = createCompetitionLockGuard(
      containerWith({ score: { _id: oid(), competition: MEET } })
    )({ scoreParam: 'scoreId' });

    const { sent } = await run(byScore, {
      method: 'PATCH',
      user: { _id: oid(), role: 'admin' },
      userType: 'admin',
      params: { scoreId: String(oid()) },
    });

    expect(sent.status).toBe(423);
  });
});

describe('the guard defers rather than inventing a refusal', () => {
  beforeAll(() => { jest.useFakeTimers().setSystemTime(FIRST_FROZEN); });
  afterAll(() => { jest.useRealTimers(); });

  it('passes a request naming no competition to the handler', async () => {
    // The handler answers its own 400/404. A request with no competition at all
    // must not be told that a competition is locked.
    const guard = createCompetitionLockGuard(containerWith())();

    const { nexted, sent } = await run(guard, { user: { _id: oid() }, userType: 'admin' });

    expect(nexted).toBe(true);
    expect(sent.status).toBeUndefined();
  });

  it('passes an unknown competition to the handler, which 404s it', async () => {
    const guard = createCompetitionLockGuard(containerWith({ competition: null }))();

    const { nexted } = await run(guard, {
      user: { _id: oid() },
      userType: 'admin',
      body: { competitionId: String(oid()) },
    });

    expect(nexted).toBe(true);
  });

  it('lets a meet that has not ended through', async () => {
    const live = { _id: MEET, name: 'Live', endDate: new Date('2099-01-01T00:00:00.000Z') };
    const guard = createCompetitionLockGuard(containerWith({ competition: live }))();

    const { nexted } = await run(guard, {
      user: { _id: oid() },
      userType: 'admin',
      body: { competitionId: String(MEET) },
    });

    expect(nexted).toBe(true);
  });
});

describe('a failed lookup is not an allow', () => {
  beforeAll(() => { jest.useFakeTimers().setSystemTime(FIRST_FROZEN); });
  afterAll(() => { jest.useRealTimers(); });

  it('surfaces the error instead of letting the write through', async () => {
    // Otherwise the lock would be bypassable by whatever made the read fail.
    const container = {
      resolve(name) {
        if (name === 'competitionRepository') {
          return { findById: async () => { throw new Error('connection lost'); } };
        }
        if (name === 'scoreRepository') return { findById: async () => null };
        if (name === 'logger') return quiet;
        throw new Error(`not registered: ${name}`);
      },
    };
    const guard = createCompetitionLockGuard(container)();

    const { nexted, error } = await run(guard, {
      user: { _id: oid() },
      userType: 'admin',
      body: { competitionId: String(MEET) },
    });

    expect(nexted).toBe(false);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('connection lost');
  });

  it('goes inert, loudly, when there is no competition repository to read', async () => {
    // A wiring fact, not a per-request one: `bootstrap.js` always registers it,
    // so this branch is dead in a real app. Failing CLOSED instead would answer
    // 423 to every write in the product over one missing registration.
    const warnings = [];
    const container = {
      resolve(name) {
        if (name === 'logger') return { ...quiet, warn: (msg) => warnings.push(msg) };
        return {}; // what the route-test harnesses hand back
      },
    };

    const guard = createCompetitionLockGuard(container)();
    const { nexted } = await run(guard, {
      user: { _id: oid() },
      userType: 'admin',
      body: { competitionId: String(MEET) },
    });

    expect(nexted).toBe(true);
    expect(warnings.join(' ')).toContain('INACTIVE');
  });

  it('builds even when the container has no score repository', async () => {
    // Several harnesses build a minimal container; a missing scoreRepository
    // must degrade, not crash every route in the file at construction time.
    const container = {
      resolve(name) {
        if (name === 'competitionRepository') return { findById: async () => ENDED };
        if (name === 'logger') return quiet;
        throw new Error(`not registered: ${name}`);
      },
    };

    const guard = createCompetitionLockGuard(container)({ scoreParam: 'scoreId' });
    const { sent } = await run(guard, {
      user: { _id: oid() },
      userType: 'admin',
      params: { scoreId: String(oid()) },
      body: { competitionId: String(MEET) },
    });

    // Falls through to the standard chain, which finds the meet in the body.
    expect(sent.status).toBe(423);
  });
});

describe('the lock is PER COMPETITION, never per principal', () => {
  /**
   * Closing one meet must not cost anyone a single write on another.
   *
   * This is the property that makes the feature usable at all: the admins,
   * judges and coaches who ran last season's meet are the same people running
   * this season's, and a lock that attached to the PERSON rather than to the
   * COMPETITION would take the product away from them the day their first event
   * ended.
   *
   * It holds because the guard resolves which meet each individual request is
   * aimed at and asks only about that one — it never consults a principal's
   * history.
   */
  const LIVE = oid();
  const liveMeet = { _id: LIVE, name: 'Nagpur State 2099', endDate: new Date('2099-06-01T00:00:00.000Z') };

  /** A repository holding BOTH meets, answering by id like the real one. */
  const bothMeets = {
    resolve(name) {
      if (name === 'competitionRepository') {
        return { findById: async (id) => (String(id) === String(MEET) ? ENDED : liveMeet) };
      }
      if (name === 'scoreRepository') return { findById: async () => null };
      if (name === 'logger') return quiet;
      throw new Error(`not registered: ${name}`);
    },
  };

  const guard = createCompetitionLockGuard(bothMeets)();

  beforeAll(() => { jest.useFakeTimers().setSystemTime(FIRST_FROZEN); });
  afterAll(() => { jest.useRealTimers(); });

  for (const userType of ['admin', 'judge', 'coach', 'player']) {
    it(`lets a ${userType} write freely to a meet that is still open`, async () => {
      const { nexted, sent } = await run(guard, {
        user: { _id: oid() },
        userType,
        body: { competitionId: String(LIVE) },
      });

      expect(nexted).toBe(true);
      expect(sent.status).toBeUndefined();
    });

    it(`refuses that same ${userType} on the closed meet`, async () => {
      const { sent } = await run(guard, {
        user: { _id: oid() },
        userType,
        body: { competitionId: String(MEET) },
      });

      expect(sent.status).toBe(423);
    });
  }

  it('judges each request on its own, not on the token the caller carries', async () => {
    // An admin whose token still names the CLOSED meet, writing to the open one
    // — the body names the meet being acted on, and that is the one asked about.
    const { nexted } = await run(guard, {
      user: { _id: oid(), currentCompetition: String(MEET) },
      userType: 'admin',
      body: { competitionId: String(LIVE) },
    });

    expect(nexted).toBe(true);
  });

  it('covers every mutating verb on the open meet', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { nexted } = await run(guard, {
        method,
        user: { _id: oid() },
        userType: 'coach',
        body: { competitionId: String(LIVE) },
      });
      expect(nexted).toBe(true);
    }
  });
});
