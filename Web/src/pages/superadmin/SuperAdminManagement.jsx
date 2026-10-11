import {
  useState, useEffect, useCallback, useId,
  createContext, useContext, Children, isValidElement, cloneElement,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  Shield, UserPlus, Edit, Trash2, UserCheck, UserX, Trophy, Plus, X, Search, Save
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { superAdminAPI } from '@/services/api';
import { DATA_COLORS, FG, alpha } from '../../styles/tokens';
import { useResponsive } from '../../hooks/useResponsive';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import Dropdown from '@/components/auth/Dropdown';
import AddPlayerForm from '../../components/superadmin/AddPlayerForm';
import {
  getCompetitionPlayerFeeRupees, resolveFeeWindow, formatFeeWindowDate, FEE_PHASE,
} from '@/utils/scoring/competitionFee';
import { ALL_AGE_GROUPS, isAgeGroupValidForGender } from '../../hooks/useAgeGroups';
import { APPARATUS, offeredApparatus } from '@/utils/scoring/apparatus';
import { isApparatusAllowedForGender } from '@/utils/scoring/copRules';
import { TEAM_SIZE_OPTIONS } from '@/utils/scoring/teamSize';
import { COMPETITION_LEVELS, levelLabel } from '@/utils/competition/levels';
import { DarkCard, FadeIn, EmptyState, LoadingState, DarkBtn } from '@/components/admin/AdminKit';

/*
 * The three field wrappers below each drew a visible <label> that was never
 * tied to its control, so a screen reader announced every field on this screen
 * as an unnamed "edit text" / "combo box". One generated id links each pair;
 * an explicit `id` from the caller still wins.
 */
const useFieldId = (id) => {
  const autoId = useId();
  return id ?? autoId;
};

const DarkInput = ({ label, required, error, hint, id, ...props }) => {
  const inputId = useFieldId(id);
  return (
  <div>
    {label && (
      <label htmlFor={inputId} className="block type-tag mb-1.5 text-accent-fg">
        {label}{required && <span className="text-danger-fg"> *</span>}
      </label>
    )}
    <input
      id={inputId}
      className="w-full rounded-xl text-base mouse:text-sm text-ink placeholder-ink/30 min-h-[44px] transition-all duration-200"
      style={{ background: 'rgb(var(--ink) / 0.04)', border: `1px solid ${error ? alpha('rgb(var(--danger-fg))', 0x60) : 'var(--line-strong)'}`, padding: '0.625rem 0.875rem' }}
      onFocus={(e) => { e.target.style.borderColor = `${alpha('rgb(var(--accent))', 0x50)}`; e.target.style.boxShadow = `0 0 0 3px ${alpha('rgb(var(--accent))', 0x12)}`; }}
      onBlur={(e) => { e.target.style.borderColor = error ? alpha('rgb(var(--danger-fg))', 0x60) : 'var(--line-strong)'; e.target.style.boxShadow = 'none'; }}
      {...props}
    />
    {hint && <p className="text-xs mt-1 text-fg-muted">{hint}</p>}
    {error && <p className="text-xs mt-1 text-danger-fg">{error}</p>}
  </div>
  );
};

const DarkSelect = ({ label, required, children, id, ...props }) => {
  const selectId = useFieldId(id);
  return (
  <div>
    {label && (
      <label htmlFor={selectId} className="block type-tag mb-1.5 text-accent-fg">
        {label}{required && <span className="text-danger-fg"> *</span>}
      </label>
    )}
    <select
      id={selectId}
      className="w-full rounded-xl text-sm text-ink min-h-[44px] px-3 transition-all duration-200 bg-surface-sunken border border-line"
      {...props}>
      {children}
    </select>
  </div>
  );
};

const DarkTextarea = ({ label, required, id, ...props }) => {
  const textareaId = useFieldId(id);
  return (
  <div>
    {label && (
      <label htmlFor={textareaId} className="block type-tag mb-1.5 text-accent-fg">
        {label}{required && <span className="text-danger-fg"> *</span>}
      </label>
    )}
    <textarea
      id={textareaId}
      className="w-full rounded-xl text-base mouse:text-sm text-ink placeholder-ink/30 transition-all duration-200 resize-none"
      style={{ background: 'rgb(var(--ink) / 0.04)', border: `1px solid var(--line-strong)`, padding: '0.625rem 0.875rem' }}
      onFocus={(e) => { e.target.style.borderColor = `${alpha('rgb(var(--accent))', 0x50)}`; e.target.style.boxShadow = `0 0 0 3px ${alpha('rgb(var(--accent))', 0x12)}`; }}
      onBlur={(e) => { e.target.style.borderColor = 'var(--line-strong)'; e.target.style.boxShadow = 'none'; }}
      {...props}
    />
  </div>
  );
};

// ─── Competition fee window ───────────────────────────────────────────────────
/**
 * A stored date as the `YYYY-MM-DD` an `<input type="date">` wants.
 *
 * Sliced off the ISO string rather than read through the local-time getters:
 * these dates are stored as UTC midnight, and `getDate()` rolls the day
 * backwards for anyone west of Greenwich.
 *
 * @param {unknown} value
 * @returns {string}
 */
const toDateInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

/**
 * The `YYYY-MM-DD` one day earlier, for a date input's `max`.
 *
 * Both fee dates must land strictly BEFORE the start date, so capping the
 * picker at the start date itself would still offer one invalid day.
 *
 * @param {string} value - `YYYY-MM-DD`, or empty
 * @returns {string | undefined} undefined when there is nothing to cap against
 */
const previousDay = (value) => {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

/**
 * Check the opening date, fee deadline and late fee against each other.
 *
 * Mirrors `normalizeFeeWindow` in
 * `Server/src/services/user/super-admin.service.js` so the super admin is told
 * what is wrong here rather than by a 400 from the API. The server still has
 * the last word — this is a courtesy, not the guard.
 *
 * Plain string comparison is correct for `YYYY-MM-DD`.
 *
 * @param {Object} form
 * @returns {string | null} the first problem found, or null
 */
/** The two columns of the Competition Types & Apparatus picker. */
const GENDER_COLUMNS = [
  { gender: 'Male', label: 'Male', accent: DATA_COLORS.blue },
  { gender: 'Female', label: 'Female', accent: DATA_COLORS.pink },
];

const TYPE_LABELS = { competition_1: 'Competition I', competition_2: 'Competition II', competition_3: 'Competition III' };

/**
 * A stored meet's apparatus, per type and gender, for the edit form. A meet
 * saved before the gender split has only `apparatusConfig`, which applied to
 * both genders — so that is what the form starts from (less Hanging for women).
 */
const apparatusByGenderOf = (comp) => Object.fromEntries(
  (comp?.competitionTypes || []).map((type) => [type, {
    Male: offeredApparatus(comp, type, 'Male'),
    Female: offeredApparatus(comp, type, 'Female'),
  }])
);

/**
 * The per-gender apparatus for the types actually selected, the per-type union
 * the older readers use, and the first selected type that runs nothing at all.
 * The server derives the union itself; it is sent for older servers.
 */
const activeApparatus = ({ competitionTypes, apparatusByGender }) => {
  const byGender = {};
  const config = {};
  let missing = null;
  for (const type of competitionTypes) {
    const entry = apparatusByGender?.[type] || {};
    const male = APPARATUS.filter((a) => (entry.Male || []).includes(a));
    const female = APPARATUS.filter((a) => (entry.Female || []).includes(a) && isApparatusAllowedForGender(a, 'Female'));
    const union = APPARATUS.filter((a) => male.includes(a) || female.includes(a));
    if (union.length === 0 && !missing) missing = TYPE_LABELS[type] || type;
    byGender[type] = { Male: male, Female: female };
    config[type] = union;
  }
  return { apparatusByGender: byGender, apparatusConfig: config, missing };
};

const validateFeeWindow = ({ registrationOpenDate, feeDueDate, startDate, endDate, lateFee }) => {
  const amount = lateFee === '' || lateFee === undefined || lateFee === null ? 0 : Number(lateFee);
  if (!Number.isFinite(amount) || amount < 0) {
    return 'Enter a valid late fee (₹) — zero or more';
  }
  if (registrationOpenDate && feeDueDate && registrationOpenDate > feeDueDate) {
    return 'The last date to pay fees cannot be before the competition opening date';
  }
  /*
   * Both fee dates close BEFORE the meet opens.
   *
   * Money is settled in advance — a deadline that fell on or inside the
   * competition would leave a coach able to pay the base fee while their
   * athletes are already competing. `<` not `<=`: the day the meet starts is
   * itself too late.
   */
  if (registrationOpenDate && startDate && registrationOpenDate >= startDate) {
    return 'The competition opening date must be before the start date';
  }
  if (feeDueDate && startDate && feeDueDate >= startDate) {
    return 'The last date to pay fees must be before the start date';
  }
  if (feeDueDate && endDate && feeDueDate >= endDate) {
    return 'The last date to pay fees must be before the end date';
  }
  if (amount > 0 && !feeDueDate) {
    return 'Set a last date to pay fees before setting a late fee amount';
  }
  return null;
};

const StatusBadge = ({ active }) => (
  <span className="px-2.5 py-1 rounded-full text-xs font-bold"
    style={{ background: active ? `${alpha('rgb(var(--success-fg))', 0x20)}` : `${alpha('rgb(var(--danger-fg))', 0x20)}`, color: active ? FG.success : FG.danger }}>
    {active ? 'Active' : 'Inactive'}
  </span>
);

// ─── Dark Modal wrapper ───────────────────────────────────────────────────────
const DarkModal = ({ isOpen, onClose, title, subtitle, children, footer, maxWidth = 'max-w-md' }) => {
  const { isMobile } = useResponsive();
  useBodyScrollLock(isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal-overlay z-50 bg-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
          <div className={`w-full ${isMobile ? 'max-w-full' : maxWidth} max-h-[90vh] flex flex-col rounded-3xl border overflow-hidden modal-panel`} style={{ 
              background: 'rgb(var(--surface-raised))', 
              borderColor: 'var(--line)',
              margin: isMobile ? '0 0.5rem' : '0',
            }}>
            <div className="flex items-center justify-between border-b flex-shrink-0" 
              style={{ 
                borderColor: 'var(--line)',
                padding: isMobile ? '1rem' : '1.5rem',
              }}>
              <div>
                {subtitle && <p className="type-tag mb-0.5 text-accent-fg">{subtitle}</p>}
                <h3 className="font-black text-ink" style={{ fontSize: isMobile ? '1.125rem' : '1.25rem' }}>{title}</h3>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-ink/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close">
                <X className="w-5 h-5 text-ink/60" />
              </button>
            </div>
            {/*
              * `relative` is load-bearing, not decoration.
              *
              * Every checkbox in these forms hides its real `<input>` behind
              * Tailwind's `.sr-only`, which is `position: absolute`. An
              * absolutely positioned box ignores a scroll container that is
              * itself `position: static`, so each input was being placed
              * against the nearest positioned ancestor — `.modal-overlay` —
              * at the offset it would have had if this list had never been
              * scrolled. On a scrolled form that put the input hundreds of
              * pixels below the window while its visible tick box was in
              * plain sight. Clicking the label focuses that input, the
              * browser scrolls an ancestor to reveal it, and the overlay
              * jumped to the end of the dialog.
              *
              * Positioning the scroll box makes it the containing block, so
              * the input travels with the row it belongs to and focusing it
              * moves nothing.
              */}
            <div className="relative flex-1 overflow-y-auto space-y-4" style={{ padding: isMobile ? '1rem' : '1.5rem' }}>{children}</div>
            {footer && (
              <div className="flex gap-3 border-t flex-shrink-0" 
                style={{ 
                  borderColor: 'var(--line)',
                  padding: isMobile ? '1rem' : '1.5rem',
                  flexDirection: isMobile ? 'column' : 'row',
                }}>
                {footer}
              </div>
            )}
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ─── Table ────────────────────────────────────────────────────────────────────
/**
 * Column headers, so a stacked cell can label itself on mobile.
 *
 * The three tables on this screen are built from generic `<Td>`s that know
 * nothing about which column they are in. Rather than restate the headers at
 * every call site, `DarkTable` publishes them here and `DarkTr` hands each
 * child the matching one by position.
 */
const TableHeadersContext = createContext([]);

/**
 * A table that becomes a list of labelled cards below `md`.
 *
 * Nine columns of competition data cannot fit a 375px screen, and
 * `overflow-x-auto` alone left an organiser dragging sideways to reach the
 * Actions column — the only interactive one. The `stacked-table` class (see
 * tailwind.config.js) turns rows into cards and pairs every value with its
 * header, so nothing is dropped on mobile. Above `md` it is inert and the
 * table renders exactly as before.
 */
const DarkTable = ({ headers, children, empty, label }) => (
  <TableHeadersContext.Provider value={headers}>
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm stacked-table" role="table" aria-label={label}>
        <thead>
          <tr className="border-b border-line">
            {headers.map(h => (
              <th key={h} scope="col" className="px-4 py-3 text-left type-tag whitespace-nowrap text-fg-muted">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  </TableHeadersContext.Provider>
);

const DarkTr = ({ children, delay = 0 }) => {
  const headers = useContext(TableHeadersContext);
  return (
    <tr className="border-b border-line">
      {/*
        * `data-label` is what the stacked layout prints beside each value.
        * Injected by position rather than asked for at the call site, so the
        * labels cannot fall out of step with the header row above them.
        */}
      {Children.map(children, (child, i) =>
        isValidElement(child) ? cloneElement(child, { 'data-label': headers[i] }) : child
      )}
    </tr>
  );
};

const Td = ({ children, className = '', ...props }) => (
  // `whitespace-nowrap` only from `md`: keeping it on mobile is what forced the
  // sideways scroll these cards exist to remove.
  <td className={`px-4 py-3 md:whitespace-nowrap text-ink/70 ${className}`} {...props}>{children}</td>
);

// ─── Section Tab Bar ──────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'competitions', label: 'Competitions', icon: Trophy },
  { id: 'admins', label: 'Admins', icon: Shield },
  { id: 'coaches', label: 'Coaches', icon: UserCheck },
  { id: 'addPlayer', label: 'Add Player', icon: UserPlus },
];

// ─── Main Component ───────────────────────────────────────────────────────────
const SuperAdminManagement = () => {
  const [activeSection, setActiveSection] = useState('competitions');
  const [admins, setAdmins] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addPlayerFormKey, setAddPlayerFormKey] = useState(0);

  // Admin modal
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: { value: 'admin', label: 'Admin' } });

  // Competition modal
  const [showCompetitionModal, setShowCompetitionModal] = useState(false);
  const [editingCompetition, setEditingCompetition] = useState(null);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [competitionFormData, setCompetitionFormData] = useState({
    name: '', level: { value: 'district', label: 'District' }, competitionTypes: ['competition_1'], apparatusByGender: {},
    place: '', year: { value: new Date().getFullYear(), label: new Date().getFullYear().toString() }, startDate: '', endDate: '',
    description: '', admins: [], ageGroups: [], playerFee: '', apparatusFees: {}, maxTeamSize: null,
    registrationOpenDate: '', feeDueDate: '', lateFee: ''
  });

  // Admin management modal
  const [showAdminManagementModal, setShowAdminManagementModal] = useState(false);
  const [selectedCompetition, setSelectedCompetition] = useState(null);

  // Delete competition confirmation modal
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [competitionToDelete, setCompetitionToDelete] = useState(null);

  // Remove admin confirmation modal
  const [showRemoveAdminConfirmation, setShowRemoveAdminConfirmation] = useState(false);
  const [adminToRemove, setAdminToRemove] = useState(null);

  // Delete admin confirmation modal
  const [showDeleteAdminConfirmation, setShowDeleteAdminConfirmation] = useState(false);
  const [adminToDelete, setAdminToDelete] = useState(null);

  // Player form - removed, now using AddPlayerForm component
  const [playerFormData, setPlayerFormData] = useState({
    name: '', email: '', password: '', phone: '', dateOfBirth: '',
    gender: { value: 'Male', label: 'Male' }, teamId: null, competitionId: null, paymentStatus: { value: 'pending', label: 'Pending' }
  });

  // This grid offers every bracket and disables the pairings that do not
  // exist, so it needs both genders' brackets rather than one gender's list.
  const defaultAgeGroups = ALL_AGE_GROUPS;
  const ageGroupLabels = {
    Under10:'Under 10', Under12:'Under 12', Under14:'Under 14',
    Under16:'Under 16 (Girls)', Under18:'Under 18 (Boys)',
    Above16:'Above 16 (Girls)', Above18:'Above 18 (Boys)'
  };

  // The three confirmations below are written inline rather than through
  // `DarkModal`, so they do not inherit its lock and have to ask for one.
  useBodyScrollLock(showDeleteConfirmation || showRemoveAdminConfirmation || showDeleteAdminConfirmation);

  useEffect(() => { fetchData(); }, [activeSection]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeSection === 'admins') {
        const r = await superAdminAPI.getAllAdmins();
        // Handle nested response structure
        const responseData = r.data.data || r.data;
        const adminsArray = Array.isArray(responseData) ? responseData : (responseData.admins || []);
        setAdmins(adminsArray);
      } else if (activeSection === 'coaches') {
        const r = await superAdminAPI.getAllCoaches();
        // Handle nested response structure
        const responseData = r.data.data || r.data;
        const coachesArray = Array.isArray(responseData) ? responseData : (responseData.coaches || []);
        setCoaches(coachesArray);
      } else if (activeSection === 'competitions') {
        const [cr, ar] = await Promise.all([superAdminAPI.getAllCompetitions(), superAdminAPI.getAllAdmins()]);
        // Handle nested response structures
        const compData = cr.data.data || cr.data;
        const adminData = ar.data.data || ar.data;
        const competitionsArray = Array.isArray(compData) ? compData : (compData.competitions || []);
        const adminsArray = Array.isArray(adminData) ? adminData : (adminData.admins || []);
        setCompetitions(competitionsArray);
        setAdmins(adminsArray);
      } else if (activeSection === 'addPlayer') {
        const cr = await superAdminAPI.getAllCompetitions();
        // Handle nested response structures
        const compData = cr.data.data || cr.data;
        const competitionsArray = Array.isArray(compData) ? compData : (compData.competitions || []);
        setCompetitions(competitionsArray);
        // Don't fetch teams initially - they will be fetched when competition is selected
        setTeams([]);
      }
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  // Function to fetch teams based on competition selection
  const fetchTeamsByCompetition = useCallback(async (competitionId) => {
    try {
      const params = competitionId ? { competition: competitionId } : {};
      const tr = await superAdminAPI.getAllTeams(params);
      const teamData = tr.data.data || tr.data;
      const teamsArray = Array.isArray(teamData) ? teamData : (teamData.teams || []);
      setTeams(teamsArray);
      return teamsArray;
    } catch (error) {
      toast.error('Failed to load teams');
      return [];
    }
  }, []);

  const location = useLocation();
  useEffect(() => {
    const competitionId = location.state?.superadminPlayerAddedCompetitionId;
    if (!competitionId || activeSection !== 'addPlayer') return;
    fetchTeamsByCompetition(competitionId);
    setAddPlayerFormKey((k) => k + 1);
  }, [location.state, activeSection, fetchTeamsByCompetition]);

  // ─── Admin CRUD ────────────────────────────────────────────────────────────
  const handleAddAdmin = async (e) => {
    e.preventDefault();
    try {
      await superAdminAPI.createAdmin({ ...formData, role: formData.role.value });
      toast.success('Admin created');
      setShowAddAdminModal(false);
      setFormData({ name: '', email: '', password: '', role: { value: 'admin', label: 'Admin' } });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to create admin'); }
  };

  const handleUpdateAdmin = async (e) => {
    e.preventDefault();
    try {
      await superAdminAPI.updateAdmin(editingAdmin._id, { name: formData.name, email: formData.email, role: formData.role.value, isActive: formData.isActive });
      toast.success('Admin updated');
      setEditingAdmin(null);
      setFormData({ name: '', email: '', password: '', role: { value: 'admin', label: 'Admin' } });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update admin'); }
  };

  const handleDeleteAdmin = async (id) => {
    try { 
      await superAdminAPI.deleteAdmin(id); 
      toast.success('Admin deleted'); 
      setShowDeleteAdminConfirmation(false);
      setAdminToDelete(null);
      fetchData(); 
    }
    catch (err) { 
      toast.error(err.response?.data?.message || 'Failed to delete admin'); 
    }
  };

  const openDeleteAdminConfirmation = (admin) => {
    setAdminToDelete(admin);
    setShowDeleteAdminConfirmation(true);
  };

  const openEditModal = (admin) => {
    setEditingAdmin(admin);
    const roleOption = admin.role === 'superadmin' 
      ? { value: 'superadmin', label: 'Super Admin' }
      : { value: 'admin', label: 'Admin' };
    setFormData({ name: admin.name, email: admin.email, password: '', role: roleOption, isActive: admin.isActive });
  };

  // ─── Coach ─────────────────────────────────────────────────────────────────
  const handleToggleCoachStatus = async (id, current) => {
    try {
      await superAdminAPI.updateCoachStatus(id, { isActive: !current });
      toast.success(`Coach ${!current ? 'activated' : 'deactivated'}`);
      fetchData();
    } catch { toast.error('Failed to update coach status'); }
  };

  // ─── Competition CRUD ──────────────────────────────────────────────────────
  const resetCompetitionForm = () => setCompetitionFormData({
    name: '', level: { value: 'district', label: 'District' }, competitionTypes: ['competition_1'], apparatusByGender: {},
    place: '', year: { value: new Date().getFullYear(), label: new Date().getFullYear().toString() }, startDate: '', endDate: '',
    description: '', admins: [], ageGroups: [], playerFee: '', apparatusFees: {}, maxTeamSize: null,
    registrationOpenDate: '', feeDueDate: '', lateFee: ''
  });

  const openCompetitionModal = (comp = null) => {
    if (comp) {
      setEditingCompetition(comp);
      const levelOption = { value: comp.level, label: levelLabel(comp.level) };
      const yearOption = { 
        value: comp.year || new Date().getFullYear(), 
        label: (comp.year || new Date().getFullYear()).toString() 
      };
      setCompetitionFormData({
        name: comp.name, level: levelOption, competitionTypes: comp.competitionTypes || [], apparatusByGender: apparatusByGenderOf(comp),
        place: comp.place, year: yearOption,
        startDate: comp.startDate.split('T')[0], endDate: comp.endDate.split('T')[0],
        description: comp.description || '', admins: comp.admins.map(a => a._id),
        ageGroups: comp.ageGroups || [], playerFee: Number.isFinite(Number(comp.playerFee)) ? Number(comp.playerFee) : '', apparatusFees: comp.apparatusFees || {},
        maxTeamSize: comp.maxTeamSize ?? null,
        registrationOpenDate: toDateInputValue(comp.registrationOpenDate),
        feeDueDate: toDateInputValue(comp.feeDueDate),
        lateFee: Number.isFinite(Number(comp.lateFee)) && Number(comp.lateFee) > 0 ? Number(comp.lateFee) : ''
      });
    } else { setEditingCompetition(null); resetCompetitionForm(); }
    setAdminSearchQuery('');
    setShowCompetitionModal(true);
  };

  const handleCreateCompetition = async (e) => {
    e.preventDefault();
    if (!competitionFormData.admins.length) { toast.error('Assign at least one admin'); return; }
    if (!competitionFormData.ageGroups.length) { toast.error('Select at least one age group'); return; }
    if (!competitionFormData.competitionTypes.length) { toast.error('Select at least one competition type'); return; }
    const { apparatusByGender: activeApparatusByGender, apparatusConfig: activeApparatusConfig, missing } =
      activeApparatus(competitionFormData);
    if (missing) {
      toast.error(`Select at least one apparatus for ${missing}`);
      return;
    }
    if (!competitionFormData.maxTeamSize) {
      toast.error('Select the max team size per age group (4 or 6 players)');
      return;
    }
    if (competitionFormData.playerFee === '' || competitionFormData.playerFee === undefined) {
      toast.error('Enter a per-player fee (INR) for this competition');
      return;
    }
    const playerFee = Number(competitionFormData.playerFee);
    if (!Number.isFinite(playerFee) || playerFee < 0) {
      toast.error('Enter a valid per-player fee (INR) for this competition');
      return;
    }
    const feeWindowError = validateFeeWindow(competitionFormData);
    if (feeWindowError) { toast.error(feeWindowError); return; }
    try {
      await superAdminAPI.createCompetition({
        ...competitionFormData,
        apparatusConfig: activeApparatusConfig,
        apparatusByGender: activeApparatusByGender,
        level: competitionFormData.level.value,
        year: competitionFormData.year.value,
        playerFee,
        maxTeamSize: competitionFormData.maxTeamSize,
        apparatusFees: competitionFormData.apparatusFees,
        registrationOpenDate: competitionFormData.registrationOpenDate || null,
        feeDueDate: competitionFormData.feeDueDate || null,
        lateFee: competitionFormData.lateFee === '' ? 0 : Number(competitionFormData.lateFee)
      });
      toast.success('Competition created');
      setShowCompetitionModal(false); resetCompetitionForm(); fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to create competition'); }
  };

  const handleUpdateCompetition = async (e) => {
    e.preventDefault();
    if (!competitionFormData.competitionTypes.length) { toast.error('Select at least one competition type'); return; }
    const { apparatusByGender: activeApparatusByGender, apparatusConfig: activeApparatusConfig, missing } =
      activeApparatus(competitionFormData);
    if (missing) {
      toast.error(`Select at least one apparatus for ${missing}`);
      return;
    }
    if (!competitionFormData.maxTeamSize) {
      toast.error('Select the max team size per age group (4 or 6 players)');
      return;
    }
    if (competitionFormData.playerFee === '' || competitionFormData.playerFee === undefined) {
      toast.error('Enter a per-player fee (INR) for this competition');
      return;
    }
    const playerFee = Number(competitionFormData.playerFee);
    if (!Number.isFinite(playerFee) || playerFee < 0) {
      toast.error('Enter a valid per-player fee (INR) for this competition');
      return;
    }
    const feeWindowError = validateFeeWindow(competitionFormData);
    if (feeWindowError) { toast.error(feeWindowError); return; }
    try {
      await superAdminAPI.updateCompetition(editingCompetition._id, {
        name: competitionFormData.name, level: competitionFormData.level.value,
        competitionTypes: competitionFormData.competitionTypes, apparatusConfig: activeApparatusConfig,
        apparatusByGender: activeApparatusByGender, place: competitionFormData.place,
        startDate: competitionFormData.startDate, endDate: competitionFormData.endDate,
        description: competitionFormData.description, ageGroups: competitionFormData.ageGroups,
        playerFee,
        maxTeamSize: competitionFormData.maxTeamSize,
        apparatusFees: competitionFormData.apparatusFees,
        // `null` rather than omitted: an emptied date must CLEAR the stored one,
        // and a key that is absent from the body is left alone by the service.
        registrationOpenDate: competitionFormData.registrationOpenDate || null,
        feeDueDate: competitionFormData.feeDueDate || null,
        lateFee: competitionFormData.lateFee === '' ? 0 : Number(competitionFormData.lateFee)
      });
      toast.success('Competition updated');
      setShowCompetitionModal(false); setEditingCompetition(null); resetCompetitionForm(); fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update competition'); }
  };

  const handleDeleteCompetition = async (id) => {
    try { 
      await superAdminAPI.deleteCompetition(id); 
      toast.success('Competition deleted'); 
      setShowDeleteConfirmation(false);
      setCompetitionToDelete(null);
      fetchData(); 
    }
    catch (err) { 
      toast.error(err.response?.data?.message || 'Failed to delete competition'); 
    }
  };

  const openDeleteConfirmation = (comp) => {
    setCompetitionToDelete(comp);
    setShowDeleteConfirmation(true);
  };

  const toggleCompetitionType = (type) => setCompetitionFormData(prev => ({
    ...prev, competitionTypes: prev.competitionTypes.includes(type)
      ? prev.competitionTypes.filter(t => t !== type)
      : [...prev.competitionTypes, type]
  }));

  const toggleGenderApparatus = (type, gender, app) => setCompetitionFormData(prev => {
    const forType = prev.apparatusByGender[type] || { Male: [], Female: [] };
    const current = forType[gender] || [];
    const next = current.includes(app) ? current.filter(a => a !== app) : [...current, app];
    return {
      ...prev,
      apparatusByGender: { ...prev.apparatusByGender, [type]: { ...forType, [gender]: next } },
    };
  });

  const toggleAgeGroup = (ag, gender) => setCompetitionFormData(prev => {
    const groups = [...prev.ageGroups];
    const idx = groups.findIndex(g => g.ageGroup === ag && g.gender === gender);
    if (idx >= 0) groups.splice(idx, 1); else groups.push({ ageGroup: ag, gender });
    return { ...prev, ageGroups: groups };
  });

  /**
   * The late-fee field is only meaningful once there is a deadline to be late
   * for, so the hint says which of the two states it is in rather than letting
   * a super admin type an amount that can never be charged.
   */
  const lateFeeHint = competitionFormData.feeDueDate
    ? `Added per athlete on top of the base fee for any payment made after ${competitionFormData.feeDueDate}`
      + `, up to 23:59 on the end date. Leave blank or 0 for no penalty.`
    : 'Set a "Last Date to Pay Fees" above first — with no deadline there is nothing to be late for.';

  const isAgeGroupSelected = (ag, gender) => competitionFormData.ageGroups.some(g => g.ageGroup === ag && g.gender === gender);

  /**
   * Every gender/age-group pair that actually exists.
   *
   * The grid offers all fourteen cells and disables the ones a gender does not
   * compete in — Under 16 is a girls' bracket, Under 18 a boys' one. "Select
   * all" has to mean all the REAL pairs, not all the cells, or it would post
   * categories no athlete can be entered for and the server would reject them.
   */
  const allValidAgeGroupPairs = defaultAgeGroups.flatMap(ageGroup =>
    ['Male', 'Female']
      .filter(gender => isAgeGroupValidForGender(ageGroup, gender))
      .map(gender => ({ ageGroup, gender }))
  );

  const allAgeGroupsSelected =
    competitionFormData.ageGroups.length >= allValidAgeGroupPairs.length
    && allValidAgeGroupPairs.every(({ ageGroup, gender }) => isAgeGroupSelected(ageGroup, gender));

  const toggleAllAgeGroups = () => setCompetitionFormData(prev => ({
    ...prev,
    ageGroups: allAgeGroupsSelected ? [] : allValidAgeGroupPairs.map(pair => ({ ...pair })),
  }));

  const toggleAdminSelection = (id) => setCompetitionFormData(prev => ({
    ...prev, admins: prev.admins.includes(id) ? prev.admins.filter(a => a !== id) : [...prev.admins, id]
  }));

  // ─── Admin management modal ────────────────────────────────────────────────
  const openAdminManagementModal = (comp) => { setSelectedCompetition(comp); setShowAdminManagementModal(true); };

  const handleAssignAdmin = async (adminId) => {
    try {
      await superAdminAPI.assignAdminToCompetition(selectedCompetition._id, { adminId });
      toast.success('Admin assigned');
      const r = await superAdminAPI.getCompetitionById(selectedCompetition._id);
      // Handle nested response structure
      const responseData = r.data.data || r.data;
      setSelectedCompetition(responseData.competition || responseData);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to assign admin'); }
  };

  const handleRemoveAdmin = async (adminId) => {
    try {
      await superAdminAPI.removeAdminFromCompetition(selectedCompetition._id, adminId);
      toast.success('Admin removed');
      const r = await superAdminAPI.getCompetitionById(selectedCompetition._id);
      // Handle nested response structure
      const responseData = r.data.data || r.data;
      setSelectedCompetition(responseData.competition || responseData);
      setShowRemoveAdminConfirmation(false);
      setAdminToRemove(null);
      fetchData();
    } catch (err) { 
      toast.error(err.response?.data?.message || 'Failed to remove admin'); 
    }
  };

  const openRemoveAdminConfirmation = (admin) => {
    setAdminToRemove(admin);
    setShowRemoveAdminConfirmation(true);
  };

  // ─── Add Player ────────────────────────────────────────────────────────────
  // Removed - now handled by AddPlayerForm component
  const handlePlayerAdded = (playerData) => {
    // Show success message
    toast.success(`Player added successfully!`);
    
    // Refresh teams list for the competition that was used
    if (activeSection === 'addPlayer' && playerData?.competitionId) {
      fetchTeamsByCompetition(playerData.competitionId);
    }
  };

  const filteredAdmins = (admins || []).filter(a => a.role !== 'superadmin').filter(a => {
    if (!adminSearchQuery) return true;
    const q = adminSearchQuery.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
  });

  const compTypeLabel = (t) => ({ competition_1:'Competition I', competition_2:'Competition II', competition_3:'Competition III' }[t] || t);
  const levelColor = (l) => ({
    district: FG.info,
    state: DATA_COLORS.violet,
    national: FG.brand,
    international: FG.brandGold,
    dso: FG.success,
    university: 'rgb(var(--accent-fg))',
  }[l] || FG.brand);
  const statusColor = (s) => ({ ongoing: FG.success, upcoming: FG.brandGold, completed: 'var(--fg-muted)' }[s] || 'var(--fg-muted)');

  return (
    <div className="space-y-6">
      {/* ─── Section Tabs ──────────────────────────────────────────────── */}
      <FadeIn>
        <DarkCard className="p-2">
          <div className="flex gap-1 overflow-x-auto">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = activeSection === s.id;
              return (
                <button key={s.id} onClick={() => setActiveSection(s.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap min-h-[44px] transition-all duration-200 ${isActive ? 'text-ink' : 'text-fg-muted hover:text-ink'}`} style={{
                    background: isActive ? `${alpha('rgb(var(--accent))', 0x18)}` : 'transparent',
                    border: `1px solid ${isActive ? alpha('rgb(var(--accent))', 0x30) : 'transparent'}`,
                  }}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {s.label}
                </button>
              );
            })}
          </div>
        </DarkCard>
      </FadeIn>

      {/* ─── Competitions ──────────────────────────────────────────────── */}
      {activeSection === 'competitions' && (
        <FadeIn>
          <DarkCard className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="type-tag mb-0.5 text-accent-fg">Management</p>
                <h2 className="type-display-m text-fg">Competitions</h2>
              </div>
              <DarkBtn onClick={() => openCompetitionModal()}>
                <Plus className="w-4 h-4" /> Create
              </DarkBtn>
            </div>
            {loading ? <LoadingState /> : competitions.length === 0 ? (
              <EmptyState icon={Trophy} title="No competitions yet" desc="Create your first competition to get started." />
            ) : (
              <DarkTable label="Competitions" headers={['Name','Types','Level','Place','Per player','Fee window','Dates','Status','Admins','Actions']}>
                {competitions.map((comp, i) => (
                  <DarkTr key={comp._id} delay={i * 0.03}>
                    <Td className="font-bold text-ink">{comp.name}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {(comp.competitionTypes || []).map(t => (
                          <span key={t} className="px-2 py-0.5 rounded-full text-xs font-bold"
                            style={{ background: `${alpha('rgb(var(--accent))', 0x20)}`, color: 'rgb(var(--accent-fg))' }}>
                            {compTypeLabel(t)}
                          </span>
                        ))}
                      </div>
                    </Td>
                    <Td>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{ background: `${alpha(levelColor(comp.level), 0x20)}`, color: levelColor(comp.level) }}>
                        {levelLabel(comp.level)}
                      </span>
                    </Td>
                    <Td>{comp.place}</Td>
                    <Td className="text-sm font-semibold text-ink/80">
                      {(() => {
                        const rupees = getCompetitionPlayerFeeRupees(comp);
                        return rupees !== null ? `₹${rupees.toLocaleString()}` : '—';
                      })()}
                    </Td>
                    <Td className="text-xs">
                      {(() => {
                        const lateFee = Number(comp.lateFee) || 0;
                        if (!comp.registrationOpenDate && !comp.feeDueDate && !lateFee) {
                          return <span className="text-fg-muted">Always open</span>;
                        }
                        const window = resolveFeeWindow(comp);
                        const phaseColor = window.phase === FEE_PHASE.LATE ? FG.danger
                          : window.phase === FEE_PHASE.REGULAR ? FG.success
                            : FG.brand;
                        return (
                          <div className="space-y-0.5">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                              style={{ background: `${alpha(phaseColor, 0x20)}`, color: phaseColor }}>
                              {{
                                [FEE_PHASE.NOT_OPEN]: 'Not open yet',
                                [FEE_PHASE.REGULAR]: 'Base fee',
                                [FEE_PHASE.LATE]: 'Late fee',
                                [FEE_PHASE.CLOSED]: 'Closed',
                              }[window.phase]}
                            </span>
                            {comp.registrationOpenDate && (
                              <p className="text-fg-muted">Opens {formatFeeWindowDate(comp.registrationOpenDate)}</p>
                            )}
                            {comp.feeDueDate && (
                              <p className="text-fg-muted">Base until {formatFeeWindowDate(comp.feeDueDate)}</p>
                            )}
                            {lateFee > 0 && (
                              <p className="text-fg-muted">then +₹{lateFee.toLocaleString()}/athlete</p>
                            )}
                          </div>
                        );
                      })()}
                    </Td>
                    <Td className="text-xs">
                      {new Date(comp.startDate).toLocaleDateString()} – {new Date(comp.endDate).toLocaleDateString()}
                    </Td>
                    <Td>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold capitalize"
                        style={{ background: `${alpha(statusColor(comp.status), 0x20)}`, color: statusColor(comp.status) }}>
                        {comp.status}
                      </span>
                    </Td>
                    <Td>
                      <div className="space-y-0.5">
                        {comp.admins?.length ? comp.admins.map(a => (
                          <p key={a._id} className="text-xs text-ink/60">{a.name}</p>
                        )) : <span className="text-xs text-fg-muted">None</span>}
                      </div>
                    </Td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openAdminManagementModal(comp)} className="p-1.5 rounded-lg hover:bg-ink/10 transition-colors tap-safe mouse:min-h-[32px] mouse:min-w-[32px] flex items-center justify-center text-success-fg" title="Manage Admins" aria-label="Manage Admins">
                          <UserPlus className="w-4 h-4" />
                        </button>
                        <button onClick={() => openCompetitionModal(comp)} className="p-1.5 rounded-lg hover:bg-ink/10 transition-colors tap-safe mouse:min-h-[32px] mouse:min-w-[32px] flex items-center justify-center text-info-fg" title="Edit" aria-label="Edit">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => openDeleteConfirmation(comp)} className="p-1.5 rounded-lg hover:bg-ink/10 transition-colors tap-safe mouse:min-h-[32px] mouse:min-w-[32px] flex items-center justify-center text-danger-fg" title="Delete" aria-label="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </DarkTr>
                ))}
              </DarkTable>
            )}
          </DarkCard>
        </FadeIn>
      )}

      {/* ─── Admins ────────────────────────────────────────────────────── */}
      {activeSection === 'admins' && (
        <FadeIn>
          <DarkCard className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="type-tag mb-0.5 text-accent-fg">Management</p>
                <h2 className="type-display-m text-fg">Admins</h2>
              </div>
              <DarkBtn onClick={() => setShowAddAdminModal(true)}>
                <UserPlus className="w-4 h-4" /> Add Admin
              </DarkBtn>
            </div>
            {loading ? <LoadingState /> : admins.length === 0 ? (
              <EmptyState icon={Shield} title="No admins yet" desc="Create your first admin to get started." />
            ) : (
              <DarkTable label="Admins" headers={['Name','Email','Role','Status','Actions']}>
                {admins.map((admin, i) => (
                  <DarkTr key={admin._id} delay={i * 0.03}>
                    <Td className="font-semibold text-ink">{admin.name}</Td>
                    <Td>{admin.email}</Td>
                    <Td>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{ background: admin.role === 'superadmin' ? `${alpha('rgb(var(--accent))', 0x20)}` : `${alpha('rgb(var(--info-fg))', 0x20)}`, color: admin.role === 'superadmin' ? FG.brand : FG.info }}>
                        {admin.role === 'superadmin' ? 'Super Admin' : 'Admin'}
                      </span>
                    </Td>
                    <Td><StatusBadge active={admin.isActive} /></Td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEditModal(admin)} className="p-1.5 rounded-lg hover:bg-ink/10 tap-safe mouse:min-h-[32px] mouse:min-w-[32px] flex items-center justify-center text-info-fg" title="Edit" aria-label="Edit">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => openDeleteAdminConfirmation(admin)} className="p-1.5 rounded-lg hover:bg-ink/10 tap-safe mouse:min-h-[32px] mouse:min-w-[32px] flex items-center justify-center text-danger-fg" title="Delete" aria-label="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </DarkTr>
                ))}
              </DarkTable>
            )}
          </DarkCard>
        </FadeIn>
      )}

      {/* ─── Coaches ───────────────────────────────────────────────────── */}
      {activeSection === 'coaches' && (
        <FadeIn>
          <DarkCard className="p-6">
            <div className="mb-6">
              <p className="type-tag mb-0.5 text-accent-fg">Management</p>
              <h2 className="type-display-m text-fg">Coaches</h2>
            </div>
            {loading ? <LoadingState /> : coaches.length === 0 ? (
              <EmptyState icon={UserCheck} title="No coaches yet" desc="Coaches will appear here once registered." />
            ) : (
              <DarkTable label="Coaches" headers={['Name','Email','Phone','Status','Actions']}>
                {coaches.map((coach, i) => (
                  <DarkTr key={coach._id} delay={i * 0.03}>
                    <Td className="font-semibold text-ink">{coach.name}</Td>
                    <Td>{coach.email}</Td>
                    <Td>{coach.phone || '—'}</Td>
                    <Td><StatusBadge active={coach.isActive} /></Td>
                    <td className="px-4 py-3">
                      <DarkBtn size="sm" variant={coach.isActive ? 'danger' : 'success'}
                        onClick={() => handleToggleCoachStatus(coach._id, coach.isActive)}>
                        {coach.isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        {coach.isActive ? 'Deactivate' : 'Activate'}
                      </DarkBtn>
                    </td>
                  </DarkTr>
                ))}
              </DarkTable>
            )}
          </DarkCard>
        </FadeIn>
      )}

      {/* ─── Add Player ────────────────────────────────────────────────── */}
      {activeSection === 'addPlayer' && (
        <FadeIn>
          <DarkCard className="p-6">
            <div className="mb-6">
              <p className="type-tag mb-0.5 text-accent-fg">Management</p>
              <h2 className="type-display-m text-fg">Add Player to Team</h2>
            </div>
            <AddPlayerForm 
              key={addPlayerFormKey}
              teams={teams} 
              competitions={competitions} 
              onSuccess={handlePlayerAdded}
              onFetchTeams={fetchTeamsByCompetition}
            />
          </DarkCard>
        </FadeIn>
      )}

      {/* ─── Add/Edit Admin Modal ──────────────────────────────────────── */}
      <DarkModal
        isOpen={showAddAdminModal || !!editingAdmin}
        onClose={() => { setShowAddAdminModal(false); setEditingAdmin(null); setFormData({ name:'',email:'',password:'',role:{ value: 'admin', label: 'Admin' } }); }}
        title={editingAdmin ? 'Edit Admin' : 'Add New Admin'}
        subtitle="Admin Management"
        footer={<>
          <DarkBtn variant="ghost" className="flex-1" onClick={() => { setShowAddAdminModal(false); setEditingAdmin(null); setFormData({ name:'',email:'',password:'',role:{ value: 'admin', label: 'Admin' } }); }}>Cancel</DarkBtn>
          <DarkBtn variant="primary" className="flex-1" onClick={editingAdmin ? handleUpdateAdmin : handleAddAdmin} type="submit">
            <Save className="w-4 h-4" /> {editingAdmin ? 'Update' : 'Create'}
          </DarkBtn>
        </>}>
        <form id="admin-form" onSubmit={editingAdmin ? handleUpdateAdmin : handleAddAdmin} className="space-y-4">
          <DarkInput label="Name" required placeholder="Admin name" value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          <DarkInput label="Email" required type="email" placeholder="admin@example.com" value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          {!editingAdmin && (
            <DarkInput label="Password" required type="password" placeholder="Password" value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
          )}
          <Dropdown 
            label="Role" 
            options={[
              { value: 'admin', label: 'Admin' },
              { value: 'superadmin', label: 'Super Admin' }
            ]}
            value={formData.role}
            onChange={(option) => setFormData({ ...formData, role: option })}
            placeholder="Select role"
          />
          {editingAdmin && (
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input type="checkbox" className="sr-only" checked={formData.isActive || false}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} />
                <div className="w-10 h-6 rounded-full transition-colors duration-200"
                  style={{ background: formData.isActive ? 'rgb(var(--success-fg))' : 'rgb(var(--ink) / 0.15)' }}>
                  <div className="w-4 h-4 bg-snow rounded-full absolute top-1 transition-transform duration-200"
                    style={{ left: formData.isActive ? '22px' : '4px' }} />
                </div>
              </div>
              <span className="text-sm font-semibold text-ink/70">Active</span>
            </label>
          )}
        </form>
      </DarkModal>

      {/* ─── Create/Edit Competition Modal ────────────────────────────── */}
      <DarkModal
        isOpen={showCompetitionModal}
        onClose={() => { setShowCompetitionModal(false); setEditingCompetition(null); resetCompetitionForm(); }}
        title={editingCompetition ? 'Edit Competition' : 'Create Competition'}
        subtitle="Competition Management"
        maxWidth="max-w-2xl"
        footer={<>
          <DarkBtn variant="ghost" className="flex-1" onClick={() => { setShowCompetitionModal(false); setEditingCompetition(null); resetCompetitionForm(); }}>Cancel</DarkBtn>
          <DarkBtn variant="primary" className="flex-1" onClick={editingCompetition ? handleUpdateCompetition : handleCreateCompetition}>
            <Save className="w-4 h-4" /> {editingCompetition ? 'Update' : 'Create'}
          </DarkBtn>
        </>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DarkInput label="Competition Name" required placeholder="Name" value={competitionFormData.name}
            onChange={(e) => setCompetitionFormData({ ...competitionFormData, name: e.target.value })} />
          <Dropdown 
            label="Level" 
            // From the shared level list, so a level added there (DSO,
            // University) can be given to a meet without touching this form.
            options={COMPETITION_LEVELS.map((value) => ({ value, label: levelLabel(value) }))}
            value={competitionFormData.level}
            onChange={(option) => setCompetitionFormData({ ...competitionFormData, level: option })}
            placeholder="Select level"
          />
          <DarkInput label="Place" required placeholder="City / Venue" value={competitionFormData.place}
            onChange={(e) => setCompetitionFormData({ ...competitionFormData, place: e.target.value })} />
          <Dropdown 
            label="Year" 
            options={Array.from({ length: 10 }, (_, i) => {
              const year = new Date().getFullYear() - 2 + i;
              return { value: year, label: year.toString() };
            })}
            value={competitionFormData.year}
            onChange={(option) => setCompetitionFormData({ ...competitionFormData, year: option })}
            placeholder="Select year"
          />
          {/*
            * Chronological order: registration opens, fees fall due, then the
            * meet runs. Both fee dates have to land before the meet starts, so
            * reading them in the order they happen is also the order they are
            * filled in — and the pickers below cap themselves at the day before
            * the start date, so an invalid day cannot be chosen in the first
            * place.
            */}
          <DarkInput label="Competition Opening Date" type="date"
            value={competitionFormData.registrationOpenDate}
            hint="Coaches cannot pay before this day. Must be before the start date. Leave blank to accept payment straight away."
            max={previousDay(competitionFormData.startDate)}
            onChange={(e) => setCompetitionFormData({ ...competitionFormData, registrationOpenDate: e.target.value })} />
          <DarkInput label="Last Date to Pay Fees" type="date"
            value={competitionFormData.feeDueDate}
            hint="Last day the base fee alone is accepted. Must be before the start date. Leave blank for no late fee."
            min={competitionFormData.registrationOpenDate || undefined}
            max={previousDay(competitionFormData.startDate)}
            onChange={(e) => setCompetitionFormData({ ...competitionFormData, feeDueDate: e.target.value })} />
          <DarkInput label="Start Date" required type="date" value={competitionFormData.startDate}
            onChange={(e) => setCompetitionFormData({ ...competitionFormData, startDate: e.target.value })} />
          <DarkInput label="End Date" required type="date" value={competitionFormData.endDate}
            min={competitionFormData.startDate || undefined}
            onChange={(e) => setCompetitionFormData({ ...competitionFormData, endDate: e.target.value })} />
        </div>

        {/* Player Fee */}
        <DarkInput 
          label="BASE FEE (Per-player ₹)" 
          required 
          type="number" 
          min="0"
          step="1"
          placeholder="e.g. 500" 
          value={competitionFormData.playerFee === '' || competitionFormData.playerFee === undefined ? '' : competitionFormData.playerFee}
          hint="This is the default per-player entry fee. Apparatus-wise fees (below) will be added on top of this amount."
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              setCompetitionFormData({ ...competitionFormData, playerFee: '' });
              return;
            }
            const n = Number(raw);
            setCompetitionFormData({ ...competitionFormData, playerFee: Number.isFinite(n) ? n : '' });
          }}
        />

        {/* Late Fee */}
        <DarkInput
          label="LATE FEE (Per-player ₹)"
          type="number"
          min="0"
          step="1"
          placeholder="e.g. 200"
          value={competitionFormData.lateFee === '' || competitionFormData.lateFee === undefined ? '' : competitionFormData.lateFee}
          hint={lateFeeHint}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              setCompetitionFormData({ ...competitionFormData, lateFee: '' });
              return;
            }
            const n = Number(raw);
            setCompetitionFormData({ ...competitionFormData, lateFee: Number.isFinite(n) ? n : '' });
          }}
        />

        {/* Apparatus Fees (Optional) */}
        <div>
          <p className="type-tag mb-3 text-accent-fg">
            APPARATUS-WISE FEES (Optional)
          </p>
          <div className="space-y-3 p-4 rounded-xl border bg-surface-sunken border-line">
            <p className="text-xs text-fg-muted mb-4 leading-relaxed">
              Enter any additional fees for specific apparatuses here. These will be <strong>added on top</strong> of the base per-player fee. Leave blank for no additional charge.
            </p>
            {['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'].map(app => (
              <DarkInput
                key={app}
                label={`${app} Fee (₹)`}
                type="number"
                min="0"
                step="1"
                placeholder={`Base fee applied if blank`}
                value={competitionFormData.apparatusFees?.[app] ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  setCompetitionFormData(prev => {
                    const newFees = { ...(prev.apparatusFees || {}) };
                    if (raw === '') {
                      delete newFees[app];
                    } else {
                      const n = Number(raw);
                      if (Number.isFinite(n)) newFees[app] = n;
                    }
                    return { ...prev, apparatusFees: newFees };
                  });
                }}
              />
            ))}
          </div>
        </div>

        {/* Max Team Size — per team, per gender + age group */}
        <div>
          <p className="type-tag mb-3 text-accent-fg">
            Max Team Size (per age group) <span className="text-danger-fg">*</span>
          </p>
          <div role="radiogroup" aria-label="Max team size per age group" className="grid grid-cols-2 gap-3">
            {TEAM_SIZE_OPTIONS.map((option) => {
              const checked = competitionFormData.maxTeamSize === option.value;
              return (
                <label key={option.value}
                  className="flex flex-col gap-0.5 p-3 rounded-xl border cursor-pointer transition-all duration-200 min-h-[44px]"
                  style={{
                    background: checked ? `${alpha('rgb(var(--accent))', 0x14)}` : 'rgb(var(--ink) / 0.02)',
                    borderColor: checked ? 'rgb(var(--accent))' : 'var(--line)',
                  }}>
                  <input type="radio" name="maxTeamSize" className="sr-only" checked={checked}
                    onChange={() => setCompetitionFormData(prev => ({ ...prev, maxTeamSize: option.value }))} />
                  <span className="text-sm font-bold text-ink">{option.value} Players</span>
                  <span className="text-xs text-fg-muted">Best {option.counted} scores count per apparatus</span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-fg-muted mt-2">
            A coach can enter at most this many athletes per age group, and the Team Championship counts the best {TEAM_SIZE_OPTIONS.map(o => o.counted).join(' / ')}.
          </p>
        </div>

        {/* Competition Types & Apparatus */}
        <div>
          <p className="type-tag mb-3 text-accent-fg">
            Competition Types & Apparatus <span className="text-danger-fg">*</span>
          </p>
          <div className="space-y-4">
            {[
              { id: 'competition_1', label: 'Competition I', desc: 'Team Championship & Qualifier' },
              { id: 'competition_2', label: 'Competition II', desc: 'All Round Individual Final' },
              { id: 'competition_3', label: 'Competition III', desc: 'Apparatus Championship' },
            ].map(ct => {
              const checked = competitionFormData.competitionTypes.includes(ct.id);
              return (
                <div key={ct.id} className="p-3 rounded-xl border transition-all duration-200"
                  style={{ background: checked ? `${alpha('rgb(var(--accent))', 0x08)}` : 'rgb(var(--ink) / 0.02)', borderColor: checked ? `${alpha('rgb(var(--accent))', 0x40)}` : 'var(--line)' }}>
                  <label className="flex items-start gap-3 cursor-pointer mb-2">
                    <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleCompetitionType(ct.id)} />
                    <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
                      style={{ background: checked ? 'rgb(var(--accent))' : 'transparent', borderColor: checked ? 'rgb(var(--accent))' : 'rgb(var(--ink) / 0.3)' }}>
                      {checked && <svg className="w-2.5 h-2.5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink">{ct.label}</p>
                      <p className="text-xs text-fg-muted">{ct.desc}</p>
                    </div>
                  </label>
                  
                  {checked && (
                    /* Male on the left, Female on the right: each gender runs
                       its own apparatus in each competition type. */
                    <div className="ml-7 mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {GENDER_COLUMNS.map(({ gender, label, accent }) => (
                        <div key={gender} className="pl-3 border-l-2 space-y-2" style={{ borderColor: `${alpha(accent, 0x50)}` }}>
                          <p className="text-[10px] font-bold tracking-wider uppercase mb-1" style={{ color: accent }}>{label}</p>
                          {APPARATUS.map(app => {
                            const allowed = isApparatusAllowedForGender(app, gender);
                            const appChecked = allowed && (competitionFormData.apparatusByGender[ct.id]?.[gender] || []).includes(app);
                            return (
                              <label key={app} className={`flex items-center gap-2 ${allowed ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
                                title={allowed ? undefined : "Not part of the women's events (COP §11)"}>
                                <input type="checkbox" className="sr-only" checked={appChecked} disabled={!allowed}
                                  onChange={() => toggleGenderApparatus(ct.id, gender, app)} />
                                <div className="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-all"
                                  style={{ background: appChecked ? 'rgb(var(--accent))' : 'transparent', borderColor: appChecked ? 'rgb(var(--accent))' : 'rgb(var(--ink) / 0.3)' }}>
                                  {appChecked && <svg className="w-2 h-2 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <span className="text-xs font-semibold text-ink/80">{app}</span>
                              </label>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>



        <DarkTextarea label="Description" placeholder="Optional description…" rows={3} value={competitionFormData.description}
          onChange={(e) => setCompetitionFormData({ ...competitionFormData, description: e.target.value })} />

        {/* Age Groups */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="type-tag text-accent-fg">
              Age Groups <span className="text-danger-fg">*</span>
            </p>
            {/* Fourteen cells is a lot of clicking for the common case, which is
                "run every category". Clicking it again clears the lot. */}
            <label className="flex items-center gap-2 p-2 -mr-2 rounded-lg cursor-pointer transition-all tap-safe">
              <input type="checkbox" className="sr-only" checked={allAgeGroupsSelected} onChange={toggleAllAgeGroups} />
              <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all"
                style={{ background: allAgeGroupsSelected ? 'rgb(var(--accent))' : 'transparent', borderColor: allAgeGroupsSelected ? 'rgb(var(--accent))' : 'rgb(var(--ink) / 0.3)' }}>
                {allAgeGroupsSelected && <svg className="w-2.5 h-2.5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </div>
              <span className="text-xs font-bold text-ink/70 whitespace-nowrap">
                Select All ({competitionFormData.ageGroups.length}/{allValidAgeGroupPairs.length})
              </span>
            </label>
          </div>
          {/* `relative` for the same reason as the dialog body: this list
              scrolls, so the `.sr-only` inputs inside it need it as their
              containing block or they stay behind when it moves. */}
          <div className="relative space-y-2 max-h-56 overflow-y-auto pr-1">
            {defaultAgeGroups.map(ag => (
              <div key={ag} className="p-3 rounded-xl border bg-surface-sunken border-line">
                <p className="text-xs font-bold text-ink/60 mb-2">{ageGroupLabels[ag]}</p>
                <div className="grid grid-cols-2 gap-2">
                  {['Male','Female'].map(gender => {
                    const valid = isAgeGroupValidForGender(ag, gender);
                    const checked = isAgeGroupSelected(ag, gender);
                    return (
                      <label key={gender} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${!valid ? 'opacity-30 cursor-not-allowed' : ''}`}
                        style={{ background: checked && valid ? `${alpha('rgb(var(--accent))', 0x12)}` : 'transparent' }}>
                        <input type="checkbox" className="sr-only" checked={checked} disabled={!valid} onChange={() => valid && toggleAgeGroup(ag, gender)} />
                        <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all"
                          style={{ background: checked && valid ? 'rgb(var(--accent))' : 'transparent', borderColor: checked && valid ? 'rgb(var(--accent))' : 'rgb(var(--ink) / 0.3)' }}>
                          {checked && valid && <svg className="w-2.5 h-2.5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <span className="text-xs font-semibold text-ink/70">{gender}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Assign Admins (create only) */}
        {!editingCompetition && (
          <div>
            <p className="type-tag mb-3 text-accent-fg">
              Assign Admins <span className="text-danger-fg">*</span>
            </p>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-fg-muted" />
              <input type="text" placeholder="Search admins…" aria-label="Search admins" value={adminSearchQuery}
                onChange={(e) => setAdminSearchQuery(e.target.value)}
                className="w-full rounded-xl text-base mouse:text-sm text-ink placeholder-ink/30 min-h-[44px] transition-all"
                style={{ background: 'rgb(var(--ink) / 0.04)', border: `1px solid var(--line-strong)`, paddingLeft: '2.5rem', paddingRight: '1rem', paddingTop: '0.625rem', paddingBottom: '0.625rem' }} />
            </div>
            <div className="relative space-y-1 max-h-40 overflow-y-auto">
              {filteredAdmins.map(admin => {
                const checked = competitionFormData.admins.includes(admin._id);
                return (
                  <label key={admin._id} className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all"
                    style={{ background: checked ? `${alpha('rgb(var(--accent))', 0x10)}` : 'transparent' }}>
                    <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleAdminSelection(admin._id)} />
                    <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all"
                      style={{ background: checked ? 'rgb(var(--accent))' : 'transparent', borderColor: checked ? 'rgb(var(--accent))' : 'rgb(var(--ink) / 0.3)' }}>
                      {checked && <svg className="w-2.5 h-2.5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <span className="text-sm text-ink/70">{admin.name} <span className="text-fg-muted">({admin.email})</span></span>
                  </label>
                );
              })}
              {filteredAdmins.length === 0 && <p className="text-sm text-fg-muted p-2">No admins found.</p>}
            </div>
          </div>
        )}
      </DarkModal>

      {/* ─── Admin Management Modal ────────────────────────────────────── */}
      <DarkModal
        isOpen={showAdminManagementModal && !!selectedCompetition}
        onClose={() => { setShowAdminManagementModal(false); setSelectedCompetition(null); }}
        title={`Manage Admins — ${selectedCompetition?.name || ''}`}
        subtitle="Competition Admins"
        maxWidth="max-w-lg">
        {selectedCompetition && (
          <div className="space-y-4">
            <div>
              <p className="type-tag mb-3 text-accent-fg">Assigned Admins</p>
              {selectedCompetition.admins?.length ? (
                <div className="space-y-2">
                  {selectedCompetition.admins.map(admin => (
                    <div key={admin._id} className="flex items-center justify-between p-3 rounded-xl border bg-surface-sunken border-line">
                      <div>
                        <p className="text-sm font-bold text-ink">{admin.name}</p>
                        <p className="text-xs text-fg-muted">{admin.email}</p>
                      </div>
                      <DarkBtn size="sm" variant="danger" onClick={() => openRemoveAdminConfirmation(admin)}>
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </DarkBtn>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-fg-muted">No admins assigned.</p>}
            </div>
            <div>
              <p className="type-tag mb-3 text-accent-fg">Available Admins</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(admins || []).filter(a => a.role !== 'superadmin' && !selectedCompetition.admins?.find(sa => sa._id === a._id)).map(admin => (
                  <div key={admin._id} className="flex items-center justify-between p-3 rounded-xl border bg-surface-sunken border-line">
                    <div>
                      <p className="text-sm font-bold text-ink">{admin.name}</p>
                      <p className="text-xs text-fg-muted">{admin.email}</p>
                    </div>
                    <DarkBtn size="sm" variant="success" onClick={() => handleAssignAdmin(admin._id)}>
                      <UserPlus className="w-3.5 h-3.5" /> Assign
                    </DarkBtn>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DarkModal>

      {/* Delete Competition Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirmation && competitionToDelete && (
          <div className="modal-overlay z-50">
            <div className="absolute inset-0 bg-scrim" onClick={() => setShowDeleteConfirmation(false)}/>
            <div className="relative w-full max-w-md rounded-3xl border overflow-hidden modal-panel bg-surface-overlay border-line">
              <div className="p-6">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-danger-tint">
                  <Trash2 className="w-7 h-7 text-danger-fg" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-black text-ink text-center mb-3">Delete Competition?</h3>
                <div className="space-y-3 mb-6">
                  <div className="p-4 rounded-xl bg-danger-tint border border-line">
                    <p className="text-sm text-ink/80 leading-relaxed">
                      ⚠️ <strong>Warning:</strong> This action <strong>cannot be undone</strong>.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-surface-sunken border border-line">
                    <p className="text-sm text-ink/70 leading-relaxed mb-2">
                      You are about to delete:
                    </p>
                    <p className="text-base font-bold text-ink">
                      {competitionToDelete.name}
                    </p>
                    <p className="text-xs text-fg-muted mt-1">
                      {competitionToDelete.place} • {new Date(competitionToDelete.startDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-surface-sunken border border-line">
                    <p className="text-sm text-ink/70 leading-relaxed">
                      All associated data including <strong>teams, players, scores, and registrations</strong> will be permanently deleted.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => handleDeleteCompetition(competitionToDelete._id)}
                    className="w-full py-3 rounded-xl font-bold text-ink min-h-[44px] transition-all hover:brightness-110 bg-danger-fill text-danger-on">
                    Yes, Delete Competition
                  </button>
                  <button 
                    onClick={() => {
                      setShowDeleteConfirmation(false);
                      setCompetitionToDelete(null);
                    }}
                    className="w-full py-3 rounded-xl text-ink/60 hover:text-ink/80 border transition-colors min-h-[44px] border-line">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Remove Admin Confirmation Modal */}
      <AnimatePresence>
        {showRemoveAdminConfirmation && adminToRemove && (
          <div className="modal-overlay z-50">
            <div className="absolute inset-0 bg-scrim" onClick={() => setShowRemoveAdminConfirmation(false)}/>
            <div className="relative w-full max-w-md rounded-3xl border overflow-hidden modal-panel bg-surface-overlay border-line">
              <div className="p-6">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-danger-tint">
                  <UserX className="w-7 h-7 text-danger-fg" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-black text-ink text-center mb-3">Remove Admin?</h3>
                <div className="space-y-3 mb-6">
                  <div className="p-4 rounded-xl bg-danger-tint border border-line">
                    <p className="text-sm text-ink/80 leading-relaxed">
                      ⚠️ <strong>Warning:</strong> This admin will lose access to this competition.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-surface-sunken border border-line">
                    <p className="text-sm text-ink/70 leading-relaxed mb-2">
                      You are about to remove:
                    </p>
                    <p className="text-base font-bold text-ink">
                      {adminToRemove.name}
                    </p>
                    <p className="text-xs text-fg-muted mt-1">
                      {adminToRemove.email}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-surface-sunken border border-line">
                    <p className="text-sm text-ink/70 leading-relaxed">
                      From competition: <strong>{selectedCompetition?.name}</strong>
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => handleRemoveAdmin(adminToRemove._id)}
                    className="w-full py-3 rounded-xl font-bold text-ink min-h-[44px] transition-all hover:brightness-110 bg-danger-fill text-danger-on">
                    Yes, Remove Admin
                  </button>
                  <button 
                    onClick={() => {
                      setShowRemoveAdminConfirmation(false);
                      setAdminToRemove(null);
                    }}
                    className="w-full py-3 rounded-xl text-ink/60 hover:text-ink/80 border transition-colors min-h-[44px] border-line">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Admin Confirmation Modal */}
      <AnimatePresence>
        {showDeleteAdminConfirmation && adminToDelete && (
          <div className="modal-overlay z-50">
            <div className="absolute inset-0 bg-scrim" onClick={() => setShowDeleteAdminConfirmation(false)}/>
            <div className="relative w-full max-w-md rounded-3xl border overflow-hidden modal-panel bg-surface-overlay border-line">
              <div className="p-6">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-danger-tint">
                  <Trash2 className="w-7 h-7 text-danger-fg" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-black text-ink text-center mb-3">Delete Admin Account?</h3>
                <div className="space-y-3 mb-6">
                  <div className="p-4 rounded-xl bg-danger-tint border border-line">
                    <p className="text-sm text-ink/80 leading-relaxed">
                      ⚠️ <strong>Warning:</strong> This action <strong>cannot be undone</strong>.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-surface-sunken border border-line">
                    <p className="text-sm text-ink/70 leading-relaxed mb-2">
                      You are about to delete:
                    </p>
                    <p className="text-base font-bold text-ink">
                      {adminToDelete.name}
                    </p>
                    <p className="text-xs text-fg-muted mt-1">
                      {adminToDelete.email}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-surface-sunken border border-line">
                    <p className="text-sm text-ink/70 leading-relaxed">
                      This admin will be <strong>permanently removed</strong> from the system and lose access to all competitions.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => handleDeleteAdmin(adminToDelete._id)}
                    className="w-full py-3 rounded-xl font-bold text-ink min-h-[44px] transition-all hover:brightness-110 bg-danger-fill text-danger-on">
                    Yes, Delete Admin
                  </button>
                  <button 
                    onClick={() => {
                      setShowDeleteAdminConfirmation(false);
                      setAdminToDelete(null);
                    }}
                    className="w-full py-3 rounded-xl text-ink/60 hover:text-ink/80 border transition-colors min-h-[44px] border-line">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SuperAdminManagement;
