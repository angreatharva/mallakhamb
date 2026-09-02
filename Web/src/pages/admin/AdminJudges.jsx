import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Filter, UserPlus, Save, Edit, X, Trash2, Search, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { adminAPI, superAdminAPI } from '@/services/api';
import { useRouteContext } from '../../contexts/RouteContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { useAgeGroups } from '../../hooks/useAgeGroups';
import { logger } from '@/infrastructure/logger';
import Dropdown from '@/components/auth/Dropdown';
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

const EMPTY_JUDGE_FORM = [
  { judgeNo: 1, judgeType: 'Senior Judge', account: null },
  { judgeNo: 2, judgeType: 'Judge 1', account: null },
  { judgeNo: 3, judgeType: 'Judge 2', account: null },
  { judgeNo: 4, judgeType: 'Judge 3', account: null },
  { judgeNo: 5, judgeType: 'Judge 4', account: null },
  { judgeNo: 6, judgeType: 'Scorer', account: null },
];

const JUDGE_SLOTS = EMPTY_JUDGE_FORM.map(({ judgeNo, judgeType }) => ({ judgeNo, judgeType }));

const SUPPORT_JUDGE_TYPES = ['Scorer'];
const REQUIRED_JUDGE_TYPES = ['Senior Judge', 'Judge 1', 'Judge 2', 'Scorer'];

const REGISTER_PATH = '/judge/register';

/** Where a judge who has not registered yet is told to go. */
const registerUrl = () =>
  (typeof window !== 'undefined' ? `${window.location.origin}${REGISTER_PATH}` : REGISTER_PATH);

// ─── Judge picker ─────────────────────────────────────────────────────────────

/**
 * Search the registered judges and pick one for a slot.
 *
 * Admins no longer create judge logins — judges register themselves and this is
 * the only way a seat is filled. That means "no results" is a real, expected
 * state with a real answer (send them the registration link), so it is handled
 * here rather than left as a dead end.
 *
 * `taken` maps an account id to the seat that person already holds on this
 * panel. Those results are shown but not selectable: one person cannot sit
 * twice on a panel — their single slip would be counted twice in the average —
 * and the server refuses it. Refusing it here as well means the admin finds out
 * while they are choosing, rather than after filling in five slots and pressing
 * Save.
 */
const JudgeSearch = ({ api, value, onSelect, onClear, autoFocus = false, taken = {} }) => {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const query = term.trim();
    if (query.length < 2) {
      setResults([]);
      setSearching(false);
      return undefined;
    }

    // Debounced: this fires on every keystroke and hits the database.
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await api.searchJudgeAccounts(query);
        setResults(response.data.data || []);
        setTouched(true);
      } catch (error) {
        logger.error('Judge search failed:', error);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [term, api]);

  if (value) {
    return (
      <div className="rounded-xl border p-3 flex items-center justify-between gap-3"
        style={{ background: `${ADMIN_COLORS.green}10`, borderColor: `${ADMIN_COLORS.green}30` }}>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">{value.name}</p>
          <p className="text-xs text-white/40 truncate">{value.email}</p>
        </div>
        <DarkBtn size="sm" variant="ghost" onClick={onClear}>
          <X className="w-3.5 h-3.5" />
          Change
        </DarkBtn>
      </div>
    );
  }

  return (
    <div>
      <DarkInput
        placeholder="Search registered judges by name or email"
        value={term}
        autoFocus={autoFocus}
        onChange={(e) => setTerm(e.target.value)}
        rightElement={<Search className="w-4 h-4 text-white/30" />}
      />

      {searching && <p className="text-xs mt-1.5" style={{ color: ADMIN_COLORS.gold }}>Searching…</p>}

      {results.length > 0 && (
        <div className="mt-2 rounded-xl border overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: ADMIN_COLORS.darkBorderSubtle }}>
          {results.map((account) => {
            const heldSeat = taken[account._id];
            return (
            <button
              key={account._id}
              disabled={!!heldSeat}
              title={heldSeat ? `Already ${heldSeat} on this panel` : undefined}
              onClick={() => { onSelect(account); setTerm(''); setResults([]); }}
              className="w-full text-left px-3 py-2.5 transition-colors border-b last:border-b-0 min-h-[44px] disabled:cursor-not-allowed enabled:hover:bg-white/5"
              style={{ borderColor: ADMIN_COLORS.darkBorderSubtle, opacity: heldSeat ? 0.45 : 1 }}
            >
              <p className="text-sm font-semibold text-white">
                {account.name}
                {heldSeat && (
                  <span className="ml-2 text-xs font-bold" style={{ color: ADMIN_COLORS.red }}>
                    already {heldSeat}
                  </span>
                )}
              </p>
              <p className="text-xs text-white/40">
                {account.email}
                {account.stateUnit && <span> · {account.stateUnit}</span>}
                {account.certificationLevel && <span> · {account.certificationLevel}</span>}
              </p>
            </button>
            );
          })}
        </div>
      )}

      {touched && !searching && term.trim().length >= 2 && results.length === 0 && (
        <div className="mt-2 p-3 rounded-xl border text-xs"
          style={{ background: `${ADMIN_COLORS.gold}10`, borderColor: `${ADMIN_COLORS.gold}30`, color: ADMIN_COLORS.gold }}>
          <p className="font-bold mb-1">No registered judge matches that.</p>
          <p className="text-white/50">
            Judges create their own accounts. Send them the registration link and search again
            once they have signed up.
          </p>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(registerUrl());
              toast.success('Registration link copied');
            }}
            className="mt-2 inline-flex items-center gap-1.5 font-bold min-h-[32px]"
            style={{ color: ADMIN_COLORS.saffronLight }}
          >
            <Copy className="w-3.5 h-3.5" />
            {registerUrl()}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Assign Judge Modal ───────────────────────────────────────────────────────

const AssignJudgeModal = ({ judge, api, selected, setSelected, onSave, onCancel, takenSeats = {} }) => (
  <AnimatePresence>
    {judge && (
      <motion.div className="modal-overlay z-50"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={(e) => e.target === e.currentTarget && onCancel()}>
        <motion.div className="w-full max-w-md rounded-3xl border overflow-hidden modal-panel"
          style={{ background: ADMIN_COLORS.darkElevated, borderColor: ADMIN_COLORS.darkBorderSubtle }}
          initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }} transition={{ duration: 0.25, ease: ADMIN_EASE_OUT }}>
          <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: ADMIN_COLORS.darkBorderSubtle }}>
            <div>
              <p className="text-xs font-bold tracking-widest uppercase" style={{ color: ADMIN_COLORS.saffron }}>Judge Management</p>
              <h3 className="text-xl font-black text-white mt-0.5">
                {judge.name ? 'Replace Judge' : 'Assign Judge'}
              </h3>
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

            {judge.name && (
              <p className="text-xs text-white/40">
                Currently <span className="text-white/70 font-semibold">{judge.name}</span>. Choosing
                someone else replaces them in this slot.
              </p>
            )}

            <JudgeSearch
              api={api}
              value={selected}
              taken={takenSeats}
              onSelect={setSelected}
              onClear={() => setSelected(null)}
              autoFocus
            />
          </div>
          <div className="flex gap-3 p-6 border-t" style={{ borderColor: ADMIN_COLORS.darkBorderSubtle }}>
            <DarkBtn variant="ghost" onClick={onCancel} className="flex-1">Cancel</DarkBtn>
            <DarkBtn variant="success" onClick={onSave} disabled={!selected} className="flex-1">
              <Save className="w-4 h-4" />
              {judge.name ? 'Replace' : 'Assign'}
            </DarkBtn>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const Judges = () => {
  const { routePrefix } = useRouteContext();
  const { currentCompetition } = useCompetition();
  const api = routePrefix === '/superadmin' ? superAdminAPI : adminAPI;
  const isSuperAdmin = routePrefix === '/superadmin';
  useResponsive();

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
  const [judgeFormData, setJudgeFormData] = useState(() => EMPTY_JUDGE_FORM.map((j) => ({ ...j })));
  const [editingJudge, setEditingJudge] = useState(null);
  const [editSelection, setEditSelection] = useState(null);
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [selectedCompetitionType, setSelectedCompetitionType] = useState(null);
  const [selectedApparatus, setSelectedApparatus] = useState(null);
  const [judgeType, setJudgeType] = useState(null);
  const [judgesExistForSelection, setJudgesExistForSelection] = useState(false);
  const [checkingExistingJudges, setCheckingExistingJudges] = useState(false);
  const [loadingJudges, setLoadingJudges] = useState(false);
  const [ageGroupStarted, setAgeGroupStarted] = useState(false);

  const genders = [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }];
  const judgeTypes = [{ value: 'add', label: 'Add Judge' }, { value: 'list', label: 'Judge List' }];
  const competitionForAgeGroups = isSuperAdmin
    ? competitions.find(c => c._id === selectedCompetition?.value)
    : currentCompetition;
  const availableAgeGroups = useAgeGroups(selectedGender?.value || 'Male', competitionForAgeGroups);

  const hasCompetition = !isSuperAdmin || !!selectedCompetition;
  const hasJudgeAction = !!judgeType;
  const hasGender = !!selectedGender;
  const hasAgeGroup = !!selectedAgeGroup;
  const hasCompetitionType = !!selectedCompetitionType;

  /*
   * "All apparatus" seats one panel for the whole category — the same judges
   * score Pole, Hanging and Rope — and is the first option because it is the
   * common arrangement.
   *
   * Without it the picker was mandatory whenever the competition declared any
   * apparatus, so EVERY panel came out apparatus-scoped. An athlete entered
   * for three apparatus then had a panel for one of them and none for the
   * other two: their slips were refused with "Only a panel judge or an admin
   * can submit a judge slip", because the judge genuinely held no seat for
   * that apparatus. Choosing this leaves the seat's apparatus null, which
   * `assignmentCoversCategory` reads as covering all of them.
   */
  const apparatusOptions = selectedCompetitionType && competitionForAgeGroups?.apparatusConfig?.[selectedCompetitionType.value]
    ? [
      { value: '', label: 'All apparatus' },
      ...competitionForAgeGroups.apparatusConfig[selectedCompetitionType.value].map(app => ({ value: app, label: app })),
    ]
    : [];

  const hasApparatus = apparatusOptions.length === 0 || !!selectedApparatus;
  const ladderComplete = hasCompetition && hasJudgeAction && hasGender && hasAgeGroup && hasCompetitionType && hasApparatus;

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

  useEffect(() => {
    if (!isSuperAdmin) return;
    setJudgeType(null);
    setSelectedGender(null);
    setSelectedAgeGroup(null);
    setSelectedCompetitionType(null);
    setSelectedApparatus(null);
    setJudges([]);
    setJudgesExistForSelection(false);
  }, [selectedCompetition, isSuperAdmin]);

  useEffect(() => {
    setJudges([]);
    setJudgesExistForSelection(false);
    if (judgeType === 'add') {
      setJudgeFormData(EMPTY_JUDGE_FORM.map((j) => ({ ...j })));
    }
    if (judgeType === 'list' && isLadderCompleteWith()) {
      loadJudgeList();
    }
  }, [judgeType]);

  useEffect(() => {
    setSelectedAgeGroup(null);
    setSelectedCompetitionType(null);
    setSelectedApparatus(null);
    setJudges([]);
    setJudgesExistForSelection(false);
  }, [selectedGender]);

  useEffect(() => {
    setSelectedCompetitionType(null);
    setSelectedApparatus(null);
    setJudges([]);
    setJudgesExistForSelection(false);
  }, [selectedAgeGroup]);

  useEffect(() => {
    setSelectedApparatus(null);
    setJudges([]);
    setJudgesExistForSelection(false);
  }, [selectedCompetitionType]);

  /**
   * Ensure the judge list always shows all six slots.
   *
   * "Filled" means a registered judge is in the slot. It used to mean the admin
   * had typed a name into it.
   */
  const padJudgeSlots = (apiJudges) => {
    const list = Array.isArray(apiJudges) ? apiJudges : [];
    return JUDGE_SLOTS.map(slot => {
      const found = list.find(j => j.judgeType === slot.judgeType)
        || list.find(j => Number(j.judgeNo) === slot.judgeNo);
      if (found) {
        return {
          ...found,
          judgeNo: slot.judgeNo,
          judgeType: slot.judgeType,
          gender: found.gender || selectedGender?.value,
          ageGroup: found.ageGroup || selectedAgeGroup?.value,
          isEmpty: !found.judgeAccount,
        };
      }
      return {
        ...slot,
        name: '',
        isEmpty: true,
        gender: selectedGender?.value,
        ageGroup: selectedAgeGroup?.value,
      };
    });
  };

  const buildJudgeQueryParams = (overrides = {}) => {
    const params = { ...overrides };
    if (!params.gender && selectedGender) params.gender = selectedGender.value;
    if (!params.ageGroup && selectedAgeGroup) params.ageGroup = selectedAgeGroup.value;
    if (!params.competitionTypes && selectedCompetitionType?.value) {
      params.competitionTypes = selectedCompetitionType.value;
    }
    if (!params.apparatus && selectedApparatus) {
      params.apparatus = selectedApparatus.value;
    }
    if (isSuperAdmin && selectedCompetition) params.competition = selectedCompetition.value;
    return params;
  };

  const isLadderCompleteWith = (compTypeOption = selectedCompetitionType, apparatusOption = selectedApparatus) =>
    hasCompetition && hasJudgeAction && hasGender && hasAgeGroup && !!compTypeOption && (apparatusOptions.length === 0 || !!apparatusOption);

  const checkForExistingJudges = async (compTypeOption = selectedCompetitionType, apparatusOption = selectedApparatus) => {
    if (!isLadderCompleteWith(compTypeOption, apparatusOption)) return false;
    try {
      const response = await api.getJudges(buildJudgeQueryParams({
        competitionTypes: compTypeOption.value,
        apparatus: apparatusOption?.value
      }));
      return (response.data.data || []).filter(j => j._id && j.judgeAccount).length > 0;
    } catch { return false; }
  };

  const handleAgeGroupChange = (ageGroupOption) => {
    setSelectedAgeGroup(ageGroupOption);
  };

  const loadJudgeList = async (compTypeOption = selectedCompetitionType, apparatusOption = selectedApparatus) => {
    if (!isLadderCompleteWith(compTypeOption, apparatusOption)) return;
    setLoadingJudges(true);
    try {
      const response = await api.getJudges(buildJudgeQueryParams({
        competitionTypes: compTypeOption.value,
        apparatus: apparatusOption?.value
      }));
      setJudges(padJudgeSlots(response.data.data || []));
      const summaryResponse = await api.getAllJudgesSummary(
        isSuperAdmin && selectedCompetition ? { competition: selectedCompetition.value } : undefined
      );
      const summaryEntry = (summaryResponse.data.data?.summary || []).find(
        item => item.gender === selectedGender?.value && item.ageGroup === selectedAgeGroup?.value
      );
      const ctInfo = summaryEntry?.competitionTypes?.[compTypeOption?.value];
      setAgeGroupStarted(ctInfo?.isStarted || false);
    } catch {
      toast.error('Failed to load judges');
    } finally {
      setLoadingJudges(false);
    }
  };

  const handleCompetitionTypeChange = async (compTypeOption) => {
    setSelectedCompetitionType(compTypeOption);
    if (compTypeOption && apparatusOptions.length === 0) {
      setCheckingExistingJudges(true);
      const exists = await checkForExistingJudges(compTypeOption, null);
      setJudgesExistForSelection(exists);
      setCheckingExistingJudges(false);
      if (judgeType === 'list') {
        loadJudgeList(compTypeOption, null);
      }
    }
  };

  const handleApparatusChange = async (apparatusOption) => {
    setSelectedApparatus(apparatusOption);
    if (selectedCompetitionType && apparatusOption) {
      setCheckingExistingJudges(true);
      const exists = await checkForExistingJudges(selectedCompetitionType, apparatusOption);
      setJudgesExistForSelection(exists);
      setCheckingExistingJudges(false);
      if (judgeType === 'list') {
        loadJudgeList(selectedCompetitionType, apparatusOption);
      }
    }
  };

  const fetchJudges = useCallback(async () => {
    await loadJudgeList(selectedCompetitionType);
  }, [selectedCompetitionType, selectedGender, selectedAgeGroup, selectedCompetition, judgeType, api, isSuperAdmin]);

  const setSlotAccount = (index, account) => {
    setJudgeFormData((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], account };
      return updated;
    });
  };

  const handleSaveJudges = async () => {
    if (!ladderComplete) { toast.error('Please complete all filters: competition, action, gender, age group, and competition type'); return; }

    const staffed = judgeFormData.filter((j) => j.account);
    const missingRequired = REQUIRED_JUDGE_TYPES.filter(
      (type) => !staffed.some((j) => j.judgeType === type)
    );
    if (missingRequired.length > 0) {
      toast.error(`${missingRequired.join(', ')} ${missingRequired.length === 1 ? 'is' : 'are'} required`);
      return;
    }

    // One person cannot hold two seats on the same panel — their single slip
    // would be averaged in twice. The server refuses it too; catching it here
    // means the admin is told before half the panel is written.
    const seen = new Set();
    const duplicate = staffed.find((j) => {
      if (seen.has(j.account._id)) return true;
      seen.add(j.account._id);
      return false;
    });
    if (duplicate) {
      toast.error(`${duplicate.account.name} is already on this panel`);
      return;
    }

    const judgesExist = await checkForExistingJudges();
    if (judgesExist) { toast.error('Judges already exist. Use "Judge List" to edit.'); return; }

    try {
      const judgesData = {
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value,
        competitionTypes: [selectedCompetitionType.value],
        apparatus: selectedApparatus?.value || null,
        judges: staffed.map((j) => ({
          judgeNo: j.judgeNo,
          judgeType: j.judgeType,
          judgeAccount: j.account._id,
        })),
        ...(isSuperAdmin && selectedCompetition ? { competition: selectedCompetition.value } : {}),
      };
      const response = await api.saveJudges(judgesData);
      const { created = [], updated = [], errors = [] } = response.data.data || {};
      const savedCount = created.length + updated.length;
      if (errors.length > 0) {
        toast.error(`Saved ${savedCount} judge${savedCount === 1 ? '' : 's'}, but ${errors.length} failed.`);
      } else {
        toast.success(`Judge panel saved! ${savedCount} judge${savedCount === 1 ? '' : 's'} saved.`);
      }
      setJudgeFormData(EMPTY_JUDGE_FORM.map((j) => ({ ...j })));
    } catch (error) {
      logger.error('Save judges error:', error);
      toast.error(error.response?.data?.message || 'Failed to save judges');
    }
  };

  const handleEditJudge = (judge) => {
    if (ageGroupStarted) { toast.error('Cannot edit judges. Age group has been started.'); return; }
    setEditingJudge(judge);
    setEditSelection(null);
  };

  const handleDeleteJudge = async (judge) => {
    if (!judge._id || !judge.judgeAccount) { toast.error('Cannot delete an empty judge slot'); return; }
    if (ageGroupStarted) { toast.error('Cannot delete judges. Age group has been started.'); return; }
    if (REQUIRED_JUDGE_TYPES.includes(judge.judgeType)) {
      toast.error(`${judge.judgeType} is required and cannot be deleted`);
      return;
    }
    if (!window.confirm(`Remove ${judge.name} from this panel?`)) return;
    try {
      await api.deleteJudge(judge._id);
      toast.success('Judge removed from the panel');
      fetchJudges();
    } catch (error) { toast.error(error.response?.data?.message || 'Failed to remove judge'); }
  };

  const handleAssignJudge = async () => {
    if (!editSelection) { toast.error('Choose a registered judge'); return; }
    const isNewSlot = !editingJudge._id || editingJudge.isEmpty;
    try {
      if (!isNewSlot) {
        await api.updateJudge(editingJudge._id, { judgeAccount: editSelection._id });
        toast.success('Judge replaced');
      } else {
        await api.createSingleJudge({
          gender: editingJudge.gender || selectedGender?.value,
          ageGroup: editingJudge.ageGroup || selectedAgeGroup?.value,
          competitionTypes: [selectedCompetitionType?.value],
          apparatus: selectedApparatus?.value || null,
          judgeNo: editingJudge.judgeNo,
          judgeType: editingJudge.judgeType,
          judgeAccount: editSelection._id,
          ...(isSuperAdmin && selectedCompetition ? { competition: selectedCompetition.value } : {}),
        });
        toast.success('Judge assigned');
      }
      fetchJudges();
      setEditingJudge(null);
      setEditSelection(null);
    } catch (error) {
      logger.error('Assign judge error:', error);
      toast.error(error.response?.data?.message || 'Failed to assign judge');
    }
  };

  const competitionOptions = competitions.map(c => ({ value: c._id, label: `${c.name}${c.year ? ` (${c.year})` : ''}${c.place ? ` — ${c.place}` : ''}` }));
  const filtersReady = !isSuperAdmin || selectedCompetition;

  const judgeTypeBadge = (jt) => {
    if (jt === 'Senior Judge') return { bg: `${ADMIN_COLORS.purple}20`, color: ADMIN_COLORS.purpleLight };
    if (SUPPORT_JUDGE_TYPES.includes(jt)) return { bg: `${ADMIN_COLORS.gold}20`, color: ADMIN_COLORS.gold };
    return { bg: `${ADMIN_COLORS.blue}20`, color: '#93C5FD' };
  };

  return (
    <div className="space-y-6">
      <AssignJudgeModal
        judge={editingJudge}
        api={api}
        /*
         * Everyone already seated on this panel except the slot being
         * replaced — replacing Judge 1 with the Senior Judge would put one
         * person's single slip into the average twice.
         */
        takenSeats={Object.fromEntries(
          judges
            .filter((seated) => seated.judgeNo !== editingJudge?.judgeNo)
            .map((seated) => [seated.judgeAccount?._id || seated.judgeAccount, seated.judgeType])
            .filter(([id]) => id)
        )}
        selected={editSelection}
        setSelected={setEditSelection}
        onSave={handleAssignJudge}
        onCancel={() => { setEditingJudge(null); setEditSelection(null); }}
      />
      <FadeIn>
        <DarkCard className="p-6">
          <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: ADMIN_COLORS.saffron }}>Judge Management</p>
          <h2 className="text-2xl font-black text-white mb-2">Manage Judges</h2>
          <p className="text-white/35 text-sm mb-6">
            Judges create their own accounts at{' '}
            <span className="text-white/60">{REGISTER_PATH}</span> — here you choose which of them
            sits on each panel.
          </p>

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
              {/* Filters row — ladder: action → gender → age group → competition type → apparatus */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>
                    Judge Action <span style={{ color: ADMIN_COLORS.red }}>*</span>
                  </label>
                  <Dropdown
                    options={judgeTypes}
                    value={judgeTypes.find(j => j.value === judgeType) || null}
                    onChange={(opt) => setJudgeType(opt?.value ?? null)}
                    placeholder={hasCompetition ? 'Select action' : 'Select competition first'}
                    disabled={!hasCompetition}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>
                    Gender <span style={{ color: ADMIN_COLORS.red }}>*</span>
                  </label>
                  <Dropdown
                    options={genders}
                    value={selectedGender}
                    onChange={setSelectedGender}
                    placeholder={hasJudgeAction ? 'Select gender' : 'Select judge action first'}
                    disabled={!hasJudgeAction}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>
                    Age Group <span style={{ color: ADMIN_COLORS.red }}>*</span>
                  </label>
                  <Dropdown
                    options={availableAgeGroups}
                    value={selectedAgeGroup}
                    onChange={handleAgeGroupChange}
                    placeholder={hasGender ? 'Select age group' : 'Select gender first'}
                    disabled={!hasGender}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>
                    Competition Type <span style={{ color: ADMIN_COLORS.red }}>*</span>
                  </label>
                  {!availableCompetitionTypes || availableCompetitionTypes.length === 0 ? (
                    <div className="p-3 rounded-xl border min-h-[44px] flex items-center" style={{ background: `${ADMIN_COLORS.gold}10`, borderColor: `${ADMIN_COLORS.gold}30` }}>
                      <p className="text-xs" style={{ color: ADMIN_COLORS.gold }}>No competition types configured.</p>
                    </div>
                  ) : (
                    <Dropdown
                      options={competitionTypeOptions}
                      value={selectedCompetitionType}
                      onChange={handleCompetitionTypeChange}
                      placeholder={hasAgeGroup ? 'Select competition type' : 'Select age group first'}
                      disabled={!hasAgeGroup}
                    />
                  )}
                  {checkingExistingJudges && apparatusOptions.length === 0 && <p className="text-xs mt-1" style={{ color: ADMIN_COLORS.gold }}>Checking existing judges…</p>}
                </div>
                {apparatusOptions.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>
                      Apparatus <span style={{ color: ADMIN_COLORS.red }}>*</span>
                    </label>
                    <Dropdown
                      options={apparatusOptions}
                      value={selectedApparatus}
                      onChange={handleApparatusChange}
                      placeholder={hasCompetitionType ? 'Select apparatus' : 'Select competition type first'}
                      disabled={!hasCompetitionType}
                    />
                    {checkingExistingJudges && <p className="text-xs mt-1" style={{ color: ADMIN_COLORS.gold }}>Checking existing judges…</p>}
                  </div>
                )}
              </div>

              {/* Add Judge Form */}
              {judgeType === 'add' && (
                <div>
                  <h3 className="text-lg font-bold text-white mb-4">Staff the Panel</h3>
                  {!ladderComplete ? (
                    <EmptyState icon={UserPlus} title="Complete all filters first" desc="Select judge action, gender, age group, and competition type to staff a panel." />
                  ) : judgesExistForSelection ? (
                    <div className="text-center py-8">
                      <div className="p-6 rounded-2xl border" style={{ background: `${ADMIN_COLORS.gold}10`, borderColor: `${ADMIN_COLORS.gold}30` }}>
                        <Users className="w-10 h-10 mx-auto mb-3" style={{ color: ADMIN_COLORS.gold }} />
                        <h3 className="text-lg font-bold text-white mb-2">Judges Already Exist</h3>
                        <p className="text-white/50 text-sm mb-4">A judge panel already exists for <strong className="text-white">{selectedGender.label} — {selectedAgeGroup.label}{selectedApparatus ? ` — ${selectedApparatus.label}` : ''}</strong>. Use &quot;Judge List&quot; to view or edit.</p>
                        <DarkBtn variant="primary" onClick={() => setJudgeType('list')}>Switch to Judge List</DarkBtn>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-4 p-4 rounded-xl border text-sm" style={{ background: `${ADMIN_COLORS.blue}10`, borderColor: `${ADMIN_COLORS.blue}30` }}>
                        <p className="text-white/70">Staffing: <span className="font-bold text-white">{selectedGender.label} — {selectedAgeGroup.label}</span>
                          {selectedCompetitionType && <span className="text-white/50"> · {selectedCompetitionType.label}</span>}
                          {selectedApparatus && <span className="text-white/50"> · {selectedApparatus.label}</span>}
                        </p>
                        <p className="text-white/50 text-xs mt-1">Required: Senior Judge, Judge 1, Judge 2 &amp; Scorer · Judge 3 &amp; Judge 4 optional</p>
                      </div>
                      <div className="space-y-4">
                        {judgeFormData.map((judge, index) => {
                          const badge = judgeTypeBadge(judge.judgeType);
                          /*
                           * Who this slot may NOT pick: anyone filling another
                           * slot in this form, and anyone already seated on the
                           * panel from an earlier save. Both are the same rule
                           * — one person, one seat per panel — and the server
                           * enforces it either way; this is so the admin is
                           * told while choosing rather than on Save.
                           */
                          const taken = {};
                          judgeFormData.forEach((other, otherIndex) => {
                            if (otherIndex !== index && other.account?._id) {
                              taken[other.account._id] = other.judgeType;
                            }
                          });
                          judges.forEach((seated) => {
                            const id = seated.judgeAccount?._id || seated.judgeAccount;
                            if (id && seated.judgeType !== judge.judgeType) taken[id] = seated.judgeType;
                          });
                          return (
                            <div key={judge.judgeNo} className="rounded-xl border p-4" style={{ background: 'rgba(255,255,255,0.02)', borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                              <div className="flex items-center gap-2 mb-4">
                                <span className="text-sm font-bold text-white">{judge.judgeNo}</span>
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: badge.bg, color: badge.color }}>{judge.judgeType}</span>
                                {REQUIRED_JUDGE_TYPES.includes(judge.judgeType) && (
                                  <span className="text-xs font-bold" style={{ color: ADMIN_COLORS.red }}>* Required</span>
                                )}
                              </div>
                              <JudgeSearch
                                api={api}
                                value={judge.account}
                                taken={taken}
                                onSelect={(account) => setSlotAccount(index, account)}
                                onClear={() => setSlotAccount(index, null)}
                              />
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
                    {(judgeType || selectedGender || selectedAgeGroup || selectedCompetitionType) && (
                      <DarkBtn size="sm" variant="ghost" onClick={() => {
                        setJudgeType(null);
                        setSelectedGender(null);
                        setSelectedAgeGroup(null);
                        setSelectedCompetitionType(null);
                        setSelectedApparatus(null);
                        setJudges([]);
                        setJudgesExistForSelection(false);
                      }}>
                        Clear Filters
                      </DarkBtn>
                    )}
                  </div>
                  {loadingJudges ? (
                    <LoadingState label="Loading judges…" />
                  ) : !ladderComplete ? (
                    <EmptyState icon={Filter}
                      title="Complete all filters to view judges"
                      desc="Select judge action, gender, age group, and competition type."
                    />
                  ) : judges.some(j => j.judgeAccount) ? (
                    <div>
                      <div className="mb-4 p-3 rounded-xl border text-sm" style={{ background: `${ADMIN_COLORS.green}10`, borderColor: `${ADMIN_COLORS.green}30` }}>
                        <span className="text-white/70">Judge panel for: </span>
                        <span className="font-bold text-white">{selectedGender?.label} — {selectedAgeGroup?.label}</span>
                        {selectedCompetitionType && <span className="text-white/50 ml-2">· {selectedCompetitionType.label}</span>}
                      </div>
                      <div className="space-y-3">
                        {judges.map((judge) => {
                          const badge = judgeTypeBadge(judge.judgeType);
                          const canDelete = !!judge.judgeAccount && !REQUIRED_JUDGE_TYPES.includes(judge.judgeType);
                          return (
                            <div key={judge.judgeNo} className="rounded-xl border p-4 flex items-center justify-between gap-4"
                              style={{ background: judge.isEmpty ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)', borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: badge.bg }}>
                                  <span className="text-xs font-black" style={{ color: badge.color }}>{judge.judgeNo}</span>
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-bold text-white">{judge.name || <span className="text-white/30 italic">Empty Slot</span>}</span>
                                    <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: badge.bg, color: badge.color }}>{judge.judgeType}</span>
                                    {judge.judgeAccount
                                      ? <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: `${ADMIN_COLORS.green}20`, color: ADMIN_COLORS.green }}>Assigned</span>
                                      : <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: `${ADMIN_COLORS.gold}20`, color: ADMIN_COLORS.gold }}>Available</span>}
                                  </div>
                                  {judge.email && <p className="text-xs text-white/40 mt-0.5">{judge.email}</p>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <DarkBtn size="sm" variant={judge.judgeAccount ? 'purple' : 'success'} disabled={ageGroupStarted} onClick={() => handleEditJudge(judge)}>
                                  <Edit className="w-3.5 h-3.5" />
                                  {judge.judgeAccount ? 'Replace' : 'Assign'}
                                </DarkBtn>
                                {judge.judgeAccount && !ageGroupStarted && (
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
                      title="No judges found"
                      desc={`No judge panel for ${selectedGender?.label} — ${selectedAgeGroup?.label}${selectedCompetitionType ? ` · ${selectedCompetitionType.label}` : ''}. Switch to "Add Judge" to staff one.`}
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
