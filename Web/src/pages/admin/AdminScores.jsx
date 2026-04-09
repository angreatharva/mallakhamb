import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Filter, X, Search } from 'lucide-react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '../../services/api';
import { useRouteContext } from '../../contexts/RouteContext';
import { useAgeGroups } from '../../hooks/useAgeGroups';
import Dropdown from '../../components/Dropdown';
import { ResponsiveTeamTable } from '../../components/responsive/ResponsiveTable';
import { ResponsiveIndividualRankings, ResponsiveTeamRankings } from '../../components/responsive/ResponsiveRankings';
import { logger } from '../../utils/logger';
import { ResponsiveScoreFilters } from '../../components/responsive/ResponsiveFilters';
import { ADMIN_COLORS, ADMIN_EASE_OUT } from '../../styles/tokens';

const useReducedMotion = () => {
  const [r, setR] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
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
    <motion.div ref={ref} className={className}
      initial={{ opacity: 0, y: reduced ? 0 : 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: ADMIN_EASE_OUT }}>
      {children}
    </motion.div>
  );
};

const DarkCard = ({ children, className = '', style = {} }) => (
  <div className={`rounded-2xl border ${className}`}
    style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle, ...style }}>
    {children}
  </div>
);

const DarkSearch = ({ value, onChange, placeholder }) => (
  <div className="relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'rgba(255,255,255,0.3)' }} />
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full rounded-xl text-sm text-white placeholder-white/30 outline-none min-h-[44px] transition-all duration-200"
      style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${ADMIN_COLORS.darkBorderMid}`, paddingLeft: '2.5rem', paddingRight: value ? '2.5rem' : '1rem', paddingTop: '0.625rem', paddingBottom: '0.625rem' }}
      onFocus={(e) => { e.target.style.borderColor = `${ADMIN_COLORS.saffron}50`; e.target.style.boxShadow = `0 0 0 3px ${ADMIN_COLORS.saffron}12`; }}
      onBlur={(e) => { e.target.style.borderColor = ADMIN_COLORS.darkBorderMid; e.target.style.boxShadow = 'none'; }}
    />
    {value && (
      <button onClick={() => onChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10 transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center" aria-label="Clear search">
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
    <div className="w-5 h-5 border-2 border-white/10 rounded-full animate-spin" style={{ borderTopColor: ADMIN_COLORS.saffron }} />
    <span className="text-white/40 text-sm">{label}</span>
  </div>
);

const InfoBanner = ({ color, children }) => (
  <div className="mb-4 p-3 rounded-xl border text-sm" style={{ background: `${color}10`, borderColor: `${color}30` }}>
    {children}
  </div>
);

const Scores = () => {
  const navigate = useNavigate();
  const { routePrefix, storagePrefix } = useRouteContext();
  const api = routePrefix === '/superadmin' ? superAdminAPI : adminAPI;
  const isSuperAdmin = routePrefix === '/superadmin';

  const [competitions, setCompetitions] = useState([]);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);
  const [scores, setScores] = useState([]);
  const [submittedTeams, setSubmittedTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ageGroupStarted, setAgeGroupStarted] = useState(false);
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [selectedCompetitionType, setSelectedCompetitionType] = useState(null);
  const [scoreType, setScoreType] = useState('add');
  const [searchTerm, setSearchTerm] = useState('');

  const competitionTypes = [
    { value: 'competition_1', label: 'Competition I - Team Championship' },
    { value: 'competition_2', label: 'Competition II - All Round Individual' },
    { value: 'competition_3', label: 'Competition III - Apparatus Championship' }
  ];

  const availableAgeGroups = useAgeGroups(selectedGender?.value || 'Male');

  useEffect(() => {
    if (isSuperAdmin) {
      setLoadingCompetitions(true);
      superAdminAPI.getAllCompetitions()
        .then(res => setCompetitions(res.data.competitions || []))
        .catch(() => toast.error('Failed to load competitions'))
        .finally(() => setLoadingCompetitions(false));
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    setSelectedGender(null); setSelectedAgeGroup(null); setSelectedCompetitionType(null);
    setSubmittedTeams([]); setScores([]); setSearchTerm('');
  }, [selectedCompetition]);

  useEffect(() => { if (selectedGender) setSelectedAgeGroup(null); }, [selectedGender]);

  useEffect(() => {
    if (isSuperAdmin && !selectedCompetition) return;
    if (selectedGender && selectedAgeGroup && selectedCompetitionType) {
      if (scoreType === 'add') fetchSubmittedTeams();
      else if (scoreType === 'individual') fetchIndividualScores();
      else if (scoreType === 'rankings') fetchTeamRankings();
    } else {
      setSubmittedTeams([]); setScores([]);
    }
  }, [selectedGender, selectedAgeGroup, selectedCompetitionType, scoreType, selectedCompetition]);

  const fetchSubmittedTeams = async () => {
    if (!selectedGender || !selectedAgeGroup || !selectedCompetitionType) return;
    if (isSuperAdmin && !selectedCompetition) return;
    setLoading(true);
    try {
      const params = { gender: selectedGender.value, ageGroup: selectedAgeGroup.value, competitionType: selectedCompetitionType.value, ...(isSuperAdmin && selectedCompetition ? { competition: selectedCompetition.value } : {}) };
      const response = await api.getSubmittedTeams(params);
      setSubmittedTeams(response.data.teams);
      const summaryResponse = await api.getAllJudgesSummary();
      const ageGroupInfo = summaryResponse.data.summary.find(item => item.gender === selectedGender.value && item.ageGroup === selectedAgeGroup.value);
      setAgeGroupStarted(ageGroupInfo?.competitionTypes?.[selectedCompetitionType.value]?.isStarted || false);
    } catch (error) {
      toast.error('Failed to load submitted teams');
    } finally {
      setLoading(false);
    }
  };

  const fetchIndividualScores = async () => {
    if (!selectedGender || !selectedAgeGroup) return;
    if (isSuperAdmin && !selectedCompetition) return;
    setLoading(true);
    try {
      const params = { gender: selectedGender.value, ageGroup: selectedAgeGroup.value, ...(isSuperAdmin && selectedCompetition ? { competition: selectedCompetition.value } : {}) };
      const response = await api.getIndividualScores(params);
      setScores(response.data.individualScores || []);
      if (!response.data.individualScores?.length) toast.info('No individual scores found');
    } catch (error) {
      toast.error('Failed to load individual scores');
      setScores([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamRankings = async () => {
    if (!selectedGender || !selectedAgeGroup) return;
    if (isSuperAdmin && !selectedCompetition) return;
    setLoading(true);
    try {
      const params = { gender: selectedGender.value, ageGroup: selectedAgeGroup.value, ...(isSuperAdmin && selectedCompetition ? { competition: selectedCompetition.value } : {}) };
      const response = await api.getTeamRankings(params);
      setScores(response.data.teamRankings || []);
      if (!response.data.teamRankings?.length) toast.info('No team rankings found');
    } catch (error) {
      toast.error('Failed to load team rankings');
      setScores([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setSelectedGender(null); setSelectedAgeGroup(null); setSelectedCompetitionType(null);
    setSubmittedTeams([]); setScores([]); setSearchTerm('');
    if (isSuperAdmin) setSelectedCompetition(null);
  };

  const getFilteredData = () => {
    if (scoreType === 'add') {
      return submittedTeams.filter(team => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return (team.name || '').toLowerCase().includes(s) || (team.coach?.name || '').toLowerCase().includes(s);
      });
    }
    return scores.map((score, i) => ({ ...score, originalRank: i + 1 })).filter(score => {
      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();
      if (scoreType === 'individual') return (score.playerName || '').toLowerCase().includes(s) || (score.teamName || '').toLowerCase().includes(s);
      if (scoreType === 'rankings') return (score.teamName || '').toLowerCase().includes(s);
      return true;
    });
  };

  const competitionOptions = competitions.map(c => ({ value: c._id, label: `${c.name}${c.year ? ` (${c.year})` : ''}${c.place ? ` — ${c.place}` : ''}` }));
  const filtersReady = !isSuperAdmin || selectedCompetition;

  return (
    <div className="space-y-6">
      <FadeIn>
        <DarkCard className="p-6">
          <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: ADMIN_COLORS.saffron }}>Scoring System</p>
          <h2 className="text-2xl font-black text-white mb-6">Scores & Rankings</h2>

          {isSuperAdmin && (
            <div className="mb-6 p-4 rounded-xl border" style={{ background: `${ADMIN_COLORS.saffron}08`, borderColor: `${ADMIN_COLORS.saffron}25` }}>
              <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>
                Competition <span style={{ color: ADMIN_COLORS.red }}>*</span>
              </label>
              <Dropdown options={competitionOptions} value={selectedCompetition} onChange={setSelectedCompetition}
                placeholder={loadingCompetitions ? 'Loading competitions…' : 'Select a competition first'} disabled={loadingCompetitions} />
              {!selectedCompetition && <p className="text-xs mt-2" style={{ color: `${ADMIN_COLORS.saffron}80` }}>Select a competition to enable filters.</p>}
            </div>
          )}

          <div className={!filtersReady ? 'opacity-40 pointer-events-none' : ''}>
            <ResponsiveScoreFilters
              scoreType={scoreType} onScoreTypeChange={setScoreType}
              selectedGender={selectedGender} onGenderChange={setSelectedGender}
              selectedAgeGroup={selectedAgeGroup} onAgeGroupChange={setSelectedAgeGroup}
              selectedCompetitionType={selectedCompetitionType} onCompetitionTypeChange={setSelectedCompetitionType}
              searchTerm={searchTerm} onSearchChange={setSearchTerm}
              onClearFilters={handleClearFilters} ageGroups={availableAgeGroups} competitionTypes={competitionTypes}
            />
          </div>

          {!filtersReady ? (
            <EmptyState icon={Filter} title="Select a Competition First" desc="Choose a competition above to start filtering scores." />
          ) : !selectedGender || !selectedAgeGroup || !selectedCompetitionType ? (
            <EmptyState icon={Filter} title="Select Filters to View Scores" desc="Select gender, age group, and competition type to load data." />
          ) : loading ? (
            <LoadingState label="Loading data…" />
          ) : (
            <div>
              {scoreType === 'add' && (
                <div>
                  <h3 className="text-lg font-bold text-white mb-4">Add New Score</h3>
                  {submittedTeams.length > 0 && (
                    <>
                      <InfoBanner color={ADMIN_COLORS.green}>
                        <span className="text-white/70">Showing teams for: </span>
                        <span className="font-bold text-white">{selectedGender.label} — {selectedAgeGroup.label} — {selectedCompetitionType.label}</span>
                        <span className="text-white/50 ml-2">({submittedTeams.length} team{submittedTeams.length !== 1 ? 's' : ''}{searchTerm && `, ${getFilteredData().length} after search`})</span>
                      </InfoBanner>
                      <div className="mb-4"><DarkSearch value={searchTerm} onChange={setSearchTerm} placeholder="Search teams by name or coach…" /></div>
                    </>
                  )}
                  <div className="space-y-4">
                    {submittedTeams.length > 0 ? (
                      getFilteredData().length === 0 && searchTerm ? (
                        <EmptyState icon={Search} title="No teams found" desc={`No teams match "${searchTerm}"`}
                          action={<button onClick={() => setSearchTerm('')} className="text-sm font-semibold" style={{ color: ADMIN_COLORS.saffronLight }}>Clear search</button>} />
                      ) : (
                        <ResponsiveTeamTable
                          teams={getFilteredData()}
                          onTeamClick={(teamId) => {
                            const team = submittedTeams.find(t => t._id === teamId);
                            if (team) navigate(`${routePrefix}/scoring`, { state: { selectedTeam: team, selectedGender, selectedAgeGroup, selectedCompetitionType } });
                          }}
                          searchTerm={searchTerm}
                          renderMobileCard={(team) => (
                            <div key={team._id} className="rounded-xl border p-4" style={{ background: ADMIN_COLORS.darkPanel, borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                              <h4 className="font-bold text-white">Team: {team.name}</h4>
                              <p className="text-sm text-white/50 mt-1">Coach: {team.coach?.name || 'Unknown'}</p>
                              <p className="text-xs text-white/30 mt-1">Submitted: {new Date(team.submittedAt).toLocaleDateString()}</p>
                              <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                                <span className="text-sm text-white/50">Players: <span className="font-bold text-white">{team.players?.length || 0}</span></span>
                                <motion.button
                                  onClick={() => navigate(`${routePrefix}/scoring`, { state: { selectedTeam: team, selectedGender, selectedAgeGroup, selectedCompetitionType } })}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white min-h-[36px]"
                                  style={{ background: `linear-gradient(135deg, ${ADMIN_COLORS.purple}, ${ADMIN_COLORS.purpleDark})` }}
                                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                                  View Details →
                                </motion.button>
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
                  <h3 className="text-lg font-bold text-white mb-4">Individual Rankings</h3>
                  {scores.length > 0 ? (
                    <>
                      <InfoBanner color={ADMIN_COLORS.blue}>
                        <span className="text-white/70">Individual rankings for: </span>
                        <span className="font-bold text-white">{selectedGender.label} — {selectedAgeGroup.label}</span>
                        <span className="text-white/50 ml-2">({scores.length} player{scores.length !== 1 ? 's' : ''}{searchTerm && `, ${getFilteredData().length} after search`})</span>
                      </InfoBanner>
                      <div className="mb-4"><DarkSearch value={searchTerm} onChange={setSearchTerm} placeholder="Search players by name or team…" /></div>
                      {getFilteredData().length === 0 && searchTerm ? (
                        <EmptyState icon={Search} title="No players found" desc={`No players match "${searchTerm}"`}
                          action={<button onClick={() => setSearchTerm('')} className="text-sm font-semibold" style={{ color: ADMIN_COLORS.saffronLight }}>Clear search</button>} />
                      ) : (
                        <ResponsiveIndividualRankings players={getFilteredData()} searchTerm={searchTerm} />
                      )}
                    </>
                  ) : (
                    <EmptyState icon={Trophy} title="No individual scores found" desc="Scores appear here after judges complete scoring." />
                  )}
                </div>
              )}

              {scoreType === 'rankings' && (
                <div>
                  <h3 className="text-lg font-bold text-white mb-4">Team Rankings</h3>
                  {scores.length > 0 ? (
                    <>
                      <InfoBanner color={ADMIN_COLORS.purple}>
                        <span className="text-white/70">Team rankings for: </span>
                        <span className="font-bold text-white">{selectedGender.label} — {selectedAgeGroup.label}</span>
                        <span className="text-white/50 ml-2">({scores.length} team{scores.length !== 1 ? 's' : ''}{searchTerm && `, ${getFilteredData().length} after search`})</span>
                      </InfoBanner>
                      <div className="mb-4"><DarkSearch value={searchTerm} onChange={setSearchTerm} placeholder="Search teams by name…" /></div>
                      {getFilteredData().length === 0 && searchTerm ? (
                        <EmptyState icon={Search} title="No teams found" desc={`No teams match "${searchTerm}"`}
                          action={<button onClick={() => setSearchTerm('')} className="text-sm font-semibold" style={{ color: ADMIN_COLORS.saffronLight }}>Clear search</button>} />
                      ) : (
                        <ResponsiveTeamRankings teams={getFilteredData()} searchTerm={searchTerm} />
                      )}
                    </>
                  ) : (
                    <EmptyState icon={Trophy} title="No team rankings found" desc="Rankings appear here after teams complete scoring." />
                  )}
                </div>
              )}
            </div>
          )}
        </DarkCard>
      </FadeIn>
    </div>
  );
};

export default Scores;
