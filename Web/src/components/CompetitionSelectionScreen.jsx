import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompetition } from '../contexts/CompetitionContext';
import toast from 'react-hot-toast';
import { logger } from '../utils/logger';
import {
  Trophy, MapPin, Calendar, Search, X, Check, ArrowRight, Zap, Clock,
} from 'lucide-react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { COLORS, useReducedMotion, GradientText, FadeIn } from '../pages/Home';

const EASE_OUT = [0.25, 0.46, 0.45, 0.94];

const statusConfig = {
  ongoing: { color: '#22C55E', label: 'Live', Icon: Zap },
  upcoming: { color: '#3B82F6', label: 'Upcoming', Icon: Clock },
  completed: { color: 'rgba(255,255,255,0.3)', label: 'Completed', Icon: Check },
};

// ─── Ambient orb ─────────────────────────────────────────────────────────────
const AmbientOrb = ({ x, y, size, color, delay }) => {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        left: `${x}%`, top: `${y}%`,
        width: size, height: size,
        background: `radial-gradient(circle at 35% 35%, ${color}55, transparent 70%)`,
        filter: 'blur(80px)',
        transform: 'translate(-50%, -50%)',
      }}
      animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 6 + delay, delay, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
};

// ─── Competition Card ─────────────────────────────────────────────────────────
const CompetitionCard = ({ competition, isSelected, onSelect, disabled, index }) => {
  const reduced = useReducedMotion();
  const status = statusConfig[competition.status] || statusConfig.completed;
  const StatusIcon = status.Icon;

  return (
    <motion.button
      onClick={() => onSelect(competition._id)}
      disabled={disabled}
      className="w-full text-left rounded-2xl border relative overflow-hidden transition-all duration-200 focus:outline-none group"
      style={{
        background: isSelected
          ? `linear-gradient(135deg, ${COLORS.saffron}12, rgba(255,255,255,0.03))`
          : 'rgba(255,255,255,0.03)',
        borderColor: isSelected ? `${COLORS.saffron}45` : COLORS.darkBorderSubtle,
        boxShadow: isSelected ? `0 0 0 1px ${COLORS.saffron}20, 0 8px 32px ${COLORS.saffron}10` : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: EASE_OUT }}
      whileHover={disabled ? {} : {
        borderColor: `${COLORS.saffron}35`,
        background: `linear-gradient(135deg, ${COLORS.saffron}08, rgba(255,255,255,0.03))`,
        y: -2,
      }}
      whileTap={disabled ? {} : { scale: 0.99 }}
      aria-pressed={isSelected}
    >
      {/* Selected shimmer */}
      {isSelected && (
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${COLORS.saffron}60, transparent)` }} />
      )}

      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: isSelected ? `${COLORS.saffron}20` : 'rgba(255,255,255,0.06)' }}>
              <Trophy className="w-5 h-5" style={{ color: isSelected ? COLORS.saffron : 'rgba(255,255,255,0.4)' }} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-sm leading-tight">
                {competition.name} {competition.year || ''}
              </h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                {competition.place && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    <MapPin className="w-3 h-3" aria-hidden="true" />
                    {competition.place}
                  </span>
                )}
                {competition.level && (
                  <span className="text-xs capitalize px-2 py-0.5 rounded-full"
                    style={{ background: `${COLORS.saffron}12`, color: COLORS.saffronLight }}>
                    {competition.level}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Status + check */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ background: `${status.color}15`, color: status.color, border: `1px solid ${status.color}30` }}>
              {competition.status === 'ongoing' && (
                <motion.span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: status.color }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }} />
              )}
              {status.label}
            </span>
            {isSelected && (
              <motion.div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: COLORS.saffron }}
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <Check className="w-3.5 h-3.5 text-white" aria-hidden="true" />
              </motion.div>
            )}
          </div>
        </div>

        {competition.startDate && competition.endDate && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <Calendar className="w-3 h-3" aria-hidden="true" />
            {new Date(competition.startDate).toLocaleDateString()} –{' '}
            {new Date(competition.endDate).toLocaleDateString()}
          </div>
        )}

        {competition.description && (
          <p className="mt-2 text-xs leading-relaxed line-clamp-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {competition.description}
          </p>
        )}
      </div>
    </motion.button>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const CompetitionSelectionScreen = ({ userType, onCompetitionSelected }) => {
  const navigate = useNavigate();
  const { assignedCompetitions, switchCompetition, isLoading } = useCompetition();
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!isLoading && assignedCompetitions?.length === 1) {
      handleAutoSelect(assignedCompetitions[0]._id);
    }
  }, [isLoading, assignedCompetitions]);

  const handleAutoSelect = async (competitionId) => {
    try {
      setIsSelecting(true);
      await switchCompetition(competitionId);
      if (onCompetitionSelected) onCompetitionSelected(competitionId);
      navigateToDashboard();
    } catch (error) {
      logger.error('Failed to auto-select competition:', error);
      toast.error('Failed to select competition');
      setIsSelecting(false);
    }
  };

  const handleCompetitionSelect = async () => {
    if (!selectedCompetition) { toast.error('Please select a competition'); return; }
    try {
      setIsSelecting(true);
      await switchCompetition(selectedCompetition);
      if (onCompetitionSelected) onCompetitionSelected(selectedCompetition);
      navigateToDashboard();
    } catch (error) {
      logger.error('Failed to select competition:', error);
      toast.error('Failed to select competition');
      setIsSelecting(false);
    }
  };

  const navigateToDashboard = () => {
    const routes = {
      admin: '/admin/dashboard',
      superadmin: '/superadmin/dashboard',
      coach: '/coach/dashboard',
      player: '/player/dashboard',
      judge: '/judge',
    };
    navigate(routes[userType] || '/');
  };

  const filteredCompetitions = assignedCompetitions?.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.place?.toLowerCase().includes(q) ||
      c.level?.toLowerCase().includes(q) ||
      c.status?.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q)
    );
  });

  // ── Loading ──
  if (isLoading || isSelecting) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: COLORS.dark }}>
        <div className="text-center">
          <motion.div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: `${COLORS.saffron}18`, border: `1px solid ${COLORS.saffron}30` }}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Trophy className="w-8 h-8" style={{ color: COLORS.saffron }} />
          </motion.div>
          <p className="text-white/50 text-sm">
            {isSelecting ? 'Loading your dashboard...' : 'Loading competitions...'}
          </p>
        </div>
      </div>
    );
  }

  // ── Empty ──
  if (!assignedCompetitions || assignedCompetitions.length === 0) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4" style={{ background: COLORS.dark }}>
        <FadeIn className="text-center max-w-sm w-full">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.darkBorderSubtle}` }}>
            <Trophy className="w-10 h-10 text-white/20" />
          </div>
          <h2 className="text-2xl font-black text-white mb-3">No Competitions</h2>
          <p className="text-white/40 text-sm leading-relaxed mb-8">
            You are not assigned to any competitions yet. Please contact your administrator.
          </p>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-bold text-sm min-h-[44px] transition-all hover:brightness-110 active:scale-95"
            style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}
          >
            Go to Home <ArrowRight className="w-4 h-4" />
          </button>
        </FadeIn>
      </div>
    );
  }

  // ── Main ──
  return (
    <div className="min-h-dvh relative overflow-hidden" style={{ background: COLORS.dark }}>
      {/* Ambient background */}
      <AmbientOrb x={15} y={20} size={400} color={COLORS.saffron} delay={0} />
      <AmbientOrb x={85} y={70} size={300} color={COLORS.gold} delay={2} />

      {/* Noise texture overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }} />

      <div className="relative z-10 min-h-dvh flex flex-col items-center justify-center p-4 py-16">
        <div className="w-full max-w-3xl">
          {/* Header */}
          <FadeIn className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase mb-5 border"
              style={{ background: `${COLORS.saffron}12`, borderColor: `${COLORS.saffron}35`, color: COLORS.saffronLight }}>
              <Trophy className="w-3 h-3" aria-hidden="true" />
              Competition Selection
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white mb-3 leading-tight">
              Choose Your <GradientText>Arena</GradientText>
            </h1>
            <p className="text-white/40 text-base max-w-md mx-auto">
              Select a competition to continue to your dashboard
            </p>
          </FadeIn>

          {/* Search */}
          {assignedCompetitions.length > 3 && (
            <FadeIn delay={0.1} className="mb-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: 'rgba(255,255,255,0.3)' }} aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Search by name, place, level, or status..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-10 py-3.5 rounded-xl text-sm focus:outline-none transition-all min-h-[44px]"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${searchQuery ? `${COLORS.saffron}40` : COLORS.darkBorderSubtle}`,
                    color: '#fff',
                    boxShadow: searchQuery ? `0 0 0 3px ${COLORS.saffron}12` : 'none',
                  }}
                />
                <AnimatePresence>
                  {searchQuery && (
                    <motion.button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
                      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </FadeIn>
          )}

          {/* Cards grid */}
          <AnimatePresence mode="wait">
            {filteredCompetitions && filteredCompetitions.length === 0 ? (
              <motion.div
                key="empty"
                className="text-center py-16"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                <p className="text-white/30 text-sm">No competitions found for "{searchQuery}"</p>
                <button onClick={() => setSearchQuery('')}
                  className="mt-2 text-xs font-semibold transition-colors"
                  style={{ color: COLORS.saffronLight }}>
                  Clear search
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="grid"
                className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                {filteredCompetitions?.map((competition, i) => (
                  <CompetitionCard
                    key={competition._id}
                    competition={competition}
                    isSelected={selectedCompetition === competition._id}
                    onSelect={setSelectedCompetition}
                    disabled={isSelecting}
                    index={i}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* CTA */}
          <FadeIn delay={0.2} className="flex justify-center">
            <motion.button
              onClick={handleCompetitionSelect}
              disabled={!selectedCompetition || isSelecting}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-white font-bold text-sm min-h-[52px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: selectedCompetition
                  ? `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})`
                  : 'rgba(255,255,255,0.08)',
                border: `1px solid ${selectedCompetition ? 'transparent' : COLORS.darkBorderSubtle}`,
              }}
              whileHover={selectedCompetition && !isSelecting ? { scale: 1.02, brightness: 1.1 } : {}}
              whileTap={selectedCompetition && !isSelecting ? { scale: 0.97 } : {}}
            >
              {isSelecting ? (
                <>
                  <motion.div
                    className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                  Loading...
                </>
              ) : (
                <>
                  Continue to Dashboard
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </>
              )}
            </motion.button>
          </FadeIn>
        </div>
      </div>
    </div>
  );
};

export default CompetitionSelectionScreen;
