import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Filter, UserPlus, Save, Edit, X, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { adminAPI, superAdminAPI } from '../../services/api';
import { useRouteContext } from '../../contexts/RouteContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { useAgeGroups } from '../../hooks/useAgeGroups';
import { logger } from '../../utils/logger';
import Dropdown from '../../components/Dropdown';
import { useResponsive } from '../../hooks/useResponsive';
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

const DarkInput = ({ label, required, error, hint, rightElement, ...props }) => (
  <div>
    {label && (
      <label className="block text-xs font-bold tracking-wide uppercase mb-1.5" style={{ color: ADMIN_COLORS.saffronLight }}>
        {label}{required && <span style={{ color: ADMIN_COLORS.red }}> *</span>}
      </label>
    )}
    <div className="relative">
      <input
        className="w-full rounded-xl text-sm text-white placeholder-white/30 outline-none min-h-[44px] transition-all duration-200"
        style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${error ? ADMIN_COLORS.red + '60' : ADMIN_COLORS.darkBorderMid}`, paddingLeft: '0.875rem', paddingRight: rightElement ? '3rem' : '0.875rem', paddingTop: '0.625rem', paddingBottom: '0.625rem' }}
        onFocus={(e) => { e.target.style.borderColor = `${ADMIN_COLORS.saffron}50`; e.target.style.boxShadow = `0 0 0 3px ${ADMIN_COLORS.saffron}12`; }}
        onBlur={(e) => { e.target.style.borderColor = error ? ADMIN_COLORS.red + '60' : ADMIN_COLORS.darkBorderMid; e.target.style.boxShadow = 'none'; }}
        {...props}
      />
      {rightElement && <div className="absolute right-2 top-1/2 -translate-y-1/2">{rightElement}</div>}
    </div>
    {hint && <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{hint}</p>}
    {error && <p className="text-xs mt-1" style={{ color: ADMIN_COLORS.red }}>{error}</p>}
  </div>
);

const DarkBtn = ({ children, onClick, disabled, variant = 'primary', size = 'md', className = '' }) => {
  const bg = {
    primary: `linear-gradient(135deg, ${ADMIN_COLORS.saffron}, ${ADMIN_COLORS.saffronDark})`,
    purple: `linear-gradient(135deg, ${ADMIN_COLORS.purple}, ${ADMIN_COLORS.purpleDark})`,
    success: `linear-gradient(135deg, ${ADMIN_COLORS.green}, #16A34A)`,
    danger: `linear-gradient(135deg, ${ADMIN_COLORS.red}, #DC2626)`,
    ghost: 'transparent',
  }[variant];
  const h = size === 'sm' ? '32px' : '44px';
  return (
    <motion.button onClick={onClick} disabled={disabled}
      className={`rounded-xl font-bold text-sm text-white flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      style={{ background: bg, border: variant === 'ghost' ? `1px solid ${ADMIN_COLORS.darkBorderSubtle}` : 'none', minHeight: h, padding: size === 'sm' ? '0 0.75rem' : '0 1.25rem' }}
      whileHover={!disabled ? { scale: 1.02, filter: 'brightness(1.1)' } : {}}
      whileTap={!disabled ? { scale: 0.97 } : {}}>
      {children}
    </motion.button>
  );
};

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

// ─── Edit Judge Modal ─────────────────────────────────────────────────────────
const EditJudgeModal = ({ judge, formData, setFormData, onSave, onCancel, generateUsername, generatePassword }) => (
  <AnimatePresence>
    {judge && (
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={(e) => e.target === e.currentTarget && onCancel()}>
        <motion.div className="w-full max-w-md rounded-3xl border overflow-hidden"
          style={{ background: ADMIN_COLORS.darkElevated, borderColor: ADMIN_COLORS.darkBorderSubtle }}
          initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }} transition={{ duration: 0.25, ease: ADMIN_EASE_OUT }}>
          <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: ADMIN_COLORS.darkBorderSubtle }}>
            <div>
              <p className="text-xs font-bold tracking-widest uppercase" style={{ color: ADMIN_COLORS.saffron }}>Judge Management</p>
              <h3 className="text-xl font-black text-white mt-0.5">{judge.name ? 'Edit Judge' : 'Add Judge'}</h3>
            </div>
            <button onClick={onCancel} className="p-2 rounded-xl hover:bg-white/10 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center" aria-label="Close">
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="p-3 rounded-xl border text-xs" style={{ background: 'rgba(255,255,255,0.03)', borderColor: ADMIN_COLORS.darkBorderSubtle, color: 'rgba(255,255,255,0.5)' }}>
              <span className="font-bold" style={{ color: ADMIN_COLORS.saffronLight }}>{judge.judgeType}</span>
              {judge.gender && <> · {judge.gender}</>}
              {judge.ageGroup && <> · {judge.ageGroup}</>}
            </div>
            <DarkInput label="Name" required value={formData.name}
              onChange={(e) => {
                const n = e.target.value;
                setFormData(prev => ({
                  ...prev, name: n,
                  username: (!prev.username || prev.username === generateUsername(prev.name, judge.judgeType))
                    ? (n ? generateUsername(n, judge.judgeType) : '') : prev.username
                }));
              }}
              placeholder="Enter judge name" />
            <DarkInput label="Username" required value={formData.username}
              onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
              placeholder="Enter username or click Auto"
              hint={formData.name ? 'Click "Auto" to generate from name.' : 'Enter a name first.'}
              rightElement={
                <DarkBtn size="sm" variant="purple" disabled={!formData.name.trim()}
                  onClick={() => {
                    if (formData.name.trim()) {
                      const u = generateUsername(formData.name, judge.judgeType);
                      setFormData(prev => ({ ...prev, username: u }));
                      toast.success(`Username: ${u}`);
                    }
                  }}>Auto</DarkBtn>
              } />
            <DarkInput label="Password" required value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              placeholder="Enter password"
              rightElement={
                <DarkBtn size="sm" variant="ghost"
                  onClick={() => setFormData(prev => ({ ...prev, password: generatePassword() }))}>Gen</DarkBtn>
              } />
          </div>
          <div className="flex gap-3 p-6 border-t" style={{ borderColor: ADMIN_COLORS.darkBorderSubtle }}>
            <DarkBtn variant="ghost" onClick={onCancel} className="flex-1">Cancel</DarkBtn>
            <DarkBtn variant="success" onClick={onSave} className="flex-1">
              <Save className="w-4 h-4" />
              {judge.name ? 'Update' : 'Add Judge'}
            </DarkBtn>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const Judges = () => {
  const { routePrefix, storagePrefix } = useRouteContext();
  const { currentCompetition } = useCompetition();
  const api = routePrefix === '/superadmin' ? superAdminAPI : adminAPI;
  const isSuperAdmin = routePrefix === '/superadmin';
  const { isMobile } = useResponsive();

  const [competitions, setCompetitions] = useState([]);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);

  const getAvailableCompetitionTypes = () => {
    if (isSuperAdmin && selectedCompetition) {
      // For super admin with selected competition, get types from that competition
      const comp = competitions.find(c => c._id === selectedCompetition.value);
      return comp?.competitionTypes || [];
    }
    if (isSuperAdmin) {
      // For super admin without selected competition, return empty (they must select one)
      return [];
    }
    if (currentCompetition?.competitionTypes) return currentCompetition.competitionTypes;
    return [];
  };
  const availableCompetitionTypes = getAvailableCompetitionTypes();

  const [judges, setJudges] = useState([]);
  const [judgeFormData, setJudgeFormData] = useState([
    { judgeNo: 1, judgeType: 'Senior Judge', name: '', username: '', password: '' },
    { judgeNo: 2, judgeType: 'Judge 1', name: '', username: '', password: '' },
    { judgeNo: 3, judgeType: 'Judge 2', name: '', username: '', password: '' },
    { judgeNo: 4, judgeType: 'Judge 3', name: '', username: '', password: '' },
    { judgeNo: 5, judgeType: 'Judge 4', name: '', username: '', password: '' }
  ]);
  const [editingJudge, setEditingJudge] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: '', username: '', password: '' });
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [selectedCompetitionType, setSelectedCompetitionType] = useState(null);
  const [judgeType, setJudgeType] = useState('add');
  const [judgesExistForSelection, setJudgesExistForSelection] = useState(false);
  const [checkingExistingJudges, setCheckingExistingJudges] = useState(false);
  const [loadingJudges, setLoadingJudges] = useState(false);
  const [ageGroupStarted, setAgeGroupStarted] = useState(false);

  const genders = [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }];
  const judgeTypes = [{ value: 'add', label: 'Add Judge' }, { value: 'list', label: 'Judge List' }];
  const availableAgeGroups = useAgeGroups(selectedGender?.value || 'Male');

  const getCompetitionTypeOptions = () => {
    const order = ['competition_1', 'competition_2', 'competition_3'];
    const types = availableCompetitionTypes || [];
    return order.filter(t => types.includes(t)).map(t => ({
      value: t,
      label: t === 'competition_1' ? 'Competition I - Team Championship' : t === 'competition_2' ? 'Competition II - All Round Individual' : 'Competition III - Apparatus Championship'
    }));
  };
  const competitionTypeOptions = getCompetitionTypeOptions();

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

  useEffect(() => { setSelectedGender(null); setSelectedAgeGroup(null); setJudges([]); setJudgesExistForSelection(false); }, [selectedCompetition]);

  useEffect(() => {
    const types = availableCompetitionTypes || [];
    if (types.length > 0 && !selectedCompetitionType) {
      const def = types.includes('competition_1') ? 'competition_1' : types[0];
      setSelectedCompetitionType({ value: def, label: getCompetitionTypeOptions().find(o => o.value === def)?.label || def });
    }
  }, [availableCompetitionTypes?.length, selectedCompetition]);

  useEffect(() => {
    if (selectedGender) { setSelectedAgeGroup(null); setJudgesExistForSelection(false); setCheckingExistingJudges(false); setLoadingJudges(false); if (judgeType === 'list') setJudges([]); }
  }, [selectedGender]);

  useEffect(() => {
    if (judgeType === 'add') {
      setJudgeFormData([
        { judgeNo: 1, judgeType: 'Senior Judge', name: '', username: '', password: '' },
        { judgeNo: 2, judgeType: 'Judge 1', name: '', username: '', password: '' },
        { judgeNo: 3, judgeType: 'Judge 2', name: '', username: '', password: '' },
        { judgeNo: 4, judgeType: 'Judge 3', name: '', username: '', password: '' },
        { judgeNo: 5, judgeType: 'Judge 4', name: '', username: '', password: '' }
      ]);
    }
    if (judgeType === 'list') { setJudgesExistForSelection(false); setCheckingExistingJudges(false); setLoadingJudges(false); }
  }, [selectedGender, selectedAgeGroup, judgeType]);

  useEffect(() => {
    if (judgeType === 'list' && selectedGender && selectedAgeGroup) fetchJudges();
    else if (judgeType === 'list') setJudges([]);
  }, [judgeType]);

  useEffect(() => {
    if (judgeType === 'list' && selectedGender && selectedAgeGroup && selectedCompetitionType) fetchJudges();
  }, [selectedCompetitionType, judgeType, selectedGender, selectedAgeGroup]);

  const generateUsername = (name, jType) => {
    if (!name) return '';
    const initials = name.trim().split(/\s+/).map(w => w.charAt(0).toLowerCase()).join('');
    const prefix = { 'Senior Judge': 'srj', 'Judge 1': 'j1', 'Judge 2': 'j2', 'Judge 3': 'j3', 'Judge 4': 'j4' }[jType] || 'j';
    return `${prefix}_${initials}`;
  };

  // Ensure the judge list always shows all 5 slots, filling in empty placeholders for missing ones
  const JUDGE_SLOTS = [
    { judgeNo: 1, judgeType: 'Senior Judge' },
    { judgeNo: 2, judgeType: 'Judge 1' },
    { judgeNo: 3, judgeType: 'Judge 2' },
    { judgeNo: 4, judgeType: 'Judge 3' },
    { judgeNo: 5, judgeType: 'Judge 4' },
  ];
  const padToFiveSlots = (apiJudges) => {
    return JUDGE_SLOTS.map(slot => {
      const found = apiJudges.find(j => j.judgeNo === slot.judgeNo);
      return found || { ...slot, name: '', username: '', isEmpty: true };
    });
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const checkForExistingJudges = async (gender, ageGroup) => {
    if (!gender || !ageGroup || !selectedCompetitionType) return false;
    if (isSuperAdmin && !selectedCompetition) return false;
    try {
      const params = { gender: gender.value, ageGroup: ageGroup.value, competitionTypes: selectedCompetitionType.value, ...(isSuperAdmin && selectedCompetition ? { competition: selectedCompetition.value } : {}) };
      const response = await api.getJudges(params);
      return (response.data.data || []).filter(j => j._id && !j.isEmpty && j.name?.trim()).length > 0;
    } catch { return false; }
  };

  const handleAgeGroupChange = async (ageGroupOption) => {
    if (!selectedGender || !ageGroupOption) { setSelectedAgeGroup(ageGroupOption); setJudgesExistForSelection(false); setCheckingExistingJudges(false); return; }
    setCheckingExistingJudges(true);
    try {
      const judgesExist = await checkForExistingJudges(selectedGender, ageGroupOption);
      setJudgesExistForSelection(judgesExist);
      setSelectedAgeGroup(ageGroupOption);
      if (judgeType === 'list' && selectedGender && ageGroupOption) await fetchJudgesWithParams(selectedGender.value, ageGroupOption.value);
    } finally { setCheckingExistingJudges(false); }
  };

  const fetchJudges = useCallback(async () => {
    if (!selectedCompetitionType || (isSuperAdmin && !selectedCompetition)) return;
    setLoadingJudges(true);
    try {
      const params = {};
      if (selectedGender) params.gender = selectedGender.value;
      if (selectedAgeGroup) params.ageGroup = selectedAgeGroup.value;
      if (selectedCompetitionType) params.competitionTypes = selectedCompetitionType.value;
      if (isSuperAdmin && selectedCompetition) params.competitionId = selectedCompetition.value;
      const response = await api.getJudges(params);
      setJudges(padToFiveSlots(response.data.data || []));
    } catch { toast.error('Failed to load judges'); } finally { setLoadingJudges(false); }
  }, [selectedCompetitionType, selectedGender, selectedAgeGroup, selectedCompetition, api]);

  const fetchJudgesWithParams = async (gender, ageGroup) => {
    if (!selectedCompetitionType || (isSuperAdmin && !selectedCompetition)) return;
    setLoadingJudges(true);
    try {
      const params = { gender, ageGroup, competitionTypes: selectedCompetitionType.value, ...(isSuperAdmin && selectedCompetition ? { competition: selectedCompetition.value } : {}) };
      const response = await api.getJudges(params);
      setJudges(padToFiveSlots(response.data.data || []));
      const summaryResponse = await api.getAllJudgesSummary();
      const info = (summaryResponse.data.data?.summary || []).find(item => item.gender === gender && item.ageGroup === ageGroup);
      setAgeGroupStarted(info?.isStarted || false);
    } catch { toast.error('Failed to load judges'); } finally { setLoadingJudges(false); }
  };

  const handleJudgeFormChange = (index, field, value) => {
    const updated = [...judgeFormData];
    updated[index][field] = value;
    setJudgeFormData(updated);
  };

  const handleSaveJudges = async () => {
    if (!selectedGender || !selectedAgeGroup) { toast.error('Please select gender and age group first'); return; }
    if (!selectedCompetitionType) { toast.error('Please select a competition type'); return; }
    const validJudges = judgeFormData.filter(j => j.name.trim() && j.password.trim());
    if (validJudges.length < 3) { toast.error('Please fill in at least 3 judges with name and password'); return; }
    const judgesExist = await checkForExistingJudges(selectedGender, selectedAgeGroup);
    if (judgesExist) { toast.error('Judges already exist. Use "Judge List" to edit.'); return; }
    try {
      const cleanedJudges = judgeFormData.map(j => ({ judgeNo: j.judgeNo, judgeType: j.judgeType, name: j.name.trim(), username: j.username.trim(), password: j.password.trim() }));
      const judgesData = { gender: selectedGender.value, ageGroup: selectedAgeGroup.value, competitionTypes: [selectedCompetitionType.value], judges: cleanedJudges, ...(isSuperAdmin && selectedCompetition ? { competition: selectedCompetition.value } : {}) };
      const response = await api.saveJudges(judgesData);
      toast.success(`Judge panel created! ${response.data.data.created.length} judges added.`);
      setJudgeFormData([
        { judgeNo: 1, judgeType: 'Senior Judge', name: '', username: '', password: '' },
        { judgeNo: 2, judgeType: 'Judge 1', name: '', username: '', password: '' },
        { judgeNo: 3, judgeType: 'Judge 2', name: '', username: '', password: '' },
        { judgeNo: 4, judgeType: 'Judge 3', name: '', username: '', password: '' },
        { judgeNo: 5, judgeType: 'Judge 4', name: '', username: '', password: '' }
      ]);
    } catch (error) {
      logger.error('Save judges error:', error);
      toast.error(error.response?.data?.message || 'Failed to save judges');
    }
  };

  const handleEditJudge = (judge) => {
    if (ageGroupStarted) { toast.error('Cannot edit judges. Age group has been started.'); return; }
    setEditingJudge(judge);
    setEditFormData({ name: judge.name || '', username: judge.username || (judge.name ? generateUsername(judge.name, judge.judgeType) : ''), password: judge.password || '' });
  };

  const handleDeleteJudge = async (judge) => {
    if (!judge._id || !judge.name) { toast.error('Cannot delete an empty judge slot'); return; }
    if (ageGroupStarted) { toast.error('Cannot delete judges. Age group has been started.'); return; }
    const activeCount = judges.filter(j => j.name?.trim()).length;
    if (activeCount <= 3) { toast.error('Cannot delete. Minimum 3 judges required.'); return; }
    if (!window.confirm(`Delete judge "${judge.name}"?`)) return;
    try {
      await api.deleteJudge(judge._id);
      toast.success('Judge deleted');
      fetchJudges();
    } catch (error) { toast.error(error.response?.data?.message || 'Failed to delete judge'); }
  };

  const handleUpdateJudge = async () => {
    if (!editFormData.name.trim() || !editFormData.password.trim()) { toast.error('Please fill in name and password'); return; }
    if (!editFormData.username?.trim()) { toast.error('Please provide a username'); return; }
    try {
      const updatedData = { name: editFormData.name.trim(), username: editFormData.username.trim(), password: editFormData.password.trim() };
      if (editingJudge._id && !editingJudge.isEmpty) {
        await api.updateJudge(editingJudge._id, updatedData);
        toast.success('Judge updated!');
      } else {
        await api.createSingleJudge({ gender: editingJudge.gender, ageGroup: editingJudge.ageGroup, judgeNo: editingJudge.judgeNo, judgeType: editingJudge.judgeType, ...updatedData });
        toast.success('Judge added!');
      }
      fetchJudges();
      setEditingJudge(null);
      setEditFormData({ name: '', username: '', password: '' });
    } catch (error) {
      logger.error('Update judge error:', error);
      toast.error(error.response?.data?.message || 'Failed to save judge');
    }
  };

  const competitionOptions = competitions.map(c => ({ value: c._id, label: `${c.name}${c.year ? ` (${c.year})` : ''}${c.place ? ` — ${c.place}` : ''}` }));
  const filtersReady = !isSuperAdmin || selectedCompetition;

  const judgeTypeBadge = (jt) => jt === 'Senior Judge'
    ? { bg: `${ADMIN_COLORS.purple}20`, color: ADMIN_COLORS.purpleLight }
    : { bg: `${ADMIN_COLORS.blue}20`, color: '#93C5FD' };

  return (
    <div className="space-y-6">
      <EditJudgeModal judge={editingJudge} formData={editFormData} setFormData={setEditFormData}
        onSave={handleUpdateJudge} onCancel={() => { setEditingJudge(null); setEditFormData({ name: '', username: '', password: '' }); }}
        generateUsername={generateUsername} generatePassword={generatePassword} />

      <FadeIn>
        <DarkCard className="p-6">
          <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: ADMIN_COLORS.saffron }}>Judge Management</p>
          <h2 className="text-2xl font-black text-white mb-6">Manage Judges</h2>

          {isSuperAdmin && (
            <div className="mb-6 p-4 rounded-xl border" style={{ background: `${ADMIN_COLORS.saffron}08`, borderColor: `${ADMIN_COLORS.saffron}25` }}>
              <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>
                Competition <span style={{ color: ADMIN_COLORS.red }}>*</span>
              </label>
              <Dropdown options={competitionOptions} value={selectedCompetition} onChange={setSelectedCompetition}
                placeholder={loadingCompetitions ? 'Loading…' : 'Select a competition first'} disabled={loadingCompetitions} />
              {!selectedCompetition && <p className="text-xs mt-2" style={{ color: `${ADMIN_COLORS.saffron}80` }}>Select a competition to enable filters.</p>}
            </div>
          )}

          {!filtersReady ? (
            <EmptyState icon={Filter} title="Select a Competition First" desc="Choose a competition above to start managing judges." />
          ) : (
            <div>
              {/* Filters row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>Judge Action</label>
                  <Dropdown options={judgeTypes} value={judgeTypes.find(j => j.value === judgeType)}
                    onChange={(opt) => { setJudgeType(opt.value); if (opt.value === 'add' && selectedGender && selectedAgeGroup) handleAgeGroupChange(selectedAgeGroup); }}
                    placeholder="Select action" />
                </div>
                <div>
                  <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>Gender <span style={{ color: ADMIN_COLORS.red }}>*</span></label>
                  <Dropdown options={genders} value={selectedGender} onChange={setSelectedGender} placeholder="Select gender" />
                </div>
                <div>
                  <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>Age Group</label>
                  <Dropdown options={availableAgeGroups} value={selectedAgeGroup} onChange={handleAgeGroupChange}
                    placeholder={selectedGender ? 'Select age group' : 'Select gender first'} disabled={!selectedGender} />
                  {checkingExistingJudges && <p className="text-xs mt-1" style={{ color: ADMIN_COLORS.gold }}>Checking existing judges…</p>}
                </div>
              </div>

              {/* Competition Type */}
              <div className="mb-6">
                <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>
                  Competition Type <span style={{ color: ADMIN_COLORS.red }}>*</span>
                </label>
                {!availableCompetitionTypes || availableCompetitionTypes.length === 0 ? (
                  <div className="p-4 rounded-xl border" style={{ background: `${ADMIN_COLORS.gold}10`, borderColor: `${ADMIN_COLORS.gold}30` }}>
                    <p className="text-sm" style={{ color: ADMIN_COLORS.gold }}>No competition types available. Contact super admin.</p>
                  </div>
                ) : (
                  <Dropdown options={competitionTypeOptions} value={selectedCompetitionType} onChange={setSelectedCompetitionType} placeholder="Select competition type" />
                )}
              </div>

              {/* Add Judge Form */}
              {judgeType === 'add' && (
                <div>
                  <h3 className="text-lg font-bold text-white mb-4">Add Judges</h3>
                  {!selectedGender || !selectedAgeGroup ? (
                    <EmptyState icon={UserPlus} title="Select gender and age group first" />
                  ) : judgesExistForSelection ? (
                    <div className="text-center py-8">
                      <div className="p-6 rounded-2xl border" style={{ background: `${ADMIN_COLORS.gold}10`, borderColor: `${ADMIN_COLORS.gold}30` }}>
                        <Users className="w-10 h-10 mx-auto mb-3" style={{ color: ADMIN_COLORS.gold }} />
                        <h3 className="text-lg font-bold text-white mb-2">Judges Already Exist</h3>
                        <p className="text-white/50 text-sm mb-4">A judge panel already exists for <strong className="text-white">{selectedGender.label} — {selectedAgeGroup.label}</strong>. Use "Judge List" to view or edit.</p>
                        <DarkBtn variant="primary" onClick={() => setJudgeType('list')}>Switch to Judge List</DarkBtn>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-4 p-4 rounded-xl border text-sm" style={{ background: `${ADMIN_COLORS.blue}10`, borderColor: `${ADMIN_COLORS.blue}30` }}>
                        <p className="text-white/70">Adding judges for: <span className="font-bold text-white">{selectedGender.label} — {selectedAgeGroup.label}</span></p>
                        <p className="text-white/50 text-xs mt-1">Minimum 3 judges required · Maximum 5 allowed · Empty slots can be filled later</p>
                      </div>
                      <div className="space-y-4">
                        {judgeFormData.map((judge, index) => {
                          const badge = judgeTypeBadge(judge.judgeType);
                          return (
                            <div key={index} className="rounded-xl border p-4" style={{ background: 'rgba(255,255,255,0.02)', borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                              <div className="flex items-center gap-2 mb-4">
                                <span className="text-sm font-bold text-white">Judge {judge.judgeNo}</span>
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: badge.bg, color: badge.color }}>{judge.judgeType}</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <DarkInput placeholder="Enter judge name" value={judge.name}
                                  onChange={(e) => { const n = e.target.value; handleJudgeFormChange(index, 'name', n); if (n) handleJudgeFormChange(index, 'username', generateUsername(n, judge.judgeType)); }} />
                                <DarkInput placeholder="Auto-generated username" value={judge.username}
                                  onChange={(e) => handleJudgeFormChange(index, 'username', e.target.value)} />
                                <div className="flex gap-2">
                                  <DarkInput placeholder="Password" value={judge.password}
                                    onChange={(e) => handleJudgeFormChange(index, 'password', e.target.value)}
                                    className="flex-1" />
                                  <DarkBtn size="sm" variant="ghost" onClick={() => handleJudgeFormChange(index, 'password', generatePassword())}>Gen</DarkBtn>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-6 flex justify-end">
                        <DarkBtn variant="success" onClick={handleSaveJudges}>
                          <Save className="w-4 h-4" />
                          Save Judges
                        </DarkBtn>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Judge List */}
              {judgeType === 'list' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">Judge List</h3>
                    {(selectedGender || selectedAgeGroup) && (
                      <DarkBtn size="sm" variant="ghost" onClick={() => { setSelectedGender(null); setSelectedAgeGroup(null); setJudges([]); }}>
                        Clear Filters
                      </DarkBtn>
                    )}
                  </div>
                  {loadingJudges ? (
                    <LoadingState label="Loading judges…" />
                  ) : judges.length > 0 ? (
                    <div>
                      <div className="mb-4 p-3 rounded-xl border text-sm" style={{ background: `${ADMIN_COLORS.green}10`, borderColor: `${ADMIN_COLORS.green}30` }}>
                        <span className="text-white/70">Judge panel for: </span>
                        <span className="font-bold text-white">{selectedGender?.label} — {selectedAgeGroup?.label}</span>
                        {selectedCompetitionType && <span className="text-white/50 ml-2">· {selectedCompetitionType.label}</span>}
                      </div>
                      <div className="space-y-3">
                        {judges.map((judge, index) => {
                          const badge = judgeTypeBadge(judge.judgeType);
                          const activeCount = judges.filter(j => j.name?.trim()).length;
                          const canDelete = activeCount > 3;
                          return (
                            <div key={index} className="rounded-xl border p-4 flex items-center justify-between gap-4"
                              style={{ background: judge.isEmpty ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)', borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: badge.bg }}>
                                  <span className="text-xs font-black" style={{ color: badge.color }}>{judge.judgeNo}</span>
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-bold text-white">{judge.name || <span className="text-white/30 italic">Empty Slot</span>}</span>
                                    <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: badge.bg, color: badge.color }}>{judge.judgeType}</span>
                                    {judge.name
                                      ? <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: `${ADMIN_COLORS.green}20`, color: ADMIN_COLORS.green }}>Active</span>
                                      : <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: `${ADMIN_COLORS.gold}20`, color: ADMIN_COLORS.gold }}>Available</span>}
                                  </div>
                                  {judge.username && <p className="text-xs text-white/40 mt-0.5">@{judge.username}</p>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <DarkBtn size="sm" variant={judge.name ? 'purple' : 'success'} disabled={ageGroupStarted} onClick={() => handleEditJudge(judge)}>
                                  <Edit className="w-3.5 h-3.5" />
                                  {judge.name ? 'Edit' : 'Add'}
                                </DarkBtn>
                                {judge.name && !ageGroupStarted && (
                                  <DarkBtn size="sm" variant="danger" disabled={!canDelete} onClick={() => handleDeleteJudge(judge)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </DarkBtn>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <EmptyState icon={Users}
                      title={!selectedGender || !selectedAgeGroup || !selectedCompetitionType ? 'Select all filters to view judges' : 'No judges found'}
                      desc={!selectedGender || !selectedAgeGroup || !selectedCompetitionType
                        ? 'Select gender, age group, and competition type.'
                        : `No judge panel for ${selectedGender?.label} — ${selectedAgeGroup?.label}. Switch to "Add Judge" to create one.`}
                    />
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

export default Judges;
