const { fullName, coachCard, enteredPlayerCard } = require('../../utils/data/user-projection.util');
const { NotFoundError, ValidationError } = require('../../errors');
const mongoose = require('mongoose');
const { EMAIL_TYPES } = require('../../models/Player');
const { calculatePlayerAdditionAmount, resolveFeeWindow } = require('../../config/payment.config');
const { applyApparatusByGender } = require('../../utils/data/competition-apparatus.util');
const { hasRoomInSquad, isValidTeamSize, TEAM_SIZES } = require('../../utils/scoring/team-championship.util');

const TEAM_SIZE_MESSAGE = `Max team size must be ${TEAM_SIZES.join(' or ')} players per age group`;
const {
  RAZORPAY_CURRENCY,
  razorpayClient,
  buildReceipt,
  verifyPaymentSignature,
  fetchPaymentDetails,
  isPaymentSuccessful,
  paidAtFrom,
} = require('../payment/razorpay.gateway');

/**
 * Read one of the competition's fee-window dates off a create/update payload.
 *
 * `''` is what an emptied `<input type="date">` sends, and it has to mean
 * "unset" rather than "the epoch" — otherwise clearing the Opening Date in the
 * edit form would open registration in 1970 instead of removing the gate.
 *
 * @param {Object} payload
 * @param {string} field
 * @returns {{ present: boolean, value: Date | null }}
 * @throws {ValidationError} when the value is present but not a date
 */
function readWindowDate(payload, field) {
  if (!Object.prototype.hasOwnProperty.call(payload, field)) {
    return { present: false, value: null };
  }
  const raw = payload[field];
  if (raw === null || raw === undefined || raw === '') {
    return { present: true, value: null };
  }
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${field} must be a valid date`);
  }
  return { present: true, value: date };
}

/**
 * Validate and normalise the late-fee window on a competition payload.
 *
 * Runs on both create and update, and on update it has to reason about fields
 * the payload may not carry — so anything absent falls back to what is already
 * stored. Ordering is checked here rather than in a schema validator because
 * the repository updates through `findByIdAndUpdate`, where a validator cannot
 * see its sibling paths (see the comment on `src/models/Competition.js`).
 *
 * @param {Object} payload - incoming body (mutated copy is returned)
 * @param {Object} [existing] - the stored competition, on update
 * @returns {Object} the payload with the window fields coerced
 * @throws {ValidationError}
 */
function normalizeFeeWindow(payload, existing = null) {
  const body = { ...payload };

  const openDate = readWindowDate(payload, 'registrationOpenDate');
  const dueDate = readWindowDate(payload, 'feeDueDate');
  const endDate = readWindowDate(payload, 'endDate');
  const startDate = readWindowDate(payload, 'startDate');

  if (openDate.present) body.registrationOpenDate = openDate.value;
  if (dueDate.present) body.feeDueDate = dueDate.value;

  if (Object.prototype.hasOwnProperty.call(payload, 'lateFee')) {
    const raw = payload.lateFee;
    if (raw === null || raw === undefined || raw === '') {
      body.lateFee = 0;
    } else {
      const lateFee = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(lateFee) || lateFee < 0) {
        throw new ValidationError('Late fee must be a number of rupees, zero or more');
      }
      body.lateFee = lateFee;
    }
  }

  // Effective values: what the competition will look like once this write lands.
  const effective = (incoming, stored) => {
    if (incoming.present) return incoming.value;
    const fallback = stored === null || stored === undefined ? null : new Date(stored);
    return fallback && !Number.isNaN(fallback.getTime()) ? fallback : null;
  };

  const start = effective(startDate, existing?.startDate);
  const open = effective(openDate, existing?.registrationOpenDate);
  const due = effective(dueDate, existing?.feeDueDate);
  const end = effective(endDate, existing?.endDate);

  if (open && due && open > due) {
    throw new ValidationError('The last date to pay fees cannot be before the competition opening date');
  }

  /*
   * Both fee dates close BEFORE the meet opens.
   *
   * Money is settled in advance: a deadline falling on or inside the
   * competition would let a coach still be paying the base fee while their
   * athletes compete. Strict `>=`, so the start day itself is already too late.
   *
   * The end-date check below is implied by this one whenever `startDate` is
   * present — which it always should be, since the model requires it. It stays
   * because `updateById` goes through `findByIdAndUpdate`, where the schema's
   * own start/end ordering validator cannot read its sibling paths, so a stored
   * competition with the two reversed is not impossible.
   */
  if (open && start && open >= start) {
    throw new ValidationError('The competition opening date must be before the competition start date');
  }
  if (due && start && due >= start) {
    throw new ValidationError('The last date to pay fees must be before the competition start date');
  }
  if (due && end && due >= end) {
    throw new ValidationError('The last date to pay fees must be before the competition end date');
  }

  const effectiveLateFee = Object.prototype.hasOwnProperty.call(body, 'lateFee')
    ? body.lateFee
    : Number(existing?.lateFee) || 0;

  // A late fee with no deadline to be late for can never be charged, and a
  // super admin who typed one plainly meant it to be.
  if (effectiveLateFee > 0 && !due) {
    throw new ValidationError('Set a last date to pay fees before setting a late fee amount');
  }

  return body;
}

class SuperAdminService {
  constructor({
    authenticationService,
    adminRepository,
    coachRepository,
    teamRepository,
    judgeRepository,
    competitionRepository,
    competitionService,
    transactionRepository,
    playerRepository,
    logger,
    config,
  }) {
    this.authenticationService = authenticationService;
    this.adminRepository = adminRepository;
    this.coachRepository = coachRepository;
    this.teamRepository = teamRepository;
    this.judgeRepository = judgeRepository;
    this.competitionRepository = competitionRepository;
    this.competitionService = competitionService;
    this.transactionRepository = transactionRepository;
    this.playerRepository = playerRepository;
    this.logger = logger;
    this.config = config;
  }

  /**
   * Find a competition registration row by team document id or by registration subdocument _id.
   */
  _findRegisteredTeam(competition, teamId) {
    if (!competition?.registeredTeams?.length || !teamId) return undefined;
    return competition.registeredTeams.find(
      (rt) => rt.team?.toString() === teamId || rt._id?.toString() === teamId
    );
  }

  /** Team document id to store on Player / transactions (registration may be keyed by subdoc _id). */
  _canonicalTeamId(registeredTeam, requestedTeamId) {
    if (registeredTeam?.team) return registeredTeam.team.toString();
    return requestedTeamId;
  }

  async loginSuperAdmin(email, password) {
    const result = await this.authenticationService.login(email, password, 'admin');
    const role = result?.user?.role;
    if (role !== 'superadmin') {
      throw new NotFoundError('Super admin account');
    }
    return result;
  }

  async getAllAdmins() { return this.adminRepository.find({}, { sort: { createdAt: -1 } }); }
  async createAdmin(payload) { return this.authenticationService.register(payload, 'admin'); }
  async updateAdmin(adminId, payload) { return this.adminRepository.updateById(adminId, payload); }
  async deleteAdmin(adminId) { return this.adminRepository.deleteById(adminId); }

  /**
   * Every coach, for the superadmin's management table.
   *
   * The table renders one name per row, so the two stored halves are composed
   * here — `.lean()` results carry no virtuals, which is why this is a map and
   * not a schema virtual.
   */
  async getAllCoaches() {
    const coaches = await this.coachRepository.find({}, { sort: { createdAt: -1 } });
    return coaches.map((coach) => ({ ...coach, name: fullName(coach) }));
  }
  /**
   * Activate only. A coach cannot be deactivated: the requests of the players
   * they registered are theirs alone to decide, so a deactivated coach would
   * strand them. `isActive: false` is refused; true brings back a coach
   * deactivated before this rule.
   */
  async updateCoachStatus(coachId, isActive) {
    if (isActive !== true && isActive !== 'true') {
      throw new ValidationError('Coaches cannot be deactivated');
    }
    return this.coachRepository.updateById(coachId, { isActive: true });
  }

  async getAllTeams(filters = {}) {
    const { gender, ageGroup, competition } = filters;
    
    // If competition filter is provided, get teams from Competition.registeredTeams
    if (competition) {
      const comp = await this.competitionRepository.findById(competition);
      if (!comp || !comp.registeredTeams) {
        return [];
      }
      
      // Filter registered teams by gender and ageGroup
      let filteredRegisteredTeams = comp.registeredTeams.filter(rt => rt.isActive);
      
      if (gender || ageGroup) {
        filteredRegisteredTeams = filteredRegisteredTeams.filter(rt => {
          // Check if any player in the team matches the gender/ageGroup filter
          return rt.players.some(p => {
            const matchesGender = !gender || p.gender === gender;
            const matchesAgeGroup = !ageGroup || p.ageGroup === ageGroup;
            return matchesGender && matchesAgeGroup;
          });
        });
      }
      
      // Get team IDs
      const teamIds = filteredRegisteredTeams.map(rt => rt.team);
      
      if (teamIds.length === 0) {
        return [];
      }
      
      // Fetch actual team documents with coach populated
      const teams = await this.teamRepository.find(
        { _id: { $in: teamIds } },
        { populate: 'coach' }
      );
      
      // Build response with players from registeredTeams
      const teamsWithPlayers = await Promise.all(
        teams.map(async (team) => {
          const registeredTeam = filteredRegisteredTeams.find(
            rt => rt.team.toString() === team._id.toString()
          );
          
          // Get player details with age groups from registered team
          const playerIds = registeredTeam.players.map(p => p.player);
          const players = await this.playerRepository.find({ _id: { $in: playerIds } });
          
          // Map players with age groups from registered team data
          let playersWithAgeGroups = players.map(player => {
            const registeredPlayer = registeredTeam.players.find(
              rp => rp.player.toString() === player._id.toString()
            );
            return {
              ...enteredPlayerCard(player, registeredPlayer),
              // The superadmin list shows apparatus; the admin list does not.
              apparatus: registeredPlayer?.apparatus
            };
          });
          
          // Apply gender and ageGroup filters to the players list
          if (gender || ageGroup) {
            playersWithAgeGroups = playersWithAgeGroups.filter(player => {
              const matchesGender = !gender || player.gender === gender;
              const matchesAgeGroup = !ageGroup || player.ageGroup === ageGroup;
              return matchesGender && matchesAgeGroup;
            });
          }
          
          return {
            _id: team._id,
            name: team.name,
            coach: coachCard(team.coach),
            playerCount: playersWithAgeGroups.length,
            players: playersWithAgeGroups,
            description: team.description,
            isActive: team.isActive,
            isSubmitted: registeredTeam.isSubmitted,
            paymentStatus: registeredTeam.paymentStatus,
            createdAt: team.createdAt,
            updatedAt: team.updatedAt
          };
        })
      );
      
      return teamsWithPlayers;
    }
    
    // If no competition filter, get all teams (original behavior)
    const teams = await this.teamRepository.find({}, { 
      sort: { createdAt: -1 },
      populate: 'coach'
    });
    
    // Fetch every team's players in ONE query and group them in memory, rather
    // than a find() per team. Promise.all made the round-trips concurrent but
    // there were still 1 + N of them, and this list is unpaginated — the query
    // count grew with the size of the event.
    const playersByTeam = await this.groupPlayersByTeam(teams.map((t) => t._id));

    const teamsWithPlayers = await Promise.all(
      teams.map(async (team) => {
        const players = playersByTeam.get(String(team._id)) || [];
        return {
          _id: team._id,
          name: team.name,
          coach: coachCard(team.coach),
          playerCount: players.length,
          players: players.map(p => ({
            _id: p._id,
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            ageGroup: p.ageGroup,
            gender: p.gender
          })),
          description: team.description,
          isActive: team.isActive,
          createdAt: team.createdAt,
          updatedAt: team.updatedAt
        };
      })
    );
    
    return teamsWithPlayers;
  }
  /**
   * Load the players for many teams in a single query, grouped by team id.
   *
   * Replaces the `find({ team })`-per-team pattern this file used in several
   * places. Keys are stringified because `team` comes back as an ObjectId and
   * `Map` lookups are by identity.
   *
   * @param {Array<import('mongoose').Types.ObjectId|string>} teamIds
   * @returns {Promise<Map<string, Object[]>>} team id → its players
   */
  async groupPlayersByTeam(teamIds) {
    const grouped = new Map();
    if (!teamIds || teamIds.length === 0) {
      return grouped;
    }

    const players = await this.playerRepository.find({ team: { $in: teamIds } });

    for (const player of players) {
      const key = String(player.team);
      const bucket = grouped.get(key);
      if (bucket) {
        bucket.push(player);
      } else {
        grouped.set(key, [player]);
      }
    }

    return grouped;
  }

  async deleteTeam(teamId) { return this.teamRepository.updateById(teamId, { isActive: false }); }
  async deleteJudge(judgeId) { return this.judgeRepository.deleteById(judgeId); }

  async createCompetition(payload, adminId) {
    const rawFee = payload.playerFee;
    const playerFee = typeof rawFee === 'number' ? rawFee : Number(rawFee);
    if (!Number.isFinite(playerFee) || playerFee < 0) {
      throw new ValidationError('A valid per-player fee (INR) is required for each competition');
    }
    // The per-gender apparatus is validated here and `apparatusConfig` is
    // derived from it, so the two cannot disagree.
    const body = applyApparatusByGender({ ...normalizeFeeWindow(payload), playerFee });

    // Mandatory: it caps every team per age group and decides the Team
    // Championship count (4 → best 3, 6 → best 5).
    if (!isValidTeamSize(payload.maxTeamSize)) {
      throw new ValidationError(TEAM_SIZE_MESSAGE);
    }
    body.maxTeamSize = Number(payload.maxTeamSize);

    // Use admins from payload if provided, otherwise default to the creator
    const assignedAdmins = body.admins && body.admins.length > 0 
      ? body.admins 
      : [adminId];
    
    // Create competition with assigned admins
    const competition = await this.competitionRepository.create({ 
      ...body, 
      createdBy: adminId, 
      admins: assignedAdmins 
    });
    
    // Update competitions array for all assigned admins (bidirectional relationship)
    for (const assignedAdminId of assignedAdmins) {
      const admin = await this.adminRepository.findById(assignedAdminId);
      if (admin) {
        const adminCompetitions = Array.from(new Set([...(admin.competitions || []).map(String), String(competition._id)]));
        await this.adminRepository.updateById(assignedAdminId, { competitions: adminCompetitions });
      }
    }
    
    return competition;
  }
  async getAllCompetitions() { 
    return this.competitionRepository.find({ isDeleted: false }, { 
      sort: { createdAt: -1 },
      populate: { path: 'admins', select: 'name email role isActive' }
    }); 
  }
  
  async getCompetitionById(id) { 
    return this.competitionRepository.findById(id, {
      populate: { path: 'admins', select: 'name email role isActive' }
    }); 
  }
  
  async updateCompetition(id, payload) {
    /*
     * The stored competition is needed to validate the window: an edit that
     * only moves the End Date still has to be checked against the fee deadline
     * already on file, and vice versa.
     */
    const existing = await this.competitionRepository.findById(id);
    if (!existing) throw new NotFoundError('Competition');

    const body = applyApparatusByGender(normalizeFeeWindow(payload, existing), existing.competitionTypes);

    if (Object.prototype.hasOwnProperty.call(payload, 'maxTeamSize')) {
      if (!isValidTeamSize(payload.maxTeamSize)) {
        throw new ValidationError(TEAM_SIZE_MESSAGE);
      }
      body.maxTeamSize = Number(payload.maxTeamSize);
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'playerFee')) {
      const rawFee = payload.playerFee;
      const playerFee = typeof rawFee === 'number' ? rawFee : Number(rawFee);
      if (!Number.isFinite(playerFee) || playerFee < 0) {
        throw new ValidationError('A valid per-player fee (INR) is required for each competition');
      }
      return this.competitionRepository.updateById(id, { ...body, playerFee });
    }
    return this.competitionRepository.updateById(id, body);
  }
  async deleteCompetition(id) {
    return this.competitionService.deleteCompetition(id);
  }

  async assignAdminToCompetition(id, adminId) {
    const competition = await this.competitionRepository.findById(id);
    if (!competition) throw new NotFoundError('Competition');
    
    // Check if admin exists
    const admin = await this.adminRepository.findById(adminId);
    if (!admin) throw new NotFoundError('Admin');
    
    // Update competition's admins array
    const admins = Array.from(new Set([...(competition.admins || []).map(String), String(adminId)]));
    await this.competitionRepository.updateById(id, { admins });
    
    // Update admin's competitions array (bidirectional relationship)
    const adminCompetitions = Array.from(new Set([...(admin.competitions || []).map(String), String(id)]));
    await this.adminRepository.updateById(adminId, { competitions: adminCompetitions });
    
    // Return populated competition
    return this.competitionRepository.findById(id, {
      populate: { path: 'admins', select: 'name email role isActive' }
    });
  }

  async removeAdminFromCompetition(id, adminId) {
    const competition = await this.competitionRepository.findById(id);
    if (!competition) throw new NotFoundError('Competition');
    
    // Update competition's admins array
    const admins = (competition.admins || []).map(String).filter((v) => v !== String(adminId));
    await this.competitionRepository.updateById(id, { admins });
    
    // Update admin's competitions array (bidirectional relationship)
    const admin = await this.adminRepository.findById(adminId);
    if (admin) {
      const adminCompetitions = (admin.competitions || []).map(String).filter((v) => v !== String(id));
      await this.adminRepository.updateById(adminId, { competitions: adminCompetitions });
    }
    
    // Return populated competition
    return this.competitionRepository.findById(id, {
      populate: { path: 'admins', select: 'name email role isActive' }
    });
  }

  async getSystemStats() {
    const [admins, coaches, teams, competitions] = await Promise.all([
      this.adminRepository.count({}),
      this.coachRepository.count({}),
      this.teamRepository.count({}),
      this.competitionRepository.count({}),
    ]);
    return { admins, coaches, teams, competitions };
  }

  async getSuperAdminDashboard(competitionId) {
    const systemStats = await this.getSystemStats();
    
    // Calculate competition statistics
    let competitionStats = {};
    
    if (competitionId) {
      // Get stats for specific competition
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition');
      }
      
      const registeredTeams = competition.registeredTeams || [];
      const activeTeams = registeredTeams.filter(rt => rt.isActive);
      
      // Get all player IDs from registered teams
      const allPlayerIds = [];
      activeTeams.forEach(rt => {
        rt.players.forEach(p => {
          if (p.player) {
            allPlayerIds.push(p.player);
          }
        });
      });
      
      // Fetch all players
      const players = await this.playerRepository.find({ _id: { $in: allPlayerIds } });
      
      // Create a map of player IDs to player data for quick lookup
      const playerMap = new Map();
      players.forEach(p => {
        playerMap.set(p._id.toString(), p);
      });
      
      // Count statistics
      let boysTeams = 0;
      let girlsTeams = 0;
      let totalBoys = 0;
      let totalGirls = 0;
      
      activeTeams.forEach(rt => {
        const teamPlayers = rt.players.map(p => {
          const player = playerMap.get(p.player.toString());
          return {
            gender: p.gender || player?.gender,
            ageGroup: p.ageGroup || player?.ageGroup
          };
        });
        
        const hasBoys = teamPlayers.some(p => p.gender === 'Male');
        const hasGirls = teamPlayers.some(p => p.gender === 'Female');
        
        if (hasBoys) boysTeams++;
        if (hasGirls) girlsTeams++;
        
        teamPlayers.forEach(p => {
          if (p.gender === 'Male') totalBoys++;
          if (p.gender === 'Female') totalGirls++;
        });
      });
      
      competitionStats = {
        totalTeams: activeTeams.length,
        totalParticipants: totalBoys + totalGirls,
        boysTeams,
        girlsTeams,
        totalBoys,
        totalGirls
      };
    } else {
      // Get stats for all competitions
      const allCompetitions = await this.competitionRepository.find({ isDeleted: false });
      
      // Use Sets to track unique teams and players across all competitions
      const uniqueTeamIds = new Set();
      const uniquePlayerIds = new Set();
      let boysTeams = 0;
      let girlsTeams = 0;
      let totalBoys = 0;
      let totalGirls = 0;
      let activeCompetitions = 0;
      
      // Track which teams have boys/girls to avoid double counting
      const teamGenderMap = new Map(); // teamId -> { hasBoys: boolean, hasGirls: boolean }
      
      for (const competition of allCompetitions) {
        if (competition.isActive) activeCompetitions++;
        
        const registeredTeams = competition.registeredTeams || [];
        const activeTeams = registeredTeams.filter(rt => rt.isActive);
        
        // Get all player IDs from registered teams
        const allPlayerIds = [];
        activeTeams.forEach(rt => {
          rt.players.forEach(p => {
            if (p.player) {
              allPlayerIds.push(p.player);
            }
          });
        });
        
        // Fetch all players for this competition
        const players = await this.playerRepository.find({ _id: { $in: allPlayerIds } });
        
        // Create a map of player IDs to player data
        const playerMap = new Map();
        players.forEach(p => {
          playerMap.set(p._id.toString(), p);
        });
        
        activeTeams.forEach(rt => {
          const teamId = rt.team.toString();
          uniqueTeamIds.add(teamId);
          
          const teamPlayers = rt.players.map(p => {
            const playerId = p.player.toString();
            uniquePlayerIds.add(playerId);
            
            const player = playerMap.get(playerId);
            return {
              id: playerId,
              gender: p.gender || player?.gender,
              ageGroup: p.ageGroup || player?.ageGroup
            };
          });
          
          const hasBoys = teamPlayers.some(p => p.gender === 'Male');
          const hasGirls = teamPlayers.some(p => p.gender === 'Female');
          
          // Track team gender composition (update if team appears in multiple competitions)
          if (!teamGenderMap.has(teamId)) {
            teamGenderMap.set(teamId, { hasBoys: false, hasGirls: false });
          }
          const teamGender = teamGenderMap.get(teamId);
          if (hasBoys) teamGender.hasBoys = true;
          if (hasGirls) teamGender.hasGirls = true;
        });
      }
      
      // Count boys/girls teams based on unique teams
      teamGenderMap.forEach(({ hasBoys, hasGirls }) => {
        if (hasBoys) boysTeams++;
        if (hasGirls) girlsTeams++;
      });
      
      // Count total boys and girls from unique players
      const allUniquePlayers = await this.playerRepository.find({ 
        _id: { $in: Array.from(uniquePlayerIds) } 
      });
      
      allUniquePlayers.forEach(player => {
        if (player.gender === 'Male') totalBoys++;
        if (player.gender === 'Female') totalGirls++;
      });
      
      competitionStats = {
        totalTeams: uniqueTeamIds.size,
        totalParticipants: allUniquePlayers.length,
        boysTeams,
        girlsTeams,
        totalBoys,
        totalGirls,
        totalCompetitions: allCompetitions.length,
        activeCompetitions
      };
    }
    
    return {
      competitionId: competitionId || null,
      stats: systemStats,
      competitionStats
    };
  }

  async getTransactions(competitionId) {
    const criteria = competitionId ? { competition: competitionId } : {};
    return this.transactionRepository.find(criteria, {
      sort: { createdAt: -1 },
      limit: 200,
      populate: [
        {
          path: 'competition',
          populate: {
            path: 'registeredTeams.players.player',
            select: 'firstName lastName name gender'
          }
        },
        'team',
        'coach'
      ]
    });
  }

  /**
   * Create payment order for adding a player
   * @param {string} superAdminId - Super admin ID
   * @param {Object} playerData - Player data including teamId, competitionId
   * @returns {Promise<Object>} Payment order details
   */
  async createPlayerPaymentOrder(superAdminId, playerData) {
    try {
      const { teamId, competitionId, firstName, lastName } = playerData;

      // Validate competition exists
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition not found');
      }

      // Validate team belongs to competition
      const registeredTeam = this._findRegisteredTeam(competition, teamId);

      if (!registeredTeam) {
        throw new NotFoundError('Team not registered for this competition');
      }

      const canonicalTeamId = this._canonicalTeamId(registeredTeam, teamId);

      // Get team details
      const team = await this.teamRepository.findById(canonicalTeamId);
      if (!team) {
        throw new NotFoundError('Team not found');
      }

      // Checked BEFORE any money moves: `addPlayer` refuses a full squad after
      // payment, which would leave the charge with no athlete to show for it.
      if (!hasRoomInSquad(competition.maxTeamSize, registeredTeam.players, playerData.gender, playerData.ageGroup)) {
        throw new ValidationError(
          `This competition allows at most ${competition.maxTeamSize} players per age group, `
          + `and ${team.name}'s ${playerData.gender} ${playerData.ageGroup} is full`
        );
      }

      /*
       * Calculate payment amount using centralized config with
       * competition-specific player fee, plus any late fee in force.
       *
       * The window is NOT asserted here. A coach is blocked outside it; a super
       * admin adding a player is the override for exactly the cases the window
       * would otherwise refuse, and an override the calendar can veto is not
       * one. They still pay the penalty — only the block is lifted.
       */
      const quotedAt = new Date();
      const feeWindow = resolveFeeWindow(competition, quotedAt);
      const amount = calculatePlayerAdditionAmount(playerData, competition, quotedAt);

      // Credentials, client and receipt scheme are shared with the coach's squad
      // payment path — see services/payment/razorpay.gateway.
      const razorpayKeyId = this.config?.get('razorpay.keyId') || '';
      const razorpay = razorpayClient(this.config);

      this.logger?.info?.('Creating Razorpay order for player addition', {
        amount,
        teamId: team._id.toString(),
        competitionId
      });

      const razorpayOrder = await razorpay.orders.create({
        amount: amount * 100, // Razorpay expects amount in paise
        currency: RAZORPAY_CURRENCY,
        receipt: buildReceipt(team._id),
        notes: {
          superAdminId: superAdminId.toString(),
          competitionId: competitionId.toString(),
          teamId: team._id.toString(),
          teamName: team.name,
          playerName: `${firstName} ${lastName}`,
          type: 'player_addition',
          feePhase: feeWindow.phase,
          lateFeePerPlayer: feeWindow.lateFeePerPlayer
        }
      });

      this.logger?.info?.('Razorpay order created successfully for player addition', {
        superAdminId,
        competitionId,
        orderId: razorpayOrder.id,
        amount
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
          name: team.name
        },
        playerData: {
          firstName,
          lastName
        },
        fee: {
          phase: feeWindow.phase,
          isLate: feeWindow.isLate,
          lateFeePerPlayer: feeWindow.lateFeePerPlayer,
          dueBy: feeWindow.dueBy,
          closesAt: feeWindow.closesAt
        }
      };
    } catch (error) {
      this.logger?.error?.('Error creating payment order for player addition', {
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

  /**
   * Verify payment and add player to team
   * @param {string} superAdminId - Super admin ID
   * @param {Object} playerData - Player data
   * @param {Object} paymentPayload - Razorpay payment details
   * @returns {Promise<Object>} Created player details
   */
  async verifyPaymentAndAddPlayer(superAdminId, playerData, paymentPayload) {
    try {
      // Validate payment payload
      if (!paymentPayload?.razorpay_order_id || !paymentPayload?.razorpay_payment_id || !paymentPayload?.razorpay_signature) {
        throw new ValidationError('Missing required payment details');
      }

      // CRITICAL: Verify Razorpay payment signature server-side. The HMAC and
      // the constant-time comparison live in services/payment/razorpay.gateway,
      // shared with the coach's squad payment path.
      const signatureValid = verifyPaymentSignature(this.config, {
        orderId: paymentPayload.razorpay_order_id,
        paymentId: paymentPayload.razorpay_payment_id,
        signature: paymentPayload.razorpay_signature,
      });

      if (!signatureValid) {
        this.logger?.error?.('Payment signature verification failed', {
          superAdminId,
          orderId: paymentPayload.razorpay_order_id,
          paymentId: paymentPayload.razorpay_payment_id
        });
        throw new ValidationError('Payment verification failed: Invalid signature');
      }

      // Verify payment status with Razorpay API — the client's claim that it
      // succeeded is not evidence.
      let paymentDetails;
      try {
        paymentDetails = await fetchPaymentDetails(this.config, paymentPayload.razorpay_payment_id);
      } catch (error) {
        this.logger?.error?.('Failed to fetch payment details from Razorpay', {
          error: error.message,
          paymentId: paymentPayload.razorpay_payment_id
        });
        throw error;
      }

      // Check payment status
      if (!isPaymentSuccessful(paymentDetails)) {
        this.logger?.error?.('Payment not successful', {
          paymentId: paymentPayload.razorpay_payment_id,
          status: paymentDetails.status,
          orderId: paymentPayload.razorpay_order_id
        });
        
        throw new ValidationError(`Payment ${paymentDetails.status}. Please try again or contact support.`);
      }

      // Verify order ID matches
      if (paymentDetails.order_id !== paymentPayload.razorpay_order_id) {
        this.logger?.error?.('Order ID mismatch', {
          expected: paymentPayload.razorpay_order_id,
          received: paymentDetails.order_id
        });
        throw new ValidationError('Payment verification failed: Order mismatch');
      }

      // Get competition to use competition-specific player fee
      const competition = await this.competitionRepository.findById(playerData.competitionId);
      if (!competition) {
        throw new NotFoundError('Competition not found');
      }

      /*
       * Price against the instant the payment was actually made — Razorpay's
       * own `created_at`, not ours — so a late-window payment is checked
       * against the late-window quote. Same reasoning, and the same narrow
       * deadline-crossing edge, as `coach.service.verifyTeamPaymentAndSubmit`.
       */
      const paidAt = paidAtFrom(paymentDetails);
      const feeWindow = resolveFeeWindow(competition, paidAt);

      // Verify payment amount with competition-specific player fee
      const expectedAmount = calculatePlayerAdditionAmount(playerData, competition, paidAt) * 100; // Convert to paise
      if (paymentDetails.amount !== expectedAmount) {
        this.logger?.error?.('Payment amount mismatch', {
          expected: expectedAmount,
          received: paymentDetails.amount,
          paymentId: paymentPayload.razorpay_payment_id,
          competitionPlayerFee: competition.playerFee,
          feePhase: feeWindow.phase,
          lateFeePerPlayer: feeWindow.lateFeePerPlayer
        });
        throw new ValidationError('Payment verification failed: Amount mismatch');
      }

      // All verifications passed - Add player
      const player = await this.addPlayer(playerData, superAdminId);

      // Update transaction with payment details
      const transaction = await this.transactionRepository.findOne({
        player: player.id,
        competition: playerData.competitionId,
        team: playerData.teamId
      });

      if (transaction) {
        // Preserve existing metadata (like coachName) and add payment details
        const existingMetadata = transaction.metadata || {};
        await this.transactionRepository.updateById(transaction._id, {
          amount: paymentDetails.amount / 100, // Convert paise to rupees
          paymentStatus: 'completed',
          metadata: {
            ...existingMetadata, // Preserve coach name and other metadata
            razorpay_order_id: paymentPayload.razorpay_order_id,
            razorpay_payment_id: paymentPayload.razorpay_payment_id,
            razorpay_signature: paymentPayload.razorpay_signature,
            razorpay_status: paymentDetails.status,
            payment_method: paymentDetails.method,
            feePhase: feeWindow.phase,
            lateFeePerPlayer: feeWindow.lateFeePerPlayer,
            verifiedAt: new Date(),
            verified: true
          }
        });
      }

      this.logger?.info?.('Player added successfully with verified payment', { 
        superAdminId, 
        playerId: player.id,
        paymentId: paymentPayload.razorpay_payment_id,
        status: paymentDetails.status
      });

      return {
        ...player,
        verified: true,
        payment: paymentPayload
      };
    } catch (error) {
      this.logger?.error?.('Error verifying payment and adding player', {
        error: error.message,
        stack: error.stack,
        superAdminId
      });
      throw error;
    }
  }

  async addPlayer({ firstName, lastName, email, emailType, guardian, dateOfBirth, gender, ageGroup, teamId, competitionId, password, apparatus }, superAdminId) {
    // Verify teamId belongs to competitionId
    const competition = await this.competitionRepository.findById(competitionId);
    if (!competition) {
      throw new ValidationError('Competition not found');
    }

    const registeredTeam = this._findRegisteredTeam(competition, teamId);

    if (!registeredTeam) {
      throw new ValidationError('Team does not belong to the specified competition');
    }

    const canonicalTeamId = this._canonicalTeamId(registeredTeam, teamId);

    // Fetch team with coach populated to get coach name for transaction
    const teamWithCoach = await this.teamRepository.findById(canonicalTeamId, {
      populate: { path: 'coach', select: 'firstName lastName' }
    });
    const coachName = fullName(teamWithCoach?.coach) || 'Unknown Coach';

    // Validate age group is available for the competition
    const validAgeGroup = (competition.ageGroups || []).some(
      ag => ag.gender === gender && ag.ageGroup === ageGroup
    );
    
    if (!validAgeGroup) {
      throw new ValidationError(`Age group ${ageGroup} for ${gender} is not available in this competition`);
    }

    // The meet's per-age-group cap applies here too: it is a rule of the
    // Team Championship, not a registration-window permission.
    if (!hasRoomInSquad(competition.maxTeamSize, registeredTeam.players, gender, ageGroup)) {
      throw new ValidationError(
        `This competition allows at most ${competition.maxTeamSize} players per age group, `
        + `and ${teamWithCoach?.name || 'this team'}'s ${gender} ${ageGroup} is full`
      );
    }

    // The same three choices as self-registration. Only a player's own
    // address must be unique; a guardian's may be shared by siblings.
    const kind = emailType || 'self';
    if (!EMAIL_TYPES.includes(kind)) {
      throw new ValidationError(`emailType must be one of: ${EMAIL_TYPES.join(', ')}`);
    }
    const address = kind === 'none' ? undefined : String(email || '').trim().toLowerCase();
    if (kind !== 'none' && !address) {
      throw new ValidationError('Email is required');
    }
    if (kind !== 'self' && !(guardian?.name && guardian?.phone)) {
      throw new ValidationError('Parent/guardian name and phone are required for a player without their own email');
    }
    if (kind === 'self' && await this.playerRepository.isEmailTaken(address)) {
      throw new ValidationError('Player with this email already exists');
    }

    // Open MongoDB session and run transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Create Player document
      const playerData = {
        firstName,
        lastName,
        emailType: kind,
        ...(address ? { email: address } : {}),
        ...(kind !== 'self' ? { guardian: { name: guardian.name, relation: guardian.relation || null, phone: guardian.phone } } : {}),
        dateOfBirth,
        gender,
        ageGroup, // Add age group to player document
        team: canonicalTeamId,
        password
      };

      const [player] = await this.playerRepository.create([playerData], { session });

      // Note: Team model doesn't have a players array - players reference teams
      // The team-player relationship is maintained through the player.team field
      // and the competition.registeredTeams.players array

      // Add player to the competition's registered team
      if (!registeredTeam.players) {
        registeredTeam.players = [];
      }
      const playerExists = registeredTeam.players.some(
        p => p.player?.toString() === player._id.toString()
      );

      if (!playerExists) {
        registeredTeam.players.push({
          player: player._id,
          ageGroup: ageGroup,
          gender: gender,
          apparatus: apparatus || {}
        });

        await this.competitionRepository.updateById(competitionId, {
          registeredTeams: competition.registeredTeams
        }, { session });
      }

      // Create Transaction document with coach name and coach reference
      const transactionData = {
        source: 'superadmin',
        type: 'player_add',
        amount: 0,
        competition: competitionId,
        team: canonicalTeamId,
        coach: teamWithCoach?.coach?._id, // Add coach reference
        player: player._id,
        paymentStatus: 'completed',
        description: `Player ${firstName} ${lastName} added by super admin to ${ageGroup} ${gender}`,
        metadata: {
          coachName: coachName,
          addedBy: 'Super Admin',
          teamName: teamWithCoach?.name || 'Unknown Team'
        }
      };

      await this.transactionRepository.create([transactionData], { session });

      // Commit transaction
      await session.commitTransaction();

      // The Player ID goes where self-registration would send it: the
      // player's or guardian's email, or — with no email — the team's coach.
      const otp = this.authenticationService?.otpService;
      if (address) {
        otp?.notifyPlayerLoginIds?.(address, [player], 'registered');
      } else if (teamWithCoach?.coach?._id) {
        otp?.notifyCoachOfPlayerId?.(teamWithCoach.coach._id, player, 'joined-team', teamWithCoach.name);
      }

      return {
        id: player._id,
        firstName: player.firstName,
        lastName: player.lastName,
        email: player.email,
        loginId: player.loginId,
        team: canonicalTeamId,
        ageGroup: ageGroup,
        gender: gender
      };
    } catch (error) {
      // Abort transaction on failure
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = SuperAdminService;

