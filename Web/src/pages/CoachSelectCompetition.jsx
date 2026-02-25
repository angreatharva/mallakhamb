import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Calendar, MapPin, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { coachAPI } from '../services/api';
import apiConfig from '../utils/apiConfig.js';
import { ResponsiveContainer } from '../components/responsive';
import { ResponsiveHeading, ResponsiveText } from '../components/responsive/ResponsiveTypography';

const CoachSelectCompetition = () => {
  const [competitions, setCompetitions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [competitionsRes, teamsRes] = await Promise.all([
        coachAPI.getOpenCompetitions(),
        coachAPI.getTeams()
      ]);
      setCompetitions(competitionsRes.data.competitions || []);
      setTeams(teamsRes.data.teams || []);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCompetition = async () => {
    if (!selectedCompetition) {
      toast.error('Please select a competition');
      return;
    }

    if (!selectedTeam) {
      toast.error('Please select a team to register');
      return;
    }

    setSubmitting(true);
    try {
      // First, register the team for the competition
      await coachAPI.registerTeamForCompetition(selectedTeam, selectedCompetition);

      // Then set the competition context
      const token = localStorage.getItem('coach_token');
      const authResponse = await fetch(`${apiConfig.getBaseUrl()}/auth/set-competition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ competitionId: selectedCompetition }),
      });

      if (!authResponse.ok) {
        const errorData = await authResponse.json();
        throw new Error(errorData.message || 'Failed to set competition context');
      }

      const authData = await authResponse.json();

      // Update token with competition context
      localStorage.setItem('coach_token', authData.token);

      toast.success('Team registered for competition successfully!');

      // Navigate to dashboard
      navigate('/coach/dashboard');
    } catch (error) {
      console.error('Competition selection error:', error);
      toast.error(error.response?.data?.message || error.message || 'Failed to register team');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ongoing':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'upcoming':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Filter competitions based on search query
  const filteredCompetitions = competitions.filter((competition) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      competition.name?.toLowerCase().includes(query) ||
      competition.place?.toLowerCase().includes(query) ||
      competition.level?.toLowerCase().includes(query) ||
      competition.status?.toLowerCase().includes(query) ||
      competition.description?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <ResponsiveText className="mt-4 text-gray-600">Loading competitions...</ResponsiveText>
        </div>
      </div>
    );
  }

  if (competitions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <Trophy className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <ResponsiveHeading level={2} className="text-gray-900 mb-2">No Competitions Available</ResponsiveHeading>
          <ResponsiveText className="text-gray-600 mb-6">
            There are no open competitions at the moment. Please check back later.
          </ResponsiveText>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 min-h-[44px]"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <Trophy className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <ResponsiveHeading level={2} className="text-gray-900 mb-2">No Teams Found</ResponsiveHeading>
          <ResponsiveText className="text-gray-600 mb-6">
            You need to create a team first before registering for competitions.
          </ResponsiveText>
          <button
            onClick={() => navigate('/coach/create-team')}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 min-h-[44px]"
          >
            Create Team
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <ResponsiveContainer maxWidth="desktop" padding="responsive" className="py-8 md:py-12">
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="bg-green-100 p-3 rounded-full">
                <Trophy className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <ResponsiveHeading level={1} className="text-gray-900 mb-2">
              Register Team for Competition
            </ResponsiveHeading>
            <ResponsiveText className="text-gray-600">
              Select a team and competition to register
            </ResponsiveText>
          </div>

          {/* Team Selection */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Step 1: Select Your Team</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {teams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeam(team.id)}
                  disabled={submitting}
                  className={`text-left p-6 rounded-lg border-2 transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                    selectedTeam === team.id
                      ? 'border-green-600 bg-green-50 shadow-md'
                      : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-lg font-semibold text-gray-900 flex-1">
                      {team.name}
                    </h4>
                    {selectedTeam === team.id && (
                      <svg
                        className="w-6 h-6 text-green-600 flex-shrink-0 ml-2"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  {team.description && (
                    <p className="text-sm text-gray-600">{team.description}</p>
                  )}
                  {team.competitions && team.competitions.length > 0 && (
                    <div className="mt-2 text-xs text-gray-500">
                      Already registered for {team.competitions.length} competition(s)
                    </div>
                  )}
                </button>
              ))}
            </div>
            {teams.length === 0 && (
              <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <ResponsiveText className="text-gray-600 mb-4">
                  You don't have any teams yet. Create a team first.
                </ResponsiveText>
                <button
                  onClick={() => navigate('/coach/create-team')}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                >
                  Create New Team
                </button>
              </div>
            )}
          </div>

          {/* Competition Selection */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Step 2: Select Competition</h3>
            
            {/* Search Bar */}
            {competitions.length > 3 && (
              <div className="mb-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search competitions by name, place, level, or status..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-3 pl-11 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <svg
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* No Results or Competition Grid */}
            {filteredCompetitions.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="mt-4 text-gray-600">No competitions found matching "{searchQuery}"</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-green-600 hover:text-green-700"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredCompetitions.map((competition) => (
              <button
                key={competition.id}
                onClick={() => setSelectedCompetition(competition.id)}
                disabled={submitting}
                className={`text-left p-6 rounded-lg border-2 transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                  selectedCompetition === competition.id
                    ? 'border-green-600 bg-green-50 shadow-md'
                    : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                      {competition.name} {competition.year || ''}
                    </h3>
                  </div>
                  {selectedCompetition === competition.id && (
                    <svg
                      className="w-6 h-6 text-green-600 flex-shrink-0 ml-2"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <MapPin className="w-4 h-4" />
                    <span>{competition.place}</span>
                    <span>•</span>
                    <span className="capitalize">{competition.level}</span>
                  </div>

                  {competition.startDate && competition.endDate && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {new Date(competition.startDate).toLocaleDateString()} -{' '}
                        {new Date(competition.endDate).toLocaleDateString()}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                        competition.status
                      )}`}
                    >
                      {competition.status}
                    </span>
                  </div>

                  {competition.description && (
                    <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                      {competition.description}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
            )}
          </div>

          <div className="flex justify-center">
            <button
              onClick={handleSelectCompetition}
              disabled={!selectedCompetition || !selectedTeam || submitting}
              className="px-8 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2 min-h-[44px]"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Registering...</span>
                </>
              ) : (
                <>
                  <span>Register Team & Continue</span>
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </ResponsiveContainer>
    </div>
  );
};

export default CoachSelectCompetition;
