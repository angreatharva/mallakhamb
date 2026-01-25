import { useState, useEffect } from 'react';
import { Trophy, Users, UserPlus, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { coachAPI } from '../services/api';
import Dropdown from '../components/Dropdown';
import { ResponsiveContainer, ResponsiveCardGrid, ResponsiveFormGrid } from '../components/responsive';
import { 
  ResponsiveHeading, 
  ResponsiveText, 
  ResponsiveStatNumber, 
  ResponsiveStatLabel,
  ResponsiveCardTitle,
  ResponsiveCardDescription 
} from '../components/responsive/ResponsiveTypography';
import { useResponsive } from '../hooks/useResponsive';

const CoachDashboard = () => {
  const { isMobile, isTablet } = useResponsive();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedPlayerData, setSelectedPlayerData] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [selectedGender, setSelectedGender] = useState(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showTeamSummary, setShowTeamSummary] = useState(false);

  const boysAgeGroups = [
    { value: 'U10', label: 'Under 10', minAge: 0, maxAge: 9 },
    { value: 'U12', label: 'Under 12', minAge: 0, maxAge: 11 },
    { value: 'U14', label: 'Under 14', minAge: 0, maxAge: 13 },
    { value: 'U18', label: 'Under 18', minAge: 0, maxAge: 17 },
    { value: 'Above18', label: 'Above 18', minAge: 18, maxAge: 100 }
  ];

  const girlsAgeGroups = [
    { value: 'U10', label: 'Under 10', minAge: 0, maxAge: 9 },
    { value: 'U12', label: 'Under 12', minAge: 0, maxAge: 11 },
    { value: 'U14', label: 'Under 14', minAge: 0, maxAge: 13 },
    { value: 'U16', label: 'Under 16', minAge: 0, maxAge: 15 },
    { value: 'Above16', label: 'Above 16', minAge: 16, maxAge: 100 }
  ];

  const genders = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' }
  ];

  useEffect(() => {
    fetchTeamDashboard();
  }, []);

  // Calculate age from date of birth
  const calculateAge = (dateOfBirth) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  };

  // Get available age groups based on gender and player's age
  const getAvailableAgeGroups = (gender, playerAge) => {
    const ageGroups = gender === 'Male' ? boysAgeGroups : girlsAgeGroups;

    // Filter age groups where player can participate (current age or higher categories)
    return ageGroups.filter(group => {
      // Player can play in their age group or higher, but not lower
      if (group.value.startsWith('Above')) {
        return playerAge >= group.minAge;
      } else {
        // For "Under" categories, player can play if they're eligible for that category or higher
        return playerAge <= group.maxAge;
      }
    });
  };

  // Reset age group when gender changes
  useEffect(() => {
    if (selectedGender && selectedPlayerData) {
      setSelectedAgeGroup(null);
    }
  }, [selectedGender, selectedPlayerData]);

  const fetchTeamDashboard = async () => {
    try {
      const response = await coachAPI.getDashboard();
      setTeam(response.data.team);
    } catch (error) {
      toast.error('Failed to load team dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchPlayers = async (query) => {
    if (query.length < 2) {
      setPlayers([]);
      return;
    }

    setSearchLoading(true);
    try {
      const response = await coachAPI.searchPlayers(query);
      setPlayers(response.data.players);
    } catch (error) {
      toast.error('Failed to search players');
    } finally {
      setSearchLoading(false);
    }
  };

  const handlePlayerSelect = (player) => {
    // Validate player has complete data
    if (!player.dateOfBirth) {
      toast.error('Player date of birth is missing. Cannot determine age category.');
      return;
    }

    const playerAge = calculateAge(player.dateOfBirth);

    setSelectedPlayer({
      value: player._id,
      label: `${player.firstName} ${player.lastName}`
    });

    setSelectedPlayerData({
      ...player,
      age: playerAge
    });

    // Auto-select and lock the player's registered gender
    const playerGender = genders.find(g => g.value === player.gender);
    setSelectedGender(playerGender);

    // Reset age group selection
    setSelectedAgeGroup(null);
  };

  const handleAddPlayer = async () => {
    if (!selectedPlayer || !selectedAgeGroup || !selectedGender || !selectedPlayerData) {
      toast.error('Please select player and age group');
      return;
    }

    // Validate age eligibility
    const playerAge = selectedPlayerData.age;
    const ageGroup = selectedAgeGroup;

    if (ageGroup.value.startsWith('Above')) {
      if (playerAge < ageGroup.minAge) {
        toast.error(`Player is ${playerAge} years old and cannot play in ${ageGroup.label} category (minimum age: ${ageGroup.minAge})`);
        return;
      }
    } else {
      if (playerAge > ageGroup.maxAge) {
        toast.error(`Player is ${playerAge} years old and cannot play in ${ageGroup.label} category (maximum age: ${ageGroup.maxAge})`);
        return;
      }
    }

    try {
      await coachAPI.addPlayerToAgeGroup({
        playerId: selectedPlayer.value,
        ageGroup: selectedAgeGroup.value,
        gender: selectedGender.value
      });

      toast.success('Player added to age group successfully!');
      handleCloseModal();
      fetchTeamDashboard();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add player');
    }
  };

  const handleCloseModal = () => {
    setShowAddPlayer(false);
    setSelectedPlayer(null);
    setSelectedPlayerData(null);
    setSelectedAgeGroup(null);
    setSelectedGender(null);
    setSearchQuery('');
    setPlayers([]);
  };

  const handleRemovePlayer = async (playerId) => {
    if (window.confirm('Are you sure you want to remove this player from the age group?')) {
      try {
        await coachAPI.removePlayerFromAgeGroup(playerId);
        toast.success('Player removed successfully!');
        fetchTeamDashboard();
      } catch (error) {
        toast.error('Failed to remove player');
      }
    }
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

  const getPlayersByAgeGroup = () => {
    if (!team?.players) return {};

    const grouped = {};
    team.players.forEach(player => {
      const key = `${player.gender}_${player.ageGroup}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(player);
    });

    return grouped;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <ResponsiveText className="mt-4 text-gray-600">Loading team dashboard...</ResponsiveText>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Trophy className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <ResponsiveHeading level={2} className="text-gray-900 mb-2">No Team Found</ResponsiveHeading>
          <ResponsiveText className="text-gray-600">You need to create a team first.</ResponsiveText>
        </div>
      </div>
    );
  }

  const playersByAgeGroup = getPlayersByAgeGroup();

  return (
    <div className="min-h-screen bg-gray-50">
      <ResponsiveContainer maxWidth="desktop" padding="responsive" className="py-6 md:py-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 mb-6 md:mb-8">
          <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
            <div className="flex items-center space-x-4">
              <div className="bg-green-100 p-2 md:p-3 rounded-full">
                <Trophy className="h-6 w-6 md:h-8 md:w-8 text-green-600" />
              </div>
              <div>
                <ResponsiveHeading level={1} className="text-gray-900">{team.name}</ResponsiveHeading>
                <ResponsiveText className="text-gray-600">Team Dashboard</ResponsiveText>
              </div>
            </div>
            <div className="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-3">
              <button
                onClick={() => setShowAddPlayer(true)}
                className={`px-4 py-3 md:py-2 rounded-lg flex items-center justify-center space-x-2 min-h-[44px] ${
                  team?.isSubmitted
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
                disabled={team?.isSubmitted}
                title={team?.isSubmitted ? 'Cannot add players after team submission' : ''}
              >
                <UserPlus className="h-4 w-4" />
                <span>Add Player</span>
              </button>
              <button
                onClick={() => setShowTeamSummary(true)}
                className={`px-4 py-3 md:py-2 rounded-lg flex items-center justify-center space-x-2 min-h-[44px] ${
                  team?.isSubmitted
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
                disabled={!team?.players || team.players.length === 0 || team?.isSubmitted}
                title={team?.isSubmitted ? 'Please Contact the Admin to make changes in the Team' : ''}
              >
                <Trophy className="h-4 w-4" />
                <span>{team?.isSubmitted ? 'Team Submitted' : 'Submit Team'}</span>
              </button>
            </div>
          </div>

          {team.description && (
            <ResponsiveText className="mt-4 text-gray-600">{team.description}</ResponsiveText>
          )}

          {team?.isSubmitted && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <ResponsiveText size="sm" className="text-yellow-800">
                <strong>Team has been submitted.</strong> Please contact the Admin to make changes in the Team.
              </ResponsiveText>
            </div>
          )}
        </div>

        {/* Stats */}
        <ResponsiveCardGrid className="mb-6 md:mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="bg-blue-100 p-3 rounded-full">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <div className="flex flex-col">
                  <ResponsiveStatLabel>Total Players</ResponsiveStatLabel>
                  <ResponsiveStatNumber>{team.players?.length || 0}</ResponsiveStatNumber>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="bg-green-100 p-3 rounded-full">
                <Trophy className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <div className="flex flex-col">
                  <ResponsiveStatLabel>Age Groups</ResponsiveStatLabel>
                  <ResponsiveStatNumber>
                    {Object.keys(playersByAgeGroup).length}
                  </ResponsiveStatNumber>
                </div>
              </div>
            </div>
          </div>
        </ResponsiveCardGrid>

        {/* Age Groups */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
          {/* Boys Age Groups */}
          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
            <ResponsiveHeading level={2} className="text-gray-900 mb-4 md:mb-6">Boys Age Groups</ResponsiveHeading>
            <div className="space-y-4">
              {['U10', 'U12', 'U14', 'U18', 'Above18'].map(ageGroup => {
                const key = `Male_${ageGroup}`;
                const players = playersByAgeGroup[key] || [];

                return (
                  <div key={ageGroup} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <ResponsiveCardTitle className="text-gray-900">
                        {getAgeGroupDisplay(ageGroup)} Boys
                      </ResponsiveCardTitle>
                      <ResponsiveText size="sm" className="text-gray-600">{players.length} players</ResponsiveText>
                    </div>
                    <div className="space-y-2">
                      {players.map((player, index) => (
                        <div key={index} className="flex justify-between items-center bg-gray-50 p-3 rounded">
                          <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">
                            {player.player.firstName} {player.player.lastName}
                          </span>
                          <button
                            onClick={() => handleRemovePlayer(player.player._id)}
                            className={`ml-2 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center ${
                              team?.isSubmitted
                                ? 'text-gray-400 cursor-not-allowed'
                                : 'text-red-600 hover:text-red-800'
                            }`}
                            disabled={team?.isSubmitted}
                            title={team?.isSubmitted ? 'Cannot remove players after team submission' : ''}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      {players.length === 0 && (
                        <p className="text-sm text-gray-500 italic">No players assigned</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Girls Age Groups */}
          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
            <ResponsiveHeading level={2} className="text-gray-900 mb-4 md:mb-6">Girls Age Groups</ResponsiveHeading>
            <div className="space-y-4">
              {['U10', 'U12', 'U14', 'U16', 'Above16'].map(ageGroup => {
                const key = `Female_${ageGroup}`;
                const players = playersByAgeGroup[key] || [];

                return (
                  <div key={ageGroup} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-semibold text-gray-900">
                        {getAgeGroupDisplay(ageGroup)} Girls
                      </h3>
                      <span className="text-sm text-gray-600">{players.length} players</span>
                    </div>
                    <div className="space-y-2">
                      {players.map((player, index) => (
                        <div key={index} className="flex justify-between items-center bg-gray-50 p-3 rounded">
                          <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">
                            {player.player.firstName} {player.player.lastName}
                          </span>
                          <button
                            onClick={() => handleRemovePlayer(player.player._id)}
                            className={`ml-2 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center ${
                              team?.isSubmitted
                                ? 'text-gray-400 cursor-not-allowed'
                                : 'text-red-600 hover:text-red-800'
                            }`}
                            disabled={team?.isSubmitted}
                            title={team?.isSubmitted ? 'Cannot remove players after team submission' : ''}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      {players.length === 0 && (
                        <p className="text-sm text-gray-500 italic">No players assigned</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Team Summary Modal */}
        {showTeamSummary && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 p-4 md:p-6 rounded-t-2xl">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl md:text-2xl font-bold text-gray-900">Team Summary - {team.name}</h3>
                  <button
                    onClick={() => setShowTeamSummary(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="p-4 md:p-6 space-y-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">Team Information</h4>
                  <p className="text-gray-700"><strong>Team Name:</strong> {team.name}</p>
                  <p className="text-gray-700"><strong>Total Players:</strong> {team.players?.length || 0}</p>
                  {team.description && <p className="text-gray-700"><strong>Description:</strong> {team.description}</p>}
                  
                  {team?.isSubmitted && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-green-800">
                        <strong>Status:</strong> Team Submitted
                      </p>
                      {team.submittedAt && (
                        <p className="text-green-700 text-sm">
                          <strong>Submitted on:</strong> {new Date(team.submittedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-4">Players by Age Group</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Boys Age Groups */}
                    <div>
                      <h5 className="font-medium text-blue-600 mb-3">Boys Age Groups</h5>
                      <div className="space-y-3">
                        {['U10', 'U12', 'U14', 'U18', 'Above18'].map(ageGroup => {
                          const key = `Male_${ageGroup}`;
                          const players = playersByAgeGroup[key] || [];

                          return (
                            <div key={ageGroup} className="border border-gray-200 rounded-lg p-3">
                              <div className="flex justify-between items-center mb-2">
                                <span className="font-medium text-gray-900">{getAgeGroupDisplay(ageGroup)}</span>
                                <span className="text-sm text-gray-600">{players.length} players</span>
                              </div>
                              {players.length > 0 ? (
                                <div className="space-y-1">
                                  {players.map((player, index) => (
                                    <div key={index} className="text-sm text-gray-700">
                                      {player.player.firstName} {player.player.lastName}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-500 italic">No players</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Girls Age Groups */}
                    <div>
                      <h5 className="font-medium text-pink-600 mb-3">Girls Age Groups</h5>
                      <div className="space-y-3">
                        {['U10', 'U12', 'U14', 'U16', 'Above16'].map(ageGroup => {
                          const key = `Female_${ageGroup}`;
                          const players = playersByAgeGroup[key] || [];

                          return (
                            <div key={ageGroup} className="border border-gray-200 rounded-lg p-3">
                              <div className="flex justify-between items-center mb-2">
                                <span className="font-medium text-gray-900">{getAgeGroupDisplay(ageGroup)}</span>
                                <span className="text-sm text-gray-600">{players.length} players</span>
                              </div>
                              {players.length > 0 ? (
                                <div className="space-y-1">
                                  {players.map((player, index) => (
                                    <div key={index} className="text-sm text-gray-700">
                                      {player.player.firstName} {player.player.lastName}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-500 italic">No players</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col space-y-3 md:flex-row md:justify-end md:space-y-0 md:space-x-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => setShowTeamSummary(false)}
                    className="px-6 py-3 md:py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 min-h-[44px]"
                  >
                    Cancel
                  </button>
                  {team?.isSubmitted ? (
                    <div className="px-6 py-3 md:py-2 bg-green-100 text-green-800 rounded-lg border border-green-200 text-center min-h-[44px] flex items-center justify-center">
                      Team Already Submitted
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setShowTeamSummary(false);
                        window.location.href = '/coach/payment';
                      }}
                      className="px-6 py-3 md:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 min-h-[44px]"
                    >
                      Proceed to Payment
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Player Modal */}
        {showAddPlayer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              {/* Close Button */}
              <div className="sticky top-0 bg-white border-b border-gray-200 p-4 rounded-t-2xl">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl md:text-2xl font-bold text-gray-900">Add Player to Age Group</h3>
                  <button
                    onClick={handleCloseModal}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="p-4 md:p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search Players
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        handleSearchPlayers(e.target.value);
                      }}
                      className="w-full px-3 py-3 md:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 bg-white text-gray-900 min-h-[44px]"
                      placeholder="Search by name"
                    />
                    <Search className="absolute right-3 top-3 md:top-2.5 h-4 w-4 text-gray-400" />
                  </div>

                  {searchLoading && (
                    <p className="text-sm text-gray-500 mt-1">Searching...</p>
                  )}

                  {players.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md">
                      {players.map((player, index) => (
                        <button
                          key={index}
                          onClick={() => handlePlayerSelect(player)}
                          className="w-full text-left px-3 py-3 hover:bg-gray-100 border-b border-gray-100 last:border-b-0 min-h-[44px]"
                        >
                          <div className="font-medium text-gray-900">{player.firstName} {player.lastName}</div>
                          <div className="text-sm text-gray-500">
                            {player.email} • {player.gender} • {player.dateOfBirth ? ` Age: ${calculateAge(player.dateOfBirth)}` : ' Age: Unknown'}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedPlayer && selectedPlayerData && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Selected Player Details
                      </label>
                      <div className="bg-gray-50 p-3 rounded-md space-y-1">
                        <div className="font-medium text-gray-900">{selectedPlayer.label}</div>
                        <div className="text-sm text-gray-600">
                          Gender: {selectedPlayerData.gender} • Age: {selectedPlayerData.age} years
                        </div>
                        <div className="text-sm text-gray-600">
                          DOB: {new Date(selectedPlayerData.dateOfBirth).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Gender (Auto-selected)
                        </label>
                        <div className="w-full px-3 py-3 md:py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-700 min-h-[44px] flex items-center">
                          {selectedGender ? selectedGender.label : 'Loading...'}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Gender is automatically set based on player's registration
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Age Group <span className="text-red-500">*</span>
                        </label>
                        <Dropdown
                          options={selectedGender ? getAvailableAgeGroups(selectedGender.value, selectedPlayerData.age) : []}
                          value={selectedAgeGroup}
                          onChange={setSelectedAgeGroup}
                          placeholder="Select age group"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Player age: {selectedPlayerData.age} years. Can play in equal or higher categories.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col space-y-3 md:flex-row md:space-y-0 md:space-x-3">
                      <button
                        onClick={handleCloseModal}
                        className="flex-1 px-4 py-3 md:py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 min-h-[44px]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddPlayer}
                        disabled={!selectedPlayer || !selectedAgeGroup || !selectedGender}
                        className="flex-1 px-4 py-3 md:py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                      >
                        Add Player
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default CoachDashboard;