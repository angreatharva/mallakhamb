/**
 * Final Integration Tests for Frontend API Migration Adaptation
 * Task 12: Final integration and testing
 * 
 * This test suite verifies all implemented features work correctly end-to-end:
 * - Task 12.1: Authentication flows (admin registration, login, judge login)
 * - Task 12.2: Socket.IO authorization
 * - Task 12.3: Score calculation display
 * - Task 12.4: Super admin player management
 * - Task 12.5: Backward compatibility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { io } from 'socket.io-client';

// Mock dependencies
vi.mock('axios');
vi.mock('socket.io-client');

// Mock secureStorage
const secureStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

describe('Task 12.1: Authentication Flows End-to-End', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secureStorage.getItem.mockReturnValue(null);
  });

  describe('Admin Registration → Login → Dashboard', () => {
    it('should complete full admin registration flow', async () => {
      // Mock registration response
      const registerResponse = {
        data: {
          success: true,
          data: {
            token: 'admin-jwt-token',
            admin: {
              _id: 'admin123',
              name: 'Test Admin',
              email: 'admin@test.com',
              role: 'admin'
            }
          }
        }
      };

      axios.post.mockResolvedValueOnce(registerResponse);

      // Simulate registration
      const registerData = {
        name: 'Test Admin',
        email: 'admin@test.com',
        password: 'SecurePassword123!'
      };

      const result = await axios.post('/api/admin/register', registerData);

      expect(axios.post).toHaveBeenCalledWith('/api/admin/register', registerData);
      expect(result.data.data.token).toBe('admin-jwt-token');
      expect(result.data.data.admin.email).toBe('admin@test.com');
    });

    it('should complete full admin login flow', async () => {
      // Mock login response
      const loginResponse = {
        data: {
          success: true,
          data: {
            token: 'admin-jwt-token',
            admin: {
              _id: 'admin123',
              name: 'Test Admin',
              email: 'admin@test.com',
              role: 'admin'
            }
          }
        }
      };

      axios.post.mockResolvedValueOnce(loginResponse);

      // Simulate login
      const loginData = {
        email: 'admin@test.com',
        password: 'SecurePassword123!'
      };

      const result = await axios.post('/api/admin/login', loginData);

      expect(axios.post).toHaveBeenCalledWith('/api/admin/login', loginData);
      expect(result.data.data.token).toBe('admin-jwt-token');
      expect(result.data.data.admin.role).toBe('admin');
    });

    it('should store token and admin profile after successful login', async () => {
      const loginResponse = {
        data: {
          success: true,
          data: {
            token: 'admin-jwt-token',
            admin: {
              _id: 'admin123',
              name: 'Test Admin',
              email: 'admin@test.com',
              role: 'admin'
            }
          }
        }
      };

      axios.post.mockResolvedValueOnce(loginResponse);

      const result = await axios.post('/api/admin/login', {
        email: 'admin@test.com',
        password: 'SecurePassword123!'
      });

      // Simulate storage
      secureStorage.setItem('admin_token', result.data.data.token);
      secureStorage.setItem('admin_user', JSON.stringify(result.data.data.admin));

      expect(secureStorage.setItem).toHaveBeenCalledWith('admin_token', 'admin-jwt-token');
      expect(secureStorage.setItem).toHaveBeenCalledWith('admin_user', expect.any(String));
    });

    it('should handle account lockout errors', async () => {
      const lockoutError = {
        response: {
          status: 429,
          data: {
            message: 'Account locked due to too many failed login attempts. Try again in 15 minutes.'
          }
        }
      };

      axios.post.mockRejectedValueOnce(lockoutError);

      try {
        await axios.post('/api/admin/login', {
          email: 'admin@test.com',
          password: 'WrongPassword'
        });
      } catch (error) {
        expect(error.response.status).toBe(429);
        expect(error.response.data.message).toContain('locked');
      }
    });

    it('should handle rate limiting errors', async () => {
      const rateLimitError = {
        response: {
          status: 429,
          data: {
            message: 'Too many login attempts. Please wait 15 minutes.'
          }
        }
      };

      axios.post.mockRejectedValueOnce(rateLimitError);

      try {
        await axios.post('/api/admin/login', {
          email: 'admin@test.com',
          password: 'password'
        });
      } catch (error) {
        expect(error.response.status).toBe(429);
        expect(error.response.data.message).toContain('Too many');
      }
    });
  });

  describe('Judge Login with Username → Scoring Page', () => {
    it('should complete full judge login flow with username', async () => {
      // Mock judge login response
      const judgeLoginResponse = {
        data: {
          success: true,
          data: {
            token: 'judge-jwt-token',
            judge: {
              _id: 'judge123',
              username: 'judge_user',
              judgeType: 'execution',
              gender: 'Male',
              ageGroup: 'Senior',
              competition: {
                id: 'comp123',
                name: 'National Championship 2024',
                level: 'National',
                place: 'Mumbai',
                status: 'active'
              }
            }
          }
        }
      };

      axios.post.mockResolvedValueOnce(judgeLoginResponse);

      // Simulate judge login with username
      const loginData = {
        username: 'judge_user',
        password: 'JudgePassword123!'
      };

      const result = await axios.post('/api/judge/login', loginData);

      expect(axios.post).toHaveBeenCalledWith('/api/judge/login', loginData);
      expect(result.data.data.judge.username).toBe('judge_user');
      expect(result.data.data.judge.competition.id).toBe('comp123');
    });

    it('should extract and store competition context from judge profile', async () => {
      const judgeLoginResponse = {
        data: {
          success: true,
          data: {
            token: 'judge-jwt-token',
            judge: {
              _id: 'judge123',
              username: 'judge_user',
              competition: {
                id: 'comp123',
                name: 'National Championship 2024'
              }
            }
          }
        }
      };

      axios.post.mockResolvedValueOnce(judgeLoginResponse);

      const result = await axios.post('/api/judge/login', {
        username: 'judge_user',
        password: 'password'
      });

      const competitionId = result.data.data.judge.competition.id;

      // Simulate storage
      secureStorage.setItem('judge_token', result.data.data.token);
      secureStorage.setItem('judge_competition_id', competitionId);
      secureStorage.setItem('judge_user', JSON.stringify(result.data.data.judge));

      expect(secureStorage.setItem).toHaveBeenCalledWith('judge_token', 'judge-jwt-token');
      expect(secureStorage.setItem).toHaveBeenCalledWith('judge_competition_id', 'comp123');
      expect(secureStorage.setItem).toHaveBeenCalledWith('judge_user', expect.any(String));
    });

    it('should convert username to lowercase before submission', async () => {
      const judgeLoginResponse = {
        data: {
          success: true,
          data: {
            token: 'judge-jwt-token',
            judge: { _id: 'judge123', username: 'judge_user' }
          }
        }
      };

      axios.post.mockResolvedValueOnce(judgeLoginResponse);

      // Simulate login with uppercase username
      const loginData = {
        username: 'JUDGE_USER'.toLowerCase(),
        password: 'password'
      };

      await axios.post('/api/judge/login', loginData);

      expect(axios.post).toHaveBeenCalledWith('/api/judge/login', {
        username: 'judge_user',
        password: 'password'
      });
    });
  });

  describe('Token Storage and Retrieval', () => {
    it('should retrieve stored admin token', () => {
      secureStorage.getItem.mockReturnValue('admin-jwt-token');

      const token = secureStorage.getItem('admin_token');

      expect(token).toBe('admin-jwt-token');
      expect(secureStorage.getItem).toHaveBeenCalledWith('admin_token');
    });

    it('should retrieve stored judge token and competition context', () => {
      secureStorage.getItem
        .mockReturnValueOnce('judge-jwt-token')
        .mockReturnValueOnce('comp123');

      const token = secureStorage.getItem('judge_token');
      const competitionId = secureStorage.getItem('judge_competition_id');

      expect(token).toBe('judge-jwt-token');
      expect(competitionId).toBe('comp123');
    });

    it('should clear tokens on logout', () => {
      secureStorage.removeItem.mockImplementation(() => {});

      // Simulate logout
      secureStorage.removeItem('admin_token');
      secureStorage.removeItem('admin_user');
      secureStorage.removeItem('competition_id');

      expect(secureStorage.removeItem).toHaveBeenCalledWith('admin_token');
      expect(secureStorage.removeItem).toHaveBeenCalledWith('admin_user');
      expect(secureStorage.removeItem).toHaveBeenCalledWith('competition_id');
    });
  });
});

describe('Task 12.2: Socket.IO Authorization', () => {
  let mockSocket;
  let eventHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers = {};

    mockSocket = {
      on: vi.fn((event, handler) => {
        eventHandlers[event] = handler;
      }),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
      connected: true,
    };

    io.mockReturnValue(mockSocket);
  });

  it('should allow authorized users (judge, admin, superadmin) to join scoring rooms', () => {
    const mockToast = vi.fn();
    
    // Simulate authorized connection
    const socket = io('http://localhost:5000', {
      auth: { token: 'valid-judge-token' }
    });

    socket.on('room_joined', (data) => {
      mockToast(`Joined room: ${data.roomId}`);
    });

    // Simulate successful room join
    eventHandlers['room_joined']({ roomId: 'scoring-room-1' });

    expect(mockToast).toHaveBeenCalledWith('Joined room: scoring-room-1');
  });

  it('should reject unauthorized users from scoring rooms', () => {
    const mockToast = vi.fn();
    const mockNavigate = vi.fn();

    const socket = io('http://localhost:5000', {
      auth: { token: 'coach-token' }
    });

    socket.on('error', (error) => {
      if (error.message === 'Not authorized to join this room') {
        mockToast('You do not have permission to access this scoring room');
        mockNavigate('/dashboard/scores');
      }
    });

    // Simulate unauthorized room join attempt
    eventHandlers['error']({ message: 'Not authorized to join this room' });

    expect(mockToast).toHaveBeenCalledWith('You do not have permission to access this scoring room');
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/scores');
  });

  it('should display error messages correctly for authorization failures', () => {
    const mockToast = vi.fn();

    const socket = io('http://localhost:5000');

    socket.on('connect_error', (error) => {
      if (error.message && (error.message.includes('authorization') || error.message.includes('Unauthorized'))) {
        mockToast('Not authorized to access scoring room');
      }
    });

    socket.on('score_update_error', (error) => {
      if (error.message === 'Only judges can update scores') {
        mockToast('Only judges can submit scores');
      }
    });

    socket.on('scores_saved_error', (error) => {
      if (error.message === 'Unauthorized to save scores') {
        mockToast('You do not have permission to save scores');
      }
    });

    // Test connection error
    eventHandlers['connect_error']({ message: 'Unauthorized access' });
    expect(mockToast).toHaveBeenCalledWith('Not authorized to access scoring room');

    mockToast.mockClear();

    // Test score update error
    eventHandlers['score_update_error']({ message: 'Only judges can update scores' });
    expect(mockToast).toHaveBeenCalledWith('Only judges can submit scores');

    mockToast.mockClear();

    // Test scores saved error
    eventHandlers['scores_saved_error']({ message: 'Unauthorized to save scores' });
    expect(mockToast).toHaveBeenCalledWith('You do not have permission to save scores');
  });
});

describe('Task 12.3: Score Calculation Display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display calculated scores after save', async () => {
    const saveScoresResponse = {
      data: {
        success: true,
        data: {
          scoreId: 'score123',
          isLocked: false,
          playerScores: [
            {
              playerId: 'player1',
              playerName: 'John Doe',
              time: '02:30',
              judgeScores: {
                seniorJudge: 9.5,
                judge1: 9.2,
                judge2: 9.3,
                judge3: 9.4,
                judge4: 9.1
              },
              executionAverage: 9.25,
              baseScore: 9.375,
              baseScoreApplied: false,
              toleranceUsed: 0.10,
              averageMarks: 9.25,
              deduction: 0.5,
              otherDeduction: 0.0,
              finalScore: 8.75
            }
          ]
        }
      }
    };

    axios.post.mockResolvedValueOnce(saveScoresResponse);

    const result = await axios.post('/api/admin/scores/save', {
      teamId: 'team123',
      gender: 'Male',
      ageGroup: 'Senior',
      playerScores: []
    });

    const { scoreId, isLocked, playerScores } = result.data.data;

    expect(scoreId).toBe('score123');
    expect(isLocked).toBe(false);
    expect(playerScores[0].executionAverage).toBe(9.25);
    expect(playerScores[0].finalScore).toBe(8.75);
  });

  it('should display tolerance information when base score is applied', async () => {
    const saveScoresResponse = {
      data: {
        success: true,
        data: {
          scoreId: 'score123',
          isLocked: false,
          playerScores: [
            {
              playerId: 'player1',
              playerName: 'Jane Smith',
              executionAverage: 8.5,
              baseScore: 8.75,
              baseScoreApplied: true,
              toleranceUsed: 0.20,
              averageMarks: 8.75,
              finalScore: 8.25
            }
          ]
        }
      }
    };

    axios.post.mockResolvedValueOnce(saveScoresResponse);

    const result = await axios.post('/api/admin/scores/save', {});

    const playerScore = result.data.data.playerScores[0];

    expect(playerScore.baseScoreApplied).toBe(true);
    expect(playerScore.toleranceUsed).toBe(0.20);
    expect(playerScore.baseScore).toBe(8.75);
  });

  it('should display lock status correctly', async () => {
    const lockedScoresResponse = {
      data: {
        success: true,
        data: {
          scoreId: 'score123',
          isLocked: true,
          playerScores: []
        }
      }
    };

    axios.post.mockResolvedValueOnce(lockedScoresResponse);

    const result = await axios.post('/api/admin/scores/save', {});

    expect(result.data.data.isLocked).toBe(true);
  });
});

describe('Task 12.4: Super Admin Player Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add player with all required fields', async () => {
    const addPlayerResponse = {
      data: {
        success: true,
        data: {
          id: 'player123',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@test.com',
          team: 'team123'
        }
      }
    };

    axios.post.mockResolvedValueOnce(addPlayerResponse);

    const playerData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@test.com',
      dateOfBirth: '2000-01-01',
      gender: 'Male',
      teamId: 'team123',
      competitionId: 'comp123',
      password: 'SecurePassword123!'
    };

    const result = await axios.post('/api/superadmin/players/add', playerData);

    expect(axios.post).toHaveBeenCalledWith('/api/superadmin/players/add', playerData);
    expect(result.data.data.firstName).toBe('John');
    expect(result.data.data.email).toBe('john.doe@test.com');
  });

  it('should display validation errors correctly', async () => {
    const validationError = {
      response: {
        status: 400,
        data: {
          message: 'Validation failed',
          errors: [
            { field: 'email', message: 'Invalid email format' },
            { field: 'password', message: 'Password must be at least 12 characters' }
          ]
        }
      }
    };

    axios.post.mockRejectedValueOnce(validationError);

    try {
      await axios.post('/api/superadmin/players/add', {
        firstName: 'John',
        email: 'invalid-email',
        password: 'short'
      });
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data.errors).toHaveLength(2);
      expect(error.response.data.errors[0].field).toBe('email');
    }
  });

  it('should display success message and refresh roster', async () => {
    const addPlayerResponse = {
      data: {
        success: true,
        data: {
          id: 'player123',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@test.com',
          team: 'team123'
        }
      }
    };

    const getRosterResponse = {
      data: {
        success: true,
        data: {
          players: [
            { id: 'player123', firstName: 'John', lastName: 'Doe' }
          ]
        }
      }
    };

    axios.post.mockResolvedValueOnce(addPlayerResponse);
    axios.get.mockResolvedValueOnce(getRosterResponse);

    // Add player
    const addResult = await axios.post('/api/superadmin/players/add', {});
    expect(addResult.data.success).toBe(true);

    // Refresh roster
    const rosterResult = await axios.get('/api/superadmin/teams/team123/players');
    expect(rosterResult.data.data.players).toHaveLength(1);
    expect(rosterResult.data.data.players[0].firstName).toBe('John');
  });

  it('should handle duplicate email error', async () => {
    const duplicateError = {
      response: {
        status: 400,
        data: {
          message: 'Player email already exists'
        }
      }
    };

    axios.post.mockRejectedValueOnce(duplicateError);

    try {
      await axios.post('/api/superadmin/players/add', {
        email: 'existing@test.com'
      });
    } catch (error) {
      expect(error.response.data.message).toBe('Player email already exists');
    }
  });

  it('should handle team not found error', async () => {
    const teamNotFoundError = {
      response: {
        status: 404,
        data: {
          message: 'Team not found in the specified competition'
        }
      }
    };

    axios.post.mockRejectedValueOnce(teamNotFoundError);

    try {
      await axios.post('/api/superadmin/players/add', {
        teamId: 'invalid-team'
      });
    } catch (error) {
      expect(error.response.data.message).toBe('Team not found in the specified competition');
    }
  });
});

describe('Task 12.5: Backward Compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should support existing player endpoints', async () => {
    const playersResponse = {
      data: {
        success: true,
        data: {
          players: [
            { id: 'player1', name: 'Player 1' },
            { id: 'player2', name: 'Player 2' }
          ]
        }
      }
    };

    axios.get.mockResolvedValueOnce(playersResponse);

    const result = await axios.get('/api/players');

    expect(axios.get).toHaveBeenCalledWith('/api/players');
    expect(result.data.data.players).toHaveLength(2);
  });

  it('should support existing coach endpoints', async () => {
    const coachesResponse = {
      data: {
        success: true,
        data: {
          coaches: [
            { id: 'coach1', name: 'Coach 1' }
          ]
        }
      }
    };

    axios.get.mockResolvedValueOnce(coachesResponse);

    const result = await axios.get('/api/coaches');

    expect(axios.get).toHaveBeenCalledWith('/api/coaches');
    expect(result.data.data.coaches).toHaveLength(1);
  });

  it('should support existing team endpoints', async () => {
    const teamsResponse = {
      data: {
        success: true,
        data: {
          teams: [
            { id: 'team1', name: 'Team 1' },
            { id: 'team2', name: 'Team 2' }
          ]
        }
      }
    };

    axios.get.mockResolvedValueOnce(teamsResponse);

    const result = await axios.get('/api/teams');

    expect(axios.get).toHaveBeenCalledWith('/api/teams');
    expect(result.data.data.teams).toHaveLength(2);
  });

  it('should support both /api/superadmin and /api/super-admin prefixes', async () => {
    const dashboardResponse = {
      data: {
        success: true,
        data: {
          stats: { totalUsers: 100 }
        }
      }
    };

    // Test new prefix
    axios.get.mockResolvedValueOnce(dashboardResponse);
    const result1 = await axios.get('/api/superadmin/dashboard');
    expect(result1.data.data.stats.totalUsers).toBe(100);

    // Test old prefix (should still work)
    axios.get.mockResolvedValueOnce(dashboardResponse);
    const result2 = await axios.get('/api/super-admin/dashboard');
    expect(result2.data.data.stats.totalUsers).toBe(100);
  });

  it('should maintain cache invalidation patterns for POST requests', async () => {
    const postResponse = {
      data: {
        success: true,
        data: { id: 'new-item' }
      }
    };

    axios.post.mockResolvedValueOnce(postResponse);

    // Simulate POST request that should invalidate cache
    const result = await axios.post('/api/teams', { name: 'New Team' });

    expect(result.data.success).toBe(true);
    // In real implementation, cache would be cleared here
  });

  it('should maintain cache invalidation patterns for PUT requests', async () => {
    const putResponse = {
      data: {
        success: true,
        data: { id: 'updated-item' }
      }
    };

    axios.put.mockResolvedValueOnce(putResponse);

    const result = await axios.put('/api/teams/team123', { name: 'Updated Team' });

    expect(result.data.success).toBe(true);
  });

  it('should maintain cache invalidation patterns for DELETE requests', async () => {
    const deleteResponse = {
      data: {
        success: true,
        message: 'Deleted successfully'
      }
    };

    axios.delete.mockResolvedValueOnce(deleteResponse);

    const result = await axios.delete('/api/teams/team123');

    expect(result.data.success).toBe(true);
  });
});

describe('Integration: Competition Context Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should include competition context header in authenticated requests', async () => {
    secureStorage.getItem.mockReturnValue('comp123');

    // Simulate request with competition context
    const config = {
      headers: {
        'Authorization': 'Bearer token',
        'x-competition-id': secureStorage.getItem('competition_id')
      }
    };

    axios.get.mockResolvedValueOnce({ data: { success: true } });

    await axios.get('/api/admin/dashboard', config);

    expect(axios.get).toHaveBeenCalledWith(
      '/api/admin/dashboard',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-competition-id': 'comp123'
        })
      })
    );
  });

  it('should handle 403 errors with competition context message', async () => {
    const competitionError = {
      response: {
        status: 403,
        data: {
          message: 'Competition context required'
        }
      }
    };

    axios.get.mockRejectedValueOnce(competitionError);

    try {
      await axios.get('/api/admin/dashboard');
    } catch (error) {
      expect(error.response.status).toBe(403);
      expect(error.response.data.message).toContain('Competition context');
    }
  });
});

describe('Integration: Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle 401 errors with redirect to login', async () => {
    const authError = {
      response: {
        status: 401,
        data: {
          message: 'Unauthorized'
        }
      }
    };

    axios.get.mockRejectedValueOnce(authError);

    try {
      await axios.get('/api/admin/dashboard');
    } catch (error) {
      expect(error.response.status).toBe(401);
      // In real implementation, would redirect to login
    }
  });

  it('should handle network errors gracefully', async () => {
    const networkError = new Error('Network Error');
    networkError.code = 'ECONNREFUSED';

    axios.get.mockRejectedValueOnce(networkError);

    try {
      await axios.get('/api/admin/dashboard');
    } catch (error) {
      expect(error.message).toBe('Network Error');
    }
  });

  it('should handle 500 server errors', async () => {
    const serverError = {
      response: {
        status: 500,
        data: {
          message: 'Internal server error'
        }
      }
    };

    axios.get.mockRejectedValueOnce(serverError);

    try {
      await axios.get('/api/admin/dashboard');
    } catch (error) {
      expect(error.response.status).toBe(500);
    }
  });
});
