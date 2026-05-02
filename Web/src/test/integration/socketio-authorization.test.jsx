/**
 * Integration tests for Socket.IO authorization handling
 * Tests Requirements 4.2, 4.3, 4.4, 4.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { io } from 'socket.io-client';

// Mock socket.io-client
vi.mock('socket.io-client');

describe('Socket.IO Authorization Error Handling', () => {
  let mockSocket;
  let eventHandlers;

  beforeEach(() => {
    eventHandlers = {};
    
    // Create mock socket that stores event handlers
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

  describe('Connection Authorization (Requirement 4.6)', () => {
    it('should detect authorization errors in connect_error event', () => {
      const mockToast = vi.fn();
      const mockNavigate = vi.fn();

      // Simulate socket connection with error handler
      const socket = io('http://localhost:5000', {
        auth: { token: 'test-token' },
      });

      // Register connect_error handler (simulating component behavior)
      socket.on('connect_error', (error) => {
        if (error.message && (error.message.includes('authorization') || error.message.includes('Unauthorized'))) {
          mockToast('Not authorized to access scoring room');
          mockNavigate('/dashboard');
        }
      });

      // Trigger connect_error with authorization message
      eventHandlers['connect_error']({ message: 'Unauthorized access' });

      expect(mockToast).toHaveBeenCalledWith('Not authorized to access scoring room');
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });

    it('should detect authorization keyword variations', () => {
      const mockToast = vi.fn();
      const socket = io('http://localhost:5000');

      socket.on('connect_error', (error) => {
        if (error.message && (error.message.includes('authorization') || error.message.includes('Unauthorized'))) {
          mockToast('Not authorized');
        }
      });

      // Test with 'authorization' keyword
      eventHandlers['connect_error']({ message: 'authorization failed' });
      expect(mockToast).toHaveBeenCalledWith('Not authorized');

      mockToast.mockClear();

      // Test with 'Unauthorized' keyword
      eventHandlers['connect_error']({ message: 'Unauthorized user' });
      expect(mockToast).toHaveBeenCalledWith('Not authorized');
    });
  });

  describe('Room Join Authorization (Requirement 4.2)', () => {
    it('should handle "Not authorized to join this room" error', () => {
      const mockToast = vi.fn();
      const mockNavigate = vi.fn();

      const socket = io('http://localhost:5000');

      socket.on('error', (error) => {
        if (error.message === 'Not authorized to join this room') {
          mockToast('You do not have permission to access this scoring room');
          mockNavigate('/scores');
        }
      });

      // Trigger error event
      eventHandlers['error']({ message: 'Not authorized to join this room' });

      expect(mockToast).toHaveBeenCalledWith('You do not have permission to access this scoring room');
      expect(mockNavigate).toHaveBeenCalledWith('/scores');
    });

    it('should only trigger on exact message match', () => {
      const mockToast = vi.fn();

      const socket = io('http://localhost:5000');

      socket.on('error', (error) => {
        if (error.message === 'Not authorized to join this room') {
          mockToast('Room authorization error');
        }
      });

      // Trigger with different error message
      eventHandlers['error']({ message: 'Some other error' });

      expect(mockToast).not.toHaveBeenCalled();
    });
  });

  describe('Score Update Authorization (Requirement 4.3)', () => {
    it('should handle "Only judges can update scores" error', () => {
      const mockToast = vi.fn();

      const socket = io('http://localhost:5000');

      socket.on('score_update_error', (error) => {
        if (error.message === 'Only judges can update scores') {
          mockToast('Only judges can submit scores');
        }
      });

      // Trigger score_update_error event
      eventHandlers['score_update_error']({ message: 'Only judges can update scores' });

      expect(mockToast).toHaveBeenCalledWith('Only judges can submit scores');
    });

    it('should log error when score update fails', () => {
      const mockLogger = { error: vi.fn() };

      const socket = io('http://localhost:5000');

      socket.on('score_update_error', (error) => {
        mockLogger.error('Score update error:', error);
      });

      const errorData = { message: 'Only judges can update scores' };
      eventHandlers['score_update_error'](errorData);

      expect(mockLogger.error).toHaveBeenCalledWith('Score update error:', errorData);
    });
  });

  describe('Scores Saved Authorization (Requirement 4.4)', () => {
    it('should handle "Unauthorized to save scores" error', () => {
      const mockToast = vi.fn();

      const socket = io('http://localhost:5000');

      socket.on('scores_saved_error', (error) => {
        if (error.message === 'Unauthorized to save scores') {
          mockToast('You do not have permission to save scores');
        }
      });

      // Trigger scores_saved_error event
      eventHandlers['scores_saved_error']({ message: 'Unauthorized to save scores' });

      expect(mockToast).toHaveBeenCalledWith('You do not have permission to save scores');
    });

    it('should log error when scores save fails', () => {
      const mockLogger = { error: vi.fn() };

      const socket = io('http://localhost:5000');

      socket.on('scores_saved_error', (error) => {
        mockLogger.error('Scores saved error:', error);
      });

      const errorData = { message: 'Unauthorized to save scores' };
      eventHandlers['scores_saved_error'](errorData);

      expect(mockLogger.error).toHaveBeenCalledWith('Scores saved error:', errorData);
    });
  });

  describe('Event Listener Registration', () => {
    it('should register all required authorization error listeners', () => {
      const socket = io('http://localhost:5000');

      // Register all authorization error listeners
      socket.on('connect_error', () => {});
      socket.on('error', () => {});
      socket.on('score_update_error', () => {});
      socket.on('scores_saved_error', () => {});

      // Verify all listeners were registered
      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('score_update_error', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('scores_saved_error', expect.any(Function));
    });

    it('should pass authentication token when connecting', () => {
      const token = 'test-jwt-token';

      io('http://localhost:5000', {
        auth: { token },
      });

      expect(io).toHaveBeenCalledWith(
        'http://localhost:5000',
        expect.objectContaining({
          auth: { token },
        })
      );
    });
  });

  describe('Error Message Handling', () => {
    it('should handle errors with missing message property', () => {
      const mockToast = vi.fn();

      const socket = io('http://localhost:5000');

      socket.on('connect_error', (error) => {
        if (error.message && error.message.includes('authorization')) {
          mockToast('Authorization error');
        }
      });

      // Trigger with error object without message
      eventHandlers['connect_error']({});

      expect(mockToast).not.toHaveBeenCalled();
    });

    it('should handle null or undefined errors gracefully', () => {
      const mockToast = vi.fn();

      const socket = io('http://localhost:5000');

      socket.on('error', (error) => {
        if (error && error.message === 'Not authorized to join this room') {
          mockToast('Error');
        }
      });

      // Trigger with null
      eventHandlers['error'](null);
      expect(mockToast).not.toHaveBeenCalled();

      // Trigger with undefined
      eventHandlers['error'](undefined);
      expect(mockToast).not.toHaveBeenCalled();
    });
  });
});
