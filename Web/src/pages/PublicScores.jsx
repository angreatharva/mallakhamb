import { useState, useEffect } from 'react';
import { Filter, Search, X, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { publicAPI } from '../services/api';
import Dropdown from '../components/Dropdown';
import { ResponsiveContainer } from '../components/responsive/ResponsiveContainer';
import { ResponsiveHeading, ResponsiveText } from '../components/responsive/ResponsiveTypography';

const PublicScores = () => {
  // State management
  const [teams, setTeams] = useState([]);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);

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

  // Get available age groups based on selected gender
  const getAvailableAgeGroups = () => {
    if (!selectedGender) return [];
    return selectedGender.value === 'Male' ? boysAgeGroups : girlsAgeGroups;
  };

  // Reset dependent filters when parent filter changes
  useEffect(() => {
    if (selectedGender) {
      setSelectedAgeGroup(null);
    }
  }, [selectedGender]);

  useEffect(() => {
    if (selectedTeam) {
      setSelectedGender(null);
      setSelectedAgeGroup(null);
    }
  }, [selectedTeam]);

  // Load teams on component mount
  useEffect(() => {
    fetchTeams();
  }, []);

  // Auto-load scores when all filters are selected
  useEffect(() => {
    if (selectedTeam && selectedGender && selectedAgeGroup) {
      fetchScores();
    } else {
      setScores([]);
    }
  }, [selectedTeam, selectedGender, selectedAgeGroup]);

  // API Functions
  const fetchTeams = async () => {
    try {
      const response = await publicAPI.getTeams();
      setTeams(response.data.teams || []);
    } catch (error) {
      toast.error('Failed to load teams');
      console.error('Error fetching teams:', error);
    }
  };

  const fetchScores = async () => {
    if (!selectedTeam || !selectedGender || !selectedAgeGroup) {
      return;
    }

    setLoading(true);
    try {
      const params = {
        teamId: selectedTeam.value,
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value
      };

      const response = await publicAPI.getScores(params);
      setScores(response.data.scores || []);

      if (!response.data.scores || response.data.scores.length === 0) {
        toast.info('No scores found for this team and category');
      }
    } catch (error) {
      toast.error('Failed to load scores');
      console.error('Error fetching scores:', error);
      setScores([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setSelectedTeam(null);
    setSelectedGender(null);
    setSelectedAgeGroup(null);
    setScores([]);
    setSearchTerm('');
  };

  // Filter scores based on search term
  const getFilteredScores = () => {
    if (!scores.length) return [];

    return scores.map(scoreEntry => ({
      ...scoreEntry,
      playerScores: scoreEntry.playerScores.filter(player => {
        if (!searchTerm) return true;
        const searchLower = searchTerm.toLowerCase();
        const playerName = player.playerName?.toLowerCase() || '';
        return playerName.includes(searchLower);
      })
    })).filter(scoreEntry => scoreEntry.playerScores.length > 0);
  };

  // Get team options for dropdown
  const getTeamOptions = () => {
    return teams.map(team => ({
      value: team._id,
      label: team.name
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Fixed Header / Navbar */}
<div className="fixed top-0 left-0 w-full bg-white shadow-sm border-b z-50">
  <ResponsiveContainer maxWidth="full" padding="responsive">
    <div className="flex items-center justify-between py-4">
      <div className="flex items-center space-x-4">
        <Link
          to="/"
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back to Home</span>
        </Link>

        <div className="h-6 w-px bg-gray-300"></div>

        <ResponsiveHeading level={1} className="text-gray-900">
          View Scores
        </ResponsiveHeading>
      </div>
    </div>
  </ResponsiveContainer>
</div>


      {/* Main Content */}
      <ResponsiveContainer maxWidth="full" padding="responsive" className="pt-28 pb-8">
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <div className="mb-8">
            <ResponsiveHeading level={2} className="text-gray-900 mb-2">
              Competition Scores
            </ResponsiveHeading>
            <ResponsiveText className="text-gray-600">
              Select a team, gender, and age group to view the competition scores.
            </ResponsiveText>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Team Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Team
              </label>
              <Dropdown
                options={getTeamOptions()}
                value={selectedTeam}
                onChange={setSelectedTeam}
                placeholder="Choose a team..."
                className="w-full"
              />
            </div>

            {/* Gender Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Gender
              </label>
              <Dropdown
                options={genders}
                value={selectedGender}
                onChange={setSelectedGender}
                placeholder="Choose gender..."
                className="w-full"
                disabled={!selectedTeam}
              />
            </div>

            {/* Age Group Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Age Group
              </label>
              <Dropdown
                options={getAvailableAgeGroups()}
                value={selectedAgeGroup}
                onChange={setSelectedAgeGroup}
                placeholder="Choose age group..."
                className="w-full"
                disabled={!selectedGender}
              />
            </div>
          </div>

          {/* Clear Filters Button */}
          {(selectedTeam || selectedGender || selectedAgeGroup) && (
            <div className="mb-6">
              <button
                onClick={handleClearFilters}
                className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <X className="h-4 w-4" />
                <span>Clear All Filters</span>
              </button>
            </div>
          )}

          {/* Content Area */}
          {!selectedTeam || !selectedGender || !selectedAgeGroup ? (
            <div className="text-center py-12">
              <Filter className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <ResponsiveHeading level={3} className="text-gray-500 mb-2">
                Select Filters to View Scores
              </ResponsiveHeading>
              <ResponsiveText className="text-gray-400 mb-6">
                Please select a team, gender, and age group to view scores.
              </ResponsiveText>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
                <ResponsiveText size="sm" className="text-blue-800">
                  <strong>Required:</strong> All three filters must be selected to view scores.
                </ResponsiveText>
              </div>
            </div>
          ) : loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <ResponsiveText className="text-gray-500">Loading scores...</ResponsiveText>
            </div>
          ) : (
            <div>
              {/* Search Bar */}
              {scores.length > 0 && (
                <div className="mb-6">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search players by name..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white text-gray-900"
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
              )}

              {/* Scores Display */}
              {scores.length > 0 ? (
                <div className="space-y-6">
                  {/* Category Info */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <ResponsiveText size="sm" className="text-blue-800">
                      <strong>Showing scores for:</strong> {selectedTeam.label} - {selectedGender.label} - {selectedAgeGroup.label}
                    </ResponsiveText>
                  </div>

                  {getFilteredScores().map((scoreEntry) => (
                    <div key={scoreEntry._id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      {/* Score Header */}
                      <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                          <div>
                            <ResponsiveHeading level={3} className="text-gray-900">
                              {scoreEntry.teamName}
                            </ResponsiveHeading>
                            <ResponsiveText size="sm" className="text-gray-600">
                              {scoreEntry.gender} - {scoreEntry.ageGroup}
                            </ResponsiveText>
                          </div>
                          <div className="mt-2 md:mt-0 text-right">
                            <ResponsiveText size="sm" className="text-gray-500">
                              Scored on: {new Date(scoreEntry.createdAt).toLocaleDateString()}
                            </ResponsiveText>
                          </div>
                        </div>
                      </div>

                      {/* Player Scores */}
                      <div className="p-6">
                        {scoreEntry.playerScores.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Player Name
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Time
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Judge Scores
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Average
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Deductions
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Final Score
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {scoreEntry.playerScores
                                  .sort((a, b) => b.finalScore - a.finalScore)
                                  .map((player, playerIndex) => (
                                  <tr key={player.playerId} className="">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="flex items-center">
                                        <div>
                                          <div className="text-sm font-medium text-gray-900">
                                            {player.playerName}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                      {player.time || 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                      <div className="space-y-1">
                                        <div>Senior: {player.judgeScores.seniorJudge}</div>
                                        <div className="text-xs text-gray-500">
                                          J1: {player.judgeScores.judge1}, J2: {player.judgeScores.judge2}, 
                                          J3: {player.judgeScores.judge3}, J4: {player.judgeScores.judge4}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                      {player.averageMarks.toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                      <div className="space-y-1">
                                        <div>Time: -{player.deduction}</div>
                                        <div>Other: -{player.otherDeduction}</div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-lg font-bold text-blue-600">
                                        {player.finalScore.toFixed(2)}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <ResponsiveText className="text-gray-500">
                              No player scores found.
                            </ResponsiveText>
                          </div>
                        )}

                        {/* Additional Info */}
                        {(scoreEntry.timeKeeper || scoreEntry.scorer || scoreEntry.remarks) && (
                          <div className="mt-6 pt-6 border-t border-gray-200">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                              {scoreEntry.timeKeeper && (
                                <div>
                                  <span className="font-medium text-gray-700">Time Keeper:</span>
                                  <span className="ml-2 text-gray-600">{scoreEntry.timeKeeper}</span>
                                </div>
                              )}
                              {scoreEntry.scorer && (
                                <div>
                                  <span className="font-medium text-gray-700">Scorer:</span>
                                  <span className="ml-2 text-gray-600">{scoreEntry.scorer}</span>
                                </div>
                              )}
                              {scoreEntry.remarks && (
                                <div className="md:col-span-3">
                                  <span className="font-medium text-gray-700">Remarks:</span>
                                  <span className="ml-2 text-gray-600">{scoreEntry.remarks}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {getFilteredScores().length === 0 && searchTerm && (
                    <div className="text-center py-8">
                      <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <ResponsiveHeading level={3} className="text-gray-500 mb-2">
                        No players found
                      </ResponsiveHeading>
                      <ResponsiveText className="text-gray-400">
                        No players match your search term "{searchTerm}"
                      </ResponsiveText>
                      <button
                        onClick={() => setSearchTerm('')}
                        className="mt-3 text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Clear search
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="h-16 w-16 text-gray-300 mx-auto mb-4 flex items-center justify-center">
                    <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                  </div>
                  <ResponsiveHeading level={3} className="text-gray-500 mb-2">
                    No Scores Available
                  </ResponsiveHeading>
                  <ResponsiveText className="text-gray-400">
                    No scores have been published for this team and category yet.
                  </ResponsiveText>
                  <ResponsiveText size="sm" className="text-gray-400 mt-2">
                    Scores will appear here after judges complete their scoring and results are finalized.
                  </ResponsiveText>
                </div>
              )}
            </div>
          )}
        </div>
      </ResponsiveContainer>
    </div>
  );
};

export default PublicScores;