/**
 * TimeKeeperScoring.jsx — /judge/scoring for a Time Keeper.
 *
 * The Time Keeper times each athlete's performance: Start, Pause / Resume,
 * Stop. The display is whole seconds only (…59, 60, 61…), with one beep at 60
 * and two at 90 — see ./timeKeeper.js. On Stop the time is sent over the
 * category's scoring room (socket `time_record`) and lands in that athlete's
 * Time field on the Scorer's sheet, where it is saved with the sheet like a
 * typed time — deductions included.
 *
 * Nothing is written to the server from here. The times this screen has
 * recorded are kept for the session, so a refresh does not lose them and any
 * that did not reach the Scorer can be sent again.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { ArrowLeft, Timer, Send, Check, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { logger } from '@/infrastructure/logger';
import { secureStorage } from '@/utils/auth/secureStorage';
import { ADMIN_COLORS } from '../../styles/tokens';
import CompetitionLockBanner from '@/components/competition/CompetitionLockBanner';
import { useCompetitionLock } from '@/hooks/useCompetitionLock';
import { buildScorerRows } from './scorerRows';
import { apparatusKey } from '@/utils/scoring/apparatus';
import { seatTypesFor } from './useJudgePanelData';
import { useTimekeeping, BEEP_MARKS, deductionNote } from './timeKeeper';
import StopwatchFace from './StopwatchFace';

const SESSION_KEY = 'timekeeper_active_session';

const readJudge = () => {
  try {
    const raw = secureStorage.getItem('judge_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const TimeKeeperScoring = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { locked: competitionLocked } = useCompetitionLock();

  const session = useMemo(() => {
    if (location.state?.selectedTeam && location.state?.selectedCompetitionType) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(location.state));
      return location.state;
    }
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  }, [location.state]);

  const { selectedTeam, selectedCompetitionType, gender, ageGroup, apparatus } = session || {};
  const compType = selectedCompetitionType?.value || selectedCompetitionType;
  const [judgeInfo] = useState(readJudge);

  // Only the Time Keeper of THIS category belongs here — the role follows the
  // category, not the account (see resolveJudgeSeat).
  const isTimeKeeper = seatTypesFor(judgeInfo, { gender, ageGroup, competitionType: compType, apparatus })
    .includes('Time Keeper');
  useEffect(() => {
    if (!judgeInfo) {
      toast.error('Please login first');
      navigate('/judge/login');
    } else if (!selectedTeam || !gender || !ageGroup) {
      navigate('/judge/dashboard');
    } else if (!isTimeKeeper) {
      toast.error('This page is only for the Time Keeper of this category');
      navigate('/judge/dashboard');
    }
  }, [judgeInfo, selectedTeam, gender, ageGroup, isTimeKeeper, navigate]);

  const rows = useMemo(() => (selectedTeam ? buildScorerRows({
    team: selectedTeam, gender, ageGroup, competitionType: compType, apparatus,
  }) : []), [selectedTeam, gender, ageGroup, compType, apparatus]);

  // Times recorded this session: { [rowId]: { seconds, sent } }
  const timesKey = selectedTeam ? `timekeeper_times_${selectedTeam._id}_${apparatus || 'all'}` : null;
  const [times, setTimes] = useState(() => {
    try { return timesKey ? JSON.parse(sessionStorage.getItem(timesKey) || '{}') : {}; } catch { return {}; }
  });
  useEffect(() => {
    if (timesKey) sessionStorage.setItem(timesKey, JSON.stringify(times));
  }, [times, timesKey]);

  const [selectedId, setSelectedId] = useState(null);
  useEffect(() => {
    if (!selectedId && rows.length) setSelectedId((rows.find((r) => !times[r.id]) || rows[0]).id);
  }, [rows, selectedId, times]);
  const selected = rows.find((r) => r.id === selectedId) || null;

  const watch = useTimekeeping();

  // ── Socket ─────────────────────────────────────────────────────────────────
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const roomId = gender && ageGroup && compType ? `scoring_${gender}_${ageGroup}_${compType}` : null;

  useEffect(() => {
    if (!judgeInfo || !roomId) return undefined;
    const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
    const s = io(socketUrl, { auth: { token: secureStorage.getItem('judge_token') }, withCredentials: true });
    setSocket(s);
    s.on('connect', () => {
      setIsConnected(true);
      s.emit('join_scoring_room', { roomId });
    });
    s.on('disconnect', () => setIsConnected(false));
    s.on('connect_error', (err) => { setIsConnected(false); logger.error('Time Keeper socket error', err); });
    // The server's acknowledgement: the time reached the room.
    s.on('time_recorded', (data) => {
      if (!data?.ack) return;
      // Same row key the Scorer's sheet uses: athlete + apparatus.
      const rowId = `${data.playerId}::${apparatusKey(data.apparatus)}`;
      setTimes((prev) => (prev[rowId]?.seconds === data.seconds
        ? { ...prev, [rowId]: { ...prev[rowId], sent: true } }
        : prev));
    });
    s.on('error', (err) => {
      toast.error(err?.message || 'The time could not be sent');
    });
    return () => s.disconnect();
  }, [judgeInfo, roomId]);

  const sendTime = useCallback((row, seconds) => {
    if (!socket?.connected) {
      toast.error('Not connected — the time is kept here. Send it again once Live.');
      return;
    }
    socket.emit('time_record', {
      roomId,
      playerId: row.playerId,
      teamId: selectedTeam._id,
      apparatus: row.apparatus,
      seconds,
    });
  }, [socket, roomId, selectedTeam]);

  // ── Controls ───────────────────────────────────────────────────────────────
  const handleStopped = (seconds) => {
    setTimes((prev) => ({ ...prev, [selected.id]: { seconds, sent: false } }));
    sendTime(selected, seconds);
  };

  const handleNext = () => {
    watch.reset();
    const next = rows.find((r) => r.id !== selectedId && !times[r.id]);
    if (next) setSelectedId(next.id);
  };

  const running = watch.status === 'running';
  const busy = running || watch.status === 'paused';

  if (!selectedTeam || !judgeInfo) return null;

  const nextMark = BEEP_MARKS.find((m) => watch.seconds < m.at);

  return (
    <div className="min-h-dvh" style={{ background: ADMIN_COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header className="sticky top-0 z-40 border-b"
        style={{ background: 'rgba(10,10,10,0.94)', backdropFilter: 'blur(20px)', borderColor: ADMIN_COLORS.darkBorderSubtle }}>
        <div className="max-w-6xl mx-auto px-4 md:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => navigate('/judge/dashboard')} disabled={busy}
              className="flex items-center gap-2 text-sm font-semibold min-h-[44px] px-3 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-40"
              style={{ color: 'rgba(255,255,255,0.6)' }}>
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Back to Dashboard</span>
            </button>
            <div className="w-px h-5 bg-white/10" />
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4" style={{ color: ADMIN_COLORS.saffron }} aria-hidden="true" />
              <span className="text-white font-bold text-sm">Time Keeper</span>
            </div>
          </div>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: `${isConnected ? ADMIN_COLORS.green : ADMIN_COLORS.red}20`, color: isConnected ? ADMIN_COLORS.green : ADMIN_COLORS.red }}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'animate-pulse' : ''}`}
              style={{ background: isConnected ? ADMIN_COLORS.green : ADMIN_COLORS.red }} />
            {isConnected ? 'Live' : 'Offline'}
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-5">
        <CompetitionLockBanner />

        <div className="rounded-2xl border p-5" style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle }}>
          <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: ADMIN_COLORS.saffron }}>Timing Session</p>
          <h1 className="text-xl sm:text-2xl font-black text-white">{gender} — {ageGroup}</h1>
          <p className="mt-1 text-sm text-white/50">
            {selectedTeam.name}
            {selectedCompetitionType?.label ? ` · ${selectedCompetitionType.label}` : ''}
            {apparatus ? ` · ${apparatus}` : ''}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Stopwatch — first: it is what the Time Keeper is here for */}
          <div className="lg:col-span-3">
            <StopwatchFace
              watch={watch}
              title={selected?.name}
              subtitle={apparatus}
              canStart={!!selected && !competitionLocked}
              onStop={handleStopped}
              onNext={handleNext}
              footer={watch.status === 'stopped' && selected ? (
                times[selectedId]?.sent ? (
                  <span className="flex flex-col items-center gap-0.5">
                    <span className="flex items-center gap-1" style={{ color: '#30D158' }}>
                      <Check className="w-3.5 h-3.5" aria-hidden="true" /> Sent to the Scorer
                    </span>
                    {deductionNote(times[selectedId]?.seconds) && (
                      <span style={{ color: '#FF453A' }}>{deductionNote(times[selectedId]?.seconds)}</span>
                    )}
                  </span>
                ) : (
                  <button type="button" onClick={() => sendTime(selected, times[selectedId]?.seconds)}
                    className="flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
                    style={{ color: '#FFD60A' }}>
                    <Send className="w-3.5 h-3.5" aria-hidden="true" /> Not received — send again
                  </button>
                )
              ) : nextMark ? `${nextMark.count === 1 ? 'Beep' : 'Double beep'} at ${nextMark.at}` : 'Past 90 — deduction applies'}
            />
          </div>
          {/* Athletes — below the clock (beside it on a wide screen) */}
          <div className="lg:col-span-2 rounded-2xl border p-4" style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: ADMIN_COLORS.saffron }}>Athletes</p>
            {rows.length === 0 ? (
              <p className="text-white/40 text-sm py-6 text-center">No athletes for this category.</p>
            ) : (
              <ul className="space-y-2">
                {rows.map((row) => {
                  const rec = times[row.id];
                  const active = row.id === selectedId;
                  return (
                    <li key={row.id}>
                      <button type="button" onClick={() => setSelectedId(row.id)} disabled={busy && !active}
                        aria-pressed={active}
                        className="w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left min-h-[52px] transition-colors disabled:opacity-40"
                        style={{
                          background: active ? `${ADMIN_COLORS.saffron}14` : 'rgba(255,255,255,0.02)',
                          borderColor: active ? `${ADMIN_COLORS.saffron}55` : ADMIN_COLORS.darkBorderSubtle,
                        }}>
                        <span className="text-sm font-bold text-white truncate">{row.name}</span>
                        {rec && (
                          <span className="flex items-center gap-1 text-xs font-bold flex-shrink-0"
                            style={{ color: rec.sent ? ADMIN_COLORS.green : ADMIN_COLORS.gold }}>
                            {rec.seconds} s {rec.sent ? <Check className="w-3.5 h-3.5" aria-label="sent to the Scorer" /> : <AlertCircle className="w-3.5 h-3.5" aria-label="not yet sent" />}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

        </div>
      </main>
    </div>
  );
};

export default TimeKeeperScoring;
