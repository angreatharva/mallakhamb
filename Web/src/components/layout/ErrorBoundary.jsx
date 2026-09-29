// Error boundary component for graceful error handling
import React from 'react';
import PropTypes from 'prop-types';
import { logger } from '@/infrastructure/logger';

/**
 * HIGH-W2: this used to be mounted exactly once, around the entire app, so any
 * render error anywhere replaced the whole UI — a judge mid-slip lost the
 * screen, the socket connection and any unsaved section scores in one step,
 * with no route back except a full reload.
 *
 * It is now also mounted per role layout. Two props make that useful:
 *  - `resetKey`   — when it changes the boundary clears its error, so
 *                   navigating away from a crashed route recovers instead of
 *                   leaving the boundary latched for the rest of the session.
 *  - `homePath`   — renders a second action so the user can leave the broken
 *                   screen without reloading and losing their session.
 *
 * With no props it behaves exactly as before, which is how App.jsx uses it.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    logger.error('Error caught by boundary:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  componentDidUpdate(prevProps) {
    // Without this a boundary stays latched forever: React does not reset
    // error state on its own, so the user would keep seeing the fallback even
    // after navigating to a route that renders perfectly well.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  }

  render() {
    if (this.state.hasError) {
      const {
        title = 'Something went wrong',
        message = "We're sorry for the inconvenience. Please try refreshing the page.",
        homePath,
        homeLabel = 'Back to dashboard',
      } = this.props;

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-snow rounded-xl shadow-lg p-8 max-w-md w-full">
            <div className="text-center">
              <div className="text-red-600 text-6xl mb-4">⚠️</div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {title}
              </h1>
              <p className="text-gray-600 mb-6">
                {message}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Refresh Page
              </button>
              {homePath && (
                // A plain anchor rather than a router link: this is a class
                // component that must keep working even if the crash came from
                // the router subtree itself.
                <a
                  href={homePath}
                  className="block mt-3 px-6 py-3 text-blue-700 hover:text-blue-900 transition-colors"
                >
                  {homeLabel}
                </a>
              )}
              {import.meta.env.MODE === 'development' && (
                <details className="mt-6 text-left">
                  <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                    Error Details (Dev Only)
                  </summary>
                  <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto max-h-64">
                    {this.state.error && this.state.error.toString()}
                    {this.state.errorInfo && this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
  /** Changing this clears a latched error — pass the current route path. */
  resetKey: PropTypes.string,
  title: PropTypes.string,
  message: PropTypes.string,
  /** When set, renders an escape hatch that does not require a reload. */
  homePath: PropTypes.string,
  homeLabel: PropTypes.string,
};

export default ErrorBoundary;
