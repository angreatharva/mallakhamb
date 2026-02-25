import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompetition } from '../contexts/CompetitionContext';
import toast from 'react-hot-toast';

const CompetitionSelectionScreen = ({ userType, onCompetitionSelected }) => {
  const navigate = useNavigate();
  const { assignedCompetitions, switchCompetition, isLoading } = useCompetition();
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-select if only one competition
  useEffect(() => {
    if (!isLoading && assignedCompetitions && assignedCompetitions.length === 1) {
      handleAutoSelect(assignedCompetitions[0]._id);
    }
  }, [isLoading, assignedCompetitions]);

  const handleAutoSelect = async (competitionId) => {
    try {
      setIsSelecting(true);
      await switchCompetition(competitionId);
      
      // Call the callback if provided
      if (onCompetitionSelected) {
        onCompetitionSelected(competitionId);
      }
      
      // Navigate to appropriate dashboard
      navigateToDashboard();
    } catch (error) {
      console.error('Failed to auto-select competition:', error);
      toast.error('Failed to select competition');
      setIsSelecting(false);
    }
  };

  const handleCompetitionSelect = async () => {
    if (!selectedCompetition) {
      toast.error('Please select a competition');
      return;
    }

    try {
      setIsSelecting(true);
      await switchCompetition(selectedCompetition);
      
      // Call the callback if provided
      if (onCompetitionSelected) {
        onCompetitionSelected(selectedCompetition);
      }
      
      // Navigate to appropriate dashboard
      navigateToDashboard();
    } catch (error) {
      console.error('Failed to select competition:', error);
      toast.error('Failed to select competition');
      setIsSelecting(false);
    }
  };

  const navigateToDashboard = () => {
    switch (userType) {
      case 'admin':
        navigate('/admin/dashboard');
        break;
      case 'superadmin':
        navigate('/superadmin/dashboard');
        break;
      case 'coach':
        navigate('/coach/dashboard');
        break;
      case 'player':
        navigate('/player/dashboard');
        break;
      case 'judge':
        navigate('/judge');
        break;
      default:
        navigate('/');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ongoing':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'upcoming':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Filter competitions based on search query
  const filteredCompetitions = assignedCompetitions?.filter((competition) => {
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 text-lg">Loading competitions...</p>
        </div>
      </div>
    );
  }

  if (!assignedCompetitions || assignedCompetitions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="mb-4">
            <svg
              className="mx-auto h-16 w-16 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Competitions Available</h2>
          <p className="text-gray-600 mb-6">
            You are not assigned to any competitions yet. Please contact your administrator.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-4xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Select Competition</h1>
          <p className="text-gray-600">
            Choose a competition to continue to your dashboard
          </p>
        </div>

        {/* Search Bar */}
        {assignedCompetitions && assignedCompetitions.length > 3 && (
          <div className="mb-6">
            <div className="relative">
              <input
                type="text"
                placeholder="Search competitions by name, place, level, or status..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 pl-11 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

        {/* No Results Message */}
        {filteredCompetitions && filteredCompetitions.length === 0 ? (
          <div className="text-center py-12">
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
              className="mt-2 text-blue-600 hover:text-blue-700"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {filteredCompetitions?.map((competition) => (
            <button
              key={competition._id}
              onClick={() => setSelectedCompetition(competition._id)}
              disabled={isSelecting}
              className={`text-left p-6 rounded-lg border-2 transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedCompetition === competition._id
                  ? 'border-blue-600 bg-blue-50 shadow-md'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                    {competition.name} {competition.year || ''}
                  </h3>
                </div>
                {selectedCompetition === competition._id && (
                  <svg
                    className="w-6 h-6 text-blue-600 flex-shrink-0 ml-2"
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
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>{competition.place}</span>
                  <span>•</span>
                  <span className="capitalize">{competition.level}</span>
                </div>

                {competition.startDate && competition.endDate && (
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
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

        <div className="flex justify-center">
          <button
            onClick={handleCompetitionSelect}
            disabled={!selectedCompetition || isSelecting}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSelecting ? (
              <span className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Loading...</span>
              </span>
            ) : (
              'Continue to Dashboard'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompetitionSelectionScreen;
