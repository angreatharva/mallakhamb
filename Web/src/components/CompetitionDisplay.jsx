import React from 'react';
import { useCompetition } from '../contexts/CompetitionContext';
import { CalendarIcon, MapPinIcon, TrophyIcon } from '@heroicons/react/24/outline';

const CompetitionDisplay = ({ className = '' }) => {
  const { currentCompetition, isLoading } = useCompetition();

  if (isLoading || !currentCompetition) {
    return null;
  }

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

  return (
    <div className={`bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <TrophyIcon className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              {currentCompetition.name}
            </h3>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <div className="flex items-center space-x-1">
              <MapPinIcon className="w-4 h-4" />
              <span>{currentCompetition.place}</span>
            </div>
            
            <span>•</span>
            
            <span className="capitalize">{currentCompetition.level}</span>
            
            {currentCompetition.startDate && currentCompetition.endDate && (
              <>
                <span>•</span>
                <div className="flex items-center space-x-1">
                  <CalendarIcon className="w-4 h-4" />
                  <span>
                    {new Date(currentCompetition.startDate).toLocaleDateString()} -{' '}
                    {new Date(currentCompetition.endDate).toLocaleDateString()}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
            currentCompetition.status
          )}`}
        >
          {currentCompetition.status}
        </span>
      </div>
      
      {currentCompetition.description && (
        <p className="mt-2 text-sm text-gray-600 line-clamp-2">
          {currentCompetition.description}
        </p>
      )}
    </div>
  );
};

export default CompetitionDisplay;
