import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Notice } from '@/components/ui/Notice';

/**
 * AccountLockoutMessage - Display account lockout countdown timer
 * @param {Object} props
 * @param {Date} props.lockoutEndTime - The time when the lockout expires
 */
const AccountLockoutMessage = ({ lockoutEndTime }) => {
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
    <Notice
      tone={isUnlocked ? 'success' : 'warning'}
      title={isUnlocked ? 'Account Unlocked' : 'Account Temporarily Locked'}
      className="lockout-message ui-fade-in"
    >
      {isUnlocked ? (
        'You can now try logging in again.'
      ) : (
        <>
          Too many failed login attempts. Please try again in{' '}
          <span className="font-semibold tabular-nums">{timeRemaining}</span>.
        </>
      )}
    </Notice>
  );
};

AccountLockoutMessage.propTypes = {
  lockoutEndTime: PropTypes.instanceOf(Date).isRequired,
};

export default AccountLockoutMessage;
