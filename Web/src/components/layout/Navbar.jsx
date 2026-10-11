import { useNavigate, useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useCompetition } from '@/contexts/CompetitionContext';
import CompetitionSelector from '@/components/competition/CompetitionSelector';
import { AppHeader } from '@/components/shell';

/**
 * The masthead for the player and coach screens (and any page outside a role
 * that still shows one): the shared AppHeader (design-language PLAN §7, W2).
 *
 * Signed in: the role ident, the account name as the segment, the competition
 * picker on dashboards, and Light/Dark · Logout. Signed out: links to each
 * sign-in. Fixed to the top — App pads the page for its 64px.
 */
const SIGNED_OUT_LINKS = [
  { to: '/player/login', label: 'Player' },
  { to: '/coach/login', label: 'Coach' },
  { to: '/admin/login', label: 'Admin' },
  { to: '/superadmin/login', label: 'Super Admin' },
];

const Navbar = ({ user, userType, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearCompetitionContext } = useCompetition();

  const handleLogout = () => {
    if (clearCompetitionContext) clearCompetitionContext();
    onLogout(navigate);
  };

  const showCompetitionSelector = Boolean(user && userType) && location.pathname.endsWith('/dashboard');

  return (
    <AppHeader
      fixed
      role={user ? userType : null}
      segment={user ? (user.firstName || user.name) : null}
      nav={user ? [] : SIGNED_OUT_LINKS}
      navLabel="Sign in"
      extra={showCompetitionSelector ? <CompetitionSelector userType={userType} /> : null}
      onLogout={user ? handleLogout : null}
    />
  );
};

Navbar.propTypes = {
  user: PropTypes.object,
  userType: PropTypes.string,
  onLogout: PropTypes.func.isRequired,
};

export default Navbar;
