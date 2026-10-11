import { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy, UserPlus, Search, Trash2, Check, CheckCircle, Save, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useLocation } from 'react-router-dom';
import { coachAPI } from '@/services/api';
import { useAgeGroups, useAgeGroupValues } from '../../hooks/useAgeGroups';
import Dropdown from '@/components/auth/Dropdown';
import { useCompetition } from '../../contexts/CompetitionContext';
import { useAuth } from '../../contexts/AuthContext';
import CompetitionDisplay from '@/components/competition/CompetitionDisplay';
import CompetitionLockBanner from '@/components/competition/CompetitionLockBanner';
import CompetitionSelector from '@/components/competition/CompetitionSelector';
import { apparatusFor, offeredApparatus } from '@/utils/scoring/apparatus';
import { countedScoresFor } from '@/utils/scoring/teamSize';
import { secureStorage } from '@/utils/auth/secureStorage';
import { logger } from '@/infrastructure/logger';
import PerformancePanel from '@/components/performance/PerformancePanel';
import {
  Button, Dialog, EmptyState, Heading, IconButton, Input, Notice, Panel, SpecList, Stat, StatusTag, Tag,
} from '@/components/ui';
import { AppHeader } from '@/components/shell';

const CoachDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentCompetition, assignedCompetitions, switchCompetition, isLoading: competitionLoading, clearCompetitionContext } = useCompetition();
  const { logout } = useAuth();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedPlayerData, setSelectedPlayerData] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [selectedGender, setSelectedGender] = useState(null);
  /*
   * The apparatus an athlete is entered for — a LIST, because one athlete can
   * compete on several and is judged separately on each. It was a single value
   * until multi-apparatus entry, and everything downstream (the score sheet the
   * judge is shown, the panel roster, the standings) keys off it.
   */
  const [selectedApparatus, setSelectedApparatus] = useState([]);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showTeamSummary, setShowTeamSummary] = useState(false);
  const [showSubmitWarning, setShowSubmitWarning] = useState(false);
  const [user, setUser] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const urlCompetitionHandledRef = useRef(false);

  const clearCompetitionIdFromUrl = useCallback(() => {
    const searchParams = new URLSearchParams(location.search);
    if (!searchParams.has('competitionId')) return;
    searchParams.delete('competitionId');
    const newSearch = searchParams.toString();
    navigate(`${location.pathname}${newSearch ? `?${newSearch}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  // Load user data
  useEffect(() => {
    const userData = secureStorage.getItem('coach_user');
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        logger.error('Failed to parse user data:', e);
      }
    }
  }, []);

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

  // Redirect to competition selection if no competition is set
  useEffect(() => {
    // Wait for competition context to finish loading
    if (competitionLoading) return;
    
    // Check if we have a competitionId in the URL (coming from selection page)
    const urlParams = new URLSearchParams(location.search);
    const competitionIdFromUrl = urlParams.get('competitionId');
    
    // If we have a competitionId in URL, give more time for the context to load
    // The CompetitionProvider should pick up the competition from localStorage
    if (competitionIdFromUrl) {
      // Check if the competition is already set
      if (currentCompetition && currentCompetition._id === competitionIdFromUrl) {
        // Competition is set, remove URL parameter
        clearCompetitionIdFromUrl();
        return;
      }
      
      // Still waiting for competition to be set
      logger.info('Competition ID in URL, waiting for context to load', { competitionIdFromUrl });
      return;
    }
    
    // If no current competition and no URL parameter, redirect to selection
    if (!currentCompetition) {
      logger.info('No competition context, redirecting to competition selection');
      navigate('/coach/select-competition', { replace: true });
    }
  }, [currentCompetition, competitionLoading, navigate, location.search]);

  const handleLogout = async () => {
    clearCompetitionContext?.();
    await logout(navigate);
  };

  const genders = [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }];
  const ageGroupLimits = {
    'Under10': { minAge: 0, maxAge: 9 }, 'Under12': { minAge: 0, maxAge: 11 },
    'Under14': { minAge: 0, maxAge: 13 }, 'Under16': { minAge: 0, maxAge: 15 },
    'Under18': { minAge: 0, maxAge: 17 }, 'Above16': { minAge: 16, maxAge: 100 },
    'Above18': { minAge: 18, maxAge: 100 },
  };

  const competitionAgeGroups = useAgeGroups(selectedGender?.value || 'Male');
  const maleAgeGroupValues = useAgeGroupValues('Male');
  const femaleAgeGroupValues = useAgeGroupValues('Female');

  useEffect(() => { 
    if (currentCompetition) {
      fetchTeamDashboard(); 
    }
  }, [currentCompetition?._id]);
  useEffect(() => { if (selectedGender && selectedPlayerData) setSelectedAgeGroup(null); }, [selectedGender, selectedPlayerData]);

  /*
   * What this meet runs for the athlete's gender, across every competition
   * type — the superadmin configures Male and Female separately. A meet saved
   * before that split falls back to its per-type list, less Hanging Mallakhamb
   * for women (COP §11 / 1.8.2). The athlete is picked before the apparatus,
   * so the gender is always known here. The server narrows each competition
   * type to what that type offers.
   */
  const apparatusOptions = (selectedGender ? offeredApparatus(currentCompetition, null, selectedGender.value) : [])
    .map(app => ({ value: app, label: app }));

  /**
   * How a stored apparatus reads on screen.
   *
   * The field is Mixed and all three shapes reach here, so this goes through
   * the shared reader rather than testing for them again. It used to test for
   * a string and an array and return '' for anything else — which blanked
   * every athlete's apparatus on this dashboard the moment the server started
   * writing the canonical per-competition-type object.
   *
   * No competition type is passed on purpose: this is "what is this athlete
   * entered for", across every category. De-duplicated, because an athlete
   * entered for the same apparatus in two categories appears twice in the
   * flattened object and reads as "Pole · Pole".
   */
  const apparatusLabel = (apparatus) =>
    [...new Set(apparatusFor({ apparatus }))].join(' · ');

  const toggleApparatus = (value) => {
    setSelectedApparatus(current => (
      current.includes(value) ? current.filter(a => a !== value) : [...current, value]
    ));
  };

  const calculateAge = (dob) => {
    const today = new Date(), birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const getAvailableAgeGroups = (gender, playerAge) => {
    // Add age limits to each age group
    const ageGroups = competitionAgeGroups.map(ag => ({ ...ag, ...ageGroupLimits[ag.value] }));
    
    // Filter age groups where the player is eligible
    // A player can play in ANY category where they meet the age requirement
    const eligibleGroups = ageGroups.filter(ag => {
      if (ag.value.startsWith('Under')) {
        // For "Under" categories, player age must be <= maxAge
        return playerAge <= ag.maxAge;
      } else if (ag.value.startsWith('Above')) {
        // For "Above" categories, player can play regardless of age
        // (they can play up in higher age categories)
        return true;
      }
      return false;
    });
    
    // Sort the eligible groups: Under categories first (by maxAge), then Above categories (by minAge)
    return eligibleGroups.sort((a, b) => {
      if (a.value.startsWith('Under') && b.value.startsWith('Under')) {
        return a.maxAge - b.maxAge;
      }
      if (a.value.startsWith('Above') && b.value.startsWith('Above')) {
        return a.minAge - b.minAge;
      }
      // Under categories come before Above categories
      return a.value.startsWith('Under') ? -1 : 1;
    });
  };

  const fetchTeamDashboard = async () => {
    try {
      const response = await coachAPI.getDashboard();
      console.log('Dashboard full response:', response);
      console.log('response.data:', response.data);
      console.log('response.data.data:', response.data?.data);
      console.log('response.data.data.team:', response.data?.data?.team);
      console.log('response.data.team:', response.data?.team);
      
      // Try multiple possible structures
      let teamData = null;
      
      if (response.data?.data?.team !== undefined) {
        teamData = response.data.data.team;
        console.log('Using response.data.data.team');
      } else if (response.data?.team !== undefined) {
        teamData = response.data.team;
        console.log('Using response.data.team');
      }
      
      console.log('Final team data:', teamData);
      setTeam(teamData);
    } catch (error) { 
      console.error('Failed to load team dashboard:', error);
      toast.error('Failed to load team dashboard'); 
    }
    finally { setLoading(false); }
  };

  const handleSearchPlayers = async (query) => {
    if (query.length < 2) { setPlayers([]); return; }
    setSearchLoading(true);
    try {
      const response = await coachAPI.searchPlayers(query);
      // API returns: { success: true, data: [...players] }
      const playersData = response.data?.data || [];
      setPlayers(playersData);
    } catch { toast.error('Failed to search players'); }
    finally { setSearchLoading(false); }
  };

  const handlePlayerSelect = (player) => {
    if (!player.dateOfBirth) { toast.error('Player date of birth is missing.'); return; }
    const age = calculateAge(player.dateOfBirth);
    setSelectedPlayer({ value: player._id, label: `${player.firstName} ${player.lastName}` });
    setSelectedPlayerData({ ...player, age });
    setSelectedGender(genders.find(g => g.value === player.gender));
    setSelectedAgeGroup(null);
  };

  const handleAddPlayer = async () => {
    if (!selectedPlayer || !selectedAgeGroup || !selectedGender || !selectedPlayerData || selectedApparatus.length === 0) {
      return toast.error('Please select player, age group, and at least one apparatus');
    }
    const { age } = selectedPlayerData;
    // The server enforces the cap; checking here saves the coach a round trip.
    if (team?.maxTeamSize) {
      const inCategory = (team.players || []).filter((p) =>
        p.gender === selectedGender.value && p.ageGroup === selectedAgeGroup.value
        && String(p.player?._id || p.player) !== String(selectedPlayer.value)
      ).length;
      if (inCategory >= team.maxTeamSize) {
        return toast.error(`This competition allows at most ${team.maxTeamSize} players per age group — ${selectedAgeGroup.label} is full`);
      }
    }
    if (selectedAgeGroup.value.startsWith('Under') && age > selectedAgeGroup.maxAge) {
      return toast.error(`Player is ${age} years old and cannot play in ${selectedAgeGroup.label} (max: ${selectedAgeGroup.maxAge})`);
    }
    try {
      await coachAPI.addPlayerToAgeGroup({ 
        playerId: selectedPlayer.value, 
        ageGroup: selectedAgeGroup.value, 
        gender: selectedGender.value,
        apparatus: selectedApparatus
      });
      toast.success('Player added to age group successfully!');
      handleCloseModal();
      fetchTeamDashboard();
    } catch (error) { toast.error(error.response?.data?.message || 'Failed to add player'); }
  };

  const handleCloseModal = () => {
    setShowAddPlayer(false); setSelectedPlayer(null); setSelectedPlayerData(null);
    setSelectedAgeGroup(null); setSelectedGender(null); setSelectedApparatus([]); setSearchQuery(''); setPlayers([]);
  };

  const handleRemovePlayer = async (playerId) => {
    if (!window.confirm('Remove this player from the age group?')) return;
    try {
      await coachAPI.removePlayerFromAgeGroup(playerId);
      toast.success('Player removed successfully!');
      fetchTeamDashboard();
    } catch { toast.error('Failed to remove player'); }
  };

  const handleSaveDraft = async () => {
    if (!team) return;
    setSavingDraft(true);
    try {
      await fetchTeamDashboard();
      toast.success('Team draft saved to database! Roster will persist across devices and sessions.');
    } catch (error) {
      toast.error('Failed to save team draft to database.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleDragStart = (e, playerItem, gender, ageGroup) => {
    if (team?.isSubmitted) return;
    const dragPayload = {
      playerId: playerItem.player._id,
      firstName: playerItem.player.firstName,
      lastName: playerItem.player.lastName,
      dateOfBirth: playerItem.player.dateOfBirth,
      gender: playerItem.gender || gender,
      currentAgeGroup: ageGroup,
      apparatus: playerItem.apparatus,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragPayload));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropPlayer = async (e, targetGender, targetAgeGroup) => {
    if (team?.isSubmitted) return;
    e.preventDefault();
    try {
      const rawData = e.dataTransfer.getData('application/json');
      if (!rawData) return;
      const data = JSON.parse(rawData);

      if (data.gender !== targetGender) {
        toast.error(`Cannot move ${data.firstName} (${data.gender}) to ${targetGender} category.`);
        return;
      }

      if (data.currentAgeGroup === targetAgeGroup) return;

      if (!data.dateOfBirth) {
        toast.error(`${data.firstName}'s date of birth is missing.`);
        return;
      }

      const playerAge = calculateAge(data.dateOfBirth);
      const limits = ageGroupLimits[targetAgeGroup];

      if (targetAgeGroup.startsWith('Under') && limits && playerAge > limits.maxAge) {
        toast.error(
          `${data.firstName} is ${playerAge} yrs old and cannot play in ${getAgeGroupDisplay(targetAgeGroup)} (max age: ${limits.maxAge})`
        );
        return;
      }

      if (targetAgeGroup.startsWith('Above') && limits && playerAge < limits.minAge) {
        toast.error(
          `${data.firstName} is ${playerAge} yrs old and cannot play in ${getAgeGroupDisplay(targetAgeGroup)} (min age: ${limits.minAge})`
        );
        return;
      }

      toast.loading(`Moving ${data.firstName} to ${getAgeGroupDisplay(targetAgeGroup)}...`, { id: 'move-player' });

      await coachAPI.addPlayerToAgeGroup({
        playerId: data.playerId,
        ageGroup: targetAgeGroup,
        gender: targetGender,
        apparatus: data.apparatus,
      });

      toast.success(`${data.firstName} moved to ${getAgeGroupDisplay(targetAgeGroup)}!`, { id: 'move-player' });
      fetchTeamDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to move player', { id: 'move-player' });
    }
  };

  const getAgeGroupDisplay = (ag) => ({
    'Under10': 'Under 10', 'Under12': 'Under 12', 'Under14': 'Under 14',
    'Under16': 'Under 16', 'Under18': 'Under 18', 'Above18': 'Above 18', 'Above16': 'Above 16',
  }[ag] || ag);

  const getPlayersByAgeGroup = () => {
    if (!team?.players) return {};
    return team.players.reduce((acc, p) => {
      const key = `${p.gender}_${p.ageGroup}`;
      acc[key] = [...(acc[key] || []), p];
      return acc;
    }, {});
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="type-body-s text-fg-muted flex items-center gap-3 m-0">
          <span className="ui-spinner" aria-hidden="true" />
          Loading team dashboard...
        </p>
      </div>
    );
  }

  // The coach's own masthead, over the shared one (App's Navbar): the same
  // picker and Logout, so either reaches them.
  const masthead = (
    <AppHeader
      fixed
      role="coach"
      segment={user ? (user.firstName || user.name) : null}
      extra={<CompetitionSelector userType="coach" />}
      onLogout={handleLogout}
    />
  );

  if (!team) {
    return (
      <div className="min-h-screen bg-bg text-fg">
        {masthead}
        <div className="max-w-4xl mx-auto px-[var(--pad)] py-10 pt-24 grid gap-8">
          <CompetitionDisplay />
          <CompetitionLockBanner />
          <EmptyState
            tag="No Team Registered"
            action={(
              <Button icon={Trophy} onClick={() => window.location.href = '/coach/select-competition'}>
                Select Team for Competition
              </Button>
            )}
          >
            You don&apos;t have a team registered for this competition yet.
          </EmptyState>
        </div>
      </div>
    );
  }

  const playersByAgeGroup = getPlayersByAgeGroup();

  const AgeGroupCard = ({ ageGroup, gender, tone }) => {
    const key = `${gender}_${ageGroup}`;
    const groupPlayers = playersByAgeGroup[key] || [];
    const [isDragOver, setIsDragOver] = useState(false);

    return (
      <div
        className="squad-group"
        data-tone={tone}
        data-dragover={isDragOver || undefined}
        onDragOver={(e) => {
          if (team?.isSubmitted) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          if (team?.isSubmitted) return;
          setIsDragOver(false);
          handleDropPlayer(e, gender, ageGroup);
        }}
      >
        <div className="flex items-center justify-between mb-3 gap-2">
          <span className="text-fg font-semibold type-body-s">
            {getAgeGroupDisplay(ageGroup)} {gender === 'Male' ? 'Boys' : 'Girls'}
          </span>
          <Tag className="tabular-nums">
            {team?.maxTeamSize ? `${groupPlayers.length} / ${team.maxTeamSize}` : groupPlayers.length}
          </Tag>
        </div>
        <div className="space-y-1.5">
          {groupPlayers.map((player, idx) => (
            <div
              key={idx}
              draggable={!team?.isSubmitted}
              onDragStart={(e) => handleDragStart(e, player, gender, ageGroup)}
              className={`squad-player ${!team?.isSubmitted ? 'squad-player--draggable' : ''}`}
            >
              <div className="flex items-center min-w-0 flex-1">
                {!team?.isSubmitted && (
                  <GripVertical className="w-3.5 h-3.5 mr-1.5 text-fg-muted flex-shrink-0" aria-hidden="true" />
                )}
                <span className="text-fg type-body-s truncate">
                  {player.player.firstName} {player.player.lastName}
                  {apparatusLabel(player.apparatus) ? <span className="ml-2 type-caption text-fg-muted">({apparatusLabel(player.apparatus)})</span> : null}
                </span>
              </div>
              <IconButton
                label={`Remove ${player.player.firstName} ${player.player.lastName}`}
                icon={Trash2}
                variant="ghost"
                size="sm"
                className="squad-player__remove"
                onClick={() => handleRemovePlayer(player.player._id)}
                disabled={team?.isSubmitted}
                title={team?.isSubmitted ? 'Cannot remove after submission' : 'Remove player'}
              />
            </div>
          ))}
          {groupPlayers.length === 0 && (
            <p className="text-fg-muted type-caption italic px-1 m-0">
              {team?.isSubmitted ? 'No players assigned' : 'No players assigned · Drag player here'}
            </p>
          )}
        </div>
      </div>
    );
  };

  const canAdd = selectedPlayer && selectedAgeGroup && selectedGender && selectedApparatus.length > 0;

  return (
    <div className="min-h-screen bg-bg text-fg">
      {masthead}

      <div className="max-w-6xl mx-auto px-[var(--pad)] pb-12 pt-24 grid gap-6">
        <CompetitionDisplay />
        <CompetitionLockBanner />

        {/* Team header */}
        <Panel className="grid gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="grid gap-2 min-w-0">
              <Tag tone="ident" className="justify-self-start">Team Dashboard</Tag>
              <Heading level={1} step="display-l" asIs className="ui-wipe-in">{team.name}</Heading>
              {team.maxTeamSize && (
                <p className="type-body-s text-fg-muted m-0">
                  Max {team.maxTeamSize} players per age group (best {countedScoresFor(team.maxTeamSize)} count)
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="line" icon={Save} onClick={handleSaveDraft} disabled={savingDraft || team?.isSubmitted}>
                {savingDraft ? 'Saving...' : 'Save Team'}
              </Button>
              <Button variant="line" icon={UserPlus} onClick={() => setShowAddPlayer(true)} disabled={team?.isSubmitted}>
                Add Player
              </Button>
              <Button
                icon={team?.isSubmitted ? CheckCircle : Trophy}
                aria-disabled={team?.isSubmitted ? 'true' : undefined}
                className={team?.isSubmitted ? 'opacity-60 cursor-not-allowed' : ''}
                onClick={() => {
                  if (team?.isSubmitted) {
                    toast.error('Team already submitted. Contact admin to make changes.');
                    return;
                  }
                  if (!team?.players?.length) {
                    toast.error('Please add at least one player before submitting.');
                    return;
                  }
                  setShowTeamSummary(true);
                }}
              >
                {team?.isSubmitted ? 'Team Submitted' : 'Pay Fees'}
              </Button>
            </div>
          </div>
          {team.description && <p className="type-body-s text-fg-muted m-0">{team.description}</p>}
          {team?.isSubmitted && (
            <Notice tone="info">Team has been submitted. Contact Admin to make changes.</Notice>
          )}
        </Panel>

        {/* Key numbers */}
        <div className="grid grid-cols-2 gap-4">
          <Panel><Stat label="Total Players" value={team.players?.length || 0} /></Panel>
          <Panel><Stat label="Age Groups" value={Object.keys(playersByAgeGroup).length} /></Panel>
        </div>

        {/* Age group grids */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel>
            <Heading level={2} step="display-s" className="mb-4">Boys Age Groups</Heading>
            <div className="space-y-3">
              {maleAgeGroupValues.map(ag => (
                <AgeGroupCard key={ag} ageGroup={ag} gender="Male" tone="boys" />
              ))}
            </div>
          </Panel>
          <Panel>
            <Heading level={2} step="display-s" className="mb-4">Girls Age Groups</Heading>
            <div className="space-y-3">
              {femaleAgeGroupValues.map(ag => (
                <AgeGroupCard key={ag} ageGroup={ag} gender="Female" tone="girls" />
              ))}
            </div>
          </Panel>
        </div>

        {/* Team Performance Section */}
        {team?._id && currentCompetition && (
          <PerformancePanel
            competitionId={currentCompetition._id}
            competitionTypes={currentCompetition.competitionTypes || []}
            apparatusConfig={currentCompetition.apparatusConfig || {}}
            teamId={team._id}
            title="Team Performance"
            emptyLabel="No finalized scores for this competition yet."
          />
        )}
      </div>

      {/* Team Summary */}
      <Dialog
        open={showTeamSummary}
        onClose={() => setShowTeamSummary(false)}
        wide
        title="Team Summary"
        actions={(
          <>
            <Button variant="line" onClick={() => setShowTeamSummary(false)}>Cancel</Button>
            {team?.isSubmitted ? (
              <StatusTag status="info">Team Already Submitted</StatusTag>
            ) : (
              <Button onClick={() => { setShowTeamSummary(false); setShowSubmitWarning(true); }}>
                Proceed to Payment
              </Button>
            )}
          </>
        )}
      >
        <div className="grid gap-6">
          <SpecList items={[
            { label: 'Team', value: <span className="type-body font-semibold">{team.name}</span> },
            { label: 'Total Players', value: team.players?.length || 0 },
          ]} />
          {team?.isSubmitted && <Notice tone="info">Team Submitted</Notice>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[{ label: 'Boys', values: maleAgeGroupValues, gender: 'Male', tone: 'boys' },
              { label: 'Girls', values: femaleAgeGroupValues, gender: 'Female', tone: 'girls' }].map(({ label, values, gender, tone }) => (
              <div key={gender}>
                <p className="type-tag text-fg mt-0 mb-3">{label} Age Groups</p>
                <div className="space-y-2">
                  {values.map(ag => {
                    const gPlayers = playersByAgeGroup[`${gender}_${ag}`] || [];
                    return (
                      <div key={ag} className="squad-group" data-tone={tone}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-fg type-body-s font-semibold">{getAgeGroupDisplay(ag)}</span>
                          <span className="text-fg-muted type-caption">{gPlayers.length} players</span>
                        </div>
                        {gPlayers.length > 0
                          ? gPlayers.map((p, i) => (
                              <p key={i} className="text-fg-muted type-caption m-0">
                                {p.player.firstName} {p.player.lastName}
                                {apparatusLabel(p.apparatus) ? <span className="ml-1">({apparatusLabel(p.apparatus)})</span> : null}
                              </p>
                            ))
                          : <p className="text-fg-muted type-caption italic m-0">No players</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Dialog>

      {/* Submit warning */}
      <Dialog
        open={showSubmitWarning}
        onClose={() => setShowSubmitWarning(false)}
        title="Submit Team for Competition?"
        actions={(
          <>
            <Button variant="line" onClick={() => setShowSubmitWarning(false)}>Cancel</Button>
            <Button onClick={() => { setShowSubmitWarning(false); navigate('/coach/payment'); }}>
              I Understand, Proceed to Payment
            </Button>
          </>
        )}
      >
        <div className="grid gap-3">
          <Notice tone="warning" title="Important">
            Once you complete the payment and submit your team, it will be <strong>locked</strong>.
          </Notice>
          <p className="type-body-s text-fg m-0">
            You will <strong>not be able to add or remove players</strong> after submission. To make any changes, you&apos;ll need to contact the admin.
          </p>
          <p className="type-caption text-fg-muted m-0">Please review your team carefully before proceeding</p>
        </div>
      </Dialog>

      {/* Add Player */}
      <Dialog
        open={showAddPlayer}
        onClose={handleCloseModal}
        title="Add Player to Age Group"
      >
        <div className="grid gap-5">
          {/* Search */}
          <div>
            <label htmlFor="player-search" className="ui-field__label type-tag block mb-2">Search Players</label>
            <div className="relative">
              <Input id="player-search" type="text" value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); handleSearchPlayers(e.target.value); }}
                className="pr-10"
                placeholder="Search by name" />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted pointer-events-none" aria-hidden="true" />
            </div>
            {searchLoading && <p className="text-fg-muted type-caption mt-1 mb-0">Searching...</p>}
            {players.length > 0 && (
              <div className="ui-popover__list mt-2 squad-results">
                {players.map((player, i) => (
                  <button key={i} type="button" onClick={() => handlePlayerSelect(player)} className="ui-popover__option">
                    <span className="grid gap-0.5 min-w-0">
                      <span className="text-fg type-body-s font-medium">{player.firstName} {player.lastName}</span>
                      <span className="text-fg-muted type-caption">{player.email} · {player.gender} · Age: {player.dateOfBirth ? calculateAge(player.dateOfBirth) : 'Unknown'}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedPlayer && selectedPlayerData && (
            <div className="grid gap-4">
              <Notice tone="info" title={selectedPlayer.label}>
                Gender: {selectedPlayerData.gender} · Age: {selectedPlayerData.age} yrs · DOB: {new Date(selectedPlayerData.dateOfBirth).toLocaleDateString()}
              </Notice>
              <div className="grid gap-2">
                <p className="ui-field__label type-tag m-0">Gender (Auto-selected)</p>
                <p className="m-0 text-fg type-body-s">{selectedGender?.label || 'Loading...'}</p>
                <p className="text-fg-muted type-caption m-0">Automatically set from player&apos;s registration</p>
              </div>
              <div className="grid gap-2">
                <p className="ui-field__label type-tag m-0">
                  Age Group <span className="ui-field__required" aria-hidden="true">*</span>
                </p>
                <Dropdown
                  options={selectedGender && selectedPlayerData ? getAvailableAgeGroups(selectedGender.value, selectedPlayerData.age) : []}
                  value={selectedAgeGroup}
                  onChange={setSelectedAgeGroup}
                  placeholder="Select age group"
                />
                <p className="text-fg-muted type-caption m-0">
                  Player age: {selectedPlayerData.age} yrs. Showing eligible categories.
                </p>
              </div>
              <div className="grid gap-2">
                <p className="ui-field__label type-tag m-0">
                  Apparatus <span className="ui-field__required" aria-hidden="true">*</span>
                </p>
                {/*
                  * Checkboxes rather than the shared Dropdown: an athlete
                  * can be entered for more than one apparatus and is
                  * judged separately on each, so this is a set and not a
                  * choice. The real <input> carries the state — its label
                  * gives it an accessible name, and it stays reachable by
                  * keyboard and screen reader while the chip does the
                  * looking.
                  */}
                <div role="group" aria-label="Apparatus" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {apparatusOptions.map(option => {
                    const checked = selectedApparatus.includes(option.value);
                    return (
                      <label key={option.value} className="ui-check" data-checked={checked || undefined}>
                        <input type="checkbox" className="sr-only"
                          checked={checked}
                          onChange={() => toggleApparatus(option.value)} />
                        <span className="ui-check__box" aria-hidden="true">
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                        <span className="type-body-s">{option.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-fg-muted type-caption m-0">
                  Pick every apparatus this athlete competes on — each one is judged and ranked separately.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="line" className="flex-1" onClick={handleCloseModal}>Cancel</Button>
                <Button className="flex-1" onClick={handleAddPlayer} disabled={!canAdd}>Add Player</Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
};

export default CoachDashboard;
