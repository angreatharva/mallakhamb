import { useEffect } from 'react';

/**
 * Freeze the page behind an open dialog.
 *
 * `.modal-overlay` is `position: fixed` and scrolls its own overflow, but the
 * document underneath it never stopped scrolling — so a dialog opened halfway
 * down the management screen sat over a page that still answered the wheel,
 * gave the window a second scrollbar, and drifted out from under the panel.
 *
 * The count is what makes this safe to call from more than one place at once.
 * This screen stacks a confirmation dialog on top of a form dialog, and two
 * independent `overflow = 'hidden'` / `overflow = ''` pairs would have the
 * first one to close hand scrolling back while the second was still open.
 * Only the last lock released restores the saved style.
 *
 * Removing the scrollbar narrows the viewport, which would shunt the page
 * sideways by its width for as long as the dialog is up; the matching
 * `padding-right` holds the layout still. Overlay scrollbars (phones, and
 * macOS by default) report a width of 0, so they pay nothing.
 */
let locks = 0;
let saved = null;

export const useBodyScrollLock = (isLocked) => {
  useEffect(() => {
    if (!isLocked) return undefined;

    if (locks === 0) {
      const { body } = document;
      saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
      const barWidth = window.innerWidth - document.documentElement.clientWidth;
      body.style.overflow = 'hidden';
      if (barWidth > 0) {
        const current = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
        body.style.paddingRight = `${current + barWidth}px`;
      }
    }
    locks += 1;

    return () => {
      locks -= 1;
      if (locks === 0 && saved) {
        document.body.style.overflow = saved.overflow;
        document.body.style.paddingRight = saved.paddingRight;
        saved = null;
      }
    };
  }, [isLocked]);
};

/**
 * The same lock as an element. Mounted as an overlay's first child, it holds for
 * exactly as long as the overlay is mounted — through its exit animation, since
 * AnimatePresence keeps it mounted until then — and no hook has to be placed
 * above an early return in the page that owns the dialog's state.
 */
export const BodyScrollLock = () => {
  useBodyScrollLock(true);
  return null;
};

export default useBodyScrollLock;
