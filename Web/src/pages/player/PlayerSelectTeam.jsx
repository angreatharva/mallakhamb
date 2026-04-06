/**
 * PlayerSelectTeam - Redirect wrapper for backward compatibility
 * 
 * This component re-exports UnifiedCompetitionSelection for the player team selection flow.
 * It maintains backward compatibility during the pages folder refactoring.
 * 
 * @component
 * @returns {JSX.Element} UnifiedCompetitionSelection component
 */

import UnifiedCompetitionSelection from '../unified/UnifiedCompetitionSelection';

export default UnifiedCompetitionSelection;
