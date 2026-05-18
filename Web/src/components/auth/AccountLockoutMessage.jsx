import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * AccountLockoutMessage - Display account lockout countdown timer
 * @param {Object} props
 * @param {Date} props.lockoutEndTime - The time when the lockout expires
 * @param {string} props.primaryColor - Primary color for styling
 */
const AccountLockoutMessage = ({ lockoutEndTime, primaryColor = '#FF6B6B' }) => {
  const [timeRemaining, setTimeRemaining] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const diff = lockoutEndTime.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining('Account unlocked');
        setIsUnlocked(true);
        return true; // Signal to clear interval
      } else {
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        return false;
      }
    };

    // Initial update
    const shouldStop = updateTimer();
    if (shouldStop) return;

    // Set up interval
    const interval = setInterval(() => {
      const shouldStop = updateTimer();
      if (shouldStop) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutEndTime]);

  return (
    <motion.div
      className="lockout-message rounded-lg p-4 mb-4"
      style={{
        background: `${primaryColor}15`,
        border: `1px solid ${primaryColor}40`,
      }}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          className="icon flex-shrink-0 mt-0.5"
          style={{ color: primaryColor }}
          size={20}
          aria-hidden="true"
        />
        <div className="flex-1">
          <p className="title font-bold text-sm mb-1" style={{ color: primaryColor }}>
            {isUnlocked ? 'Account Unlocked' : 'Account Temporarily Locked'}
          </p>
          <p className="description text-xs text-white/60">
            {isUnlocked ? (
              'You can now try logging in again.'
            ) : (
              <>
                Too many failed login attempts. Please try again in{' '}
                <span className="font-mono font-semibold" style={{ color: primaryColor }}>
                  {timeRemaining}
                </span>
                .
              </>
            )}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default AccountLockoutMessage;
