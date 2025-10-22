import { useState, useEffect } from 'react';
import { Trophy, Users, Calendar, Award, User, RefreshCw } from 'lucide-react';
import { playerAPI } from '../services/api';

const PlayerDashboard = () => {
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlayerProfile();
    
    // Set up an interval to refresh player data periodically
    const interval = setInterval(() => {
      fetchPlayerProfile();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const fetchPlayerProfile = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await playerAPI.getProfile();
      setPlayer(response.data.player);
    } catch (error) {
      console.error('Failed to fetch player profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchPlayerProfile(true);
  };

  const getAgeGroupDisplay = (ageGroup) => {
    const ageGroupMap = {
      'U10': 'Under 10',
      'U12': 'Under 12',
      'U14': 'Under 14',
      'U16': 'Under 16',
      'U18': 'Under 18',
      'Above18': 'Above 18',
      'Above16': 'Above 16'
    };
    return ageGroupMap[ageGroup] || ageGroup;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-blue-100 p-3 rounded-full">
                <User className="h-8 w-8 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Welcome, {player?.firstName} {player?.lastName}
                </h1>
                <p className="text-gray-600">Player Dashboard</p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="bg-blue-100 p-3 rounded-full">
                <Trophy className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Team</p>
                <p className="text-2xl font-bold text-gray-900">
                  {player?.team?.name || 'Not assigned'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="bg-green-100 p-3 rounded-full">
                <Award className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Age Group</p>
                <p className="text-2xl font-bold text-gray-900">
                  {player?.ageGroup ? getAgeGroupDisplay(player.ageGroup) : 'Not assigned'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="bg-purple-100 p-3 rounded-full">
                <Users className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Gender</p>
                <p className="text-2xl font-bold text-gray-900">{player?.gender}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="bg-orange-100 p-3 rounded-full">
                <Calendar className="h-6 w-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Aadhar</p>
                <p className="text-lg font-bold text-gray-900">
                  {player?.aadharNumber?.slice(0, 4)}****{player?.aadharNumber?.slice(-4)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Profile Information</h2>
            <div className="space-y-4">
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="font-medium text-gray-600">Full Name:</span>
                <span className="text-gray-900">{player?.firstName} {player?.lastName}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="font-medium text-gray-600">Aadhar Number:</span>
                <span className="text-gray-900">{player?.aadharNumber}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="font-medium text-gray-600">Date of Birth:</span>
                <span className="text-gray-900">
                  {player?.dateOfBirth ? new Date(player.dateOfBirth).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="font-medium text-gray-600">Gender:</span>
                <span className="text-gray-900">{player?.gender}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="font-medium text-gray-600">Team:</span>
                <span className="text-gray-900">{player?.team?.name || 'Not assigned'}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Team Information</h2>
            {player?.team ? (
              <div className="space-y-4">
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-600">Team Name:</span>
                  <span className="text-gray-900">{player.team.name}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-600">Age Group:</span>
                  <span className="text-gray-900">
                    {player.ageGroup ? getAgeGroupDisplay(player.ageGroup) : 'Not assigned'}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="font-medium text-gray-600">Status:</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Active
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">You are not assigned to any team yet.</p>
                <p className="text-sm text-gray-500 mt-2">
                  Contact your coach to get assigned to a team.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerDashboard;
