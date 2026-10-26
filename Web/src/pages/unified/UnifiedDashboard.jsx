import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Play } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '@/services/api';
import { useCompetition } from '../../contexts/CompetitionContext';
import { useAuth } from '../../contexts/AuthContext';
import CompetitionDisplay from '@/components/competition/CompetitionDisplay';
import CompetitionLockBanner from '@/components/competition/CompetitionLockBanner';
import CompetitionSelector from '@/components/competition/CompetitionSelector';
import Dropdown from '@/components/auth/Dropdown';
import { useRouteContext } from '../../contexts/RouteContext';
import { lazy, Suspense } from 'react';

const AdminTeams = lazy(() => import('../admin/AdminTeams'));
const AdminScores = lazy(() => import('../admin/AdminScores'));
const AdminJudges = lazy(() => import('../admin/AdminJudges'));
const AdminTransactions = lazy(() => import('../admin/AdminTransactions'));
const AdminLots = lazy(() => import('../admin/AdminLots'));
const WalkInDesk = lazy(() => import('../desk/WalkInDesk'));
const AdminJudgeFairness = lazy(() => import('../admin/AdminJudgeFairness'));
const SuperAdminManagement = lazy(() => import('../superadmin/SuperAdminManagement'));
import { useAgeGroupValues } from '../../hooks/useAgeGroups';
import { logger } from '@/infrastructure/logger';
import ConfirmDialog from '@/components/auth/ConfirmDialog';
import { Button, EmptyState, Heading, Panel, Stat, StatusTag, Tag } from '@/components/ui';
import { AppHeader } from '@/components/shell';

// ─── Age group label helper ───────────────────────────────────────────────────
const ageLabel = (ag) => ({
  Under10: 'Under 10', Under12: 'Under 12', Under14: 'Under 14',
  Under16: 'Under 16', Under18: 'Under 18', Above16: 'Above 16', Above18: 'Above 18',
}[ag] || ag);

const compLabel = (ct) => ({
  competition_1: 'Competition I', competition_2: 'Competition II', competition_3: 'Competition III',
}[ct] || ct);

// ─── Judges Summary Card ──────────────────────────────────────────────────────
// Used by the judges-assignment block, parked (commented out) in the admin tab;
// underscored while it is parked, so the lint knows it is kept on purpose.
const _JudgeGroupCard = ({ item, startingCompTypes, onStart, loadingJudgesSummary }) => (
  <Panel className="p-4">
    <p className="font-bold text-fg type-body-s mt-0 mb-3">{ageLabel(item.ageGroup)}</p>
    <div className="space-y-2">
      {item.competitionTypes && Object.entries(item.competitionTypes)
        .sort(([a], [b]) => ({ competition_1: 1, competition_2: 2, competition_3: 3 }[a] - { competition_1: 1, competition_2: 2, competition_3: 3 }[b]))
        .map(([compType, data]) => {
          const key = `${item.gender}_${item.ageGroup}_${compType}`;
          const isStarting = startingCompTypes[key] || false;
          const judgeNames = data.judges?.map(j => j.name).join(', ') || 'No judges assigned';
          const status = data.isStarted ? 'info' : data.hasMinimumJudges ? 'success' : 'danger';

          return (
            <div key={compType} className="squad-group">
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <div className="flex items-center gap-2">
                  <span className="type-caption font-bold text-fg">{compLabel(compType)}</span>
                  <StatusTag status={status}>
                    {data.isStarted ? 'Started' : data.hasMinimumJudges ? 'Ready' : 'Needs judges'}
                  </StatusTag>
                </div>
                {!data.isStarted && (
                  <Button size="sm" variant="line" icon={Play}
                    onClick={() => onStart(item.gender, item.ageGroup, compType)}
                    disabled={isStarting || !data.hasMinimumJudges || loadingJudgesSummary}>
                    {isStarting ? 'Starting…' : 'Start'}
                  </Button>
                )}
              </div>
              <p className="type-caption text-fg-muted m-0">
                Judges ({data.judges?.length || 0}): <span className="text-fg">{judgeNames}</span>
              </p>
            </div>
          );
        })}
    </div>
  </Panel>
);

// ─── A key number ─────────────────────────────────────────────────────────────
const StatPanel = ({ label, value }) => (
  <Panel className="ui-fade-in"><Stat label={label} value={value ?? 0} /></Panel>
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
  const [judgesSummary, setJudgesSummary] = useState([]);
  const [loadingJudgesSummary, setLoadingJudgesSummary] = useState(false);
  const [startingCompTypes, setStartingCompTypes] = useState({});
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
  const [competitions, setCompetitions] = useState([]);
  const [selectedCompetition, setSelectedCompetition] = useState(null);

  const { currentCompetition, assignedCompetitions, switchCompetition, clearCompetitionContext, isLoading: isCompetitionLoading } = useCompetition();
  const { logout } = useAuth();
  const maleAgeGroupValues = useAgeGroupValues('Male');
  const femaleAgeGroupValues = useAgeGroupValues('Female');
  // Apply ?competitionId= from login only once — never fight later dropdown switches
  const urlCompetitionHandledRef = useRef(false);

  const clearCompetitionIdFromUrl = useCallback(() => {
    const searchParams = new URLSearchParams(location.search);
    if (!searchParams.has('competitionId')) return;
    searchParams.delete('competitionId');
    const newSearch = searchParams.toString();
    navigate(`${location.pathname}${newSearch ? `?${newSearch}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  // Auto-select competition if user has only one, or handle URL parameter once
  useEffect(() => {
    const competitionIdFromUrl = new URLSearchParams(location.search).get('competitionId');

    logger.info('UnifiedDashboard competition check', {
      routePrefix,
      storagePrefix,
      isSuperAdmin,
      activeTab,
      pathname: location.pathname,
      competitionIdFromUrl,
      hasCurrentCompetition: !!currentCompetition,
      currentCompetitionId: currentCompetition?._id,
      assignedCompetitionsCount: assignedCompetitions?.length || 0,
      urlHandled: urlCompetitionHandledRef.current,
    });

    // Skip for superadmin as they don't use competition context
    if (isSuperAdmin) return;

    // URL still has a competitionId but the user already switched away via the dropdown —
    // strip the stale query param so it cannot overwrite the new selection.
    if (
      competitionIdFromUrl &&
      currentCompetition &&
      String(currentCompetition._id) !== String(competitionIdFromUrl)
    ) {
      clearCompetitionIdFromUrl();
      urlCompetitionHandledRef.current = true;
      return;
    }

    // Apply URL competition at most once (post-login handoff)
    if (competitionIdFromUrl && assignedCompetitions?.length > 0 && !urlCompetitionHandledRef.current) {
      urlCompetitionHandledRef.current = true;
      const competition = assignedCompetitions.find(
        (c) => String(c._id) === String(competitionIdFromUrl)
      );

      if (competition && (!currentCompetition || String(currentCompetition._id) !== String(competitionIdFromUrl))) {
        logger.info('Setting competition from URL parameter', {
          competitionId: competitionIdFromUrl,
          competitionName: competition.name,
        });
        switchCompetition(competitionIdFromUrl)
          .catch((error) => {
            logger.error('Failed to set competition from URL:', error);
          })
          .finally(() => {
            clearCompetitionIdFromUrl();
          });
        return;
      }

      // Already on the right competition — just clean the URL
      clearCompetitionIdFromUrl();
      return;
    }

    // Auto-select if user has exactly one competition and none is currently selected
    if (!currentCompetition && assignedCompetitions?.length === 1) {
      const competition = assignedCompetitions[0];
      logger.info('Auto-selecting single assigned competition', {
        competitionId: competition._id,
        competitionName: competition.name,
      });
      switchCompetition(competition._id).catch((error) => {
        logger.error('Failed to auto-select competition:', error);
      });
    }
  }, [
    location.search,
    assignedCompetitions,
    currentCompetition,
    switchCompetition,
    isSuperAdmin,
    clearCompetitionIdFromUrl,
    routePrefix,
    storagePrefix,
    activeTab,
    location.pathname,
  ]);

  // Nav tabs configuration - role-specific
  const NAV_TABS = isSuperAdmin ? [
    { id: 'overview', label: 'Overview' },
    { id: 'management', label: 'Management' },
    { id: 'teams', label: 'Teams' },
    { id: 'lots', label: 'Lots' },
    { id: 'scores', label: 'Scores' },
    { id: 'judges', label: 'Judges' },
    { id: 'fairness', label: 'Fairness' },
    { id: 'transactions', label: 'Transactions' },
    // Competition-day registration from a paper form (pages/desk).
    { id: 'desk', label: 'Walk-in' },
  ] : [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'teams', label: 'Teams' },
    { id: 'lots', label: 'Lots' },
    { id: 'scores', label: 'Scores' },
    { id: 'judges', label: 'Judges' },
    { id: 'fairness', label: 'Fairness' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'desk', label: 'Walk-in' },
  ];
  // The tabs are links (TabNav): the base tab is the dashboard route itself.
  const baseTab = isSuperAdmin ? 'overview' : 'dashboard';
  const navItems = NAV_TABS.map((t) => ({
    to: t.id === baseTab ? `${routePrefix}/dashboard` : `${routePrefix}/dashboard/${t.id}`,
    label: t.label,
    end: t.id === baseTab,
  }));

  // Fetch data based on active tab
  useEffect(() => {
    logger.info('Dashboard useEffect triggered', { 
      activeTab, 
      isSuperAdmin, 
      hasCurrentCompetition: !!currentCompetition,
      currentCompetitionId: currentCompetition?._id,
      currentCompetitionName: currentCompetition?.name
    });

    if (isSuperAdmin && activeTab === 'overview') {
      fetchCompetitions();
      fetchSuperAdminData();
    } else if (!isSuperAdmin && activeTab === 'dashboard') {
      if (currentCompetition) {
        logger.info('Fetching admin dashboard data for competition', { competitionId: currentCompetition._id });
        fetchAdminDashboardData();
        fetchJudgesSummary();
      } else {
        logger.warn('Dashboard tab active but no currentCompetition set');
        setLoading(false);
      }
    } else {
      // Other tabs don't need loading state
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedCompetition, isSuperAdmin, currentCompetition?._id]);

  const fetchCompetitions = async () => {
    try {
      const response = await superAdminAPI.getAllCompetitions();
      // Handle nested response structure: {success: true, data: [competitions array]}
      const responseData = response.data.data || response.data;
      // If responseData is already an array, use it; otherwise try to get competitions property
      const competitionsArray = Array.isArray(responseData) ? responseData : (responseData.competitions || []);
      setCompetitions(competitionsArray);
      logger.info('Fetched competitions:', competitionsArray);
    } catch (error) {
      logger.error('Failed to fetch competitions:', error);
      toast.error('Failed to load competitions');
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
      // Handle nested response structure
      const systemData = systemResponse.data.data || systemResponse.data;
      const dashboardData = dashboardResponse.data.data || dashboardResponse.data;
      setSystemStats(systemData);
      setCompetitionStats(dashboardData.competitionStats || dashboardData);
      logger.info('Fetched superadmin data:', { systemData, dashboardData });
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error('Authentication failed. Please login again.');
      } else {
        toast.error('Failed to load dashboard data');
      }
      logger.error('Failed to fetch superadmin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminDashboardData = async () => {
    if (!currentCompetition) {
      logger.warn('fetchAdminDashboardData called without currentCompetition');
      setLoading(false);
      return;
    }

    setLoading(true);
    // Clear previous stats to show loading state
    setStats(null);
    try {
      logger.info('Fetching admin dashboard data', { competitionId: currentCompetition._id });
      const response = await adminAPI.getDashboard();
      // Handle nested response structure
      const responseData = response.data.data || response.data;
      setStats(responseData.stats || responseData);
      logger.info('Admin dashboard data loaded successfully', { stats: responseData.stats || responseData });
    } catch (error) {
      logger.error('Failed to fetch admin dashboard data', { error: error.message, response: error.response?.data });
      if (error.response?.status === 401) {
        toast.error('Authentication failed. Please login again.');
      } else if (error.response?.status === 400 && error.response?.data?.error?.code === 'COMPETITION_CONTEXT_REQUIRED') {
        toast.error('Please select a competition first');
      } else {
        toast.error(error.response?.data?.error?.message || 'Failed to load dashboard stats');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchJudgesSummary = async () => {
    if (!currentCompetition) {
      logger.warn('fetchJudgesSummary called without currentCompetition');
      return;
    }
    
    setLoadingJudgesSummary(true);
    // Clear previous summary to show loading state
    setJudgesSummary([]);
    try {
      logger.info('Fetching judges summary', { competitionId: currentCompetition._id });
      const response = await api.getAllJudgesSummary();
      // Handle nested response structure: {success: true, data: {summary: [...], totalJudges: 3, ...}}
      const responseData = response.data.data || response.data;
      const summary = responseData.summary || [];
      setJudgesSummary(summary);
      logger.info('Judges summary loaded successfully', { count: summary.length });
    } catch (error) {
      logger.error('Failed to fetch judges summary:', error);
    } finally {
      setLoadingJudgesSummary(false);
    }
  };

  // Parked with the judges-assignment block (see _JudgeGroupCard).
  const _handleStartCompetitionType = async (gender, ageGroup, competitionType) => {
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

  const handleLogout = async () => {
    clearCompetitionContext?.();
    await logout(navigate);
  };

  // ─── Admin Dashboard Tab ──────────────────────────────────────────────────
  const renderAdminDashboard = () => (
    <div className="space-y-8">
      <CompetitionDisplay />

      {/* Stats Grid */}
      <div className="grid gap-4">
        <Tag tone="accent" className="justify-self-start">Overview</Tag>
        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] md:grid-cols-3 gap-4">
          <StatPanel label="Total Teams" value={stats?.totalTeams} />
          <StatPanel label="Total Participants" value={stats?.totalParticipants} />
          <StatPanel label="Boys Teams" value={stats?.boysTeams} />
          <StatPanel label="Girls Teams" value={stats?.girlsTeams} />
          <StatPanel label="Total Boys" value={stats?.totalBoys} />
          <StatPanel label="Total Girls" value={stats?.totalGirls} />
        </div>
      </div>

      {/* Judges Assignment Status */}
      
      {/*currentCompetition && (
        <FadeIn delay={0.1}>
          <div className="rounded-2xl border p-6"
            style={{ background: theme.colors.card, borderColor: theme.colors.border }}>
            <div className="mb-6">
              <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: FG.accent }}>
                Competition Control
              </p>
              <h3 className="text-xl font-black text-ink">Judges Assignment Status</h3>
              <p className="text-fg-muted text-sm mt-1">
                Each competition type needs at least 3 judges to start. Once started, judges cannot be modified.
              </p>
            </div>

            {loadingJudgesSummary ? (
              <div className="flex items-center justify-center py-12 gap-3">
                <div className="w-5 h-5 border-2 border-ink/20 border-t-saffron rounded-full animate-spin"
                  style={{ borderTopColor: theme.colors.primary }} />
                <span className="text-fg-muted text-sm">Loading judges summary…</span>
              </div>
            ) : (
              <div className="space-y-8">
                //Boys
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Mars className="w-4 h-4" style={{ color: DATA_COLORS.blue }} />
                    <span className="text-sm font-bold text-ink/70 tracking-wide uppercase">Boys Age Groups</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {judgesSummary
                      .filter(item => item.gender === 'Male' && maleAgeGroupValues.includes(item.ageGroup))
                      .map(item => (
                        <_JudgeGroupCard key={`male-${item.ageGroup}`} item={item}
                          genderColor={DATA_COLORS.blue} startingCompTypes={startingCompTypes}
                          onStart={_handleStartCompetitionType} loadingJudgesSummary={loadingJudgesSummary}
                          theme={theme} />
                      ))}
                  </div>
                </div>
                //Girls
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Venus className="w-4 h-4" style={{ color: DATA_COLORS.pink }} />
                    <span className="text-sm font-bold text-ink/70 tracking-wide uppercase">Girls Age Groups</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {judgesSummary
                      .filter(item => item.gender === 'Female' && femaleAgeGroupValues.includes(item.ageGroup))
                      .map(item => (
                        <_JudgeGroupCard key={`female-${item.ageGroup}`} item={item}
                          genderColor={DATA_COLORS.pink} startingCompTypes={startingCompTypes}
                          onStart={_handleStartCompetitionType} loadingJudgesSummary={loadingJudgesSummary}
                          theme={theme} />
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </FadeIn>
      )*/}

    </div>
  );

  // ─── SuperAdmin Overview Tab ──────────────────────────────────────────────
  const renderSuperAdminOverview = () => (
    <div className="space-y-8">
      {/* System Overview */}
      <div className="grid gap-4">
        <Tag tone="accent" className="justify-self-start whitespace-normal">System Overview — All Competitions</Tag>
        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] md:grid-cols-4 gap-4">
          <StatPanel label="Total Admins" value={systemStats?.admins} />
          <StatPanel label="Total Coaches" value={systemStats?.coaches} />
          <StatPanel label="Total Teams" value={systemStats?.teams} />
          <StatPanel label="Competitions" value={systemStats?.competitions} />
        </div>
      </div>

      {/* Competition Statistics */}
      <Panel variant="feature" className="ui-fade-in">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div className="grid gap-2">
            <Tag tone="accent" className="justify-self-start">Competition Stats</Tag>
            <Heading level={2} step="display-s">Participation Breakdown</Heading>
          </div>
          <div className="md:w-64">
            <Dropdown
              options={competitions.map(comp => ({
                value: comp._id,
                label: `${comp.name} (${comp.year}) — ${comp.place}`
              }))}
              value={selectedCompetition ? {
                value: selectedCompetition,
                label: (() => {
                  const comp = competitions.find(c => c._id === selectedCompetition);
                  return comp ? `${comp.name} (${comp.year}) — ${comp.place}` : '';
                })()
              } : null}
              onChange={(option) => setSelectedCompetition(option ? option.value : null)}
              placeholder="All Competitions"
            />
          </div>
        </div>

        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] md:grid-cols-3 gap-4">
          <StatPanel label="Total Teams" value={competitionStats?.totalTeams} />
          <StatPanel label="Total Participants" value={competitionStats?.totalParticipants} />
          <StatPanel label="Boys Teams" value={competitionStats?.boysTeams} />
          <StatPanel label="Girls Teams" value={competitionStats?.girlsTeams} />
          <StatPanel label="Total Boys" value={competitionStats?.totalBoys} />
          <StatPanel label="Total Girls" value={competitionStats?.totalGirls} />
        </div>

        {!selectedCompetition && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <StatPanel label="Total Competitions" value={competitionStats?.totalCompetitions} />
            <StatPanel label="Active Competitions" value={competitionStats?.activeCompetitions} />
          </div>
        )}
      </Panel>
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
        case 'lots':
          return <AdminLots />;
        case 'scores':
          return <AdminScores routePrefix={routePrefix} storagePrefix={storagePrefix} />;
        case 'judges':
          return <AdminJudges routePrefix={routePrefix} storagePrefix={storagePrefix} />;
        case 'transactions':
          return <AdminTransactions />;
        case 'desk':
          return <WalkInDesk />;
        case 'fairness':
          return <AdminJudgeFairness isSuperAdmin competitionId={selectedCompetition || null} />;
        default:
          return null;
      }
    } else {
      switch (activeTab) {
        case 'dashboard':
          return renderAdminDashboard();
        case 'teams':
          return <AdminTeams />;
        case 'lots':
          return <AdminLots />;
        case 'scores':
          return <AdminScores />;
        case 'judges':
          return <AdminJudges />;
        case 'transactions':
          return <AdminTransactions />;
        case 'desk':
          return <WalkInDesk />;
        case 'fairness':
          return <AdminJudgeFairness competitionId={currentCompetition?._id ? String(currentCompetition._id) : null} />;
        default:
          return null;
      }
    }
  };

  // Loading state
  if ((loading || isCompetitionLoading) && (activeTab === 'dashboard' || activeTab === 'overview')) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg">
        <p className="type-body-s text-fg-muted flex items-center gap-3 m-0">
          <span className="ui-spinner" aria-hidden="true" />
          Loading dashboard…
        </p>
      </div>
    );
  }

  // No competition selected for admin
  if (!isSuperAdmin && !currentCompetition && activeTab === 'dashboard') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg px-[var(--pad)]">
        <div className="w-full max-w-md grid gap-4">
          <Heading level={2} step="display-m">No Competition Selected</Heading>
          <EmptyState tag="Choose a competition">
            Please select a competition from the dropdown in the navigation bar to view the dashboard.
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText="Start"
        cancelText="Cancel"
      />

      {/* ─── Masthead ───────────────────────────────────────────────────── */}
      <AppHeader
        fixed
        role={isSuperAdmin ? 'superadmin' : 'admin'}
        nav={navItems}
        navLabel={`${isSuperAdmin ? 'Super admin' : 'Admin'} navigation`}
        navFrom="xl"
        compactBrand
        homeTo={`${routePrefix}/dashboard`}
        extra={!isSuperAdmin ? <CompetitionSelector userType={storagePrefix} /> : null}
        onLogout={handleLogout}
      />

      {/* ─── Page Content ───────────────────────────────────────────────── */}
      <main id="main-content" className="pt-16">
        <div className="max-w-7xl mx-auto px-[var(--pad)] py-8">
          {/*
            * Above the tabs, not inside one: the lock applies to the whole meet,
            * so an admin who moves from Teams to Scores to Lots must not have to
            * rediscover it on each. Renders nothing while the meet is open, and
            * nothing at all for a super admin, who keeps every write.
            */}
          <CompetitionLockBanner className="mb-6" />

          <Suspense fallback={
            <div className="flex justify-center items-center py-20">
              <span className="ui-spinner" aria-hidden="true" />
            </div>
          }>
            {renderTabContent()}
          </Suspense>
        </div>
      </main>
    </div>
  );
};

export default UnifiedDashboard;
