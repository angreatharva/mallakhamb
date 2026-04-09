/**
 * JudgeLogin - Redirect wrapper for backward compatibility
 * 
 * This file now redirects to the UnifiedLogin component.
 * Maintained for backward compatibility during the transition period.
 */
import UnifiedLogin from '../unified/UnifiedLogin';

const JudgeLogin = () => <UnifiedLogin />;

export default JudgeLogin;
