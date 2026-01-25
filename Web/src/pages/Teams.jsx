import { useState, useEffect } from 'react';
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
import { ResponsiveTeamTable } from '../components/responsive/ResponsiveTable';
import { ResponsiveContainer } from '../components/responsive/ResponsiveContainer';
import { ResponsiveTeamFilters } from '../components/responsive/ResponsiveFilters';

const Teams = () => {
  
  // State management
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [loading, setLoading] = useState(false);

  // Filters
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

  // Reset age group when gender changes
  useEffect(() => {
    if (selectedGender) {
      setSelectedAgeGroup(null);
    }
  }, [selectedGender]);

  // Auto-load teams when both filters are selected
  useEffect(() => {
    if (selectedGender && selectedAgeGroup) {
      fetchTeams();
    } else {
      setTeams([]);
    }
  }, [selectedGender, selectedAgeGroup]);

  // API Functions
  const fetchTeams = async () => {
    if (!selectedGender || !selectedAgeGroup) {
      return;
    }

    setLoading(true);
    try {
      const params = {
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value
      };
      const response = await adminAPI.getAllTeams(params);
      setTeams(response.data.teams);
      toast.success(`Loaded ${response.data.teams.length} teams`);
    } catch (error) {
      toast.error('Failed to load teams');
      console.error('Error fetching teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamDetails = async (teamId) => {
    try {
      const response = await adminAPI.getTeamDetails(teamId);
      setSelectedTeam(response.data.team);
    } catch (error) {
      toast.error('Failed to load team details');
      console.error('Error fetching team details:', error);
    }
  };

  const handleClearFilters = () => {
    setSelectedGender(null);
    setSelectedAgeGroup(null);
    setTeams([]);
    setSearchTerm('');
  };

  // Filter teams based on search term
  const filteredTeams = teams.filter(team => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    const teamName = team.name?.toLowerCase() || '';
    const coachName = team.coach?.name?.toLowerCase() || '';
    
    return teamName.includes(searchLower) || coachName.includes(searchLower);
  });

  return (
    <div className="space-y-6">
      <div className="max-w-7xl mx-auto">

        {/* Main Content */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Teams Management</h2>

          {/* Filter Section */}
          <ResponsiveTeamFilters
            selectedGender={selectedGender}
            onGenderChange={setSelectedGender}
            selectedAgeGroup={selectedAgeGroup}
            onAgeGroupChange={setSelectedAgeGroup}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onClearFilters={handleClearFilters}
          />

          {/* Teams Display */}
          {!selectedGender || !selectedAgeGroup ? (
            <div className="text-center py-5">
              <Filter className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-500 mb-2">Select Filters to View Teams</h3>
              <p className="text-gray-400 mb-6">
                Please select both gender and age group filters above to view teams.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
                <p className="text-sm text-blue-800">
                  <strong>Required:</strong> Gender and Age Group filters must be selected. Teams will load automatically.
                </p>
              </div>
            </div>
          ) : loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Loading teams...</p>
            </div>
          ) : teams.length > 0 ? (
            <div>
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">
                  <strong>Showing teams for:</strong> {selectedGender.label} - {selectedAgeGroup.label}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  Found {teams.length} team{teams.length !== 1 ? 's' : ''} matching your criteria
                  {searchTerm && ` (${filteredTeams.length} after search)`}
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

              {filteredTeams.length === 0 && searchTerm ? (
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
                  teams={filteredTeams}
                  onTeamClick={fetchTeamDetails}
                  searchTerm={searchTerm}
                />
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Trophy className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-500 mb-2">No Teams Found</h3>
              <p className="text-gray-500 mb-2">No teams found for the selected filters.</p>
              <p className="text-gray-400 text-sm">Try different filter combinations or check if teams have been registered for this category.</p>
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
    </div>
  );
};

export default Teams;