import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowRight, Trophy, ChevronDown, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { playerAPI } from '../../services/api';
import { useAuth } from '../../App';
import { COLORS, GradientText, SaffronButton, useReducedMotion } from '../public/Home';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { secureStorage } from '../../utils/secureStorage';

// ─── Simple dark dropdown (replaces generic Dropdown for this page) ────────────
const TeamDropdown = ({ options, value, onChange, loading, placeholder }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const selected = options.find((o) => o.value === value?.value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !loading && setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm min-h-[44px] transition-all duration-200 border"
        style={{
          background: 'rgba(255,255,255,0.05)',
          borderColor: open ? `${COLORS.saffron}60` : 'rgba(255,255,255,0.1)',
          color: selected ? '#fff' : 'rgba(255,255,255,0.3)',
          boxShadow: open ? `0 0 0 2px ${COLORS.saffron}20` : 'none',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}>
        <span className="truncate">{loading ? 'Loading teams...' : (selected?.label || placeholder)}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 flex-shrink-0 text-white/40" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute top-full left-0 right-0 mt-2 rounded-2xl border overflow-hidden z-50"
            style={{ background: COLORS.darkCard, borderColor: 'rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            role="listbox">
            {/* Search */}
            <div className="p-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search teams..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-xs text-white placeholder-white/25 outline-none border border-white/10 bg-white/5 focus:border-orange-500/50"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-white/35 text-sm text-center py-6">No teams found</p>
              ) : (
                filtered.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={value?.value === opt.value}
                    onClick={() => { onChange(opt); setOpen(false); setSearch(''); }}
                    className="w-full text-left px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors duration-150 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: value?.value === opt.value ? COLORS.saffron : 'rgba(255,255,255,0.15)' }} />
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── PlayerSelectTeam ─────────────────────────────────────────────────────────
const PlayerSelectTeamContent = () => {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const navigate = useNavigate();
  const { login } = useAuth();
  const reduced = useReducedMotion();

  const { handleSubmit, setValue, watch } = useForm();
  const selectedTeam = watch('team');

  useEffect(() => { fetchTeams(); }, []);

  const fetchTeams = async () => {
    try {
      setTeamsLoading(true);
      const response = await playerAPI.getTeams();
      const teamOptions = (response.data.teams || []).map((team) => ({
        value: team._id,
        competitionId: team.competitionId,
        label: team.name,
      }));
      setTeams(teamOptions);
    } catch {
      toast.error('Failed to load teams');
    } finally {
      setTeamsLoading(false);
    }
  };

  const onSubmit = async () => {
    const option = selectedTeam;
    if (!option?.value || !option?.competitionId) {
      toast.error('Please select a team');
      return;
    }
    setLoading(true);
    try {
      const response = await playerAPI.updateTeam({ teamId: option.value, competitionId: option.competitionId });
      const { token, team } = response.data;
      
      if (token) {
        // Store token using secure storage
        secureStorage.setItem('player_token', token);
        
        // Update user data with team info
        const userData = secureStorage.getItem('player_user');
        if (userData) {
          const user = JSON.parse(userData);
          user.team = team?.id || option.value;
          secureStorage.setItem('player_user', JSON.stringify(user));
          login(user, token, 'player');
        }
      }
      
      toast.success('Team joined successfully!');
      
      // Small delay before navigation
      setTimeout(() => {
        navigate('/player/dashboard');
      }, 100);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to join team');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* BG */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${COLORS.saffron}10, transparent 55%)` }} />
      {!reduced && (
        <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(${COLORS.saffron}50 1px, transparent 1px), linear-gradient(90deg, ${COLORS.saffron}50 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }} />
      )}

      <motion.div className="w-full max-w-md relative z-10"
        initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}>

        <Link to="/"
          className="inline-flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-8 transition-colors duration-200 group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform duration-200" />
          Back to Home
        </Link>

        <div className="rounded-3xl border p-8"
          style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle, boxShadow: '0 32px 64px rgba(0,0,0,0.5)' }}>

          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: `${COLORS.saffron}18`, border: `1px solid ${COLORS.saffron}30` }}>
              <Trophy className="w-8 h-8" style={{ color: COLORS.saffron }} aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-black text-white">Select Your Team</h1>
            <p className="text-white/45 text-sm mt-1">Choose the team you want to join</p>
          </div>

          {teams.length === 0 && !teamsLoading ? (
            <div className="text-center py-8 rounded-2xl border"
              style={{ borderColor: COLORS.darkBorderSubtle, background: 'rgba(255,255,255,0.02)' }}>
              <Trophy className="w-10 h-10 text-white/20 mx-auto mb-3" />
              <p className="text-white/45 text-sm">No teams available right now.</p>
              <p className="text-white/25 text-xs mt-1">Competitions may not have opened registration yet.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-white/70">
                  Team <span className="text-red-400" aria-hidden="true">*</span>
                </label>
                <TeamDropdown
                  options={teams}
                  value={selectedTeam}
                  onChange={(opt) => setValue('team', opt)}
                  loading={teamsLoading}
                  placeholder="Select a team to join"
                />
              </div>

              <SaffronButton type="submit" className="w-full"
                disabled={loading || !selectedTeam || teams.length === 0}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Joining Team...
                  </span>
                ) : 'Join Team'}
              </SaffronButton>
            </form>
          )}

          <div className="mt-6 text-center">
            <button onClick={() => navigate('/player/dashboard')}
              className="inline-flex items-center gap-1.5 text-sm text-white/30 hover:text-white/55 transition-colors duration-200 min-h-[44px] px-2">
              Skip for now
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const PlayerSelectTeam = () => <PlayerSelectTeamContent />;
export default PlayerSelectTeam;
