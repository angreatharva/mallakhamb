import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Trophy,
  Calendar,
  MapPin,
  ArrowRight,
  User,
  LogOut,
  Search,
  X,
  CheckCircle,
  Users,
  Zap,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { coachAPI, playerAPI } from '../../services/api';
import { secureStorage } from '../../utils/secureStorage';
import { logger } from '../../utils/logger';
import { useAuth } from '../../contexts/AuthContext';
import { motion, AnimatePresence, useInView } from 'framer-motion';

// Design system
import { ThemeProvider, useTheme } from '../../components/design-system/theme';
import { GlassCard } from '../../components/design-system/cards';
import { ThemedButton } from '../../components/design-system/forms';
import { HexMesh, RadialBurst } from '../../components/design-system/backgrounds';
import { useReducedMotion } from '../../components/design-system/animations';
import BHALogo from '../../assets/BHA.png';

const EASE = [0.22, 1, 0.36, 1];

/**
 * Detect user role from route path.
 * @param {string} pathname - Current route pathname (e.g. "/coach/select-competition")
 * @returns {'coach'|'player'} Detected role
 */
const detectRoleFromPath = (pathname) => {
  const match = pathname.match(/^\/([^/]+)/);
  if (!match) return 'coach';
  const segment = match[1].toLowerCase();
  return segment === 'player' ? 'player' : 'coach';
};

/**
 * Role-specific configuration for UnifiedCompetitionSelection.
 * @param {'coach'|'player'} role - The user role
 * @returns {Object} Configuration object with UI elements, colors, and navigation paths
 */
const getRoleConfig = (role) => {
  const configs = {
    coach: {
      title: 'Competition',
      subtitle: 'Selection',
      description: 'Select a competition to register your team.',
      accessLabel: 'Coach Competition Selection',
      stepLabel: 'Select Competition',
      itemLabel: 'Competition',
      buttonText: 'Register Team & Continue',
      background: HexMesh,
      icon: Trophy,
      color: '#22C55E', // Green for coach
      colorLight: '#86EFAC',
      colorDark: '#16A34A',
      colorBg: '#22C55E18',
      colorBorder: '#22C55E40',
      colorGlow: '#22C55E15',
      dashboardPath: '/coach/dashboard',
    },
    player: {
      title: 'Team',
      subtitle: 'Selection',
      description: 'Select a team to join and compete.',
      accessLabel: 'Player Team Selection',
      stepLabel: 'Select Team',
      itemLabel: 'Team',
      buttonText: 'Join Team & Continue',
      background: RadialBurst,
      icon: Users,
      color: '#F97316', // Saffron for player
      colorLight: '#FDBA74',
      colorDark: '#EA580C',
      colorBg: '#F9731618',
      colorBorder: '#F9731640',
      colorGlow: '#F9731615',
      dashboardPath: '/player/dashboard',
    },
  };
  return configs[role] || configs.coach;
};

/**
 * Inner component that uses theme context.
 */
const UnifiedCompetitionSelectionInner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const theme = useTheme();
  const reduced = useReducedMotion();

  const role = detectRoleFromPath(location.pathname);
  const config = getRoleConfig(role);

  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [coachTeam, setCoachTeam] = useState(null);

  // Load user data on mount
  useEffect(() => {
    const userData = secureStorage.getItem(`${role}_user`);
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        logger.error('Failed to parse user data:', e);
      }
    }
  }, [role]);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, [role]);

  /**
   * Fetch competitions (coach) or teams (player) from API.
   */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (role === 'coach') {
        // Fetch coach's teams first to get the team ID
        const teamsResponse = await coachAPI.getTeams();
        const teams = teamsResponse.data.teams || [];

        // Find the first team without a competition or the first team
        const availableTeam =
          teams.find((t) => !t.competitions || t.competitions.length === 0) || teams[0];

        if (!availableTeam) {
          setError('Please create a team first before selecting a competition.');
          setLoading(false);
          return;
        }

        setCoachTeam(availableTeam);

        // Fetch open competitions
        const response = await coachAPI.getOpenCompetitions();
        setItems(response.data.competitions || []);
      } else {
        const response = await playerAPI.getTeams();
        setItems(response.data.teams || []);
      }
    } catch (err) {
      logger.error(`Failed to load ${role} data:`, err);
      setError(
        err.response?.data?.message ||
          err.message ||
          `Failed to load ${config.itemLabel.toLowerCase()}s`
      );
      toast.error(error || `Failed to load ${config.itemLabel.toLowerCase()}s`);
    } finally {
      setLoading(false);
    }
  }, [role, config.itemLabel]);

  /**
   * Handle selection/join action.
   */
  const handleSubmit = useCallback(async () => {
    if (!selectedItem) {
      toast.error(`Please select a ${config.itemLabel.toLowerCase()}`);
      return;
    }

    setSubmitting(true);
    try {
      if (role === 'coach') {
        // Coach: register team for competition
        if (!coachTeam) {
          toast.error('No team found. Please create a team first.');
          setSubmitting(false);
          return;
        }

        await coachAPI.registerTeamForCompetition(coachTeam.id, selectedItem.id);

        // Set competition context
        const token = secureStorage.getItem('coach_token');
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        const authResponse = await fetch(`${apiUrl}/auth/set-competition`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ competitionId: selectedItem.id }),
        });

        if (!authResponse.ok) {
          const errorData = await authResponse.json();
          throw new Error(errorData.message || 'Failed to set competition context');
        }

        const authData = await authResponse.json();
        secureStorage.setItem('coach_token', authData.token);
        toast.success('Team registered for competition successfully!');
      } else {
        // Player: join team
        const response = await playerAPI.updateTeam({
          teamId: selectedItem._id || selectedItem.id,
          competitionId: selectedItem.competitionId,
        });

        const { token, team } = response.data;

        if (token) {
          secureStorage.setItem('player_token', token);

          const userData = secureStorage.getItem('player_user');
          if (userData) {
            const user = JSON.parse(userData);
            user.team = team?.id || selectedItem._id || selectedItem.id;
            secureStorage.setItem('player_user', JSON.stringify(user));
            login(user, token, 'player');
          }
        }

        toast.success('Team joined successfully!');
      }

      // Navigate to dashboard
      setTimeout(() => {
        navigate(config.dashboardPath);
      }, 100);
    } catch (err) {
      logger.error(`${role} selection error:`, err);
      const errorMsg =
        err.response?.data?.message ||
        err.message ||
        `Failed to ${role === 'coach' ? 'register team' : 'join team'}`;
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  }, [selectedItem, role, config.dashboardPath, navigate, login]);

  /**
   * Filter items based on search query.
   */
  const filteredItems = items.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();

    if (role === 'coach') {
      return [item.name, item.place, item.level, item.status, item.description].some((v) =>
        v?.toLowerCase().includes(q)
      );
    } else {
      // Player: search by team name, coach name, competition name, description
      const coachName =
        typeof item.coach === 'string'
          ? item.coach
          : `${item.coach?.firstName || ''} ${item.coach?.lastName || ''}`.trim();

      return [item.name, coachName, item.competitionName, item.description].some((v) =>
        v?.toLowerCase().includes(q)
      );
    }
  });

  /**
   * Get status badge styling for competitions.
   */
  const getStatusStyle = (status) => {
    if (status === 'ongoing') {
      return { bg: '#22C55E18', border: '#22C55E40', color: '#22C55E' };
    }
    if (status === 'upcoming') {
      return { bg: '#3B82F618', border: '#3B82F640', color: '#60A5FA' };
    }
    return {
      bg: 'rgba(255,255,255,0.05)',
      border: 'rgba(255,255,255,0.1)',
      color: 'rgba(255,255,255,0.4)',
    };
  };

  // Loading state
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: theme.colors.background }}
      >
        <div className="text-center">
          <motion.div
            className="w-12 h-12 rounded-full border-2 border-t-transparent mx-auto mb-4"
            style={{
              borderColor: `${config.color}40`,
              borderTopColor: config.color,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <p className="text-white/45 text-sm">Loading {config.itemLabel.toLowerCase()}s...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: theme.colors.background, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* Background decoration */}
      {!reduced && config.background && typeof config.background === 'function' && (
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
          {config.background({ color: config.color })}
        </div>
      )}

      {/* Navbar */}
      <header
        className="border-b fixed top-0 left-0 right-0 z-40"
        style={{
          background: 'rgba(10,10,10,0.92)',
          backdropFilter: 'blur(20px)',
          borderColor: theme.colors.border,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img src={BHALogo} alt="BHA Logo" className="h-10 w-auto object-contain" />
            <span className="text-white font-bold text-sm hidden sm:block">Mallakhamb</span>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                <User className="w-4 h-4 text-white/40" aria-hidden="true" />
                <span className="text-white/70 text-sm">
                  {user.name || user.firstName || 'User'}
                </span>
              </div>
            )}
            <button
              onClick={() => {
                secureStorage.removeItem(`${role}_token`);
                secureStorage.removeItem(`${role}_user`);
                navigate(`/${role}/login`);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-white/50 hover:text-white/80 transition-colors min-h-[44px]"
              style={{ border: `1px solid ${theme.colors.border}` }}
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span className="text-sm hidden sm:block">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-10 pt-24">
        {/* Header */}
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase mb-4 border"
            style={{
              background: config.colorBg,
              borderColor: config.colorBorder,
              color: config.colorLight,
            }}
          >
            {config.icon && typeof config.icon === 'function' && (
              <config.icon className="w-3 h-3" aria-hidden="true" />
            )}
            {config.accessLabel}
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-3">
            Select Your <span style={{ color: config.color }}>{config.title}</span>
          </h1>
          <p className="text-white/45 text-sm">{config.description}</p>
        </motion.div>

        {/* Error state */}
        {error && (
          <motion.div
            className="mb-8 p-4 rounded-2xl border flex items-start gap-3"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              borderColor: 'rgba(239, 68, 68, 0.3)',
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-red-200 text-sm">{error}</p>
              <button
                onClick={fetchData}
                className="mt-2 text-xs text-red-300 hover:text-red-200 transition-colors underline"
              >
                Try again
              </button>
            </div>
          </motion.div>
        )}

        {/* Items section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          aria-labelledby="selection-heading"
        >
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: selectedItem ? config.color : config.colorDark }}
            >
              1
            </div>
            <h2 id="selection-heading" className="text-lg font-bold text-white">
              {config.stepLabel}
            </h2>
          </div>

          {/* Empty state */}
          {filteredItems.length === 0 && !searchQuery && (
            <GlassCard className="p-8 text-center">
              {config.icon && typeof config.icon === 'function' && (
                <config.icon className="w-12 h-12 mx-auto mb-4 text-white/20" aria-hidden="true" />
              )}
              <p className="text-white/45 mb-4">
                No {config.itemLabel.toLowerCase()}s available right now.
              </p>
              {role === 'coach' && (
                <button
                  onClick={() => navigate('/coach/create-team')}
                  className="px-6 py-3 rounded-xl font-bold text-white min-h-[44px]"
                  style={{
                    background: `linear-gradient(135deg, ${config.color}, ${config.colorDark})`,
                  }}
                >
                  Create New Team
                </button>
              )}
            </GlassCard>
          )}

          {/* Search bar */}
          {filteredItems.length > 3 && (
            <div className="relative mb-4">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder={`Search ${config.itemLabel.toLowerCase()}s...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-10 py-3 rounded-xl text-white placeholder-white/25 outline-none min-h-[44px]"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${theme.colors.border}`,
                }}
                onFocus={(e) => (e.target.style.borderColor = config.color)}
                onBlur={(e) => (e.target.style.borderColor = theme.colors.border)}
                aria-label={`Search ${config.itemLabel.toLowerCase()}s`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/60 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* No search results */}
          {filteredItems.length === 0 && searchQuery && (
            <GlassCard className="p-8 text-center">
              <p className="text-white/45">
                No {config.itemLabel.toLowerCase()}s found for "{searchQuery}".
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-sm hover:opacity-80"
                style={{ color: config.colorLight }}
              >
                Clear search
              </button>
            </GlassCard>
          )}

          {/* Items grid */}
          {filteredItems.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <AnimatePresence>
                {filteredItems.map((item, idx) => (
                  <motion.button
                    key={item.id || item._id}
                    onClick={() => setSelectedItem(item)}
                    disabled={submitting}
                    className="text-left p-5 rounded-2xl border transition-all duration-200 relative overflow-hidden"
                    style={{
                      background:
                        selectedItem?.id === item.id || selectedItem?._id === item._id
                          ? config.colorBg
                          : theme.colors.cardBackground,
                      borderColor:
                        selectedItem?.id === item.id || selectedItem?._id === item._id
                          ? config.colorBorder
                          : theme.colors.border,
                      boxShadow:
                        selectedItem?.id === item.id || selectedItem?._id === item._id
                          ? `0 0 30px ${config.colorGlow}`
                          : 'none',
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                    whileHover={
                      submitting
                        ? {}
                        : {
                            scale: 1.01,
                            borderColor: `${config.colorBorder}`,
                            background: `linear-gradient(135deg, ${config.colorBg}, rgba(255,255,255,0.03))`,
                            y: -2,
                          }
                    }
                    whileTap={submitting ? {} : { scale: 0.99 }}
                    aria-pressed={selectedItem?.id === item.id || selectedItem?._id === item._id}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-white font-bold">{item.name}</p>

                        {/* Coach competition details */}
                        {role === 'coach' && (
                          <>
                            {item.place && (
                              <div className="flex items-center gap-2 text-white/45 text-xs mt-2">
                                <MapPin className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                                <span>{item.place}</span>
                                {item.level && (
                                  <>
                                    <span>·</span>
                                    <span className="capitalize">{item.level}</span>
                                  </>
                                )}
                              </div>
                            )}
                            {item.startDate && item.endDate && (
                              <div className="flex items-center gap-2 text-white/45 text-xs mt-1">
                                <Calendar className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                                <span>
                                  {new Date(item.startDate).toLocaleDateString()} –{' '}
                                  {new Date(item.endDate).toLocaleDateString()}
                                </span>
                              </div>
                            )}
                            {item.status && (
                              <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold mt-2"
                                style={getStatusStyle(item.status)}
                              >
                                {item.status}
                              </span>
                            )}
                          </>
                        )}

                        {/* Player team details */}
                        {role === 'player' && (
                          <>
                            {item.coach && (
                              <p className="text-white/40 text-sm mt-1">
                                Coach:{' '}
                                {typeof item.coach === 'string'
                                  ? item.coach
                                  : `${item.coach.firstName || ''} ${item.coach.lastName || ''}`.trim()}
                              </p>
                            )}
                            {item.competitionName && (
                              <p className="text-white/40 text-sm">
                                Competition: {item.competitionName}
                              </p>
                            )}
                            {item.description && (
                              <p className="text-white/40 text-xs mt-1 line-clamp-1">
                                {item.description}
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      {/* Selection indicator */}
                      {(selectedItem?.id === item.id || selectedItem?._id === item._id) && (
                        <CheckCircle
                          className="w-5 h-5 flex-shrink-0 ml-3"
                          style={{ color: config.color }}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.section>

        {/* Submit button */}
        <motion.div
          className="flex justify-center mt-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <motion.button
            onClick={handleSubmit}
            disabled={!selectedItem || submitting}
            className="px-8 py-4 rounded-2xl font-bold text-white flex items-center gap-3 min-h-[52px] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: `linear-gradient(135deg, ${config.color}, ${config.colorDark})`,
            }}
            whileHover={!selectedItem || submitting ? {} : { scale: 1.02 }}
            whileTap={!selectedItem || submitting ? {} : { scale: 0.98 }}
            aria-label={config.buttonText}
          >
            {submitting ? (
              <>
                <motion.svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </motion.svg>
                {role === 'coach' ? 'Registering...' : 'Joining...'}
              </>
            ) : (
              <>
                {config.buttonText}
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </>
            )}
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
};

/**
 * UnifiedCompetitionSelection - Unified component for coach competition selection and player team selection.
 *
 * Features:
 * - Role detection from route path
 * - Role-specific theming (green for coach, saffron for player)
 * - Coach: Display competitions with details, register team for competition
 * - Player: Display teams with details, join team
 * - Loading and empty states with error handling
 * - Design system integration (GlassCard, role-specific colors, backgrounds)
 * - Accessibility features (ARIA labels, keyboard navigation, focus indicators)
 * - Mobile responsive design
 *
 * @example
 * // In App.jsx routes:
 * <Route path="/coach/select-competition" element={<UnifiedCompetitionSelection />} />
 * <Route path="/player/select-team" element={<UnifiedCompetitionSelection />} />
 *
 * **Validates: Requirements 6.1-6.7, 7.1, 8.2, 8.4, 12.2-12.4, 13.1, 13.5, 16.7**
 */
const UnifiedCompetitionSelection = () => {
  const location = useLocation();
  const role = detectRoleFromPath(location.pathname);

  return (
    <ThemeProvider role={role}>
      <UnifiedCompetitionSelectionInner />
    </ThemeProvider>
  );
};

export default UnifiedCompetitionSelection;
