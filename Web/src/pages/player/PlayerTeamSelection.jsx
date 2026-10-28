import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { playerAPI } from '@/services/api';
import { useCompetition } from '@/contexts/CompetitionContext';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/infrastructure/logger';
import { Button, EmptyState, Input, Notice, Panel, RunningOrder, RunningOrderItem, Tag } from '@/components/ui';
import { levelLabel } from '@/utils/competition/levels';
import { PageHeader } from '@/components/shell';

/**
 * PlayerTeamSelection — the Team step of Level → Team → Competition.
 *
 * A player's team is FINAL at each competition level (Player.levelTeams;
 * docs/team-per-level-plan.md). At a level where they already have one, the
 * team is shown read-only. Otherwise they choose, and the choice is final for
 * that level; their old team, if any, is offered first.
 */
const PlayerTeamSelection = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentCompetition, fetchAssignedCompetitions, selectedLevel } = useCompetition();
  const { user, login } = useAuth();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [joining, setJoining] = useState(false);
  // { team, final, suggested } at the chosen level; null before it loads or
  // when no level was chosen (older links).
  const [atLevel, setAtLevel] = useState(null);
  const level = selectedLevel || null;
  const levelName = level ? levelLabel(level) : '';

  /*
   * The meet, if one is already chosen.
   *
   * Usually there is none: players pick Level → Team → Competition, so this
   * screen comes before the meet. A URL `competitionId` (older links) or the
   * context's meet (the dashboard sending a teamless player here) still
   * counts, and the player then returns to that meet after joining.
   *
   * Sent to both the team list and the join. The list does not honour it yet
   * (PlayerService.getAvailableTeams ignores its argument and returns every
   * active team), so a player still sees squads from meets they did not pick;
   * the join does record it. Passing it from here is what makes fixing the
   * list a server-only change.
   */
  const competitionId = searchParams.get('competitionId') || currentCompetition?._id || null;

  useEffect(() => {
    fetchTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId]);

  useEffect(() => {
    if (!level) { setAtLevel(null); return; }
    playerAPI.getTeamAtLevel(level)
      .then((res) => setAtLevel(res.data?.data || null))
      .catch((error) => logger.warn('Could not load the team at this level', { message: error?.message }));
  }, [level]);

  /** Where the player goes once the team step is done. */
  const nextPath = () => (competitionId
    ? `/player/dashboard?competitionId=${competitionId}`
    : '/player/select-competition');

  /** Remember the level's team on the stored user, so the choosers skip this step. */
  const rememberLevelTeam = (teamId, levelTeams) => {
    if (!user) return;
    const known = levelTeams || [
      ...(user.levelTeams || []).filter((entry) => entry.level !== level),
      ...(level ? [{ level, team: teamId }] : []),
    ];
    login({ ...user, team: user.team || teamId, levelTeams: known }, null, 'player');
  };

  const continueWithFinal = async () => {
    rememberLevelTeam(String(atLevel.team._id));
    await fetchAssignedCompetitions?.();
    navigate(nextPath(), { replace: true });
  };

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const response = await playerAPI.getTeams(competitionId);
      const payload = response.data?.data ?? response.data?.teams ?? response.data ?? [];
      const teamsList = Array.isArray(payload) ? payload : [];
      setTeams(teamsList);
      logger.info('Teams loaded for selection', { count: teamsList.length });
    } catch (error) {
      logger.error('Failed to fetch teams:', error);
      toast.error('Failed to load teams');
    } finally {
      setLoading(false);
    }
  };

  const handleTeamSelect = async (team) => {
    setSelectedTeam(team);
    setJoining(true);
    try {
      // The meet goes with the join: it is optional server-side, but sending it
      // is what lets the roster entry be attributed to the right competition.
      const res = await playerAPI.updateTeam({ teamId: team._id, ...(competitionId && { competitionId }), ...(level && { level }) });
      toast.success(`Successfully joined ${team.name}!`);
      logger.info('Player joined team', { teamId: team._id, teamName: team.name });

      // The choosers read the team off the stored user, and the meets offered
      // next are the ones this team is entered in — refresh both now.
      rememberLevelTeam(team._id, res.data?.data?.player?.levelTeams);
      await fetchAssignedCompetitions?.();

      // Level → Team → Competition. A player who already chose a meet (an
      // older link, or the dashboard sending them here) goes straight back.
      const next = nextPath();
      setTimeout(() => {
        navigate(next, { replace: true });
      }, 500);
    } catch (error) {
      logger.error('Failed to join team:', error);
      // A 423 (meet locked by its end date) carries its reason under data.error,
      // which data.message misses; the api-client lifts it onto the error.
      toast.error(error.competitionLockedMessage || error.response?.data?.error?.message || error.response?.data?.message || 'Failed to join team');
      // Someone set this level's team meanwhile: show it.
      if (level && error.response?.status === 409) {
        playerAPI.getTeamAtLevel(level).then((r) => setAtLevel(r.data?.data || null)).catch(() => {});
      }
      setSelectedTeam(null);
      setJoining(false);
    }
  };

  // The player's old team first, marked, as the suggestion.
  const suggestedId = atLevel?.suggested?._id ? String(atLevel.suggested._id) : null;
  const ordered = suggestedId
    ? [...teams].sort((a, b) => Number(String(b._id) === suggestedId) - Number(String(a._id) === suggestedId))
    : teams;

  const filteredTeams = ordered.filter((team) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      team.name?.toLowerCase().includes(q) ||
      team.description?.toLowerCase().includes(q) ||
      team.coach?.name?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg">
        <p className="type-body-s text-fg-muted flex items-center gap-3 m-0">
          <span className="ui-spinner" aria-hidden="true" />
          Loading teams...
        </p>
      </div>
    );
  }

  if (atLevel?.final && atLevel.team) {
    return (
      <div className="min-h-dvh bg-bg text-fg">
        <div className="max-w-4xl mx-auto px-[var(--pad)] pb-12">
          <PageHeader eyebrow="Player" title={`Your ${levelName} Team`} />
          <Panel className="grid gap-4 p-5" data-testid="player-final-team">
            <div className="grid gap-1">
              <Tag tone="ident" className="justify-self-start">{levelName} · final</Tag>
              <p className="type-display-m m-0">{atLevel.team.name}</p>
              {atLevel.team.coach?.name && <p className="type-body-s text-fg-muted m-0">Coach: {atLevel.team.coach.name}</p>}
            </div>
            <p className="type-body-s text-fg-muted m-0">
              A player&apos;s team is final for each level. Only the competition office can change it.
            </p>
            <Button className="justify-self-start" onClick={continueWithFinal}>Continue</Button>
          </Panel>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="max-w-4xl mx-auto px-[var(--pad)] pb-12">
        <PageHeader
          eyebrow="Player"
          title={level ? `Choose Your ${levelName} Team` : 'Select Your Team'}
          lede={level
            ? `Pick the team you will compete for at ${levelName} level.`
            : 'Choose the team you want to join to start competing'}
        />

        {level && (
          <Notice tone="warning" className="mb-6" title={`Final for ${levelName}`}>
            Once you join, this is your team for every {levelName} competition. Your teams at other levels stay as they are.
          </Notice>
        )}

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted pointer-events-none z-10" aria-hidden="true" />
          <Input
            type="text"
            placeholder="Search teams by name, description, or coach..." aria-label="Search teams"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Teams */}
        {filteredTeams.length === 0 ? (
          <EmptyState tag={searchQuery ? 'No teams found' : 'No teams available'} className="ui-fade-in">
            {searchQuery
              ? 'Try adjusting your search query'
              : 'There are no teams available at the moment'}
          </EmptyState>
        ) : (
          <RunningOrder label="Teams">
            {filteredTeams.map((team, index) => {
              const isJoining = selectedTeam?._id === team._id && joining;
              return (
                <RunningOrderItem
                  key={team._id}
                  index={index + 1}
                  // An h3, as the card had: the join flow finds the team by it.
                  titleAs="h3"
                  title={team.name}
                  meta={(team.description || team.coach?.name) ? (
                    <>
                      {team.description && <span className="block line-clamp-2">{team.description}</span>}
                      {team.coach?.name && <span className="block">Coach: {team.coach.name}</span>}
                    </>
                  ) : null}
                  aside={isJoining ? (
                    <Tag tone="accent"><span className="ui-spinner" aria-hidden="true" />Joining...</Tag>
                  ) : String(team._id) === suggestedId ? (
                    <Tag tone="ident">Your team · Join</Tag>
                  ) : (
                    <Tag>Join</Tag>
                  )}
                  selected={selectedTeam?._id === team._id}
                  disabled={joining}
                  onClick={() => !joining && handleTeamSelect(team)}
                />
              );
            })}
          </RunningOrder>
        )}
      </div>
    </div>
  );
};

export default PlayerTeamSelection;
