import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ShieldHalf, Mars, Users, Venus, Target, Award, Shield,
  Menu, X, LogOut, Play, CheckCircle, XCircle, LayoutDashboard,
  Users2, Trophy, Gavel, ReceiptIndianRupee, Settings, Activity,
  TrendingUp, UserCheck
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '../../services/api';
import { CompetitionProvider } from '../../contexts/CompetitionContext';
import CompetitionDisplay from '../../components/CompetitionDisplay';
import CompetitionSelector from '../../components/CompetitionSelector';
import { useResponsive } from '../../hooks/useResponsive';
import { useRouteContext } from '../../contexts/RouteContext';
import AdminTeams from '../admin/AdminTeams';
import AdminScores from '../admin/AdminScores';
import AdminJudges from '../admin/AdminJudges';
import AdminTransactions from '../admin/AdminTransactions';
import SuperAdminManagement from '../superadmin/SuperAdminManagement';
import { useCompetition } from '../../contexts/CompetitionContext';
import { useAgeGroupValues } from '../../hooks/useAgeGroups';
import { logger } from '../../utils/logger';
import ConfirmDialog from '../../components/ConfirmDialog';
import BHALogo from '../../assets/BHA.png';

// Design system imports
import { useTheme } from '../../components/design-system/theme/useTheme';
import { DarkCard } from '../../components/design-system/cards/DarkCard';
import { StatCard } from '../../components/design-system/cards/StatCard';
import { FadeIn } from '../../components/design-system/animations/FadeIn';
import { useReducedMotion } from '../../components/design-system/animations/useReducedMotion';

// ─── Age group label helper ───────────────────────────────────────────────────
const ageLabel = (ag) => ({
  Under10: 'Under 10', Under12: 'Under 12', Under14: 'Under 14',
  Under16: 'Under 16', Under18: 'Under 18', Above16: 'Above 16', Above18: 'Above 18',
}[ag] || ag);

const compLabel = (ct) => ({
  competition_1: 'Competition I', competition_2: 'Competition II', competition_3: 'Competition III',
}[ct] || ct);

// ─── Judges Summary Card ──────────────────────────────────────────────────────
const JudgeGroupCard = ({ item, startingCompTypes, onStart, loadingJudgesSummary }) => (
  <DarkCard className="p-4">
    <p className="font-bold text-white text-sm mb-3">{ageLabel(item.ageGroup)}</p>
    <div className="space-y-2">
      {item.competitionTypes && Object.entries(item.competitionTypes)
        .sort(([a], [b]) => ({ competition_1: 1, competition_2: 2, competition_3: 3 }[a] - { competition_1: 1, competition_2: 2, competition_3: 3 }[b]))
        .map(([compType, data]) => {
          const key = `${item.gender}_${item.ageGroup}_${compType}`;
          const isStarting = startingCompTypes[key] || false;
          const judgeNames = data.judges?.map(j => j.name).join(', ') || 'No judges assigned';
          const statusColor = data.isStarted ? '#3B82F6' : data.hasMinimumJudges ? '#22C55E' : '#EF4444';
          
          return (
            <div key={compType} className="rounded-xl p-3 border"
              style={{
                background: `${statusColor}10`,
                borderColor: `${statusColor}30`,
              }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{compLabel(compType)}</span>
                  {data.isStarted
                    ? <span className="px-2 py-0.5 text-xs font-bold rounded-full" style={{ background: `${statusColor}30`, color: statusColor }}>Started</span>
                    : data.hasMinimumJudges
                      ? <CheckCircle className="w-3.5 h-3.5" style={{ color: statusColor }} />
                      : <XCircle className="w-3.5 h-3.5" style={{ color: statusColor }} />}
                </div>
                {!data.isStarted && (
                  <motion.button
                    onClick={() => onStart(item.gender, item.ageGroup, compType)}
                    disabled={isStarting || !data.hasMinimumJudges || loadingJudgesSummary}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 min-h-[32px] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    style={{ background: data.hasMinimumJudges ? '#22C55E' : 'rgba(255,255,255,0.05)', color: '#fff' }}
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

// ─── Competition Stat Card (for SuperAdmin) ───────────────────────────────────
const CompStatCard = ({ label, value, color, delay = 0 }) => (
  <FadeIn delay={delay}>
    <div className="p-5 rounded-2xl border flex flex-col gap-1"
      style={{ background: `${color}08`, borderColor: `${color}25` }}>
      <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: `${color}CC` }}>{label}</p>
      <p className="text-3xl font-black" style={{ color }}>{value ?? 0}</p>
    </div>
  </FadeIn>
);

/**
 * UnifiedDashboard - A unified dashboard component that adapts to admin and superadmin roles
 * 
 * Features:
 * - Auto-detects role from route context
 * - Role-specific theming via ThemeProvider
 * - Conditional rendering for admin vs superadmin views
 * - Integrates with design system components
 * 
 * @param {Object} props
 * @param {string} props.routePrefix - Route prefix override (optional)
 * 
 * **Validates: Requirements 7.1, 7.5**
 */
const UnifiedDashboard = ({ routePrefix: routePrefixProp }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tab } = useParams();
  const { isMobile } = useResponsive();
  useReducedMotion(); // Initialize for accessibility
  const theme = useTheme();

  const contextValue = useRouteContext();
  const routePrefix = routePrefixProp || contextValue.routePrefix;
  const storagePrefix = contextValue.storagePrefix;
  
  // Detect role from route
  const isSuperAdmin = routePrefix === '/superadmin' || location.pathname.includes('/superadmin');
  const api = isSuperAdmin ? superAdminAPI : adminAPI;

  const activeTab = tab || (isSuperAdmin ? 'overview' : 'dashboard');
  
  // State management
  const [stats, setStats] = useState(null);
  const [systemStats, setSystemStats] = useState(null);
  const [competitionStats, setCompetitionStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [judgesSummary, setJudgesSummary] = useState([]);
  const [loadingJudgesSummary, setLoadingJudgesSummary] = useState(false);
  const [startingCompTypes, setStartingCompTypes] = useState({});
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
  const [competitions, setCompetitions] = useState([]);
  const [selectedCompetition, setSelectedCompetition] = useState(null);

  const { currentCompetition } = useCompetition();
  const maleAgeGroupValues = useAgeGroupValues('Male');
  const femaleAgeGroupValues = useAgeGroupValues('Female');

  // Nav tabs configuration - role-specific
  const NAV_TABS = isSuperAdmin ? [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'management', label: 'Management', icon: Settings },
    { id: 'teams', label: 'Teams', icon: Users2 },
    { id: 'scores', label: 'Scores', icon: Trophy },
    { id: 'judges', label: 'Judges', icon: Gavel },
    { id: 'transactions', label: 'Transactions', icon: ReceiptIndianRupee },
  ] : [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'teams', label: 'Teams', icon: Users2 },
    { id: 'scores', label: 'Scores', icon: Trophy },
    { id: 'judges', label: 'Judges', icon: Gavel },
    { id: 'transactions', label: 'Transactions', icon: ReceiptIndianRupee },
  ];

  // Scroll handler
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Mobile menu body scroll lock
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  // Fetch data based on active tab
  useEffect(() => {
    if (isSuperAdmin && activeTab === 'overview') {
      fetchCompetitions();
      fetchSuperAdminData();
    } else if (!isSuperAdmin && activeTab === 'dashboard') {
      fetchAdminDashboardData();
      fetchJudgesSummary();
    }
  }, [activeTab, selectedCompetition, isSuperAdmin]);

  const fetchCompetitions = async () => {
    try {
      const response = await superAdminAPI.getAllCompetitions();
      setCompetitions(response.data.competitions || []);
    } catch (error) {
      logger.error('Failed to fetch competitions:', error);
    }
  };

  const fetchSuperAdminData = async () => {
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
      if (error.response?.status === 401) {
        toast.error('Authentication failed. Please login again.');
      } else {
        toast.error('Failed to load dashboard data');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminDashboardData = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getDashboard();
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

  const handleLogout = () => {
    localStorage.removeItem(`${storagePrefix}_token`);
    localStorage.removeItem(`${storagePrefix}_user`);
    navigate(`${routePrefix}/login`);
  };

  const handleTabNav = (tabId) => {
    const baseRoute = isSuperAdmin ? 'overview' : 'dashboard';
    navigate(tabId === baseRoute ? `${routePrefix}/dashboard` : `${routePrefix}/dashboard/${tabId}`);
    setMobileMenuOpen(false);
  };

  // ─── Admin Dashboard Tab ──────────────────────────────────────────────────
  const renderAdminDashboard = () => (
    <div className="space-y-8">
      {/* Competition Display */}
      <FadeIn>
        <CompetitionProvider userType={storagePrefix}>
          <div className="rounded-2xl border p-4 md:p-6"
            style={{ background: theme.colors.card, borderColor: theme.colors.border }}>
            <CompetitionDisplay />
          </div>
        </CompetitionProvider>
      </FadeIn>

      {/* Stats Grid */}
      <div>
        <FadeIn>
          <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: theme.colors.primary }}>
            Overview
          </p>
        </FadeIn>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard icon={ShieldHalf} label="Total Teams" value={stats?.totalTeams} color="#8B5CF6" delay={0} />
          <StatCard icon={Users} label="Total Participants" value={stats?.totalParticipants} color={theme.colors.primary} delay={0.05} />
          <StatCard icon={Mars} label="Boys Teams" value={stats?.boysTeams} color="#3B82F6" delay={0.1} />
          <StatCard icon={Venus} label="Girls Teams" value={stats?.girlsTeams} color="#EC4899" delay={0.15} />
          <StatCard icon={Target} label="Total Boys" value={stats?.totalBoys} color="#3B82F6" delay={0.2} />
          <StatCard icon={Target} label="Total Girls" value={stats?.totalGirls} color="#EC4899" delay={0.25} />
        </div>
      </div>

      {/* Judges Assignment Status */}
      {currentCompetition && (
        <FadeIn delay={0.1}>
          <div className="rounded-2xl border p-6"
            style={{ background: theme.colors.card, borderColor: theme.colors.border }}>
            <div className="mb-6">
              <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: theme.colors.primary }}>
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
                  style={{ borderTopColor: theme.colors.primary }} />
                <span className="text-white/40 text-sm">Loading judges summary…</span>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Boys */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Mars className="w-4 h-4" style={{ color: '#3B82F6' }} />
                    <span className="text-sm font-bold text-white/70 tracking-wide uppercase">Boys Age Groups</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {judgesSummary
                      .filter(item => item.gender === 'Male' && maleAgeGroupValues.includes(item.ageGroup))
                      .map(item => (
                        <JudgeGroupCard key={`male-${item.ageGroup}`} item={item}
                          genderColor="#3B82F6" startingCompTypes={startingCompTypes}
                          onStart={handleStartCompetitionType} loadingJudgesSummary={loadingJudgesSummary}
                          theme={theme} />
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
                          onStart={handleStartCompetitionType} loadingJudgesSummary={loadingJudgesSummary}
                          theme={theme} />
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

  // ─── SuperAdmin Overview Tab ──────────────────────────────────────────────
  const renderSuperAdminOverview = () => (
    <div className="space-y-8">
      {/* System Overview */}
      <div>
        <FadeIn>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-6 rounded-full" style={{ background: `linear-gradient(to bottom, ${theme.colors.primary}, ${theme.colors.primaryDark})` }} />
            <p className="text-xs font-bold tracking-widest uppercase" style={{ color: theme.colors.primary }}>
              System Overview — All Competitions
            </p>
          </div>
        </FadeIn>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard icon={Shield} label="Total Admins" value={systemStats?.stats?.users?.totalAdmins} color="#8B5CF6" delay={0} />
          <StatCard icon={UserCheck} label="Total Coaches" value={systemStats?.stats?.users?.totalCoaches} color="#3B82F6" delay={0.05} />
          <StatCard icon={Users} label="Total Players" value={systemStats?.stats?.users?.totalPlayers} color="#22C55E" delay={0.1} />
          <StatCard icon={ShieldHalf} label="Total Teams" value={systemStats?.stats?.content?.totalTeams} color={theme.colors.primary} delay={0.15} />
          <StatCard icon={Target} label="Competitions" value={systemStats?.stats?.content?.totalCompetitions} color="#EC4899" delay={0.2} />
          <StatCard icon={Activity} label="Active Judges" value={systemStats?.stats?.content?.totalJudges} color="#F5A623" delay={0.25} />
        </div>
      </div>

      {/* Competition Statistics */}
      <FadeIn delay={0.1}>
        <DarkCard className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${theme.colors.primary}18` }}>
                <TrendingUp className="w-5 h-5" style={{ color: theme.colors.primary }} />
              </div>
              <div>
                <p className="text-xs font-bold tracking-widest uppercase" style={{ color: theme.colors.primary }}>Competition Stats</p>
                <h3 className="text-xl font-black text-white">Participation Breakdown</h3>
              </div>
            </div>
            <div className="md:w-64">
              <select
                value={selectedCompetition || ''}
                onChange={(e) => setSelectedCompetition(e.target.value || null)}
                className="w-full rounded-xl text-sm text-white outline-none min-h-[44px] px-3 transition-all duration-200"
                style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${theme.colors.border}` }}
                aria-label="Filter by competition"
              >
                <option value="" style={{ background: theme.colors.card }}>All Competitions</option>
                {competitions.map((comp) => (
                  <option key={comp._id} value={comp._id} style={{ background: theme.colors.card }}>
                    {comp.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <CompStatCard label="Total Teams" value={competitionStats?.totalTeams} color="#8B5CF6" delay={0} />
            <CompStatCard label="Total Participants" value={competitionStats?.totalParticipants} color={theme.colors.primary} delay={0.05} />
            <CompStatCard label="Boys Teams" value={competitionStats?.boysTeams} color="#3B82F6" delay={0.1} />
            <CompStatCard label="Girls Teams" value={competitionStats?.girlsTeams} color="#EC4899" delay={0.15} />
            <CompStatCard label="Total Boys" value={competitionStats?.totalBoys} color="#3B82F6" delay={0.2} />
            <CompStatCard label="Total Girls" value={competitionStats?.totalGirls} color="#EC4899" delay={0.25} />
          </div>

          {!selectedCompetition && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <CompStatCard label="Total Competitions" value={competitionStats?.totalCompetitions} color="#F5A623" delay={0.3} />
              <CompStatCard label="Active Competitions" value={competitionStats?.activeCompetitions} color="#22C55E" delay={0.35} />
            </div>
          )}
        </DarkCard>
      </FadeIn>
    </div>
  );

  // Placeholder for tab content - will be implemented in subsequent tasks
  const renderTabContent = () => {
    if (isSuperAdmin) {
      switch (activeTab) {
        case 'overview':
          return renderSuperAdminOverview();
        case 'management':
          return <SuperAdminManagement />;
        case 'teams':
          return <AdminTeams routePrefix={routePrefix} storagePrefix={storagePrefix} />;
        case 'scores':
          return <AdminScores routePrefix={routePrefix} storagePrefix={storagePrefix} />;
        case 'judges':
          return <AdminJudges routePrefix={routePrefix} storagePrefix={storagePrefix} />;
        case 'transactions':
          return <AdminTransactions />;
        default:
          return null;
      }
    } else {
      switch (activeTab) {
        case 'dashboard':
          return renderAdminDashboard();
        case 'teams':
          return <AdminTeams />;
        case 'scores':
          return <AdminScores />;
        case 'judges':
          return <AdminJudges />;
        case 'transactions':
          return <AdminTransactions />;
        default:
          return null;
      }
    }
  };

  // Loading state
  if (loading && (activeTab === 'dashboard' || activeTab === 'overview')) {
    return (
      <div className="min-h-dvh flex items-center justify-center"
        style={{ background: theme.colors.background }}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-white/10 rounded-full mx-auto mb-4"
            style={{ borderTopColor: theme.colors.primary, animation: 'spin 0.8s linear infinite' }} />
          <p className="text-white/40 text-sm">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh" style={{ background: theme.colors.background, fontFamily: "'Inter', system-ui, sans-serif" }}>
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
          borderBottom: `1px solid ${scrolled ? theme.colors.borderBright : theme.colors.border}`,
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
                style={{ color: theme.colors.primary }}>
                {isSuperAdmin ? 'Super Admin' : 'Admin'}
              </p>
              <p className="text-white text-sm font-bold leading-tight">Dashboard</p>
            </div>
          </div>

          {/* Center: Desktop Tabs */}
          {!isMobile && (
            <nav className="flex items-center gap-1" aria-label={`${isSuperAdmin ? 'Super admin' : 'Admin'} navigation`}>
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
                        style={{ background: `${theme.colors.primary}20`, border: `1px solid ${theme.colors.primary}30` }}
                        layoutId={`activeTab-${isSuperAdmin ? 'superadmin' : 'admin'}`}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
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
            {!isSuperAdmin && (
              <CompetitionProvider userType={storagePrefix}>
                <CompetitionSelector userType={storagePrefix} />
              </CompetitionProvider>
            )}

            {isSuperAdmin && (
              <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: `${theme.colors.primary}18`, color: theme.colors.primary, border: `1px solid ${theme.colors.primary}30` }}>
                <Shield className="w-3 h-3" aria-hidden="true" />
                Super Admin
              </span>
            )}

            <motion.button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold min-h-[36px] transition-colors duration-200"
              style={{ color: 'rgba(255,255,255,0.5)', border: `1px solid ${theme.colors.border}` }}
              whileHover={{ color: '#EF4444', borderColor: '#EF444440' }}
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
              style={{ background: 'rgba(10,10,10,0.98)', backdropFilter: 'blur(20px)', borderColor: theme.colors.borderBright }}
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
                        background: isActive ? `${theme.colors.primary}18` : 'transparent',
                        color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                        border: `1px solid ${isActive ? theme.colors.primary + '30' : 'transparent'}`,
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
          {renderTabContent()}
        </div>
      </main>
    </div>
  );
};

export default UnifiedDashboard;
