/**
 * Tie-Break Draw Controller
 *
 * HTTP surface for recording a physical lucky draw (COP 1.12.4). Mounted under
 * `/api/admin` and `/api/superadmin`; the routers differ only in the guard and
 * in where the competition comes from.
 *
 * @module controllers/tie-break-draw.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');
const { fullName } = require('../utils/data/user-projection.util');
const { competitionIdFromRequest } = require('../utils/data/request-context.util');

/**
 * The caller, for the audit fields.
 * @param {import('express').Request} req
 */
function actorFrom(req) {
  const user = req.user || {};
  return {
    id: user._id || null,
    name: user.name || fullName(user) || user.username || '',
    role: user.role || req.userType || '',
  };
}

/** @param {import('express').Request} req */
function standingFrom(req) {
  const src = { ...req.query, ...req.body };
  return {
    gender: src.gender,
    ageGroup: src.ageGroup,
    competitionType: src.competitionType,
    apparatus: src.apparatus,
  };
}

function createTieBreakDrawController(container) {
  const tieBreakDrawService = container.resolve('tieBreakDrawService');

  return {
    /**
     * @route POST /api/admin/tie-break/draws
     * @route POST /api/superadmin/tie-break/draws
     * @desc  Record the drawn order for one tie group (first place first).
     */
    recordDraw: asyncHandler(async (req, res) => {
      const draw = await tieBreakDrawService.recordDraw(
        competitionIdFromRequest(req),
        standingFrom(req),
        req.body?.order,
        actorFrom(req),
        { notes: req.body?.notes }
      );
      res.json({ success: true, data: draw, message: 'Lucky draw recorded' });
    }),

    /**
     * @route DELETE /api/admin/tie-break/draws
     * @route DELETE /api/superadmin/tie-break/draws
     * @desc  Remove a recorded draw; the group shows as awaiting a draw again.
     */
    clearDraw: asyncHandler(async (req, res) => {
      await tieBreakDrawService.clearDraw(
        competitionIdFromRequest(req),
        standingFrom(req),
        req.body?.groupKey,
        actorFrom(req)
      );
      res.json({ success: true, message: 'Lucky draw cleared' });
    }),
  };
}

module.exports = createTieBreakDrawController;
