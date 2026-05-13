const { NotFoundError, ValidationError } = require('../../errors');
const mongoose = require('mongoose');
const { calculatePlayerAdditionAmount } = require('../../config/payment.config');

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
    if (role !== 'super_admin' && role !== 'superadmin') {
      throw new NotFoundError('Super admin account');
    }
    return result;
  }

  async getAllAdmins() { return this.adminRepository.find({}, { sort: { createdAt: -1 } }); }
  async createAdmin(payload) { return this.authenticationService.register(payload, 'admin'); }
  async updateAdmin(adminId, payload) { return this.adminRepository.updateById(adminId, payload); }
  async deleteAdmin(adminId) { return this.adminRepository.deleteById(adminId); }

  async getAllCoaches() { return this.coachRepository.find({}, { sort: { createdAt: -1 } }); }
  async updateCoachStatus(coachId, isActive) { return this.coachRepository.updateById(coachId, { isActive }); }

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
              _id: player._id,
              firstName: player.firstName,
              lastName: player.lastName,
              email: player.email,
              ageGroup: registeredPlayer?.ageGroup || player.ageGroup,
              gender: registeredPlayer?.gender || player.gender
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
            coach: team.coach ? {
              _id: team.coach._id,
              name: team.coach.name,
              firstName: team.coach.firstName || team.coach.name?.split(' ')[0] || '',
              lastName: team.coach.lastName || team.coach.name?.split(' ').slice(1).join(' ') || '',
              email: team.coach.email
            } : null,
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
    
    // Fetch players for each team
    const teamsWithPlayers = await Promise.all(
      teams.map(async (team) => {
        const players = await this.playerRepository.find({ team: team._id });
        return {
          _id: team._id,
          name: team.name,
          coach: team.coach ? {
            _id: team.coach._id,
            name: team.coach.name,
            firstName: team.coach.firstName || team.coach.name?.split(' ')[0] || '',
            lastName: team.coach.lastName || team.coach.name?.split(' ').slice(1).join(' ') || '',
            email: team.coach.email
          } : null,
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
  async deleteTeam(teamId) { return this.teamRepository.updateById(teamId, { isActive: false }); }
  async deleteJudge(judgeId) { return this.judgeRepository.deleteById(judgeId); }

  async createCompetition(payload, adminId) {
    // Use admins from payload if provided, otherwise default to the creator
    const assignedAdmins = payload.admins && payload.admins.length > 0 
      ? payload.admins 
      : [adminId];
    
    // Create competition with assigned admins
    const competition = await this.competitionRepository.create({ 
      ...payload, 
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
  
  async updateCompetition(id, payload) { return this.competitionRepository.updateById(id, payload); }
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

      // Calculate payment amount using centralized config
      const amount = calculatePlayerAdditionAmount();

      // Get Razorpay credentials from config
      const razorpayKeyId = this.config?.get('razorpay.keyId') || '';
      const razorpayKeySecret = this.config?.get('razorpay.keySecret') || '';

      if (!razorpayKeyId || !razorpayKeySecret) {
        this.logger?.error?.('Razorpay credentials not configured', {
          hasKeyId: !!razorpayKeyId,
          hasKeySecret: !!razorpayKeySecret
        });
        throw new ValidationError('Razorpay credentials are not configured');
      }

      // Create Razorpay instance
      const Razorpay = require('razorpay');
      const razorpay = new Razorpay({
        key_id: razorpayKeyId,
        key_secret: razorpayKeySecret
      });

      this.logger?.info?.('Creating Razorpay order for player addition', {
        amount,
        teamId: team._id.toString(),
        competitionId
      });

      // Create Razorpay order
      const shortTeamId = team._id.toString().slice(-8);
      const timestamp = Date.now().toString().slice(-8);
      const receipt = `rcpt_${shortTeamId}_${timestamp}`;
      
      const razorpayOrder = await razorpay.orders.create({
        amount: amount * 100, // Razorpay expects amount in paise
        currency: 'INR',
        receipt: receipt,
        notes: {
          superAdminId: superAdminId.toString(),
          competitionId: competitionId.toString(),
          teamId: team._id.toString(),
          teamName: team.name,
          playerName: `${firstName} ${lastName}`,
          type: 'player_addition'
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

      // CRITICAL: Verify Razorpay payment signature server-side
      const razorpayKeySecret = this.config?.get('razorpay.keySecret') || '';
      if (!razorpayKeySecret) {
        this.logger?.error?.('Razorpay key secret not configured');
        throw new ValidationError('Payment verification failed: Configuration error');
      }

      const crypto = require('crypto');
      const generatedSignature = crypto
        .createHmac('sha256', razorpayKeySecret)
        .update(`${paymentPayload.razorpay_order_id}|${paymentPayload.razorpay_payment_id}`)
        .digest('hex');

      // Use timing-safe comparison
      const generatedBuffer = Buffer.from(generatedSignature);
      const receivedBuffer = Buffer.from(paymentPayload.razorpay_signature);

      if (generatedBuffer.length !== receivedBuffer.length || 
          !crypto.timingSafeEqual(generatedBuffer, receivedBuffer)) {
        this.logger?.error?.('Payment signature verification failed', {
          superAdminId,
          orderId: paymentPayload.razorpay_order_id,
          paymentId: paymentPayload.razorpay_payment_id
        });
        throw new ValidationError('Payment verification failed: Invalid signature');
      }

      // Verify payment status with Razorpay API
      const Razorpay = require('razorpay');
      const razorpayKeyId = this.config?.get('razorpay.keyId') || '';
      
      if (!razorpayKeyId) {
        throw new ValidationError('Payment verification failed: Configuration error');
      }

      const razorpay = new Razorpay({
        key_id: razorpayKeyId,
        key_secret: razorpayKeySecret
      });

      let paymentDetails;
      try {
        paymentDetails = await razorpay.payments.fetch(paymentPayload.razorpay_payment_id);
      } catch (error) {
        this.logger?.error?.('Failed to fetch payment details from Razorpay', {
          error: error.message,
          paymentId: paymentPayload.razorpay_payment_id
        });
        throw new ValidationError('Payment verification failed: Unable to verify payment status');
      }

      // Check payment status
      if (paymentDetails.status !== 'captured' && paymentDetails.status !== 'authorized') {
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

      // Verify payment amount
      const expectedAmount = calculatePlayerAdditionAmount() * 100; // Convert to paise
      if (paymentDetails.amount !== expectedAmount) {
        this.logger?.error?.('Payment amount mismatch', {
          expected: expectedAmount,
          received: paymentDetails.amount,
          paymentId: paymentPayload.razorpay_payment_id
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

  async addPlayer({ firstName, lastName, email, dateOfBirth, gender, ageGroup, teamId, competitionId, password }, superAdminId) {
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
      populate: { path: 'coach', select: 'name' }
    });
    const coachName = teamWithCoach?.coach?.name || 'Unknown Coach';

    // Validate age group is available for the competition
    const validAgeGroup = (competition.ageGroups || []).some(
      ag => ag.gender === gender && ag.ageGroup === ageGroup
    );
    
    if (!validAgeGroup) {
      throw new ValidationError(`Age group ${ageGroup} for ${gender} is not available in this competition`);
    }

    // Check player email uniqueness
    const existingPlayer = await this.playerRepository.findOne({ email: email.toLowerCase() });
    if (existingPlayer) {
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
        email: email.toLowerCase(),
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
          gender: gender
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

      return {
        id: player._id,
        firstName: player.firstName,
        lastName: player.lastName,
        email: player.email,
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

