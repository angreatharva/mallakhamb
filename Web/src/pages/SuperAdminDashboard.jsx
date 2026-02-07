import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Shield,
  Users,
  UserCheck,
  ShieldHalf,
  Target,
  Menu,
  Activity
} from 'lucide-react';
import toast from 'react-hot-toast';
import { superAdminAPI } from '../services/api';
import { ResponsiveContainer } from '../components/responsive';
import { 
  ResponsiveHeading, 
  ResponsiveText, 
  ResponsiveNavText 
} from '../components/responsive/ResponsiveTypography';
import { useResponsive } from '../hooks/useResponsive';
import { useRouteContext } from '../contexts/RouteContext';
import AdminTeams from './AdminTeams';
import AdminScores from './AdminScores';
import AdminJudges from './AdminJudges';
import SuperAdminManagement from './SuperAdminManagement';

const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const { tab } = useParams();
  const { isMobile } = useResponsive();
  
  const { routePrefix, storagePrefix } = useRouteContext();

  // Get active tab from URL, default to 'overview'
  const activeTab = tab || 'overview';
  const [stats, setStats] = useState(null);
  const [systemStats, setSystemStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchDashboardData();
    }
  }, [activeTab]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [dashboardResponse, systemResponse] = await Promise.all([
        superAdminAPI.getDashboard(),
        superAdminAPI.getSystemStats()
      ]);
      
      setStats(dashboardResponse.data.stats);
      setSystemStats(systemResponse.data);
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

  const StatCard = ({ title, value, icon: Icon, bgColor, iconColor, textColor }) => (
    <div className={`${bgColor} rounded-xl p-6 shadow-md border border-gray-200`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className={`text-sm font-medium ${textColor} mb-1`}>{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`${iconColor} p-3 rounded-full`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );

  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* System Overview */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <ResponsiveHeading level={3} className="text-gray-900 mb-6">
          System Overview
        </ResponsiveHeading>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard
            title="Total Admins"
            value={systemStats?.stats?.users?.totalAdmins || 0}
            icon={Shield}
            bgColor="bg-gradient-to-br from-purple-50 to-purple-100"
            iconColor="bg-purple-600"
            textColor="text-purple-700"
          />
          <StatCard
            title="Total Coaches"
            value={systemStats?.stats?.users?.totalCoaches || 0}
            icon={UserCheck}
            bgColor="bg-gradient-to-br from-blue-50 to-blue-100"
            iconColor="bg-blue-600"
            textColor="text-blue-700"
          />
          <StatCard
            title="Total Players"
            value={systemStats?.stats?.users?.totalPlayers || 0}
            icon={Users}
            bgColor="bg-gradient-to-br from-green-50 to-green-100"
            iconColor="bg-green-600"
            textColor="text-green-700"
          />
          <StatCard
            title="Total Teams"
            value={systemStats?.stats?.content?.totalTeams || 0}
            icon={ShieldHalf}
            bgColor="bg-gradient-to-br from-orange-50 to-orange-100"
            iconColor="bg-orange-600"
            textColor="text-orange-700"
          />
          <StatCard
            title="Total Scores"
            value={systemStats?.stats?.content?.totalScores || 0}
            icon={Target}
            bgColor="bg-gradient-to-br from-pink-50 to-pink-100"
            iconColor="bg-pink-600"
            textColor="text-pink-700"
          />
          <StatCard
            title="Active Judges"
            value={systemStats?.stats?.content?.totalJudges || 0}
            icon={Activity}
            bgColor="bg-gradient-to-br from-indigo-50 to-indigo-100"
            iconColor="bg-indigo-600"
            textColor="text-indigo-700"
          />
        </div>
      </div>

      {/* Competition Stats */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <ResponsiveHeading level={3} className="text-gray-900 mb-6">
          Competition Statistics
        </ResponsiveHeading>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow-md p-6 border-2 border-purple-200 hover:border-purple-400 transition-colors">
            <p className="text-sm text-gray-600 mb-2">Total Teams</p>
            <p className="text-3xl font-bold text-purple-600">{stats?.totalTeams || 0}</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-2 border-green-200 hover:border-green-400 transition-colors">
            <p className="text-sm text-gray-600 mb-2">Total Participants</p>
            <p className="text-3xl font-bold text-green-600">{stats?.totalParticipants || 0}</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-2 border-blue-200 hover:border-blue-400 transition-colors">
            <p className="text-sm text-gray-600 mb-2">Boys Teams</p>
            <p className="text-3xl font-bold text-blue-600">{stats?.boysTeams || 0}</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-2 border-pink-200 hover:border-pink-400 transition-colors">
            <p className="text-sm text-gray-600 mb-2">Girls Teams</p>
            <p className="text-3xl font-bold text-pink-600">{stats?.girlsTeams || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading && activeTab === 'overview') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          </div>
          <ResponsiveText className="mt-4 text-gray-600 text-center">Loading super admin dashboard...</ResponsiveText>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-lg border-b">
        <ResponsiveContainer maxWidth="desktop" padding="responsive">
          <div className="flex justify-between items-center h-14 md:h-16">
            {/* Left side */}
            <div className="flex items-center space-x-4 md:space-x-8">
              <div className="flex items-center space-x-2">
                <Shield className="h-5 w-5 md:h-6 md:w-6 text-purple-600" />
                <ResponsiveHeading level={2} className="text-gray-900">
                  Super Admin Dashboard
                </ResponsiveHeading>
              </div>

              {/* Desktop Navigation Tabs */}
              {!isMobile && (
                <div className="flex space-x-4">
                  <button
                    onClick={() => navigate(`${routePrefix}/dashboard`)}
                    className={`px-3 py-2 md:px-4 md:py-2 rounded-lg font-medium ${
                      activeTab === 'overview'
                        ? 'bg-purple-600 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <ResponsiveNavText className={activeTab === 'overview' ? 'text-white' : ''}>
                      Overview
                    </ResponsiveNavText>
                  </button>
                  <button
                    onClick={() => navigate(`${routePrefix}/dashboard/management`)}
                    className={`px-3 py-2 md:px-4 md:py-2 rounded-lg font-medium ${
                      activeTab === 'management'
                        ? 'bg-purple-600 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <ResponsiveNavText className={activeTab === 'management' ? 'text-white' : ''}>
                      Management
                    </ResponsiveNavText>
                  </button>
                  <button
                    onClick={() => navigate(`${routePrefix}/dashboard/teams`)}
                    className={`px-3 py-2 md:px-4 md:py-2 rounded-lg font-medium ${
                      activeTab === 'teams'
                        ? 'bg-purple-600 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <ResponsiveNavText className={activeTab === 'teams' ? 'text-white' : ''}>
                      Teams
                    </ResponsiveNavText>
                  </button>
                  <button
                    onClick={() => navigate(`${routePrefix}/dashboard/scores`)}
                    className={`px-3 py-2 md:px-4 md:py-2 rounded-lg font-medium ${
                      activeTab === 'scores'
                        ? 'bg-purple-600 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <ResponsiveNavText className={activeTab === 'scores' ? 'text-white' : ''}>
                      Scores
                    </ResponsiveNavText>
                  </button>
                  <button
                    onClick={() => navigate(`${routePrefix}/dashboard/judges`)}
                    className={`px-3 py-2 md:px-4 md:py-2 rounded-lg font-medium ${
                      activeTab === 'judges'
                        ? 'bg-purple-600 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <ResponsiveNavText className={activeTab === 'judges' ? 'text-white' : ''}>
                      Judges
                    </ResponsiveNavText>
                  </button>
                </div>
              )}
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-2 md:space-x-4">
              <ResponsiveText size="sm" className="text-gray-600 hidden sm:block">Super Admin</ResponsiveText>
              <button
                onClick={() => {
                  localStorage.removeItem(`${storagePrefix}_token`);
                  localStorage.removeItem(`${storagePrefix}_user`);
                  navigate(`${routePrefix}/login`);
                }}
                className="px-2 py-1 md:px-3 md:py-1 bg-red-600 text-white rounded hover:bg-red-700 min-h-[44px] md:min-h-0"
              >
                <ResponsiveText size="xs" className="text-white">Logout</ResponsiveText>
              </button>
              
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
                  className={`px-4 py-3 text-left font-medium min-h-[44px] ${
                    activeTab === 'overview'
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => {
                    navigate(`${routePrefix}/dashboard/management`);
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-left font-medium min-h-[44px] ${
                    activeTab === 'management'
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Management
                </button>
                <button
                  onClick={() => {
                    navigate(`${routePrefix}/dashboard/teams`);
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 text-left font-medium min-h-[44px] ${
                    activeTab === 'teams'
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
                  className={`px-4 py-3 text-left font-medium min-h-[44px] ${
                    activeTab === 'scores'
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
                  className={`px-4 py-3 text-left font-medium min-h-[44px] ${
                    activeTab === 'judges'
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
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'management' && <SuperAdminManagement />}
        {activeTab === 'teams' && <AdminTeams routePrefix={routePrefix} storagePrefix={storagePrefix} />}
        {activeTab === 'scores' && <AdminScores routePrefix={routePrefix} storagePrefix={storagePrefix} />}
        {activeTab === 'judges' && <AdminJudges routePrefix={routePrefix} storagePrefix={storagePrefix} />}
      </ResponsiveContainer>
    </div>
  );
};

export default SuperAdminDashboard;
