import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Search, X, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { publicAPI } from '@/services/api';
import { logger } from '@/infrastructure/logger';
import { getFilteredAgeGroups, withAllAges, typesForAgeGroup } from '@/hooks/useAgeGroups';
import PlayerRankingBoard, { SkeletonRow } from '@/components/scores/PlayerRankingBoard';
import ScoreCategoryFilters from '@/components/scores/ScoreCategoryFilters';
import { rowsFromPublicScores, filterRows } from '@/components/scores/scoreRows';
import TeamChampionshipBoard from '@/components/scores/TeamChampionshipBoard';
import { offeredApparatus } from '@/utils/scoring/apparatus';
import AppearanceMenu from '@/components/layout/AppearanceMenu';
import { Wordmark } from '@/components/brand/Brand';
import { Button, EmptyState, Heading, IconButton, Input, Panel, Tabs, Tag, TextLink } from '@/components/ui';
import { Grain } from '@/components/ui/Stage';

const COMPETITION_TYPE_LABELS = {
  competition_1: 'Competition I - Team Championship & Qualifier',
  competition_2: 'Competition II - All Round Individual Final',
  competition_3: 'Competition III - Apparatus Championship',
};

const VIEWS = [
  { id: 'players', label: 'Player Scores' },
  { id: 'team', label: 'Team Championship' },
  // Who moved from Competition I into the Competition II / III finals.
  { id: 'finals', label: 'Finals' },
];

/** The finals' qualifier lists for one competition (public). */
const FinalsSection = ({ competition }) => {
  const [finals, setFinals] = useState(null);
  useEffect(() => {
    if (!competition) { setFinals(null); return undefined; }
    let alive = true;
    setFinals(undefined);
    publicAPI.getFinals(competition.value)
      .then((res) => { if (alive) setFinals(res.data?.data?.finals || []); })
      .catch(() => { if (alive) setFinals([]); });
    return () => { alive = false; };
  }, [competition]);

  if (!competition) {
    return <EmptyState tag="Select a Competition" className="ui-fade-in">Pick a competition to see who qualified for its finals.</EmptyState>;
  }
  if (finals === undefined) return <div className="space-y-3">{[...Array(3)].map((_, i) => <SkeletonRow key={i} />)}</div>;
  if (!finals.length) {
    return <EmptyState tag="No Finalists Yet" className="ui-fade-in">Finalists appear here as Competition I results are locked.</EmptyState>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="public-finals">
      {finals.map((f) => (
        <Panel key={f._id} className="grid gap-2">
          <Heading level={3} step="body">{f.label}</Heading>
          <ol className="m-0 pl-5 grid gap-1">
            {f.qualifiers.map((q) => (
              <li key={`${q.playerName}-${q.team}`} className="type-body-s">
                <strong>{q.playerName}</strong> <span className="text-fg-muted">· {q.team}</span>
              </li>
            ))}
          </ol>
        </Panel>
      ))}
    </div>
  );
};
FinalsSection.propTypes = { competition: PropTypes.object };

/** The category a board is showing, as a caption tag above it. */
const Caption = ({ children }) => (
  <Tag tone="accent" className="sb-caption">{children}</Tag>
);

// ─── Team Championship view ──────────────────────────────────────────────────
const TeamChampionshipSection = ({ filtersSet, runsTeamChampionship, loading, standings, caption }) => {
  if (!filtersSet) {
    return (
      <EmptyState tag="Select Filters to View Team Championship" className="ui-fade-in">
        Pick a competition, gender and age group. Per apparatus, a 4-player team counts its
        best 3 scores and a 6-player team its best 5.
      </EmptyState>
    );
  }
  if (!runsTeamChampionship) {
    return (
      <EmptyState tag="No Team Championship" className="ui-fade-in">
        This competition does not run Competition I — Team Championship.
      </EmptyState>
    );
  }
  if (loading) {
    return <div className="space-y-3">{[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}</div>;
  }
  if (!standings.length) {
    return (
      <EmptyState tag="No Team Scores Yet" className="ui-fade-in">
        Team totals appear once Competition I scores are published.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      <Caption>{caption} · {COMPETITION_TYPE_LABELS.competition_1}</Caption>
      <TeamChampionshipBoard teams={standings} />
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const PublicScores = () => {
  const [competitions, setCompetitions] = useState([]);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingCompetitions, setLoadingCompetitions] = useState(true);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [selectedCompetitionType, setSelectedCompetitionType] = useState(null);
  const [selectedApparatus, setSelectedApparatus] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  // 'players' — the individual board; 'team' — the Team Championship standing.
  const [view, setView] = useState('players');
  const [teamStandings, setTeamStandings] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);

  // Boys and girls do not share the top two brackets; the shared helper owns
  // that rule and narrows it further to whatever this competition runs.
  const getAvailableAgeGroups = () => (
    selectedGender ? withAllAges(getFilteredAgeGroups(selectedCompetition, selectedGender.value), view === 'team' ? null : selectedCompetition) : []
  );

  const getAvailableCompetitionTypes = () => {
    if (!selectedCompetition) return [];
    return typesForAgeGroup((selectedCompetition.competitionTypes || []).map((type) => ({
      value: type,
      label: COMPETITION_TYPE_LABELS[type] || type,
    })), selectedAgeGroup, selectedCompetition);
  };

  const getAvailableApparatus = () => {
    if (!selectedCompetition || !selectedCompetitionType || !selectedGender) return [];
    // Only what this gender competes on in this type — the meet configures
    // Male and Female separately.
    return offeredApparatus(selectedCompetition, selectedCompetitionType.value, selectedGender.value)
      .map((app) => ({ value: app, label: app }));
  };

  // Cascade resets — changing a filter invalidates everything below it
  useEffect(() => {
    if (selectedCompetition) {
      setSelectedGender(null);
      setSelectedAgeGroup(null);
      setSelectedCompetitionType(null);
      setSelectedApparatus(null);
    }
  }, [selectedCompetition]);

  useEffect(() => {
    if (selectedGender) {
      setSelectedAgeGroup(null);
      setSelectedCompetitionType(null);
      setSelectedApparatus(null);
    }
  }, [selectedGender]);

  useEffect(() => {
    if (selectedAgeGroup) {
      setSelectedCompetitionType(null);
      setSelectedApparatus(null);
    }
  }, [selectedAgeGroup]);

  useEffect(() => {
    if (selectedCompetitionType) {
      setSelectedApparatus(null);
    }
  }, [selectedCompetitionType]);

  useEffect(() => { fetchCompetitions(); }, []);

  // Apparatus is the last selection, so it is the one that triggers the read.
  useEffect(() => {
    if (selectedCompetition && selectedGender && selectedAgeGroup && selectedCompetitionType && selectedApparatus) {
      fetchScores();
    } else {
      setScores([]);
    }
  }, [selectedCompetition, selectedGender, selectedAgeGroup, selectedCompetitionType, selectedApparatus]);

  const runsTeamChampionship = Boolean(selectedCompetition?.competitionTypes?.includes('competition_1'));
  const teamFiltersSet = Boolean(selectedCompetition && selectedGender && selectedAgeGroup);

  // Team Championship needs only the category: the type is Competition I and
  // every apparatus the gender competes on counts toward the team total.
  useEffect(() => {
    if (view !== 'team' || !teamFiltersSet || !runsTeamChampionship) {
      setTeamStandings([]);
      return undefined;
    }
    let cancelled = false;
    setTeamLoading(true);
    publicAPI.getTeamChampionship({
      competitionId: selectedCompetition.value,
      gender: selectedGender.value,
      ageGroup: selectedAgeGroup.value,
    })
      .then((response) => { if (!cancelled) setTeamStandings(response.data.data || []); })
      .catch((error) => {
        if (cancelled) return;
        toast.error('Failed to load team championship');
        logger.error('Error fetching team championship:', error);
        setTeamStandings([]);
      })
      .finally(() => { if (!cancelled) setTeamLoading(false); });
    return () => { cancelled = true; };
  }, [view, teamFiltersSet, runsTeamChampionship, selectedCompetition, selectedGender, selectedAgeGroup]);

  const fetchCompetitions = async () => {
    setLoadingCompetitions(true);
    try {
      const response = await publicAPI.getCompetitions();
      const comps = response.data.data || response.data.competitions || [];
      setCompetitions(comps.map((c) => ({
        value: c._id,
        label: `${c.name} (${c.year}) — ${c.place}`,
        competitionTypes: c.competitionTypes || [],
        apparatusConfig: c.apparatusConfig || {},
        apparatusByGender: c.apparatusByGender || {},
        // Absent from the public payload today, so the age-group filter falls
        // back to the gender's full list. Carried through so that it narrows
        // on its own if the endpoint ever starts sending it.
        ageGroups: c.ageGroups || [],
        legacyFinals: Boolean(c.legacyFinals),
      })));
      if (!comps.length) {
        logger.warn('No public competitions returned from API');
      }
    } catch (error) {
      toast.error('Failed to load competitions');
      logger.error('Error fetching competitions:', error);
    } finally {
      setLoadingCompetitions(false);
    }
  };

  const fetchScores = async () => {
    if (!selectedCompetition || !selectedGender || !selectedAgeGroup || !selectedCompetitionType || !selectedApparatus) return;
    setLoading(true);
    try {
      const response = await publicAPI.getScores({
        competitionId: selectedCompetition.value,
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value,
        competitionType: selectedCompetitionType.value,
        apparatus: selectedApparatus.value,
      });
      const data = response.data.data || response.data.scores || [];
      setScores(data);
      if (!data.length) {
        logger.warn('No public scores for category', {
          competitionId: selectedCompetition.value,
          gender: selectedGender.value,
          ageGroup: selectedAgeGroup.value,
        });
      }
    } catch (error) {
      toast.error('Failed to load scores');
      logger.error('Error fetching scores:', error);
      setScores([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setSelectedCompetition(null);
    setSelectedGender(null);
    setSelectedAgeGroup(null);
    setSelectedCompetitionType(null);
    setSelectedApparatus(null);
    setScores([]);
    setTeamStandings([]);
    setSearchTerm('');
  };

  const allFiltersSet = selectedCompetition && selectedGender && selectedAgeGroup && selectedCompetitionType && selectedApparatus;
  const filteredPlayers = filterRows(rowsFromPublicScores(scores), searchTerm);
  const teamCount = new Set(filteredPlayers.map((p) => p.teamName).filter(Boolean)).size;

  return (
    <div className="min-h-dvh relative bg-bg text-fg">
      {/* A stage screen: grain, the black stage, the display face (PLAN §5.7). */}
      <Grain />

      {/* Masthead */}
      <header className="shell-header">
        <div className="shell-header__bar max-w-5xl">
          <div className="shell-header__brand">
            <IconButton as={Link} to="/" label="Back to Home" icon={ArrowLeft} variant="ghost" />
            <Wordmark />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {(view === 'team' ? teamFiltersSet : allFiltersSet) && (
              <Button variant="line" size="sm" icon={X} onClick={handleClearFilters}>Clear</Button>
            )}
            <AppearanceMenu />
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-[var(--pad)] py-8 space-y-6" id="main-content">
        {/* Page title */}
        <div className="grid justify-items-start gap-3 py-2">
          <Tag tone="accent">Live Results</Tag>
          <Heading level={1} step="display-xl" sting>Competition Scores</Heading>
          <p className="type-body text-fg-muted m-0 max-w-xl">
            {view === 'team'
              ? 'Teams ranked on their best scores per apparatus'
              : 'Select a category to see players from all teams ranked together'}
          </p>
        </div>

        {/* Player Scores | Team Championship */}
        <Tabs label="Results view" tabs={VIEWS} value={view} onChange={setView} idBase="results" />

        {/* Filters */}
        <Panel>
          <ScoreCategoryFilters
            competitionOptions={competitions}
            selectedCompetition={selectedCompetition}
            onCompetitionChange={setSelectedCompetition}
            loadingCompetitions={loadingCompetitions}
            selectedGender={selectedGender}
            onGenderChange={setSelectedGender}
            ageGroupOptions={getAvailableAgeGroups()}
            selectedAgeGroup={selectedAgeGroup}
            onAgeGroupChange={setSelectedAgeGroup}
            competitionTypeOptions={getAvailableCompetitionTypes()}
            selectedCompetitionType={selectedCompetitionType}
            onCompetitionTypeChange={setSelectedCompetitionType}
            apparatusOptions={getAvailableApparatus()}
            selectedApparatus={selectedApparatus}
            onApparatusChange={setSelectedApparatus}
            onClearFilters={handleClearFilters}
            categoryOnly={view !== 'players'}
          />
        </Panel>

        {/* Content area */}
        <div id={`results-panel-${view}`}>
          {view === 'finals' ? (
            <FinalsSection competition={selectedCompetition} />
          ) : view === 'team' ? (
            <TeamChampionshipSection
              filtersSet={teamFiltersSet}
              runsTeamChampionship={runsTeamChampionship}
              loading={teamLoading}
              standings={teamStandings}
              caption={teamFiltersSet ? `${selectedCompetition.label} · ${selectedGender.label} · ${selectedAgeGroup.label}` : ''}
            />
          ) : !allFiltersSet ? (
            <EmptyState tag="Select Filters to View Scores" className="ui-fade-in">
              Pick a competition, gender, age group, competition type and apparatus —
              players from all teams are ranked together
            </EmptyState>
          ) : loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
            </div>
          ) : scores.length > 0 ? (
            <div className="space-y-4">
              {/* The category, and the search */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <Caption>
                  {selectedCompetition.label} · {selectedGender.label} · {selectedAgeGroup.label} · {selectedCompetitionType.label} · {selectedApparatus.label}
                </Caption>
                <div className="relative w-full sm:w-[240px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-fg-muted z-10" aria-hidden="true" />
                  <Input
                    type="text"
                    placeholder="Search players, team, coach..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-11"
                    aria-label="Search players by name, team, or coach"
                  />
                  {searchTerm && (
                    <IconButton
                      label="Clear search"
                      icon={X}
                      variant="ghost"
                      className="absolute right-0 top-1/2 -translate-y-1/2"
                      onClick={() => setSearchTerm('')}
                    />
                  )}
                </div>
              </div>

              {/* Player + team count */}
              <p className="type-tag text-fg-muted m-0 px-1">
                {filteredPlayers.length} {filteredPlayers.length === 1 ? 'player' : 'players'} ranked
                {teamCount > 0 && ` across ${teamCount} ${teamCount === 1 ? 'team' : 'teams'}`}
              </p>

              {/* Individual ranking board — one global list across all teams */}
              {filteredPlayers.length > 0 ? (
                <PlayerRankingBoard players={filteredPlayers} />
              ) : searchTerm ? (
                <EmptyState
                  tag="No players found"
                  className="ui-fade-in"
                  action={<TextLink as="button" type="button" onClick={() => setSearchTerm('')}>Clear search</TextLink>}
                >
                  No results for &quot;{searchTerm}&quot;
                </EmptyState>
              ) : null}
            </div>
          ) : (
            <EmptyState tag="No Scores Available" className="ui-fade-in">
              Scores will appear here after judges complete their scoring.
            </EmptyState>
          )}
        </div>
      </main>
    </div>
  );
};

export default PublicScores;
