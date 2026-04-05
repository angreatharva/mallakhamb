/**
 * CoachRegister - Redirect wrapper for backward compatibility
 * 
 * This component re-exports UnifiedRegister for the coach registration flow.
 * It maintains backward compatibility during the pages folder refactoring.
 * 
 * @deprecated This wrapper will be removed after 2 sprints when all consumers have migrated.
 * Use UnifiedRegister directly from Web/src/pages/unified/UnifiedRegister.jsx
 * 
 * @component
 * @returns {JSX.Element} UnifiedRegister component
 */

import UnifiedRegister from '../unified/UnifiedRegister';

export default UnifiedRegister;
