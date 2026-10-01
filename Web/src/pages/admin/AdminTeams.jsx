import { useState, useEffect } from 'react';
import { Trophy, Filter, Users, X, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '@/services/api';
import { useRouteContext } from '../../contexts/RouteContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { useAgeGroups } from '../../hooks/useAgeGroups';
import Dropdown from '@/components/auth/Dropdown';
import { ResponsiveTeamTable } from '../../components/responsive/ResponsiveTable';
import { logger } from '@/infrastructure/logger';
import { ResponsiveTeamFilters } from '../../components/responsive/ResponsiveFilters';
import { ADMIN_COLORS, ADMIN_EASE_OUT, FG, alpha } from '../../styles/tokens';
import { BodyScrollLock } from '@/hooks/useBodyScrollLock';
import { DarkCard, FadeIn, EmptyState, LoadingState, DarkSearch } from '@/components/admin/AdminKit';

const TeamModal = ({ team, onClose }) => (
  <AnimatePresence>
    {team && (
      <motion.div className="modal-overlay z-50"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={(e) => e.target === e.currentTarget && onClose()}>
        <BodyScrollLock />
        <motion.div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-3xl border modal-panel"
          style={{ background: ADMIN_COLORS.darkElevated, borderColor: ADMIN_COLORS.darkBorderSubtle }}
          initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }} transition={{ duration: 0.25, ease: ADMIN_EASE_OUT }}>
          <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: ADMIN_COLORS.darkBorderSubtle }}>
            <div>
              <p className="text-xs font-bold tracking-widest uppercase" style={{ color: FG.brand }}>Team Details</p>
              <h3 className="text-xl font-black text-white mt-0.5">{team.team?.name || team.name}</h3>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center" aria-label="Close">
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>
          <div className="p-6 space-y-6">
            <div className="rounded-xl p-4 border" style={{ background: 'rgb(var(--ink) / 0.03)', borderColor: ADMIN_COLORS.darkBorderSubtle }}>
              <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: FG.brand }}>Team Information</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div><span className="text-fg-muted">Coach: </span><span className="text-white">{team.coach?.name || `${team.coach?.firstName || ''} ${team.coach?.lastName || ''}`.trim() || 'No coach assigned'}</span></div>
                {team.coach?.email && <div><span className="text-fg-muted">Email: </span><span className="text-white">{team.coach.email}</span></div>}
                {team.coach?.phone && <div><span className="text-fg-muted">Phone: </span><span className="text-white">{team.coach.phone}</span></div>}
                <div><span className="text-fg-muted">Players: </span><span className="text-white font-bold">{team.players?.length || 0}</span></div>
                {team.createdAt && <div><span className="text-fg-muted">Registered: </span><span className="text-white">{new Date(team.createdAt).toLocaleDateString()}</span></div>}
                {team.description && <div className="md:col-span-2"><span className="text-fg-muted">Description: </span><span className="text-white">{team.description}</span></div>}
                <div><span className="text-fg-muted">Status: </span><span className="text-white">{team.isActive ? 'Active' : 'Inactive'}</span></div>
                <div><span className="text-fg-muted">Player Count: </span><span className="text-white font-bold">{team.playerCount || team.players?.length || 0}</span></div>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: FG.brand }}>Players ({team.players?.length || 0})</p>
              {team.players?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {team.players.map((player, i) => (
                    <div key={i} className="rounded-xl p-4 border" style={{ background: 'rgb(var(--ink) / 0.03)', borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                      <p className="font-bold text-white text-sm">{player.firstName} {player.lastName}</p>
                      <div className="mt-2 space-y-1 text-xs text-fg-muted">
                        <p>Gender: <span className="text-white/70">{player.gender}</span></p>
                        <p>Age Group: <span className="text-white/70">{player.ageGroup || 'Not assigned'}</span></p>
                        {player.dateOfBirth && <p>DOB: <span className="text-white/70">{new Date(player.dateOfBirth).toLocaleDateString()}</span></p>}
                        {player.email && <p>Email: <span className="text-white/70">{player.email}</span></p>}
                        {player.apparatus && (Object.keys(player.apparatus).length > 0 || typeof player.apparatus === 'string') && (
                          <p>Apparatus: <span className="text-white/70">
                            {typeof player.apparatus === 'object' ? Object.values(player.apparatus).flat().join(', ') : player.apparatus}
                          </span></p>
                        )}
                      </div>
                      <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: `${alpha(ADMIN_COLORS.green, 0x20)}`, color: FG.success }}>
                        {player.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 rounded-xl border" style={{ borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                  <Users className="w-10 h-10 mx-auto mb-2 text-white/20" />
                  <p className="text-fg-muted text-sm">No players registered</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end p-6 border-t" style={{ borderColor: ADMIN_COLORS.darkBorderSubtle }}>
            <motion.button onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-bold min-h-[44px] transition-all text-white/70 hover:text-white"
              style={{ background: ADMIN_COLORS.darkPanel, border: `1px solid ${ADMIN_COLORS.darkBorderSubtle}` }}
              whileTap={{ scale: 0.97 }}>
              Close
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
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
          <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: FG.brand }}>Teams Management</p>
          <h2 className="text-2xl font-black text-white mb-6">All Teams</h2>

          {isSuperAdmin && (
            <div className="mb-6 p-4 rounded-xl border" style={{ background: `${alpha(ADMIN_COLORS.saffron, 0x08)}`, borderColor: `${alpha(ADMIN_COLORS.saffron, 0x25)}` }}>
              <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: FG.brandSoft }}>
                Competition <span style={{ color: FG.danger }}>*</span>
              </label>
              <Dropdown options={competitionOptions} value={selectedCompetition} onChange={setSelectedCompetition}
                placeholder={loadingCompetitions ? 'Loading competitions…' : 'Select a competition first'} disabled={loadingCompetitions} />
              {!selectedCompetition && <p className="text-xs mt-2" style={{ color: FG.brandSoft }}>Select a competition to enable filters.</p>}
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
              <div className="mb-4 p-3 rounded-xl border text-sm" style={{ background: `${alpha(ADMIN_COLORS.green, 0x10)}`, borderColor: `${alpha(ADMIN_COLORS.green, 0x30)}` }}>
                <span className="text-white/70">Showing </span>
                <span className="font-bold text-white">{selectedGender.label} — {selectedAgeGroup.label}</span>
                <span className="text-fg-muted ml-2">({teams.length} team{teams.length !== 1 ? 's' : ''}{searchTerm && `, ${filteredTeams.length} after search`})</span>
              </div>
              <div className="mb-4"><DarkSearch value={searchTerm} onChange={setSearchTerm} placeholder="Search teams by name or coach…" /></div>
              {filteredTeams.length === 0 && searchTerm ? (
                <EmptyState icon={Search} title="No teams found" desc={`No teams match "${searchTerm}"`}
                  action={<button onClick={() => setSearchTerm('')} className="text-sm font-semibold" style={{ color: FG.brandSoft }}>Clear search</button>} />
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
