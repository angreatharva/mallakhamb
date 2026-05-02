import { useState, useEffect, useRef } from 'react';
import { ReceiptIndianRupee, Filter, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '../../services/api';
import { useRouteContext } from '../../contexts/RouteContext';
import { logger } from '../../utils/logger';
import { ADMIN_COLORS, ADMIN_EASE_OUT } from '../../styles/tokens';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import Dropdown from '../../components/Dropdown';

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

const statusStyle = (status) => {
  const map = {
    completed: { bg: `${ADMIN_COLORS.green}20`, color: ADMIN_COLORS.green },
    pending: { bg: `${ADMIN_COLORS.gold}20`, color: ADMIN_COLORS.gold },
    failed: { bg: `${ADMIN_COLORS.red}20`, color: ADMIN_COLORS.red },
  };
  return map[status] || { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' };
};

const AdminTransactions = () => {
  const { routePrefix } = useRouteContext();
  const isSuperAdmin = routePrefix === '/superadmin';
  const api = isSuperAdmin ? superAdminAPI : adminAPI;

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [competitions, setCompetitions] = useState([]);
  const [selectedCompetition, setSelectedCompetition] = useState(null);

  useEffect(() => {
    if (isSuperAdmin) fetchCompetitions();
    else fetchTransactions();
  }, [routePrefix]);

  useEffect(() => {
    if (isSuperAdmin && selectedCompetition) fetchTransactions(selectedCompetition.value);
  }, [selectedCompetition]);

  const fetchCompetitions = async () => {
    try {
      const response = await superAdminAPI.getAllCompetitions();
      setCompetitions(response.data.data || []);
    } catch (error) {
      logger.error('Failed to load competitions:', error);
      toast.error('Failed to load competitions');
    }
  };

  const fetchTransactions = async (competitionId) => {
    setLoading(true);
    try {
      const params = {};
      if (isSuperAdmin && competitionId) params.competitionId = competitionId;
      const response = await api.getTransactions(params);
      // superadmin returns data as array; admin returns {transactions, total, ...}
      const txData = response.data.data;
      setTransactions(Array.isArray(txData) ? txData : (txData?.transactions || []));
    } catch (error) {
      logger.error('Failed to load transactions:', error);
      toast.error(error.response?.data?.message || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount) => amount != null ? `₹${amount.toLocaleString()}` : '-';
  const formatDateTime = (value) => { try { return value ? new Date(value).toLocaleString() : '-'; } catch { return '-'; } };

  const typeLabel = (t) => ({ team_submission: 'Team Submission', player_add: 'Player Added' }[t] || 'Other');
  const sourceLabel = (s) => ({ coach: 'Coach', superadmin: 'Super Admin' }[s] || s);

  return (
    <div className="space-y-6">
      <FadeIn>
        <DarkCard className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${ADMIN_COLORS.purple}18` }}>
                <ReceiptIndianRupee className="w-5 h-5" style={{ color: ADMIN_COLORS.purple }} />
              </div>
              <div>
                <p className="text-xs font-bold tracking-widest uppercase" style={{ color: ADMIN_COLORS.saffron }}>Transactions</p>
                <h2 className="text-xl font-black text-white">Payment History</h2>
              </div>
            </div>

            {isSuperAdmin && (
              <div className="sm:w-64">
                <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>
                  Competition <span style={{ color: ADMIN_COLORS.red }}>*</span>
                </label>
                <Dropdown
                  options={competitions.map(c => ({
                    value: c._id,
                    label: `${c.name}${c.year ? ` (${c.year})` : ''}${c.place ? ` — ${c.place}` : ''}`
                  }))}
                  value={selectedCompetition}
                  onChange={setSelectedCompetition}
                  placeholder="Select a competition first"
                  disabled={loading}
                />
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="w-5 h-5 border-2 border-white/10 rounded-full animate-spin" style={{ borderTopColor: ADMIN_COLORS.saffron }} />
              <span className="text-white/40 text-sm">Loading transactions…</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12">
              {isSuperAdmin && !selectedCompetition ? (
                <>
                  <Filter className="w-12 h-12 mx-auto mb-3 text-white/15" />
                  <p className="text-white/50 font-semibold">Select a competition to view transactions.</p>
                </>
              ) : (
                <>
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 text-white/15" />
                  <p className="text-white/50 font-semibold">No transactions found.</p>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm" aria-label="Transactions table">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${ADMIN_COLORS.darkBorderSubtle}` }}>
                    {['Date / Time', 'Type', 'Source', 'Competition', 'Team', 'Coach', 'Razorpay Order ID', 'Razorpay Payment ID', 'Players (Age Group)', 'Amount', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold tracking-widest uppercase whitespace-nowrap"
                        style={{ color: 'rgba(255,255,255,0.35)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, i) => {
                    const competitionLabel = tx.competition
                      ? `${tx.competition.name}${tx.competition.year ? ` (${tx.competition.year})` : ''}${tx.competition.place ? ` — ${tx.competition.place}` : ''}`
                      : '-';
                    const coachName = tx.coach?.name || '-';
                    const playersLabel = tx.teamPlayers?.length
                      ? tx.teamPlayers
                        .map(p => `${p.playerName}${p.ageGroup ? ` (${p.ageGroup})` : ''}`)
                        .join(', ')
                      : '-';
                    const { bg, color } = statusStyle(tx.paymentStatus);
                    return (
                      <motion.tr key={tx._id}
                        style={{ borderBottom: `1px solid ${ADMIN_COLORS.darkBorderSubtle}` }}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.02, duration: 0.3 }}>
                        <td className="px-4 py-3 whitespace-nowrap text-white/60">{formatDateTime(tx.createdAt)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-white/80">{typeLabel(tx.type)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-white/80">{sourceLabel(tx.source)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-white/60">{competitionLabel}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-white/80">{tx.team?.name || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-white/70">{coachName}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-white/70">{tx.razorpayOrderId || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-white/70">{tx.razorpayPaymentId || '-'}</td>
                        <td className="px-4 py-3 text-white/70 max-w-md whitespace-normal break-words">{playersLabel}</td>
                        <td className="px-4 py-3 whitespace-nowrap font-bold text-white">{formatAmount(tx.amount)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: bg, color }}>
                            {tx.paymentStatus || 'unknown'}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DarkCard>
      </FadeIn>
    </div>
  );
};

export default AdminTransactions;
