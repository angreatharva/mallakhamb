import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Filter, Search, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '@/services/api';
import { useRouteContext } from '../../contexts/RouteContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { useAgeGroups } from '../../hooks/useAgeGroups';
import { ResponsiveTeamTable } from '../../components/responsive/ResponsiveTable';
import { ResponsiveTeamRankings } from '../../components/responsive/ResponsiveRankings';
import { logger } from '@/infrastructure/logger';
import { Button, Heading, Tabs, TextLink } from '@/components/ui';
import PlayerRankingBoard from '@/components/scores/PlayerRankingBoard';
import ScoreCategoryFilters from '@/components/scores/ScoreCategoryFilters';
import { rowsFromIndividualScores, filterRows } from '@/components/scores/scoreRows';
import { offeredApparatus } from '@/utils/scoring/apparatus';
import { DarkCard, FadeIn, EmptyState, LoadingState, DarkSearch } from '@/components/admin/AdminKit';

/** Which category the list below shows: a quiet ruled line, not a coloured box. */
const InfoBanner = ({ children }) => (
  <div className="info-line">{children}</div>
);

const SCORE_TYPES = [
  { value: 'add', label: 'Add Score' },
  { value: 'individual', label: 'Individual Rankings' },
  { value: 'rankings', label: 'Team Rankings' },
];

const COMPETITION_TYPE_LABELS = {
  competition_1: 'Competition I - Team Championship',
  competition_2: 'Competition II - All Round Individual',
  competition_3: 'Competition III - Apparatus Championship',
};

const DEFAULT_COMPETITION_TYPES = Object.entries(COMPETITION_TYPE_LABELS)
  .map(([value, label]) => ({ value, label }));

const competitionLabel = (competition) => [
  competition.name,
  competition.year ? ` (${competition.year})` : '',
  competition.place ? ` — ${competition.place}` : '',
].join('');

/** Which view of the scores is on screen (the Tabs primitive: arrows move and select). */
const ScoreTypeTabs = ({ value, onChange }) => (
  <Tabs
    label="Score view"
    idBase="score-view"
    className="mb-5"
    tabs={SCORE_TYPES.map((t) => ({ id: t.value, label: t.label }))}
    value={value}
    onChange={onChange}
  />
);

const Scores = () => {
  const navigate = useNavigate();
  const { routePrefix } = useRouteContext();
  const api = routePrefix === '/superadmin' ? superAdminAPI : adminAPI;
  const isSuperAdmin = routePrefix === '/superadmin';

  const [competitions, setCompetitions] = useState([]);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);
  const [scores, setScores] = useState([]);
  const [submittedTeams, setSubmittedTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [selectedCompetitionType, setSelectedCompetitionType] = useState(null);
  const [selectedApparatus, setSelectedApparatus] = useState(null);
  const [scoreType, setScoreType] = useState('add');
  const [searchTerm, setSearchTerm] = useState('');

  const { currentCompetition } = useCompetition();

  const activeCompetition = isSuperAdmin
    ? competitions.find((c) => c._id === selectedCompetition?.value)
    : currentCompetition;

  /*
   * The competition filter is rendered on all three pages, so an admin sees
   * the same five controls a superadmin and the public do. An admin cannot
   * change it — theirs is fixed by their assignment — so it is preselected and
   * locked rather than hidden, which would have left the page a control short.
   */
  const competitionOptions = useMemo(() => {
    if (isSuperAdmin) {
      return competitions.map((c) => ({ value: c._id, label: competitionLabel(c) }));
    }
    return currentCompetition?._id
      ? [{ value: currentCompetition._id, label: competitionLabel(currentCompetition) }]
      : [];
  }, [isSuperAdmin, competitions, currentCompetition]);

  useEffect(() => {
    if (isSuperAdmin || !currentCompetition?._id) return;
    // Keep the existing object when the id has not changed. Returning it
    // unchanged lets React bail out, so a context that rebuilds
    // `currentCompetition` on every render cannot retrigger the cascade reset
    // below and wipe the filters mid-selection.
    setSelectedCompetition((current) => (
      current?.value === currentCompetition._id
        ? current
        : { value: currentCompetition._id, label: competitionLabel(currentCompetition) }
    ));
  }, [isSuperAdmin, currentCompetition]);

  const ageGroupsForGender = useAgeGroups(
    selectedGender?.value || 'Male',
    isSuperAdmin ? activeCompetition : null
  );
  const ageGroupOptions = selectedGender ? ageGroupsForGender : [];

  const competitionTypeOptions = activeCompetition?.competitionTypes?.length
    ? activeCompetition.competitionTypes.map((type) => ({
        value: type,
        label: COMPETITION_TYPE_LABELS[type] || type,
      }))
    : DEFAULT_COMPETITION_TYPES;

  // Only what the chosen gender competes on in this type.
  const apparatusOptions = selectedCompetitionType && selectedGender && activeCompetition
    ? offeredApparatus(activeCompetition, selectedCompetitionType.value, selectedGender.value)
      .map((app) => ({ value: app, label: app }))
    : [];

  useEffect(() => {
    if (isSuperAdmin) {
      setLoadingCompetitions(true);
      superAdminAPI.getAllCompetitions()
        .then(res => {
          // Handle nested response structure: {success: true, data: [competitions array]}
          const responseData = res.data.data || res.data;
          const competitionsArray = Array.isArray(responseData) ? responseData : (responseData.competitions || []);
          setCompetitions(competitionsArray);
        })
        .catch((error) => {
          logger.error('Failed to load competitions:', error);
          toast.error('Failed to load competitions');
        })
        .finally(() => setLoadingCompetitions(false));
    }
  }, [isSuperAdmin]);

  // Cascade resets — changing a filter invalidates everything below it
  useEffect(() => {
    setSelectedGender(null); setSelectedAgeGroup(null); setSelectedCompetitionType(null); setSelectedApparatus(null);
    setSubmittedTeams([]); setScores([]); setSearchTerm('');
  }, [selectedCompetition]);

  useEffect(() => {
    if (selectedGender) {
      setSelectedAgeGroup(null); setSelectedCompetitionType(null); setSelectedApparatus(null);
    }
  }, [selectedGender]);

  useEffect(() => {
    if (selectedAgeGroup) {
      setSelectedCompetitionType(null); setSelectedApparatus(null);
    }
  }, [selectedAgeGroup]);

  useEffect(() => { setSelectedApparatus(null); }, [selectedCompetitionType]);

  /*
   * Apparatus is the LAST selection, and nothing is fetched before it is made.
   *
   * This used to fire on gender + age group + competition type and then fire
   * again when apparatus changed — two round trips for one category, the first
   * of them showing a mixed-apparatus board that the second replaced. The
   * public page has always waited for the full category; all three pages now
   * behave the same way.
   */
  const categoryComplete = Boolean(
    selectedCompetition && selectedGender && selectedAgeGroup && selectedCompetitionType && selectedApparatus
  );

  useEffect(() => {
    if (!categoryComplete) {
      setSubmittedTeams([]); setScores([]);
      return;
    }
    if (scoreType === 'add') fetchSubmittedTeams();
    else if (scoreType === 'individual') fetchIndividualScores();
    else if (scoreType === 'rankings') fetchTeamRankings();
  }, [categoryComplete, selectedGender, selectedAgeGroup, selectedCompetitionType, selectedApparatus, scoreType, selectedCompetition]);

  const categoryParams = () => ({
    gender: selectedGender.value,
    ageGroup: selectedAgeGroup.value,
    competitionType: selectedCompetitionType.value,
    apparatus: selectedApparatus.value,
    ...(isSuperAdmin && selectedCompetition ? { competition: selectedCompetition.value } : {}),
  });

  const fetchSubmittedTeams = async () => {
    setLoading(true);
    try {
      const response = await api.getSubmittedTeams(categoryParams());
      // Handle response structure: {success: true, data: teams array}
      const teams = response.data.data || response.data;
      setSubmittedTeams(Array.isArray(teams) ? teams : []);
    } catch (error) {
      logger.error('Failed to load submitted teams:', error);
      toast.error('Failed to load submitted teams');
      setSubmittedTeams([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchIndividualScores = async () => {
    setLoading(true);
    try {
      const response = await api.getIndividualScores(categoryParams());
      // Handle response structure: {success: true, data: [...]}
      const responseData = response.data.data || response.data;
      const rawScores = Array.isArray(responseData) ? responseData : [];

      /*
       * Flattened by the shared adapter, and NOT re-ranked here.
       *
       * This used to sort by finalScore and number the rows by array index,
       * which ignored the tie-break rules entirely and ordered level athletes
       * arbitrarily. `rank` now arrives from the server — the only place the
       * panel-size rules live — so this page and the public board agree.
       */
      setScores(rowsFromIndividualScores(rawScores));
      if (!rawScores.length) toast.info('No individual scores found');
    } catch (error) {
      logger.error('Failed to load individual scores:', error);
      toast.error('Failed to load individual scores');
      setScores([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamRankings = async () => {
    setLoading(true);
    try {
      const response = await api.getTeamRankings(categoryParams());
      // Handle response structure: {success: true, data: [...]}
      const responseData = response.data.data || response.data;
      const rawTeams = Array.isArray(responseData) ? responseData : [];

      // Transform the data to match the expected structure for ResponsiveTeamRankings
      const transformedTeams = rawTeams.map((team, index) => {
        const playerScores = team.scores || [];
        const playerCount = playerScores.length;
        const teamTotalScore = team.totalScore || team.finalScore || 0;
        const averageTeamScore = playerCount > 0 ? teamTotalScore / playerCount : 0;

        // The scores that COUNTED toward the team total — best 3 of a 4-player
        // team, best 5 of a 6-player team, per apparatus — as decided on the
        // server (team-championship.util). Keyed per apparatus so an athlete
        // counted on two apparatus appears twice.
        const topPlayerScores = (team.apparatus || [])
          .flatMap((app) => app.counted.map((p) => ({ ...p, playerId: `${p.playerId}-${app.apparatus}` })))
          .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));

        return {
          teamId: team._id,
          teamName: team.name,
          playerCount,
          teamTotalScore,
          averageTeamScore,
          topPlayerScores,
          rank: team.rank || index + 1,
          originalRank: index + 1,
        };
      });

      setScores(transformedTeams);
      if (!transformedTeams.length) toast.info('No team rankings found');
    } catch (error) {
      logger.error('Failed to load team rankings:', error);
      toast.error('Failed to load team rankings');
      setScores([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setSelectedGender(null); setSelectedAgeGroup(null); setSelectedCompetitionType(null); setSelectedApparatus(null);
    setSubmittedTeams([]); setScores([]); setSearchTerm('');
    if (isSuperAdmin) setSelectedCompetition(null);
  };

  const filteredTeams = submittedTeams.filter((team) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (team.name || '').toLowerCase().includes(s) || (team.coach?.name || '').toLowerCase().includes(s);
  });

  const filteredPlayers = filterRows(scores, searchTerm);

  const filteredTeamRankings = scores
    .map((score, i) => ({ ...score, originalRank: i + 1 }))
    .filter((score) => !searchTerm || (score.teamName || '').toLowerCase().includes(searchTerm.toLowerCase()));

  const teamCount = new Set(filteredPlayers.map((p) => p.teamName).filter(Boolean)).size;
  const categoryLabel = categoryComplete
    ? `${selectedGender.label} — ${selectedAgeGroup.label} — ${selectedCompetitionType.label} — ${selectedApparatus.label}`
    : '';

  return (
    <div className="space-y-6">
      <FadeIn>
        <DarkCard className="p-6">
          <p className="type-tag mt-0 mb-2 text-accent-fg">Scoring System</p>
          <Heading level={2} step="display-m" className="mb-6">Scores &amp; Rankings</Heading>

          <ScoreTypeTabs value={scoreType} onChange={setScoreType} />

          <ScoreCategoryFilters
            competitionOptions={competitionOptions}
            selectedCompetition={selectedCompetition}
            onCompetitionChange={setSelectedCompetition}
            loadingCompetitions={loadingCompetitions}
            competitionLocked={!isSuperAdmin}
            selectedGender={selectedGender}
            onGenderChange={setSelectedGender}
            ageGroupOptions={ageGroupOptions}
            selectedAgeGroup={selectedAgeGroup}
            onAgeGroupChange={setSelectedAgeGroup}
            competitionTypeOptions={competitionTypeOptions}
            selectedCompetitionType={selectedCompetitionType}
            onCompetitionTypeChange={setSelectedCompetitionType}
            apparatusOptions={apparatusOptions}
            selectedApparatus={selectedApparatus}
            onApparatusChange={setSelectedApparatus}
            onClearFilters={handleClearFilters}
          />

          <div className="mt-6">
            {!categoryComplete ? (
              <EmptyState icon={Filter} title="Select Filters to View Scores"
                desc="Choose a competition, gender, age group, competition type and apparatus. Results load once the apparatus is picked." />
            ) : loading ? (
              <LoadingState label="Loading data…" />
            ) : (
              <div>
                {scoreType === 'add' && (
                  <div>
                    <Heading level={3} step="display-s" className="mb-4">Add New Score</Heading>
                    {submittedTeams.length > 0 && (
                      <>
                        <InfoBanner>
                          <span className="text-ink/70">Showing teams for: </span>
                          <span className="font-bold text-ink">{categoryLabel}</span>
                          <span className="text-fg-muted ml-2">({submittedTeams.length} team{submittedTeams.length !== 1 ? 's' : ''}{searchTerm && `, ${filteredTeams.length} after search`})</span>
                        </InfoBanner>
                        <div className="mb-4"><DarkSearch value={searchTerm} onChange={setSearchTerm} placeholder="Search teams by name or coach…" /></div>
                      </>
                    )}
                    <div className="space-y-4">
                      {submittedTeams.length > 0 ? (
                        filteredTeams.length === 0 && searchTerm ? (
                          <EmptyState icon={Search} title="No teams found" desc={`No teams match "${searchTerm}"`}
                            action={<TextLink as="button" type="button" onClick={() => setSearchTerm('')}>Clear search</TextLink>} />
                        ) : (
                          <ResponsiveTeamTable
                            teams={filteredTeams}
                            onTeamClick={(teamId) => {
                              const team = submittedTeams.find(t => t._id === teamId);
                              if (team) navigate(`${routePrefix}/scoring`, { state: { selectedTeam: team, selectedGender, selectedAgeGroup, selectedCompetitionType } });
                            }}
                            searchTerm={searchTerm}
                            renderMobileCard={(team) => (
                              <div key={team._id} className="rounded-xl border p-4 bg-surface-sunken border-line">
                                <h4 className="font-bold text-ink">Team: {team.name}</h4>
                                <p className="text-sm text-fg-muted mt-1">Coach: {team.coach?.name || 'Unknown'}</p>
                                <p className="text-xs text-fg-muted mt-1">Submitted: {new Date(team.submittedAt).toLocaleDateString()}</p>
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-line">
                                  <span className="text-sm text-fg-muted">Players: <span className="font-bold text-ink">{team.players?.length || 0}</span></span>
                                  <Button variant="line" size="sm"
                                    onClick={() => navigate(`${routePrefix}/scoring`, { state: { selectedTeam: team, selectedGender, selectedAgeGroup, selectedCompetitionType } })}>
                                    View Details →
                                  </Button>
                                </div>
                              </div>
                            )}
                          />
                        )
                      ) : (
                        <EmptyState icon={Trophy} title="No teams submitted yet" desc="Teams appear here after coaches complete registration and payment." />
                      )}
                    </div>
                  </div>
                )}

                {scoreType === 'individual' && (
                  <div>
                    <Heading level={3} step="display-s" className="mb-4">Individual Rankings</Heading>
                    {scores.length > 0 ? (
                      <>
                        <InfoBanner>
                          <span className="text-ink/70">Individual rankings for: </span>
                          <span className="font-bold text-ink">{categoryLabel}</span>
                        </InfoBanner>
                        <div className="mb-4"><DarkSearch value={searchTerm} onChange={setSearchTerm} placeholder="Search players by name or team…" /></div>

                        <div className="flex items-center gap-2 px-1 mb-4">
                          <Users className="w-3.5 h-3.5 text-fg-muted" aria-hidden="true" />
                          <span className="type-tag text-fg-muted">
                            {filteredPlayers.length} {filteredPlayers.length === 1 ? 'player' : 'players'} ranked
                            {teamCount > 0 && ` across ${teamCount} ${teamCount === 1 ? 'team' : 'teams'}`}
                          </span>
                        </div>

                        {filteredPlayers.length === 0 && searchTerm ? (
                          <EmptyState icon={Search} title="No players found" desc={`No players match "${searchTerm}"`}
                            action={<TextLink as="button" type="button" onClick={() => setSearchTerm('')}>Clear search</TextLink>} />
                        ) : (
                          <PlayerRankingBoard players={filteredPlayers} />
                        )}
                      </>
                    ) : (
                      <EmptyState icon={Trophy} title="No individual scores found" desc="Scores appear here after judges complete scoring." />
                    )}
                  </div>
                )}

                {scoreType === 'rankings' && (
                  <div>
                    <Heading level={3} step="display-s" className="mb-4">Team Rankings</Heading>
                    {scores.length > 0 ? (
                      <>
                        <InfoBanner>
                          <span className="text-ink/70">Team rankings for: </span>
                          <span className="font-bold text-ink">{categoryLabel}</span>
                          <span className="text-fg-muted ml-2">({scores.length} team{scores.length !== 1 ? 's' : ''}{searchTerm && `, ${filteredTeamRankings.length} after search`})</span>
                        </InfoBanner>
                        <div className="mb-4"><DarkSearch value={searchTerm} onChange={setSearchTerm} placeholder="Search teams by name…" /></div>
                        {filteredTeamRankings.length === 0 && searchTerm ? (
                          <EmptyState icon={Search} title="No teams found" desc={`No teams match "${searchTerm}"`}
                            action={<TextLink as="button" type="button" onClick={() => setSearchTerm('')}>Clear search</TextLink>} />
                        ) : (
                          <ResponsiveTeamRankings teams={filteredTeamRankings} searchTerm={searchTerm} />
                        )}
                      </>
                    ) : (
                      <EmptyState icon={Trophy} title="No team rankings found" desc="Rankings appear here after teams complete scoring." />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </DarkCard>
      </FadeIn>
    </div>
  );
};

export default Scores;
