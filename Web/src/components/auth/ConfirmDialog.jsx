import PropTypes from 'prop-types';
import { ConfirmDialog as UiConfirmDialog } from '@/components/ui';

/**
 * The confirm dialog the admin and judge screens call (isOpen / message /
 * variant), drawn by the look primitive (design-language PLAN §6): focus
 * moves in and comes back, Esc cancels, an async `onConfirm` shows it is
 * busy, the dialog stays open on failure and says why.
 *
 * `variant="danger"` is the danger dialog (destructive actions); the others
 * share the default tone. `confirmButtonClass` is accepted and ignored: the
 * button's look is the primitive's.
 */
const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default', // 'default' | 'danger' | 'success'
}) => (
  <UiConfirmDialog
    open={Boolean(isOpen)}
    onClose={onClose}
    onConfirm={async () => { if (onConfirm) await onConfirm(); }}
    title={title}
    confirmText={confirmText}
    cancelText={cancelText}
    tone={variant === 'danger' ? 'danger' : 'default'}
  >
    <p className="m-0 whitespace-pre-line">{message}</p>
  </UiConfirmDialog>
);

ConfirmDialog.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func,
  title: PropTypes.node,
  message: PropTypes.node,
  confirmText: PropTypes.node,
  cancelText: PropTypes.node,
  confirmButtonClass: PropTypes.string,
  variant: PropTypes.oneOf(['default', 'danger', 'success']),
};

export default ConfirmDialog;
