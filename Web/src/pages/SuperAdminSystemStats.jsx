import { useState, useEffect, useRef } from 'react';
import {
  Server, Database, Users, Activity, Clock, HardDrive,
  TrendingUp, AlertCircle, CheckCircle, RefreshCw
} from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import toast from 'react-hot-toast';
import { superAdminAPI } from '../services/api';
import { ADMIN_COLORS, ADMIN_EASE_OUT } from './adminTheme';

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

// ─── Animated counter ────────────────────────────────────────────────────────
const useCounter = (target, duration = 1400, inView = true) => {
  const [count, setCount] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!inView || reduced) { setCount(target); return; }
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setCount(Math.floor((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, inView, reduced]);
  return count;
};

// ─── FadeIn ───────────────────────────────────────────────────────────────────
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

// ─── DarkCard ─────────────────────────────────────────────────────────────────
const DarkCard = ({ children, className = '', style = {} }) => (
  <div className={`rounded-2xl border ${className}`}
    style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle, ...style }}>
    {children}
  </div>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, color, suffix = '', delay = 0, raw = false }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const count = useCounter(typeof value === 'number' ? value : 0, 1400, inView);
  return (
    <FadeIn delay={delay}>
      <div ref={ref} className="p-5 rounded-2xl border flex items-center gap-4"
        style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle }}>
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}18` }}>
          <Icon className="w-5 h-5" style={{ color }} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-white/40 text-xs tracking-wide uppercase truncate">{label}</p>
          <p className="text-2xl font-black text-white mt-0.5">
            {raw ? (value ?? '—') : `${count}${suffix}`}
          </p>
        </div>
      </div>
    </FadeIn>
  );
};

// ─── Health indicator ─────────────────────────────────────────────────────────
const HealthDot = ({ ok }) => (
  <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
    {ok && (
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
        style={{ background: ADMIN_COLORS.green }} />
    )}
    <span className="relative inline-flex rounded-full h-2.5 w-2.5"
      style={{ background: ok ? ADMIN_COLORS.green : ADMIN_COLORS.red }} />
  </span>
);

// ─── Section header ───────────────────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, label, title, color }) => (
  <div className="flex items-center gap-3 mb-5">
    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: `${color}18` }}>
      <Icon className="w-5 h-5" style={{ color }} aria-hidden="true" />
    </div>
    <div>
      <p className="text-xs font-bold tracking-widest uppercase" style={{ color }}>{label}</p>
      <h3 className="text-lg font-black text-white leading-tight">{title}</h3>
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const SuperAdminSystemStats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await superAdminAPI.getSystemStats();
      setStats(response.data);
      setLastUpdated(new Date());
    } catch {
      toast.error('Failed to load system stats');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3">
        <div className="w-5 h-5 border-2 border-white/10 rounded-full animate-spin"
          style={{ borderTopColor: ADMIN_COLORS.saffron }} />
        <span className="text-white/40 text-sm">Loading system stats…</span>
      </div>
    );
  }

  const s = stats?.stats;
  const users = s?.users || {};
  const content = s?.content || {};
  const system = s?.system || {};
  const dbStatus = system?.database || 'unknown';
  const dbOk = dbStatus === 'connected';

  return (
    <div className="space-y-8">
      {/* Header */}
      <FadeIn>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: ADMIN_COLORS.saffron }}>
              System
            </p>
            <h2 className="text-3xl font-black text-white">System Statistics</h2>
            {lastUpdated && (
              <p className="text-white/30 text-xs mt-1 flex items-center gap-1.5">
                <Clock className="w-3 h-3" aria-hidden="true" />
                Updated {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
          <motion.button
            onClick={() => fetchStats(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold min-h-[44px] transition-all disabled:opacity-50"
            style={{ background: `${ADMIN_COLORS.saffron}18`, color: ADMIN_COLORS.saffronLight, border: `1px solid ${ADMIN_COLORS.saffron}30` }}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            aria-label="Refresh stats">
            <motion.div animate={refreshing ? { rotate: 360 } : { rotate: 0 }}
              transition={refreshing ? { duration: 0.8, repeat: Infinity, ease: 'linear' } : {}}>
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
            </motion.div>
            Refresh
          </motion.button>
        </div>
      </FadeIn>

      {/* System Health */}
      <FadeIn delay={0.05}>
        <DarkCard className="p-6">
          <SectionHeader icon={Server} label="Infrastructure" title="System Health" color={dbOk ? ADMIN_COLORS.green : ADMIN_COLORS.red} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-4 p-4 rounded-xl border"
              style={{ background: `${dbOk ? ADMIN_COLORS.green : ADMIN_COLORS.red}08`, borderColor: `${dbOk ? ADMIN_COLORS.green : ADMIN_COLORS.red}25` }}>
              <HealthDot ok={dbOk} />
              <div>
                <p className="text-xs font-bold tracking-widest uppercase" style={{ color: dbOk ? ADMIN_COLORS.green : ADMIN_COLORS.red }}>Database</p>
                <p className="text-white font-bold capitalize">{dbStatus}</p>
              </div>
              {dbOk ? <CheckCircle className="w-5 h-5 ml-auto" style={{ color: ADMIN_COLORS.green }} aria-hidden="true" />
                : <AlertCircle className="w-5 h-5 ml-auto" style={{ color: ADMIN_COLORS.red }} aria-hidden="true" />}
            </div>
            <div className="flex items-center gap-4 p-4 rounded-xl border"
              style={{ background: `${ADMIN_COLORS.green}08`, borderColor: `${ADMIN_COLORS.green}25` }}>
              <HealthDot ok={true} />
              <div>
                <p className="text-xs font-bold tracking-widest uppercase" style={{ color: ADMIN_COLORS.green }}>API Server</p>
                <p className="text-white font-bold">Online</p>
              </div>
              <CheckCircle className="w-5 h-5 ml-auto" style={{ color: ADMIN_COLORS.green }} aria-hidden="true" />
            </div>
          </div>
          {system?.uptime != null && (
            <div className="mt-4 p-4 rounded-xl border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: ADMIN_COLORS.darkBorderSubtle }}>
              <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: ADMIN_COLORS.saffron }}>Server Uptime</p>
              <p className="text-white font-bold">{Math.floor(system.uptime / 3600)}h {Math.floor((system.uptime % 3600) / 60)}m</p>
            </div>
          )}
        </DarkCard>
      </FadeIn>

      {/* User Stats */}
      <div>
        <FadeIn delay={0.1}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ background: `linear-gradient(to bottom, ${ADMIN_COLORS.saffron}, ${ADMIN_COLORS.gold})` }} />
            <p className="text-xs font-bold tracking-widest uppercase" style={{ color: ADMIN_COLORS.saffron }}>Users</p>
          </div>
        </FadeIn>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard icon={Users} label="Total Players" value={users.totalPlayers} color={ADMIN_COLORS.green} delay={0.1} />
          <StatCard icon={Users} label="Total Coaches" value={users.totalCoaches} color={ADMIN_COLORS.blue} delay={0.15} />
          <StatCard icon={Users} label="Total Admins" value={users.totalAdmins} color={ADMIN_COLORS.purple} delay={0.2} />
        </div>
      </div>

      {/* Content Stats */}
      <div>
        <FadeIn delay={0.2}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ background: `linear-gradient(to bottom, ${ADMIN_COLORS.purple}, ${ADMIN_COLORS.purpleLight})` }} />
            <p className="text-xs font-bold tracking-widest uppercase" style={{ color: ADMIN_COLORS.purple }}>Content</p>
          </div>
        </FadeIn>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={TrendingUp} label="Competitions" value={content.totalCompetitions} color={ADMIN_COLORS.saffron} delay={0.2} />
          <StatCard icon={HardDrive} label="Total Teams" value={content.totalTeams} color={ADMIN_COLORS.gold} delay={0.25} />
          <StatCard icon={Activity} label="Active Judges" value={content.totalJudges} color="#EC4899" delay={0.3} />
          <StatCard icon={Database} label="Total Scores" value={content.totalScores} color={ADMIN_COLORS.blue} delay={0.35} />
        </div>
      </div>

      {/* Raw JSON fallback for any extra fields */}
      {s && Object.keys(s).filter(k => !['users','content','system'].includes(k)).length > 0 && (
        <FadeIn delay={0.4}>
          <DarkCard className="p-6">
            <SectionHeader icon={Database} label="Additional" title="Extra Data" color={ADMIN_COLORS.blue} />
            <pre className="text-xs text-white/40 overflow-x-auto leading-relaxed">
              {JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k]) => !['users','content','system'].includes(k))), null, 2)}
            </pre>
          </DarkCard>
        </FadeIn>
      )}
    </div>
  );
};

export default SuperAdminSystemStats;
