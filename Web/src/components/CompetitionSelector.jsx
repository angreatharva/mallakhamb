import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompetition } from '../contexts/CompetitionContext';
import { ChevronDown, Check, Search, X, PlusCircle, Trophy, MapPin, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '../utils/logger';
import { COLORS, useReducedMotion } from '../pages/public/Home';

void motion;

const statusColors = {
  ongoing: '#22C55E',
  upcoming: '#3B82F6',
  completed: 'rgba(255,255,255,0.3)',
};

const CompetitionSelector = ({ userType }) => {
  const navigate = useNavigate();
  const { currentCompetition, assignedCompetitions, switchCompetition, isLoading } = useCompetition();
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  const handleSwitch = async (competitionId) => {
    if (competitionId === currentCompetition?._id) { setIsOpen(false); return; }
    try {
      setIsSwitching(true);
      await switchCompetition(competitionId);
      setIsOpen(false);
    } catch (error) {
      logger.error('Failed to switch competition:', error);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleNewRegistration = () => {
    setIsOpen(false);
    if (userType === 'player') navigate('/player/select-team');
    else if (userType === 'coach') navigate('/coach/select-competition');
  };

  const filteredCompetitions = assignedCompetitions?.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.place?.toLowerCase().includes(q) ||
      c.level?.toLowerCase().includes(q) ||
      c.status?.toLowerCase().includes(q)
    );
  });

  if (isLoading) return null;
  if (userType === 'admin' && (!assignedCompetitions || assignedCompetitions.length <= 1)) return null;
  if ((userType === 'player' || userType === 'coach') && (!assignedCompetitions || assignedCompetitions.length === 0)) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSwitching}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all duration-200 min-h-[44px] disabled:opacity-50"
        style={{
          background: isOpen ? `${COLORS.saffron}10` : 'rgba(255,255,255,0.05)',
          borderColor: isOpen ? `${COLORS.saffron}40` : COLORS.darkBorderSubtle,
          boxShadow: isOpen ? `0 0 0 3px ${COLORS.saffron}12` : 'none',
        }}
        whileTap={{ scale: 0.97 }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select competition"
      >
        <Trophy className="w-3.5 h-3.5 flex-shrink-0" style={{ color: COLORS.saffron }} aria-hidden="true" />
        <div className="flex flex-col items-start max-w-[160px]">
          <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Competition
          </span>
          <span className="text-xs font-semibold text-white truncate w-full">
            {currentCompetition
              ? `${currentCompetition.name}${currentCompetition.year ? ` ${currentCompetition.year}` : ''}`
              : 'Select'}
          </span>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }} />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute right-0 mt-2 w-80 rounded-2xl border overflow-hidden z-50"
            style={{
              background: '#111111',
              borderColor: `${COLORS.saffron}25`,
              boxShadow: `0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px ${COLORS.saffron}10`,
              maxHeight: 380,
            }}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            role="listbox"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b" style={{ borderColor: COLORS.darkBorderSubtle }}>
              <p className="text-xs font-bold tracking-widest uppercase" style={{ color: COLORS.saffron }}>
                Switch Competition
              </p>
            </div>

            {/* Search */}
            {assignedCompetitions && assignedCompetitions.length > 3 && (
              <div className="p-3 border-b" style={{ borderColor: COLORS.darkBorderSubtle }}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                    style={{ color: 'rgba(255,255,255,0.3)' }} aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="Search competitions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-8 py-2 text-xs rounded-lg focus:outline-none"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: `1px solid ${COLORS.darkBorderSubtle}`,
                      color: '#fff',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {searchQuery && (
                    <button onClick={(e) => { e.stopPropagation(); setSearchQuery(''); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                      aria-label="Clear search">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* List */}
            <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
              {filteredCompetitions && filteredCompetitions.length === 0 ? (
                <div className="py-8 text-center text-white/30 text-xs">
                  No competitions found for "{searchQuery}"
                </div>
              ) : (
                filteredCompetitions?.map((competition) => {
                  const isActive = currentCompetition?._id === competition._id;
                  const sc = statusColors[competition.status] || statusColors.completed;
                  return (
                    <motion.button
                      key={competition._id}
                      onClick={() => handleSwitch(competition._id)}
                      disabled={isSwitching}
                      className="w-full text-left px-4 py-3 transition-colors duration-150 disabled:opacity-50 border-b last:border-b-0"
                      style={{
                        background: isActive ? `${COLORS.saffron}10` : 'transparent',
                        borderColor: COLORS.darkBorderSubtle,
                      }}
                      whileHover={{ background: `${COLORS.saffron}08` }}
                      role="option"
                      aria-selected={isActive}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white truncate">
                              {competition.name} {competition.year || ''}
                            </span>
                            {isActive && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: COLORS.saffron }} aria-hidden="true" />}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {competition.place && (
                              <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                <MapPin className="w-2.5 h-2.5" aria-hidden="true" />
                                {competition.place}
                              </span>
                            )}
                            <span className="text-xs capitalize" style={{ color: 'rgba(255,255,255,0.3)' }}>
                              {competition.level}
                            </span>
                          </div>
                          {competition.startDate && competition.endDate && (
                            <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                              <Calendar className="w-2.5 h-2.5" aria-hidden="true" />
                              {new Date(competition.startDate).toLocaleDateString()} –{' '}
                              {new Date(competition.endDate).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold capitalize flex-shrink-0"
                          style={{ background: `${sc}15`, color: sc, border: `1px solid ${sc}30` }}>
                          {competition.status}
                        </span>
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>

            {/* Register new */}
            {(userType === 'player' || userType === 'coach') && (
              <div className="border-t" style={{ borderColor: COLORS.darkBorderSubtle }}>
                <motion.button
                  onClick={handleNewRegistration}
                  disabled={isSwitching}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors disabled:opacity-50"
                  whileHover={{ background: 'rgba(34,197,94,0.08)' }}
                >
                  <PlusCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#22C55E' }} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#22C55E' }}>Register for New Competition</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {userType === 'player' ? 'Join a team for a new competition' : 'Register your team'}
                    </p>
                  </div>
                </motion.button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Switching overlay */}
      <AnimatePresence>
        {isSwitching && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              className="flex items-center gap-3 px-6 py-4 rounded-2xl border"
              style={{ background: '#111111', borderColor: `${COLORS.saffron}30` }}
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
            >
              <motion.div
                className="w-5 h-5 rounded-full border-2 border-t-transparent"
                style={{ borderColor: `${COLORS.saffron}40`, borderTopColor: COLORS.saffron }}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              />
              <span className="text-white/70 text-sm font-medium">Switching competition...</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CompetitionSelector;
