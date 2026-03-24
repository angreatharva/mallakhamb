import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Filter, Users, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '../services/api';
import { useRouteContext } from '../contexts/RouteContext';
import { useAgeGroups } from '../hooks/useAgeGroups';
import Dropdown from '../components/Dropdown';
import { ResponsiveTeamTable } from '../components/responsive/ResponsiveTable';
import { ResponsiveIndividualRankings, ResponsiveTeamRankings } from '../components/responsive/ResponsiveRankings';
import { logger } from '../utils/logger';
import { ResponsiveContainer } from '../components/responsive/ResponsiveContainer';
import { ResponsiveScoreFilters } from '../components/responsive/ResponsiveFilters';

const Scores = () => {
  const navigate = useNavigate();
  const { routePrefix, storagePrefix } = useRouteContext();
  const api = routePrefix === '/superadmin' ? superAdminAPI : adminAPI;
  const isSuperAdmin = routePrefix === '/superadmin';

  // Competition selector state (superadmin only)
  const [competitions, setCompetitions] = useState([]);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);

  const [scores, setScores] = useState([]);
  const [submittedTeams, setSubmittedTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ageGroupStarted, setAgeGroupStarted] = useState(false);

  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [selectedCompetitionType, setSelectedCompetitionType] = useState(null);
  const [scoreType, setScoreType] = useState('add');
  const [searchTerm, setSearchTerm] = useState('');

  const genders = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' }
  ];

  const scoreTypes = [
    { value: 'add', label: 'Add Score' },
    { value: 'individual', label: 'Individual Rankings' },
    { value: 'rankings', label: 'Team Rankings' }
  ];

  const competitionTypes = [
    { value: 'competition_1', label: 'Competition I - Team Championship' },
    { value: 'competition_2', label: 'Competition II - All Round Individual' },
    { value: 'competition_3', label: 'Competition III - Apparatus Championship' }
  ];

  const availableAgeGroups = useAgeGroups(selectedGender?.value || 'Male');

  // Fetch competitions for superadmin
  useEffect(() => {
    if (isSuperAdmin) {
      setLoadingCompetitions(true);
      superAdminAPI.getAllCompetitions()
        .then(res => setCompetitions(res.data.competitions || []))
        .catch(() => toast.error('Failed to load competitions'))
        .finally(() => setLoadingCompetitions(false));
    }
  }, [isSuperAdmin]);

  // Reset filters when competition changes
  useEffect(() => {
    setSelectedGender(null);
    setSelectedAgeGroup(null);
    setSelectedCompetitionType(null);
    setSubmittedTeams([]);
    setScores([]);
    setSearchTerm('');
  }, [selectedCompetition]);

  useEffect(() => {
    if (selectedGender) setSelectedAgeGroup(null);
  }, [selectedGender]);

  // Auto-load data when filters are selected
  useEffect(() => {
    if (isSuperAdmin && !selectedCompetition) return;
    if (selectedGender && selectedAgeGroup && selectedCompetitionType) {
      if (scoreType === 'add') {
        fetchSubmittedTeams();
      } else if (scoreType === 'individual') {
        fetchIndividualScores();
      } else if (scoreType === 'rankings') {
        fetchTeamRankings();
      }
    } else {
      setSubmittedTeams([]);
      setScores([]);
    }
  }, [selectedGender, selectedAgeGroup, selectedCompetitionType, scoreType, selectedCompetition]);

  // API Functions
  const fetchSubmittedTeams = async () => {
    if (!selectedGender || !selectedAgeGroup || !selectedCompetitionType) return;
    if (isSuperAdmin && !selectedCompetition) return;

    setLoading(true);
    try {
      const params = {
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value,
        competitionType: selectedCompetitionType.value,
        ...(isSuperAdmin && selectedCompetition ? { competition: selectedCompetition.value } : {})
      };

      const response = await api.getSubmittedTeams(params);
      setSubmittedTeams(response.data.teams);

      // Check if this specific competition type is started
      const summaryResponse = await api.getAllJudgesSummary();
      const ageGroupInfo = summaryResponse.data.summary.find(
        item => item.gender === selectedGender.value && item.ageGroup === selectedAgeGroup.value
      );
      
      const compTypeStarted = ageGroupInfo?.competitionTypes?.[selectedCompetitionType.value]?.isStarted || false;
      setAgeGroupStarted(compTypeStarted);
    } catch (error) {
      toast.error('Failed to load submitted teams');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamScores = async () => {
    if (!selectedGender || !selectedAgeGroup) return;
    if (isSuperAdmin && !selectedCompetition) return;

    setLoading(true);
    try {
      const params = {
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value,
        ...(isSuperAdmin && selectedCompetition ? { competition: selectedCompetition.value } : {})
      };

      const response = await api.getTeamScores(params);
      setScores(response.data.teamScores);
    } catch (error) {
      toast.error('Failed to load team scores');
    } finally {
      setLoading(false);
    }
  };

  const fetchIndividualScores = async () => {
    if (!selectedGender || !selectedAgeGroup) return;
    if (isSuperAdmin && !selectedCompetition) return;

    setLoading(true);
    try {
      const params = {
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value,
        ...(isSuperAdmin && selectedCompetition ? { competition: selectedCompetition.value } : {})
      };

      logger.log('Fetching individual scores with params:', params);
      const response = await api.getIndividualScores(params);
      logger.log('Individual scores response:', response.data);
      
      setScores(response.data.individualScores || []);
      
      if (!response.data.individualScores || response.data.individualScores.length === 0) {
        toast.info('No individual scores found for this category');
      }
    } catch (error) {
      logger.error('Failed to load individual scores:', error);
      toast.error('Failed to load individual scores');
      setScores([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamRankings = async () => {
    if (!selectedGender || !selectedAgeGroup) return;
    if (isSuperAdmin && !selectedCompetition) return;

    setLoading(true);
    try {
      const params = {
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value,
        ...(isSuperAdmin && selectedCompetition ? { competition: selectedCompetition.value } : {})
      };

      logger.log('Fetching team rankings with params:', params);
      const response = await api.getTeamRankings(params);
      logger.log('Team rankings response:', response.data);
      
      setScores(response.data.teamRankings || []);
      
      if (!response.data.teamRankings || response.data.teamRankings.length === 0) {
        toast.info('No team rankings found for this category');
      }
    } catch (error) {
      logger.error('Failed to load team rankings:', error);
      toast.error('Failed to load team rankings');
      setScores([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setSelectedGender(null);
    setSelectedAgeGroup(null);
    setSelectedCompetitionType(null);
    setSubmittedTeams([]);
    setScores([]);
    setSearchTerm('');
    if (isSuperAdmin) setSelectedCompetition(null);
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
      
      if (scoreType === 'individual') {
        const playerName = score.playerName?.toLowerCase() || '';
        const teamName = score.teamName?.toLowerCase() || '';
        return playerName.includes(searchLower) || teamName.includes(searchLower);
      } else if (scoreType === 'rankings') {
        const teamName = score.teamName?.toLowerCase() || '';
        return teamName.includes(searchLower);
      }
      
      return true;
    });

    return filteredScores;
  };

  const competitionOptions = competitions.map(c => ({ value: c._id, label: c.name }));
  const filtersReady = !isSuperAdmin || selectedCompetition;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Scoring System</h2>

        {/* Competition selector - superadmin only */}
        {isSuperAdmin && (
          <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
            <label className="block text-sm font-semibold text-indigo-800 mb-2">
              Competition <span className="text-red-500">*</span>
            </label>
            <Dropdown
              options={competitionOptions}
              value={selectedCompetition}
              onChange={setSelectedCompetition}
              placeholder={loadingCompetitions ? 'Loading competitions...' : 'Select a competition first'}
              disabled={loadingCompetitions}
            />
            {!selectedCompetition && (
              <p className="text-xs text-indigo-600 mt-2">Select a competition to enable the filters below.</p>
            )}
          </div>
        )}

        {/* Score Type Selection */}
        <div className={!filtersReady ? 'opacity-50 pointer-events-none' : ''}>
          <ResponsiveScoreFilters
            scoreType={scoreType}
            onScoreTypeChange={setScoreType}
            selectedGender={selectedGender}
            onGenderChange={setSelectedGender}
            selectedAgeGroup={selectedAgeGroup}
            onAgeGroupChange={setSelectedAgeGroup}
            selectedCompetitionType={selectedCompetitionType}
            onCompetitionTypeChange={setSelectedCompetitionType}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onClearFilters={handleClearFilters}
            ageGroups={availableAgeGroups}
            competitionTypes={competitionTypes}
          />
        </div>

        {/* Score Content - Only show after filters are applied */}
        {!filtersReady ? (
          <div className="text-center py-10">
            <Filter className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-500 mb-2">Select a Competition First</h3>
            <p className="text-gray-400">Choose a competition above to start filtering scores.</p>
          </div>
        ) : !selectedGender || !selectedAgeGroup || !selectedCompetitionType ? (
          <div className="text-center py-5">
            <Filter className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-500 mb-2">Select Filters to View Scores</h3>
            <p className="text-gray-400 mb-6">
              Please select gender, age group, and competition type filters above to view scores.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
              <p className="text-sm text-blue-800">
                <strong>Required:</strong> Gender, Age Group, and Competition Type filters must be selected. Data will load automatically.
              </p>
            </div>
          </div>
        ) : loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading data...</p>
          </div>
        ) : (
          <div>
            {scoreType === 'add' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Add New Score</h3>
                {submittedTeams.length > 0 && (
                  <>
                    <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-800">
                        <strong>Showing teams for:</strong> {selectedGender.label} - {selectedAgeGroup.label} - {selectedCompetitionType.label}
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
                          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 sm:text-sm bg-white text-gray-900"
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
                      <ResponsiveTeamTable
                        teams={getFilteredData()}
                        onTeamClick={(teamId) => {
                          const team = submittedTeams.find(t => t._id === teamId);
                          if (team) {
                            navigate(`${routePrefix}/scoring`, {
                              state: { 
                                selectedTeam: team, 
                                selectedGender, 
                                selectedAgeGroup,
                                selectedCompetitionType
                              }
                            });
                          }
                        }}
                        searchTerm={searchTerm}
                        renderMobileCard={(team, index) => (
                          <div key={team._id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="space-y-3">
                              <div>
                                <h4 className="font-bold text-lg text-gray-900">Team: {team.name}</h4>
                                <p className="text-sm text-gray-600 mt-1"><strong>Coach:</strong> {team.coach?.name || 'Unknown'}</p>
                                <p className="text-sm text-gray-500 mt-1">
                                  Submitted: {new Date(team.submittedAt).toLocaleDateString()}
                                </p>
                              </div>
                              
                              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                                <span className="text-sm text-gray-600">Total Players</span>
                                <span className="text-lg font-bold text-purple-600">{team.players?.length || 0}</span>
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center space-x-3">
                                  <span className="text-sm text-green-600 font-medium">✓ Payment Completed</span>
                                </div>
                                
                                <button
                                  onClick={() => {
                                    navigate(`${routePrefix}/scoring`, {
                                      state: { 
                                        selectedTeam: team, 
                                        selectedGender, 
                                        selectedAgeGroup,
                                        selectedCompetitionType
                                      }
                                    });
                                  }}
                                  className="w-full px-3 py-2 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 flex items-center justify-center space-x-1"
                                >
                                  <span>View Details →</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      />
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

            {/* Individual Rankings */}
            {scoreType === 'individual' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Individual Rankings</h3>
                {scores.length > 0 ? (
                  <>
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <strong>Showing individual rankings for:</strong> {selectedGender.label} - {selectedAgeGroup.label}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        Found {scores.length} player{scores.length !== 1 ? 's' : ''} with scores
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
                          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 sm:text-sm bg-white text-gray-900"
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

                    {getFilteredData().length === 0 && searchTerm ? (
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
                    ) : (
                      <ResponsiveIndividualRankings
                        players={getFilteredData()}
                        searchTerm={searchTerm}
                      />
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No individual scores found for this category.</p>
                    <p className="text-gray-400 text-sm mt-2">Scores will appear here after judges complete their scoring.</p>
                  </div>
                )}
              </div>
            )}

            {/* Team Rankings */}
            {scoreType === 'rankings' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Team Rankings</h3>
                {scores.length > 0 ? (
                  <>
                    <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                      <p className="text-sm text-purple-800">
                        <strong>Showing team rankings for:</strong> {selectedGender.label} - {selectedAgeGroup.label}
                      </p>
                      <p className="text-xs text-purple-600 mt-1">
                        Found {scores.length} team{scores.length !== 1 ? 's' : ''} with scores (based on top 3 players per team)
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
                          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 sm:text-sm bg-white text-gray-900"
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

                    {getFilteredData().length === 0 && searchTerm ? (
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
                      <ResponsiveTeamRankings
                        teams={getFilteredData()}
                        searchTerm={searchTerm}
                      />
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No team rankings found for this category.</p>
                    <p className="text-gray-400 text-sm mt-2">Rankings will appear here after teams have completed scoring.</p>
                  </div>
                )}
              </div>
            )}
          </div>
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
