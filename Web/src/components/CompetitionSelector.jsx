import React, { useState, useRef, useEffect } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';
import { ChevronDownIcon, CheckIcon } from '@heroicons/react/24/outline';

const CompetitionSelector = () => {
  const { currentCompetition, assignedCompetitions, switchCompetition, isLoading } = useCompetition();
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCompetitionSwitch = async (competitionId) => {
    if (competitionId === currentCompetition?._id) {
      setIsOpen(false);
      return;
    }

    try {
      setIsSwitching(true);
      await switchCompetition(competitionId);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to switch competition:', error);
      setIsSwitching(false);
    }
  };

  // Don't show selector if user has only one competition or no competitions
  if (isLoading || !assignedCompetitions || assignedCompetitions.length <= 1) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSwitching}
        className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="flex flex-col items-start">
          <span className="text-xs text-gray-500">Competition</span>
          <span className="text-sm font-medium text-gray-900">
            {currentCompetition?.name || 'Select Competition'}
          </span>
        </div>
        <ChevronDownIcon
          className={`w-5 h-5 text-gray-400 transition-transform ${
            isOpen ? 'transform rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="py-2">
            <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Select Competition
            </div>
            {assignedCompetitions.map((competition) => (
              <button
                key={competition._id}
                onClick={() => handleCompetitionSwitch(competition._id)}
                disabled={isSwitching}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  currentCompetition?._id === competition._id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">
                        {competition.name}
                      </span>
                      {currentCompetition?._id === competition._id && (
                        <CheckIcon className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                    <div className="mt-1 flex items-center space-x-3 text-xs text-gray-500">
                      <span className="capitalize">{competition.level}</span>
                      <span>•</span>
                      <span>{competition.place}</span>
                      <span>•</span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-medium ${
                          competition.status === 'ongoing'
                            ? 'bg-green-100 text-green-800'
                            : competition.status === 'upcoming'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {competition.status}
                      </span>
                    </div>
                    {competition.startDate && competition.endDate && (
                      <div className="mt-1 text-xs text-gray-400">
                        {new Date(competition.startDate).toLocaleDateString()} -{' '}
                        {new Date(competition.endDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {isSwitching && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 shadow-xl">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="text-gray-700">Switching competition...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompetitionSelector;
