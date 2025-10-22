import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy,
  Filter,
  Users,
  X,
  Search
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI } from '../services/api';
import Dropdown from '../components/Dropdown';

const Scores = () => {
  const navigate = useNavigate();

  // State management
  const [scores, setScores] = useState([]);
  const [submittedTeams, setSubmittedTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamScoreStatus, setTeamScoreStatus] = useState({});
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [scoreType, setScoreType] = useState('add'); // 'add', 'team', 'individual'

  // Search
  const [searchTerm, setSearchTerm] = useState('');

  // Filter options
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

  const scoreTypes = [
    { value: 'add', label: 'Add Score' },
    { value: 'individual', label: 'Individual Rankings' },
    { value: 'rankings', label: 'Team Rankings' }
  ];

  // Get available age groups based on selected gender
  const getAvailableAgeGroups = () => {
    if (!selectedGender) return [];
    return selectedGender.value === 'Male' ? boysAgeGroups : girlsAgeGroups;
  };

  // Reset age group when gender changes
  useEffect(() => {
    if (selectedGender) {
      setSelectedAgeGroup(null);
    }
  }, [selectedGender]);

  // Auto-load data when both filters are selected
  useEffect(() => {
    if (selectedGender && selectedAgeGroup) {
      if (scoreType === 'add') {
        fetchSubmittedTeams();
      } else {
        handleScoreTypeChange();
      }
    } else {
      setSubmittedTeams([]);
      setScores([]);
    }
  }, [selectedGender, selectedAgeGroup, scoreType]);

  // API Functions
  const fetchTeamDetails = async (teamId) => {
    try {
      const response = await adminAPI.getTeamDetails(teamId);
      setSelectedTeam(response.data.team);
    } catch (error) {
      toast.error('Failed to load team details');
      console.error('Error fetching team details:', error);
    }
  };

  const handleScoreTypeChange = () => {
    if (scoreType === 'team') {
      fetchTeamScores();
    } else if (scoreType === 'individual') {
      fetchIndividualScores();
    } else if (scoreType === 'rankings') {
      fetchTeamRankings();
    }
  };

  const fetchSubmittedTeams = async () => {
    if (!selectedGender || !selectedAgeGroup) {
      return;
    }

    setLoading(true);
    try {
      const params = {
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value
      };

      const response = await adminAPI.getSubmittedTeams(params);
      setSubmittedTeams(response.data.teams);

      // Check score status for each team
      await checkTeamScoreStatus(response.data.teams);
    } catch (error) {
      toast.error('Failed to load submitted teams');
    } finally {
      setLoading(false);
    }
  };

  const checkTeamScoreStatus = async (teams) => {
    const scoreStatus = {};

    for (const team of teams) {
      try {
        const response = await adminAPI.getTeamScores({
          teamId: team._id,
          gender: selectedGender?.value,
          ageGroup: selectedAgeGroup?.value
        });

        if (response.data?.scores?.length > 0) {
          const score = response.data.scores[0];
          scoreStatus[team._id] = {
            hasScores: true,
            isLocked: score.isLocked,
            scoreId: score._id,
            lastUpdated: score.updatedAt || score.createdAt
          };
        } else {
          scoreStatus[team._id] = {
            hasScores: false,
            isLocked: false
          };
        }
      } catch (error) {
        console.log(`No scores found for team ${team._id}`);
        scoreStatus[team._id] = {
          hasScores: false,
          isLocked: false
        };
      }
    }

    setTeamScoreStatus(scoreStatus);
  };

  const fetchTeamScores = async () => {
    if (!selectedGender || !selectedAgeGroup) {
      return;
    }

    setLoading(true);
    try {
      const params = {
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value
      };

      const response = await adminAPI.getTeamScores(params);
      setScores(response.data.teamScores);
    } catch (error) {
      toast.error('Failed to load team scores');
    } finally {
      setLoading(false);
    }
  };

  const fetchIndividualScores = async () => {
    if (!selectedGender || !selectedAgeGroup) {
      return;
    }

    setLoading(true);
    try {
      const params = {
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value
      };

      const response = await adminAPI.getIndividualScores(params);
      setScores(response.data.individualScores);
    } catch (error) {
      toast.error('Failed to load individual scores');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamRankings = async () => {
    if (!selectedGender || !selectedAgeGroup) {
      return;
    }

    setLoading(true);
    try {
      const params = {
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value
      };

      const response = await adminAPI.getTeamRankings(params);
      setScores(response.data.teamRankings);
    } catch (error) {
      toast.error('Failed to load team rankings');
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setSelectedGender(null);
    setSelectedAgeGroup(null);
    setSubmittedTeams([]);
    setScores([]);
    setSearchTerm('');
  };

  // Filter teams/scores based on search term
  const getFilteredData = () => {
    if (scoreType === 'add') {
      return submittedTeams.filter(team => {
        if (!searchTerm) return true;

        const searchLower = searchTerm.toLowerCase();
        const teamName = team.name?.toLowerCase() || '';
        const coachName = team.coach?.name?.toLowerCase() || '';

        return teamName.includes(searchLower) || coachName.includes(searchLower);
      });
    }

    // For rankings, preserve original position by adding originalRank
    const filteredScores = scores.map((score, originalIndex) => ({
      ...score,
      originalRank: originalIndex + 1
    })).filter(score => {
      if (!searchTerm) return true;

      const searchLower = searchTerm.toLowerCase();
      const playerName = score.playerName?.toLowerCase() || '';
      const teamName = score.teamName?.toLowerCase() || '';

      return playerName.includes(searchLower) || teamName.includes(searchLower);
    });

    return filteredScores;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Scoring System</h2>

        {/* Score Type Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Score Type</label>
            <Dropdown
              options={scoreTypes}
              value={scoreTypes.find(s => s.value === scoreType)}
              onChange={(option) => setScoreType(option.value)}
              placeholder="Select score type"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Gender Filter <span className="text-red-500">*</span>
            </label>
            <Dropdown
              options={genders}
              value={selectedGender}
              onChange={setSelectedGender}
              placeholder="Select gender first"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Age Group Filter</label>
            <Dropdown
              options={getAvailableAgeGroups()}
              value={selectedAgeGroup}
              onChange={setSelectedAgeGroup}
              placeholder={selectedGender ? "Select age group" : "Select gender first"}
              disabled={!selectedGender}
            />
            {!selectedGender && (
              <p className="text-[0.75rem] text-gray-500 mt-1">Please select gender first to see available age groups</p>
            )}
            {selectedGender && (
              <p className="text-[0.70rem] text-blue-600 mt-1">
                {selectedGender.value === 'Male'
                  ? 'Available: U10, U12, U14, U18, Above 18'
                  : 'Available: U10, U12, U14, U16, Above 16'
                }
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons Row */}
        {(selectedGender || selectedAgeGroup) && (
          <div className="flex justify-end items-center mb-4">
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              Clear Filters
            </button>
          </div>
        )}

        {/* Score Content - Only show after filters are applied */}
        {!selectedGender || !selectedAgeGroup ? (
          <div className="text-center py-5">
            <Filter className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-500 mb-2">Select Filters to View Scores</h3>
            <p className="text-gray-400 mb-6">
              Please select both gender and age group filters above to view scores.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
              <p className="text-sm text-blue-800">
                <strong>Required:</strong> Gender and Age Group filters must be selected. Data will load automatically.
              </p>
            </div>
          </div>
        ) : loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading data...</p>
          </div>
        ) : (
          <>
            {scoreType === 'add' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Add New Score</h3>

                {submittedTeams.length > 0 && (
                  <>
                    <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-800">
                        <strong>Showing teams for:</strong> {selectedGender.label} - {selectedAgeGroup.label}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        Found {submittedTeams.length} team{submittedTeams.length !== 1 ? 's' : ''} matching your criteria
                        {searchTerm && ` (${getFilteredData().length} after search)`}
                      </p>
                    </div>

                    {/* Search Bar */}
                    <div className="mb-6">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                          type="text"
                          placeholder="Search teams by name or coach..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                        />
                        {searchTerm && (
                          <button
                            onClick={() => setSearchTerm('')}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center"
                          >
                            <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-4">
                  {submittedTeams.length > 0 ? (
                    getFilteredData().length === 0 && searchTerm ? (
                      <div className="text-center py-8">
                        <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-500 mb-2">No teams found</h3>
                        <p className="text-gray-400">No teams match your search term "{searchTerm}"</p>
                        <button
                          onClick={() => setSearchTerm('')}
                          className="mt-3 text-purple-600 hover:text-purple-800 font-medium"
                        >
                          Clear search
                        </button>
                      </div>
                    ) : (
                      getFilteredData().map((team) => (
                        <div key={team._id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-semibold text-lg">{team.name}</h4>
                              <p className="text-sm text-gray-600">Coach: {team.coach?.name || 'Unknown'}</p>
                              <p className="text-sm text-gray-600">Email: {team.coach?.email || 'N/A'}</p>
                              <p className="text-sm text-gray-500 mt-1">
                                Submitted: {new Date(team.submittedAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">Total Players: {team.players?.length || 0}</p>
                              <div className="mt-2 space-y-1">
                                {team.ageGroupSummary && Object.entries(team.ageGroupSummary).map(([group, count]) => (
                                  <div key={group} className="text-xs text-gray-600">
                                    {group}: {count}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center space-x-3">
                                <span className="text-sm text-green-600 font-medium">✓ Payment Completed</span>
                                {teamScoreStatus[team._id]?.hasScores && (
                                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${teamScoreStatus[team._id]?.isLocked
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                    {teamScoreStatus[team._id]?.isLocked ? '🔒 Scores Locked' : '📝 Scores In Progress'}
                                  </span>
                                )}
                              </div>
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => fetchTeamDetails(team._id)}
                                  className="text-sm text-blue-600 hover:text-blue-800"
                                >
                                  View Details
                                </button>
                                {teamScoreStatus[team._id]?.isLocked ? (
                                  <button
                                    onClick={() => {
                                      navigate('/admin/scoring', {
                                        state: {
                                          selectedTeam: team,
                                          selectedGender,
                                          selectedAgeGroup
                                        }
                                      });
                                    }}
                                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 flex items-center space-x-1"
                                  >
                                    <span>👁️</span>
                                    <span>View Scores</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      if (teamScoreStatus[team._id]?.hasScores) {
                                        toast.info('Continuing existing scoring session...');
                                      }
                                      navigate('/admin/scoring', {
                                        state: {
                                          selectedTeam: team,
                                          selectedGender,
                                          selectedAgeGroup
                                        }
                                      });
                                    }}
                                    className={`px-3 py-1 text-white text-sm rounded hover:opacity-90 ${teamScoreStatus[team._id]?.hasScores
                                      ? 'bg-orange-600'
                                      : 'bg-green-600'
                                      }`}
                                  >
                                    {teamScoreStatus[team._id]?.hasScores ? 'Continue Scoring' : 'Add Scores'}
                                  </button>
                                )}
                              </div>
                            </div>
                            {teamScoreStatus[team._id]?.hasScores && teamScoreStatus[team._id]?.lastUpdated && (
                              <div className="mt-2">
                                <p className="text-xs text-gray-500">
                                  Last updated: {new Date(teamScoreStatus[team._id].lastUpdated).toLocaleString()}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )
                  ) : (
                    <div className="text-center py-8">
                      <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No teams have been submitted yet.</p>
                      <p className="text-gray-400 text-sm mt-2">Teams will appear here after coaches complete their registration and payment.</p>
                    </div>
                  )}
                </div>
              </div>
            )}



            {scoreType === 'individual' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Individual Scores</h3>

                {scores.length > 0 && (
                  <>
                    <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-800">
                        <strong>Showing scores for:</strong> {selectedGender.label} - {selectedAgeGroup.label}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        Found {scores.length} player{scores.length !== 1 ? 's' : ''} matching your criteria
                        {searchTerm && ` (${getFilteredData().length} after search)`}
                      </p>
                    </div>

                    {/* Search Bar */}
                    <div className="mb-6">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                          type="text"
                          placeholder="Search players by name or team..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                        />
                        {searchTerm && (
                          <button
                            onClick={() => setSearchTerm('')}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center"
                          >
                            <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {scores.length > 0 && getFilteredData().length === 0 && searchTerm ? (
                  <div className="text-center py-8">
                    <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-500 mb-2">No players found</h3>
                    <p className="text-gray-400">No players match your search term "{searchTerm}"</p>
                    <button
                      onClick={() => setSearchTerm('')}
                      className="mt-3 text-purple-600 hover:text-purple-800 font-medium"
                    >
                      Clear search
                    </button>
                  </div>
                ) : scores.length > 0 && (
                  <>
                    {/* Podium for Top 3 */}
                    {getFilteredData().length >= 3 && (
                      <div className="mb-8">
                        <h4 className="text-md font-medium text-gray-700 mb-4 text-center">🏆 Top 3 Winners</h4>
                        <div className="flex justify-center items-end space-x-4 mb-6">
                          {/* 2nd Place */}
                          <div className="flex flex-col items-center">
                            <div className="bg-gradient-to-b from-gray-300 to-gray-400 text-white rounded-lg p-4 w-32 h-24 flex flex-col justify-center items-center shadow-lg">
                              <div className="text-2xl font-bold">🥈</div>
                              <div className="text-xs font-semibold">2nd Place</div>
                            </div>
                            <div className="mt-3 text-center">
                              <p className="font-semibold text-sm">{getFilteredData()[1].playerName}</p>
                              <p className="text-xs text-gray-600">{getFilteredData()[1].teamName}</p>
                              <p className="text-lg font-bold text-purple-600">{getFilteredData()[1].finalScore || 0}</p>
                            </div>
                          </div>

                          {/* 1st Place */}
                          <div className="flex flex-col items-center">
                            <div className="bg-gradient-to-b from-yellow-400 to-yellow-500 text-white rounded-lg p-4 w-36 h-32 flex flex-col justify-center items-center shadow-xl">
                              <div className="text-3xl font-bold">🥇</div>
                              <div className="text-sm font-semibold">1st Place</div>
                            </div>
                            <div className="mt-3 text-center">
                              <p className="font-bold text-base">{getFilteredData()[0].playerName}</p>
                              <p className="text-sm text-gray-600">{getFilteredData()[0].teamName}</p>
                              <p className="text-2xl font-bold text-yellow-600">{getFilteredData()[0].finalScore || 0}</p>
                            </div>
                          </div>

                          {/* 3rd Place */}
                          <div className="flex flex-col items-center">
                            <div className="bg-gradient-to-b from-amber-600 to-amber-700 text-white rounded-lg p-4 w-32 h-20 flex flex-col justify-center items-center shadow-lg">
                              <div className="text-2xl font-bold">🥉</div>
                              <div className="text-xs font-semibold">3rd Place</div>
                            </div>
                            <div className="mt-3 text-center">
                              <p className="font-semibold text-sm">{getFilteredData()[2].playerName}</p>
                              <p className="text-xs text-gray-600">{getFilteredData()[2].teamName}</p>
                              <p className="text-lg font-bold text-purple-600">{getFilteredData()[2].finalScore || 0}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Complete Rankings List */}
                    <div>
                      <h4 className="text-md font-medium text-gray-700 mb-4">📊 Complete Rankings</h4>
                      <div className="space-y-3">
                        {getFilteredData().map((score, index) => {
                          const position = score.originalRank || (index + 1);
                          const isTopThree = position <= 3;

                          return (
                            <div
                              key={index}
                              className={`border rounded-lg p-4 ${isTopThree
                                ? 'border-yellow-300 bg-gradient-to-r from-yellow-50 to-yellow-100'
                                : 'border-gray-200 bg-white'
                                }`}
                            >
                              <div className="flex justify-between items-center">
                                <div className="flex items-center space-x-4">
                                  {/* Position Badge */}
                                  <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${position === 1 ? 'bg-yellow-500 text-white' :
                                    position === 2 ? 'bg-gray-400 text-white' :
                                      position === 3 ? 'bg-amber-600 text-white' :
                                        'bg-gray-200 text-gray-700'
                                    }`}>
                                    {position}
                                  </div>

                                  {/* Player Info */}
                                  <div>
                                    <h4 className="font-semibold flex items-center space-x-2">
                                      <span>{score.playerName}</span>
                                      {position === 1 && <span>🥇</span>}
                                      {position === 2 && <span>🥈</span>}
                                      {position === 3 && <span>🥉</span>}
                                    </h4>
                                    <p className="text-sm text-gray-600">
                                      {score.teamName} • {score.gender} • {score.ageGroup}
                                    </p>
                                    <p className="text-sm text-gray-500">
                                      Time: {score.time || 'N/A'} • Senior Judge: {score.seniorJudgeScore || 0}
                                    </p>
                                  </div>
                                </div>

                                {/* Score Info */}
                                <div className="text-right">
                                  <p className={`text-2xl font-bold ${position === 1 ? 'text-yellow-600' :
                                    position === 2 ? 'text-gray-500' :
                                      position === 3 ? 'text-amber-600' :
                                        'text-purple-600'
                                    }`}>
                                    {score.finalScore || 0}
                                  </p>
                                  
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {scores.length === 0 && (
                  <div className="text-center py-8">
                    <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No individual scores available for the selected filters.</p>
                  </div>
                )}
              </div>
            )}

            {scoreType === 'rankings' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Team Rankings</h3>

                {scores.length > 0 && (
                  <>
                    <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-800">
                        <strong>Showing rankings for:</strong> {selectedGender.label} - {selectedAgeGroup.label}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        Found {scores.length} team{scores.length !== 1 ? 's' : ''} matching your criteria
                        {searchTerm && ` (${getFilteredData().length} after search)`}
                      </p>
                    </div>

                    {/* Search Bar */}
                    <div className="mb-6">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                          type="text"
                          placeholder="Search teams by name..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                        />
                        {searchTerm && (
                          <button
                            onClick={() => setSearchTerm('')}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center"
                          >
                            <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {scores.length > 0 && getFilteredData().length === 0 && searchTerm ? (
                  <div className="text-center py-8">
                    <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-500 mb-2">No teams found</h3>
                    <p className="text-gray-400">No teams match your search term "{searchTerm}"</p>
                    <button
                      onClick={() => setSearchTerm('')}
                      className="mt-3 text-purple-600 hover:text-purple-800 font-medium"
                    >
                      Clear search
                    </button>
                  </div>
                ) : scores.length > 0 && (
                  <>
                    {/* Podium for Top 3 Teams */}
                    {getFilteredData().length >= 3 && (
                      <div className="mb-8">
                        <h4 className="text-md font-medium text-gray-700 mb-4 text-center">🏆 Top 3 Teams</h4>
                        <div className="flex justify-center items-end space-x-4 mb-6">
                          {/* 2nd Place */}
                          <div className="flex flex-col items-center">
                            <div className="bg-gradient-to-b from-gray-300 to-gray-400 text-white rounded-lg p-4 w-32 h-24 flex flex-col justify-center items-center shadow-lg">
                              <div className="text-2xl font-bold">🥈</div>
                              <div className="text-xs font-semibold">2nd Place</div>
                            </div>
                            <div className="mt-3 text-center">
                              <p className="font-semibold text-sm">{getFilteredData()[1].teamName}</p>
                              <p className="text-lg font-bold text-purple-600">{getFilteredData()[1].teamTotalScore?.toFixed(1) || 0}</p>
                              <p className="text-xs text-gray-500">Players: {getFilteredData()[1].playerCount || 0}</p>
                            </div>
                          </div>

                          {/* 1st Place */}
                          <div className="flex flex-col items-center">
                            <div className="bg-gradient-to-b from-yellow-400 to-yellow-500 text-white rounded-lg p-4 w-36 h-32 flex flex-col justify-center items-center shadow-xl">
                              <div className="text-3xl font-bold">🥇</div>
                              <div className="text-sm font-semibold">1st Place</div>
                            </div>
                            <div className="mt-3 text-center">
                              <p className="font-bold text-base">{getFilteredData()[0].teamName}</p>
                              <p className="text-2xl font-bold text-yellow-600">{getFilteredData()[0].teamTotalScore?.toFixed(1) || 0}</p>
                              <p className="text-sm text-gray-500">Players: {getFilteredData()[0].playerCount || 0}</p>
                            </div>
                          </div>

                          {/* 3rd Place */}
                          <div className="flex flex-col items-center">
                            <div className="bg-gradient-to-b from-amber-600 to-amber-700 text-white rounded-lg p-4 w-32 h-20 flex flex-col justify-center items-center shadow-lg">
                              <div className="text-2xl font-bold">🥉</div>
                              <div className="text-xs font-semibold">3rd Place</div>
                            </div>
                            <div className="mt-3 text-center">
                              <p className="font-semibold text-sm">{getFilteredData()[2].teamName}</p>
                              <p className="text-lg font-bold text-purple-600">{getFilteredData()[2].teamTotalScore?.toFixed(1) || 0}</p>
                              <p className="text-xs text-gray-500">Players: {getFilteredData()[2].playerCount || 0}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Complete Team Rankings List */}
                    <div>
                      <h4 className="text-md font-medium text-gray-700 mb-4">📊 Complete Team Rankings</h4>
                      <div className="space-y-3">
                        {getFilteredData().map((team, index) => {
                          const position = team.originalRank || (index + 1);
                          const isTopThree = position <= 3;

                          return (
                            <div
                              key={index}
                              className={`border rounded-lg p-4 ${isTopThree
                                ? 'border-yellow-300 bg-gradient-to-r from-yellow-50 to-yellow-100'
                                : 'border-gray-200 bg-white'
                                }`}
                            >
                              <div className="flex justify-between items-center">
                                <div className="flex items-center space-x-4">
                                  {/* Position Badge */}
                                  <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${position === 1 ? 'bg-yellow-500 text-white' :
                                    position === 2 ? 'bg-gray-400 text-white' :
                                      position === 3 ? 'bg-amber-600 text-white' :
                                        'bg-gray-200 text-gray-700'
                                    }`}>
                                    {position}
                                  </div>

                                  {/* Team Info */}
                                  <div>
                                    <h4 className="font-semibold flex items-center space-x-2">
                                      <span>{team.teamName}</span>
                                      {position === 1 && <span>🥇</span>}
                                      {position === 2 && <span>🥈</span>}
                                      {position === 3 && <span>🥉</span>}
                                    </h4>
                                    <p className="text-sm text-gray-600">
                                      {team.gender} • {team.ageGroup} • {team.playerCount} players scored
                                    </p>
                                    <p className="text-sm text-gray-500">
                                      Top 3 scores summed (max 3 players per team)
                                    </p>
                                  </div>
                                </div>

                                {/* Score Info */}
                                <div className="text-right">
                                  <p className={`text-2xl font-bold ${position === 1 ? 'text-yellow-600' :
                                    position === 2 ? 'text-gray-500' :
                                      position === 3 ? 'text-amber-600' :
                                        'text-purple-600'
                                    }`}>
                                    {team.teamTotalScore?.toFixed(1) || 0}
                                  </p>
                                  
                                </div>
                              </div>

                              {/* Top Players Details */}
                              {team.topPlayerScores && team.topPlayerScores.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-gray-100">
                                  <p className="text-xs text-gray-600 mb-2">Top performing players:</p>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                    {team.topPlayerScores.map((player, playerIndex) => (
                                      <div key={playerIndex} className="text-xs bg-gray-50 rounded p-2">
                                        <p className="font-medium">{player.playerName}</p>
                                        <p className="text-purple-600 font-bold">{player.finalScore || 0}</p>
                                        <p className="text-gray-500">Time: {player.time || 'N/A'}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {scores.length === 0 && (
                  <div className="text-center py-8">
                    <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No team rankings available for the selected filters.</p>
                    <p className="text-gray-400 text-sm mt-2">Teams need to have scored players to appear in rankings.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Team Details Modal */}
      {selectedTeam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">{selectedTeam.name}</h3>
                <p className="text-sm text-gray-600 mt-1">Team Details</p>
              </div>
              <button
                onClick={() => setSelectedTeam(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Team Information */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Team Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">
                      <strong>Coach:</strong> {selectedTeam.coach?.name || 'No coach assigned'}
                    </p>
                    {selectedTeam.coach?.email && (
                      <p className="text-sm text-gray-600 mt-1">
                        <strong>Email:</strong> {selectedTeam.coach.email}
                      </p>
                    )}
                    {selectedTeam.coach?.phone && (
                      <p className="text-sm text-gray-600 mt-1">
                        <strong>Phone:</strong> {selectedTeam.coach.phone}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">
                      <strong>Total Players:</strong> {selectedTeam.players?.length || 0}
                    </p>
                    {selectedTeam.createdAt && (
                      <p className="text-sm text-gray-600 mt-1">
                        <strong>Registered:</strong> {new Date(selectedTeam.createdAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                {selectedTeam.description && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-sm text-gray-600">
                      <strong>Description:</strong> {selectedTeam.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Players List */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">
                  Players ({selectedTeam.players?.length || 0})
                </h4>
                {selectedTeam.players && selectedTeam.players.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedTeam.players.map((playerEntry, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-900">
                              {playerEntry.player.firstName} {playerEntry.player.lastName}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              <strong>Gender:</strong> {playerEntry.player.gender}
                            </p>
                            <p className="text-sm text-gray-600">
                              <strong>Age Group:</strong> {playerEntry.ageGroup || 'Not assigned'}
                            </p>
                            {playerEntry.player.dateOfBirth && (
                              <p className="text-sm text-gray-600">
                                <strong>DOB:</strong> {new Date(playerEntry.player.dateOfBirth).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Active
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">No players registered for this team</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end p-6 border-t border-gray-200">
              <button
                onClick={() => setSelectedTeam(null)}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Scores;