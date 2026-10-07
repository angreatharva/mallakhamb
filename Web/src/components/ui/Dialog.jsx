import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { X } from 'lucide-react';
import '@/styles/look-fonts';
import { cx } from './cx';
import Button, { IconButton } from './Button';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog: modal, labelled by its title. On open, focus moves into the dialog
 * (`initialFocus` ref, else the first control); Tab stays inside; Esc and the
 * ✕ close it (unless `dismissible={false}`); on close focus returns to what
 * had it. The page behind is scroll-locked (one counted lock app-wide).
 *
 *   <Dialog open={open} onClose={close} title="Remove athlete" tone="danger"
 *     actions={<><Button variant="line" onClick={close}>Cancel</Button><Button variant="danger" onClick={remove}>Remove</Button></>}>
 *     Ravi Gaikwad leaves the team. Scores already given are kept.
 *   </Dialog>
 */
const Dialog = ({ open, onClose, title, tone = 'default', wide = false, dismissible = true, initialFocus = null, actions = null, children }) => {
  const titleId = useId();
  const panelRef = useRef(null);
  const returnTo = useRef(null);
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    returnTo.current = document.activeElement;
    const panel = panelRef.current;
    const target = initialFocus?.current || panel?.querySelector(FOCUSABLE) || panel;
    target?.focus();
    return () => {
      const back = returnTo.current;
      if (back && typeof back.focus === 'function' && document.contains(back)) back.focus();
    };
  }, [open, initialFocus]);

  if (!open) return null;

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && dismissible) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...panelRef.current.querySelectorAll(FOCUSABLE)];
    if (items.length === 0) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return createPortal(
    <div className="modal-overlay ui-dialog-overlay" onMouseDown={(e) => { if (dismissible && e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx('modal-panel ui-dialog', tone === 'danger' && 'ui-dialog--danger', wide && 'ui-dialog--wide')}
        onKeyDown={onKeyDown}
      >
        <div className="ui-dialog__head">
          <h2 id={titleId} className="ui-dialog__title type-display-s">{title}</h2>
          {dismissible && <IconButton label="Close" icon={X} variant="ghost" onClick={onClose} />}
        </div>
        <div className="ui-dialog__body type-body">{children}</div>
        {actions && <div className="ui-dialog__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
};

Dialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.node.isRequired,
  tone: PropTypes.oneOf(['default', 'danger']),
  wide: PropTypes.bool,
  dismissible: PropTypes.bool,
  initialFocus: PropTypes.shape({ current: PropTypes.any }),
  actions: PropTypes.node,
  children: PropTypes.node,
};

export default Dialog;

/**
 * ConfirmDialog: Cancel + one confirming action. `onConfirm` may be async: the
 * button shows it is busy, the dialog stays open on failure and says why.
 */
export const ConfirmDialog = ({ open, onClose, onConfirm, title, children, confirmText = 'Confirm', cancelText = 'Cancel', tone = 'default' }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const cancelRef = useRef(null);
  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err?.message || 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      dismissible={!busy}
      title={title}
      tone={tone}
      initialFocus={cancelRef}
      actions={(
        <>
          <Button ref={cancelRef} variant="line" onClick={onClose} disabled={busy}>{cancelText}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'solid'} onClick={confirm} loading={busy}>{confirmText}</Button>
        </>
      )}
    >
      {children}
      {error && <p role="alert" className="ui-dialog__error type-caption">{error}</p>}
    </Dialog>
  );
};

ConfirmDialog.propTypes = {
  open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, onConfirm: PropTypes.func.isRequired,
  title: PropTypes.node.isRequired, children: PropTypes.node, confirmText: PropTypes.node, cancelText: PropTypes.node,
  tone: PropTypes.oneOf(['default', 'danger']),
};
