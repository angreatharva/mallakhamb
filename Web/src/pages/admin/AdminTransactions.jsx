import { useState, useEffect, useRef } from 'react';
import { ReceiptIndianRupee, Filter, AlertCircle, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '@/services/api';
import { useRouteContext } from '../../contexts/RouteContext';
import { logger } from '@/infrastructure/logger';
import { ADMIN_COLORS, ADMIN_EASE_OUT } from '../../styles/tokens';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import Dropdown from '@/components/auth/Dropdown';

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
  const [playersModalOpen, setPlayersModalOpen] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState([]);

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

  const openPlayersModal = (players) => {
    setSelectedPlayers(players);
    setPlayersModalOpen(true);
  };

  const closePlayersModal = () => {
    setPlayersModalOpen(false);
    setSelectedPlayers([]);
  };

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
                    {['Date / Time', 'Type', 'Source', 'Competition', 'Team', 'Coach', 'Razorpay Order ID', 'Razorpay Payment ID', 'Players', 'Amount', 'Status'].map(h => (
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
                    // Get coach name from coach field or metadata (for super admin added players)
                    const coachName = tx.coach?.name || tx.metadata?.coachName || '-';
                    
                    // Extract Razorpay IDs from metadata
                    const razorpayOrderId = tx.metadata?.razorpay_order_id || '-';
                    const razorpayPaymentId = tx.metadata?.razorpay_payment_id || '-';
                    
                    // Get players from competition's registeredTeams
                    let players = [];
                    if (tx.competition?.registeredTeams && tx.team?._id) {
                      const registeredTeam = tx.competition.registeredTeams.find(
                        rt => rt.team?.toString() === tx.team._id.toString()
                      );
                      if (registeredTeam?.players) {
                        players = registeredTeam.players.map(p => ({
                          name: p.player?.name || p.player?.firstName || 'Unknown',
                          ageGroup: p.ageGroup || 'N/A',
                          gender: p.gender || 'N/A'
                        }));
                      }
                    }
                    
                    const playerCount = players.length || tx.metadata?.playerCount || 0;
                    
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
                        <td className="px-4 py-3 whitespace-nowrap text-white/70 font-mono text-xs">{razorpayOrderId}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-white/70 font-mono text-xs">{razorpayPaymentId}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {playerCount > 0 ? (
                            <button
                              onClick={() => openPlayersModal(players)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200 hover:scale-105"
                              style={{ 
                                background: `${ADMIN_COLORS.purple}18`,
                                color: ADMIN_COLORS.purple,
                                border: `1px solid ${ADMIN_COLORS.purple}30`
                              }}
                            >
                              <Users className="w-4 h-4" />
                              <span className="font-semibold">{playerCount} Player{playerCount !== 1 ? 's' : ''}</span>
                            </button>
                          ) : (
                            <span className="text-white/40">-</span>
                          )}
                        </td>
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

      {/* Players Modal */}
      <AnimatePresence>
        {playersModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closePlayersModal}
          >
            <motion.div
              className="rounded-2xl border max-w-2xl w-full max-h-[80vh] overflow-hidden"
              style={{ 
                background: ADMIN_COLORS.darkCard, 
                borderColor: ADMIN_COLORS.darkBorderSubtle 
              }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 border-b" style={{ borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${ADMIN_COLORS.purple}18` }}>
                      <Users className="w-5 h-5" style={{ color: ADMIN_COLORS.purple }} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white">Team Players</h3>
                      <p className="text-xs text-white/50">{selectedPlayers.length} player{selectedPlayers.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <button
                    onClick={closePlayersModal}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  >
                    <span className="text-white/60 text-xl">×</span>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
                {selectedPlayers.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 text-white/15" />
                    <p className="text-white/50">No players found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedPlayers.map((player, idx) => (
                      <motion.div
                        key={idx}
                        className="p-4 rounded-xl border"
                        style={{ 
                          background: 'rgba(255,255,255,0.02)', 
                          borderColor: ADMIN_COLORS.darkBorderSubtle 
                        }}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-white font-bold">{player.name}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ 
                                background: `${ADMIN_COLORS.saffron}20`, 
                                color: ADMIN_COLORS.saffron 
                              }}>
                                {player.ageGroup}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ 
                                background: player.gender === 'Male' 
                                  ? `${ADMIN_COLORS.blue || '#3B82F6'}20` 
                                  : `${ADMIN_COLORS.purple}20`,
                                color: player.gender === 'Male' 
                                  ? ADMIN_COLORS.blue || '#3B82F6'
                                  : ADMIN_COLORS.purple
                              }}>
                                {player.gender}
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminTransactions;
