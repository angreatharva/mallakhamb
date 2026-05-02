const { NotFoundError, ValidationError } = require('../../errors');
const mongoose = require('mongoose');

class SuperAdminService {
  constructor({
    authenticationService,
    adminRepository,
    coachRepository,
    teamRepository,
    judgeRepository,
    competitionRepository,
    transactionRepository,
    playerRepository,
    logger,
  }) {
    this.authenticationService = authenticationService;
    this.adminRepository = adminRepository;
    this.coachRepository = coachRepository;
    this.teamRepository = teamRepository;
    this.judgeRepository = judgeRepository;
    this.competitionRepository = competitionRepository;
    this.transactionRepository = transactionRepository;
    this.playerRepository = playerRepository;
    this.logger = logger;
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
    // Create competition with admin assigned
    const competition = await this.competitionRepository.create({ 
      ...payload, 
      createdBy: adminId, 
      admins: [adminId] 
    });
    
    // Update admin's competitions array (bidirectional relationship)
    const admin = await this.adminRepository.findById(adminId);
    if (admin) {
      const adminCompetitions = Array.from(new Set([...(admin.competitions || []).map(String), String(competition._id)]));
      await this.adminRepository.updateById(adminId, { competitions: adminCompetitions });
    }
    
    return competition;
  }
  async getAllCompetitions() { 
    return this.competitionRepository.find({}, { 
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
  async deleteCompetition(id) { return this.competitionRepository.updateById(id, { isDeleted: true }); }

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
      const allCompetitions = await this.competitionRepository.find({});
      
      let totalTeams = 0;
      let boysTeams = 0;
      let girlsTeams = 0;
      let totalBoys = 0;
      let totalGirls = 0;
      let activeCompetitions = 0;
      
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
          totalTeams++;
          
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
      }
      
      competitionStats = {
        totalTeams,
        totalParticipants: totalBoys + totalGirls,
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
      populate: ['competition', 'team', 'coach']
    });
  }

  async addPlayer({ firstName, lastName, email, dateOfBirth, gender, ageGroup, teamId, competitionId, password }, superAdminId) {
    // Verify teamId belongs to competitionId
    const competition = await this.competitionRepository.findById(competitionId);
    if (!competition) {
      throw new ValidationError('Competition not found');
    }

    const teamBelongsToCompetition = competition.registeredTeams?.some(
      rt => rt.team?.toString() === teamId || rt._id?.toString() === teamId
    );
    
    if (!teamBelongsToCompetition) {
      throw new ValidationError('Team does not belong to the specified competition');
    }

    // Validate age group is available for the competition
    const validAgeGroup = competition.ageGroups?.some(
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
        team: teamId,
        password
      };

      const [player] = await this.playerRepository.create([playerData], { session });

      // Note: Team model doesn't have a players array - players reference teams
      // The team-player relationship is maintained through the player.team field
      // and the competition.registeredTeams.players array

      // Add player to the competition's registered team
      const registeredTeam = competition.registeredTeams.find(
        rt => rt.team?.toString() === teamId
      );
      
      if (registeredTeam) {
        // Check if player is already in the registered team
        const playerExists = registeredTeam.players.some(
          p => p.player?.toString() === player._id.toString()
        );
        
        if (!playerExists) {
          // Add player to the registered team's players array
          registeredTeam.players.push({
            player: player._id,
            ageGroup: ageGroup,
            gender: gender
          });
          
          // Save the updated competition
          await this.competitionRepository.updateById(competitionId, {
            registeredTeams: competition.registeredTeams
          }, { session });
        }
      } else {
        throw new ValidationError('Registered team not found in competition');
      }

      // Create Transaction document
      const transactionData = {
        source: 'superadmin',
        type: 'player_add',
        amount: 0,
        competition: competitionId,
        team: teamId,
        player: player._id,
        paymentStatus: 'completed',
        description: `Player ${firstName} ${lastName} added by super admin to ${ageGroup} ${gender}`
      };

      await this.transactionRepository.create([transactionData], { session });

      // Commit transaction
      await session.commitTransaction();

      return {
        id: player._id,
        firstName: player.firstName,
        lastName: player.lastName,
        email: player.email,
        team: teamId,
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

