import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { playerAPI } from '@/services/api';
import { useCompetition } from '@/contexts/CompetitionContext';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/infrastructure/logger';
import { EmptyState, Input, RunningOrder, RunningOrderItem, Tag } from '@/components/ui';
import { PageHeader } from '@/components/shell';

/**
 * PlayerTeamSelection - Screen for players to select their team
 * Shown only when player doesn't have a team assigned
 */
const PlayerTeamSelection = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentCompetition, fetchAssignedCompetitions } = useCompetition();
  const { user, login } = useAuth();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [joining, setJoining] = useState(false);

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
      await playerAPI.updateTeam({ teamId: team._id, ...(competitionId && { competitionId }) });
      toast.success(`Successfully joined ${team.name}!`);
      logger.info('Player joined team', { teamId: team._id, teamName: team.name });

      // The choosers read the team off the stored user, and the meets offered
      // next are the ones this team is entered in — refresh both now.
      if (user) login({ ...user, team: team._id }, null, 'player');
      await fetchAssignedCompetitions?.();

      // Level → Team → Competition. A player who already chose a meet (an
      // older link, or the dashboard sending them here) goes straight back.
      const next = competitionId
        ? `/player/dashboard?competitionId=${competitionId}`
        : '/player/select-competition';
      setTimeout(() => {
        navigate(next, { replace: true });
      }, 500);
    } catch (error) {
      logger.error('Failed to join team:', error);
      // A 423 (meet locked by its end date) carries its reason under data.error,
      // which data.message misses; the api-client lifts it onto the error.
      toast.error(error.competitionLockedMessage || error.response?.data?.message || 'Failed to join team');
      setSelectedTeam(null);
      setJoining(false);
    }
  };

  const filteredTeams = teams.filter((team) => {
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

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="max-w-4xl mx-auto px-[var(--pad)] pb-12">
        <PageHeader
          eyebrow="Player"
          title="Select Your Team"
          lede="Choose the team you want to join to start competing"
        />

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
