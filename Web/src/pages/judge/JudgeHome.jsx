import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, RefreshCw, Search, UserRound } from 'lucide-react';
import { judgeAPI } from '@/services/public/judge.api';
import { statsAPI } from '@/services/api';
import { logger } from '@/infrastructure/logger';
import { AppHeader, Fact, InfoRow, PageHeader } from '@/components/shell';
import { Button, EmptyState, Heading, IconButton, Panel, Stat, StatusTag, TextLink } from '@/components/ui';
import { fmt, signed } from '@/components/charts/chartTheme';
import { styleWord } from '@/pages/shared/stats/statsModel';
import { useJudgeLogout } from './useJudgeLogout';

/** What organisers look at when they staff a panel; the home nudges until it is filled in. */
const STAFFING_FIELDS = ['certificationLevel', 'stateUnit', 'registrationNumber'];

const NEXT_STEPS = [
  { title: 'Keep your profile up to date', body: 'Certification level, state and MFI number are what organisers look at when they staff a panel.' },
  { title: 'An organiser seats you on a panel', body: 'You are told your role — Senior Judge, Judge, Scorer or Time Keeper — for each category.' },
  { title: 'Choose your competition and category', body: 'Use “Check for a panel”. Your competition and categories open here, ready to score.' },
];

const memberSince = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : '—';
};

/**
 * JudgeHome — the signed-in home of a judge who holds no panel seat.
 *
 * Anyone can register as a judge; being seated is a separate act by an
 * organiser. Until then there is no category to pick, so instead of the picker
 * this is the judge's dashboard, in the same shape the player and coach get:
 * who they are, what organisers see, what happens next, and a way to check
 * for a new seat without signing out and in again.
 *
 * Rendered by JudgeDashboard (which owns the "has seats" decision), so the
 * seated flow is untouched.
 *
 * @param {{ fallbackName?: string }} props - the stored judge's name, shown
 *   until the profile arrives
 */
const JudgeHome = ({ fallbackName = '' }) => {
  const navigate = useNavigate();
  const handleLogout = useJudgeLogout();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [insights, setInsights] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await judgeAPI.getProfile();
      const data = response.data?.data || {};
      setProfile(data);
    } catch (error) {
      logger.error('Could not load judge profile', error);
      toast.error(error.response?.data?.message || 'Could not load your profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Marking insights only exist for someone who has sat on a published panel;
  // for everyone else this stays hidden, and a failure simply hides it too.
  useEffect(() => {
    let cancelled = false;
    statsAPI.judge()
      .then((response) => { if (!cancelled) setInsights(response.data?.data?.summary || null); })
      .catch((error) => logger.warn('Could not load marking insights for the home', error));
    return () => { cancelled = true; };
  }, []);

  /**
   * An organiser may seat the judge while they are signed in. A live check is
   * enough: the competition step re-scopes the session token, so there is no
   * need to sign out and back in.
   */
  const checkForPanel = async () => {
    setChecking(true);
    try {
      const response = await judgeAPI.getAssignments();
      const seats = response.data?.data || [];
      if (seats.length > 0) {
        toast.success('You have a panel seat — choose your competition');
        navigate('/judge/select-level');
        return;
      }
      toast('No panel seat yet. We’ll show it here as soon as an organiser adds you.');
    } catch (error) {
      logger.error('Could not check panel assignments', error);
      toast.error(error.response?.data?.message || 'Could not check for a panel right now');
    } finally {
      setChecking(false);
    }
  };

  const name = profile?.name || fallbackName || 'Judge';
  const missingStaffingFacts = profile ? STAFFING_FIELDS.some((field) => !profile[field]) : false;
  const lede = [
    'Judge',
    profile?.certificationLevel ? `${profile.certificationLevel} certification` : null,
    profile?.stateUnit,
  ].filter(Boolean).join(' · ');
  const style = insights?.performances > 0 ? styleWord(insights.strictness?.mean) : null;

  return (
    <>
      <AppHeader fixed role="judge" segment={name} homeTo="/judge/dashboard" profileTo="/judge/profile" onLogout={handleLogout} />
      <main id="main-content" className="pt-16 bg-bg text-fg min-h-dvh" data-testid="judge-home">
        <div className="max-w-6xl mx-auto px-[var(--pad)] pb-12 space-y-8">
          <PageHeader
            eyebrow="Welcome back"
            title={name}
            asIs
            lede={lede}
            actions={(
              <>
                <IconButton label="Refresh your details" icon={RefreshCw} variant="ghost" onClick={() => { setLoading(true); load(); }} />
                <StatusTag status="warning">Awaiting panel</StatusTag>
              </>
            )}
          />

          {loading && !profile && (
            <p className="type-body-s text-fg-muted flex items-center gap-3 m-0" role="status">
              <span className="ui-spinner" aria-hidden="true" />
              Loading your details…
            </p>
          )}

          {/* Why there is no category to pick, and the two things worth doing meanwhile. */}
          <EmptyState
            tag="No panel seat yet"
            className="ui-fade-in"
            action={(
              <div className="flex flex-col sm:flex-row gap-2">
                <Button icon={Search} loading={checking} onClick={checkForPanel}>
                  Check for a panel
                </Button>
                {missingStaffingFacts && (
                  <Button variant="line" icon={UserRound} onClick={() => navigate('/judge/profile')}>
                    Complete your profile
                  </Button>
                )}
              </div>
            )}
          >
            Your account is ready. An organiser seats you on a competition panel — when they do, the categories you
            judge appear here.
            {missingStaffingFacts && ' Organisers see your certification level, state and MFI number when staffing panels, so fill them in.'}
          </EmptyState>

          {profile && (
            <>
              {/* Key facts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Fact label="Certification" value={profile.certificationLevel || 'Not set'} />
                <Fact label="State / Unit" value={profile.stateUnit || 'Not set'} />
                <Fact label="MFI Reg. No." value={profile.registrationNumber || 'Not set'} />
                <Fact label="Member since" value={memberSince(profile.createdAt)} />
              </div>

              {/* Detail panels */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <Panel>
                  <Heading level={2} step="display-s" className="mb-3">Profile Information</Heading>
                  <InfoRow label="Full Name" value={profile.name} />
                  <InfoRow label="Email" value={profile.email} />
                  <InfoRow label="Phone" value={profile.phone} />
                  <InfoRow label="State / Unit" value={profile.stateUnit} />
                  <InfoRow label="MFI Reg. No." value={profile.registrationNumber} last />
                  <TextLink as={Link} to="/judge/profile" className="mt-3">
                    Edit profile
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </TextLink>
                </Panel>

                {/* The road from here to a slip, so the wait reads as a step, not a dead end. */}
                <Panel aria-labelledby="judge-home-next">
                  <Heading level={2} step="display-s" id="judge-home-next" className="mb-3">What happens next</Heading>
                  <ol className="m-0 p-0 list-none grid gap-0">
                    {NEXT_STEPS.map((step, i) => (
                      <li key={step.title} className={`py-3 grid grid-cols-[2rem_1fr] gap-3 ${i < NEXT_STEPS.length - 1 ? 'border-b border-line' : ''}`}>
                        <span className="type-num-m text-accent-fg" aria-hidden="true">{i + 1}</span>
                        <div className="grid gap-1 min-w-0">
                          <p className="m-0 type-body-s font-semibold text-fg">{step.title}</p>
                          <p className="m-0 type-caption text-fg-muted">{step.body}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Panel>
              </div>

              {/* Marking insights, for a judge who has sat on a published panel before. */}
              {insights?.performances > 0 && (
                <Panel className="grid gap-4" aria-labelledby="judge-home-insights">
                  <Heading level={2} step="display-s" id="judge-home-insights" className="m-0">Marking insights</Heading>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Stat label="Marks compared" value={insights.performances} />
                    <Stat label="Your style" value={signed(insights.strictness?.mean)} hint={style?.word} />
                    <Stat label="Agreement" value={fmt(insights.agreement)} hint="Average distance from the panel — lower is closer" />
                  </div>
                  <TextLink as={Link} to="/judge/profile?tab=stats">
                    See all insights
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </TextLink>
                </Panel>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
};

JudgeHome.propTypes = {
  fallbackName: PropTypes.string,
};

export default JudgeHome;
