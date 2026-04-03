import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ShieldHalf, Mars, Users, Venus, Target, Award, Shield,
  Menu, X, LogOut, Play, CheckCircle, XCircle, LayoutDashboard,
  Users2, Trophy, Gavel, ReceiptIndianRupee, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '../services/api';
import { CompetitionProvider } from '../contexts/CompetitionContext';
import CompetitionDisplay from '../components/CompetitionDisplay';
import CompetitionSelector from '../components/CompetitionSelector';
import { useResponsive } from '../hooks/useResponsive';
import { useRouteContext } from '../contexts/RouteContext';
import AdminTeams from './AdminTeams';
import AdminScores from './AdminScores';
import AdminJudges from './AdminJudges';
import AdminTransactions from './AdminTransactions';
import { useCompetition } from '../contexts/CompetitionContext';
import { useAgeGroups, useAgeGroupValues } from '../hooks/useAgeGroups';
import { logger } from '../utils/logger';
import ConfirmDialog from '../components/ConfirmDialog';
import { ADMIN_COLORS, ADMIN_EASE_OUT, ADMIN_SPRING } from './adminTheme';
import BHALogo from '../assets/BHA.png';

// ─── Reduced-motion hook ──────────────────────────────────────────────────────
const useReducedMotion = () => {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
};

// ─── FadeIn ───────────────────────────────────────────────────────────────────
const FadeIn = ({ children, delay = 0, direction = 'up', className = '' }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();
  const variants = {
    hidden: reduced ? { opacity: 0 } : {
      opacity: 0,
      y: direction === 'up' ? 24 : direction === 'down' ? -24 : 0,
      x: direction === 'left' ? 24 : direction === 'right' ? -24 : 0,
    },
    visible: { opacity: 1, y: 0, x: 0 },
  };
  return (
    <motion.div ref={ref} className={className} variants={variants}
      initial="hidden" animate={inView ? 'visible' : 'hidden'}
      transition={{ duration: 0.55, delay, ease: ADMIN_EASE_OUT }}>
      {children}
    </motion.div>
  );
};

// ─── GradientText ─────────────────────────────────────────────────────────────
const GradientText = ({ children, className = '', color = 'saffron' }) => {
  const grad = color === 'purple'
    ? `linear-gradient(135deg, ${ADMIN_COLORS.purple}, ${ADMIN_COLORS.purpleLight})`
    : `linear-gradient(135deg, ${ADMIN_COLORS.saffron}, ${ADMIN_COLORS.gold}, ${ADMIN_COLORS.saffronLight})`;
  return (
    <span className={className} style={{ background: grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
      {children}
    </span>
  );
};

// ─── DarkCard ─────────────────────────────────────────────────────────────────
const DarkCard = ({ children, className = '', style = {}, hover = false, ...props }) => (
  <motion.div
    className={`rounded-2xl border ${className}`}
    style={{
      background: ADMIN_COLORS.darkCard,
      borderColor: ADMIN_COLORS.darkBorderSubtle,
      ...style,
    }}
    whileHover={hover ? { borderColor: `${ADMIN_COLORS.saffron}30`, boxShadow: `0 8px 32px ${ADMIN_COLORS.saffron}08` } : {}}
    transition={{ duration: 0.2 }}
    {...props}
  >
    {children}
  </motion.div>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, color, delay = 0 }) => (
  <FadeIn delay={delay}>
    <DarkCard hover className="p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}18` }}>
        <Icon className="w-5 h-5" style={{ color }} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-white/40 text-xs tracking-wide uppercase truncate">{label}</p>
        <p className="text-2xl font-black text-white mt-0.5">{value ?? 0}</p>
      </div>
    </DarkCard>
  </FadeIn>
);

// ─── Age group label helper ───────────────────────────────────────────────────
const ageLabel = (ag) => ({
  Under10: 'Under 10', Under12: 'Under 12', Under14: 'Under 14',
  Under16: 'Under 16', Under18: 'Under 18', Above16: 'Above 16', Above18: 'Above 18',
}[ag] || ag);

const compLabel = (ct) => ({
  competition_1: 'Competition I', competition_2: 'Competition II', competition_3: 'Competition III',
}[ct] || ct);

// ─── Judges Summary Card ──────────────────────────────────────────────────────
const JudgeGroupCard = ({ item, genderColor, startingCompTypes, onStart, loadingJudgesSummary }) => (
  <DarkCard className="p-4">
    <p className="font-bold text-white text-sm mb-3">{ageLabel(item.ageGroup)}</p>
    <div className="space-y-2">
      {item.competitionTypes && Object.entries(item.competitionTypes)
        .sort(([a], [b]) => ({ competition_1: 1, competition_2: 2, competition_3: 3 }[a] - { competition_1: 1, competition_2: 2, competition_3: 3 }[b]))
        .map(([compType, data]) => {
          const key = `${item.gender}_${item.ageGroup}_${compType}`;
          const isStarting = startingCompTypes[key] || false;
          const judgeNames = data.judges?.map(j => j.name).join(', ') || 'No judges assigned';
          return (
            <div key={compType} className="rounded-xl p-3 border"
              style={{
                background: data.isStarted ? `${ADMIN_COLORS.blue}10` : data.hasMinimumJudges ? `${ADMIN_COLORS.green}10` : `${ADMIN_COLORS.red}10`,
                borderColor: data.isStarted ? `${ADMIN_COLORS.blue}30` : data.hasMinimumJudges ? `${ADMIN_COLORS.green}30` : `${ADMIN_COLORS.red}30`,
              }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{compLabel(compType)}</span>
                  {data.isStarted
                    ? <span className="px-2 py-0.5 text-xs font-bold rounded-full" style={{ background: `${ADMIN_COLORS.blue}30`, color: ADMIN_COLORS.blue }}>Started</span>
                    : data.hasMinimumJudges
                      ? <CheckCircle className="w-3.5 h-3.5" style={{ color: ADMIN_COLORS.green }} />
                      : <XCircle className="w-3.5 h-3.5" style={{ color: ADMIN_COLORS.red }} />}
                </div>
                {!data.isStarted && (
                  <motion.button
                    onClick={() => onStart(item.gender, item.ageGroup, compType)}
                    disabled={isStarting || !data.hasMinimumJudges || loadingJudgesSummary}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 min-h-[32px] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    style={{ background: data.hasMinimumJudges ? ADMIN_COLORS.green : ADMIN_COLORS.darkPanel, color: '#fff' }}
                    whileHover={data.hasMinimumJudges ? { scale: 1.03 } : {}}
                    whileTap={data.hasMinimumJudges ? { scale: 0.97 } : {}}
                  >
                    <Play className="w-3 h-3" />
                    {isStarting ? 'Starting…' : 'Start'}
                  </motion.button>
                )}
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Judges ({data.judges?.length || 0}): <span className="text-white/60">{judgeNames}</span>
              </p>
            </div>
          );
        })}
    </div>
  </DarkCard>
);

// ─── Nav tabs config ──────────────────────────────────────────────────────────
const NAV_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'teams', label: 'Teams', icon: Users2 },
  { id: 'scores', label: 'Scores', icon: Trophy },
  { id: 'judges', label: 'Judges', icon: Gavel },
  { id: 'transactions', label: 'Transactions', icon: ReceiptIndianRupee },
];

// ─── Main Component ───────────────────────────────────────────────────────────
const AdminDashboard = ({ routePrefix: routePrefixProp }) => {
  const navigate = useNavigate();
  const { tab } = useParams();
  const { isMobile } = useResponsive();
  const reduced = useReducedMotion();

  const contextValue = useRouteContext();
  const routePrefix = routePrefixProp || contextValue.routePrefix;
  const storagePrefix = contextValue.storagePrefix;
  const api = routePrefix === '/superadmin' ? superAdminAPI : adminAPI;
  const isSuperAdmin = routePrefix === '/superadmin';

  const activeTab = tab || 'dashboard';
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [judgesSummary, setJudgesSummary] = useState([]);
  const [loadingJudgesSummary, setLoadingJudgesSummary] = useState(false);
  const [startingCompTypes, setStartingCompTypes] = useState({});
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

  const { currentCompetition } = useCompetition();
  const maleAgeGroupValues = useAgeGroupValues('Male');
  const femaleAgeGroupValues = useAgeGroupValues('Female');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchDashboardStats();
      fetchJudgesSummary();
    }
  }, [activeTab]);

  const fetchJudgesSummary = async () => {
    setLoadingJudgesSummary(true);
    try {
      const response = await api.getAllJudgesSummary();
      setJudgesSummary(response.data.summary || []);
    } catch (error) {
      logger.error('Failed to fetch judges summary:', error);
    } finally {
      setLoadingJudgesSummary(false);
    }
  };

  const handleStartCompetitionType = async (gender, ageGroup, competitionType) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Start Competition Type',
      message: `Are you sure you want to start ${compLabel(competitionType)} for ${gender} ${ageLabel(ageGroup)}?\n\nOnce started, judges for this competition type cannot be modified.`,
      onConfirm: async () => {
        const key = `${gender}_${ageGroup}_${competitionType}`;
        setStartingCompTypes(prev => ({ ...prev, [key]: true }));
        try {
          await api.startAgeGroup({ gender, ageGroup, competitionType });
          toast.success(`${compLabel(competitionType)} for ${gender} ${ageLabel(ageGroup)} started!`);
          fetchJudgesSummary();
        } catch (error) {
          toast.error(error.response?.data?.message || 'Failed to start competition type');
        } finally {
          setStartingCompTypes(prev => ({ ...prev, [key]: false }));
        }
      }
    });
  };

  const fetchDashboardStats = async () => {
    setLoading(true);
    try {
      const response = await api.getDashboard();
      setStats(response.data.stats);
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error('Authentication failed. Please login again.');
      } else {
        toast.error('Failed to load dashboard stats');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(`${storagePrefix}_token`);
    localStorage.removeItem(`${storagePrefix}_user`);
    navigate(`${routePrefix}/login`);
  };

  const handleTabNav = (tabId) => {
    navigate(tabId === 'dashboard' ? `${routePrefix}/dashboard` : `${routePrefix}/dashboard/${tabId}`);
    setMobileMenuOpen(false);
  };

  // ─── Dashboard Tab Content ─────────────────────────────────────────────────
  const renderDashboardTab = () => (
    <div className="space-y-8">
      {/* Competition Display */}
      <FadeIn>
        <CompetitionProvider userType={storagePrefix}>
          <div className="rounded-2xl border p-4 md:p-6"
            style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle }}>
            <CompetitionDisplay />
          </div>
        </CompetitionProvider>
      </FadeIn>

      {/* Stats Grid */}
      <div>
        <FadeIn>
          <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: ADMIN_COLORS.saffron }}>
            Overview
          </p>
        </FadeIn>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard icon={ShieldHalf} label="Total Teams" value={stats?.totalTeams} color={ADMIN_COLORS.purple} delay={0} />
          <StatCard icon={Users} label="Total Participants" value={stats?.totalParticipants} color={ADMIN_COLORS.saffron} delay={0.05} />
          <StatCard icon={Mars} label="Boys Teams" value={stats?.boysTeams} color={ADMIN_COLORS.blue} delay={0.1} />
          <StatCard icon={Venus} label="Girls Teams" value={stats?.girlsTeams} color="#EC4899" delay={0.15} />
          <StatCard icon={Target} label="Total Boys" value={stats?.totalBoys} color={ADMIN_COLORS.blue} delay={0.2} />
          <StatCard icon={Target} label="Total Girls" value={stats?.totalGirls} color="#EC4899" delay={0.25} />
        </div>
      </div>

      {/* Judges Assignment Status */}
      {currentCompetition && (
        <FadeIn delay={0.1}>
          <div className="rounded-2xl border p-6"
            style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle }}>
            <div className="mb-6">
              <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: ADMIN_COLORS.saffron }}>
                Competition Control
              </p>
              <h3 className="text-xl font-black text-white">Judges Assignment Status</h3>
              <p className="text-white/40 text-sm mt-1">
                Each competition type needs at least 3 judges to start. Once started, judges cannot be modified.
              </p>
            </div>

            {loadingJudgesSummary ? (
              <div className="flex items-center justify-center py-12 gap-3">
                <div className="w-5 h-5 border-2 border-white/20 border-t-saffron rounded-full animate-spin"
                  style={{ borderTopColor: ADMIN_COLORS.saffron }} />
                <span className="text-white/40 text-sm">Loading judges summary…</span>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Boys */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Mars className="w-4 h-4" style={{ color: ADMIN_COLORS.blue }} />
                    <span className="text-sm font-bold text-white/70 tracking-wide uppercase">Boys Age Groups</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {judgesSummary
                      .filter(item => item.gender === 'Male' && maleAgeGroupValues.includes(item.ageGroup))
                      .map(item => (
                        <JudgeGroupCard key={`male-${item.ageGroup}`} item={item}
                          genderColor={ADMIN_COLORS.blue} startingCompTypes={startingCompTypes}
                          onStart={handleStartCompetitionType} loadingJudgesSummary={loadingJudgesSummary} />
                      ))}
                  </div>
                </div>
                {/* Girls */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Venus className="w-4 h-4" style={{ color: '#EC4899' }} />
                    <span className="text-sm font-bold text-white/70 tracking-wide uppercase">Girls Age Groups</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {judgesSummary
                      .filter(item => item.gender === 'Female' && femaleAgeGroupValues.includes(item.ageGroup))
                      .map(item => (
                        <JudgeGroupCard key={`female-${item.ageGroup}`} item={item}
                          genderColor="#EC4899" startingCompTypes={startingCompTypes}
                          onStart={handleStartCompetitionType} loadingJudgesSummary={loadingJudgesSummary} />
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </FadeIn>
      )}
    </div>
  );

  // ─── Loading State ─────────────────────────────────────────────────────────
  if (loading && activeTab === 'dashboard') {
    return (
      <div className="min-h-dvh flex items-center justify-center"
        style={{ background: ADMIN_COLORS.dark }}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-white/10 rounded-full mx-auto mb-4"
            style={{ borderTopColor: ADMIN_COLORS.saffron, animation: 'spin 0.8s linear infinite' }} />
          <p className="text-white/40 text-sm">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh" style={{ background: ADMIN_COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText="Start"
        cancelText="Cancel"
        confirmButtonClass="bg-green-600 hover:bg-green-700"
      />

      {/* ─── Navbar ─────────────────────────────────────────────────────── */}
      <motion.header
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: scrolled ? 'rgba(10,10,10,0.94)' : 'rgba(10,10,10,0.80)',
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${scrolled ? ADMIN_COLORS.darkBorder : ADMIN_COLORS.darkBorderSubtle}`,
          transition: 'border-color 0.3s',
        }}
        initial={{ y: -70, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16">
          {/* Left: Logo + Title */}
          <div className="flex items-center gap-3">
            <img src={BHALogo} alt="BHA" className="h-8 w-auto object-contain" />
            <div className="hidden sm:block">
              <p className="text-xs font-bold tracking-widest uppercase leading-none"
                style={{ color: isSuperAdmin ? ADMIN_COLORS.saffron : ADMIN_COLORS.purple }}>
                {isSuperAdmin ? 'Super Admin' : 'Admin'}
              </p>
              <p className="text-white text-sm font-bold leading-tight">Dashboard</p>
            </div>
          </div>

          {/* Center: Desktop Tabs */}
          {!isMobile && (
            <nav className="flex items-center gap-1" aria-label="Admin navigation">
              {NAV_TABS.map((t) => {
                const Icon = t.icon;
                const isActive = activeTab === t.id;
                return (
                  <motion.button
                    key={t.id}
                    onClick={() => handleTabNav(t.id)}
                    className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 min-h-[36px]"
                    style={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.5)' }}
                    whileHover={{ color: '#fff' }}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 rounded-lg"
                        style={{ background: `${isSuperAdmin ? ADMIN_COLORS.saffron : ADMIN_COLORS.purple}20`, border: `1px solid ${isSuperAdmin ? ADMIN_COLORS.saffron : ADMIN_COLORS.purple}30` }}
                        layoutId="activeTab"
                        transition={ADMIN_SPRING}
                      />
                    )}
                    <Icon className="w-3.5 h-3.5 relative z-10" aria-hidden="true" />
                    <span className="relative z-10">{t.label}</span>
                  </motion.button>
                );
              })}
            </nav>
          )}

          {/* Right: Competition Selector + Logout + Mobile Menu */}
          <div className="flex items-center gap-2">
            <CompetitionProvider userType={storagePrefix}>
              <CompetitionSelector userType={storagePrefix} />
            </CompetitionProvider>

            <motion.button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold min-h-[36px] transition-colors duration-200"
              style={{ color: 'rgba(255,255,255,0.5)', border: `1px solid ${ADMIN_COLORS.darkBorderSubtle}` }}
              whileHover={{ color: ADMIN_COLORS.red, borderColor: `${ADMIN_COLORS.red}40` }}
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Logout</span>
            </motion.button>

            {isMobile && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/10 transition-colors"
                style={{ color: 'rgba(255,255,255,0.7)' }}
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={mobileMenuOpen ? 'x' : 'menu'}
                    initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                    {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                  </motion.div>
                </AnimatePresence>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMobile && mobileMenuOpen && (
            <motion.div
              className="border-t"
              style={{ background: 'rgba(10,10,10,0.98)', backdropFilter: 'blur(20px)', borderColor: ADMIN_COLORS.darkBorder }}
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
            >
              <div className="px-4 py-4 space-y-1">
                {NAV_TABS.map((t, i) => {
                  const Icon = t.icon;
                  const isActive = activeTab === t.id;
                  return (
                    <motion.button
                      key={t.id}
                      onClick={() => handleTabNav(t.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold min-h-[44px] transition-all duration-200"
                      style={{
                        background: isActive ? `${isSuperAdmin ? ADMIN_COLORS.saffron : ADMIN_COLORS.purple}18` : 'transparent',
                        color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                        border: `1px solid ${isActive ? (isSuperAdmin ? ADMIN_COLORS.saffron : ADMIN_COLORS.purple) + '30' : 'transparent'}`,
                      }}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                      {t.label}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      {/* ─── Page Content ───────────────────────────────────────────────── */}
      <main id="main-content" className="pt-16">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
          {activeTab === 'dashboard' && renderDashboardTab()}
          {activeTab === 'teams' && <AdminTeams />}
          {activeTab === 'scores' && <AdminScores />}
          {activeTab === 'judges' && <AdminJudges />}
          {activeTab === 'transactions' && <AdminTransactions />}
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
