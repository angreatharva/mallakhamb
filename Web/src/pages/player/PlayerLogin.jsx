/**
 * PlayerLogin - Redirect wrapper for backward compatibility
 * 
 * This file now redirects to the UnifiedLogin component.
 * Maintained for backward compatibility during the transition period.
 */
import UnifiedLogin from './unified/UnifiedLogin';

const PlayerLogin = () => <UnifiedLogin />;

export default PlayerLogin;
