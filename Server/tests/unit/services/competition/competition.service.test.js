const CompetitionService = require('../../../../src/services/competition/competition.service');
const { NotFoundError } = require('../../../../src/errors');

// Regression coverage for a live defect found while building Server/MEMORY:
// POST/DELETE /api/competitions/:id/admins(/:adminId) called
// competitionService.assignAdmin/removeAdmin, which did not exist on this
// class — every call threw a TypeError caught by asyncHandler as a 500.

describe('CompetitionService - admin assignment', () => {
  let service;
  let mockCompetitionRepo;
  let mockAdminRepo;
  let mockCacheService;
  let mockLogger;

  const competitionId = 'comp123';
  const adminId = 'admin456';

  beforeEach(() => {
    mockCompetitionRepo = {
      findById: jest.fn(),
      updateById: jest.fn(),
    };
    mockAdminRepo = {
      findById: jest.fn(),
      updateById: jest.fn(),
    };
    mockCacheService = {
      delete: jest.fn(),
      deletePattern: jest.fn(),
    };
    mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

    service = new CompetitionService(mockCompetitionRepo, mockCacheService, null, mockLogger, mockAdminRepo);
  });

  describe('assignAdmin', () => {
    it('adds the competition to the admin and the admin to the competition', async () => {
      mockCompetitionRepo.findById
        .mockResolvedValueOnce({ _id: competitionId, isDeleted: false, admins: [] })
        .mockResolvedValueOnce({ _id: competitionId, admins: [adminId] });
      mockAdminRepo.findById.mockResolvedValue({ _id: adminId, competitions: [] });

      await service.assignAdmin(competitionId, adminId);

      expect(mockCompetitionRepo.updateById).toHaveBeenCalledWith(competitionId, { admins: [adminId] });
      expect(mockAdminRepo.updateById).toHaveBeenCalledWith(adminId, { competitions: [competitionId] });
    });

    it('does not duplicate an already-assigned admin', async () => {
      mockCompetitionRepo.findById
        .mockResolvedValueOnce({ _id: competitionId, isDeleted: false, admins: [adminId] })
        .mockResolvedValueOnce({ _id: competitionId, admins: [adminId] });
      mockAdminRepo.findById.mockResolvedValue({ _id: adminId, competitions: [competitionId] });

      await service.assignAdmin(competitionId, adminId);

      expect(mockCompetitionRepo.updateById).toHaveBeenCalledWith(competitionId, { admins: [adminId] });
      expect(mockAdminRepo.updateById).toHaveBeenCalledWith(adminId, { competitions: [competitionId] });
    });

    it('throws NotFoundError for a missing competition', async () => {
      mockCompetitionRepo.findById.mockResolvedValue(null);

      await expect(service.assignAdmin(competitionId, adminId)).rejects.toThrow(NotFoundError);
      expect(mockAdminRepo.updateById).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for a missing admin', async () => {
      mockCompetitionRepo.findById.mockResolvedValue({ _id: competitionId, isDeleted: false, admins: [] });
      mockAdminRepo.findById.mockResolvedValue(null);

      await expect(service.assignAdmin(competitionId, adminId)).rejects.toThrow(NotFoundError);
      expect(mockCompetitionRepo.updateById).not.toHaveBeenCalled();
    });
  });

  describe('removeAdmin', () => {
    it('removes the competition from the admin and the admin from the competition', async () => {
      mockCompetitionRepo.findById
        .mockResolvedValueOnce({ _id: competitionId, isDeleted: false, admins: [adminId, 'other'] })
        .mockResolvedValueOnce({ _id: competitionId, admins: ['other'] });
      mockAdminRepo.findById.mockResolvedValue({ _id: adminId, competitions: [competitionId, 'otherComp'] });

      await service.removeAdmin(competitionId, adminId);

      expect(mockCompetitionRepo.updateById).toHaveBeenCalledWith(competitionId, { admins: ['other'] });
      expect(mockAdminRepo.updateById).toHaveBeenCalledWith(adminId, { competitions: ['otherComp'] });
    });

    it('throws NotFoundError for a missing competition', async () => {
      mockCompetitionRepo.findById.mockResolvedValue(null);

      await expect(service.removeAdmin(competitionId, adminId)).rejects.toThrow(NotFoundError);
    });

    it('still updates the competition even if the admin no longer exists', async () => {
      mockCompetitionRepo.findById
        .mockResolvedValueOnce({ _id: competitionId, isDeleted: false, admins: [adminId] })
        .mockResolvedValueOnce({ _id: competitionId, admins: [] });
      mockAdminRepo.findById.mockResolvedValue(null);

      await service.removeAdmin(competitionId, adminId);

      expect(mockCompetitionRepo.updateById).toHaveBeenCalledWith(competitionId, { admins: [] });
      expect(mockAdminRepo.updateById).not.toHaveBeenCalled();
    });
  });
});
