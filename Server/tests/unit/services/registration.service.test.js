/**
 * Registration Service Unit Tests
 * 
 * Tests team registration, validation, and status tracking.
 * Requirements: 15.1, 15.6
 */

const RegistrationService = require('../../../src/services/competition/registration.service');
const { 
  ValidationError, 
  ConflictError, 
  NotFoundError,
  BusinessRuleError 
} = require('../../../src/errors');

describe('RegistrationService', () => {
  let registrationService;
  let mockCompetitionRepo;
  let mockTeamRepo;
  let mockCacheService;
  let mockLogger;

  beforeEach(() => {
    // Mock competition repository
    mockCompetitionRepo = {
      findById: jest.fn(),
      addTeam: jest.fn(),
      removeTeam: jest.fn(),
      updateRegistration: jest.fn()
    };

    // Mock team repository
    mockTeamRepo = {
      findById: jest.fn()
    };

    // Mock cache service
    mockCacheService = {
      delete: jest.fn(),
      deletePattern: jest.fn()
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Create service instance
    registrationService = new RegistrationService(
      mockCompetitionRepo,
      mockTeamRepo,
      mockCacheService,
      mockLogger
    );
  });

  describe('registerTeam', () => {
    it('should successfully register a team', async () => {
      const competition = {
        _id: 'comp123',
        name: 'Test Competition',
        status: 'upcoming',
        isDeleted: false,
        registeredTeams: []
      };

      const team = {
        _id: 'team123',
        name: 'Test Team',
        coach: 'coach123',
        isActive: true
      };

      const updatedCompetition = {
        ...competition,
        registeredTeams: [{
          team: 'team123',
          coach: 'coach123',
          players: [],
          isSubmitted: false,
          paymentStatus: 'pending',
          isActive: true
        }]
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);
      mockTeamRepo.findById.mockResolvedValue(team);
      mockCompetitionRepo.addTeam.mockResolvedValue(updatedCompetition);

      const result = await registrationService.registerTeam('comp123', 'team123', 'coach123');

      expect(result).toEqual(updatedCompetition);
      expect(mockCompetitionRepo.addTeam).toHaveBeenCalledWith('comp123', 'team123', 'coach123');
      expect(mockCacheService.delete).toHaveBeenCalledWith('competition:comp123');
      expect(mockCacheService.deletePattern).toHaveBeenCalledWith('competitions:*');
    });

    it('should throw NotFoundError for non-existent competition', async () => {
      mockCompetitionRepo.findById.mockResolvedValue(null);

      await expect(
        registrationService.registerTeam('nonexistent', 'team123', 'coach123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for non-existent team', async () => {
      mockCompetitionRepo.findById.mockResolvedValue({
        _id: 'comp123',
        status: 'upcoming',
        isDeleted: false,
        registeredTeams: []
      });
      mockTeamRepo.findById.mockResolvedValue(null);

      await expect(
        registrationService.registerTeam('comp123', 'nonexistent', 'coach123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError if coach does not own team', async () => {
      const competition = {
        _id: 'comp123',
        status: 'upcoming',
        isDeleted: false,
        registeredTeams: []
      };

      const team = {
        _id: 'team123',
        coach: 'othercoach',
        isActive: true
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);
      mockTeamRepo.findById.mockResolvedValue(team);

      await expect(
        registrationService.registerTeam('comp123', 'team123', 'coach123')
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError if competition is not upcoming', async () => {
      const competition = {
        _id: 'comp123',
        status: 'ongoing',
        isDeleted: false,
        registeredTeams: []
      };

      const team = {
        _id: 'team123',
        coach: 'coach123',
        isActive: true
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);
      mockTeamRepo.findById.mockResolvedValue(team);

      await expect(
        registrationService.registerTeam('comp123', 'team123', 'coach123')
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw ConflictError if team already registered', async () => {
      const competition = {
        _id: 'comp123',
        status: 'upcoming',
        isDeleted: false,
        registeredTeams: [{
          team: 'team123',
          coach: 'coach123'
        }]
      };

      const team = {
        _id: 'team123',
        coach: 'coach123',
        isActive: true
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);
      mockTeamRepo.findById.mockResolvedValue(team);

      await expect(
        registrationService.registerTeam('comp123', 'team123', 'coach123')
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('unregisterTeam', () => {
    it('should successfully unregister a team', async () => {
      const competition = {
        _id: 'comp123',
        status: 'upcoming',
        isDeleted: false,
        registeredTeams: [{
          team: 'team123',
          coach: 'coach123',
          paymentStatus: 'pending'
        }]
      };

      const updatedCompetition = {
        ...competition,
        registeredTeams: []
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);
      mockCompetitionRepo.removeTeam.mockResolvedValue(updatedCompetition);

      const result = await registrationService.unregisterTeam('comp123', 'team123', 'coach123');

      expect(result).toEqual(updatedCompetition);
      expect(mockCompetitionRepo.removeTeam).toHaveBeenCalledWith('comp123', 'team123');
    });

    it('should throw NotFoundError for non-existent registration', async () => {
      const competition = {
        _id: 'comp123',
        status: 'upcoming',
        isDeleted: false,
        registeredTeams: []
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      await expect(
        registrationService.unregisterTeam('comp123', 'team123', 'coach123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError if coach does not own team', async () => {
      const competition = {
        _id: 'comp123',
        status: 'upcoming',
        isDeleted: false,
        registeredTeams: [{
          team: 'team123',
          coach: 'othercoach',
          paymentStatus: 'pending'
        }]
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      await expect(
        registrationService.unregisterTeam('comp123', 'team123', 'coach123')
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError if competition has started', async () => {
      const competition = {
        _id: 'comp123',
        status: 'ongoing',
        isDeleted: false,
        registeredTeams: [{
          team: 'team123',
          coach: 'coach123',
          paymentStatus: 'pending'
        }]
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      await expect(
        registrationService.unregisterTeam('comp123', 'team123', 'coach123')
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError if payment is completed', async () => {
      const competition = {
        _id: 'comp123',
        status: 'upcoming',
        isDeleted: false,
        registeredTeams: [{
          team: 'team123',
          coach: 'coach123',
          paymentStatus: 'completed'
        }]
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      await expect(
        registrationService.unregisterTeam('comp123', 'team123', 'coach123')
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('addPlayerToRegistration', () => {
    it('should successfully add player to registration', async () => {
      const competition = {
        _id: 'comp123',
        isDeleted: false,
        ageGroups: [
          { ageGroup: 'Under14', gender: 'Male' }
        ],
        registeredTeams: [{
          team: 'team123',
          coach: 'coach123',
          players: [],
          isSubmitted: false
        }],
        save: jest.fn().mockResolvedValue(true)
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      const result = await registrationService.addPlayerToRegistration(
        'comp123',
        'team123',
        'player123',
        'Under14',
        'Male'
      );

      expect(result).toEqual(competition);
      expect(competition.registeredTeams[0].players).toHaveLength(1);
      expect(competition.registeredTeams[0].players[0]).toEqual({
        player: 'player123',
        ageGroup: 'Under14',
        gender: 'Male'
      });
      expect(competition.save).toHaveBeenCalled();
    });

    it('should throw NotFoundError for non-existent registration', async () => {
      const competition = {
        _id: 'comp123',
        isDeleted: false,
        registeredTeams: []
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      await expect(
        registrationService.addPlayerToRegistration(
          'comp123',
          'team123',
          'player123',
          'Under14',
          'Male'
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for invalid age group/gender', async () => {
      const competition = {
        _id: 'comp123',
        isDeleted: false,
        ageGroups: [
          { ageGroup: 'Under14', gender: 'Male' }
        ],
        registeredTeams: [{
          team: 'team123',
          players: [],
          isSubmitted: false
        }]
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      await expect(
        registrationService.addPlayerToRegistration(
          'comp123',
          'team123',
          'player123',
          'Under16',
          'Female'
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should throw BusinessRuleError if registration is submitted', async () => {
      const competition = {
        _id: 'comp123',
        isDeleted: false,
        ageGroups: [],
        registeredTeams: [{
          team: 'team123',
          players: [],
          isSubmitted: true
        }]
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      await expect(
        registrationService.addPlayerToRegistration(
          'comp123',
          'team123',
          'player123',
          'Under14',
          'Male'
        )
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw ConflictError if player already in registration', async () => {
      const competition = {
        _id: 'comp123',
        isDeleted: false,
        ageGroups: [],
        registeredTeams: [{
          team: 'team123',
          players: [{
            player: 'player123',
            ageGroup: 'Under14',
            gender: 'Male'
          }],
          isSubmitted: false
        }]
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      await expect(
        registrationService.addPlayerToRegistration(
          'comp123',
          'team123',
          'player123',
          'Under14',
          'Male'
        )
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('removePlayerFromRegistration', () => {
    it('should successfully remove player from registration', async () => {
      const competition = {
        _id: 'comp123',
        isDeleted: false,
        registeredTeams: [{
          team: 'team123',
          players: [{
            player: 'player123',
            ageGroup: 'Under14',
            gender: 'Male'
          }],
          isSubmitted: false
        }],
        save: jest.fn().mockResolvedValue(true)
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      const result = await registrationService.removePlayerFromRegistration(
        'comp123',
        'team123',
        'player123'
      );

      expect(result).toEqual(competition);
      expect(competition.registeredTeams[0].players).toHaveLength(0);
      expect(competition.save).toHaveBeenCalled();
    });

    it('should throw BusinessRuleError if registration is submitted', async () => {
      const competition = {
        _id: 'comp123',
        isDeleted: false,
        registeredTeams: [{
          team: 'team123',
          players: [],
          isSubmitted: true
        }]
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      await expect(
        registrationService.removePlayerFromRegistration(
          'comp123',
          'team123',
          'player123'
        )
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('updateRegistrationStatus', () => {
    it('should successfully update registration status', async () => {
      const competition = {
        _id: 'comp123',
        isDeleted: false,
        registeredTeams: [{
          team: 'team123',
          players: [{ player: 'player123' }],
          isSubmitted: false,
          paymentStatus: 'pending'
        }]
      };

      const updates = {
        isSubmitted: true,
        paymentStatus: 'completed'
      };

      const updatedCompetition = {
        ...competition,
        registeredTeams: [{
          ...competition.registeredTeams[0],
          ...updates
        }]
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);
      mockCompetitionRepo.updateRegistration.mockResolvedValue(updatedCompetition);

      const result = await registrationService.updateRegistrationStatus(
        'comp123',
        'team123',
        updates
      );

      expect(result).toEqual(updatedCompetition);
      expect(mockCompetitionRepo.updateRegistration).toHaveBeenCalledWith(
        'comp123',
        'team123',
        expect.objectContaining({
          isSubmitted: true,
          paymentStatus: 'completed',
          submittedAt: expect.any(Date),
          paymentVerifiedAt: expect.any(Date)
        })
      );
    });

    it('should throw BusinessRuleError when submitting without players', async () => {
      const competition = {
        _id: 'comp123',
        isDeleted: false,
        registeredTeams: [{
          team: 'team123',
          players: [],
          isSubmitted: false
        }]
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      await expect(
        registrationService.updateRegistrationStatus('comp123', 'team123', {
          isSubmitted: true
        })
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw ValidationError for invalid payment status', async () => {
      const competition = {
        _id: 'comp123',
        isDeleted: false,
        registeredTeams: [{
          team: 'team123',
          players: [{ player: 'player123' }],
          isSubmitted: false
        }]
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      await expect(
        registrationService.updateRegistrationStatus('comp123', 'team123', {
          paymentStatus: 'invalid'
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getTeamRegistration', () => {
    it('should return team registration', async () => {
      const registration = {
        team: { _id: 'team123', name: 'Test Team' },
        coach: { _id: 'coach123', name: 'Test Coach' },
        players: []
      };

      const competition = {
        _id: 'comp123',
        isDeleted: false,
        registeredTeams: [registration]
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      const result = await registrationService.getTeamRegistration('comp123', 'team123');

      expect(result).toEqual(registration);
    });

    it('should throw NotFoundError for non-existent registration', async () => {
      const competition = {
        _id: 'comp123',
        isDeleted: false,
        registeredTeams: []
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      await expect(
        registrationService.getTeamRegistration('comp123', 'team123')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getCompetitionRegistrations', () => {
    it('should return all registrations', async () => {
      const registrations = [
        { team: { _id: 'team1' }, isSubmitted: true, paymentStatus: 'completed' },
        { team: { _id: 'team2' }, isSubmitted: false, paymentStatus: 'pending' }
      ];

      const competition = {
        _id: 'comp123',
        isDeleted: false,
        registeredTeams: registrations
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      const result = await registrationService.getCompetitionRegistrations('comp123');

      expect(result).toEqual(registrations);
    });

    it('should filter by isSubmitted', async () => {
      const registrations = [
        { team: { _id: 'team1' }, isSubmitted: true, paymentStatus: 'completed' },
        { team: { _id: 'team2' }, isSubmitted: false, paymentStatus: 'pending' }
      ];

      const competition = {
        _id: 'comp123',
        isDeleted: false,
        registeredTeams: registrations
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      const result = await registrationService.getCompetitionRegistrations('comp123', {
        isSubmitted: true
      });

      expect(result).toHaveLength(1);
      expect(result[0].isSubmitted).toBe(true);
    });

    it('should filter by paymentStatus', async () => {
      const registrations = [
        { team: { _id: 'team1' }, isSubmitted: true, paymentStatus: 'completed' },
        { team: { _id: 'team2' }, isSubmitted: false, paymentStatus: 'pending' }
      ];

      const competition = {
        _id: 'comp123',
        isDeleted: false,
        registeredTeams: registrations
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      const result = await registrationService.getCompetitionRegistrations('comp123', {
        paymentStatus: 'completed'
      });

      expect(result).toHaveLength(1);
      expect(result[0].paymentStatus).toBe('completed');
    });
  });

  describe('validateAgeGroupAndGender', () => {
    it('should not throw for valid age group and gender', () => {
      const competition = {
        ageGroups: [
          { ageGroup: 'Under14', gender: 'Male' },
          { ageGroup: 'Under16', gender: 'Female' }
        ]
      };

      expect(() => {
        registrationService.validateAgeGroupAndGender(competition, 'Under14', 'Male');
      }).not.toThrow();
    });

    it('should throw ValidationError for invalid combination', () => {
      const competition = {
        ageGroups: [
          { ageGroup: 'Under14', gender: 'Male' }
        ]
      };

      expect(() => {
        registrationService.validateAgeGroupAndGender(competition, 'Under16', 'Female');
      }).toThrow(ValidationError);
    });

    it('should allow any combination if no age groups defined', () => {
      const competition = {
        ageGroups: []
      };

      expect(() => {
        registrationService.validateAgeGroupAndGender(competition, 'Under16', 'Female');
      }).not.toThrow();
    });
  });
});
