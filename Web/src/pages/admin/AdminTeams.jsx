import { useState, useEffect, useRef } from 'react';
import { Trophy, Filter, Users, X, Search } from 'lucide-react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '../../services/api';
import { useRouteContext } from '../../contexts/RouteContext';
import { useAgeGroups } from '../../hooks/useAgeGroups';
import Dropdown from '../../components/Dropdown';
import { ResponsiveTeamTable } from '../../components/responsive/ResponsiveTable';
import { logger } from '../../utils/logger';
import { ResponsiveTeamFilters } from '../../components/responsive/ResponsiveFilters';
import { ADMIN_COLORS, ADMIN_EASE_OUT } from '../../styles/tokens';

const useReducedMotion = () => {
  const [r, setR] = useState(
    () =>
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const h = (e) => setR(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return r;
};

const FadeIn = ({ children, delay = 0, className = '' }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: ADMIN_EASE_OUT }}
    >
      {children}
    </motion.div>
  );
};

const DarkCard = ({ children, className = '', style = {} }) => (
  <div
    className={`rounded-2xl border ${className}`}
    style={{
      background: ADMIN_COLORS.darkCard,
      borderColor: ADMIN_COLORS.darkBorderSubtle,
      ...style,
    }}
  >
    {children}
  </div>
);

const DarkSearch = ({ value, onChange, placeholder }) => (
  <div className="relative">
    <Search
      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
      style={{ color: 'rgba(255,255,255,0.3)' }}
    />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl text-sm text-white placeholder-white/30 outline-none min-h-[44px] transition-all duration-200"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${ADMIN_COLORS.darkBorderMid}`,
        paddingLeft: '2.5rem',
        paddingRight: value ? '2.5rem' : '1rem',
        paddingTop: '0.625rem',
        paddingBottom: '0.625rem',
      }}
      onFocus={(e) => {
        e.target.style.borderColor = `${ADMIN_COLORS.saffron}50`;
        e.target.style.boxShadow = `0 0 0 3px ${ADMIN_COLORS.saffron}12`;
      }}
      onBlur={(e) => {
        e.target.style.borderColor = ADMIN_COLORS.darkBorderMid;
        e.target.style.boxShadow = 'none';
      }}
    />
    {value && (
      <button
        onClick={() => onChange('')}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10 transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center"
        aria-label="Clear search"
      >
        <X className="w-3.5 h-3.5 text-white/40" />
      </button>
    )}
  </div>
);

const EmptyState = ({ icon: Icon, title, desc, action }) => (
  <div className="text-center py-12">
    <Icon className="w-12 h-12 mx-auto mb-3 text-white/15" />
    <p className="text-white/60 font-semibold">{title}</p>
    {desc && <p className="text-white/30 text-sm mt-1">{desc}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

const LoadingState = ({ label }) => (
  <div className="flex items-center justify-center py-12 gap-3">
    <div
      className="w-5 h-5 border-2 border-white/10 rounded-full animate-spin"
      style={{ borderTopColor: ADMIN_COLORS.saffron }}
    />
    <span className="text-white/40 text-sm">{label}</span>
  </div>
);

const TeamModal = ({ team, onClose }) => (
  <AnimatePresence>
    {team && (
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-3xl border"
          style={{
            background: ADMIN_COLORS.darkElevated,
            borderColor: ADMIN_COLORS.darkBorderSubtle,
          }}
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ duration: 0.25, ease: ADMIN_EASE_OUT }}
        >
          <div
            className="flex items-center justify-between p-6 border-b"
            style={{ borderColor: ADMIN_COLORS.darkBorderSubtle }}
          >
            <div>
              <p
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: ADMIN_COLORS.saffron }}
              >
                Team Details
              </p>
              <h3 className="text-xl font-black text-white mt-0.5">
                {team.team?.name || team.name}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>
          <div className="p-6 space-y-6">
            <div
              className="rounded-xl p-4 border"
              style={{
                background: 'rgba(255,255,255,0.03)',
                borderColor: ADMIN_COLORS.darkBorderSubtle,
              }}
            >
              <p
                className="text-xs font-bold tracking-widest uppercase mb-3"
                style={{ color: ADMIN_COLORS.saffron }}
              >
                Team Information
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-white/40">Coach: </span>
                  <span className="text-white">{team.coach?.name || 'No coach assigned'}</span>
                </div>
                {team.coach?.email && (
                  <div>
                    <span className="text-white/40">Email: </span>
                    <span className="text-white">{team.coach.email}</span>
                  </div>
                )}
                {team.coach?.phone && (
                  <div>
                    <span className="text-white/40">Phone: </span>
                    <span className="text-white">{team.coach.phone}</span>
                  </div>
                )}
                <div>
                  <span className="text-white/40">Players: </span>
                  <span className="text-white font-bold">{team.players?.length || 0}</span>
                </div>
                {team.createdAt && (
                  <div>
                    <span className="text-white/40">Registered: </span>
                    <span className="text-white">
                      {new Date(team.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div>
              <p
                className="text-xs font-bold tracking-widest uppercase mb-3"
                style={{ color: ADMIN_COLORS.saffron }}
              >
                Players ({team.players?.length || 0})
              </p>
              {team.players?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {team.players.map((entry, i) => (
                    <div
                      key={i}
                      className="rounded-xl p-4 border"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        borderColor: ADMIN_COLORS.darkBorderSubtle,
                      }}
                    >
                      <p className="font-bold text-white text-sm">
                        {entry.player.firstName} {entry.player.lastName}
                      </p>
                      <div className="mt-2 space-y-1 text-xs text-white/50">
                        <p>
                          Gender: <span className="text-white/70">{entry.player.gender}</span>
                        </p>
                        <p>
                          Age Group:{' '}
                          <span className="text-white/70">{entry.ageGroup || 'Not assigned'}</span>
                        </p>
                        {entry.player.dateOfBirth && (
                          <p>
                            DOB:{' '}
                            <span className="text-white/70">
                              {new Date(entry.player.dateOfBirth).toLocaleDateString()}
                            </span>
                          </p>
                        )}
                      </div>
                      <span
                        className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{ background: `${ADMIN_COLORS.green}20`, color: ADMIN_COLORS.green }}
                      >
                        Active
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="text-center py-8 rounded-xl border"
                  style={{ borderColor: ADMIN_COLORS.darkBorderSubtle }}
                >
                  <Users className="w-10 h-10 mx-auto mb-2 text-white/20" />
                  <p className="text-white/40 text-sm">No players registered</p>
                </div>
              )}
            </div>
          </div>
          <div
            className="flex justify-end p-6 border-t"
            style={{ borderColor: ADMIN_COLORS.darkBorderSubtle }}
          >
            <motion.button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-bold min-h-[44px] transition-all"
              style={{
                background: ADMIN_COLORS.darkPanel,
                color: 'rgba(255,255,255,0.7)',
                border: `1px solid ${ADMIN_COLORS.darkBorderSubtle}`,
              }}
              whileHover={{ color: '#fff' }}
              whileTap={{ scale: 0.97 }}
            >
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
      superAdminAPI
        .getAllCompetitions()
        .then((res) => setCompetitions(res.data.competitions || []))
        .catch(() => toast.error('Failed to load competitions'))
        .finally(() => setLoadingCompetitions(false));
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    setSelectedGender(null);
    setSelectedAgeGroup(null);
    setTeams([]);
    setSearchTerm('');
  }, [selectedCompetition]);
  useEffect(() => {
    if (selectedGender) setSelectedAgeGroup(null);
  }, [selectedGender]);

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
      const params = {
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value,
        ...(isSuperAdmin && selectedCompetition ? { competition: selectedCompetition.value } : {}),
      };
      const response = await api.getAllTeams(params);
      setTeams(response.data.teams);
      toast.success(`Loaded ${response.data.teams.length} teams`);
    } catch (error) {
      toast.error('Failed to load teams');
      logger.error('Error fetching teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamDetails = async (teamId) => {
    try {
      const response = await api.getTeamDetails(teamId);
      setSelectedTeam(response.data.team);
    } catch (error) {
      toast.error('Failed to load team details');
    }
  };

  const handleClearFilters = () => {
    setSelectedGender(null);
    setSelectedAgeGroup(null);
    setTeams([]);
    setSearchTerm('');
    if (isSuperAdmin) setSelectedCompetition(null);
  };

  const filteredTeams = teams.filter((team) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      (team.team?.name || team.name || '').toLowerCase().includes(s) ||
      (team.coach?.name || '').toLowerCase().includes(s)
    );
  });

  const competitionOptions = competitions.map((c) => ({
    value: c._id,
    label: `${c.name}${c.year ? ` (${c.year})` : ''}${c.place ? ` — ${c.place}` : ''}`,
  }));
  const filtersReady = !isSuperAdmin || selectedCompetition;

  return (
    <div className="space-y-6">
      <TeamModal team={selectedTeam} onClose={() => setSelectedTeam(null)} />
      <FadeIn>
        <DarkCard className="p-6">
          <p
            className="text-xs font-bold tracking-widest uppercase mb-1"
            style={{ color: ADMIN_COLORS.saffron }}
          >
            Teams Management
          </p>
          <h2 className="text-2xl font-black text-white mb-6">All Teams</h2>

          {isSuperAdmin && (
            <div
              className="mb-6 p-4 rounded-xl border"
              style={{
                background: `${ADMIN_COLORS.saffron}08`,
                borderColor: `${ADMIN_COLORS.saffron}25`,
              }}
            >
              <label
                className="block text-xs font-bold tracking-widest uppercase mb-2"
                style={{ color: ADMIN_COLORS.saffronLight }}
              >
                Competition <span style={{ color: ADMIN_COLORS.red }}>*</span>
              </label>
              <Dropdown
                options={competitionOptions}
                value={selectedCompetition}
                onChange={setSelectedCompetition}
                placeholder={
                  loadingCompetitions ? 'Loading competitions…' : 'Select a competition first'
                }
                disabled={loadingCompetitions}
              />
              {!selectedCompetition && (
                <p className="text-xs mt-2" style={{ color: `${ADMIN_COLORS.saffron}80` }}>
                  Select a competition to enable filters.
                </p>
              )}
            </div>
          )}

          <div className={!filtersReady ? 'opacity-40 pointer-events-none mb-6' : 'mb-6'}>
            <ResponsiveTeamFilters
              selectedGender={selectedGender}
              onGenderChange={setSelectedGender}
              selectedAgeGroup={selectedAgeGroup}
              onAgeGroupChange={setSelectedAgeGroup}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onClearFilters={handleClearFilters}
              ageGroups={availableAgeGroups}
            />
          </div>

          {!filtersReady ? (
            <EmptyState
              icon={Filter}
              title="Select a Competition First"
              desc="Choose a competition above to start filtering teams."
            />
          ) : !selectedGender || !selectedAgeGroup ? (
            <EmptyState
              icon={Filter}
              title="Select Filters to View Teams"
              desc="Select gender and age group to load teams automatically."
            />
          ) : loading ? (
            <LoadingState label="Loading teams…" />
          ) : teams.length > 0 ? (
            <div>
              <div
                className="mb-4 p-3 rounded-xl border text-sm"
                style={{
                  background: `${ADMIN_COLORS.green}10`,
                  borderColor: `${ADMIN_COLORS.green}30`,
                }}
              >
                <span className="text-white/70">Showing </span>
                <span className="font-bold text-white">
                  {selectedGender.label} — {selectedAgeGroup.label}
                </span>
                <span className="text-white/50 ml-2">
                  ({teams.length} team{teams.length !== 1 ? 's' : ''}
                  {searchTerm && `, ${filteredTeams.length} after search`})
                </span>
              </div>
              <div className="mb-4">
                <DarkSearch
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Search teams by name or coach…"
                />
              </div>
              {filteredTeams.length === 0 && searchTerm ? (
                <EmptyState
                  icon={Search}
                  title="No teams found"
                  desc={`No teams match "${searchTerm}"`}
                  action={
                    <button
                      onClick={() => setSearchTerm('')}
                      className="text-sm font-semibold"
                      style={{ color: ADMIN_COLORS.saffronLight }}
                    >
                      Clear search
                    </button>
                  }
                />
              ) : (
                <ResponsiveTeamTable
                  teams={filteredTeams}
                  onTeamClick={fetchTeamDetails}
                  searchTerm={searchTerm}
                />
              )}
            </div>
          ) : (
            <EmptyState
              icon={Trophy}
              title="No Teams Found"
              desc="No teams found for the selected filters."
            />
          )}
        </DarkCard>
      </FadeIn>
    </div>
  );
};

export default Teams;
