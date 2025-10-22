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
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI } from '../services/api';
import Dropdown from '../components/Dropdown';
import Teams from './Teams';
import Scores from './Scores';
import Judges from './Judges';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { tab } = useParams();

  // Get active tab from URL, default to 'dashboard'
  const activeTab = tab || 'dashboard';
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

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
      const response = await adminAPI.getDashboard();
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
    <div className="space-y-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center">
            <div className="bg-purple-100 p-3 rounded-full">
              <ShieldHalf className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Teams</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalTeams || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center">
            <div className="bg-green-100 p-3 rounded-full">
              <Users className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Participants</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalParticipants || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center">
            <div className="bg-blue-100 p-3 rounded-full">
              <Mars  className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Boys Teams</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.boysTeams || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center">
            <div className="bg-pink-100 p-3 rounded-full">
              <Venus className="h-6 w-6 text-pink-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Girls Teams</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.girlsTeams || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center">
            <div className="bg-blue-100 p-3 rounded-full">
              <Target className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Boys</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalBoys || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center">
            <div className="bg-pink-100 p-3 rounded-full">
              <Target className="h-6 w-6 text-pink-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Girls</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalGirls || 0}</p>
            </div>
          </div>
        </div>
      </div>

      
    </div>
  );

  if (loading && activeTab === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gray-50">
      {/* Combined Navigation */}
      <nav className="bg-white shadow-lg border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top row - Site branding and user info */}
          <div className="flex justify-between items-center h-16 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <Trophy className="h-8 w-8 text-purple-600" />
              <span className="text-xl font-bold text-gray-900">MallakhambIndia</span>
            </div>

            {/* User info and logout */}
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Welcome, Admin</span>
              <button
                onClick={() => {
                  // Handle logout
                  localStorage.removeItem('admin_token');
                  localStorage.removeItem('admin_user');
                  navigate('/admin/login');
                }}
                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Bottom row - Admin dashboard and tabs */}
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-2">
                <Shield className="h-6 w-6 text-purple-600" />
                <span className="text-lg font-semibold text-gray-900">Admin Dashboard</span>
              </div>

              {/* Navigation Tabs */}
              <div className="flex space-x-4">
                <button
                  onClick={() => navigate('/admin/dashboard')}
                  className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'dashboard'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => navigate('/admin/dashboard/teams')}
                  className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'teams'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  Teams
                </button>
                <button
                  onClick={() => navigate('/admin/dashboard/scores')}
                  className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'scores'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  Scores
                </button>
                <button
                  onClick={() => navigate('/admin/dashboard/judges')}
                  className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'judges'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  Judges
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && renderDashboardTab()}
        {activeTab === 'teams' && <Teams />}
        {activeTab === 'scores' && <Scores />}
        {activeTab === 'judges' && <Judges />}
      </div>
    </div>
  );
};

export default AdminDashboard;