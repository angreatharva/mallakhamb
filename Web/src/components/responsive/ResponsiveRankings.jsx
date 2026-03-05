/**
 * ResponsiveRankings Component
 * 
 * Specialized components for displaying rankings, scores, and leaderboards
 * with responsive layouts. Optimized for mobile viewing of competitive data.
 * 
 * Requirements: 8.1, 10.1
 */

import React from 'react';
import { useResponsive } from '../../hooks/useResponsive';
import { ResponsiveContainer } from './ResponsiveContainer';

/**
 * Individual player rankings with responsive layout
 */
export const ResponsiveIndividualRankings = ({
  players = [],
  searchTerm = '',
  className = '',
  ...props
}) => {
  const { isMobile } = useResponsive();

  // Mobile card renderer for individual rankings
  const renderPlayerCard = (player, index) => {
    const isTopThree = index < 3;
    const medals = ['🥇', '🥈', '🥉'];
    const isTied = player.tieBreakNotes && player.tieBreakNotes.length > 0;
    
    return (
      <div
        key={player.playerId}
        className={`border rounded-lg p-4 ${
          isTopThree ? 'border-yellow-300 bg-yellow-50' : isTied ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'
        } hover:shadow-md transition-shadow`}
      >
        <div className="space-y-3">
          {/* Rank and Player Info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {!searchTerm && isTopThree && (
                <span className="text-2xl">{medals[index]}</span>
              )}
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-lg font-bold text-gray-900">
                    #{searchTerm ? player.originalRank : (player.rank || index + 1)}
                  </span>
                  <h3 className="font-semibold text-gray-900">{player.playerName}</h3>
                  {isTied && (
                    <span className="text-xs px-2 py-1 bg-orange-200 text-orange-800 rounded-full font-medium">
                      Tied
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600">{player.teamName}</p>
                {isTied && (
                  <p className="text-xs text-orange-600 mt-1">{player.tieBreakNotes}</p>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-green-600">
                {player.finalScore?.toFixed(2) || '0.00'}
              </div>
              <p className="text-xs text-gray-500">Final Score</p>
            </div>
          </div>

          {/* Performance Details */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
            <div className="text-center">
              <p className="text-sm font-medium text-blue-600">
                {player.averageMarks?.toFixed(2) || '0.00'}
              </p>
              <p className="text-xs text-gray-500">Average</p>
              {player.baseScoreApplied && (
                <p className="text-xs text-purple-600 font-semibold mt-1">Base Score</p>
              )}
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-900">
                {player.time || 'N/A'}
              </p>
              <p className="text-xs text-gray-500">Time</p>
            </div>
          </div>

          {/* Additional Score Info */}
          {(player.executionAverage > 0 || player.baseScoreApplied) && (
            <div className="pt-2 border-t border-gray-100 text-xs space-y-1">
              {player.executionAverage > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Execution Avg:</span>
                  <span className="font-medium">{player.executionAverage.toFixed(2)}</span>
                </div>
              )}
              {player.baseScoreApplied && player.baseScore > 0 && (
                <div className="flex justify-between">
                  <span className="text-purple-600">Base Score:</span>
                  <span className="font-medium text-purple-600">{player.baseScore.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Judge Scores (collapsed by default on mobile) */}
          <details className="pt-2 border-t border-gray-100">
            <summary className="text-sm font-medium text-gray-600 cursor-pointer">
              Judge Scores
            </summary>
            <div className="mt-2 space-y-1">
              {player.judgeScores && (
                <>
                  <div className="flex justify-between text-sm">
                    <span>Senior Judge:</span>
                    <span>{player.judgeScores.seniorJudge?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Judge 1:</span>
                    <span>{player.judgeScores.judge1?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Judge 2:</span>
                    <span>{player.judgeScores.judge2?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Judge 3:</span>
                    <span>{player.judgeScores.judge3?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Judge 4:</span>
                    <span>{player.judgeScores.judge4?.toFixed(2) || '0.00'}</span>
                  </div>
                </>
              )}
            </div>
          </details>
        </div>
      </div>
    );
  };

  if (isMobile) {
    return (
      <ResponsiveContainer className={`mobile-rankings-cards ${className}`} {...props}>
        <div className="space-y-4">
          {players.map((player, index) => renderPlayerCard(player, index))}
        </div>
      </ResponsiveContainer>
    );
  }

  // Desktop table layout
  return (
    <ResponsiveContainer className={`responsive-rankings-table ${className}`} {...props}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rank
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Player Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Team
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Average Marks
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Senior Judge
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Final Score
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {players.map((player, index) => {
              const isTied = player.tieBreakNotes && player.tieBreakNotes.length > 0;
              return (
              <tr key={player.playerId} className={index < 3 ? 'bg-yellow-50' : isTied ? 'bg-orange-50' : 'hover:bg-gray-50'}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-2">
                    {searchTerm ? (
                      <span className="text-sm font-medium text-gray-900">#{player.originalRank}</span>
                    ) : (
                      <>
                        {index === 0 && <span className="text-2xl mr-2">🥇</span>}
                        {index === 1 && <span className="text-2xl mr-2">🥈</span>}
                        {index === 2 && <span className="text-2xl mr-2">🥉</span>}
                        <span className="text-sm font-medium text-gray-900">#{player.rank || index + 1}</span>
                      </>
                    )}
                    {isTied && (
                      <span className="text-xs px-2 py-1 bg-orange-200 text-orange-800 rounded-full font-medium">
                        Tied
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{player.playerName}</div>
                  {isTied && (
                    <div className="text-xs text-orange-600 mt-1">{player.tieBreakNotes}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{player.teamName}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{player.time || 'N/A'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-blue-600">
                      {player.averageMarks?.toFixed(2) || '0.00'}
                    </div>
                    {player.baseScoreApplied && (
                      <div className="text-xs text-purple-600 font-semibold">
                        Base Score Applied
                      </div>
                    )}
                    {player.executionAverage > 0 && (
                      <div className="text-xs text-gray-500">
                        Exec Avg: {player.executionAverage.toFixed(2)}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {player.judgeScores?.seniorJudge?.toFixed(2) || '0.00'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-lg font-bold text-green-600">
                    {player.finalScore?.toFixed(2) || '0.00'}
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </ResponsiveContainer>
  );
};

/**
 * Team rankings with responsive layout
 */
export const ResponsiveTeamRankings = ({
  teams = [],
  searchTerm = '',
  className = '',
  ...props
}) => {
  const { isMobile } = useResponsive();

  // Mobile card renderer for team rankings
  const renderTeamCard = (team, index) => {
    const isTopThree = index < 3;
    const medals = ['🥇', '🥈', '🥉'];
    
    return (
      <div
        key={team.teamId}
        className={`border rounded-lg p-4 ${
          isTopThree ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'
        } hover:shadow-md transition-shadow`}
      >
        <div className="space-y-4">
          {/* Team Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {!searchTerm && isTopThree && (
                <span className="text-3xl">{medals[index]}</span>
              )}
              {searchTerm && (
                <span className="text-xl font-bold text-gray-500">#{team.originalRank}</span>
              )}
              <div>
                <h3 className="text-lg font-bold text-gray-900">{team.teamName}</h3>
                <p className="text-sm text-gray-600">
                  {team.playerCount} player{team.playerCount !== 1 ? 's' : ''} scored
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">
                {team.teamTotalScore?.toFixed(2) || '0.00'}
              </div>
              <p className="text-sm text-gray-600">Total Score</p>
              <p className="text-xs text-gray-500">
                Avg: {team.averageTeamScore?.toFixed(2) || '0.00'}
              </p>
            </div>
          </div>

          {/* Top Players */}
          <div className="pt-3 border-t border-gray-100">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Top Players:</h4>
            <div className="space-y-2">
              {team.topPlayerScores?.map((player, playerIndex) => (
                <div key={player.playerId} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{player.playerName}</p>
                      <p className="text-xs text-gray-600">Time: {player.time || 'N/A'}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-green-600">
                        {player.finalScore?.toFixed(2) || '0.00'}
                      </div>
                      <div className="text-xs text-gray-500">
                        Avg: {player.averageMarks?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (isMobile) {
    return (
      <ResponsiveContainer className={`mobile-team-rankings-cards ${className}`} {...props}>
        <div className="space-y-4">
          {teams.map((team, index) => renderTeamCard(team, index))}
        </div>
      </ResponsiveContainer>
    );
  }

  // Desktop layout - keep existing card structure but make it responsive
  return (
    <ResponsiveContainer className={`responsive-team-rankings ${className}`} {...props}>
      <div className="space-y-4">
        {teams.map((team, index) => (
          <div
            key={team.teamId}
            className={`border rounded-lg p-6 ${
              index < 3 ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'
            } hover:shadow-md transition-shadow`}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-3">
                {!searchTerm && (
                  <>
                    {index === 0 && <span className="text-3xl">🥇</span>}
                    {index === 1 && <span className="text-3xl">🥈</span>}
                    {index === 2 && <span className="text-3xl">🥉</span>}
                    {index > 2 && <span className="text-xl font-bold text-gray-500">#{index + 1}</span>}
                  </>
                )}
                {searchTerm && <span className="text-xl font-bold text-gray-500">#{team.originalRank}</span>}
                <div>
                  <h4 className="text-xl font-bold text-gray-900">{team.teamName}</h4>
                  <p className="text-sm text-gray-600">
                    {team.playerCount} player{team.playerCount !== 1 ? 's' : ''} scored
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-600">
                  {team.teamTotalScore?.toFixed(2) || '0.00'}
                </div>
                <p className="text-sm text-gray-600">Total Score</p>
                <p className="text-xs text-gray-500">
                  Avg: {team.averageTeamScore?.toFixed(2) || '0.00'}
                </p>
              </div>
            </div>

            {/* Top Players */}
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Top Players:</h5>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {team.topPlayerScores?.map((player, playerIndex) => (
                  <div key={player.playerId} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{player.playerName}</p>
                        <p className="text-xs text-gray-600">Time: {player.time || 'N/A'}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-600">
                          {player.finalScore?.toFixed(2) || '0.00'}
                        </div>
                        <div className="text-xs text-gray-500">
                          Avg: {player.averageMarks?.toFixed(2) || '0.00'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ResponsiveContainer>
  );
};

/**
 * Responsive search and filter interface for rankings
 */
export const ResponsiveRankingsFilters = ({
  searchTerm,
  onSearchChange,
  selectedGender,
  onGenderChange,
  selectedAgeGroup,
  onAgeGroupChange,
  genders = [],
  ageGroups = [],
  className = '',
  ...props
}) => {
  const { isMobile } = useResponsive();

  if (isMobile) {
    return (
      <ResponsiveContainer className={`mobile-rankings-filters ${className}`} {...props}>
        <div className="space-y-4">
          {/* Search */}
          <div>
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          
          {/* Filters */}
          <div className="grid grid-cols-2 gap-3">
            <select
              value={selectedGender?.value || ''}
              onChange={(e) => {
                const gender = genders.find(g => g.value === e.target.value);
                onGenderChange(gender);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="">Gender</option>
              {genders.map(gender => (
                <option key={gender.value} value={gender.value}>
                  {gender.label}
                </option>
              ))}
            </select>
            
            <select
              value={selectedAgeGroup?.value || ''}
              onChange={(e) => {
                const ageGroup = ageGroups.find(ag => ag.value === e.target.value);
                onAgeGroupChange(ageGroup);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
              disabled={!selectedGender}
            >
              <option value="">Age Group</option>
              {ageGroups.map(ageGroup => (
                <option key={ageGroup.value} value={ageGroup.value}>
                  {ageGroup.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </ResponsiveContainer>
    );
  }

  // Desktop layout - keep existing structure
  return (
    <ResponsiveContainer className={`responsive-rankings-filters ${className}`} {...props}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
        
        <select
          value={selectedGender?.value || ''}
          onChange={(e) => {
            const gender = genders.find(g => g.value === e.target.value);
            onGenderChange(gender);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
        >
          <option value="">Select Gender</option>
          {genders.map(gender => (
            <option key={gender.value} value={gender.value}>
              {gender.label}
            </option>
          ))}
        </select>
        
        <select
          value={selectedAgeGroup?.value || ''}
          onChange={(e) => {
            const ageGroup = ageGroups.find(ag => ag.value === e.target.value);
            onAgeGroupChange(ageGroup);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
          disabled={!selectedGender}
        >
          <option value="">Select Age Group</option>
          {ageGroups.map(ageGroup => (
            <option key={ageGroup.value} value={ageGroup.value}>
              {ageGroup.label}
            </option>
          ))}
        </select>
      </div>
    </ResponsiveContainer>
  );
};

export default {
  ResponsiveIndividualRankings,
  ResponsiveTeamRankings,
  ResponsiveRankingsFilters,
};