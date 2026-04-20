const { NotFoundError } = require('../../errors');

class SuperAdminService {
  constructor({
    authenticationService,
    adminRepository,
    coachRepository,
    teamRepository,
    judgeRepository,
    competitionRepository,
    transactionRepository,
    logger,
  }) {
    this.authenticationService = authenticationService;
    this.adminRepository = adminRepository;
    this.coachRepository = coachRepository;
    this.teamRepository = teamRepository;
    this.judgeRepository = judgeRepository;
    this.competitionRepository = competitionRepository;
    this.transactionRepository = transactionRepository;
    this.logger = logger;
  }

  async loginSuperAdmin(email, password) {
    const result = await this.authenticationService.login(email, password, 'admin');
    const role = result?.user?.role;
    if (role !== 'super_admin' && role !== 'superadmin') {
      throw new NotFoundError('Super admin account not found');
    }
    return result;
  }

  async getAllAdmins() { return this.adminRepository.find({}, { sort: { createdAt: -1 } }); }
  async createAdmin(payload) { return this.authenticationService.register(payload, 'admin'); }
  async updateAdmin(adminId, payload) { return this.adminRepository.updateById(adminId, payload); }
  async deleteAdmin(adminId) { return this.adminRepository.deleteById(adminId); }

  async getAllCoaches() { return this.coachRepository.find({}, { sort: { createdAt: -1 } }); }
  async updateCoachStatus(coachId, isActive) { return this.coachRepository.updateById(coachId, { isActive }); }

  async getAllTeams() { return this.teamRepository.find({}, { sort: { createdAt: -1 } }); }
  async deleteTeam(teamId) { return this.teamRepository.updateById(teamId, { isActive: false }); }
  async deleteJudge(judgeId) { return this.judgeRepository.deleteById(judgeId); }

  async createCompetition(payload, adminId) {
    return this.competitionRepository.create({ ...payload, createdBy: adminId, admins: [adminId] });
  }
  async getAllCompetitions() { return this.competitionRepository.find({}, { sort: { createdAt: -1 } }); }
  async getCompetitionById(id) { return this.competitionRepository.findById(id); }
  async updateCompetition(id, payload) { return this.competitionRepository.updateById(id, payload); }
  async deleteCompetition(id) { return this.competitionRepository.updateById(id, { isDeleted: true }); }

  async assignAdminToCompetition(id, adminId) {
    const competition = await this.competitionRepository.findById(id);
    if (!competition) throw new NotFoundError('Competition not found');
    const admins = Array.from(new Set([...(competition.admins || []).map(String), String(adminId)]));
    return this.competitionRepository.updateById(id, { admins });
  }

  async removeAdminFromCompetition(id, adminId) {
    const competition = await this.competitionRepository.findById(id);
    if (!competition) throw new NotFoundError('Competition not found');
    const admins = (competition.admins || []).map(String).filter((v) => v !== String(adminId));
    return this.competitionRepository.updateById(id, { admins });
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
    return {
      competitionId: competitionId || null,
      stats: await this.getSystemStats(),
    };
  }

  async getTransactions(competitionId) {
    const criteria = competitionId ? { competition: competitionId } : {};
    return this.transactionRepository.find(criteria, { sort: { createdAt: -1 }, limit: 200 });
  }
}

module.exports = SuperAdminService;
