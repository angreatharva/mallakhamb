/**
 * Coach Routes
 * 
 * Defines routes for coach operations:
 * - Registration and login
 * - Profile and status
 * - Team management
 * - Competition registration
 * - Player management
 * - Payment operations
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.8
 * 
 * @module routes/coach.routes
 */

const express = require('express');
const { body, param } = require('express-validator');
const { phone } = require('../validators/common.validator');
const { APPARATUS, AGE_GROUPS, GENDERS } = require('../config/cop-rules');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { requireCoach } = require('../middleware/auth.middleware');
const { validateCompetitionContext } = require('../middleware/competition-context.middleware');
const { createCompetitionLockGuard } = require('../middleware/competition-lock.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const accountValidators = require('../validators/account.validator');
const playerValidators = require('../validators/player.validator');
const walkInValidators = require('../validators/walk-in.validator');
const { password: passwordRule } = require('../validators/common.validator');
const { createUserRateLimitMiddleware } = require('../middleware/security.middleware');

/**
 * Initialize coach routes with dependencies from DI container
 * 
 * @param {Object} container - DI container
 * @returns {Router} Express router
 */
function createCoachRoutes(container) {
  const router = express.Router();
  const authMiddleware = createAuthMiddleware(container);
  const coachAuth = requireCoach;
  const coachController = container.resolve('coachController');
  const userRateLimit = createUserRateLimitMiddleware(container);
  /*
   * A coach's writes stop with the meet too. In practice the fee window has
   * already closed by then — `assertPaymentWindowOpen` refuses payment past the
   * same instant — but the roster endpoints below have no such check of their
   * own, and "the competition is over" should not depend on which of two rules
   * happens to cover a given route. Creating a TEAM is not competition data and
   * stays open.
   */
  const requireUnlockedCompetition = createCompetitionLockGuard(container);

  /**
   * The discount code, at the boundary.
   *
   * A length cap because this string is hashed and compared on every call and
   * there is no reason to accept a megabyte of it; `.trim()` because a code
   * pasted out of an email arrives with whitespace and rejecting that would
   * read as "the code is wrong".
   */
  const discountCodeValidation = [
    body('discountCode')
      .exists({ checkNull: true })
      .withMessage('Enter a discount code')
      .bail()
      .isString()
      .withMessage('Enter a discount code')
      .bail()
      .trim()
      .notEmpty()
      .withMessage('Enter a discount code')
      .isLength({ max: 128 })
      .withMessage('That discount code is not valid'),
  ];

  // Validation middleware
  const registerValidation = [
    // Both halves are required at the API boundary. The schema leaves
    // `lastName` optional so coaches migrated from the single `name` field
    // (migration 008) do not fail validation on their next save.
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    phone('phone'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
  ];

  const loginValidation = [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ];

  const createTeamValidation = [
    body('name').trim().notEmpty().withMessage('Team name is required'),
    body('description').optional().trim()
  ];

  const addPlayerValidation = [
    body('playerId').isMongoId().withMessage('Valid player ID is required'),
    body('ageGroup')
      .isIn(AGE_GROUPS)
      .withMessage('Valid age group is required'),
    body('gender')
      .isIn(GENDERS)
      .withMessage('Gender must be either Male or Female'),
    /*
     * Apparatus arrives in any of the three shapes this field has ever held —
     * a bare string, a flat list, or an object keyed by competition type — and
     * is normalised to the last of those before it is stored. All three are
     * accepted because two live clients disagree: `CoachDashboard.jsx` posts a
     * flat list and the superadmin's `AddPlayerForm.jsx` posts the object. This
     * rule used to demand an array, which would have rejected the superadmin
     * form outright had it posted here.
     *
     * The names are checked rather than left free-form — the value decides
     * which score sheet a judge is shown, and a typo would silently fall back
     * to the Pole checklist rather than fail. The canonical form is built in
     * `coach.service`, which knows the meet's competition types; validation
     * only has to prove every name is real.
     */
    body('apparatus')
      .optional()
      .custom((value) => {
        const names = typeof value === 'string'
          ? [value]
          : Array.isArray(value)
            ? value
            : value && typeof value === 'object'
              ? Object.values(value).flat()
              : null;

        if (names === null) {
          throw new Error('Apparatus must be a name, a list of names, or a map of competition type to names');
        }
        if (!names.every((a) => APPARATUS.includes(a))) {
          throw new Error(`Each apparatus must be one of: ${APPARATUS.join(', ')}`);
        }
        return true;
      })
  ];

  /**
   * @route   POST /api/coaches/register
   * @desc    Register new coach
   * @access  Public
   */
  router.post('/register', registerValidation, handleValidationErrors, coachController.registerCoach);

  /**
   * @route   POST /api/coaches/login
   * @desc    Coach login
   * @access  Public
   */
  router.post('/login', loginValidation, handleValidationErrors, coachController.loginCoach);

  /**
   * @route   GET /api/coaches/profile
   * @desc    Get coach profile
   * @access  Authenticated coaches
   */
  router.get('/profile', authMiddleware, coachAuth, coachController.getCoachProfile);

  /**
   * @route   GET /api/coaches/status
   * @desc    Get coach status
   * @access  Authenticated coaches
   */
  router.get('/status', authMiddleware, coachAuth, coachController.getCoachStatus);

  /**
   * @route   POST /api/coaches/team
   * @desc    Create new team
   * @access  Authenticated coaches
   * @note    No competition context needed
   */
  router.post('/team', authMiddleware, coachAuth, createTeamValidation, handleValidationErrors, coachController.createTeam);

  /**
   * @route   GET /api/coaches/teams
   * @desc    Get all teams for coach
   * @access  Authenticated coaches
   * @note    No competition context needed
   */
  router.get('/teams', authMiddleware, coachAuth, coachController.getCoachTeams);

  /**
   * Co-coaches of the coach's team (docs/superadmin-control-plan.md, D5).
   * Everyone on the team sees the list; only the main coach removes.
   */
  const teamAdmin = () => container.resolve('teamAdminService');
  router.get('/co-coaches', authMiddleware, coachAuth, async (req, res, next) => {
    try {
      res.json({ success: true, data: await teamAdmin().coCoachesFor(req.user._id, req.coCoachOf || null) });
    } catch (error) { next(error); }
  });
  router.post('/co-coaches/:coachId/remove', authMiddleware, coachAuth, param('coachId').isMongoId(), handleValidationErrors, async (req, res, next) => {
    try {
      if (req.coCoachOf) return res.status(403).json({ success: false, error: { message: 'Only the team’s main coach can remove a co-coach' } });
      const actor = { id: String(req.user._id), name: [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') };
      res.json({ success: true, data: await teamAdmin().removeOwnCoCoach(actor, req.params.coachId, req.body?.reason) });
    } catch (error) { next(error); }
  });

  /**
   * @route   GET /api/coaches/competitions/open
   * @desc    Get open competitions
   * @access  Authenticated coaches
   */
  router.get('/competitions/open', authMiddleware, coachAuth, coachController.getOpenCompetitions);

  /**
   * @route   POST /api/coaches/select-competition
   * @desc    Select competition for team
   * @access  Authenticated coaches
   */
  router.post(
    '/select-competition',
    authMiddleware,
    coachAuth,
    requireUnlockedCompetition(),
    coachController.selectCompetitionForTeam
  );

  /**
   * @route   POST /api/coaches/team/:teamId/register-competition
   * @desc    Register team for competition
   * @access  Authenticated coaches
   */
  router.post(
    '/team/:teamId/register-competition',
    authMiddleware,
    coachAuth,
    requireUnlockedCompetition(),
    coachController.registerTeamForCompetition
  );

  /**
   * @route   GET /api/coaches/competition/team-status
   * @desc    Get team status in competition
   * @access  Authenticated coaches
   * @note    Requires competition context
   */
  router.get(
    '/competition/team-status',
    authMiddleware,
    coachAuth,
    validateCompetitionContext,
    coachController.getTeamStatus
  );

  /**
   * @route   GET /api/coaches/dashboard
   * @desc    Get team dashboard
   * @access  Authenticated coaches
   * @note    Requires competition context
   */
  router.get(
    '/dashboard',
    authMiddleware,
    coachAuth,
    validateCompetitionContext,
    coachController.getTeamDashboard
  );

  /**
   * @route   GET /api/coaches/search-players
   * @desc    Search for players
   * @access  Authenticated coaches
   * @note    Requires competition context
   */
  router.get(
    '/search-players',
    authMiddleware,
    coachAuth,
    validateCompetitionContext,
    coachController.searchPlayers
  );

  /**
   * @route   POST /api/coaches/add-player
   * @desc    Add player to age group
   * @access  Authenticated coaches
   * @note    Requires competition context
   */
  router.post(
    '/add-player',
    authMiddleware,
    coachAuth,
    validateCompetitionContext,
    requireUnlockedCompetition(),
    addPlayerValidation,
    handleValidationErrors,
    coachController.addPlayerToAgeGroup
  );

  /**
   * @route   DELETE /api/coaches/remove-player/:playerId
   * @desc    Remove player from age group
   * @access  Authenticated coaches
   * @note    Requires competition context
   */
  router.delete(
    '/remove-player/:playerId',
    authMiddleware,
    coachAuth,
    validateCompetitionContext,
    requireUnlockedCompetition(),
    coachController.removePlayerFromAgeGroup
  );

  /**
   * @route   POST /api/coaches/payments/create-order
   * @desc    Create payment order for team
   * @access  Authenticated coaches
   * @note    Requires competition context
   */
  router.post(
    '/payments/create-order',
    authMiddleware,
    coachAuth,
    validateCompetitionContext,
    requireUnlockedCompetition(),
    coachController.createTeamPaymentOrder
  );

  /**
   * @route   POST /api/coaches/payments/verify-and-submit
   * @desc    Verify payment and submit team
   * @access  Authenticated coaches
   * @note    Requires competition context
   */
  router.post(
    '/payments/verify-and-submit',
    authMiddleware,
    coachAuth,
    validateCompetitionContext,
    requireUnlockedCompetition(),
    coachController.verifyTeamPaymentAndSubmit
  );

  /*
   * Discount code.
   *
   * Both of these answer "is this code right?", which makes them a guessing
   * surface for a single shared secret that is worth a whole team's entry fee.
   * `userRateLimit` is keyed by the authenticated coach rather than by IP —
   * the same reason judge login is (a venue shares one NAT address), and the
   * limiter is a no-op in development where RATE_LIMIT_ENABLED defaults off.
   */
  router.post(
    '/payments/discount/validate',
    authMiddleware,
    coachAuth,
    userRateLimit,
    validateCompetitionContext,
    requireUnlockedCompetition(),
    discountCodeValidation,
    handleValidationErrors,
    coachController.validateDiscountCode
  );

  router.post(
    '/payments/discount/redeem',
    authMiddleware,
    coachAuth,
    userRateLimit,
    validateCompetitionContext,
    requireUnlockedCompetition(),
    discountCodeValidation,
    handleValidationErrors,
    coachController.redeemDiscountAndSubmit
  );

  /**
   * @route   GET  /api/coaches/account-requests
   * @route   POST /api/coaches/account-requests/:requestId/approve|reject
   * @desc    Password resets and email additions waiting on this coach, from
   *          players on their teams who registered without an email. The
   *          service checks the player is on the coach's team at decision time.
   * @access  Authenticated coaches
   */
  // Resolved per request: harnesses that build this router without the
  // account-request pieces need not register them.
  const requests = ['list', 'approve', 'reject'].reduce((handlers, name) => ({
    ...handlers,
    [name]: (req, res, next) => container.resolve('accountRequestController').coach[name](req, res, next),
  }), {});
  router.get('/account-requests', authMiddleware, coachAuth, requests.list);
  router.post('/account-requests/:requestId/approve', authMiddleware, coachAuth, accountValidators.decideRequest(), handleValidationErrors, requests.approve);
  router.post('/account-requests/:requestId/reject', authMiddleware, coachAuth, accountValidators.decideRequest(), handleValidationErrors, requests.reject);

  /*
   * Players with no email, registered by their coach. Resolved per request for
   * the same reason as the account requests above. Not competition-scoped: an
   * account belongs to the team, and entering it in a meet stays the
   * age-group step above, with its own lock and fee-window checks.
   */
  const coachPlayers = ['getDefaultPassword', 'setDefaultPassword', 'registerPlayer'].reduce((handlers, name) => ({
    ...handlers,
    [name]: (req, res, next) => container.resolve('coachPlayerController')[name](req, res, next),
  }), {});
  router.get('/player-default-password', authMiddleware, coachAuth, coachPlayers.getDefaultPassword);
  router.put(
    '/player-default-password',
    authMiddleware,
    coachAuth,
    userRateLimit,
    passwordRule('password'),
    body('currentPassword').notEmpty().withMessage('Enter your current password'),
    handleValidationErrors,
    coachPlayers.setDefaultPassword
  );
  router.post(
    '/players',
    authMiddleware,
    coachAuth,
    userRateLimit,
    playerValidators.coachRegisterPlayer(),
    handleValidationErrors,
    coachPlayers.registerPlayer
  );

  /*
   * Paper form (OCR) for the coach's own team — the walk-in desk's flow for
   * the competition in the coach's session (docs/team-per-level-plan.md
   * step 4). The service keeps a coach to their own drafts and their own
   * team's children; there is no payment here — the coach uses Pay Fees.
   */
  const walkIn = (name) => (req, res, next) => container.resolve('walkInController')[name](req, res, next);
  const paperForm = [authMiddleware, coachAuth, validateCompetitionContext];
  const paperWrite = [...paperForm, requireUnlockedCompetition()];
  const deskRules = (chains) => [...chains, handleValidationErrors];
  router.get('/paper-form/form', authMiddleware, coachAuth, walkIn('formPdf'));
  router.get('/paper-form/ocr/status', authMiddleware, coachAuth, walkIn('ocrStatus'));
  router.get('/paper-form/draft', ...paperForm, walkIn('coachCurrentDraft'));
  router.post('/paper-form/draft', ...paperWrite, walkIn('coachOpenDraft'));
  router.get('/paper-form/draft/:draftId', ...paperForm, deskRules(walkInValidators.draftId()), walkIn('getDraft'));
  router.delete('/paper-form/draft/:draftId', ...paperWrite, deskRules(walkInValidators.draftId()), walkIn('cancelDraft'));
  router.post(
    '/paper-form/draft/:draftId/scan',
    ...paperWrite,
    userRateLimit,
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' }),
    deskRules(walkInValidators.scan()),
    walkIn('scan')
  );
  router.put('/paper-form/draft/:draftId/rows', ...paperWrite, deskRules(walkInValidators.saveRows()), walkIn('saveRows'));
  router.post('/paper-form/draft/:draftId/submit', ...paperWrite, deskRules(walkInValidators.draftId()), walkIn('submit'));
  router.get('/paper-form/draft/:draftId/slip', ...paperForm, deskRules(walkInValidators.draftId()), walkIn('slip'));

  // The coach's players who qualified for Competition II / III in this meet.
  router.get('/finals', authMiddleware, coachAuth, validateCompetitionContext,
    (req, res, next) => container.resolve('qualificationController').forCoach(req, res, next));

  return router;
}

module.exports = createCoachRoutes;
