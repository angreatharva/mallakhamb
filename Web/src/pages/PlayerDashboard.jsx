import { useState, useEffect, useRef } from 'react';
import { Trophy, Users, Calendar, Award, User, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { playerAPI } from '../services/api';
import Dropdown from '../components/Dropdown';
import { CompetitionProvider } from '../contexts/CompetitionContext';
import CompetitionDisplay from '../components/CompetitionDisplay';
import { ResponsiveContainer, ResponsiveCardGrid } from '../components/responsive';
import { useResponsive } from '../hooks/useResponsive';

const PlayerDashboard = () => {
  const { isMobile, isTablet } = useResponsive();
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [updatingTeam, setUpdatingTeam] = useState(false);
  const emailRef = useRef(null);

  // Function to auto-adjust email font size
  const adjustEmailFontSize = () => {
    if (!emailRef.current || !player?.email) return;
    
    const container = emailRef.current;
    const containerWidth = container.offsetWidth;
    
    // Start with a reasonable font size
    let fontSize = 16;
    container.style.fontSize = fontSize + 'px';
    
    // Reduce font size until text fits in one line
    while (container.scrollWidth > containerWidth && fontSize > 8) {
      fontSize -= 0.5;
      container.style.fontSize = fontSize + 'px';
    }
  };

  useEffect(() => {
    fetchPlayerProfile();

    // Set up an interval to refresh player data periodically
    const interval = setInterval(() => {
      fetchPlayerProfile();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Fetch teams when player has no team assigned
    if (player && !player.team) {
      fetchTeams();
    }
  }, [player]);

  useEffect(() => {
    // Adjust email font size when player data changes
    if (player?.email) {
      setTimeout(adjustEmailFontSize, 100); // Small delay to ensure DOM is updated
    }
  }, [player?.email]);

  useEffect(() => {
    // Adjust font size on window resize
    const handleResize = () => {
      adjustEmailFontSize();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [player?.email]);

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

  const fetchTeams = async () => {
    setTeamsLoading(true);
    try {
      const response = await playerAPI.getTeams();
      const teamOptions = response.data.teams.map(team => ({
        value: team._id,
        label: team.name
      }));
      setTeams(teamOptions);
    } catch (error) {
      toast.error('Failed to load teams');
    } finally {
      setTeamsLoading(false);
    }
  };

  const handleTeamSelect = async (teamOption) => {
    setSelectedTeam(teamOption);
    setUpdatingTeam(true);

    try {
      await playerAPI.updateTeam({ teamId: teamOption.value });
      toast.success('Team selected successfully!');

      // Refresh player profile to get updated team info
      await fetchPlayerProfile();
      setSelectedTeam(null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to select team');
      setSelectedTeam(null);
    } finally {
      setUpdatingTeam(false);
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
      <ResponsiveContainer maxWidth="desktop" padding="responsive" className="py-6 md:py-8">
        {/* Competition Display */}
        <CompetitionProvider userType="player">
          <CompetitionDisplay className="mb-6 md:mb-8" />
        </CompetitionProvider>

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 mb-6 md:mb-8">
          <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
            <div className="flex items-center space-x-4">
              <div className="bg-blue-100 p-2 md:p-3 rounded-full">
                <User className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 truncate">
                  Welcome, {player?.firstName} {player?.lastName}
                </h1>
                <p className="text-gray-600">Player Dashboard</p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center justify-center space-x-2 px-4 py-3 md:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] w-full md:w-auto"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <ResponsiveCardGrid className="mb-6 md:mb-8">
          <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
            <div className="flex items-center">
              <div className="bg-blue-100 p-2 md:p-3 rounded-full">
                <Trophy className="h-5 w-5 md:h-6 md:w-6 text-blue-600" />
              </div>
              <div className="ml-3 md:ml-4 flex-1 min-w-0">
                <p className="text-xs md:text-sm font-medium text-gray-600">Team</p>
                {player?.team ? (
                  <p className="text-lg md:text-2xl font-bold text-gray-900 truncate">
                    {player.team.name}
                  </p>
                ) : (
                  <div className="mt-2">
                    <Dropdown
                      options={teams}
                      value={selectedTeam}
                      onChange={handleTeamSelect}
                      placeholder="Select a team"
                      loading={teamsLoading || updatingTeam}
                      disabled={updatingTeam}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
            <div className="flex items-center">
              <div className="bg-green-100 p-2 md:p-3 rounded-full">
                <Award className="h-5 w-5 md:h-6 md:w-6 text-green-600" />
              </div>
              <div className="ml-3 md:ml-4 min-w-0 flex-1">
                <p className="text-xs md:text-sm font-medium text-gray-600">Age Group</p>
                <p className="text-lg md:text-2xl font-bold text-gray-900 truncate">
                  {player?.ageGroup ? getAgeGroupDisplay(player.ageGroup) : 'Not assigned'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
            <div className="flex items-center">
              <div className="bg-purple-100 p-2 md:p-3 rounded-full">
                <Users className="h-5 w-5 md:h-6 md:w-6 text-purple-600" />
              </div>
              <div className="ml-3 md:ml-4 min-w-0 flex-1">
                <p className="text-xs md:text-sm font-medium text-gray-600">Gender</p>
                <p className="text-lg md:text-2xl font-bold text-gray-900">{player?.gender}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
            <div className="flex items-center">
              <div className="bg-orange-100 p-2 md:p-3 rounded-full">
                <Calendar className="h-5 w-5 md:h-6 md:w-6 text-orange-600" />
              </div>
              <div className="ml-3 md:ml-4 flex-1 min-w-0">
                <p className="text-xs md:text-sm font-medium text-gray-600">Email</p>
                <p 
                  ref={emailRef}
                  className="font-bold text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis"
                  style={{ fontSize: isMobile ? '14px' : '16px' }}
                >
                  {player?.email}
                </p>
              </div>
            </div>
          </div>
        </ResponsiveCardGrid>

        {/* Profile Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 md:mb-6">Profile Information</h2>
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:justify-between py-2 border-b border-gray-200">
                <span className="font-medium text-gray-600 mb-1 md:mb-0">Full Name:</span>
                <span className="text-gray-900 break-words">{player?.firstName} {player?.lastName}</span>
              </div>
              <div className="flex flex-col md:flex-row md:justify-between py-2 border-b border-gray-200">
                <span className="font-medium text-gray-600 mb-1 md:mb-0">Email:</span>
                <span className="text-gray-900 break-all text-sm md:text-base">{player?.email}</span>
              </div>
              <div className="flex flex-col md:flex-row md:justify-between py-2 border-b border-gray-200">
                <span className="font-medium text-gray-600 mb-1 md:mb-0">Date of Birth:</span>
                <span className="text-gray-900">
                  {player?.dateOfBirth ? new Date(player.dateOfBirth).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              <div className="flex flex-col md:flex-row md:justify-between py-2 border-b border-gray-200">
                <span className="font-medium text-gray-600 mb-1 md:mb-0">Gender:</span>
                <span className="text-gray-900">{player?.gender}</span>
              </div>
              <div className="flex flex-col md:flex-row md:justify-between py-2">
                <span className="font-medium text-gray-600 mb-1 md:mb-0">Team:</span>
                <span className="text-gray-900 break-words">{player?.team?.name || 'Not assigned'}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 md:mb-6">Team Information</h2>
            {player?.team ? (
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:justify-between py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-600 mb-1 md:mb-0">Team Name:</span>
                  <span className="text-gray-900 break-words">{player.team.name}</span>
                </div>
                <div className="flex flex-col md:flex-row md:justify-between py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-600 mb-1 md:mb-0">Age Group:</span>
                  <span className="text-gray-900">
                    {player.ageGroup ? getAgeGroupDisplay(player.ageGroup) : 'Not assigned'}
                  </span>
                </div>
                <div className="flex flex-col md:flex-row md:justify-between py-2">
                  <span className="font-medium text-gray-600 mb-1 md:mb-0">Status:</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 w-fit">
                    Active
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-6 md:py-8">
                <div className="text-center mb-6">
                  <Users className="h-10 w-10 md:h-12 md:w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">You are not assigned to any team yet.</p>
                  <p className="text-sm text-gray-500">
                    Select a team from the dropdown below to join.
                  </p>
                </div>
                <div className="max-w-sm mx-auto">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Choose Your Team
                  </label>
                  <Dropdown
                    options={teams}
                    value={selectedTeam}
                    onChange={handleTeamSelect}
                    placeholder="Select a team to join"
                    loading={teamsLoading || updatingTeam}
                    disabled={updatingTeam}
                  />
                  {updatingTeam && (
                    <p className="text-sm text-blue-600 mt-2 text-center">
                      Joining team...
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </ResponsiveContainer>
    </div>
  );
};

export default PlayerDashboard;