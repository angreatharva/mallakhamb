/**
 * ResponsiveTable Component
 * 
 * A comprehensive table component that adapts between table layout on desktop
 * and card layout on mobile. Supports various table patterns including scoring,
 * data display, and team management tables.
 * 
 * Requirements: 8.1, 8.3, 8.4, 10.3
 */

import React from 'react';
import { useResponsive } from '../../hooks/useResponsive';
import { ResponsiveContainer } from './ResponsiveContainer';

/**
 * Main ResponsiveTable component
 * @param {Object} props - Component props
 * @param {Array} props.columns - Column definitions
 * @param {Array} props.data - Table data
 * @param {string} props.type - Table type ('scoring', 'data', 'teams', 'rankings')
 * @param {Function} props.renderMobileCard - Custom mobile card renderer
 * @param {string} props.className - Additional CSS classes
 * @param {Object} props.mobileConfig - Mobile-specific configuration
 * @returns {JSX.Element}
 */
export const ResponsiveTable = ({
  columns = [],
  data = [],
  type = 'data',
  renderMobileCard = null,
  className = '',
  mobileConfig = {},
  onRowClick = null,
  ...props
}) => {
  const { isMobile, isTablet } = useResponsive();

  // Default mobile card renderer
  const defaultMobileCardRenderer = (item, index) => {
    return (
      <div 
        key={index} 
        className={`bg-white border border-gray-200 rounded-lg p-4 space-y-3 ${
          onRowClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
        }`}
        onClick={() => onRowClick && onRowClick(item)}
      >
        {columns.map((column, colIndex) => {
          if (column.hideOnMobile) return null;
          
          const value = column.accessor ? item[column.accessor] : column.render ? column.render(item) : '';
          
          return (
            <div key={colIndex} className="flex justify-between items-start">
              <span className="text-sm font-medium text-gray-600 min-w-0 flex-shrink-0 mr-3">
                {column.header}:
              </span>
              <span className="text-sm text-gray-900 text-right min-w-0 flex-1">
                {value}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // Mobile layout
  if (isMobile) {
    const cardRenderer = renderMobileCard || defaultMobileCardRenderer;
    
    return (
      <ResponsiveContainer className={`mobile-table-cards ${className}`} {...props}>
        <div className="space-y-4">
          {data.map((item, index) => cardRenderer(item, index))}
        </div>
        {data.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No data available
          </div>
        )}
      </ResponsiveContainer>
    );
  }

  // Tablet/Desktop table layout
  return (
    <ResponsiveContainer className={`responsive-table-container ${className}`} {...props}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column, index) => (
                <th
                  key={index}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    column.className || ''
                  }`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((item, rowIndex) => (
              <tr 
                key={rowIndex} 
                className={`hover:bg-gray-50 ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
                onClick={() => onRowClick && onRowClick(item)}
              >
                {columns.map((column, colIndex) => (
                  <td
                    key={colIndex}
                    className={`px-4 py-4 whitespace-nowrap ${
                      column.cellClassName || ''
                    }`}
                  >
                    {column.accessor ? item[column.accessor] : column.render ? column.render(item) : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No data available
          </div>
        )}
      </div>
    </ResponsiveContainer>
  );
};

/**
 * Specialized table for scoring data with input fields
 * Optimized for scoring interfaces with mobile card layout
 */
export const ResponsiveScoringTable = ({
  players = [],
  scores = {},
  judges = [],
  onScoreChange,
  isLocked = false,
  className = '',
  ...props
}) => {
  const { isMobile } = useResponsive();

  // Mobile card renderer for scoring
  const renderScoringCard = (player, index) => (
    <div key={player.id} className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      {/* Player Info */}
      <div className="border-b border-gray-100 pb-3">
        <h3 className="font-medium text-gray-900">{player.name}</h3>
        {player.teamName && (
          <p className="text-sm text-gray-600">{player.teamName}</p>
        )}
      </div>

      {/* Time Input */}
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-gray-600">Time:</label>
        <input
          type="text"
          value={scores[player.id]?.time || ''}
          onChange={(e) => onScoreChange(player.id, 'time', e.target.value)}
          disabled={isLocked}
          className={`w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm ${
            isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
          }`}
          placeholder="00:00"
        />
      </div>

      {/* Judge Scores */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">Judge Scores:</h4>
        {[
          { field: 'seniorJudge', label: 'Senior Judge' },
          { field: 'judge1', label: 'Judge 1' },
          { field: 'judge2', label: 'Judge 2' },
          { field: 'judge3', label: 'Judge 3' },
          { field: 'judge4', label: 'Judge 4' }
        ].map(({ field, label }) => (
          <div key={field} className="flex justify-between items-center">
            <label className="text-sm text-gray-600">{label}:</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="10"
              value={scores[player.id]?.[field] || ''}
              onChange={(e) => onScoreChange(player.id, field, e.target.value)}
              disabled={isLocked}
              className={`w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm ${
                isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
              }`}
              placeholder="0.0"
            />
          </div>
        ))}
      </div>

      {/* Calculated Scores */}
      <div className="space-y-2 pt-3 border-t border-gray-100">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-600">Average:</span>
          <span className="text-sm font-medium text-blue-600">
            {calculateAverageMarks(scores[player.id] || {})}
          </span>
        </div>
        
        {/* Deductions */}
        <div className="flex justify-between items-center">
          <label className="text-sm text-gray-600">Deduction:</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={scores[player.id]?.deduction || ''}
            onChange={(e) => onScoreChange(player.id, 'deduction', e.target.value)}
            disabled={isLocked}
            className={`w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm ${
              isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
            }`}
            placeholder="0.0"
          />
        </div>
        
        <div className="flex justify-between items-center">
          <label className="text-sm text-gray-600">Other Deduction:</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={scores[player.id]?.otherDeduction || ''}
            onChange={(e) => onScoreChange(player.id, 'otherDeduction', e.target.value)}
            disabled={isLocked}
            className={`w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm ${
              isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
            }`}
            placeholder="0.0"
          />
        </div>
        
        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <span className="text-sm font-bold text-gray-700">Final Score:</span>
          <span className="text-lg font-bold text-green-600">
            {calculateFinalScore(scores[player.id] || {})}
          </span>
        </div>
      </div>
    </div>
  );

  // Helper functions for score calculations
  const calculateAverageMarks = (playerScores) => {
    const judgeScores = [
      parseFloat(playerScores.seniorJudge) || 0,
      parseFloat(playerScores.judge1) || 0,
      parseFloat(playerScores.judge2) || 0,
      parseFloat(playerScores.judge3) || 0,
      parseFloat(playerScores.judge4) || 0
    ].filter(score => score > 0);

    if (judgeScores.length === 0) return '0.00';

    if (judgeScores.length <= 3) {
      return (judgeScores.reduce((sum, score) => sum + score, 0) / judgeScores.length).toFixed(2);
    }

    const sortedScores = [...judgeScores].sort((a, b) => a - b);
    const trimmedScores = sortedScores.slice(1, -1);
    return (trimmedScores.reduce((sum, score) => sum + score, 0) / trimmedScores.length).toFixed(2);
  };

  const calculateFinalScore = (playerScores) => {
    const average = parseFloat(calculateAverageMarks(playerScores));
    const deduction = parseFloat(playerScores.deduction) || 0;
    const otherDeduction = parseFloat(playerScores.otherDeduction) || 0;
    return Math.max(0, average - deduction - otherDeduction).toFixed(2);
  };

  // Mobile layout for scoring
  if (isMobile) {
    return (
      <ResponsiveContainer className={`mobile-scoring-cards ${className}`} {...props}>
        <div className="space-y-4">
          {players.map((player, index) => renderScoringCard(player, index))}
        </div>
      </ResponsiveContainer>
    );
  }

  // Desktop table layout (existing table structure)
  return (
    <ResponsiveContainer className={`responsive-scoring-table ${className}`} {...props}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Participant Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Senior Judge
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Judge 1
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Judge 2
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Judge 3
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Judge 4
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Average Marks
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Deduction
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Other Deduction
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Final Score
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {players.map((player) => (
              <tr key={player.id} className="hover:bg-gray-50">
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{player.name}</div>
                  {player.teamName && (
                    <div className="text-xs text-gray-500">{player.teamName}</div>
                  )}
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <input
                    type="text"
                    value={scores[player.id]?.time || ''}
                    onChange={(e) => onScoreChange(player.id, 'time', e.target.value)}
                    disabled={isLocked}
                    className={`w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                      isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                    }`}
                    placeholder="00:00"
                  />
                </td>
                {['seniorJudge', 'judge1', 'judge2', 'judge3', 'judge4'].map((judgeField) => (
                  <td key={judgeField} className="px-4 py-4 whitespace-nowrap">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={scores[player.id]?.[judgeField] || ''}
                      onChange={(e) => onScoreChange(player.id, judgeField, e.target.value)}
                      disabled={isLocked}
                      className={`w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                        isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                      }`}
                      placeholder="0.0"
                    />
                  </td>
                ))}
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="w-20 px-2 py-1 bg-blue-100 rounded text-center font-medium text-blue-800">
                    {calculateAverageMarks(scores[player.id] || {})}
                  </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={scores[player.id]?.deduction || ''}
                    onChange={(e) => onScoreChange(player.id, 'deduction', e.target.value)}
                    disabled={isLocked}
                    className={`w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                      isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                    }`}
                    placeholder="0.0"
                  />
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={scores[player.id]?.otherDeduction || ''}
                    onChange={(e) => onScoreChange(player.id, 'otherDeduction', e.target.value)}
                    disabled={isLocked}
                    className={`w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                      isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                    }`}
                    placeholder="0.0"
                  />
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="w-20 px-2 py-1 bg-green-100 rounded text-center font-bold text-green-800">
                    {calculateFinalScore(scores[player.id] || {})}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ResponsiveContainer>
  );
};

/**
 * Specialized table for team listings with responsive cards
 */
export const ResponsiveTeamTable = ({
  teams = [],
  onTeamClick,
  searchTerm = '',
  className = '',
  ...props
}) => {
  const { isMobile } = useResponsive();

  // Mobile card renderer for teams
  const renderTeamCard = (team, index) => (
    <div
      key={team._id}
      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer hover:border-purple-300"
      onClick={() => onTeamClick && onTeamClick(team)}
    >
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{team.name}</h3>
          <p className="text-sm text-gray-600">
            Coach: {team.coach?.name || 'No coach assigned'}
          </p>
          {team.coach?.email && (
            <p className="text-sm text-gray-600">
              Email: {team.coach.email}
            </p>
          )}
        </div>
        
        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <span className="text-sm text-gray-600">Total Players</span>
          <span className="text-lg font-bold text-purple-600">
            {team.players?.length || 0}
          </span>
        </div>
        
        <div className="text-right">
          <span className="text-sm text-purple-600 hover:text-purple-800 font-medium">
            View Details →
          </span>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <ResponsiveContainer className={`mobile-team-cards ${className}`} {...props}>
        <div className="space-y-4">
          {teams.map((team, index) => renderTeamCard(team, index))}
        </div>
      </ResponsiveContainer>
    );
  }

  // Desktop layout - keep existing structure
  return (
    <ResponsiveContainer className={`responsive-team-table ${className}`} {...props}>
      <div className="space-y-4">
        {teams.map((team) => (
          <div
            key={team._id}
            className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer hover:border-purple-300 bg-white"
            onClick={() => onTeamClick && onTeamClick(team)}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{team.name}</h3>
                <div className="space-y-1">
                  <p className="text-sm text-gray-600">
                    <strong>Coach:</strong> {team.coach?.name || 'No coach assigned'}
                  </p>
                  {team.coach?.email && (
                    <p className="text-sm text-gray-600">
                      <strong>Email:</strong> {team.coach.email}
                    </p>
                  )}
                  {team.description && (
                    <p className="text-sm text-gray-500 mt-2">{team.description}</p>
                  )}
                </div>
              </div>
              <div className="text-right ml-6">
                <div className="bg-purple-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-purple-900">Total Players</p>
                  <p className="text-2xl font-bold text-purple-600">{team.players?.length || 0}</p>
                </div>
                <button className="mt-2 text-sm text-purple-600 hover:text-purple-800 font-medium">
                  View Details →
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ResponsiveContainer>
  );
};

export default ResponsiveTable;