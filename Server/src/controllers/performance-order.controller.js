/**
 * Performance Order Controller
 *
 * HTTP surface for the running order of a competition category.
 *
 * The same three read/write handlers are mounted under `/api/admin`,
 * `/api/superadmin` and `/api/judge`; the routers differ only in the guard in
 * front of them. Who is allowed to do what is therefore decided in exactly one
 * place per operation:
 *
 *   - `drawLots`  — admin / superadmin only (router guard `requireAdmin`)
 *   - `setTeamOrder` / `setPlayerOrder` — admin / superadmin, or the Senior
 *     Judge / Scorer of that specific panel. The judge case is re-checked
 *     against the judge's own assignments inside the service, because a
 *     role guard alone would let the Senior Judge of Under-14 Male re-sequence
 *     Under-18 Female.
 *
 * @module controllers/performance-order.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

/**
 * Describe the caller for the audit fields and the broadcast payload.
 * @param {import('express').Request} req
 * @returns {{id: *, name: string, role: string}}
 */
function actorFrom(req) {
  const user = req.user || {};
  return {
    id: user._id || null,
    name: user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || '',
    role: req.userType === 'judge' ? (user.judgeType || 'judge') : (user.role || req.userType || ''),
  };
}

/**
 * Resolve the competition for this request.
 *
 * Admin routes get it from the competition-context middleware; superadmin and
 * judge routes send it explicitly, because neither is scoped to a single
 * competition by its token the way an admin is.
 *
 * @param {import('express').Request} req
 * @returns {string|undefined}
 */
function competitionFrom(req) {
  return (
    req.competitionId ||
    req.query.competitionId ||
    req.query.competition ||
    req.body?.competitionId ||
    req.body?.competition ||
    req.user?.currentCompetition ||
    req.user?.competition
  );
}

/**
 * Pull the category filters out of query or body, whichever the verb uses.
 * @param {import('express').Request} req
 * @returns {{gender: string, ageGroup: string, competitionType: string}}
 */
function filtersFrom(req) {
  const src = req.method === 'GET' ? req.query : { ...req.query, ...req.body };
  return {
    gender: src.gender,
    ageGroup: src.ageGroup,
    competitionType: src.competitionType,
  };
}

function createPerformanceOrderController(container) {
  const performanceOrderService = container.resolve('performanceOrderService');

  /**
   * For a judge, confirm they sit on this panel in a sequencing role.
   * Admins and superadmins run the event and are not scoped to one panel.
   */
  const authorizeWrite = async (req, identityFilters, competitionId) => {
    if (req.userType !== 'judge') return;
    const identity = performanceOrderService.buildIdentity(competitionId, identityFilters);
    await performanceOrderService.assertJudgeMaySequence(req.user, identity);
  };

  return {
    /**
     * @route GET /api/admin/lots
     * @route GET /api/superadmin/lots
     * @route GET /api/judge/lots
     * @desc  Teams and athletes for a category, already in running order.
     */
    getOrder: asyncHandler(async (req, res) => {
      const roster = await performanceOrderService.getOrderedRoster(
        competitionFrom(req),
        filtersFrom(req)
      );
      res.json({ success: true, data: roster });
    }),

    /**
     * @route POST /api/admin/lots/draw
     * @route POST /api/superadmin/lots/draw
     * @desc  Draw lots for the category. Admin / SuperAdmin only.
     */
    drawLots: asyncHandler(async (req, res) => {
      const roster = await performanceOrderService.drawLots(
        competitionFrom(req),
        filtersFrom(req),
        actorFrom(req),
        // Athletes are numbered along with the teams unless the caller opts
        // out, which is what an admin does when the panel has already
        // hand-sequenced the athletes and only the team draw is being redone.
        { includePlayers: req.body?.includePlayers !== false }
      );
      res.json({ success: true, data: roster, message: 'Lots drawn successfully' });
    }),

    /**
     * @route PUT /api/admin/lots/teams
     * @route PUT /api/superadmin/lots/teams
     * @route PUT /api/judge/lots/teams
     * @desc  Set the team running order from a drag-and-drop reorder.
     */
    setTeamOrder: asyncHandler(async (req, res) => {
      const competitionId = competitionFrom(req);
      const filters = filtersFrom(req);
      await authorizeWrite(req, filters, competitionId);

      const roster = await performanceOrderService.setTeamOrder(
        competitionId,
        filters,
        req.body?.teamIds,
        actorFrom(req)
      );
      res.json({ success: true, data: roster, message: 'Team order updated' });
    }),

    /**
     * @route PUT /api/admin/lots/players
     * @route PUT /api/superadmin/lots/players
     * @route PUT /api/judge/lots/players
     * @desc  Set the athlete running order inside one team.
     */
    setPlayerOrder: asyncHandler(async (req, res) => {
      const competitionId = competitionFrom(req);
      const filters = filtersFrom(req);
      await authorizeWrite(req, filters, competitionId);

      const roster = await performanceOrderService.setPlayerOrder(
        competitionId,
        filters,
        req.body?.teamId,
        req.body?.playerIds,
        actorFrom(req)
      );
      res.json({ success: true, data: roster, message: 'Player order updated' });
    }),
  };
}

module.exports = createPerformanceOrderController;
