import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ShieldHalf,
  Mars,
  Users,
  Venus,
  UserCheck,
  Target,
  Award,
  Filter,
  Shield,
  UserPlus,
  Save,
  Edit,
  X,
  Menu
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '../services/api';
import Dropdown from '../components/Dropdown';
import { CompetitionProvider } from '../contexts/CompetitionContext';
import CompetitionDisplay from '../components/CompetitionDisplay';
import CompetitionSelector from '../components/CompetitionSelector';
import { ResponsiveContainer, ResponsiveDashboardGrid } from '../components/responsive';
import { 
  ResponsiveHeading, 
  ResponsiveText, 
  ResponsiveStatNumber, 
  ResponsiveStatLabel,
  ResponsiveNavText 
} from '../components/responsive/ResponsiveTypography';
import { useResponsive } from '../hooks/useResponsive';
import { useRouteContext } from '../contexts/RouteContext';
import AdminTeams from './AdminTeams';
import AdminScores from './AdminScores';
import AdminJudges from './AdminJudges';
import { useCompetition } from '../contexts/CompetitionContext';
import { useAgeGroups, useAgeGroupValues } from '../hooks/useAgeGroups';
import { Play, CheckCircle, XCircle } from 'lucide-react';

const AdminDashboard = ({ routePrefix: routePrefixProp }) => {
  const navigate = useNavigate();
  const { tab } = useParams();
  const { isMobile, isTablet } = useResponsive();
  
  // Use prop if provided, otherwise get from context
  const contextValue = useRouteContext();
  const routePrefix = routePrefixProp || contextValue.routePrefix;
  const storagePrefix = contextValue.storagePrefix;

  // Select the appropriate API service based on route context
  const api = routePrefix === '/superadmin' ? superAdminAPI : adminAPI;

  // Get active tab from URL, default to 'dashboard'
  const activeTab = tab || 'dashboard';
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [judgesSummary, setJudgesSummary] = useState([]);
  const [loadingJudgesSummary, setLoadingJudgesSummary] = useState(false);
  const [startingAgeGroups, setStartingAgeGroups] = useState({}); // Track which age groups are being started
  
  const { currentCompetition } = useCompetition();

  // Filters
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);



  const genders = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' }
  ];

  // Get filtered age groups from competition
  const availableAgeGroups = useAgeGroups(selectedGender?.value || 'Male');
  const maleAgeGroupValues = useAgeGroupValues('Male');
  const femaleAgeGroupValues = useAgeGroupValues('Female');

  // Get available age groups based on selected gender
  const getAvailableAgeGroups = () => {
    if (!selectedGender) return [];
    return availableAgeGroups;
  };





  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchDashboardStats();
      fetchJudgesSummary();
    } else if (activeTab === 'teams') {
      // Teams component will handle its own data loading
    } else if (activeTab === 'scores') {
      // Scores component will handle its own data loading
    } else if (activeTab === 'judges') {
      // Judges component will handle its own data loading
    }
  }, [activeTab]);

  const fetchJudgesSummary = async () => {
    setLoadingJudgesSummary(true);
    try {
      const response = await api.getAllJudgesSummary();
      setJudgesSummary(response.data.summary || []);
    } catch (error) {
      console.error('Failed to fetch judges summary:', error);
      // Don't show error toast, just log it
    } finally {
      setLoadingJudgesSummary(false);
    }
  };

  const handleStartAgeGroup = async (gender, ageGroup) => {
    const ageGroupLabel = ageGroup === 'U10' ? 'Under 10' :
                          ageGroup === 'U12' ? 'Under 12' :
                          ageGroup === 'U14' ? 'Under 14' :
                          ageGroup === 'U16' ? 'Under 16' :
                          ageGroup === 'U18' ? 'Under 18' :
                          ageGroup === 'Above18' ? 'Above 18' :
                          ageGroup === 'Above16' ? 'Above 16' : ageGroup;

    if (!window.confirm(`Are you sure you want to start the ${gender} ${ageGroupLabel} age group? Once started, judges for this age group cannot be modified.`)) {
      return;
    }

    const key = `${gender}_${ageGroup}`;
    setStartingAgeGroups(prev => ({ ...prev, [key]: true }));

    try {
      await api.startAgeGroup({ gender, ageGroup });
      toast.success(`${gender} ${ageGroupLabel} age group started successfully! Judges can no longer be modified for this age group.`);
      fetchJudgesSummary();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to start age group');
    } finally {
      setStartingAgeGroups(prev => ({ ...prev, [key]: false }));
    }
  };



  // Reset age group when gender changes
  useEffect(() => {
    if (selectedGender) {
      setSelectedAgeGroup(null);
    }
  }, [selectedGender]);



  const fetchDashboardStats = async () => {
    setLoading(true);
    try {
      const response = await api.getDashboard();
      setStats(response.data.stats);
      // setTeams(response.data.teams); // Commented out - using dedicated Teams page
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

  const renderDashboardTab = () => (
    <ResponsiveContainer maxWidth="desktop" padding="responsive">
      <div className="space-y-6 md:space-y-8">
        {/* Competition Display */}
        <CompetitionProvider userType={storagePrefix}>
          <CompetitionDisplay />
        </CompetitionProvider>

        {/* Stats Cards - Responsive Grid */}
        <ResponsiveDashboardGrid className="grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
            <div className="flex items-center">
              <div className="bg-purple-100 p-2 md:p-3 rounded-full">
                <ShieldHalf className="h-5 w-5 md:h-6 md:w-6 text-purple-600" />
              </div>
              <div className="ml-3 md:ml-4 min-w-0 flex-1">
                <div className="flex flex-col">
                  <ResponsiveStatLabel className="truncate">Total Teams</ResponsiveStatLabel>
                  <ResponsiveStatNumber>{stats?.totalTeams || 0}</ResponsiveStatNumber>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
            <div className="flex items-center">
              <div className="bg-green-100 p-2 md:p-3 rounded-full">
                <Users className="h-5 w-5 md:h-6 md:w-6 text-green-600" />
              </div>
              <div className="ml-3 md:ml-4 min-w-0 flex-1">
                <div className="flex flex-col">
                  <ResponsiveStatLabel className="truncate">Total Participants</ResponsiveStatLabel>
                  <ResponsiveStatNumber>{stats?.totalParticipants || 0}</ResponsiveStatNumber>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
            <div className="flex items-center">
              <div className="bg-blue-100 p-2 md:p-3 rounded-full">
                <Mars className="h-5 w-5 md:h-6 md:w-6 text-blue-600" />
              </div>
              <div className="ml-3 md:ml-4 min-w-0 flex-1">
                <div className="flex flex-col">
                  <ResponsiveStatLabel className="truncate">Boys Teams</ResponsiveStatLabel>
                  <ResponsiveStatNumber>{stats?.boysTeams || 0}</ResponsiveStatNumber>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
            <div className="flex items-center">
              <div className="bg-pink-100 p-2 md:p-3 rounded-full">
                <Venus className="h-5 w-5 md:h-6 md:w-6 text-pink-600" />
              </div>
              <div className="ml-3 md:ml-4 min-w-0 flex-1">
                <div className="flex flex-col">
                  <ResponsiveStatLabel className="truncate">Girls Teams</ResponsiveStatLabel>
                  <ResponsiveStatNumber>{stats?.girlsTeams || 0}</ResponsiveStatNumber>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
            <div className="flex items-center">
              <div className="bg-blue-100 p-2 md:p-3 rounded-full">
                <Target className="h-5 w-5 md:h-6 md:w-6 text-blue-600" />
              </div>
              <div className="ml-3 md:ml-4 min-w-0 flex-1">
                <div className="flex flex-col">
                  <ResponsiveStatLabel className="truncate">Total Boys</ResponsiveStatLabel>
                  <ResponsiveStatNumber>{stats?.totalBoys || 0}</ResponsiveStatNumber>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
            <div className="flex items-center">
              <div className="bg-pink-100 p-2 md:p-3 rounded-full">
                <Target className="h-5 w-5 md:h-6 md:w-6 text-pink-600" />
              </div>
              <div className="ml-3 md:ml-4 min-w-0 flex-1">
                <div className="flex flex-col">
                  <ResponsiveStatLabel className="truncate">Total Girls</ResponsiveStatLabel>
                  <ResponsiveStatNumber>{stats?.totalGirls || 0}</ResponsiveStatNumber>
                </div>
              </div>
            </div>
          </div>
        </ResponsiveDashboardGrid>

        {/* Judges Summary and Start Age Group Section */}
        {currentCompetition && (
          <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
            <div className="mb-4">
              <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-2">
                Judges Assignment Status
              </h3>
              <p className="text-sm text-gray-600">
                Review judge assignments for each age group. Each age group needs at least 3 judges to start. Once started, judges for that age group cannot be modified.
              </p>
            </div>

            {loadingJudgesSummary ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
                <p className="mt-2 text-sm text-gray-600">Loading judges summary...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Boys Age Groups */}
                <div>
                  <h4 className="text-md font-semibold text-gray-800 mb-3 flex items-center">
                    <Mars className="h-4 w-4 mr-2 text-blue-600" />
                    Boys Age Groups
                  </h4>
                  <div className="space-y-2">
                    {judgesSummary
                      .filter(item => item.gender === 'Male' && maleAgeGroupValues.includes(item.ageGroup))
                      .map((item, index) => {
                        const ageGroupLabel = item.ageGroup === 'U8' ? 'Under 8' :
                                             item.ageGroup === 'U10' ? 'Under 10' :
                                             item.ageGroup === 'U12' ? 'Under 12' :
                                             item.ageGroup === 'U14' ? 'Under 14' :
                                             item.ageGroup === 'U18' ? 'Under 18' :
                                             item.ageGroup === 'Above18' ? 'Above 18' : item.ageGroup;
                        const judgeNames = item.judges.map(j => j.name).filter(name => name).join(', ') || 'No judges assigned';
                        const key = `${item.gender}_${item.ageGroup}`;
                        const isStarting = startingAgeGroups[key] || false;
                        
                        return (
                          <div
                            key={`male-${item.ageGroup}`}
                            className={`flex items-center justify-between p-3 rounded-lg border-2 ${
                              item.isStarted
                                ? 'bg-blue-50 border-blue-300'
                                : item.hasMinimumJudges
                                ? 'bg-green-50 border-green-200'
                                : 'bg-red-50 border-red-200'
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-gray-900">{ageGroupLabel}</span>
                                {item.isStarted ? (
                                  <span className="px-2 py-1 text-xs font-semibold bg-blue-600 text-white rounded">Started</span>
                                ) : item.hasMinimumJudges ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-600" />
                                )}
                              </div>
                              <p className="text-sm text-gray-600 mt-1">
                                Judges: <span className="font-medium">{judgeNames}</span>
                              </p>
                            </div>
                            {!item.isStarted && (
                              <button
                                onClick={() => handleStartAgeGroup(item.gender, item.ageGroup)}
                                disabled={isStarting || !item.hasMinimumJudges || loadingJudgesSummary}
                                className="ml-4 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2 min-h-[44px] text-sm"
                              >
                                <Play className="h-4 w-4" />
                                <span>{isStarting ? 'Starting...' : 'Start'}</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Girls Age Groups */}
                <div>
                  <h4 className="text-md font-semibold text-gray-800 mb-3 flex items-center">
                    <Venus className="h-4 w-4 mr-2 text-pink-600" />
                    Girls Age Groups
                  </h4>
                  <div className="space-y-2">
                    {judgesSummary
                      .filter(item => item.gender === 'Female' && femaleAgeGroupValues.includes(item.ageGroup))
                      .map((item, index) => {
                        const ageGroupLabel = item.ageGroup === 'U8' ? 'Under 8' :
                                             item.ageGroup === 'U10' ? 'Under 10' :
                                             item.ageGroup === 'U12' ? 'Under 12' :
                                             item.ageGroup === 'U14' ? 'Under 14' :
                                             item.ageGroup === 'U16' ? 'Under 16' :
                                             item.ageGroup === 'U18' ? 'Under 18' :
                                             item.ageGroup === 'Above16' ? 'Above 16' :
                                             item.ageGroup === 'Above18' ? 'Above 18' : item.ageGroup;
                        const judgeNames = item.judges.map(j => j.name).filter(name => name).join(', ') || 'No judges assigned';
                        const key = `${item.gender}_${item.ageGroup}`;
                        const isStarting = startingAgeGroups[key] || false;
                        
                        return (
                          <div
                            key={`female-${item.ageGroup}`}
                            className={`flex items-center justify-between p-3 rounded-lg border-2 ${
                              item.isStarted
                                ? 'bg-blue-50 border-blue-300'
                                : item.hasMinimumJudges
                                ? 'bg-green-50 border-green-200'
                                : 'bg-red-50 border-red-200'
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-gray-900">{ageGroupLabel}</span>
                                {item.isStarted ? (
                                  <span className="px-2 py-1 text-xs font-semibold bg-blue-600 text-white rounded">Started</span>
                                ) : item.hasMinimumJudges ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-600" />
                                )}
                              </div>
                              <p className="text-sm text-gray-600 mt-1">
                                Judges: <span className="font-medium">{judgeNames}</span>
                              </p>
                            </div>
                            {!item.isStarted && (
                              <button
                                onClick={() => handleStartAgeGroup(item.gender, item.ageGroup)}
                                disabled={isStarting || !item.hasMinimumJudges || loadingJudgesSummary}
                                className="ml-4 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2 min-h-[44px] text-sm"
                              >
                                <Play className="h-4 w-4" />
                                <span>{isStarting ? 'Starting...' : 'Start'}</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </ResponsiveContainer>
  );

  if (loading && activeTab === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          </div>
          <ResponsiveText className="mt-4 text-gray-600 text-center">Loading admin dashboard...</ResponsiveText>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gray-50">
      {/* Single Combined Navigation */}
      <nav className="bg-white shadow-lg border-b">
        <ResponsiveContainer maxWidth="desktop" padding="responsive">
          {/* Single row with everything */}
          <div className="flex justify-between items-center h-14 md:h-16">
            {/* Left side - Admin Dashboard and tabs */}
            <div className="flex items-center space-x-4 md:space-x-8">
              <div className="flex items-center space-x-2">
                <Shield className="h-5 w-5 md:h-6 md:w-6 text-purple-600" />
                <ResponsiveHeading level={2} className="text-gray-900">
                  {routePrefix === '/superadmin' ? 'Super Admin Dashboard' : 'Admin Dashboard'}
                </ResponsiveHeading>
              </div>

              {/* Desktop Navigation Tabs */}
              {!isMobile && (
                <div className="flex space-x-4">
                  <button
                    onClick={() => navigate(`${routePrefix}/dashboard`)}
                    className={`px-3 py-2 md:px-4 md:py-2 rounded-lg font-medium min-h-[44px] md:min-h-0 ${activeTab === 'dashboard'
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    <ResponsiveNavText className={activeTab === 'dashboard' ? 'text-white' : 'text-gray-600 hover:text-gray-900'}>
                      Dashboard
                    </ResponsiveNavText>
                  </button>
                  <button
                    onClick={() => navigate(`${routePrefix}/dashboard/teams`)}
                    className={`px-3 py-2 md:px-4 md:py-2 rounded-lg font-medium min-h-[44px] md:min-h-0 ${activeTab === 'teams'
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    <ResponsiveNavText className={activeTab === 'teams' ? 'text-white' : 'text-gray-600 hover:text-gray-900'}>
                      Teams
                    </ResponsiveNavText>
                  </button>
                  <button
                    onClick={() => navigate(`${routePrefix}/dashboard/scores`)}
                    className={`px-3 py-2 md:px-4 md:py-2 rounded-lg font-medium min-h-[44px] md:min-h-0 ${activeTab === 'scores'
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    <ResponsiveNavText className={activeTab === 'scores' ? 'text-white' : 'text-gray-600 hover:text-gray-900'}>
                      Scores
                    </ResponsiveNavText>
                  </button>
                  <button
                    onClick={() => navigate(`${routePrefix}/dashboard/judges`)}
                    className={`px-3 py-2 md:px-4 md:py-2 rounded-lg font-medium min-h-[44px] md:min-h-0 ${activeTab === 'judges'
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    <ResponsiveNavText className={activeTab === 'judges' ? 'text-white' : 'text-gray-600 hover:text-gray-900'}>
                      Judges
                    </ResponsiveNavText>
                  </button>
                </div>
              )}
            </div>

            {/* Right side - Competition Selector, User info and logout */}
            <div className="flex items-center space-x-2 md:space-x-4">
              {/* Competition Selector for Admin */}
              <CompetitionProvider userType={storagePrefix}>
                <CompetitionSelector userType={storagePrefix} />
              </CompetitionProvider>
              
              <ResponsiveText size="sm" className="text-gray-600 hidden sm:block">Welcome, Admin</ResponsiveText>
              <button
                onClick={() => {
                  // Handle logout
                  localStorage.removeItem(`${storagePrefix}_token`);
                  localStorage.removeItem(`${storagePrefix}_user`);
                  navigate(`${routePrefix}/login`);
                }}
                className="px-2 py-1 md:px-3 md:py-1 bg-red-600 text-white rounded hover:bg-red-700 min-h-[44px] md:min-h-0"
              >
                <ResponsiveText size="xs" className="text-white">Logout</ResponsiveText>
              </button>
              
              {/* Mobile Menu Button */}
              {isMobile && (
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-2 text-gray-600 hover:text-gray-900 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <Menu className="h-6 w-6" />
                </button>
              )}
            </div>
          </div>

          {/* Mobile Navigation Menu */}
          {isMobile && mobileMenuOpen && (
            <div className="border-t border-gray-200 py-2">
              <div className="flex flex-col space-y-1">
                <button
                  onClick={() => {
                    navigate(`${routePrefix}/dashboard`);
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-left font-medium min-h-[44px] ${activeTab === 'dashboard'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => {
                    navigate(`${routePrefix}/dashboard/teams`);
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-left font-medium min-h-[44px] ${activeTab === 'teams'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  Teams
                </button>
                <button
                  onClick={() => {
                    navigate(`${routePrefix}/dashboard/scores`);
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-left font-medium min-h-[44px] ${activeTab === 'scores'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  Scores
                </button>
                <button
                  onClick={() => {
                    navigate(`${routePrefix}/dashboard/judges`);
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-left font-medium min-h-[44px] ${activeTab === 'judges'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  Judges
                </button>
              </div>
            </div>
          )}
        </ResponsiveContainer>
      </nav>

      {/* Content */}
      <ResponsiveContainer maxWidth="desktop" padding="responsive" className="py-6 md:py-8">
        {activeTab === 'dashboard' && renderDashboardTab()}
        {activeTab === 'teams' && <AdminTeams routePrefix={routePrefix} storagePrefix={storagePrefix} />}
        {activeTab === 'scores' && <AdminScores routePrefix={routePrefix} storagePrefix={storagePrefix} />}
        {activeTab === 'judges' && <AdminJudges routePrefix={routePrefix} storagePrefix={storagePrefix} />}
      </ResponsiveContainer>
    </div>
  );
};

export default AdminDashboard;