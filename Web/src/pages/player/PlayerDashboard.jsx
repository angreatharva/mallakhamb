import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useLocation } from 'react-router-dom';
import { playerAPI } from '@/services/api';
import { useCompetition } from '../../contexts/CompetitionContext';
import CompetitionDisplay from '@/components/competition/CompetitionDisplay';
import { logger } from '@/infrastructure/logger';
import { secureStorage } from '@/utils/auth/secureStorage';
import { getCompetitionIdFromToken } from '@/utils/auth/tokenUtils';
import Dropdown from '@/components/auth/Dropdown';
import PerformancePanel from '@/components/performance/PerformancePanel';
import QualifiedFinals from '@/components/finals/QualifiedFinals';
import { levelLabel } from '@/utils/competition/levels';
import {
  Dialog, EmptyState, Heading, IconButton, Panel, RunningOrder, RunningOrderItem, StatusTag, Tag,
} from '@/components/ui';
import { PageHeader } from '@/components/shell';

// ─── Key fact ─────────────────────────────────────────────────────────────────
/** One fact at the top of the dashboard: a tag label over a value (or a control). */
const Fact = ({ label, value, children }) => (
  <Panel className="grid gap-2 content-start">
    <p className="type-tag text-fg-muted m-0">{label}</p>
    {children || <p className="m-0 text-fg font-bold text-lg leading-tight truncate">{value || '—'}</p>}
  </Panel>
);

// ─── Info row ─────────────────────────────────────────────────────────────────
const InfoRow = ({ label, value, last = false }) => (
  <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 gap-1 ${!last ? 'border-b border-line' : ''}`}>
    <span className="text-fg-muted type-body-s">{label}</span>
    <span className="text-fg type-body-s font-semibold sm:text-right break-all">{value || '—'}</span>
  </div>
);

// ─── Status ───────────────────────────────────────────────────────────────────
const STATUS = { Submitted: 'success', Active: 'info' };
const StatusBadge = ({ status }) => (STATUS[status]
  ? <StatusTag status={STATUS[status]}>{status}</StatusTag>
  : <Tag>{status || 'Not assigned'}</Tag>);

// ─── Age group display ────────────────────────────────────────────────────────
const AGE_GROUP_MAP = {
  Under10: 'Under 10', Under12: 'Under 12', Under14: 'Under 14',
  Under16: 'Under 16', Under18: 'Under 18', Above18: 'Above 18', Above16: 'Above 16',
};

// ─── PlayerDashboard ──────────────────────────────────────────────────────────
const PlayerDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentCompetition, assignedCompetitions, switchCompetition, isLoading: competitionLoading } = useCompetition();
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [updatingTeam, setUpdatingTeam] = useState(false);
  const [showCompetitionModal, setShowCompetitionModal] = useState(false);
  const urlCompetitionHandledRef = useRef(false);


  const clearCompetitionIdFromUrl = useCallback(() => {
    const searchParams = new URLSearchParams(location.search);
    if (!searchParams.has('competitionId')) return;
    searchParams.delete('competitionId');
    const newSearch = searchParams.toString();
    navigate(`${location.pathname}${newSearch ? `?${newSearch}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  // Apply ?competitionId= from login only once — never fight later dropdown switches
  useEffect(() => {
    const competitionIdFromUrl = new URLSearchParams(location.search).get('competitionId');

    if (
      competitionIdFromUrl &&
      currentCompetition &&
      String(currentCompetition._id) !== String(competitionIdFromUrl)
    ) {
      clearCompetitionIdFromUrl();
      urlCompetitionHandledRef.current = true;
      return;
    }

    if (competitionIdFromUrl && assignedCompetitions?.length > 0 && !urlCompetitionHandledRef.current) {
      urlCompetitionHandledRef.current = true;
      const competition = assignedCompetitions.find(
        (c) => String(c._id) === String(competitionIdFromUrl)
      );

      if (competition && (!currentCompetition || String(currentCompetition._id) !== String(competitionIdFromUrl))) {
        logger.info('Setting competition from URL parameter', {
          competitionId: competitionIdFromUrl,
          competitionName: competition.name,
        });
        switchCompetition(competitionIdFromUrl)
          .catch((error) => {
            logger.error('Failed to set competition from URL:', error);
          })
          .finally(() => {
            clearCompetitionIdFromUrl();
          });
        return;
      }

      clearCompetitionIdFromUrl();
    }
  }, [
    location.search,
    assignedCompetitions,
    currentCompetition,
    switchCompetition,
    clearCompetitionIdFromUrl,
  ]);

  useEffect(() => {
    fetchPlayerProfile();
  }, []);

  // `/players/team` requires JWT competition context — refetch after context is set (auto-select, modal, URL).
  useEffect(() => {
    if (!currentCompetition?._id) return;
    fetchPlayerProfile(false);
     
  }, [currentCompetition?._id]);

  // Show modal if multiple competitions and no current competition selected
  useEffect(() => {
    // Wait for competitions to load
    if (competitionLoading || !assignedCompetitions) return;

    const competitionCount = assignedCompetitions.length;
    
    // If 2+ competitions and no current competition, show modal
    if (competitionCount > 1 && !currentCompetition) {
      logger.info('Multiple competitions found, showing selection modal', { count: competitionCount });
      setShowCompetitionModal(true);
    }
  }, [competitionLoading, assignedCompetitions, currentCompetition]);

  // Redirect to team selection if player has no team
  useEffect(() => {
    if (!loading && player) {
      // Team can be null, undefined, or a string ID, or an object
      const hasTeam = player.team && (
        typeof player.team === 'string' ? player.team : 
        (player.team._id || player.team.id)
      );
      
      if (!hasTeam) {
        logger.info('Player has no team, redirecting to team selection');
        navigate('/player/select-team', { replace: true });
      }
    }
  }, [loading, player, navigate]);

  useEffect(() => {
    if (player && !player.team) fetchTeams();
  }, [player]);

  const fetchPlayerProfile = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      // Always load profile first (stable source for player identity fields)
      const profileResponse = await playerAPI.getProfile();
      const profileData = profileResponse.data?.data || profileResponse.data || {};

      const token = secureStorage.getItem('player_token');
      const competitionIdInToken = getCompetitionIdFromToken(token);

      // GET /players/team requires competition in JWT (validateCompetitionContext). Skip until set-competition.
      if (!competitionIdInToken) {
        const hasTeam = profileData.team && profileData.team._id;
        setPlayer({
          ...profileData,
          teamStatus: hasTeam ? 'Assigned' : 'Not assigned',
        });
      } else {
        try {
          const teamResponse = await playerAPI.getTeam();
          const teamPayload = teamResponse.data?.data || teamResponse.data || {};
          const resolvedTeam = teamPayload.team || null;
          const hasTeam = !!(resolvedTeam && (resolvedTeam._id || resolvedTeam.id));

          setPlayer({
            ...profileData,
            team: resolvedTeam || profileData.team || null,
            teamStatus: teamPayload.teamStatus || (hasTeam ? 'Assigned' : 'Not assigned'),
          });
        } catch (teamError) {
          logger.info('Team fetch failed, using profile fallback:', teamError.response?.data?.error?.message || teamError.response?.data?.message);
          const hasTeam = profileData.team && profileData.team._id;
          setPlayer({
            ...profileData,
            teamStatus: hasTeam ? 'Assigned' : 'Not assigned',
          });
        }
      }
    } catch (error) {
      logger.error('Failed to fetch player profile:', error);
      // Don't show error toast if it's just a competition context issue
      const errCode = error.response?.data?.error?.code || error.response?.data?.code;
      if (errCode !== 'COMPETITION_CONTEXT_REQUIRED') {
        toast.error('Failed to load profile');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchTeams = async () => {
    setTeamsLoading(true);
    try {
      const response = await playerAPI.getTeams();
      const payload = response.data?.data ?? response.data?.teams ?? response.data ?? [];
      const teamsList = Array.isArray(payload) ? payload : [];
      setTeams(teamsList.map((t) => ({ value: t._id || t.id, label: t.name })));
    } catch {
      toast.error('Failed to load teams');
    } finally {
      setTeamsLoading(false);
    }
  };

  const handleTeamSelect = async (teamOption) => {
    setSelectedTeam(teamOption);
    setUpdatingTeam(true);
    try {
      await playerAPI.updateTeam({ teamId: teamOption.value });
      toast.success('Team selected successfully!');
      await fetchPlayerProfile();
      setSelectedTeam(null);
    } catch (error) {
      toast.error(error.competitionLockedMessage || error.response?.data?.message || 'Failed to select team');
      setSelectedTeam(null);
    } finally {
      setUpdatingTeam(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg">
        <p className="type-body-s text-fg-muted flex items-center gap-3 m-0">
          <span className="ui-spinner" aria-hidden="true" />
          Loading your profile...
        </p>
      </div>
    );
  }

  const teamPicker = (placeholder) => (
    <Dropdown
      options={teams}
      value={selectedTeam}
      onChange={handleTeamSelect}
      placeholder={placeholder}
      loading={teamsLoading || updatingTeam}
      disabled={updatingTeam}
    />
  );

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="max-w-6xl mx-auto px-[var(--pad)] pb-12 space-y-8">
        <PageHeader
          eyebrow="Welcome back"
          title={`${player?.firstName || ''} ${player?.lastName || ''}`.trim() || 'Player'}
          asIs
          lede={player?.team ? `Team: ${player.team.name}` : 'No team assigned yet'}
          actions={(
            <>
              <IconButton label="Refresh player data" icon={RefreshCw} variant="ghost" onClick={() => fetchPlayerProfile(true)} />
              <StatusBadge status={player?.teamStatus} />
            </>
          )}
        />

        {/* Competition context */}
        {assignedCompetitions && assignedCompetitions.length > 0 ? (
          <CompetitionDisplay className="mb-0" />
        ) : (
          <EmptyState tag="No competitions yet" className="ui-fade-in">
            No competitions assigned yet. Your coach will add you to competitions.
          </EmptyState>
        )}

        {/* Key facts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Fact label="Team">
            {player?.team
              ? <p className="m-0 text-fg font-bold text-lg leading-tight truncate">{player.team.name}</p>
              : teamPicker('Select a team')}
          </Fact>
          <Fact label="Age Group"
            value={player?.ageGroup ? AGE_GROUP_MAP[player.ageGroup] || player.ageGroup : 'Not assigned'} />
          <Fact label="Gender" value={player?.gender} />
          <Fact label="Date of Birth"
            value={player?.dateOfBirth ? new Date(player.dateOfBirth).toLocaleDateString() : 'N/A'} />
        </div>

        {/* Detail panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel>
            <Heading level={2} step="display-s" className="mb-3">Profile Information</Heading>
            <InfoRow label="Full Name" value={`${player?.firstName} ${player?.lastName}`} />
            <InfoRow label="Email" value={player?.email} />
            <InfoRow label="Date of Birth"
              value={player?.dateOfBirth ? new Date(player.dateOfBirth).toLocaleDateString() : 'N/A'} />
            <InfoRow label="Gender" value={player?.gender} />
            <InfoRow label="Team" value={player?.team?.name || 'Not assigned'} last />
          </Panel>

          <Panel>
            <Heading level={2} step="display-s" className="mb-3">Team Information</Heading>
            {player?.team ? (
              <>
                <InfoRow label="Team Name" value={player.team.name} />
                <InfoRow label="Age Group"
                  value={player.ageGroup ? (AGE_GROUP_MAP[player.ageGroup] || player.ageGroup) : 'Not assigned'} />
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 gap-1">
                  <span className="text-fg-muted type-body-s">Status</span>
                  <StatusBadge status={player.teamStatus} />
                </div>
              </>
            ) : (
              <div className="py-4 grid gap-3">
                <p className="type-body-s text-fg m-0">Not assigned to any team yet.</p>
                <p className="type-caption text-fg-muted m-0">Select a team from the card above to join.</p>
                <div className="max-w-xs">
                  {teamPicker('Select a team to join')}
                  {updatingTeam && <p className="type-caption text-accent-fg mt-2 mb-0">Joining team...</p>}
                </div>
              </div>
            )}
          </Panel>
        </div>

        {/* Competition II / III finals this player qualified for. */}
        <QualifiedFinals who="player" load={playerAPI.getFinals} reloadKey={currentCompetition?._id || 'all'} />

        {/* My Performance Section */}
        {player?.team && currentCompetition && (
          <PerformancePanel
            competitionId={currentCompetition._id}
            competitionTypes={currentCompetition.competitionTypes || []}
            apparatusConfig={currentCompetition.apparatusConfig || {}}
            teamId={player.team._id || player.team.id || (typeof player.team === 'string' ? player.team : '')}
            highlightPlayerId={player._id || player.id}
            selfOnly={true}
            gender={player.gender}
            ageGroup={player.ageGroup}
            title="My Performance & Scores"
            emptyLabel="No finalized scores found for you in this competition yet."
          />
        )}
      </div>

      {/* Competition selection: required when several meets and none chosen (no close). */}
      <Dialog
        open={Boolean(showCompetitionModal && assignedCompetitions && assignedCompetitions.length > 1)}
        onClose={() => {}}
        dismissible={false}
        wide
        title="Select Competition"
      >
        <p className="type-body-s text-fg-muted mt-0 mb-4">
          You&apos;re registered for multiple competitions. Please select one to continue.
        </p>
        <div className="max-h-96 overflow-y-auto">
          <RunningOrder label="Competitions">
            {(assignedCompetitions || []).map((competition, i) => (
              <RunningOrderItem
                key={competition._id}
                index={i + 1}
                titleAs="h3"
                title={competition.name}
                meta={[competition.place, competition.level && levelLabel(competition.level), competition.year].filter(Boolean).join(' · ')}
                onClick={async () => {
                  try {
                    logger.info('Modal: Selecting competition', {
                      competitionId: competition._id,
                      competitionName: competition.name,
                    });
                    await switchCompetition(competition._id);
                    logger.info('Modal: Competition switched successfully');
                    setShowCompetitionModal(false);
                    toast.success(`Selected ${competition.name}`);
                  } catch (error) {
                    logger.error('Modal: Failed to select competition', error);
                    toast.error('Failed to select competition');
                  }
                }}
              />
            ))}
          </RunningOrder>
        </div>
      </Dialog>
    </div>
  );
};

export default PlayerDashboard;
