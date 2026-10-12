import PropTypes from 'prop-types';
import { ConfirmDialog } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';

/**
 * The question Back asks on a signed-in screen (see hooks/useSignOutOnBack).
 * Signing out ends the session and lands on the role's login page; cancelling
 * leaves the user exactly where they were.
 *
 * `logout()` alone, without the `clearCompetitionContext()` the dashboards'
 * Logout buttons call first: logout already drops the stored meet and level
 * (`clearForRole`) and CompetitionContext empties itself when `userType`
 * clears. Clearing the meet FIRST makes the coach dashboard redirect to the
 * competition chooser mid-logout, which then fetches on a session being revoked.
 */
const SignOutOnBackDialog = ({ open, onClose }) => {
  const { logout } = useAuth();

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => logout()}
      title="Sign out?"
      confirmText="Sign out"
      cancelText="Stay signed in"
      tone="danger"
    >
      <p className="m-0">
        Going back from here signs you out. Stay signed in to keep working where you are.
      </p>
    </ConfirmDialog>
  );
};

SignOutOnBackDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default SignOutOnBackDialog;
