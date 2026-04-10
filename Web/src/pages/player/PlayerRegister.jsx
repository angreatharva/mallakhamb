/**
 * PlayerRegister - Redirect wrapper for backward compatibility
 *
 * This component re-exports UnifiedRegister for the player registration flow.
 * It maintains backward compatibility during the pages folder refactoring.
 *
 * @component
 * @returns {JSX.Element} UnifiedRegister component
 */

import UnifiedRegister from '../unified/UnifiedRegister';

export default UnifiedRegister;
