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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion } from 'framer-motion';
import { ArrowLeft, Timer, Play, Pause, Square, RotateCcw, Send, Check, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { logger } from '@/infrastructure/logger';
import { secureStorage } from '@/utils/auth/secureStorage';
import { ADMIN_COLORS } from '../../styles/tokens';
import CompetitionLockBanner from '@/components/competition/CompetitionLockBanner';
import { useCompetitionLock } from '@/hooks/useCompetitionLock';
import { buildScorerRows } from './scorerRows';
import { apparatusKey } from '@/utils/scoring/apparatus';
import { resolveJudgeSeat } from './useJudgePanelData';
import { useStopwatch, playBeeps, BEEP_MARKS } from './timeKeeper';

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
  const seat = resolveJudgeSeat(judgeInfo, { gender, ageGroup, competitionType: compType, apparatus });
  useEffect(() => {
    if (!judgeInfo) {
      toast.error('Please login first');
      navigate('/judge/login');
    } else if (!selectedTeam || !gender || !ageGroup) {
      navigate('/judge/dashboard');
    } else if (seat?.judgeType !== 'Time Keeper') {
      toast.error('This page is only for the Time Keeper of this category');
      navigate('/judge/dashboard');
    }
  }, [judgeInfo, selectedTeam, gender, ageGroup, seat?.judgeType, navigate]);

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

  // ── Sound ──────────────────────────────────────────────────────────────────
  const audioRef = useRef(null);
  const ensureAudio = () => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioRef.current) audioRef.current = new Ctx();
    audioRef.current.resume?.();
  };
  useEffect(() => () => { audioRef.current?.close?.(); }, []);

  const watch = useStopwatch({ onMark: (mark) => playBeeps(audioRef.current, mark.count) });

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
  const handleStart = () => {
    if (!selected) { toast.error('Choose the athlete first'); return; }
    ensureAudio();
    watch.start();
  };

  const handleStop = () => {
    const seconds = watch.stop();
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

  const btn = 'flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-black text-base text-white min-h-[56px] flex-1 disabled:opacity-40 disabled:cursor-not-allowed';
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
          {/* Athletes */}
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

          {/* Stopwatch */}
          <div className="lg:col-span-3 rounded-2xl border p-6 flex flex-col items-center text-center"
            style={{ background: ADMIN_COLORS.darkCard, borderColor: running ? `${ADMIN_COLORS.saffron}55` : ADMIN_COLORS.darkBorderSubtle }}>
            <p className="text-sm font-bold text-white/70 min-h-[20px]">{selected ? selected.name : 'Choose an athlete'}</p>

            <div className="my-6" role="timer" aria-live="off">
              <span className="block font-black tabular-nums leading-none text-white"
                style={{ fontSize: 'clamp(5rem, 22vw, 10rem)', color: watch.seconds >= 90 ? ADMIN_COLORS.red : '#fff' }}
                data-testid="timer-seconds">
                {watch.seconds}
              </span>
              <span className="text-xs uppercase tracking-widest text-white/40">seconds</span>
            </div>

            <p className="text-xs text-white/40 mb-5">
              {watch.status === 'stopped'
                ? (times[selectedId]?.sent ? 'Sent to the Scorer' : 'Stopped — not yet received by the Scorer')
                : nextMark
                  ? `${nextMark.count === 1 ? 'Beep' : 'Double beep'} at ${nextMark.at}`
                  : 'Past 90 — time deduction applies'}
            </p>

            <div className="w-full flex flex-col sm:flex-row gap-3">
              {watch.status === 'idle' && (
                <motion.button type="button" onClick={handleStart} disabled={!selected || competitionLocked}
                  className={btn} style={{ background: `linear-gradient(135deg, ${ADMIN_COLORS.green}, #16A34A)` }}
                  whileTap={{ scale: 0.97 }}>
                  <Play className="w-5 h-5" aria-hidden="true" /> Start
                </motion.button>
              )}
              {running && (
                <motion.button type="button" onClick={watch.pause} className={btn}
                  style={{ background: `linear-gradient(135deg, ${ADMIN_COLORS.gold}, #D97706)` }} whileTap={{ scale: 0.97 }}>
                  <Pause className="w-5 h-5" aria-hidden="true" /> Pause
                </motion.button>
              )}
              {watch.status === 'paused' && (
                <motion.button type="button" onClick={watch.resume} className={btn}
                  style={{ background: `linear-gradient(135deg, ${ADMIN_COLORS.green}, #16A34A)` }} whileTap={{ scale: 0.97 }}>
                  <Play className="w-5 h-5" aria-hidden="true" /> Resume
                </motion.button>
              )}
              {busy && (
                <motion.button type="button" onClick={handleStop} className={btn}
                  style={{ background: `linear-gradient(135deg, ${ADMIN_COLORS.red}, #B91C1C)` }} whileTap={{ scale: 0.97 }}>
                  <Square className="w-5 h-5" aria-hidden="true" /> Stop
                </motion.button>
              )}
              {watch.status === 'stopped' && (
                <>
                  {!times[selectedId]?.sent && (
                    <motion.button type="button" onClick={() => sendTime(selected, times[selectedId].seconds)} className={btn}
                      style={{ background: `linear-gradient(135deg, ${ADMIN_COLORS.purple}, ${ADMIN_COLORS.purpleDark})` }} whileTap={{ scale: 0.97 }}>
                      <Send className="w-5 h-5" aria-hidden="true" /> Send again
                    </motion.button>
                  )}
                  <motion.button type="button" onClick={handleNext} className={btn}
                    style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${ADMIN_COLORS.darkBorderMid}` }} whileTap={{ scale: 0.97 }}>
                    <RotateCcw className="w-5 h-5" aria-hidden="true" /> Next athlete
                  </motion.button>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TimeKeeperScoring;
