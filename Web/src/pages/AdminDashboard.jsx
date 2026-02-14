import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Trophy,
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

  // Filters
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);



  const genders = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' }
  ];

  const boysAgeGroups = [
    { value: 'U10', label: 'Under 10' },
    { value: 'U12', label: 'Under 12' },
    { value: 'U14', label: 'Under 14' },
    { value: 'U18', label: 'Under 18' },
    { value: 'Above18', label: 'Above 18' }
  ];

  const girlsAgeGroups = [
    { value: 'U10', label: 'Under 10' },
    { value: 'U12', label: 'Under 12' },
    { value: 'U14', label: 'Under 14' },
    { value: 'U16', label: 'Under 16' },
    { value: 'Above16', label: 'Above 16' }
  ];

  // Get available age groups based on selected gender
  const getAvailableAgeGroups = () => {
    if (!selectedGender) return [];
    return selectedGender.value === 'Male' ? boysAgeGroups : girlsAgeGroups;
  };





  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchDashboardStats();
    } else if (activeTab === 'teams') {
      // Teams component will handle its own data loading
    } else if (activeTab === 'scores') {
      // Scores component will handle its own data loading
    } else if (activeTab === 'judges') {
      // Judges component will handle its own data loading
    }
  }, [activeTab]);



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
        <ResponsiveDashboardGrid className="gap-4 md:gap-6">
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

            {/* Right side - User info and logout */}
            <div className="flex items-center space-x-2 md:space-x-4">
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