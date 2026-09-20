/**
 * `status: 'completed'` arrives at exactly the instant the meet locks.
 *
 * The point of the sweeper is that the stored status and the read-only state
 * are ONE fact. These tests hold it to that: the same boundary as the lock, to
 * the millisecond, and no earlier.
 *
 * They also pin the two properties that make the failure modes safe — the
 * sweeper never writes a meet the lock predicate would call open, and it is
 * idempotent, because several instances may run it at once.
 */

const mongoose = require('mongoose');

const CompetitionStatusService = require('../../src/services/competition/competition-status.service');
const { isCompetitionLocked, lockInstant } = require('../../src/utils/security/competition-lock.util');

const oid = () => new mongoose.Types.ObjectId();

const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

const ENDED = { _id: oid(), name: 'Pune State 2025', endDate: new Date('2025-03-14T00:00:00.000Z'), status: 'ongoing' };
const LAST_WRITABLE = new Date('2025-03-14T23:59:59.999Z');
const FIRST_FROZEN = new Date('2025-03-15T00:00:00.000Z');

/**
 * A repository that records what it was asked to do.
 * @param {Array} docs - what `find` returns, regardless of criteria
 */
function fakeRepository(docs) {
  const calls = { find: [], updateMany: [] };
  return {
    calls,
    async find(criteria, options) {
      calls.find.push({ criteria, options });
      return docs;
    },
    async updateMany(criteria, updates) {
      calls.updateMany.push({ criteria, updates });
      return { modifiedCount: docs.length };
    },
  };
}

describe('the sweeper completes a meet at the same instant it locks', () => {
  it('does nothing on the final writable millisecond of the end date', async () => {
    const repo = fakeRepository([ENDED]);
    const service = new CompetitionStatusService(repo, quiet);

    const result = await service.sweep(LAST_WRITABLE);

    expect(result.completed).toBe(0);
    expect(repo.calls.updateMany).toHaveLength(0);
    // …and the lock agrees it is still open at that instant.
    expect(isCompetitionLocked(ENDED, LAST_WRITABLE)).toBe(false);
  });

  it('completes it one millisecond later, when the lock fires', async () => {
    const repo = fakeRepository([ENDED]);
    const service = new CompetitionStatusService(repo, quiet);

    const result = await service.sweep(FIRST_FROZEN);

    expect(result.completed).toBe(1);
    expect(repo.calls.updateMany[0].updates).toEqual({ status: 'completed' });
    expect(isCompetitionLocked(ENDED, FIRST_FROZEN)).toBe(true);
  });

  it('prefilters on the same boundary the predicate uses', async () => {
    // The query is a prefilter for the index's benefit; `endDate` before
    // today's UTC midnight is exactly the locked set. If these two ever drift,
    // the sweeper would either miss meets or scan the whole collection.
    const repo = fakeRepository([]);
    const service = new CompetitionStatusService(repo, quiet);

    await service.sweep(FIRST_FROZEN);

    const { criteria } = repo.calls.find[0];
    expect(criteria.status).toEqual({ $ne: 'completed' });
    expect(criteria.endDate.$lt.toISOString()).toBe('2025-03-15T00:00:00.000Z');
    // One millisecond before that cutoff is the lock instant itself.
    expect(criteria.endDate.$lt.getTime() - 1).toBe(lockInstant(ENDED).getTime());
  });

  it('refuses to write a candidate the lock predicate calls open', async () => {
    // Defence against the query and the rule drifting: the predicate is the
    // only authority on whether a meet is closed.
    const live = { _id: oid(), name: 'Live', endDate: new Date('2099-01-01T00:00:00.000Z'), status: 'ongoing' };
    const repo = fakeRepository([live]);
    const service = new CompetitionStatusService(repo, quiet);

    const result = await service.sweep(FIRST_FROZEN);

    expect(result.completed).toBe(0);
    expect(repo.calls.updateMany).toHaveLength(0);
  });

  it('never locks or completes a meet with no end date', async () => {
    const noEnd = { _id: oid(), name: 'No end', status: 'ongoing' };
    const repo = fakeRepository([noEnd]);
    const service = new CompetitionStatusService(repo, quiet);

    expect((await service.sweep(FIRST_FROZEN)).completed).toBe(0);
  });

  it('stays idempotent, because several instances may sweep at once', async () => {
    const repo = fakeRepository([ENDED]);
    const service = new CompetitionStatusService(repo, quiet);

    await service.sweep(FIRST_FROZEN);
    await service.sweep(FIRST_FROZEN);

    // Both writes are filtered on `status: { $ne: 'completed' }`, so the second
    // one matches nothing rather than rewriting the field.
    for (const call of repo.calls.updateMany) {
      expect(call.criteria.status).toEqual({ $ne: 'completed' });
    }
  });
});

describe('the sweeper wakes at UTC midnight', () => {
  const service = new CompetitionStatusService(fakeRepository([]), quiet);

  it('schedules just AFTER the boundary, never a hair before', () => {
    // Firing early would find nothing overdue and then wait a whole day,
    // leaving `status` a day behind the lock.
    const justBeforeMidnight = new Date('2025-03-14T23:59:00.000Z');
    const delay = service.msUntilNextUtcMidnight(justBeforeMidnight);

    const wakesAt = new Date(justBeforeMidnight.getTime() + delay);
    expect(wakesAt.getTime()).toBeGreaterThan(lockInstant(ENDED).getTime());
    expect(wakesAt.toISOString().slice(0, 10)).toBe('2025-03-15');
  });

  it('waits at most a day plus the slack', () => {
    const justAfterMidnight = new Date('2025-03-14T00:00:01.000Z');
    const delay = service.msUntilNextUtcMidnight(justAfterMidnight);

    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 10_000);
  });

  it('does not hold the process open', () => {
    // A pending day-long timer would keep node and every jest worker alive.
    service.scheduleNext();
    expect(service.timer).not.toBeNull();

    service.stop();
    expect(service.timer).toBeNull();
  });

  it('comes up even when the startup sweep throws', async () => {
    // The lock does not depend on the sweeper, so a failed sweep must not stop
    // the server booting — the only casualty is a stale `status`.
    const broken = {
      find: async () => { throw new Error('connection lost'); },
      updateMany: async () => {},
    };
    const failing = new CompetitionStatusService(broken, quiet);

    await expect(failing.start()).resolves.toEqual({ scanned: 0, completed: 0 });
    expect(failing.timer).not.toBeNull();
    failing.stop();
  });
});
