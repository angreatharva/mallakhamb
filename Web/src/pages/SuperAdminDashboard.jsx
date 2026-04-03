import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Shield, Users, UserCheck, ShieldHalf, Target, Menu, Activity,
  X, LogOut, LayoutDashboard, Settings, Users2, Trophy, Gavel,
  ReceiptIndianRupee, TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import toast from 'react-hot-toast';
import { superAdminAPI } from '../services/api';
import { useResponsive } from '../hooks/useResponsive';
import { useRouteContext } from '../contexts/RouteContext';
import AdminTeams from './AdminTeams';
import AdminScores from './AdminScores';
import AdminJudges from './AdminJudges';
import SuperAdminManagement from './SuperAdminManagement';
import AdminTransactions from './AdminTransactions';
import { ADMIN_COLORS, ADMIN_EASE_OUT, ADMIN_SPRING } from './adminTheme';
import BHALogo from '../assets/BHA.png';

// ─── Reduced-motion hook ──────────────────────────────────────────────────────
const useReducedMotion = () => {
  const [r, setR] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const h = (e) => setR(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return r;
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
const GradientText = ({ children, className = '' }) => (
  <span className={className} style={{
    background: `linear-gradient(135deg, ${ADMIN_COLORS.saffron}, ${ADMIN_COLORS.gold}, ${ADMIN_COLORS.saffronLight})`,
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
  }}>{children}</span>
);

// ─── DarkCard ─────────────────────────────────────────────────────────────────
const DarkCard = ({ children, className = '', style = {}, hover = false }) => (
  <motion.div
    className={`rounded-2xl border ${className}`}
    style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle, ...style }}
    whileHover={hover ? { borderColor: `${ADMIN_COLORS.saffron}30`, boxShadow: `0 8px 32px ${ADMIN_COLORS.saffron}08` } : {}}
    transition={{ duration: 0.2 }}>
    {children}
  </motion.div>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, color, delay = 0, subtitle }) => (
  <FadeIn delay={delay}>
    <DarkCard hover className="p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}18` }}>
        <Icon className="w-5 h-5" style={{ color }} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-white/40 text-xs tracking-wide uppercase truncate">{label}</p>
        <p className="text-2xl font-black text-white mt-0.5">{value ?? 0}</p>
        {subtitle && <p className="text-white/30 text-xs mt-0.5">{subtitle}</p>}
      </div>
    </DarkCard>
  </FadeIn>
);

// ─── Competition Stat Card ────────────────────────────────────────────────────
const CompStatCard = ({ label, value, color, delay = 0 }) => (
  <FadeIn delay={delay}>
    <div className="p-5 rounded-2xl border flex flex-col gap-1"
      style={{ background: `${color}08`, borderColor: `${color}25` }}>
      <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: `${color}CC` }}>{label}</p>
      <p className="text-3xl font-black" style={{ color }}>{value ?? 0}</p>
    </div>
  </FadeIn>
);

// ─── Nav tabs ─────────────────────────────────────────────────────────────────
const NAV_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'management', label: 'Management', icon: Settings },
  { id: 'teams', label: 'Teams', icon: Users2 },
  { id: 'scores', label: 'Scores', icon: Trophy },
  { id: 'judges', label: 'Judges', icon: Gavel },
  { id: 'transactions', label: 'Transactions', icon: ReceiptIndianRupee },
];

// ─── Main Component ───────────────────────────────────────────────────────────
const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const { tab } = useParams();
  const { isMobile } = useResponsive();
  const { routePrefix, storagePrefix } = useRouteContext();
  const reduced = useReducedMotion();

  const activeTab = tab || 'overview';
  const [systemStats, setSystemStats] = useState(null);
  const [competitionStats, setCompetitionStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [competitions, setCompetitions] = useState([]);
  const [selectedCompetition, setSelectedCompetition] = useState(null);

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
    if (activeTab === 'overview') {
      fetchCompetitions();
      fetchDashboardData();
    }
  }, [activeTab, selectedCompetition]);

  const fetchCompetitions = async () => {
    try {
      const response = await superAdminAPI.getAllCompetitions();
      setCompetitions(response.data.competitions || []);
    } catch {}
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const params = selectedCompetition ? { competitionId: selectedCompetition } : {};
      const [dashboardResponse, systemResponse] = await Promise.all([
        superAdminAPI.getDashboard(params),
        superAdminAPI.getSystemStats()
      ]);
      setSystemStats(systemResponse.data);
      setCompetitionStats(dashboardResponse.data.competitionStats);
    } catch (error) {
      if (error.response?.status === 401) toast.error('Authentication failed. Please login again.');
      else toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleTabNav = (tabId) => {
    navigate(tabId === 'overview' ? `${routePrefix}/dashboard` : `${routePrefix}/dashboard/${tabId}`);
    setMobileMenuOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem(`${storagePrefix}_token`);
    localStorage.removeItem(`${storagePrefix}_user`);
    navigate(`${routePrefix}/login`);
  };

  // ─── Overview Tab ──────────────────────────────────────────────────────────
  const renderOverviewTab = () => (
    <div className="space-y-8">
      {/* System Overview */}
      <div>
        <FadeIn>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-6 rounded-full" style={{ background: `linear-gradient(to bottom, ${ADMIN_COLORS.saffron}, ${ADMIN_COLORS.gold})` }} />
            <p className="text-xs font-bold tracking-widest uppercase" style={{ color: ADMIN_COLORS.saffron }}>
              System Overview — All Competitions
            </p>
          </div>
        </FadeIn>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard icon={Shield} label="Total Admins" value={systemStats?.stats?.users?.totalAdmins} color={ADMIN_COLORS.purple} delay={0} />
          <StatCard icon={UserCheck} label="Total Coaches" value={systemStats?.stats?.users?.totalCoaches} color={ADMIN_COLORS.blue} delay={0.05} />
          <StatCard icon={Users} label="Total Players" value={systemStats?.stats?.users?.totalPlayers} color={ADMIN_COLORS.green} delay={0.1} />
          <StatCard icon={ShieldHalf} label="Total Teams" value={systemStats?.stats?.content?.totalTeams} color={ADMIN_COLORS.saffron} delay={0.15} />
          <StatCard icon={Target} label="Competitions" value={systemStats?.stats?.content?.totalCompetitions} color="#EC4899" delay={0.2} />
          <StatCard icon={Activity} label="Active Judges" value={systemStats?.stats?.content?.totalJudges} color={ADMIN_COLORS.gold} delay={0.25} />
        </div>
      </div>

      {/* Competition Statistics */}
      <FadeIn delay={0.1}>
        <DarkCard className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${ADMIN_COLORS.saffron}18` }}>
                <TrendingUp className="w-5 h-5" style={{ color: ADMIN_COLORS.saffron }} />
              </div>
              <div>
                <p className="text-xs font-bold tracking-widest uppercase" style={{ color: ADMIN_COLORS.saffron }}>Competition Stats</p>
                <h3 className="text-xl font-black text-white">Participation Breakdown</h3>
              </div>
            </div>
            <div className="md:w-64">
              <select
                value={selectedCompetition || ''}
                onChange={(e) => setSelectedCompetition(e.target.value || null)}
                className="w-full rounded-xl text-sm text-white outline-none min-h-[44px] px-3 transition-all duration-200"
                style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${ADMIN_COLORS.darkBorderMid}` }}
                aria-label="Filter by competition"
              >
                <option value="" style={{ background: ADMIN_COLORS.darkCard }}>All Competitions</option>
                {competitions.map((comp) => (
                  <option key={comp._id} value={comp._id} style={{ background: ADMIN_COLORS.darkCard }}>
                    {comp.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <CompStatCard label="Total Teams" value={competitionStats?.totalTeams} color={ADMIN_COLORS.purple} delay={0} />
            <CompStatCard label="Total Participants" value={competitionStats?.totalParticipants} color={ADMIN_COLORS.saffron} delay={0.05} />
            <CompStatCard label="Boys Teams" value={competitionStats?.boysTeams} color={ADMIN_COLORS.blue} delay={0.1} />
            <CompStatCard label="Girls Teams" value={competitionStats?.girlsTeams} color="#EC4899" delay={0.15} />
            <CompStatCard label="Total Boys" value={competitionStats?.totalBoys} color={ADMIN_COLORS.blue} delay={0.2} />
            <CompStatCard label="Total Girls" value={competitionStats?.totalGirls} color="#EC4899" delay={0.25} />
          </div>

          {!selectedCompetition && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <CompStatCard label="Total Competitions" value={competitionStats?.totalCompetitions} color={ADMIN_COLORS.gold} delay={0.3} />
              <CompStatCard label="Active Competitions" value={competitionStats?.activeCompetitions} color={ADMIN_COLORS.green} delay={0.35} />
            </div>
          )}
        </DarkCard>
      </FadeIn>
    </div>
  );

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading && activeTab === 'overview') {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: ADMIN_COLORS.dark }}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-white/10 rounded-full mx-auto mb-4"
            style={{ borderTopColor: ADMIN_COLORS.saffron, animation: 'spin 0.8s linear infinite' }} />
          <p className="text-white/40 text-sm">Loading super admin dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh" style={{ background: ADMIN_COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
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
        transition={{ duration: 0.5, ease: 'easeOut' }}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src={BHALogo} alt="BHA" className="h-8 w-auto object-contain" />
            <div className="hidden sm:block">
              <p className="text-xs font-bold tracking-widest uppercase leading-none" style={{ color: ADMIN_COLORS.saffron }}>
                Super Admin
              </p>
              <p className="text-white text-sm font-bold leading-tight">Dashboard</p>
            </div>
          </div>

          {/* Desktop Tabs */}
          {!isMobile && (
            <nav className="flex items-center gap-1" aria-label="Super admin navigation">
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
                    aria-current={isActive ? 'page' : undefined}>
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 rounded-lg"
                        style={{ background: `${ADMIN_COLORS.saffron}20`, border: `1px solid ${ADMIN_COLORS.saffron}30` }}
                        layoutId="superAdminActiveTab"
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

          {/* Right: Role badge + Logout + Mobile menu */}
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: `${ADMIN_COLORS.saffron}18`, color: ADMIN_COLORS.saffronLight, border: `1px solid ${ADMIN_COLORS.saffron}30` }}>
              <Shield className="w-3 h-3" aria-hidden="true" />
              Super Admin
            </span>
            <motion.button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold min-h-[36px] transition-colors duration-200"
              style={{ color: 'rgba(255,255,255,0.5)', border: `1px solid ${ADMIN_COLORS.darkBorderSubtle}` }}
              whileHover={{ color: ADMIN_COLORS.red, borderColor: `${ADMIN_COLORS.red}40` }}
              aria-label="Logout">
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Logout</span>
            </motion.button>
            {isMobile && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/10 transition-colors"
                style={{ color: 'rgba(255,255,255,0.7)' }}
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}>
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
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
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
                        background: isActive ? `${ADMIN_COLORS.saffron}18` : 'transparent',
                        color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                        border: `1px solid ${isActive ? ADMIN_COLORS.saffron + '30' : 'transparent'}`,
                      }}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}>
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
          {activeTab === 'overview' && renderOverviewTab()}
          {activeTab === 'management' && <SuperAdminManagement />}
          {activeTab === 'teams' && <AdminTeams routePrefix={routePrefix} storagePrefix={storagePrefix} />}
          {activeTab === 'scores' && <AdminScores routePrefix={routePrefix} storagePrefix={storagePrefix} />}
          {activeTab === 'judges' && <AdminJudges routePrefix={routePrefix} storagePrefix={storagePrefix} />}
          {activeTab === 'transactions' && <AdminTransactions />}
        </div>
      </main>
    </div>
  );
};

export default SuperAdminDashboard;
