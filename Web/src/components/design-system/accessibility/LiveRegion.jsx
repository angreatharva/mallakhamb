import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

/**
 * LiveRegion - ARIA live region for screen reader announcements
 *
 * Provides accessible announcements for dynamic content changes,
 * particularly useful for error messages and status updates.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Content to announce
 * @param {'polite'|'assertive'|'off'} [props.politeness='polite'] - ARIA live politeness level
 * @param {'status'|'alert'|'log'} [props.role='status'] - ARIA role
 * @param {boolean} [props.atomic=true] - Whether to announce entire region or just changes
 * @param {boolean} [props.clearOnUnmount=true] - Clear announcement when component unmounts
 *
 * @example
 * // Polite announcement for status updates
 * <LiveRegion politeness="polite" role="status">
 *   Form submitted successfully
 * </LiveRegion>
 *
 * @example
 * // Assertive announcement for errors
 * <LiveRegion politeness="assertive" role="alert">
 *   Error: Email is required
 * </LiveRegion>
 *
 * **Validates: Requirement 11.5**
 */
export const LiveRegion = ({
  children,
  politeness = 'polite',
  role = 'status',
  atomic = true,
  clearOnUnmount = true,
}) => {
  const regionRef = useRef(null);

  useEffect(() => {
    // Clear the region on unmount if specified
    return () => {
      if (clearOnUnmount && regionRef.current) {
        regionRef.current.textContent = '';
      }
    };
  }, [clearOnUnmount]);

  // Don't render if no children
  if (!children) {
    return null;
  }

  return (
    <div
      ref={regionRef}
      role={role}
      aria-live={politeness}
      aria-atomic={atomic}
      className="sr-only"
    >
      {children}
    </div>
  );
};

LiveRegion.propTypes = {
  children: PropTypes.node,
  politeness: PropTypes.oneOf(['polite', 'assertive', 'off']),
  role: PropTypes.oneOf(['status', 'alert', 'log']),
  atomic: PropTypes.bool,
  clearOnUnmount: PropTypes.bool,
};

LiveRegion.defaultProps = {
  children: null,
  politeness: 'polite',
  role: 'status',
  atomic: true,
  clearOnUnmount: true,
};

/**
 * ErrorAnnouncement - Specialized live region for error messages
 *
 * Uses assertive politeness and alert role for immediate announcement
 * of error messages to screen reader users.
 *
 * @param {Object} props
 * @param {string|React.ReactNode} props.error - Error message to announce
 *
 * @example
 * <ErrorAnnouncement error="Email is required" />
 *
 * **Validates: Requirement 11.5**
 */
export const ErrorAnnouncement = ({ error }) => {
  if (!error) {
    return null;
  }

  return (
    <LiveRegion politeness="assertive" role="alert">
      {typeof error === 'string' ? error : error}
    </LiveRegion>
  );
};

ErrorAnnouncement.propTypes = {
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
};

ErrorAnnouncement.defaultProps = {
  error: null,
};

/**
 * StatusAnnouncement - Specialized live region for status updates
 *
 * Uses polite politeness and status role for non-urgent announcements
 * that don't interrupt the user's current activity.
 *
 * @param {Object} props
 * @param {string|React.ReactNode} props.message - Status message to announce
 *
 * @example
 * <StatusAnnouncement message="Form submitted successfully" />
 *
 * **Validates: Requirement 11.5**
 */
export const StatusAnnouncement = ({ message }) => {
  if (!message) {
    return null;
  }

  return (
    <LiveRegion politeness="polite" role="status">
      {message}
    </LiveRegion>
  );
};

StatusAnnouncement.propTypes = {
  message: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
};

StatusAnnouncement.defaultProps = {
  message: null,
};

export default LiveRegion;
