import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Shuffle, Filter, Users, ChevronDown, ChevronRight, Save, Trophy, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { superAdminAPI } from '@/services/api';
import { adminLotsAPI, superAdminLotsAPI } from '@/services/ordering/lots.api';
import { useRouteContext } from '../../contexts/RouteContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { useAgeGroups } from '../../hooks/useAgeGroups';
import Dropdown from '@/components/auth/Dropdown';
import ConfirmDialog from '@/components/auth/ConfirmDialog';
import SortableList from '@/components/ordering/SortableList';
import { logger } from '@/infrastructure/logger';
import { ADMIN_COLORS, alpha } from '../../styles/tokens';

const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
];

const COMPETITION_TYPE_OPTIONS = [
  { value: 'competition_1', label: 'Competition I — Team' },
  { value: 'competition_2', label: 'Competition II — Individual' },
  { value: 'competition_3', label: 'Competition III — Apparatus' },
];

const DarkCard = ({ children, className = '', style = {} }) => (
  <div className={`rounded-2xl border ${className}`}
    style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle, ...style }}>
    {children}
  </div>
);

const EmptyState = ({ icon: Icon, title, desc }) => (
  <div className="text-center py-12">
    <Icon className="w-12 h-12 mx-auto mb-3 text-white/15" />
    <p className="text-white/60 font-semibold">{title}</p>
    {desc && <p className="text-white/30 text-sm mt-1">{desc}</p>}
  </div>
);

const LotBadge = ({ lotNo, position }) => (
  <span
    className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm font-black flex-shrink-0"
    style={{
      background: lotNo ? `${alpha(ADMIN_COLORS.saffron, 0x20)}` : 'rgba(255,255,255,0.06)',
      color: lotNo ? ADMIN_COLORS.saffron : 'rgba(255,255,255,0.4)',
    }}
    // The drawn lot and the running position diverge as soon as anyone drags a
    // row, so the badge shows the LOT (a matter of record) and the tooltip the
    // current running position.
    title={lotNo ? `Lot ${lotNo} · runs ${position + 1}` : `Runs ${position + 1} · no lot drawn`}
  >
    {lotNo ?? position + 1}
  </span>
);

/**
 * Lot draw and running order — the admin / superadmin screen.
 *
 * Rendered as the `lots` tab of UnifiedDashboard for both roles, so it reads
 * its role from RouteContext exactly like AdminTeams does rather than taking a
 * prop.
 *
 * Two things happen here and they are deliberately separate:
 *  - **Draw Lots** randomises the order server-side and stamps lot numbers.
 *    This is the official draw and only an admin can run it.
 *  - **Dragging** rewrites the running order without touching the drawn lot
 *    numbers, so a team moved for a legitimate reason still shows the lot it
 *    drew.
 *
 * Every save broadcasts to the panel's judges over Socket.IO, so a change made
 * here appears on the Senior Judge's and every judge's tablet immediately.
 */
const AdminLots = () => {
  const { routePrefix } = useRouteContext();
  const { currentCompetition } = useCompetition();
  const isSuperAdmin = routePrefix === '/superadmin';
  const lotsAPI = isSuperAdmin ? superAdminLotsAPI : adminLotsAPI;

  const [competitions, setCompetitions] = useState([]);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [selectedCompetitionType, setSelectedCompetitionType] = useState(null);

  const [roster, setRoster] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState(null);
  const [showDrawConfirm, setShowDrawConfirm] = useState(false);

  /**
   * The order as of the last pointer move.
   *
   * `onCommit` fires from framer-motion's drag-end, which can land in the same
   * tick as the final `onReorder` — before React has re-rendered and rebuilt
   * the callback closure. Reading `teams` there would then persist the
   * second-to-last arrangement, silently dropping the final move. The ref is
   * always current.
   */
  const teamsRef = useRef([]);
  const setTeamsTracked = useCallback((next) => {
    teamsRef.current = next;
    setTeams(next);
  }, []);

  const availableAgeGroups = useAgeGroups(selectedGender?.value || 'Male');

  const activeCompetitionId = isSuperAdmin ? selectedCompetition?.value : currentCompetition?._id;

  const filtersComplete = !!(activeCompetitionId && selectedGender && selectedAgeGroup && selectedCompetitionType);

  const categoryParams = useMemo(() => {
    if (!filtersComplete) return null;
    return {
      competitionId: activeCompetitionId,
      gender: selectedGender.value,
      ageGroup: selectedAgeGroup.value,
      competitionType: selectedCompetitionType.value,
    };
  }, [filtersComplete, activeCompetitionId, selectedGender, selectedAgeGroup, selectedCompetitionType]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    superAdminAPI.getAllCompetitions()
      .then((res) => {
        const responseData = res.data.data || res.data;
        setCompetitions(Array.isArray(responseData) ? responseData : (responseData.competitions || []));
      })
      .catch(() => toast.error('Failed to load competitions'));
  }, [isSuperAdmin]);

  useEffect(() => { setSelectedAgeGroup(null); }, [selectedGender]);

  const fetchRoster = useCallback(async () => {
    if (!categoryParams) { setRoster(null); setTeamsTracked([]); return; }
    setLoading(true);
    try {
      const response = await lotsAPI.getOrder(categoryParams);
      const data = response.data?.data || null;
      setRoster(data);
      setTeamsTracked(data?.teams || []);
      setExpandedTeamId(null);
    } catch (error) {
      logger.error('Failed to load running order:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to load running order');
      setRoster(null);
      setTeamsTracked([]);
    } finally {
      setLoading(false);
    }
  }, [categoryParams, lotsAPI, setTeamsTracked]);

  useEffect(() => { fetchRoster(); }, [fetchRoster]);

  const handleDrawLots = async () => {
    if (!categoryParams) return;
    setSaving(true);
    try {
      const response = await lotsAPI.drawLots({ ...categoryParams, includePlayers: true });
      const data = response.data?.data || null;
      setRoster(data);
      setTeamsTracked(data?.teams || []);
      toast.success(`Lots drawn for ${data?.teams?.length || 0} teams`);
    } catch (error) {
      logger.error('Failed to draw lots:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to draw lots');
    } finally {
      setSaving(false);
    }
  };

  const persistTeamOrder = async (nextTeams) => {
    if (!categoryParams) return;
    setSaving(true);
    try {
      await lotsAPI.setTeamOrder({ ...categoryParams, teamIds: nextTeams.map((t) => String(t._id)) });
      toast.success('Team order saved');
    } catch (error) {
      logger.error('Failed to save team order:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to save team order');
      // Re-read rather than keep the optimistic order: if the save was rejected
      // the judges are still looking at the previous order, and leaving this
      // screen showing the new one is how two people end up disagreeing about
      // who performs next.
      fetchRoster();
    } finally {
      setSaving(false);
    }
  };

  const persistPlayerOrder = async (teamId, nextPlayers) => {
    if (!categoryParams) return;
    setSaving(true);
    try {
      await lotsAPI.setPlayerOrder({
        ...categoryParams,
        teamId: String(teamId),
        playerIds: nextPlayers.map((p) => String(p._id)),
      });
      toast.success('Athlete order saved');
    } catch (error) {
      logger.error('Failed to save athlete order:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to save athlete order');
      fetchRoster();
    } finally {
      setSaving(false);
    }
  };

  const handlePlayersReorder = (teamId, nextPlayers) => {
    const next = teamsRef.current.map((t) =>
      (String(t._id) === String(teamId) ? { ...t, players: nextPlayers } : t)
    );
    setTeamsTracked(next);
  };

  /** Read the athlete order straight off the ref — see the note on teamsRef. */
  const currentPlayersOf = (teamId) =>
    teamsRef.current.find((t) => String(t._id) === String(teamId))?.players || [];

  const competitionOptions = competitions.map((c) => ({
    value: c._id,
    label: `${c.name}${c.year ? ` (${c.year})` : ''}${c.place ? ` — ${c.place}` : ''}`,
  }));

  const hasLots = teams.some((t) => t.lotNo != null);

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={showDrawConfirm}
        onClose={() => setShowDrawConfirm(false)}
        onConfirm={handleDrawLots}
        title={hasLots ? 'Redraw Lots' : 'Draw Lots'}
        message={hasLots
          ? 'This replaces the existing lot numbers and the current running order for this category, including any sequence the Senior Judge or Scorer has set.\n\nContinue?'
          : 'Randomly draw lot numbers for every submitted team in this category, and for the athletes inside each team.\n\nContinue?'}
        confirmText={hasLots ? 'Redraw' : 'Draw Lots'}
        cancelText="Cancel"
        variant={hasLots ? 'danger' : 'default'}
      />

      <DarkCard className="p-6">
        <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: ADMIN_COLORS.saffron }}>
          Lots &amp; Running Order
        </p>
        <h2 className="text-2xl font-black text-white mb-6">Draw Lots</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {isSuperAdmin && (
            <div className="lg:col-span-4">
              <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>
                Competition <span style={{ color: ADMIN_COLORS.red }}>*</span>
              </label>
              <Dropdown options={competitionOptions} value={selectedCompetition} onChange={setSelectedCompetition}
                placeholder="Select a competition first" />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>Gender</label>
            <Dropdown options={GENDER_OPTIONS} value={selectedGender} onChange={setSelectedGender} placeholder="Select gender" />
          </div>
          <div>
            <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>Age Group</label>
            <Dropdown options={availableAgeGroups} value={selectedAgeGroup} onChange={setSelectedAgeGroup}
              placeholder="Select age group" disabled={!selectedGender} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>Competition</label>
            <Dropdown options={COMPETITION_TYPE_OPTIONS} value={selectedCompetitionType} onChange={setSelectedCompetitionType}
              placeholder="Select competition type" />
          </div>
        </div>

        {!filtersComplete ? (
          <EmptyState icon={Filter} title="Select a category"
            desc={isSuperAdmin
              ? 'Choose competition, gender, age group and competition type to draw or edit its running order.'
              : 'Choose gender, age group and competition type to draw or edit its running order.'} />
        ) : loading ? (
          <div className="flex items-center justify-center py-12 gap-3">
            <div className="w-5 h-5 border-2 border-white/10 rounded-full animate-spin" style={{ borderTopColor: ADMIN_COLORS.saffron }} />
            <span className="text-white/40 text-sm">Loading running order…</span>
          </div>
        ) : teams.length === 0 ? (
          <EmptyState icon={Trophy} title="No submitted teams"
            desc="No coach has submitted a team for this category yet, so there is nothing to draw." />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border"
              style={{ background: `${alpha(ADMIN_COLORS.saffron, 0x08)}`, borderColor: `${alpha(ADMIN_COLORS.saffron, 0x25)}` }}>
              <div className="text-sm">
                <p className="text-white font-bold">
                  {teams.length} team{teams.length !== 1 ? 's' : ''} in running order
                </p>
                <p className="text-white/40 text-xs mt-0.5">
                  {roster?.lotsDrawnAt
                    ? `Lots drawn ${new Date(roster.lotsDrawnAt).toLocaleString()}${roster.lotsDrawnByName ? ` by ${roster.lotsDrawnByName}` : ''}`
                    : 'No lots drawn yet'}
                  {roster?.updatedByName && roster?.updatedByRole
                    ? ` · last changed by ${roster.updatedByName} (${roster.updatedByRole})`
                    : ''}
                </p>
              </div>
              <motion.button
                onClick={() => setShowDrawConfirm(true)}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: `linear-gradient(135deg, ${ADMIN_COLORS.saffron}, #D97706)` }}
                whileHover={saving ? {} : { scale: 1.02 }} whileTap={saving ? {} : { scale: 0.97 }}>
                <Shuffle className="w-4 h-4" />
                {hasLots ? 'Redraw Lots' : 'Draw Lots'}
              </motion.button>
            </div>

            <div className="flex items-start gap-2 text-xs text-white/40 px-1">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <p>
                Drag by the grip to change who performs when. Lot numbers stay with the team they were drawn for.
                Every change is pushed live to the judges of this panel.
              </p>
            </div>

            <SortableList
              items={teams}
              getKey={(team) => String(team._id)}
              onReorder={setTeamsTracked}
              onCommit={() => persistTeamOrder(teamsRef.current)}
              accent={ADMIN_COLORS.saffron}
              renderItem={(team, index) => {
                const isExpanded = String(expandedTeamId) === String(team._id);
                return (
                  <div>
                    <div className="flex items-center gap-3">
                      <LotBadge lotNo={team.lotNo} position={index} />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-white text-sm truncate">{team.name}</p>
                        <p className="text-xs text-white/40 truncate">
                          {team.coachName ? `Coach: ${team.coachName} · ` : ''}
                          {team.playerCount} athlete{team.playerCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedTeamId(isExpanded ? null : team._id)}
                        className="flex items-center gap-1 px-3 min-h-[44px] rounded-lg text-xs font-bold text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5" />
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pl-1 border-l-2" style={{ borderColor: `${alpha(ADMIN_COLORS.saffron, 0x30)}` }}>
                        <p className="text-[10px] font-bold tracking-widest uppercase mb-2 pl-3" style={{ color: ADMIN_COLORS.saffronLight }}>
                          Athlete order
                        </p>
                        <div className="pl-3">
                          <SortableList
                            items={team.players}
                            getKey={(player) => String(player._id)}
                            onReorder={(next) => handlePlayersReorder(team._id, next)}
                            onCommit={() => persistPlayerOrder(team._id, currentPlayersOf(team._id))}
                            accent={ADMIN_COLORS.purple}
                            emptyMessage="No athletes registered in this category for this team."
                            renderItem={(player, playerIndex) => (
                              <div className="flex items-center gap-3">
                                <LotBadge lotNo={player.lotNo} position={playerIndex} />
                                <div className="min-w-0">
                                  <p className="text-sm text-white truncate">{player.name}</p>
                                  <p className="text-xs text-white/35">{player.gender} · {player.ageGroup}</p>
                                </div>
                              </div>
                            )}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              {saving && <span className="text-xs text-white/40">Saving…</span>}
              <motion.button
                onClick={() => persistTeamOrder(teamsRef.current)}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white min-h-[44px] disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${ADMIN_COLORS.green}, #16A34A)` }}
                whileHover={saving ? {} : { scale: 1.02 }} whileTap={saving ? {} : { scale: 0.97 }}>
                <Save className="w-4 h-4" /> Save Order
              </motion.button>
            </div>
          </div>
        )}
      </DarkCard>
    </div>
  );
};

export default AdminLots;
