import { X, AlertTriangle, CheckCircle, Trash2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '../utils/logger';
import { COLORS, useReducedMotion } from '../pages/public/Home';
import { useResponsive } from '../hooks/useResponsive';

void motion;

const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmButtonClass = '',
  variant = 'default', // 'default' | 'danger' | 'success'
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const reduced = useReducedMotion();
  const { isMobile } = useResponsive();
  const cancelRef = useRef(null);

  // Focus trap — focus cancel on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => cancelRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, loading, onClose]);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message || 'An error occurred');
      logger.error('Confirm dialog error:', err);
    } finally {
      setLoading(false);
    }
  };

  const accentColor = variant === 'danger' ? '#EF4444'
    : variant === 'success' ? '#22C55E'
    : COLORS.saffron;

  const IconComp = variant === 'danger' ? Trash2
    : variant === 'success' ? CheckCircle
    : AlertTriangle;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-message"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !loading && onClose()}
          />

          {/* Panel */}
          <motion.div
            className="relative w-full rounded-2xl border overflow-hidden"
            style={{
              maxWidth: isMobile ? '100%' : '28rem',
              margin: isMobile ? '0 1rem' : '0',
              background: '#111111',
              borderColor: `${accentColor}25`,
              boxShadow: `0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px ${accentColor}15`,
            }}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 10 }}
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* Top accent line */}
            <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}60, transparent)` }} />

            {/* Header */}
            <div className="flex items-start justify-between p-6 pb-4" style={{ padding: isMobile ? '1rem' : '1.5rem', paddingBottom: isMobile ? '0.75rem' : '1rem' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${accentColor}18` }}>
                  <IconComp className="w-5 h-5" style={{ color: accentColor }} aria-hidden="true" />
                </div>
                <h3 id="confirm-dialog-title" className="text-white font-bold leading-tight" style={{ fontSize: isMobile ? '1rem' : '1.125rem' }}>{title}</h3>
              </div>
              <button
                onClick={onClose}
                disabled={loading}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/08 transition-colors disabled:opacity-40 flex-shrink-0 ml-2 focus:outline-none focus:ring-2"
                style={{ outlineColor: accentColor }}
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 pb-4" style={{ padding: isMobile ? '0 1rem 0.75rem' : '0 1.5rem 1rem' }}>
              <p id="confirm-dialog-message" className="text-white/60 leading-relaxed text-sm whitespace-pre-line">{message}</p>

              <AnimatePresence>
                {error && (
                  <motion.div
                    className="mt-4 p-3 rounded-xl border flex items-start gap-2"
                    style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' }}
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    role="alert"
                  >
                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-red-400 text-sm">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t"
              style={{ 
                borderColor: COLORS.darkBorderSubtle, 
                background: 'rgba(255,255,255,0.02)',
                padding: isMobile ? '1rem' : '1.5rem',
                flexDirection: isMobile ? 'column' : 'row',
              }}>
              <button
                ref={cancelRef}
                onClick={onClose}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold border text-white/70 hover:text-white transition-all duration-200 min-h-[44px] disabled:opacity-40"
                style={{ 
                  borderColor: COLORS.darkBorderSubtle, 
                  background: 'rgba(255,255,255,0.04)',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                {cancelText}
              </button>
              <motion.button
                onClick={handleConfirm}
                disabled={loading}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-200 min-h-[44px] disabled:opacity-50 flex items-center gap-2 ${confirmButtonClass}`}
                style={{ 
                  background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
                  width: isMobile ? '100%' : 'auto',
                  justifyContent: 'center',
                }}
                whileHover={loading ? {} : { brightness: 1.1 }}
                whileTap={loading ? {} : { scale: 0.96 }}
              >
                {loading ? (
                  <>
                    <motion.div
                      className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                    />
                    Processing...
                  </>
                ) : confirmText}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmDialog;
