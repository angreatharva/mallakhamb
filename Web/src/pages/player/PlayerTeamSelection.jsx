import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, ArrowRight, Search, CheckCircle2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { playerAPI } from '@/services/api';
import { logger } from '@/infrastructure/logger';
import BHALogo from '../../assets/BHA.png';

const COLORS = {
  dark: '#0A0A0A',
  darkCard: '#111111',
  darkBorder: 'rgba(255,255,255,0.08)',
  darkBorderSubtle: 'rgba(255,255,255,0.04)',
  saffron: '#FF9933',
  saffronLight: '#FFB366',
  saffronDark: '#E67300',
};

const EASE = [0.22, 1, 0.36, 1];

/**
 * PlayerTeamSelection - Screen for players to select their team
 * Shown only when player doesn't have a team assigned
 */
const PlayerTeamSelection = () => {
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const response = await playerAPI.getTeams();
      const payload = response.data?.data ?? response.data?.teams ?? response.data ?? [];
      const teamsList = Array.isArray(payload) ? payload : [];
      setTeams(teamsList);
      logger.info('Teams loaded for selection', { count: teamsList.length });
    } catch (error) {
      logger.error('Failed to fetch teams:', error);
      toast.error('Failed to load teams');
    } finally {
      setLoading(false);
    }
  };

  const handleTeamSelect = async (team) => {
    setSelectedTeam(team);
    setJoining(true);
    try {
      await playerAPI.updateTeam({ teamId: team._id });
      toast.success(`Successfully joined ${team.name}!`);
      logger.info('Player joined team', { teamId: team._id, teamName: team.name });
      
      // Small delay to show success state, then navigate to dashboard
      setTimeout(() => {
        navigate('/player/dashboard', { replace: true });
      }, 500);
    } catch (error) {
      logger.error('Failed to join team:', error);
      toast.error(error.response?.data?.message || 'Failed to join team');
      setSelectedTeam(null);
      setJoining(false);
    }
  };

  const filteredTeams = teams.filter((team) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      team.name?.toLowerCase().includes(q) ||
      team.description?.toLowerCase().includes(q) ||
      team.coach?.name?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center"
        style={{ background: COLORS.dark }}>
        <div className="text-center">
          <motion.div className="w-12 h-12 rounded-full border-2 border-t-transparent mx-auto mb-4"
            style={{ borderColor: `${COLORS.saffron}40`, borderTopColor: COLORS.saffron }}
            animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
          <p className="text-white/45 text-sm">Loading teams...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col" 
      style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      
      {/* Header */}
      <div className="border-b" style={{ borderColor: COLORS.darkBorder }}>
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-4">
            <img src={BHALogo} alt="BHA Logo" className="h-10 w-auto object-contain opacity-80" />
            <div className="w-px h-8 bg-white/10" />
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                Bhausaheb Ranade Mallakhamb
              </p>
              <p className="text-white/60 text-xs">Player Portal</p>
            </div>
          </div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}>
            <h1 className="text-3xl md:text-4xl font-black text-white mb-2">
              Select Your Team
            </h1>
            <p className="text-white/45 text-sm md:text-base">
              Choose the team you want to join to start competing
            </p>
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
          
          {/* Search */}
          <motion.div className="mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: EASE }}>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                placeholder="Search teams by name, description, or coach..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl border bg-transparent text-white placeholder:text-white/30 focus:outline-none focus:border-opacity-100 transition-colors"
                style={{ 
                  borderColor: COLORS.darkBorder,
                  background: COLORS.darkCard 
                }}
              />
            </div>
          </motion.div>

          {/* Teams Grid */}
          {filteredTeams.length === 0 ? (
            <motion.div
              className="text-center py-16"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}>
              <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ background: `${COLORS.saffron}15`, border: `1px solid ${COLORS.saffron}35` }}>
                <Users className="w-8 h-8" style={{ color: COLORS.saffron }} />
              </div>
              <h3 className="text-white font-bold text-lg mb-2">
                {searchQuery ? 'No teams found' : 'No teams available'}
              </h3>
              <p className="text-white/45 text-sm">
                {searchQuery 
                  ? 'Try adjusting your search query' 
                  : 'There are no teams available at the moment'}
              </p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredTeams.map((team, index) => (
                  <motion.button
                    key={team._id}
                    onClick={() => !joining && handleTeamSelect(team)}
                    disabled={joining}
                    className="text-left p-6 rounded-2xl border transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ 
                      background: selectedTeam?._id === team._id ? `${COLORS.saffron}10` : COLORS.darkCard,
                      borderColor: selectedTeam?._id === team._id ? `${COLORS.saffron}40` : COLORS.darkBorderSubtle,
                    }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.4, delay: index * 0.05, ease: EASE }}
                    whileHover={!joining ? { 
                      borderColor: `${COLORS.saffron}35`,
                      boxShadow: `0 0 30px ${COLORS.saffron}10` 
                    } : {}}
                    whileTap={!joining ? { scale: 0.98 } : {}}>
                    
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${COLORS.saffron}15` }}>
                        <Users className="w-6 h-6" style={{ color: COLORS.saffron }} />
                      </div>
                      
                      {selectedTeam?._id === team._id && joining && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
                          <Loader2 className="w-5 h-5 animate-spin" style={{ color: COLORS.saffron }} />
                        </motion.div>
                      )}
                    </div>

                    <h3 className="text-white font-bold text-lg mb-1 truncate">
                      {team.name}
                    </h3>
                    
                    {team.description && (
                      <p className="text-white/45 text-sm mb-3 line-clamp-2">
                        {team.description}
                      </p>
                    )}

                    {team.coach?.name && (
                      <div className="flex items-center gap-2 text-xs text-white/40">
                        <span>Coach:</span>
                        <span className="font-semibold text-white/60">{team.coach.name}</span>
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t flex items-center justify-between"
                      style={{ borderColor: COLORS.darkBorderSubtle }}>
                      <span className="text-xs font-semibold" style={{ color: COLORS.saffron }}>
                        {selectedTeam?._id === team._id && joining ? 'Joining...' : 'Click to join'}
                      </span>
                      <ArrowRight className="w-4 h-4" style={{ color: COLORS.saffron }} />
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerTeamSelection;
