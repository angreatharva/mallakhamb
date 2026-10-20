import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { coachAPI } from '@/services/api';
import { logger } from '@/infrastructure/logger';
import { useAuth } from '@/contexts/AuthContext';
import { Heading, Panel, TextLink } from '@/components/ui';
import PlayerDefaultPasswordSection from './PlayerDefaultPasswordSection';

/**
 * A coach's first job: the default password for players they register.
 *
 * Until it is set (and readable), every coach page sends them to
 * SETUP_PATH; once saved they continue to the page they were going to. The
 * answer is remembered for the tab in sessionStorage, which logout clears, so
 * the check costs one request per sign-in.
 */
export const SETUP_PATH = '/coach/setup-player-password';
const READY_KEY = 'coach_player_password_ready';

const isReady = (data) => Boolean(data?.isSet && data?.readable);
export const markPlayerPasswordReady = () => sessionStorage.setItem(READY_KEY, '1');

export const CoachPlayerPasswordGate = ({ children }) => {
  const location = useLocation();
  const [ready, setReady] = useState(() => sessionStorage.getItem(READY_KEY) === '1');
  const [checked, setChecked] = useState(ready);

  useEffect(() => {
    if (ready) return undefined;
    let cancelled = false;
    coachAPI.playerDefaultPassword.get()
      .then((response) => {
        if (cancelled) return;
        const ok = isReady(response.data?.data);
        if (ok) markPlayerPasswordReady();
        setReady(ok);
      })
      .catch((error) => {
        // A failed check must not lock the coach out of their dashboard; the
        // Register Player dialog still refuses without a default.
        logger.error('Could not check the default player password', error);
        if (!cancelled) setReady(true);
      })
      .finally(() => { if (!cancelled) setChecked(true); });
    return () => { cancelled = true; };
  }, [ready]);

  if (location.pathname === SETUP_PATH) return children;

  // The setup screen marks the flag and navigates on; this gate (in the
  // layout) stays mounted across that, so it reads the flag again here.
  if (sessionStorage.getItem(READY_KEY) === '1') return children;

  if (!checked) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg">
        <p className="type-body-s text-fg-muted flex items-center gap-3 m-0">
          <span className="ui-spinner" aria-hidden="true" />
          Loading…
        </p>
      </div>
    );
  }

  if (!ready) {
    return <Navigate to={SETUP_PATH} replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return children;
};

CoachPlayerPasswordGate.propTypes = { children: PropTypes.node.isRequired };

/** The screen the gate sends a coach to: set the default, then carry on. */
export const CoachPlayerPasswordSetup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const from = location.state?.from;
  const next = from && from !== SETUP_PATH ? from : '/coach/select-level';

  return (
    <div className="min-h-screen bg-bg text-fg flex items-center justify-center py-12 px-[var(--pad)]">
      <div className="w-full max-w-md grid gap-6 ui-fade-in">
        <Panel variant="feature" className="grid gap-2">
          <Heading level={1} step="display-l">Before you start</Heading>
          <p className="type-body-s text-fg-muted m-0">
            Set the default password for players you register without an email. You can see it and
            change it any time from your profile.
          </p>
        </Panel>
        <PlayerDefaultPasswordSection
          idPrefix="setup"
          onChanged={(data) => {
            if (!isReady(data)) return;
            markPlayerPasswordReady();
            navigate(next, { replace: true });
          }}
        />
        <p className="type-caption text-fg-muted m-0 text-center">
          Not you? <TextLink as="button" type="button" onClick={logout}>Sign out</TextLink>
        </p>
      </div>
    </div>
  );
};
