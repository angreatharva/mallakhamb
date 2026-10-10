import { useState, useEffect, useCallback, useId } from 'react';
import { Users, Filter, UserPlus, Save, Edit, X, Trash2, Search, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { AnimatePresence } from 'framer-motion';
import { adminAPI, superAdminAPI } from '@/services/api';
import { useRouteContext } from '../../contexts/RouteContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { useAgeGroups } from '../../hooks/useAgeGroups';
import { APPARATUS, offeredApparatus } from '@/utils/scoring/apparatus';
import { logger } from '@/infrastructure/logger';
import Dropdown from '@/components/auth/Dropdown';
import { useResponsive } from '../../hooks/useResponsive';
import { ADMIN_COLORS, DATA_COLORS, FG, alpha } from '../../styles/tokens';
import { BodyScrollLock } from '@/hooks/useBodyScrollLock';
import { DarkCard, FadeIn, EmptyState, LoadingState, DarkBtn } from '@/components/admin/AdminKit';

// The visible <label> was never tied to its <input>, so a screen reader read
// every field on this screen as an unnamed "edit text". useId links the pair
// without making callers invent ids; an explicit `id` still wins.
const DarkInput = ({ label, required, error, hint, rightElement, id, ...props }) => {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
  <div>
    {label && (
      <label htmlFor={inputId} className="block type-tag mb-1.5 text-accent-fg">
        {label}{required && <span className="text-danger-fg"> *</span>}
      </label>
    )}
    <div className="relative">
      <input
        id={inputId}
        className="w-full rounded-xl text-base mouse:text-sm text-ink placeholder-ink/30 min-h-[44px] transition-all duration-200"
        style={{ background: 'rgb(var(--ink) / 0.04)', border: `1px solid ${error ? alpha(ADMIN_COLORS.red, 0x60) : ADMIN_COLORS.darkBorderMid}`, paddingLeft: '0.875rem', paddingRight: rightElement ? '3rem' : '0.875rem', paddingTop: '0.625rem', paddingBottom: '0.625rem' }}
        onFocus={(e) => { e.target.style.borderColor = `${alpha(ADMIN_COLORS.saffron, 0x50)}`; e.target.style.boxShadow = `0 0 0 3px ${alpha(ADMIN_COLORS.saffron, 0x12)}`; }}
        onBlur={(e) => { e.target.style.borderColor = error ? alpha(ADMIN_COLORS.red, 0x60) : ADMIN_COLORS.darkBorderMid; e.target.style.boxShadow = 'none'; }}
        {...props}
      />
      {rightElement && <div className="absolute right-2 top-1/2 -translate-y-1/2">{rightElement}</div>}
    </div>
    {hint && <p className="text-xs mt-1 text-fg-muted">{hint}</p>}
    {error && <p className="text-xs mt-1 text-danger-fg">{error}</p>}
  </div>
  );
};

const EMPTY_JUDGE_FORM = [
  { judgeNo: 1, judgeType: 'Senior Judge', account: null },
  { judgeNo: 2, judgeType: 'Judge 1', account: null },
  { judgeNo: 3, judgeType: 'Judge 2', account: null },
  { judgeNo: 4, judgeType: 'Judge 3', account: null },
  { judgeNo: 5, judgeType: 'Judge 4', account: null },
  { judgeNo: 6, judgeType: 'Scorer', account: null },
  // Required, and may be the Scorer's own account. Times
  // each performance on /judge/scoring; the stopped time goes to the Scorer's
  // sheet. Seat 7 — see Server/src/config/judge-seats.js.
  { judgeNo: 7, judgeType: 'Time Keeper', account: null },
];

const JUDGE_SLOTS = EMPTY_JUDGE_FORM.map(({ judgeNo, judgeType }) => ({ judgeNo, judgeType }));

const SUPPORT_JUDGE_TYPES = ['Scorer', 'Time Keeper'];
const REQUIRED_JUDGE_TYPES = ['Senior Judge', 'Judge 1', 'Judge 2', 'Scorer', 'Time Keeper'];

/**
 * The seat as this screen names it. Every seat reads its own name — the Time
 * Keeper's slot was briefly labelled "Timer" and was renamed back on
 * 2026-09-27 at the user's request. Kept as the one place to change a label.
 */
const seatLabel = (judgeType) => judgeType;

/**
 * May one person hold both seats? Only the Scorer and the Time Keeper: neither
 * evaluates, so no slip is counted twice. Mirrors maySeatTogether in
 * Server/src/config/judge-seats.js, which the server enforces.
 */
const maySeatTogether = (a, b) =>
  a !== b && SUPPORT_JUDGE_TYPES.includes(a) && SUPPORT_JUDGE_TYPES.includes(b);

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
      <div className="rounded-xl border p-3 flex items-center justify-between gap-3 bg-surface-sunken border-line">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink truncate">{value.name}</p>
          <p className="text-xs text-fg-muted truncate">{value.email}</p>
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
        rightElement={<Search className="w-4 h-4 text-ink/30" />}
      />

      {searching && <p className="text-xs mt-1.5 text-accent-fg">Searching…</p>}

      {results.length > 0 && (
        <div className="mt-2 rounded-xl border overflow-hidden bg-surface-sunken border-line">
          {results.map((account) => {
            const heldSeat = taken[account._id];
            return (
            <button
              key={account._id}
              disabled={!!heldSeat}
              title={heldSeat ? `Already ${heldSeat} on this panel` : undefined}
              onClick={() => { onSelect(account); setTerm(''); setResults([]); }}
              className="w-full text-left px-3 py-2.5 transition-colors border-b last:border-b-0 min-h-[44px] disabled:cursor-not-allowed enabled:hover:bg-ink/5"
              style={{ borderColor: ADMIN_COLORS.darkBorderSubtle, opacity: heldSeat ? 0.45 : 1 }}
            >
              <p className="text-sm font-semibold text-ink">
                {account.name}
                {heldSeat && (
                  <span className="ml-2 text-xs font-bold text-danger-fg">
                    already {heldSeat}
                  </span>
                )}
              </p>
              <p className="text-xs text-fg-muted">
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
        <div className="mt-2 p-3 rounded-xl border text-xs bg-surface-sunken border-line text-warning-fg">
          <p className="font-bold mb-1">No registered judge matches that.</p>
          <p className="text-fg-muted">
            Judges create their own accounts. Send them the registration link and search again
            once they have signed up.
          </p>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(registerUrl());
              toast.success('Registration link copied');
            }}
            className="mt-2 inline-flex items-center gap-1.5 font-bold tap-safe mouse:min-h-[32px] text-accent-fg"
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
      <div className="modal-overlay z-50 bg-scrim" onClick={(e) => e.target === e.currentTarget && onCancel()}>
        <BodyScrollLock />
        <div className="w-full max-w-md rounded-3xl border overflow-hidden modal-panel bg-surface-overlay border-line">
          <div className="flex items-center justify-between p-6 border-b border-line">
            <div>
              <p className="type-tag text-accent-fg">Judge Management</p>
              <h3 className="text-xl font-black text-ink mt-0.5">
                {judge.name ? 'Replace Judge' : 'Assign Judge'}
              </h3>
            </div>
            <button onClick={onCancel} className="p-2 rounded-xl hover:bg-ink/10 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center" aria-label="Close">
              <X className="w-5 h-5 text-ink/60" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="p-3 rounded-xl border text-xs" style={{ background: 'rgb(var(--ink) / 0.03)', borderColor: ADMIN_COLORS.darkBorderSubtle, color: 'var(--fg-muted)' }}>
              <span className="font-bold text-accent-fg">{seatLabel(judge.judgeType)}</span>
              {judge.gender && <> · {judge.gender}</>}
              {judge.ageGroup && <> · {judge.ageGroup}</>}
              {judge.apparatus && <> · {judge.apparatus}</>}
            </div>

            {judge.name && (
              <p className="text-xs text-fg-muted">
                Currently <span className="text-ink/70 font-semibold">{judge.name}</span>. Choosing
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
          <div className="flex gap-3 p-6 border-t border-line">
            <DarkBtn variant="ghost" onClick={onCancel} className="flex-1">Cancel</DarkBtn>
            <DarkBtn variant="success" onClick={onSave} disabled={!selected} className="flex-1">
              <Save className="w-4 h-4" />
              {judge.name ? 'Replace' : 'Assign'}
            </DarkBtn>
          </div>
        </div>
      </div>
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
  const hasApparatus = !!selectedApparatus;

  /*
   * A PANEL IS SEATED FOR ONE APPARATUS, AND THE MEET DECIDES WHICH ARE ON OFFER.
   *
   * The ladder is Gender → Age Group → Competition Type → Apparatus, and the
   * last rung is required with no "All apparatus" answer. A category running
   * Pole and Rope is two panels, staffed separately and free to be different
   * sizes — which is the point, since COP scores Competition III per apparatus.
   *
   * The options come from the MEET's `apparatusConfig` for the chosen
   * competition type, not from the three COP apparatus: offering Hanging for a
   * meet that does not run it seats a panel no athlete can ever be judged by.
   *
   * This depends on `Judge`'s unique indexes carrying `apparatus`
   * ({gender, ageGroup, apparatus, judgeNo, competition} and the judgeType
   * twin). They did not until migration 010; without it the SECOND apparatus in
   * a category collides with the first on judgeNo and Save fails with a
   * duplicate key. Do not remove the apparatus from those keys and leave this
   * question standing.
   */
  const ladderComplete =
    hasCompetition && hasJudgeAction && hasGender && hasAgeGroup && hasCompetitionType && hasApparatus;

  /**
   * The apparatus this meet runs for the chosen competition type.
   *
   * `apparatusConfig` is a Map server-side and arrives as a plain object keyed
   * by competition-type slug. A meet that declares none falls back to the three
   * COP apparatus rather than to an empty dropdown — an unconfigured meet is
   * the normal state of one seeded before `apparatusConfig` was filled in, and
   * a blank required rung would make it unstaffable.
   */
  const getApparatusOptions = () => {
    if (!selectedCompetitionType) return [];
    const config = competitionForAgeGroups?.apparatusConfig || {};
    const configured = config[selectedCompetitionType.value];
    // A meet that declares its apparatus is narrowed to the chosen gender's —
    // a Female panel has no seats on an apparatus women do not compete on.
    const list = Array.isArray(configured) && configured.length > 0
      ? (selectedGender
        ? offeredApparatus(competitionForAgeGroups, selectedCompetitionType.value, selectedGender.value)
        : configured)
      : APPARATUS;
    return list.map((apparatus) => ({ value: apparatus, label: apparatus }));
  };

  const getCompetitionTypeOptions = () => {
    const order = ['competition_1', 'competition_2', 'competition_3'];
    const types = availableCompetitionTypes || [];
    return order.filter(t => types.includes(t)).map(t => ({
      value: t,
      label: t === 'competition_1' ? 'Competition I - Team Championship' : t === 'competition_2' ? 'Competition II - All Round Individual' : 'Competition III - Apparatus Championship'
    }));
  };
  const competitionTypeOptions = getCompetitionTypeOptions();
  const apparatusOptions = getApparatusOptions();

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

  /**
   * Ensure the judge list always shows all six slots.
   *
   * "Filled" means a registered judge is in the slot. It used to mean the admin
   * had typed a name into it.
   *
   * `apparatusOption` is passed in rather than read off state because the last
   * rung of the ladder loads the list in the same tick it is chosen, when
   * `selectedApparatus` is still the previous value — and an empty slot drawn
   * with the wrong apparatus writes the seat onto the wrong panel when it is
   * filled.
   */
  const padJudgeSlots = (apiJudges, apparatusOption = selectedApparatus) => {
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
        // A drawn slot, not a document — so it carries the panel the admin is
        // looking at, which is what filling it will write.
        apparatus: apparatusOption?.value ?? null,
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
    /*
     * Without this the screen shows every apparatus's panel at once — six seats
     * per apparatus padded into six slots, whichever row happened to come back
     * first winning each one. The server answers an apparatus filter with that
     * apparatus's seats PLUS any legacy category-wide ones, which is the right
     * reading of "who judges Rope here".
     */
    if (!params.apparatus && selectedApparatus?.value) params.apparatus = selectedApparatus.value;
    if (isSuperAdmin && selectedCompetition) params.competition = selectedCompetition.value;
    return params;
  };

  const isLadderCompleteWith = (
    compTypeOption = selectedCompetitionType,
    apparatusOption = selectedApparatus
  ) =>
    hasCompetition && hasJudgeAction && hasGender && hasAgeGroup
    && !!compTypeOption && !!apparatusOption;

  const checkForExistingJudges = async (
    compTypeOption = selectedCompetitionType,
    apparatusOption = selectedApparatus
  ) => {
    if (!isLadderCompleteWith(compTypeOption, apparatusOption)) return false;
    try {
      const response = await api.getJudges(buildJudgeQueryParams({
        competitionTypes: compTypeOption.value,
        apparatus: apparatusOption.value,
      }));
      return (response.data.data || []).filter(j => j._id && j.judgeAccount).length > 0;
    } catch { return false; }
  };

  const handleAgeGroupChange = (ageGroupOption) => {
    setSelectedAgeGroup(ageGroupOption);
  };

  const loadJudgeList = async (
    compTypeOption = selectedCompetitionType,
    apparatusOption = selectedApparatus
  ) => {
    if (!isLadderCompleteWith(compTypeOption, apparatusOption)) return;
    setLoadingJudges(true);
    try {
      const response = await api.getJudges(buildJudgeQueryParams({
        competitionTypes: compTypeOption.value,
        apparatus: apparatusOption.value,
      }));
      setJudges(padJudgeSlots(response.data.data || [], apparatusOption));
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

  /*
   * Competition type is no longer the last rung, so it no longer looks the
   * panel up — it only narrows which apparatus are on offer. Looking up here
   * as well would ask the server for a category-wide panel that, since
   * migration 010, is not a thing a new meet has.
   */
  const handleCompetitionTypeChange = (compTypeOption) => {
    setSelectedCompetitionType(compTypeOption);
    setSelectedApparatus(null);
    setJudges([]);
    setJudgesExistForSelection(false);
  };

  // The last rung of the ladder, so this is where the panel is looked up.
  const handleApparatusChange = async (apparatusOption) => {
    setSelectedApparatus(apparatusOption);
    setJudges([]);
    setJudgesExistForSelection(false);
    if (!apparatusOption) return;

    setCheckingExistingJudges(true);
    const exists = await checkForExistingJudges(selectedCompetitionType, apparatusOption);
    setJudgesExistForSelection(exists);
    setCheckingExistingJudges(false);
    if (judgeType === 'list') {
      loadJudgeList(selectedCompetitionType, apparatusOption);
    }
  };

  const fetchJudges = useCallback(async () => {
    await loadJudgeList(selectedCompetitionType, selectedApparatus);
  }, [selectedCompetitionType, selectedApparatus, selectedGender, selectedAgeGroup, selectedCompetition, judgeType, api, isSuperAdmin]);

  const setSlotAccount = (index, account) => {
    setJudgeFormData((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], account };
      return updated;
    });
  };

  const handleSaveJudges = async () => {
    if (!ladderComplete) { toast.error('Please complete all filters: competition, action, gender, age group, competition type, and apparatus'); return; }

    const staffed = judgeFormData.filter((j) => j.account);
    const missingRequired = REQUIRED_JUDGE_TYPES.filter(
      (type) => !staffed.some((j) => j.judgeType === type)
    ).map(seatLabel);
    if (missingRequired.length > 0) {
      toast.error(`${missingRequired.join(', ')} ${missingRequired.length === 1 ? 'is' : 'are'} required`);
      return;
    }

    // One person cannot hold two seats on the same panel — their single slip
    // would be averaged in twice. The server refuses it too; catching it here
    // means the admin is told before half the panel is written.
    // …except the Scorer and the Time Keeper, which one person may hold together.
    const seatsHeld = new Map();
    const duplicate = staffed.find((j) => {
      const held = seatsHeld.get(j.account._id) || [];
      if (held.some((seat) => !maySeatTogether(seat, j.judgeType))) return true;
      seatsHeld.set(j.account._id, [...held, j.judgeType]);
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
        // The panel's apparatus, not a filter — see the note on `ladderComplete`.
        apparatus: selectedApparatus.value,
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
      toast.error(`${seatLabel(judge.judgeType)} is required and cannot be deleted`);
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
          // The panel the admin is looking at, not the slot. Sending null would
          // file the new seat on a category-wide panel of its own, invisible
          // beside the one they are staffing.
          apparatus: editingJudge.apparatus || selectedApparatus?.value || null,
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
    if (jt === 'Senior Judge') return { bg: `${alpha(ADMIN_COLORS.purple, 0x20)}`, color: 'rgb(var(--accent-fg))' };
    if (SUPPORT_JUDGE_TYPES.includes(jt)) return { bg: `${alpha(ADMIN_COLORS.gold, 0x20)}`, color: FG.brandGold };
    return { bg: `${alpha(ADMIN_COLORS.blue, 0x20)}`, color: DATA_COLORS.blueSoft };
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
            // The Scorer may also be the Time Keeper, and the other way round.
            .filter((seated) => !maySeatTogether(seated.judgeType, editingJudge?.judgeType))
            .map((seated) => [seated.judgeAccount?._id || seated.judgeAccount, seatLabel(seated.judgeType)])
            .filter(([id]) => id)
        )}
        selected={editSelection}
        setSelected={setEditSelection}
        onSave={handleAssignJudge}
        onCancel={() => { setEditingJudge(null); setEditSelection(null); }}
      />
      <FadeIn>
        <DarkCard className="p-6">
          <p className="type-tag mb-1 text-accent-fg">Judge Management</p>
          <h2 className="type-display-m text-fg mb-2">Manage Judges</h2>
          <p className="text-fg-muted text-sm mb-6">
            Judges create their own accounts at{' '}
            <span className="text-ink/60">{REGISTER_PATH}</span> — here you choose which of them
            sits on each panel.
          </p>

          {isSuperAdmin && (
            <div className="mb-6 p-4 rounded-xl border bg-surface-sunken border-line">
              <label className="block type-tag mb-2 text-accent-fg">
                Competition <span className="text-danger-fg">*</span>
              </label>
              <Dropdown options={competitionOptions} value={selectedCompetition} onChange={setSelectedCompetition}
                placeholder={loadingCompetitions ? 'Loading…' : 'Select a competition first'} disabled={loadingCompetitions} />
              {!selectedCompetition && <p className="text-xs mt-2 text-accent-fg">Select a competition to enable filters.</p>}
            </div>
          )}

          {!filtersReady ? (
            <EmptyState icon={Filter} title="Select a Competition First" desc="Choose a competition above to start managing judges." />
          ) : (
            <div>
              {/* Filters row — the ladder: action → gender → age group → competition type → apparatus */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <div>
                  <label className="block type-tag mb-2 text-accent-fg">
                    Judge Action <span className="text-danger-fg">*</span>
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
                  <label className="block type-tag mb-2 text-accent-fg">
                    Gender <span className="text-danger-fg">*</span>
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
                  <label className="block type-tag mb-2 text-accent-fg">
                    Age Group <span className="text-danger-fg">*</span>
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
                  <label className="block type-tag mb-2 text-accent-fg">
                    Competition Type <span className="text-danger-fg">*</span>
                  </label>
                  {!availableCompetitionTypes || availableCompetitionTypes.length === 0 ? (
                    <div className="p-3 rounded-xl border min-h-[44px] flex items-center bg-surface-sunken border-line">
                      <p className="text-xs text-accent-fg">No competition types configured.</p>
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
                </div>
                <div>
                  <label className="block type-tag mb-2 text-accent-fg">
                    Apparatus <span className="text-danger-fg">*</span>
                  </label>
                  <Dropdown
                    options={apparatusOptions}
                    value={selectedApparatus}
                    onChange={handleApparatusChange}
                    placeholder={hasCompetitionType ? 'Select apparatus' : 'Select competition type first'}
                    disabled={!hasCompetitionType}
                  />
                  {checkingExistingJudges && <p className="text-xs mt-1 text-accent-fg">Checking existing judges…</p>}
                  {hasCompetitionType && !checkingExistingJudges && (
                    <p className="text-xs mt-1 text-fg-muted">
                      One panel per apparatus — staff each separately.
                    </p>
                  )}
                </div>
              </div>

              {/* Add Judge Form */}
              {judgeType === 'add' && (
                <div>
                  <h3 className="type-display-s text-fg mb-4">Staff the Panel</h3>
                  {!ladderComplete ? (
                    <EmptyState icon={UserPlus} title="Complete all filters first" desc="Select judge action, gender, age group, competition type, and apparatus to staff a panel." />
                  ) : judgesExistForSelection ? (
                    <div className="text-center py-8">
                      <div className="p-6 rounded-2xl border bg-surface-sunken border-line">
                        <Users className="w-10 h-10 mx-auto mb-3 text-accent-fg"/>
                        <h3 className="type-display-s text-fg mb-2">Judges Already Exist</h3>
                        <p className="text-fg-muted text-sm mb-4">A judge panel already exists for <strong className="text-ink">{selectedGender.label} — {selectedAgeGroup.label} · {selectedApparatus.label}</strong>. Use &quot;Judge List&quot; to view or edit.</p>
                        <DarkBtn variant="primary" onClick={() => setJudgeType('list')}>Switch to Judge List</DarkBtn>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-4 p-4 rounded-xl border text-sm bg-surface-sunken border-line">
                        <p className="text-ink/70">Staffing: <span className="font-bold text-ink">{selectedGender.label} — {selectedAgeGroup.label}</span>
                          {selectedCompetitionType && <span className="text-fg-muted"> · {selectedCompetitionType.label}</span>}
                          {selectedApparatus && <span className="text-fg-muted"> · {selectedApparatus.label}</span>}
                        </p>
                        <p className="text-fg-muted text-xs mt-1">Required: Senior Judge, Judge 1, Judge 2 &amp; Scorer · Judge 3 &amp; Judge 4 optional</p>
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
                            if (otherIndex !== index && other.account?._id
                              && !maySeatTogether(other.judgeType, judge.judgeType)) {
                              taken[other.account._id] = seatLabel(other.judgeType);
                            }
                          });
                          judges.forEach((seated) => {
                            const id = seated.judgeAccount?._id || seated.judgeAccount;
                            if (id && seated.judgeType !== judge.judgeType
                              && !maySeatTogether(seated.judgeType, judge.judgeType)) {
                              taken[id] = seatLabel(seated.judgeType);
                            }
                          });
                          return (
                            <div key={judge.judgeNo} className="rounded-xl border p-4 bg-surface-sunken border-line">
                              <div className="flex items-center gap-2 mb-4">
                                <span className="text-sm font-bold text-ink">{judge.judgeNo}</span>
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: badge.bg, color: badge.color }}>{seatLabel(judge.judgeType)}</span>
                                {REQUIRED_JUDGE_TYPES.includes(judge.judgeType) && (
                                  <span className="text-xs font-bold text-danger-fg">* Required</span>
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
                    <h3 className="type-display-s text-fg">Judge List</h3>
                    {(judgeType || selectedGender || selectedAgeGroup || selectedCompetitionType || selectedApparatus) && (
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
                      desc="Select judge action, gender, age group, competition type, and apparatus."
                    />
                  ) : judges.some(j => j.judgeAccount) ? (
                    <div>
                      <div className="mb-4 p-3 rounded-xl border text-sm bg-surface-sunken border-line">
                        <span className="text-ink/70">Judge panel for: </span>
                        <span className="font-bold text-ink">{selectedGender?.label} — {selectedAgeGroup?.label}</span>
                        {selectedCompetitionType && <span className="text-fg-muted ml-2">· {selectedCompetitionType.label}</span>}
                        {selectedApparatus && <span className="text-fg-muted ml-2">· {selectedApparatus.label}</span>}
                      </div>
                      <div className="space-y-3">
                        {judges.map((judge) => {
                          const badge = judgeTypeBadge(judge.judgeType);
                          const canDelete = !!judge.judgeAccount && !REQUIRED_JUDGE_TYPES.includes(judge.judgeType);
                          return (
                            <div key={judge.judgeNo} className="rounded-xl border p-4 flex items-center justify-between gap-4"
                              style={{ background: judge.isEmpty ? 'rgb(var(--ink) / 0.01)' : 'rgb(var(--ink) / 0.03)', borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: badge.bg }}>
                                  <span className="text-xs font-black" style={{ color: badge.color }}>{judge.judgeNo}</span>
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-bold text-ink">{judge.name || <span className="text-fg-muted italic">Empty Slot</span>}</span>
                                    <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: badge.bg, color: badge.color }}>{seatLabel(judge.judgeType)}</span>
                                    {judge.judgeAccount
                                      ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-success-tint text-success-fg">Assigned</span>
                                      : <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-warning-tint text-warning-fg">Available</span>}
                                  </div>
                                  {judge.email && <p className="text-xs text-fg-muted mt-0.5">{judge.email}</p>}
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
                      desc={`No judge panel for ${selectedGender?.label} — ${selectedAgeGroup?.label}${selectedCompetitionType ? ` · ${selectedCompetitionType.label}` : ''}${selectedApparatus ? ` · ${selectedApparatus.label}` : ''}. Switch to "Add Judge" to staff one.`}
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
