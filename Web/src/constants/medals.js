/**
 * Medal Configuration Constants
 * Centralized medal definitions for ranking displays
 */

export const MEDAL_TYPES = {
  GOLD: 'gold',
  SILVER: 'silver',
  BRONZE: 'bronze',
};

export const MEDAL_CONFIG = {
  [MEDAL_TYPES.GOLD]: {
    color: '#FFD700',
    gradient: 'linear-gradient(135deg, #FFD700, #FFA500)',
    emoji: '🥇',
    label: 'Gold Medal',
    rank: 1,
  },
  [MEDAL_TYPES.SILVER]: {
    color: '#C0C0C0',
    gradient: 'linear-gradient(135deg, #C0C0C0, #A8A8A8)',
    emoji: '🥈',
    label: 'Silver Medal',
    rank: 2,
  },
  [MEDAL_TYPES.BRONZE]: {
    color: '#CD7F32',
    gradient: 'linear-gradient(135deg, #CD7F32, #B87333)',
    emoji: '🥉',
    label: 'Bronze Medal',
    rank: 3,
  },
};

/**
 * Get medal configuration by rank
 * @param {number} rank - Position/rank (1, 2, 3)
 * @returns {Object|null} Medal configuration or null if no medal
 */
export const getMedalByRank = (rank) => {
  switch (rank) {
    case 1:
      return MEDAL_CONFIG[MEDAL_TYPES.GOLD];
    case 2:
      return MEDAL_CONFIG[MEDAL_TYPES.SILVER];
    case 3:
      return MEDAL_CONFIG[MEDAL_TYPES.BRONZE];
    default:
      return null;
  }
};

/**
 * Check if rank qualifies for a medal
 * @param {number} rank - Position/rank
 * @returns {boolean} True if rank is 1, 2, or 3
 */
export const hasMedal = (rank) => {
  return rank >= 1 && rank <= 3;
};

/**
 * Get medal emoji by rank
 * @param {number} rank - Position/rank
 * @returns {string} Medal emoji or empty string
 */
export const getMedalEmoji = (rank) => {
  const medal = getMedalByRank(rank);
  return medal ? medal.emoji : '';
};

/**
 * Get medal color by rank
 * @param {number} rank - Position/rank
 * @returns {string} Medal color or default color
 */
export const getMedalColor = (rank) => {
  const medal = getMedalByRank(rank);
  return medal ? medal.color : '#666666';
};

/**
 * Get medal gradient by rank
 * @param {number} rank - Position/rank
 * @returns {string} Medal gradient or default gradient
 */
export const getMedalGradient = (rank) => {
  const medal = getMedalByRank(rank);
  return medal ? medal.gradient : 'linear-gradient(135deg, #666666, #444444)';
};

export default MEDAL_CONFIG;
