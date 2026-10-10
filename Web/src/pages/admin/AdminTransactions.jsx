import { useState, useEffect } from 'react';
import { ReceiptIndianRupee, Filter, AlertCircle, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '@/services/api';
import { useRouteContext } from '../../contexts/RouteContext';
import { logger } from '@/infrastructure/logger';
import { ADMIN_COLORS, DATA_COLORS, FG, alpha } from '../../styles/tokens';
import { AnimatePresence } from 'framer-motion';
import Dropdown from '@/components/auth/Dropdown';
import { BodyScrollLock } from '@/hooks/useBodyScrollLock';
import { DarkCard, FadeIn } from '@/components/admin/AdminKit';

const statusStyle = (status) => {
  const map = {
    completed: { bg: `${alpha(ADMIN_COLORS.green, 0x20)}`, color: FG.success },
    pending: { bg: `${alpha(ADMIN_COLORS.gold, 0x20)}`, color: FG.brandGold },
    failed: { bg: `${alpha(ADMIN_COLORS.red, 0x20)}`, color: FG.danger },
  };
  return map[status] || { bg: 'rgb(var(--ink) / 0.08)', color: 'var(--fg-muted)' };
};

/**
 * The values a transaction row displays, derived once.
 *
 * Lifted out of the table body when the mobile card list was added, so the two
 * presentations cannot drift — a card showing a different coach or player count
 * from the table would be worse than having no card at all.
 *
 * @param {object} tx - a transaction from the API
 */
const deriveTransactionRow = (tx) => {
  const competitionLabel = tx.competition
    ? `${tx.competition.name}${tx.competition.year ? ` (${tx.competition.year})` : ''}${tx.competition.place ? ` — ${tx.competition.place}` : ''}`
    : '-';
  // Coach name comes from the coach field, or from metadata for a player a
  // super admin added by hand.
  const coachName = tx.coach?.name || tx.metadata?.coachName || '-';

  const razorpayOrderId = tx.metadata?.razorpay_order_id || '-';
  const razorpayPaymentId = tx.metadata?.razorpay_payment_id || '-';

  // Players come off the competition's registeredTeams entry for this team.
  let players = [];
  if (tx.competition?.registeredTeams && tx.team?._id) {
    const registeredTeam = tx.competition.registeredTeams.find(
      (rt) => rt.team?.toString() === tx.team._id.toString()
    );
    if (registeredTeam?.players) {
      players = registeredTeam.players.map((p) => ({
        name: p.player?.name || p.player?.firstName || 'Unknown',
        ageGroup: p.ageGroup || 'N/A',
        gender: p.gender || 'N/A',
        apparatus: p.apparatus,
      }));
    }
  }

  const playerCount = players.length || tx.metadata?.playerCount || 0;

  return { competitionLabel, coachName, razorpayOrderId, razorpayPaymentId, players, playerCount };
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
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-surface-raised">
                <ReceiptIndianRupee className="w-5 h-5 text-fg-secondary" />
              </div>
              <div>
                <p className="type-tag text-accent-fg">Transactions</p>
                <h2 className="type-display-s text-fg">Payment History</h2>
              </div>
            </div>

            {isSuperAdmin && (
              <div className="sm:w-64">
                <label className="block type-tag mb-2 text-accent-fg">
                  Competition <span className="text-danger-fg">*</span>
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
              <div className="w-5 h-5 border-2 border-ink/10 rounded-full animate-spin border-t-accent"/>
              <span className="text-fg-muted text-sm">Loading transactions…</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12">
              {isSuperAdmin && !selectedCompetition ? (
                <>
                  <Filter className="w-12 h-12 mx-auto mb-3 text-ink/15" />
                  <p className="text-fg-muted font-semibold">Select a competition to view transactions.</p>
                </>
              ) : (
                <>
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 text-ink/15" />
                  <p className="text-fg-muted font-semibold">No transactions found.</p>
                </>
              )}
            </div>
          ) : (
            <>
            {/*
              * Cards below `md`, the table from `md` up.
              *
              * Eleven columns — two of them 20-character Razorpay ids — cannot
              * be made to fit a 375px screen, and `overflow-x-auto` on its own
              * just meant an organiser had to drag sideways past nine columns
              * to reach the amount and the status, which are the two anybody
              * opens this page to read. The card puts those first and keeps
              * everything else, so nothing is hidden on mobile; the table below
              * is untouched, so the desktop view is exactly as it was.
              */}
            <div className="flex flex-col gap-3 mouse:hidden">
              {transactions.map((tx) => {
                const row = deriveTransactionRow(tx);
                const { bg, color } = statusStyle(tx.paymentStatus);
                return (
                  <div key={tx._id} className="rounded-2xl border p-4 bg-surface-overlay border-line">
                    {/* What the page is for: how much, and did it go through. */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-ink font-bold text-lg leading-tight">{formatAmount(tx.amount)}</p>
                        <p className="text-fg-muted text-xs mt-0.5">{formatDateTime(tx.createdAt)}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0"
                        style={{ background: bg, color }}>
                        {tx.paymentStatus || 'unknown'}
                      </span>
                    </div>

                    <dl className="mt-3 space-y-1.5 text-xs">
                      {[
                        ['Team', tx.team?.name || '-'],
                        ['Coach', row.coachName],
                        ['Type', typeLabel(tx.type)],
                        ['Source', sourceLabel(tx.source)],
                        ['Competition', row.competitionLabel],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-3">
                          <dt className="text-fg-muted flex-shrink-0">{label}</dt>
                          <dd className="text-ink/75 text-right break-words min-w-0">{value}</dd>
                        </div>
                      ))}
                      {/* Monospaced ids last, and allowed to wrap rather than
                          stretch the card. */}
                      {[['Order ID', row.razorpayOrderId], ['Payment ID', row.razorpayPaymentId]].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-3">
                          <dt className="text-fg-muted flex-shrink-0">{label}</dt>
                          <dd className="text-ink/60 font-mono text-right break-all min-w-0">{value}</dd>
                        </div>
                      ))}
                    </dl>

                    {row.playerCount > 0 && (
                      <button
                        onClick={() => openPlayersModal(row.players)}
                        className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg min-h-[44px] transition-colors"
                        style={{
                          background: `${alpha(ADMIN_COLORS.purple, 0x18)}`,
                          color: DATA_COLORS.violet,
                          border: `1px solid ${alpha(ADMIN_COLORS.purple, 0x30)}`,
                        }}
                      >
                        <Users className="w-4 h-4" aria-hidden="true" />
                        <span className="font-semibold text-sm">
                          {row.playerCount} Player{row.playerCount !== 1 ? 's' : ''}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="overflow-x-auto hidden mouse:block" data-allow-overflow tabIndex={0} role="region" aria-label="Transactions (scrolls sideways)">
              <table className="min-w-full text-sm" aria-label="Transactions table">
                <thead>
                  <tr className="border-b border-line">
                    {['Date / Time', 'Type', 'Source', 'Competition', 'Team', 'Coach', 'Razorpay Order ID', 'Razorpay Payment ID', 'Players', 'Amount', 'Status'].map(h => (
                      <th key={h} scope="col" className="px-4 py-3 text-left type-tag whitespace-nowrap text-fg-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, i) => {
                    const { competitionLabel, coachName, razorpayOrderId, razorpayPaymentId, players, playerCount } =
                      deriveTransactionRow(tx);
                    const { bg, color } = statusStyle(tx.paymentStatus);
                    return (
                      <tr className="border-b border-line" key={tx._id}>
                        <td className="px-4 py-3 whitespace-nowrap text-ink/60">{formatDateTime(tx.createdAt)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-ink/80">{typeLabel(tx.type)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-ink/80">{sourceLabel(tx.source)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-ink/60">{competitionLabel}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-ink/80">{tx.team?.name || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-ink/70">{coachName}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-ink/70 font-mono text-xs">{razorpayOrderId}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-ink/70 font-mono text-xs">{razorpayPaymentId}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {playerCount > 0 ? (
                            <button
                              onClick={() => openPlayersModal(players)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200 hover:scale-105"
                              style={{ 
                                background: `${alpha(ADMIN_COLORS.purple, 0x18)}`,
                                color: DATA_COLORS.violet,
                                border: `1px solid ${alpha(ADMIN_COLORS.purple, 0x30)}`
                              }}
                            >
                              <Users className="w-4 h-4" />
                              <span className="font-semibold">{playerCount} Player{playerCount !== 1 ? 's' : ''}</span>
                            </button>
                          ) : (
                            <span className="text-fg-muted">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-bold text-ink">{formatAmount(tx.amount)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: bg, color }}>
                            {tx.paymentStatus || 'unknown'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </DarkCard>
      </FadeIn>

      {/* Players Modal */}
      <AnimatePresence>
        {playersModalOpen && (
          <div className="modal-overlay z-50 bg-scrim" onClick={closePlayersModal}>
              <BodyScrollLock />
            <div className="rounded-2xl border max-w-2xl w-full max-h-[80vh] overflow-hidden modal-panel" style={{ 
                background: ADMIN_COLORS.darkCard, 
                borderColor: ADMIN_COLORS.darkBorderSubtle 
              }} onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="p-6 border-b border-line">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-surface-raised">
                      <Users className="w-5 h-5 text-fg-secondary" />
                    </div>
                    <div>
                      <h3 className="type-display-s text-fg">Team Players</h3>
                      <p className="text-xs text-fg-muted">{selectedPlayers.length} player{selectedPlayers.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <button
                    onClick={closePlayersModal}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors tap-safe bg-surface-raised"
                    aria-label="Close"
                  >
                    <span className="text-ink/60 text-xl" aria-hidden="true">×</span>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
                {selectedPlayers.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 text-ink/15" />
                    <p className="text-fg-muted">No players found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedPlayers.map((player, idx) => (
                      <div key={idx} className="p-4 rounded-xl border" style={{ 
                          background: 'rgb(var(--ink) / 0.02)', 
                          borderColor: ADMIN_COLORS.darkBorderSubtle 
                        }}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-ink font-bold">{player.name}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ 
                                background: `${alpha(ADMIN_COLORS.saffron, 0x20)}`, 
                                color: FG.brand 
                              }}>
                                {player.ageGroup}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ 
                                background: player.gender === 'Male' 
                                  ? `${alpha(ADMIN_COLORS.blue, 0x20)}` 
                                  : `${alpha(ADMIN_COLORS.purple, 0x20)}`,
                                color: player.gender === 'Male' 
                                  ? FG.info
                                  : DATA_COLORS.violet
                              }}>
                                {player.gender}
                              </span>
                              {player.apparatus && (Object.keys(player.apparatus).length > 0 || typeof player.apparatus === 'string') && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-surface-raised text-fg">
                                  {typeof player.apparatus === 'object' ? Object.values(player.apparatus).flat().join(', ') : player.apparatus}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminTransactions;
