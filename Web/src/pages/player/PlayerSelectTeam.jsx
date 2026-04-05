/**
 * PlayerSelectTeam - Redirect wrapper for backward compatibility
 * 
 * This component re-exports UnifiedCompetitionSelection for the player team selection flow.
 * It maintains backward compatibility during the pages folder refactoring.
 * 
 * @deprecated This wrapper will be removed after 2 sprints when all consumers have migrated.
 * Use UnifiedCompetitionSelection directly from Web/src/pages/unified/UnifiedCompetitionSelection.jsx
 * 
 * @component
 * @returns {JSX.Element} UnifiedCompetitionSelection component
 */

import UnifiedCompetitionSelection from '../unified/UnifiedCompetitionSelection';

export default UnifiedCompetitionSelection;
