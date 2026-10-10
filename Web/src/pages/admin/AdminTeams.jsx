import { useState, useEffect } from 'react';
import { Trophy, Filter, Users, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '@/services/api';
import { useRouteContext } from '../../contexts/RouteContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { useAgeGroups } from '../../hooks/useAgeGroups';
import Dropdown from '@/components/auth/Dropdown';
import { ResponsiveTeamTable } from '../../components/responsive/ResponsiveTable';
import { logger } from '@/infrastructure/logger';
import { ResponsiveTeamFilters } from '../../components/responsive/ResponsiveFilters';
import { Button, Dialog, Heading, StatusTag, TextLink } from '@/components/ui';
import { DarkCard, FadeIn, EmptyState, LoadingState, DarkSearch } from '@/components/admin/AdminKit';

const TeamModal = ({ team, onClose }) => (
  <Dialog open={Boolean(team)} onClose={onClose} wide title="Team Details"
    actions={<Button variant="line" onClick={onClose}>Close</Button>}>
    {team && (
          <div className="grid gap-6">
            <Heading level={3} step="display-s" asIs>{team.team?.name || team.name}</Heading>
            <div className="rounded-xl p-4 border bg-surface-sunken border-line">
              <p className="type-tag mb-3 text-accent-fg">Team Information</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div><span className="text-fg-muted">Coach: </span><span className="text-ink">{team.coach?.name || `${team.coach?.firstName || ''} ${team.coach?.lastName || ''}`.trim() || 'No coach assigned'}</span></div>
                {team.coach?.email && <div><span className="text-fg-muted">Email: </span><span className="text-ink">{team.coach.email}</span></div>}
                {team.coach?.phone && <div><span className="text-fg-muted">Phone: </span><span className="text-ink">{team.coach.phone}</span></div>}
                <div><span className="text-fg-muted">Players: </span><span className="text-ink font-bold">{team.players?.length || 0}</span></div>
                {team.createdAt && <div><span className="text-fg-muted">Registered: </span><span className="text-ink">{new Date(team.createdAt).toLocaleDateString()}</span></div>}
                {team.description && <div className="md:col-span-2"><span className="text-fg-muted">Description: </span><span className="text-ink">{team.description}</span></div>}
                <div><span className="text-fg-muted">Status: </span><span className="text-ink">{team.isActive ? 'Active' : 'Inactive'}</span></div>
                <div><span className="text-fg-muted">Player Count: </span><span className="text-ink font-bold">{team.playerCount || team.players?.length || 0}</span></div>
              </div>
            </div>
            <div>
              <p className="type-tag mb-3 text-accent-fg">Players ({team.players?.length || 0})</p>
              {team.players?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {team.players.map((player, i) => (
                    <div key={i} className="rounded-xl p-4 border bg-surface-sunken border-line">
                      <p className="font-bold text-ink text-sm">{player.firstName} {player.lastName}</p>
                      <div className="mt-2 space-y-1 text-xs text-fg-muted">
                        <p>Gender: <span className="text-ink/70">{player.gender}</span></p>
                        <p>Age Group: <span className="text-ink/70">{player.ageGroup || 'Not assigned'}</span></p>
                        {player.dateOfBirth && <p>DOB: <span className="text-ink/70">{new Date(player.dateOfBirth).toLocaleDateString()}</span></p>}
                        {player.email && <p>Email: <span className="text-ink/70">{player.email}</span></p>}
                        {player.apparatus && (Object.keys(player.apparatus).length > 0 || typeof player.apparatus === 'string') && (
                          <p>Apparatus: <span className="text-ink/70">
                            {typeof player.apparatus === 'object' ? Object.values(player.apparatus).flat().join(', ') : player.apparatus}
                          </span></p>
                        )}
                      </div>
                      <StatusTag status={player.isActive ? 'success' : 'warning'} className="mt-2">
                        {player.isActive ? 'Active' : 'Inactive'}
                      </StatusTag>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 rounded-xl border border-line">
                  <Users className="w-10 h-10 mx-auto mb-2 text-ink/20" />
                  <p className="text-fg-muted text-sm">No players registered</p>
                </div>
              )}
            </div>
          </div>
    )}
  </Dialog>
);

const Teams = () => {
  const { routePrefix, storagePrefix } = useRouteContext();
  const { currentCompetition } = useCompetition();
  const api = routePrefix === '/superadmin' ? superAdminAPI : adminAPI;
  const isSuperAdmin = routePrefix === '/superadmin';

  const [competitions, setCompetitions] = useState([]);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const availableAgeGroups = useAgeGroups(selectedGender?.value || 'Male');

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
        .catch(() => toast.error('Failed to load competitions'))
        .finally(() => setLoadingCompetitions(false));
    }
  }, [isSuperAdmin]);

  useEffect(() => { setSelectedGender(null); setSelectedAgeGroup(null); setTeams([]); setSearchTerm(''); }, [selectedCompetition]);
  useEffect(() => { if (selectedGender) setSelectedAgeGroup(null); }, [selectedGender]);

  useEffect(() => {
    if (isSuperAdmin && !selectedCompetition) return;
    if (selectedGender && selectedAgeGroup) fetchTeams();
    else setTeams([]);
  }, [selectedGender, selectedAgeGroup, selectedCompetition]);

  const fetchTeams = async () => {
    if (!selectedGender || !selectedAgeGroup) return;
    if (isSuperAdmin && !selectedCompetition) return;
    setLoading(true);
    try {
      const activeCompetitionId = isSuperAdmin ? selectedCompetition?.value : currentCompetition?._id;
      const params = { 
        gender: selectedGender.value, 
        ageGroup: selectedAgeGroup.value, 
        ...(activeCompetitionId ? { competition: activeCompetitionId } : {}) 
      };
      const response = await api.getAllTeams(params);
      // Handle nested response structure
      const responseData = response.data.data || response.data;
      const teamsArray = Array.isArray(responseData) ? responseData : (responseData.teams || []);
      setTeams(teamsArray);
      toast.success(`Loaded ${teamsArray.length} teams`);
    } catch (error) {
      toast.error('Failed to load teams');
      logger.error('Error fetching teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamDetails = async (teamId) => {
    try {
      // Pass the same filters that are currently applied to maintain consistency
      const params = {};
      if (selectedGender) params.gender = selectedGender.value;
      if (selectedAgeGroup) params.ageGroup = selectedAgeGroup.value;
      
      const activeCompetitionId = isSuperAdmin ? selectedCompetition?.value : currentCompetition?._id;
      if (activeCompetitionId) params.competition = activeCompetitionId;
      
      const response = await api.getTeamDetails(teamId, params);
      // Handle nested response structure: response.data.data.team
      const teamData = response.data.data || response.data;
      setSelectedTeam(teamData.team || teamData);
    } catch (error) {
      toast.error('Failed to load team details');
      logger.error('Error fetching team details:', error);
    }
  };

  const handleClearFilters = () => {
    setSelectedGender(null); setSelectedAgeGroup(null); setTeams([]); setSearchTerm('');
    if (isSuperAdmin) setSelectedCompetition(null);
  };

  const filteredTeams = teams.filter(team => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (team.team?.name || team.name || '').toLowerCase().includes(s) || (team.coach?.name || '').toLowerCase().includes(s);
  });

  const competitionOptions = competitions.map(c => ({ value: c._id, label: `${c.name}${c.year ? ` (${c.year})` : ''}${c.place ? ` — ${c.place}` : ''}` }));
  const filtersReady = !isSuperAdmin || selectedCompetition;

  return (
    <div className="space-y-6">
      <TeamModal team={selectedTeam} onClose={() => setSelectedTeam(null)} />
      <FadeIn>
        <DarkCard className="p-6">
          <p className="type-tag mt-0 mb-2 text-accent-fg">Teams Management</p>
          <Heading level={2} step="display-m" className="mb-6">All Teams</Heading>

          {isSuperAdmin && (
            <div className="mb-6 p-4 rounded-xl border bg-surface-sunken border-line">
              <label className="block type-tag mb-2 text-accent-fg">
                Competition <span className="text-danger-fg">*</span>
              </label>
              <Dropdown options={competitionOptions} value={selectedCompetition} onChange={setSelectedCompetition}
                placeholder={loadingCompetitions ? 'Loading competitions…' : 'Select a competition first'} disabled={loadingCompetitions} />
              {!selectedCompetition && <p className="text-xs mt-2 text-accent-fg">Select a competition to enable filters.</p>}
            </div>
          )}

          <div className={!filtersReady ? 'opacity-40 pointer-events-none mb-6' : 'mb-6'}>
            <ResponsiveTeamFilters selectedGender={selectedGender} onGenderChange={setSelectedGender}
              selectedAgeGroup={selectedAgeGroup} onAgeGroupChange={setSelectedAgeGroup}
              searchTerm={searchTerm} onSearchChange={setSearchTerm}
              onClearFilters={handleClearFilters} ageGroups={availableAgeGroups} />
          </div>

          {!filtersReady ? (
            <EmptyState icon={Filter} title="Select a Competition First" desc="Choose a competition above to start filtering teams." />
          ) : !selectedGender || !selectedAgeGroup ? (
            <EmptyState icon={Filter} title="Select Filters to View Teams" desc="Select gender and age group to load teams automatically." />
          ) : loading ? (
            <LoadingState label="Loading teams…" />
          ) : teams.length > 0 ? (
            <div>
              <div className="mb-4 p-3 rounded-xl border text-sm bg-surface-sunken border-line">
                <span className="text-ink/70">Showing </span>
                <span className="font-bold text-ink">{selectedGender.label} — {selectedAgeGroup.label}</span>
                <span className="text-fg-muted ml-2">({teams.length} team{teams.length !== 1 ? 's' : ''}{searchTerm && `, ${filteredTeams.length} after search`})</span>
              </div>
              <div className="mb-4"><DarkSearch value={searchTerm} onChange={setSearchTerm} placeholder="Search teams by name or coach…" /></div>
              {filteredTeams.length === 0 && searchTerm ? (
                <EmptyState icon={Search} title="No teams found" desc={`No teams match "${searchTerm}"`}
                  action={<TextLink as="button" type="button" onClick={() => setSearchTerm('')}>Clear search</TextLink>} />
              ) : (
                <ResponsiveTeamTable teams={filteredTeams} onTeamClick={fetchTeamDetails} searchTerm={searchTerm} />
              )}
            </div>
          ) : (
            <EmptyState icon={Trophy} title="No Teams Found" desc="No teams found for the selected filters." />
          )}
        </DarkCard>
      </FadeIn>
    </div>
  );
};

export default Teams;
