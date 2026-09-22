/**
 * Coach Service
 * 
 * Service for coach-specific operations.
 * Extends UserService with coach-specific functionality.
 * 
 * Requirements: 1.5, 1.8
 */

const UserService = require('./user.service');
const { NotFoundError, ValidationError, AuthorizationError } = require('../../errors');
const { stripSensitiveFields } = require('../../utils/data/user-projection.util');
// One shape on the way in, whatever the two clients post — see the module header.
const { toCanonicalApparatus } = require('../../utils/data/apparatus.util');
const { idStr } = require('../../utils/data/objectid.util');
const {
  calculateTeamPaymentAmount,
  resolveFeeWindow,
  assertPaymentWindowOpen,
  applyDiscountCode,
  assertDiscountCodeValid,
  DISCOUNT_PERCENT,
} = require('../../config/payment.config');
const {
  RAZORPAY_CURRENCY,
  razorpayClient,
  buildReceipt,
  verifyPaymentSignature,
  fetchPaymentDetails,
  isPaymentSuccessful,
  paidAtFrom,
} = require('../payment/razorpay.gateway');

class CoachService extends UserService {
  /**
   * Create a coach service
   * @param {CoachRepository} coachRepository - Coach repository
   * @param {TeamRepository} teamRepository - Team repository
   * @param {Logger} logger - Logger instance
   * @param {CacheService|null} cacheService - Cache service (optional)
   */
  constructor(
    coachRepository,
    teamRepository,
    logger,
    cacheService = null,
    authenticationService = null,
    competitionRepository = null,
    playerRepository = null,
    config = null,
    transactionRepository = null
  ) {
    super(coachRepository, logger, 'coach', cacheService);
    this.teamRepository = teamRepository;
    this.authenticationService = authenticationService;
    this.competitionRepository = competitionRepository;
    this.playerRepository = playerRepository;
    this.config = config;
    this.transactionRepository = transactionRepository;
  }

  async registerCoach(payload) {
    if (!this.authenticationService) {
      throw new ValidationError('Authentication service is not configured');
    }
    return this.authenticationService.register(payload, 'coach');
  }

  async loginCoach(email, password) {
    if (!this.authenticationService) {
      throw new ValidationError('Authentication service is not configured');
    }
    
    // Perform login - do NOT auto-set competition context
    // Coach should always choose competition after login
    const loginResult = await this.authenticationService.login(email, password, 'coach');
    
    this.logger?.info?.('Coach login successful, will select competition next', {
      coachId: loginResult.user._id || loginResult.coach._id
    });
    
    return loginResult;
  }

  async getCoachProfile(coachId) {
    return this.getProfile(coachId);
  }

  async getCoachStatus(coachId) {
    const teams = await this.getCoachTeams(coachId);
    
    // If no teams, need to create team
    if (teams.length === 0) {
      return {
        hasTeam: false,
        hasCompetition: false,
        step: 'create-team',
        teamCount: 0,
      };
    }
    
    // Check if any team is registered for a competition
    let hasCompetition = false;
    if (this.competitionRepository) {
      try {
        // Check if any competition has this coach's team registered
        const competitions = await this.competitionRepository.find({
          'registeredTeams.coach': coachId,
          isDeleted: false
        });
        hasCompetition = competitions.length > 0;
      } catch (error) {
        this.logger?.warn?.('Failed to check competition registration', { coachId, error: error.message });
      }
    }
    
    return {
      hasTeam: true,
      hasCompetition,
      step: hasCompetition ? 'dashboard' : 'select-competition',
      teamCount: teams.length,
    };
  }

  async getCoachTeams(coachId) {
    return this.teamRepository.find({ coach: coachId, isActive: true }, { sort: { createdAt: -1 } });
  }

  async createTeam(coachId, teamData) {
    if (!teamData || typeof teamData !== 'object') {
      throw new ValidationError('Team data is required');
    }
    
    // Create the team
    const created = await this.teamRepository.create({
      ...teamData,
      coach: coachId,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    // Update coach to reference this team
    try {
      await this.repository.updateById(coachId, { team: created._id });
      this.logger?.info?.('Team bound to coach', { coachId, teamId: created._id });
    } catch (error) {
      this.logger?.warn?.('Failed to bind team to coach', { 
        coachId, 
        teamId: created._id, 
        error: error.message 
      });
    }
    
    return created;
  }

  async getOpenCompetitions() {
    if (!this.competitionRepository) {
      return [];
    }
    return this.competitionRepository.find({ status: 'upcoming', isDeleted: false }, { sort: { startDate: 1 } });
  }

  async registerTeamForCompetition(teamId, competitionId, coachId) {
    // Validate team belongs to coach
    const team = await this.teamRepository.findById(teamId);
    if (!team) {
      throw new NotFoundError('Team');
    }
    
    if (team.coach.toString() !== coachId.toString()) {
      throw new AuthorizationError('You do not have permission to register this team');
    }
    
    // Get competition
    if (!this.competitionRepository) {
      throw new Error('Competition repository not available');
    }
    
    const competition = await this.competitionRepository.findById(competitionId);
    if (!competition) {
      throw new NotFoundError('Competition');
    }
    
    // Check if team is already registered
    const existingRegistration = competition.registeredTeams.find(
      rt => rt.team.toString() === teamId.toString()
    );
    
    if (existingRegistration) {
      this.logger?.info?.('Team already registered for competition', { teamId, competitionId });
      return { 
        teamId, 
        competitionId, 
        coachId, 
        status: 'already_registered',
        registeredTeam: existingRegistration
      };
    }
    
    // Register team - use updateById to avoid .save() issues
    const updatedCompetition = await this.competitionRepository.updateById(
      competitionId,
      {
        $push: {
          registeredTeams: {
            team: teamId,
            coach: coachId,
            players: [],
            isSubmitted: false,
            paymentStatus: 'pending',
            isActive: true
          }
        }
      }
    );
    
    if (!updatedCompetition) {
      throw new Error('Failed to register team for competition');
    }
    
    this.logger?.info?.('Team registered for competition', { teamId, competitionId, coachId });
    
    // Get the newly added registered team
    const refreshedCompetition = await this.competitionRepository.findById(competitionId);
    const registeredTeam = refreshedCompetition.registeredTeams.find(
      rt => rt.team.toString() === teamId.toString()
    );
    
    return { 
      teamId, 
      competitionId, 
      coachId, 
      status: 'registered',
      registeredTeam
    };
  }

  async selectCompetitionForTeam(coachId, competitionId) {
    const teams = await this.getCoachTeams(coachId);
    const team = teams[0] || null;
    return { coachId, competitionId, teamId: team?._id || null };
  }

  async getTeamDashboard(coachId, competitionId) {
    // Get coach's teams
    const teams = await this.getCoachTeams(coachId);
    
    this.logger?.debug?.('getTeamDashboard called', {
      coachId: idStr(coachId),
      competitionId: idStr(competitionId),
      teamsCount: teams.length,
    });

    if (teams.length === 0) {
      this.logger?.warn?.('No teams found for coach', { coachId });
      return {
        competitionId,
        team: null,
        totalTeams: 0,
      };
    }
    
    // Get the competition to find registered team with players
    if (!this.competitionRepository) {
      // If no competition repository, return basic team info
      this.logger?.warn?.('No competition repository available');
      return {
        competitionId,
        team: {
          ...teams[0].toObject(),
          players: [],
          isSubmitted: false,
          paymentStatus: 'pending'
        },
        totalTeams: teams.length,
      };
    }
    
    const competition = await this.competitionRepository.findById(competitionId);
    if (!competition) {
      this.logger?.error?.('Competition not found', { competitionId });
      throw new NotFoundError('Competition');
    }
    
    this.logger?.debug?.('Competition found', {
      competitionId: idStr(competitionId),
      registeredTeamsCount: competition.registeredTeams.length,
    });


    /*
     * Find the registered team in the competition.
     *
     * The comparison used to log both ids, their lengths, three equality
     * results and `Array.from(id).map(c => c.charCodeAt(0))` for each — 48
     * character codes per registered team, per request, at `info`. That was
     * left over from chasing an id-comparison bug; `idStr` is the answer to
     * that question now, and it is the same one `judge-assignment.util` uses.
     */
    const searchCoachId = idStr(coachId);
    const registeredTeam = competition.registeredTeams.find(
      rt => idStr(rt.coach) === searchCoachId
    );
    
    if (!registeredTeam) {
      // Team exists but not registered for this competition
      this.logger?.warn?.('Team not registered for this competition', {
        coachId: searchCoachId,
        competitionId: idStr(competitionId),
      });
      return {
        competitionId,
        team: null,
        totalTeams: teams.length,
      };
    }

    this.logger?.debug?.('Registered team found', {
      teamId: idStr(registeredTeam.team),
      playersCount: registeredTeam.players.length,
    });

    // Get the team details
    const registeredTeamId = idStr(registeredTeam.team);
    const team = teams.find(t => idStr(t._id) === registeredTeamId);
    
    if (!team) {
      this.logger?.error?.('Team details not found', { registeredTeamId });
      return {
        competitionId,
        team: null,
        totalTeams: teams.length,
      };
    }
    
    /*
     * Populate player details — in ONE query, not one per athlete.
     *
     * This was a sequential `findById` inside a `for...of`, so the endpoint
     * cost a full database round trip per squad place. Measured against Atlas:
     * 3 athletes 0.4s, 7 athletes 0.6s, 60 athletes 3.9s — about 60ms each,
     * linear, and paid again on every dashboard refetch. The coach dashboard
     * refetches after every add-player, so building a 60-athlete squad spent
     * minutes of wall clock inside this loop and eventually timed out the
     * "Save Team" round trip that follows it.
     *
     * The projection stays a hand-built allow-list: a coach sees their own
     * athletes' contact details, and nobody else's.
     */
    const playersWithDetails = [];
    if (this.playerRepository && registeredTeam.players.length > 0) {
      try {
        const playerIds = registeredTeam.players.map((entry) => entry.player).filter(Boolean);
        const players = await this.playerRepository.find({ _id: { $in: playerIds } });
        const byId = new Map((players || []).map((p) => [String(p._id), p]));

        for (const playerEntry of registeredTeam.players) {
          const player = byId.get(String(playerEntry.player));
          // A squad place pointing at a deleted athlete is skipped, exactly as
          // the per-athlete lookup skipped a `null`.
          if (!player) continue;

          playersWithDetails.push({
            player: {
              _id: player._id,
              firstName: player.firstName,
              lastName: player.lastName,
              email: player.email,
              dateOfBirth: player.dateOfBirth,
              gender: player.gender
            },
            ageGroup: playerEntry.ageGroup,
            gender: playerEntry.gender,
            apparatus: playerEntry.apparatus
          });
        }
      } catch (error) {
        this.logger?.warn?.('Failed to fetch player details', {
          teamId: String(registeredTeam.team),
          error: error.message
        });
      }
    }
    
    return {
      competitionId,
      // Whether the payment page should offer a discount-code box. The code
      // never leaves the server — only the fact that one is being accepted.
      discount: this.getDiscountAvailability(),
      team: {
        _id: team._id,
        name: team.name,
        coach: team.coach,
        description: team.description,
        isActive: team.isActive,
        players: playersWithDetails,
        isSubmitted: registeredTeam.isSubmitted,
        paymentStatus: registeredTeam.paymentStatus,
        paymentAmount: registeredTeam.paymentAmount,
        submittedAt: registeredTeam.submittedAt,
        /*
         * Everything the payment page needs to price the entry ITSELF.
         *
         * This is a hand-built allow-list, so a field the client needs and this
         * does not name simply arrives undefined — no error, just a wrong
         * answer. That is what the fee window would have hit: without these
         * four the client resolves every meet as "always open", quotes the base
         * fee, and the server then charges base + late fee and rejects the
         * payment for an amount mismatch after the coach's money has moved.
         *
         * `endDate` is here because it is the closing edge of the window, not
         * because the page shows it.
         */
        competition: {
          _id: competition._id,
          name: competition.name,
          playerFee: competition.playerFee,
          apparatusFees: competition.apparatusFees,
          endDate: competition.endDate,
          registrationOpenDate: competition.registrationOpenDate,
          feeDueDate: competition.feeDueDate,
          lateFee: competition.lateFee
        }
      },
      totalTeams: teams.length,
    };
  }

  async getTeamStatus(coachId, competitionId) {
    const teams = await this.getCoachTeams(coachId);
    return {
      competitionId,
      hasTeam: teams.length > 0,
      submitted: false,
    };
  }

  async searchPlayers(coachId, competitionId, query = '') {
    if (!this.playerRepository) return [];
    
    // Get coach's teams to filter players by team
    const teams = await this.getCoachTeams(coachId);
    if (teams.length === 0) {
      this.logger?.info?.('No teams found for coach, returning empty player list', { coachId });
      return [];
    }
    
    // Get the team ID (assuming coach has one team for now)
    const teamId = teams[0]._id;
    
    const filters = {
      isActive: true,
      team: teamId, // Only show players assigned to this coach's team
      $or: [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
      ],
    };
    
    this.logger?.info?.('Searching players for team', { 
      coachId, 
      teamId: teamId.toString(), 
      query 
    });
    
    return this.playerRepository.find(filters, { limit: 20, sort: { createdAt: -1 } });
  }

  async addPlayerToAgeGroup(coachId, competitionId, payload) {
    const { playerId, ageGroup, gender, apparatus } = payload;
    
    // Get coach's teams
    const teams = await this.getCoachTeams(coachId);
    if (teams.length === 0) {
      throw new NotFoundError('Team');
    }
    
    // Get competition
    if (!this.competitionRepository) {
      throw new Error('Competition repository not available');
    }
    
    const competition = await this.competitionRepository.findById(competitionId);
    if (!competition) {
      throw new NotFoundError('Competition');
    }
    
    // Find registered team
    const registeredTeam = competition.registeredTeams.find(
      rt => rt.coach.toString() === coachId.toString()
    );

    if (!registeredTeam) {
      throw new NotFoundError('Registered team for this competition');
    }

    /*
     * The squad place's gender must match the athlete's own.
     *
     * `gender` arrives in the coach's payload and used to be written straight
     * through, entirely independently of `Player.gender`. Two records of the
     * same fact that nothing kept in step — and they decide different things:
     * the ENTRY's gender picks the category, the panel and the score document,
     * while several screens filtered the roster on the ACCOUNT's. A coach
     * choosing the wrong option in the dropdown put an athlete in a category
     * where the client would then not show them, or worse, showed them to one
     * panel and scored them under another.
     *
     * The entry stays authoritative — everything downstream is keyed on it —
     * but it is now verified against the account at the only point that writes
     * it, so the two cannot drift apart in the first place.
     */
    if (this.playerRepository) {
      const player = await this.playerRepository.findById(playerId);
      if (!player) {
        throw new NotFoundError('Player');
      }
      if (player.gender && gender && player.gender !== gender) {
        throw new ValidationError(
          `${player.firstName} ${player.lastName} is registered as ${player.gender}, `
          + `so they cannot be entered as ${gender}`,
          'gender'
        );
      }
    }

    /*
     * Addressed by team and athlete, never by array position.
     *
     * Both branches used to build their update path from `findIndex` results
     * taken off the document read above — the outer index shifts if any team
     * withdraws, the inner one if any athlete is removed. See
     * `CompetitionRepository.updateRegistrationFields` for what that costs.
     */
    const teamId = registeredTeam.team;
    const alreadyEntered = registeredTeam.players.some(
      p => p.player && p.player.toString() === playerId.toString()
    );

    /*
     * Written in ONE shape, whatever the client sent.
     *
     * The coach dashboard posts a flat list and the superadmin's Add Player
     * form posts an object keyed by competition type — two clients, one Mixed
     * field, and reading it was unified long before writing it was. A flat list
     * is spread across the meet's own competition types, which is what the
     * reader already did with it. See utils/data/apparatus.util.
     */
    const entryApparatus = toCanonicalApparatus(apparatus, competition.competitionTypes);

    if (alreadyEntered) {
      await this.competitionRepository.updatePlayerInRegistration(
        competitionId,
        teamId,
        playerId,
        { ageGroup, gender, apparatus: entryApparatus }
      );
    } else {
      await this.competitionRepository.addPlayerToRegistration(
        competitionId,
        teamId,
        { player: playerId, ageGroup, gender, apparatus: entryApparatus }
      );
    }


    this.logger?.info?.('Player added to team', { 
      coachId, 
      competitionId, 
      playerId, 
      ageGroup, 
      gender 
    });
    
    return { 
      competitionId, 
      teamId: registeredTeam.team, 
      playerId 
    };
  }

  async removePlayerFromAgeGroup(coachId, competitionId, playerId) {
    // Get coach's teams
    const teams = await this.getCoachTeams(coachId);
    if (teams.length === 0) {
      throw new NotFoundError('Team');
    }
    
    // Get competition
    if (!this.competitionRepository) {
      throw new Error('Competition repository not available');
    }
    
    const competition = await this.competitionRepository.findById(competitionId);
    if (!competition) {
      throw new NotFoundError('Competition');
    }
    
    // Find registered team
    const registeredTeam = competition.registeredTeams.find(
      rt => rt.coach.toString() === coachId.toString()
    );

    if (!registeredTeam) {
      throw new NotFoundError('Registered team for this competition');
    }

    // Addressed by team, not by array position — see the note in
    // CompetitionRepository.updateRegistrationFields.
    await this.competitionRepository.removePlayerFromRegistration(
      competitionId,
      registeredTeam.team,
      playerId
    );

    this.logger?.info?.('Player removed from team', {
      coachId,
      competitionId,
      playerId
    });

    return {
      competitionId,
      teamId: registeredTeam.team,
      playerId 
    };
  }

  /**
   * The discount switch, as the payment page needs to see it.
   *
   * Only whether the feature is on and what it is worth — never the code. The
   * client uses this to decide whether to render the input at all; the code
   * itself is only ever compared on this side.
   *
   * @returns {{enabled: boolean, percentOff: number}}
   */
  getDiscountAvailability() {
    // One config path for the whole feature — `payments.discount` — rather than
    // reaching for `payments.discount.enabled` here and the object elsewhere.
    return {
      enabled: this.config?.get?.('payments.discount')?.enabled === true,
      percentOff: DISCOUNT_PERCENT,
    };
  }

  /**
   * Find this coach's entry, or explain which half is missing.
   *
   * The three payment paths all begin the same way and all used to repeat it.
   *
   * @param {string} coachId
   * @param {string} competitionId
   * The registration's array POSITION is deliberately not returned. It used to
   * be, and every caller wrote through it — which is unsafe the moment a team
   * withdraws. Writes go through the team-addressed repository methods instead.
   *
   * @returns {Promise<{competition: Object, registeredTeam: Object}>}
   */
  async _loadRegistration(coachId, competitionId) {
    const competition = await this.competitionRepository.findById(competitionId);
    if (!competition) {
      throw new NotFoundError('Competition not found');
    }

    const registeredTeam = competition.registeredTeams.find(
      rt => rt.coach?.toString() === coachId.toString()
    );
    if (!registeredTeam) {
      throw new NotFoundError('Team not registered for this competition');
    }

    return { competition, registeredTeam };
  }

  /**
   * Price this coach's entry with a discount code applied — no side effects.
   *
   * Backs the "Apply" button, so the coach sees ₹0 before committing to a
   * submission they cannot undo. It is also a code ORACLE, which is why it is
   * rate limited at the route and why every rejection reads the same.
   *
   * @param {string} coachId
   * @param {string} competitionId
   * @param {string} discountCode
   * @returns {Promise<Object>} the quote
   * @throws {ValidationError} if the feature is off, the code is wrong, or the
   *   registration window is shut
   */
  async quoteTeamPaymentWithDiscount(coachId, competitionId, discountCode) {
    const { competition, registeredTeam } = await this._loadRegistration(coachId, competitionId);

    if (registeredTeam.isSubmitted) {
      throw new ValidationError('This team has already been submitted');
    }

    const discountConfig = this.config?.get?.('payments.discount');
    assertDiscountCodeValid(discountCode, discountConfig);

    /*
     * The window still applies at 100% off.
     *
     * A free entry is still an entry, and one accepted after the meet closed is
     * exactly as wrong as a paid one. Asserted AFTER the code check purely so a
     * coach with a bad code is told about the code.
     */
    const quotedAt = new Date();
    const feeWindow = assertPaymentWindowOpen(competition, quotedAt);

    const amount = calculateTeamPaymentAmount(registeredTeam.players, competition, quotedAt);
    const discount = applyDiscountCode(amount, discountCode, discountConfig);

    this.logger?.info?.('Discount code quoted', {
      coachId,
      competitionId,
      originalAmount: discount.originalAmount,
      payableAmount: discount.payableAmount,
    });

    return {
      ...discount,
      playerCount: registeredTeam.players?.length || 0,
      currency: 'INR',
      fee: {
        phase: feeWindow.phase,
        isLate: feeWindow.isLate,
        lateFeePerPlayer: feeWindow.lateFeePerPlayer,
        lateFeeTotal: feeWindow.lateFeePerPlayer * (registeredTeam.players?.length || 0),
      },
    };
  }

  /**
   * Redeem the discount code and submit the team.
   *
   * This is the whole reason the discount is all-or-nothing. Razorpay has no
   * ₹0 order, so a 100%-off entry cannot go through the gateway at all — there
   * is no order to create, no signature to verify and no amount to match. The
   * team is submitted here directly, which means EVERY guard the paid path gets
   * from Razorpay has to be re-stated: the feature switch, the code, the
   * registration window, and the already-submitted check.
   *
   * Re-validating rather than trusting a quote is deliberate. The quote endpoint
   * has no side effects and hands nothing back that this could rely on; a client
   * that skipped it entirely must land in exactly the same place.
   *
   * @param {string} coachId
   * @param {string} competitionId
   * @param {string} discountCode
   * @returns {Promise<Object>}
   */
  async redeemDiscountAndSubmit(coachId, competitionId, discountCode) {
    try {
      const coach = await this.repository.findById(coachId);
      if (!coach) {
        throw new NotFoundError('Coach not found');
      }

      const { competition, registeredTeam } =
        await this._loadRegistration(coachId, competitionId);

      if (registeredTeam.isSubmitted) {
        this.logger?.warn?.('Team already submitted', { coachId, competitionId });
        return {
          coachId,
          competitionId,
          submitted: true,
          alreadySubmitted: true,
          discountApplied: true,
          amountPaid: 0,
        };
      }

      const discountConfig = this.config?.get?.('payments.discount');
      assertDiscountCodeValid(discountCode, discountConfig);

      const redeemedAt = new Date();
      assertPaymentWindowOpen(competition, redeemedAt);

      const playerCount = registeredTeam.players?.length || 0;
      const amount = calculateTeamPaymentAmount(registeredTeam.players, competition, redeemedAt);
      const discount = applyDiscountCode(amount, discountCode, discountConfig);

      /*
       * Belt and braces. `applyDiscountCode` cannot return a non-zero payable
       * amount for a valid code while DISCOUNT_PERCENT is 100 — but if that
       * constant is ever lowered, this path would silently submit a team that
       * still owed money. Refuse instead.
       */
      if (!discount.applied || discount.payableAmount !== 0) {
        throw new ValidationError('This discount code does not cover the full fee — pay through checkout instead');
      }

      const team = await this.teamRepository.findById(registeredTeam.team);
      if (!team) {
        throw new NotFoundError('Team not found');
      }

      await this.competitionRepository.updateRegistrationFields(
        competitionId,
        registeredTeam.team,
        {
          isSubmitted: true,
          submittedAt: redeemedAt,
          // 'completed' because the fee obligation IS settled — at zero. The
          // admin screens read this field to report who still owes money, and
          // leaving it 'pending' would list a team that owes nothing.
          paymentStatus: 'completed',
          paymentAmount: 0,
          paymentVerifiedAt: redeemedAt,
          // `paymentGateway` is left unset on purpose: its enum is ['razorpay']
          // and no gateway was involved.
        }
      );

      if (this.transactionRepository) {
        await this.transactionRepository.create([{
          source: 'coach',
          type: 'team_submission',
          amount: 0,
          competition: competitionId,
          team: registeredTeam.team,
          coach: coachId,
          paymentStatus: 'completed',
          description: `Team ${team.name} submitted with a ${discount.percent}% discount code`,
          metadata: {
            discountApplied: true,
            discountPercent: discount.percent,
            // The amount waived, NOT the code. A transaction list is read by
            // more people than should be able to reuse a free-entry code.
            originalAmount: discount.originalAmount,
            discountAmount: discount.discountAmount,
            playerCount,
            submittedAt: redeemedAt,
          },
        }]);
      }

      this.logger?.info?.('Team submitted with a discount code', {
        coachId,
        competitionId,
        teamId: registeredTeam.team,
        waived: discount.discountAmount,
        playerCount,
      });

      return {
        coachId,
        competitionId,
        submitted: true,
        discountApplied: true,
        discountPercent: discount.percent,
        originalAmount: discount.originalAmount,
        amountPaid: discount.payableAmount,
      };
    } catch (error) {
      this.logger?.error?.('Error redeeming discount code', {
        error: error.message,
        coachId,
        competitionId,
      });
      throw error;
    }
  }

  async createTeamPaymentOrder(coachId, competitionId) {
    try {
      // Validate coach exists
      const coach = await this.repository.findById(coachId);
      if (!coach) {
        throw new NotFoundError('Coach not found');
      }

      // Get competition and find registered team
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition not found');
      }

      const registeredTeam = competition.registeredTeams?.find(
        rt => rt.coach?.toString() === coachId.toString()
      );

      if (!registeredTeam) {
        throw new NotFoundError('Team not registered for this competition');
      }

      // Get team details
      const team = await this.teamRepository.findById(registeredTeam.team);
      if (!team) {
        throw new NotFoundError('Team not found');
      }

      /*
       * The registration window, before anything is charged.
       *
       * Refusing here rather than at verify time is the whole point: a coach
       * who cannot pay should never reach Razorpay, let alone hand over money
       * for an entry the meet will not accept.
       */
      const quotedAt = new Date();
      const feeWindow = assertPaymentWindowOpen(competition, quotedAt);

      // Calculate payment amount using centralized config with competition-specific player fee
      const playerCount = registeredTeam.players?.length || 0;
      const amount = calculateTeamPaymentAmount(registeredTeam.players, competition, quotedAt);
      const lateFeeTotal = feeWindow.lateFeePerPlayer * playerCount;

      // Credentials, client and receipt scheme are shared with the super
      // admin's per-athlete payment path — see services/payment/razorpay.gateway.
      const razorpayKeyId = this.config?.get('razorpay.keyId') || '';
      const razorpay = razorpayClient(this.config);

      this.logger?.info?.('Creating Razorpay order', {
        amount,
        playerCount,
        teamId: team._id.toString()
      });

      const razorpayOrder = await razorpay.orders.create({
        amount: amount * 100, // Razorpay expects amount in paise (smallest currency unit)
        currency: RAZORPAY_CURRENCY,
        receipt: buildReceipt(team._id),
        notes: {
          coachId: coachId.toString(),
          competitionId: competitionId.toString(),
          teamId: team._id.toString(),
          teamName: team.name,
          playerCount: playerCount,
          feePhase: feeWindow.phase,
          lateFeePerPlayer: feeWindow.lateFeePerPlayer
        }
      });

      this.logger?.info?.('Razorpay order created successfully', {
        coachId,
        competitionId,
        orderId: razorpayOrder.id,
        amount,
        playerCount,
        feePhase: feeWindow.phase,
        lateFeeTotal
      });

      return {
        order: {
          id: razorpayOrder.id,
          amount,
          currency: 'INR'
        },
        razorpayKeyId,
        team: {
          _id: team._id,
          name: team.name,
          playerCount
        },
        // The coach's receipt needs to say WHY the total moved, not just show a
        // bigger number than the fee breakdown on the page adds up to.
        fee: {
          phase: feeWindow.phase,
          isLate: feeWindow.isLate,
          lateFeePerPlayer: feeWindow.lateFeePerPlayer,
          lateFeeTotal,
          dueBy: feeWindow.dueBy,
          closesAt: feeWindow.closesAt
        }
      };
    } catch (error) {
      this.logger?.error?.('Error creating payment order', {
        error: error.message,
        stack: error.stack,
        razorpayError: error.error,
        statusCode: error.statusCode
      });
      
      // Handle Razorpay-specific errors
      if (error.error && error.error.description) {
        throw new ValidationError(error.error.description);
      }
      
      throw error;
    }
  }

  async verifyTeamPaymentAndSubmit(coachId, competitionId, payload) {
    try {
      // Validate payload
      if (!payload?.razorpay_order_id || !payload?.razorpay_payment_id || !payload?.razorpay_signature) {
        throw new ValidationError('Missing required payment details');
      }

      // Get competition and find registered team
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition not found');
      }

      const registeredTeam = competition.registeredTeams.find(
        rt => rt.coach?.toString() === coachId.toString()
      );

      if (!registeredTeam) {
        throw new NotFoundError('Team not registered for this competition');
      }

      // Check if already submitted
      if (registeredTeam.isSubmitted) {
        this.logger?.warn?.('Team already submitted', { coachId, competitionId });
        return {
          coachId,
          competitionId,
          verified: true,
          submitted: true,
          alreadySubmitted: true,
          payment: payload || {},
        };
      }

      // CRITICAL: Verify Razorpay payment signature server-side. The HMAC and
      // the constant-time comparison live in services/payment/razorpay.gateway,
      // shared with the super admin's per-athlete payment path.
      const signatureValid = verifyPaymentSignature(this.config, {
        orderId: payload.razorpay_order_id,
        paymentId: payload.razorpay_payment_id,
        signature: payload.razorpay_signature,
      });

      if (!signatureValid) {
        this.logger?.error?.('Payment signature verification failed', {
          coachId,
          competitionId,
          orderId: payload.razorpay_order_id,
          paymentId: payload.razorpay_payment_id
        });
        throw new ValidationError('Payment verification failed: Invalid signature');
      }

      // Verify payment status with Razorpay API — the client's claim that it
      // succeeded is not evidence.
      let paymentDetails;
      try {
        paymentDetails = await fetchPaymentDetails(this.config, payload.razorpay_payment_id);
      } catch (error) {
        this.logger?.error?.('Failed to fetch payment details from Razorpay', {
          error: error.message,
          paymentId: payload.razorpay_payment_id
        });
        throw error;
      }

      // Check payment status
      if (!isPaymentSuccessful(paymentDetails)) {
        this.logger?.error?.('Payment not successful', {
          paymentId: payload.razorpay_payment_id,
          status: paymentDetails.status,
          orderId: payload.razorpay_order_id
        });
        
        // Create failed transaction record
        if (this.transactionRepository) {
          await this.transactionRepository.create([{
            source: 'coach',
            type: 'team_submission',
            amount: paymentDetails.amount / 100,
            competition: competitionId,
            team: registeredTeam.team,
            coach: coachId,
            paymentStatus: 'failed',
            description: `Payment failed for team submission`,
            metadata: {
              razorpay_order_id: payload.razorpay_order_id,
              razorpay_payment_id: payload.razorpay_payment_id,
              razorpay_status: paymentDetails.status,
              error_code: paymentDetails.error_code,
              error_description: paymentDetails.error_description,
              failedAt: new Date()
            }
          }]);
        }

        throw new ValidationError(`Payment ${paymentDetails.status}. Please try again or contact support.`);
      }

      // Verify order ID matches
      if (paymentDetails.order_id !== payload.razorpay_order_id) {
        this.logger?.error?.('Order ID mismatch', {
          expected: payload.razorpay_order_id,
          received: paymentDetails.order_id
        });
        throw new ValidationError('Payment verification failed: Order mismatch');
      }

      // Get team details for transaction record
      const team = await this.teamRepository.findById(registeredTeam.team);
      if (!team) {
        throw new NotFoundError('Team not found');
      }

      /*
       * Recompute the price against the moment the coach ACTUALLY PAID.
       *
       * `created_at` comes off the payment we just fetched from Razorpay, so it
       * is theirs, not the client's, and it is the instant the late-fee rule in
       * the brief is written about. Using `new Date()` here instead would price
       * the payment by when the callback happened to be handled, which on a slow
       * retry is a different day.
       *
       * The one case this cannot rescue: a checkout that STARTS minutes before
       * the deadline and completes after it. The order was quoted at the regular
       * price, the payment is priced as late, and the amounts disagree — the
       * coach is told the amount mismatched and pays again at the late price.
       * Rare (the two instants are usually seconds apart) and recoverable, which
       * is why it is not worth pinning a quote to the registration for.
       */
      const paidAt = paidAtFrom(paymentDetails);

      // Calculate expected amount using centralized config with competition-specific player fee
      // Use registeredTeam.players (players registered for this competition)
      // NOT team.players (all players in the team)
      const playerCount = registeredTeam.players?.length || 0;
      const feeWindow = resolveFeeWindow(competition, paidAt);
      const expectedAmount = calculateTeamPaymentAmount(registeredTeam.players, competition, paidAt) * 100; // Convert to paise

      // Verify payment amount
      if (paymentDetails.amount !== expectedAmount) {
        this.logger?.error?.('Payment amount mismatch', {
          expected: expectedAmount,
          received: paymentDetails.amount,
          paymentId: payload.razorpay_payment_id,
          feePhase: feeWindow.phase,
          lateFeePerPlayer: feeWindow.lateFeePerPlayer
        });
        throw new ValidationError('Payment verification failed: Amount mismatch');
      }

      /*
       * All verifications passed — mark the registration submitted and paid.
       *
       * Addressed by TEAM. This write used to be built from a positional index
       * taken off the document read at the top of this method, and a coach
       * withdrawing in the meantime shifted it onto somebody else's
       * registration — marking a team submitted and paid against another
       * coach's money, with nothing to report it. See
       * CompetitionRepository.updateRegistrationFields.
       */
      await this.competitionRepository.updateRegistrationFields(
        competitionId,
        registeredTeam.team,
        {
          isSubmitted: true,
          submittedAt: new Date(),
          paymentStatus: 'completed',
          paymentId: payload.razorpay_payment_id,
          paymentOrderId: payload.razorpay_order_id,
          paymentSignature: payload.razorpay_signature,
          paymentVerifiedAt: new Date(),
          paymentAmount: paymentDetails.amount,
          paymentMethod: paymentDetails.method,
        }
      );

      // Create Transaction record
      if (this.transactionRepository) {
        const transactionData = {
          source: 'coach',
          type: 'team_submission',
          amount: paymentDetails.amount / 100, // Convert paise to rupees
          competition: competitionId,
          team: registeredTeam.team,
          coach: coachId,
          paymentStatus: 'completed',
          description: `Team ${team.name} submitted by coach for competition`,
          metadata: {
            razorpay_order_id: payload.razorpay_order_id,
            razorpay_payment_id: payload.razorpay_payment_id,
            razorpay_signature: payload.razorpay_signature,
            razorpay_status: paymentDetails.status,
            payment_method: paymentDetails.method,
            playerCount: playerCount,
            feePhase: feeWindow.phase,
            lateFeePerPlayer: feeWindow.lateFeePerPlayer,
            lateFeeTotal: feeWindow.lateFeePerPlayer * playerCount,
            submittedAt: new Date(),
            verified: true
          }
        };

        await this.transactionRepository.create([transactionData]);

        this.logger?.info?.('Transaction record created', {
          coachId,
          competitionId,
          teamId: registeredTeam.team,
          amount: paymentDetails.amount / 100,
          paymentId: payload.razorpay_payment_id
        });
      }

      this.logger?.info?.('Team submitted successfully with verified payment', { 
        coachId, 
        competitionId,
        teamId: registeredTeam.team,
        paymentId: payload.razorpay_payment_id,
        status: paymentDetails.status
      });

      return {
        coachId,
        competitionId,
        verified: true,
        submitted: true,
        payment: payload || {},
      };
    } catch (error) {
      this.logger?.error?.('Error verifying payment and submitting team', {
        error: error.message,
        stack: error.stack,
        coachId,
        competitionId
      });
      throw error;
    }
  }

  /**
   * Get coach profile with team information
   * @param {string} coachId - Coach ID
   * @returns {Promise<Object>} Coach profile with team details
   * @throws {NotFoundError} If coach not found
   */
  async getProfile(coachId) {
    try {
      const coach = await this.repository.findById(coachId, {
        populate: 'team'
      });

      if (!coach) {
        this.logger.warn('Get coach profile failed: Coach not found', { coachId });
        throw new NotFoundError('Coach');
      }

      // Remove password from response
      const profile = stripSensitiveFields(coach);

      this.logger.info('Coach profile retrieved', { coachId });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get coach profile error', { 
        coachId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Assign coach to a team
   * @param {string} coachId - Coach ID
   * @param {string} teamId - Team ID
   * @returns {Promise<Object>} Updated coach profile
   * @throws {NotFoundError} If coach or team not found
   * @throws {ValidationError} If coach is already assigned to a team
   */
  async assignToTeam(coachId, teamId) {
    try {
      // Check if coach exists
      const coach = await this.repository.findById(coachId);

      if (!coach) {
        this.logger.warn('Assign to team failed: Coach not found', { coachId });
        throw new NotFoundError('Coach');
      }

      // Check if coach is already assigned to a team
      if (coach.team) {
        this.logger.warn('Assign to team failed: Coach already assigned to a team', { 
          coachId, 
          currentTeam: coach.team 
        });
        throw new ValidationError('Coach is already assigned to a team');
      }

      // Check if team exists
      const team = await this.teamRepository.findById(teamId);

      if (!team) {
        this.logger.warn('Assign to team failed: Team not found', { teamId });
        throw new NotFoundError('Team');
      }

      // Check if team already has a coach
      if (team.coach) {
        this.logger.warn('Assign to team failed: Team already has a coach', { 
          teamId, 
          existingCoach: team.coach 
        });
        throw new ValidationError('Team already has a coach assigned');
      }

      // Update coach's team
      const updatedCoach = await this.repository.updateById(coachId, {
        team: teamId
      });

      // Remove password from response
      const profile = stripSensitiveFields(updatedCoach);

      this.logger.info('Coach assigned to team', { 
        coachId, 
        teamId 
      });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Assign to team error', { 
        coachId, 
        teamId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Remove coach from team
   * @param {string} coachId - Coach ID
   * @returns {Promise<Object>} Updated coach profile
   * @throws {NotFoundError} If coach not found
   * @throws {ValidationError} If coach is not assigned to a team
   */
  async removeFromTeam(coachId) {
    try {
      // Check if coach exists
      const coach = await this.repository.findById(coachId);

      if (!coach) {
        this.logger.warn('Remove from team failed: Coach not found', { coachId });
        throw new NotFoundError('Coach');
      }

      // Check if coach is assigned to a team
      if (!coach.team) {
        this.logger.warn('Remove from team failed: Coach not assigned to any team', { coachId });
        throw new ValidationError('Coach is not assigned to any team');
      }

      const teamId = coach.team;

      // Update coach's team to null
      const updatedCoach = await this.repository.updateById(coachId, {
        team: null
      });

      // Remove password from response
      const profile = stripSensitiveFields(updatedCoach);

      this.logger.info('Coach removed from team', { 
        coachId, 
        teamId 
      });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Remove from team error', { 
        coachId, 
        error: error.message 
      });
      throw error;
    }
  }

  /*
   * `getTeam(coachId)` was removed here on 2026-09-22. It was unreachable — no
   * controller, route, script or test called it — and it had rotted in two ways
   * that only an unreachable method can:
   *
   *   1. `require('../../models/Player')` resolved to src/models/Player, which
   *      did not exist at the time; the call would have thrown MODULE_NOT_FOUND
   *      rather than returning a team.
   *   2. It read the roster with `Player.find({ team }).lean()` and NO
   *      projection, which is the CRIT-4 shape: every athlete's `email` and
   *      `dateOfBirth`, most of them minors, in the response body.
   *
   * What coaches actually use is `getTeamDashboard` / `getTeamStatus`, which go
   * through the repositories and project through `user-projection.util`. If a
   * plain "my team with its players" read is ever wanted, build it there.
   */

  /**
   * Get all active coaches
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of active coaches
   */
  async getActiveCoaches(options = {}) {
    try {
      const coaches = await this.repository.findActive(options);

      // Remove passwords from response
      const coachesWithoutPasswords = coaches.map(coach => {
        const profile = stripSensitiveFields(coach);
        return profile;
      });

      this.logger.info('Active coaches retrieved', { 
        count: coachesWithoutPasswords.length 
      });

      return coachesWithoutPasswords;
    } catch (error) {
      this.logger.error('Get active coaches error', { 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = CoachService;

