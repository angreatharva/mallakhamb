import { useState, useEffect, useRef } from 'react';
import {
  Shield, UserPlus, Edit, Trash2, UserCheck, UserX, Trophy, Plus, X, Search,
  ChevronDown, Save, Users
} from 'lucide-react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import toast from 'react-hot-toast';
import { superAdminAPI } from '../../services/api';
import { ADMIN_COLORS, ADMIN_EASE_OUT } from '../admin/adminTheme';
import { useResponsive } from '../../hooks/useResponsive';

// ─── Reduced-motion hook ──────────────────────────────────────────────────────
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

const DarkInput = ({ label, required, error, hint, ...props }) => (
  <div>
    {label && (
      <label className="block text-xs font-bold tracking-wide uppercase mb-1.5" style={{ color: ADMIN_COLORS.saffronLight }}>
        {label}{required && <span style={{ color: ADMIN_COLORS.red }}> *</span>}
      </label>
    )}
    <input
      className="w-full rounded-xl text-sm text-white placeholder-white/30 outline-none min-h-[44px] transition-all duration-200"
      style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${error ? ADMIN_COLORS.red + '60' : ADMIN_COLORS.darkBorderMid}`, padding: '0.625rem 0.875rem' }}
      onFocus={(e) => { e.target.style.borderColor = `${ADMIN_COLORS.saffron}50`; e.target.style.boxShadow = `0 0 0 3px ${ADMIN_COLORS.saffron}12`; }}
      onBlur={(e) => { e.target.style.borderColor = error ? ADMIN_COLORS.red + '60' : ADMIN_COLORS.darkBorderMid; e.target.style.boxShadow = 'none'; }}
      {...props}
    />
    {hint && <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{hint}</p>}
    {error && <p className="text-xs mt-1" style={{ color: ADMIN_COLORS.red }}>{error}</p>}
  </div>
);

const DarkSelect = ({ label, required, children, ...props }) => (
  <div>
    {label && (
      <label className="block text-xs font-bold tracking-wide uppercase mb-1.5" style={{ color: ADMIN_COLORS.saffronLight }}>
        {label}{required && <span style={{ color: ADMIN_COLORS.red }}> *</span>}
      </label>
    )}
    <select
      className="w-full rounded-xl text-sm text-white outline-none min-h-[44px] px-3 transition-all duration-200"
      style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${ADMIN_COLORS.darkBorderMid}` }}
      {...props}>
      {children}
    </select>
  </div>
);

const DarkTextarea = ({ label, required, ...props }) => (
  <div>
    {label && (
      <label className="block text-xs font-bold tracking-wide uppercase mb-1.5" style={{ color: ADMIN_COLORS.saffronLight }}>
        {label}{required && <span style={{ color: ADMIN_COLORS.red }}> *</span>}
      </label>
    )}
    <textarea
      className="w-full rounded-xl text-sm text-white placeholder-white/30 outline-none transition-all duration-200 resize-none"
      style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${ADMIN_COLORS.darkBorderMid}`, padding: '0.625rem 0.875rem' }}
      onFocus={(e) => { e.target.style.borderColor = `${ADMIN_COLORS.saffron}50`; e.target.style.boxShadow = `0 0 0 3px ${ADMIN_COLORS.saffron}12`; }}
      onBlur={(e) => { e.target.style.borderColor = ADMIN_COLORS.darkBorderMid; e.target.style.boxShadow = 'none'; }}
      {...props}
    />
  </div>
);

const DarkBtn = ({ children, onClick, disabled, variant = 'primary', size = 'md', type = 'button', className = '' }) => {
  const bg = {
    primary: `linear-gradient(135deg, ${ADMIN_COLORS.saffron}, ${ADMIN_COLORS.saffronDark})`,
    purple: `linear-gradient(135deg, ${ADMIN_COLORS.purple}, ${ADMIN_COLORS.purpleDark})`,
    success: `linear-gradient(135deg, ${ADMIN_COLORS.green}, #16A34A)`,
    danger: `linear-gradient(135deg, ${ADMIN_COLORS.red}, #DC2626)`,
    ghost: 'transparent',
  }[variant];
  const h = size === 'sm' ? '32px' : '44px';
  return (
    <motion.button type={type} onClick={onClick} disabled={disabled}
      className={`rounded-xl font-bold text-sm text-white flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      style={{ background: bg, border: variant === 'ghost' ? `1px solid ${ADMIN_COLORS.darkBorderSubtle}` : 'none', minHeight: h, padding: size === 'sm' ? '0 0.75rem' : '0 1.25rem' }}
      whileHover={!disabled ? { scale: 1.02, filter: 'brightness(1.1)' } : {}}
      whileTap={!disabled ? { scale: 0.97 } : {}}>
      {children}
    </motion.button>
  );
};

const LoadingState = () => (
  <div className="flex items-center justify-center py-12 gap-3">
    <div className="w-5 h-5 border-2 border-white/10 rounded-full animate-spin" style={{ borderTopColor: ADMIN_COLORS.saffron }} />
    <span className="text-white/40 text-sm">Loading…</span>
  </div>
);

const EmptyState = ({ icon: Icon, title, desc }) => (
  <div className="text-center py-12">
    <Icon className="w-12 h-12 mx-auto mb-3 text-white/15" />
    <p className="text-white/60 font-semibold">{title}</p>
    {desc && <p className="text-white/30 text-sm mt-1">{desc}</p>}
  </div>
);

const StatusBadge = ({ active }) => (
  <span className="px-2.5 py-1 rounded-full text-xs font-bold"
    style={{ background: active ? `${ADMIN_COLORS.green}20` : `${ADMIN_COLORS.red}20`, color: active ? ADMIN_COLORS.green : ADMIN_COLORS.red }}>
    {active ? 'Active' : 'Inactive'}
  </span>
);

// ─── Dark Modal wrapper ───────────────────────────────────────────────────────
const DarkModal = ({ isOpen, onClose, title, subtitle, children, footer, maxWidth = 'max-w-md' }) => {
  const { isMobile } = useResponsive();
  
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div className={`w-full ${isMobile ? 'max-w-full' : maxWidth} max-h-[90vh] flex flex-col rounded-3xl border overflow-hidden`}
            style={{ 
              background: ADMIN_COLORS.darkElevated, 
              borderColor: ADMIN_COLORS.darkBorderSubtle,
              margin: isMobile ? '0 0.5rem' : '0',
            }}
            initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }} transition={{ duration: 0.25, ease: ADMIN_EASE_OUT }}>
            <div className="flex items-center justify-between border-b flex-shrink-0" 
              style={{ 
                borderColor: ADMIN_COLORS.darkBorderSubtle,
                padding: isMobile ? '1rem' : '1.5rem',
              }}>
              <div>
                {subtitle && <p className="text-xs font-bold tracking-widest uppercase mb-0.5" style={{ color: ADMIN_COLORS.saffron }}>{subtitle}</p>}
                <h3 className="font-black text-white" style={{ fontSize: isMobile ? '1.125rem' : '1.25rem' }}>{title}</h3>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close">
                <X className="w-5 h-5 text-white/60" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4" style={{ padding: isMobile ? '1rem' : '1.5rem' }}>{children}</div>
            {footer && (
              <div className="flex gap-3 border-t flex-shrink-0" 
                style={{ 
                  borderColor: ADMIN_COLORS.darkBorderSubtle,
                  padding: isMobile ? '1rem' : '1.5rem',
                  flexDirection: isMobile ? 'column' : 'row',
                }}>
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─── Table ────────────────────────────────────────────────────────────────────
const DarkTable = ({ headers, children, empty }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm" role="table">
      <thead>
        <tr style={{ borderBottom: `1px solid ${ADMIN_COLORS.darkBorderSubtle}` }}>
          {headers.map(h => (
            <th key={h} className="px-4 py-3 text-left text-xs font-bold tracking-widest uppercase whitespace-nowrap"
              style={{ color: 'rgba(255,255,255,0.35)' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
    {empty}
  </div>
);

const DarkTr = ({ children, delay = 0 }) => (
  <motion.tr style={{ borderBottom: `1px solid ${ADMIN_COLORS.darkBorderSubtle}` }}
    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.3 }}>
    {children}
  </motion.tr>
);

const Td = ({ children, className = '' }) => (
  <td className={`px-4 py-3 whitespace-nowrap text-white/70 ${className}`}>{children}</td>
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

  // Admin modal
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'admin' });

  // Competition modal
  const [showCompetitionModal, setShowCompetitionModal] = useState(false);
  const [editingCompetition, setEditingCompetition] = useState(null);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [competitionFormData, setCompetitionFormData] = useState({
    name: '', level: 'district', competitionTypes: ['competition_1'],
    place: '', year: new Date().getFullYear(), startDate: '', endDate: '',
    description: '', admins: [], ageGroups: []
  });

  // Admin management modal
  const [showAdminManagementModal, setShowAdminManagementModal] = useState(false);
  const [selectedCompetition, setSelectedCompetition] = useState(null);

  // Player form
  const [playerFormData, setPlayerFormData] = useState({
    name: '', email: '', password: '', phone: '', dateOfBirth: '',
    gender: 'Male', teamId: '', competitionId: '', paymentStatus: 'pending'
  });

  const defaultAgeGroups = ['Under10','Under12','Under14','Under16','Under18','Above16','Above18'];
  const ageGroupLabels = {
    Under10:'Under 10', Under12:'Under 12', Under14:'Under 14',
    Under16:'Under 16 (Girls)', Under18:'Under 18 (Boys)',
    Above16:'Above 16 (Girls)', Above18:'Above 18 (Boys)'
  };

  useEffect(() => { fetchData(); }, [activeSection]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeSection === 'admins') {
        const r = await superAdminAPI.getAllAdmins();
        setAdmins(r.data.admins);
      } else if (activeSection === 'coaches') {
        const r = await superAdminAPI.getAllCoaches();
        setCoaches(r.data.coaches);
      } else if (activeSection === 'competitions') {
        const [cr, ar] = await Promise.all([superAdminAPI.getAllCompetitions(), superAdminAPI.getAllAdmins()]);
        setCompetitions(cr.data.competitions);
        setAdmins(ar.data.admins);
      } else if (activeSection === 'addPlayer') {
        const [cr, tr] = await Promise.all([superAdminAPI.getAllCompetitions(), superAdminAPI.getAllTeams()]);
        setCompetitions(cr.data.competitions);
        setTeams(tr.data.teams || []);
      }
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  // ─── Admin CRUD ────────────────────────────────────────────────────────────
  const handleAddAdmin = async (e) => {
    e.preventDefault();
    try {
      await superAdminAPI.createAdmin(formData);
      toast.success('Admin created');
      setShowAddAdminModal(false);
      setFormData({ name: '', email: '', password: '', role: 'admin' });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to create admin'); }
  };

  const handleUpdateAdmin = async (e) => {
    e.preventDefault();
    try {
      await superAdminAPI.updateAdmin(editingAdmin._id, { name: formData.name, email: formData.email, role: formData.role, isActive: formData.isActive });
      toast.success('Admin updated');
      setEditingAdmin(null);
      setFormData({ name: '', email: '', password: '', role: 'admin' });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update admin'); }
  };

  const handleDeleteAdmin = async (id) => {
    if (!window.confirm('Delete this admin?')) return;
    try { await superAdminAPI.deleteAdmin(id); toast.success('Admin deleted'); fetchData(); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed to delete admin'); }
  };

  const openEditModal = (admin) => {
    setEditingAdmin(admin);
    setFormData({ name: admin.name, email: admin.email, password: '', role: admin.role, isActive: admin.isActive });
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
    name: '', level: 'district', competitionTypes: ['competition_1'],
    place: '', year: new Date().getFullYear(), startDate: '', endDate: '',
    description: '', admins: [], ageGroups: []
  });

  const openCompetitionModal = (comp = null) => {
    if (comp) {
      setEditingCompetition(comp);
      setCompetitionFormData({
        name: comp.name, level: comp.level, competitionTypes: comp.competitionTypes || [],
        place: comp.place, year: comp.year || new Date().getFullYear(),
        startDate: comp.startDate.split('T')[0], endDate: comp.endDate.split('T')[0],
        description: comp.description || '', admins: comp.admins.map(a => a._id),
        ageGroups: comp.ageGroups || []
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
    try {
      await superAdminAPI.createCompetition(competitionFormData);
      toast.success('Competition created');
      setShowCompetitionModal(false); resetCompetitionForm(); fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to create competition'); }
  };

  const handleUpdateCompetition = async (e) => {
    e.preventDefault();
    if (!competitionFormData.competitionTypes.length) { toast.error('Select at least one competition type'); return; }
    try {
      await superAdminAPI.updateCompetition(editingCompetition._id, {
        name: competitionFormData.name, level: competitionFormData.level,
        competitionTypes: competitionFormData.competitionTypes, place: competitionFormData.place,
        startDate: competitionFormData.startDate, endDate: competitionFormData.endDate,
        description: competitionFormData.description, ageGroups: competitionFormData.ageGroups
      });
      toast.success('Competition updated');
      setShowCompetitionModal(false); setEditingCompetition(null); resetCompetitionForm(); fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update competition'); }
  };

  const handleDeleteCompetition = async (id) => {
    if (!window.confirm('Delete this competition? This cannot be undone.')) return;
    try { await superAdminAPI.deleteCompetition(id); toast.success('Competition deleted'); fetchData(); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed to delete competition'); }
  };

  const toggleCompetitionType = (type) => setCompetitionFormData(prev => ({
    ...prev, competitionTypes: prev.competitionTypes.includes(type)
      ? prev.competitionTypes.filter(t => t !== type)
      : [...prev.competitionTypes, type]
  }));

  const toggleAgeGroup = (ag, gender) => setCompetitionFormData(prev => {
    const groups = [...prev.ageGroups];
    const idx = groups.findIndex(g => g.ageGroup === ag && g.gender === gender);
    if (idx >= 0) groups.splice(idx, 1); else groups.push({ ageGroup: ag, gender });
    return { ...prev, ageGroups: groups };
  });

  const isAgeGroupSelected = (ag, gender) => competitionFormData.ageGroups.some(g => g.ageGroup === ag && g.gender === gender);
  const isAgeGroupValidForGender = (ag, gender) => gender === 'Male'
    ? ['Under10','Under12','Under14','Under18','Above18'].includes(ag)
    : ['Under10','Under12','Under14','Under16','Above16'].includes(ag);
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
      setSelectedCompetition(r.data.competition);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to assign admin'); }
  };

  const handleRemoveAdmin = async (adminId) => {
    if (!window.confirm('Remove this admin from the competition?')) return;
    try {
      await superAdminAPI.removeAdminFromCompetition(selectedCompetition._id, adminId);
      toast.success('Admin removed');
      const r = await superAdminAPI.getCompetitionById(selectedCompetition._id);
      setSelectedCompetition(r.data.competition);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to remove admin'); }
  };

  // ─── Add Player ────────────────────────────────────────────────────────────
  const handleAddPlayer = async (e) => {
    e.preventDefault();
    if (!playerFormData.competitionId) { toast.error('Select a competition'); return; }
    if (!playerFormData.teamId) { toast.error('Select a team'); return; }
    try {
      await superAdminAPI.addPlayerToTeam({ ...playerFormData, team: playerFormData.teamId, competition: playerFormData.competitionId });
      toast.success('Player added');
      setPlayerFormData({ name:'',email:'',password:'',phone:'',dateOfBirth:'',gender:'Male',teamId:'',competitionId:'',paymentStatus:'pending' });
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to add player'); }
  };

  const filteredAdmins = admins.filter(a => a.role !== 'super_admin').filter(a => {
    if (!adminSearchQuery) return true;
    const q = adminSearchQuery.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
  });

  const compTypeLabel = (t) => ({ competition_1:'Competition I', competition_2:'Competition II', competition_3:'Competition III' }[t] || t);
  const levelColor = (l) => ({ district: ADMIN_COLORS.blue, state: ADMIN_COLORS.purple, national: ADMIN_COLORS.saffron, international: ADMIN_COLORS.gold }[l] || ADMIN_COLORS.saffron);
  const statusColor = (s) => ({ ongoing: ADMIN_COLORS.green, upcoming: ADMIN_COLORS.gold, completed: 'rgba(255,255,255,0.4)' }[s] || 'rgba(255,255,255,0.4)');

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
                <motion.button key={s.id} onClick={() => setActiveSection(s.id)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap min-h-[44px] transition-all duration-200"
                  style={{
                    background: isActive ? `${ADMIN_COLORS.saffron}18` : 'transparent',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                    border: `1px solid ${isActive ? ADMIN_COLORS.saffron + '30' : 'transparent'}`,
                  }}
                  whileHover={{ color: '#fff' }}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {s.label}
                </motion.button>
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
                <p className="text-xs font-bold tracking-widest uppercase mb-0.5" style={{ color: ADMIN_COLORS.saffron }}>Management</p>
                <h2 className="text-2xl font-black text-white">Competitions</h2>
              </div>
              <DarkBtn onClick={() => openCompetitionModal()}>
                <Plus className="w-4 h-4" /> Create
              </DarkBtn>
            </div>
            {loading ? <LoadingState /> : competitions.length === 0 ? (
              <EmptyState icon={Trophy} title="No competitions yet" desc="Create your first competition to get started." />
            ) : (
              <DarkTable headers={['Name','Types','Level','Place','Dates','Status','Admins','Actions']}>
                {competitions.map((comp, i) => (
                  <DarkTr key={comp._id} delay={i * 0.03}>
                    <Td className="font-bold text-white">{comp.name}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {(comp.competitionTypes || []).map(t => (
                          <span key={t} className="px-2 py-0.5 rounded-full text-xs font-bold"
                            style={{ background: `${ADMIN_COLORS.purple}20`, color: ADMIN_COLORS.purpleLight }}>
                            {compTypeLabel(t)}
                          </span>
                        ))}
                      </div>
                    </Td>
                    <Td>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold capitalize"
                        style={{ background: `${levelColor(comp.level)}20`, color: levelColor(comp.level) }}>
                        {comp.level}
                      </span>
                    </Td>
                    <Td>{comp.place}</Td>
                    <Td className="text-xs">
                      {new Date(comp.startDate).toLocaleDateString()} – {new Date(comp.endDate).toLocaleDateString()}
                    </Td>
                    <Td>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold capitalize"
                        style={{ background: `${statusColor(comp.status)}20`, color: statusColor(comp.status) }}>
                        {comp.status}
                      </span>
                    </Td>
                    <Td>
                      <div className="space-y-0.5">
                        {comp.admins?.length ? comp.admins.map(a => (
                          <p key={a._id} className="text-xs text-white/60">{a.name}</p>
                        )) : <span className="text-xs text-white/30">None</span>}
                      </div>
                    </Td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <motion.button onClick={() => openAdminManagementModal(comp)}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                          style={{ color: ADMIN_COLORS.green }} title="Manage Admins"
                          whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                          <UserPlus className="w-4 h-4" />
                        </motion.button>
                        <motion.button onClick={() => openCompetitionModal(comp)}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                          style={{ color: ADMIN_COLORS.blue }} title="Edit"
                          whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                          <Edit className="w-4 h-4" />
                        </motion.button>
                        <motion.button onClick={() => handleDeleteCompetition(comp._id)}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                          style={{ color: ADMIN_COLORS.red }} title="Delete"
                          whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
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
                <p className="text-xs font-bold tracking-widest uppercase mb-0.5" style={{ color: ADMIN_COLORS.saffron }}>Management</p>
                <h2 className="text-2xl font-black text-white">Admins</h2>
              </div>
              <DarkBtn onClick={() => setShowAddAdminModal(true)}>
                <UserPlus className="w-4 h-4" /> Add Admin
              </DarkBtn>
            </div>
            {loading ? <LoadingState /> : (
              <DarkTable headers={['Name','Email','Role','Status','Actions']}>
                {admins.map((admin, i) => (
                  <DarkTr key={admin._id} delay={i * 0.03}>
                    <Td className="font-semibold text-white">{admin.name}</Td>
                    <Td>{admin.email}</Td>
                    <Td>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{ background: admin.role === 'super_admin' ? `${ADMIN_COLORS.saffron}20` : `${ADMIN_COLORS.blue}20`, color: admin.role === 'super_admin' ? ADMIN_COLORS.saffron : ADMIN_COLORS.blue }}>
                        {admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                      </span>
                    </Td>
                    <Td><StatusBadge active={admin.isActive} /></Td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <motion.button onClick={() => openEditModal(admin)}
                          className="p-1.5 rounded-lg hover:bg-white/10 min-h-[32px] min-w-[32px] flex items-center justify-center"
                          style={{ color: ADMIN_COLORS.blue }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                          <Edit className="w-4 h-4" />
                        </motion.button>
                        <motion.button onClick={() => handleDeleteAdmin(admin._id)}
                          className="p-1.5 rounded-lg hover:bg-white/10 min-h-[32px] min-w-[32px] flex items-center justify-center"
                          style={{ color: ADMIN_COLORS.red }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
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
              <p className="text-xs font-bold tracking-widest uppercase mb-0.5" style={{ color: ADMIN_COLORS.saffron }}>Management</p>
              <h2 className="text-2xl font-black text-white">Coaches</h2>
            </div>
            {loading ? <LoadingState /> : (
              <DarkTable headers={['Name','Email','Phone','Status','Actions']}>
                {coaches.map((coach, i) => (
                  <DarkTr key={coach._id} delay={i * 0.03}>
                    <Td className="font-semibold text-white">{coach.name}</Td>
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
              <p className="text-xs font-bold tracking-widest uppercase mb-0.5" style={{ color: ADMIN_COLORS.saffron }}>Management</p>
              <h2 className="text-2xl font-black text-white">Add Player to Team</h2>
            </div>
            <form onSubmit={handleAddPlayer} className="max-w-2xl space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DarkInput label="Player Name" required placeholder="Full name" value={playerFormData.name}
                  onChange={(e) => setPlayerFormData({ ...playerFormData, name: e.target.value })} />
                <DarkInput label="Email" required type="email" placeholder="email@example.com" value={playerFormData.email}
                  onChange={(e) => setPlayerFormData({ ...playerFormData, email: e.target.value })} />
                <DarkInput label="Password" required type="password" placeholder="Min 6 characters" minLength={6} value={playerFormData.password}
                  onChange={(e) => setPlayerFormData({ ...playerFormData, password: e.target.value })} />
                <DarkInput label="Phone" type="tel" placeholder="Phone number" value={playerFormData.phone}
                  onChange={(e) => setPlayerFormData({ ...playerFormData, phone: e.target.value })} />
                <DarkInput label="Date of Birth" required type="date" value={playerFormData.dateOfBirth}
                  onChange={(e) => setPlayerFormData({ ...playerFormData, dateOfBirth: e.target.value })} />
                <DarkSelect label="Gender" required value={playerFormData.gender}
                  onChange={(e) => setPlayerFormData({ ...playerFormData, gender: e.target.value })}>
                  <option value="Male" style={{ background: ADMIN_COLORS.darkCard }}>Male</option>
                  <option value="Female" style={{ background: ADMIN_COLORS.darkCard }}>Female</option>
                </DarkSelect>
                <DarkSelect label="Competition" required value={playerFormData.competitionId}
                  onChange={(e) => setPlayerFormData({ ...playerFormData, competitionId: e.target.value, teamId: '' })}>
                  <option value="" style={{ background: ADMIN_COLORS.darkCard }}>Select Competition</option>
                  {competitions.map(c => (
                    <option key={c._id} value={c._id} style={{ background: ADMIN_COLORS.darkCard }}>
                      {c.name} {c.year ? `(${c.year})` : ''} — {c.place}
                    </option>
                  ))}
                </DarkSelect>
                <DarkSelect label="Team" required value={playerFormData.teamId} disabled={!playerFormData.competitionId}
                  onChange={(e) => setPlayerFormData({ ...playerFormData, teamId: e.target.value })}>
                  <option value="" style={{ background: ADMIN_COLORS.darkCard }}>Select Team</option>
                  {teams.filter(t => t.competition?._id === playerFormData.competitionId || t.competitionId === playerFormData.competitionId)
                    .map(t => <option key={t._id} value={t._id} style={{ background: ADMIN_COLORS.darkCard }}>{t.name}</option>)}
                </DarkSelect>
                <DarkSelect label="Payment Status" required value={playerFormData.paymentStatus}
                  onChange={(e) => setPlayerFormData({ ...playerFormData, paymentStatus: e.target.value })}>
                  <option value="pending" style={{ background: ADMIN_COLORS.darkCard }}>Pending</option>
                  <option value="completed" style={{ background: ADMIN_COLORS.darkCard }}>Completed</option>
                  <option value="failed" style={{ background: ADMIN_COLORS.darkCard }}>Failed</option>
                </DarkSelect>
              </div>
              <div className="flex gap-3 pt-2">
                <DarkBtn type="button" variant="ghost" onClick={() => setPlayerFormData({ name:'',email:'',password:'',phone:'',dateOfBirth:'',gender:'Male',teamId:'',competitionId:'',paymentStatus:'pending' })}>
                  Reset
                </DarkBtn>
                <DarkBtn type="submit" variant="primary">
                  <UserPlus className="w-4 h-4" /> Add Player
                </DarkBtn>
              </div>
            </form>
          </DarkCard>
        </FadeIn>
      )}

      {/* ─── Add/Edit Admin Modal ──────────────────────────────────────── */}
      <DarkModal
        isOpen={showAddAdminModal || !!editingAdmin}
        onClose={() => { setShowAddAdminModal(false); setEditingAdmin(null); setFormData({ name:'',email:'',password:'',role:'admin' }); }}
        title={editingAdmin ? 'Edit Admin' : 'Add New Admin'}
        subtitle="Admin Management"
        footer={<>
          <DarkBtn variant="ghost" className="flex-1" onClick={() => { setShowAddAdminModal(false); setEditingAdmin(null); setFormData({ name:'',email:'',password:'',role:'admin' }); }}>Cancel</DarkBtn>
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
          <DarkSelect label="Role" required value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
            <option value="admin" style={{ background: ADMIN_COLORS.darkCard }}>Admin</option>
            <option value="super_admin" style={{ background: ADMIN_COLORS.darkCard }}>Super Admin</option>
          </DarkSelect>
          {editingAdmin && (
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input type="checkbox" className="sr-only" checked={formData.isActive || false}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} />
                <div className="w-10 h-6 rounded-full transition-colors duration-200"
                  style={{ background: formData.isActive ? ADMIN_COLORS.green : 'rgba(255,255,255,0.15)' }}>
                  <div className="w-4 h-4 bg-white rounded-full absolute top-1 transition-transform duration-200"
                    style={{ left: formData.isActive ? '22px' : '4px' }} />
                </div>
              </div>
              <span className="text-sm font-semibold text-white/70">Active</span>
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
          <DarkSelect label="Level" required value={competitionFormData.level}
            onChange={(e) => setCompetitionFormData({ ...competitionFormData, level: e.target.value })}>
            {['district','state','national','international'].map(l => (
              <option key={l} value={l} style={{ background: ADMIN_COLORS.darkCard }} className="capitalize">{l.charAt(0).toUpperCase()+l.slice(1)}</option>
            ))}
          </DarkSelect>
          <DarkInput label="Place" required placeholder="City / Venue" value={competitionFormData.place}
            onChange={(e) => setCompetitionFormData({ ...competitionFormData, place: e.target.value })} />
          <DarkSelect label="Year" required value={competitionFormData.year}
            onChange={(e) => setCompetitionFormData({ ...competitionFormData, year: parseInt(e.target.value) })}>
            {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
              <option key={y} value={y} style={{ background: ADMIN_COLORS.darkCard }}>{y}</option>
            ))}
          </DarkSelect>
          <DarkInput label="Start Date" required type="date" value={competitionFormData.startDate}
            onChange={(e) => setCompetitionFormData({ ...competitionFormData, startDate: e.target.value })} />
          <DarkInput label="End Date" required type="date" value={competitionFormData.endDate}
            onChange={(e) => setCompetitionFormData({ ...competitionFormData, endDate: e.target.value })} />
        </div>

        {/* Competition Types */}
        <div>
          <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: ADMIN_COLORS.saffronLight }}>
            Competition Types <span style={{ color: ADMIN_COLORS.red }}>*</span>
          </p>
          <div className="space-y-2">
            {[
              { id: 'competition_1', label: 'Competition I', desc: 'Team Championship & Qualifier' },
              { id: 'competition_2', label: 'Competition II', desc: 'All Round Individual Final' },
              { id: 'competition_3', label: 'Competition III', desc: 'Apparatus Championship' },
            ].map(ct => {
              const checked = competitionFormData.competitionTypes.includes(ct.id);
              return (
                <label key={ct.id} className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200"
                  style={{ background: checked ? `${ADMIN_COLORS.purple}10` : 'rgba(255,255,255,0.02)', borderColor: checked ? `${ADMIN_COLORS.purple}40` : ADMIN_COLORS.darkBorderSubtle }}>
                  <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleCompetitionType(ct.id)} />
                  <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
                    style={{ background: checked ? ADMIN_COLORS.purple : 'transparent', borderColor: checked ? ADMIN_COLORS.purple : 'rgba(255,255,255,0.3)' }}>
                    {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{ct.label}</p>
                    <p className="text-xs text-white/40">{ct.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <DarkTextarea label="Description" placeholder="Optional description…" rows={3} value={competitionFormData.description}
          onChange={(e) => setCompetitionFormData({ ...competitionFormData, description: e.target.value })} />

        {/* Age Groups */}
        <div>
          <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: ADMIN_COLORS.saffronLight }}>
            Age Groups <span style={{ color: ADMIN_COLORS.red }}>*</span>
          </p>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {defaultAgeGroups.map(ag => (
              <div key={ag} className="p-3 rounded-xl border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                <p className="text-xs font-bold text-white/60 mb-2">{ageGroupLabels[ag]}</p>
                <div className="grid grid-cols-2 gap-2">
                  {['Male','Female'].map(gender => {
                    const valid = isAgeGroupValidForGender(ag, gender);
                    const checked = isAgeGroupSelected(ag, gender);
                    return (
                      <label key={gender} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${!valid ? 'opacity-30 cursor-not-allowed' : ''}`}
                        style={{ background: checked && valid ? `${ADMIN_COLORS.saffron}12` : 'transparent' }}>
                        <input type="checkbox" className="sr-only" checked={checked} disabled={!valid} onChange={() => valid && toggleAgeGroup(ag, gender)} />
                        <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all"
                          style={{ background: checked && valid ? ADMIN_COLORS.saffron : 'transparent', borderColor: checked && valid ? ADMIN_COLORS.saffron : 'rgba(255,255,255,0.3)' }}>
                          {checked && valid && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <span className="text-xs font-semibold text-white/70">{gender}</span>
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
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: ADMIN_COLORS.saffronLight }}>
              Assign Admins <span style={{ color: ADMIN_COLORS.red }}>*</span>
            </p>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'rgba(255,255,255,0.3)' }} />
              <input type="text" placeholder="Search admins…" value={adminSearchQuery}
                onChange={(e) => setAdminSearchQuery(e.target.value)}
                className="w-full rounded-xl text-sm text-white placeholder-white/30 outline-none min-h-[44px] transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${ADMIN_COLORS.darkBorderMid}`, paddingLeft: '2.5rem', paddingRight: '1rem', paddingTop: '0.625rem', paddingBottom: '0.625rem' }} />
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {filteredAdmins.map(admin => {
                const checked = competitionFormData.admins.includes(admin._id);
                return (
                  <label key={admin._id} className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all"
                    style={{ background: checked ? `${ADMIN_COLORS.saffron}10` : 'transparent' }}>
                    <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleAdminSelection(admin._id)} />
                    <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all"
                      style={{ background: checked ? ADMIN_COLORS.saffron : 'transparent', borderColor: checked ? ADMIN_COLORS.saffron : 'rgba(255,255,255,0.3)' }}>
                      {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <span className="text-sm text-white/70">{admin.name} <span className="text-white/35">({admin.email})</span></span>
                  </label>
                );
              })}
              {filteredAdmins.length === 0 && <p className="text-sm text-white/30 p-2">No admins found.</p>}
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
              <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: ADMIN_COLORS.saffronLight }}>Assigned Admins</p>
              {selectedCompetition.admins?.length ? (
                <div className="space-y-2">
                  {selectedCompetition.admins.map(admin => (
                    <div key={admin._id} className="flex items-center justify-between p-3 rounded-xl border"
                      style={{ background: 'rgba(255,255,255,0.03)', borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                      <div>
                        <p className="text-sm font-bold text-white">{admin.name}</p>
                        <p className="text-xs text-white/40">{admin.email}</p>
                      </div>
                      <DarkBtn size="sm" variant="danger" onClick={() => handleRemoveAdmin(admin._id)}>
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </DarkBtn>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-white/30">No admins assigned.</p>}
            </div>
            <div>
              <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: ADMIN_COLORS.saffronLight }}>Available Admins</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {admins.filter(a => a.role !== 'super_admin' && !selectedCompetition.admins?.find(sa => sa._id === a._id)).map(admin => (
                  <div key={admin._id} className="flex items-center justify-between p-3 rounded-xl border"
                    style={{ background: 'rgba(255,255,255,0.02)', borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                    <div>
                      <p className="text-sm font-bold text-white">{admin.name}</p>
                      <p className="text-xs text-white/40">{admin.email}</p>
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
    </div>
  );
};

export default SuperAdminManagement;
