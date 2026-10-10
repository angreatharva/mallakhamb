import React from 'react';
import { useResponsive } from '../../hooks/useResponsive';
import { ResponsiveContainer } from './ResponsiveContainer';
import { ADMIN_COLORS, DATA_COLORS, alpha } from '../../styles/tokens';

const C = ADMIN_COLORS;
const surface    = C.darkCard;
const elevated   = C.darkElevated;
const border     = C.darkBorderSubtle;
const borderMid  = C.darkBorderMid;
const textPrimary   = 'var(--fg)';
const textSecondary = 'var(--fg-secondary)';
const textMuted     = 'var(--fg-muted)';

// ─── Medal config ─────────────────────────────────────────────────────────────
const MEDALS = [
  { emoji: '🥇', color: DATA_COLORS.gold, bg: 'rgba(245,166,35,0.10)', border: 'rgba(245,166,35,0.25)' },
  { emoji: '🥈', color: DATA_COLORS.silver, bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.20)' },
  { emoji: '🥉', color: DATA_COLORS.bronze, bg: 'rgba(205,127,50,0.10)', border: 'rgba(205,127,50,0.20)' },
];

const getMedalStyle = (index, searching) => {
  if (searching || index >= 3) return { bg: elevated, border };
  return { bg: MEDALS[index].bg, border: MEDALS[index].border };
};

// ─── Score chip ───────────────────────────────────────────────────────────────
const ScoreChip = ({ value, color, label }) => (
  <div style={{ textAlign: 'center' }}>
    <p style={{ fontSize: 15, fontWeight: 700, color }}>{value}</p>
    <p style={{ fontSize: 10, color: textMuted, marginTop: 1, letterSpacing: '0.04em' }}>{label}</p>
  </div>
);

// ─── Tied badge ───────────────────────────────────────────────────────────────
const TiedBadge = () => (
  <span style={{
    background: 'var(--warning-tint)', color: 'rgb(var(--warning-fg))',
    border: 0,
    borderRadius: 'var(--radius-control)', padding: '1px 8px',
    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
  }}>
    TIED
  </span>
);

// ─── ResponsiveIndividualRankings ─────────────────────────────────────────────
export const ResponsiveIndividualRankings = ({
  players = [],
  searchTerm = '',
  className = '',
  ...props
}) => {
  const { isMobile } = useResponsive();
  const isTied = (p) => p.tieBreakNotes?.length > 0;

  const PlayerCard = ({ player, index }) => {
    const medal = !searchTerm && index < 3 ? MEDALS[index] : null;
    const ms = getMedalStyle(index, !!searchTerm);
    const tied = isTied(player);
    const [open, setOpen] = React.useState(false);

    const is3JudgePanel = player.panelSize === 3 || (!player.judgeScores?.judge3 && !player.judgeScores?.judge4);

    const getAverageBreakdown = (p) => {
      const slips = p.judgeSlips || [];
      if (slips.length > 0) {
        const len = slips.length;
        const diff = slips.reduce((acc, s) => acc + (Number(s.difficultyScore) || 0), 0) / len;
        const comb = slips.reduce((acc, s) => acc + (Number(s.combinationScore) || 0), 0) / len;
        const exec = slips.reduce((acc, s) => acc + (Number(s.executionScore) || 0), 0) / len;
        const bonus = slips.reduce((acc, s) => acc + (Number(s.bonusScore) || 0), 0) / len;
        return { difficulty: diff, combination: comb, execution: exec, bonus: bonus };
      }
      const sb = p.scoreBreakdown || {};
      return {
        difficulty: Number(sb.difficulty?.total) || 0,
        combination: Number(sb.combination?.total) || 0,
        execution: Number(sb.execution) || 0,
        bonus: Number(sb.originality) || 0,
      };
    };

    const avgBreakdown = is3JudgePanel ? getAverageBreakdown(player) : null;

    return (
      <div style={{
        background: ms.bg,
        border: `1px solid ${ms.border}`,
        borderRadius: 'var(--radius-panel)',
        padding: '14px 16px',
        transition: 'box-shadow 0.15s',
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            {medal && <span style={{ fontSize: 22, flexShrink: 0 }}>{medal.emoji}</span>}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: textSecondary }}>
                  #{searchTerm ? player.originalRank : (player.rank || index + 1)}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>{player.playerName}</span>
                {tied && <TiedBadge />}
              </div>
              <p style={{ fontSize: 12, color: textSecondary, marginTop: 2 }}>{player.teamName}</p>
              {tied && <p style={{ fontSize: 11, color: DATA_COLORS.gold, marginTop: 2 }}>{player.tieBreakNotes}</p>}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 20, fontWeight: 800, color: 'rgb(var(--accent-fg))' }}>{player.finalScore?.toFixed(2) || '0.00'}</p>
            <p style={{ fontSize: 10, color: textMuted, letterSpacing: '0.04em' }}>FINAL</p>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${border}` }}>
          <ScoreChip value={player.averageMarks?.toFixed(2) || '0.00'} color="rgb(var(--info-fg))" label="Average" />
          <ScoreChip value={player.time || 'N/A'} color={textSecondary} label="Time" />
        </div>

        {/* Judge scores toggle */}
        <button
          onClick={() => setOpen(!open)}
          style={{
            marginTop: 10, width: '100%', background: 'none', border: 'none',
            cursor: 'pointer', color: textSecondary, fontSize: 12, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            padding: '6px 0',
          }}
        >
          {open ? '▲' : '▼'} {is3JudgePanel ? 'Score Breakdown' : 'Judge Scores'}
        </button>
        {open && (
          <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {is3JudgePanel ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: textSecondary }}>Avg Difficulty</span>
                  <span style={{ fontSize: 12, color: textPrimary, fontWeight: 600 }}>{avgBreakdown.difficulty.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: textSecondary }}>Avg Combination</span>
                  <span style={{ fontSize: 12, color: textPrimary, fontWeight: 600 }}>{avgBreakdown.combination.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: textSecondary }}>Avg Execution</span>
                  <span style={{ fontSize: 12, color: textPrimary, fontWeight: 600 }}>{avgBreakdown.execution.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: textSecondary }}>Avg Bonus</span>
                  <span style={{ fontSize: 12, color: textPrimary, fontWeight: 600 }}>{avgBreakdown.bonus.toFixed(2)}</span>
                </div>
              </>
            ) : (
              player.judgeScores && ['seniorJudge', 'judge1', 'judge2', 'judge3', 'judge4'].map(key => (
                player.judgeScores[key] !== undefined && (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: textSecondary, textTransform: 'capitalize' }}>
                      {key.replace(/([A-Z])/g, ' $1').replace('judge', 'Judge')}
                    </span>
                    <span style={{ fontSize: 12, color: textPrimary, fontWeight: 600 }}>
                      {player.judgeScores[key]?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                )
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  if (isMobile) {
    return (
      <ResponsiveContainer className={className} {...props}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {players.map((p, i) => <PlayerCard key={p.playerId} player={p} index={i} />)}
        </div>
      </ResponsiveContainer>
    );
  }

  // Desktop table
  return (
    <ResponsiveContainer className={className} {...props}>
      <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-panel)', border: `1px solid ${border}` }}>
        <table aria-label="Rankings" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: elevated }}>
              {['Rank', 'Player', 'Team', 'Time', 'Average', 'Senior Judge', 'Final Score'].map((h, i) => (
                <th key={i} scope="col" style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: textSecondary, borderBottom: `1px solid ${border}`, whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => {
              const medal = !searchTerm && index < 3 ? MEDALS[index] : null;
              const ms = getMedalStyle(index, !!searchTerm);
              const tied = isTied(player);
              return (
                <tr key={player.playerId} style={{ background: ms.bg, borderBottom: `1px solid ${border}`, transition: 'background 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${alpha(C.saffron, 0x08)}`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ms.bg; }}
                >
                  <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {medal && <span style={{ fontSize: 20 }}>{medal.emoji}</span>}
                      <span style={{ fontSize: 13, fontWeight: 700, color: medal ? medal.color : textSecondary }}>
                        #{searchTerm ? player.originalRank : (player.rank || index + 1)}
                      </span>
                      {tied && <TiedBadge />}
                    </div>
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{player.playerName}</p>
                    {tied && <p style={{ fontSize: 11, color: DATA_COLORS.gold, marginTop: 2 }}>{player.tieBreakNotes}</p>}
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: textSecondary, whiteSpace: 'nowrap' }}>{player.teamName}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: textSecondary, whiteSpace: 'nowrap' }}>{player.time || 'N/A'}</td>
                  <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{ background: 'var(--info-tint)', color: 'rgb(var(--info-fg))', borderRadius: 'var(--radius-control)', padding: '3px 10px', fontSize: 13, fontWeight: 600 }}>
                      {player.averageMarks?.toFixed(2) || '0.00'}
                    </span>
                    {player.baseScoreApplied && (
                      <p style={{ fontSize: 10, color: 'rgb(var(--cat-purple))', marginTop: 3, fontWeight: 600 }}>Base Score</p>
                    )}
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: textSecondary, whiteSpace: 'nowrap' }}>
                    {player.judgeScores?.seniorJudge?.toFixed(2) || '0.00'}
                  </td>
                  <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{ background: 'rgb(var(--surface-raised))', color: 'rgb(var(--accent-fg))', borderRadius: 'var(--radius-control)', padding: '4px 12px', fontSize: 15, fontWeight: 800 }}>
                      {player.finalScore?.toFixed(2) || '0.00'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ResponsiveContainer>
  );
};

// ─── ResponsiveTeamRankings ───────────────────────────────────────────────────
export const ResponsiveTeamRankings = ({
  teams = [],
  searchTerm = '',
  className = '',
  ...props
}) => {
  const { isMobile } = useResponsive();

  const TeamCard = ({ team, index }) => {
    const medal = !searchTerm && index < 3 ? MEDALS[index] : null;
    const ms = getMedalStyle(index, !!searchTerm);

    return (
      <div style={{
        background: ms.bg,
        border: `1px solid ${ms.border}`,
        borderRadius: 'var(--radius-panel)',
        padding: isMobile ? '14px 16px' : '18px 22px',
        transition: 'box-shadow 0.15s',
      }}>
        {/* Team header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            {medal
              ? <span style={{ fontSize: isMobile ? 24 : 28, flexShrink: 0 }}>{medal.emoji}</span>
              : <span style={{ fontSize: 14, fontWeight: 700, color: textSecondary, flexShrink: 0 }}>
                  #{searchTerm ? team.originalRank : index + 1}
                </span>
            }
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: isMobile ? 15 : 17, fontWeight: 700, color: textPrimary }}>{team.teamName}</p>
              <p style={{ fontSize: 12, color: textSecondary, marginTop: 2 }}>
                {team.playerCount} player{team.playerCount !== 1 ? 's' : ''} scored
              </p>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, color: 'rgb(var(--accent-fg))' }}>{team.teamTotalScore?.toFixed(2) || '0.00'}</p>
            <p style={{ fontSize: 10, color: textMuted, letterSpacing: '0.04em' }}>TOTAL</p>
            <p style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>Avg: {team.averageTeamScore?.toFixed(2) || '0.00'}</p>
          </div>
        </div>

        {/* Top players */}
        <div style={{ borderTop: `1px solid ${border}`, paddingTop: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: textMuted, marginBottom: 10 }}>Counted Scores</p>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 8 }}>
            {team.topPlayerScores?.map(player => (
              <div key={player.playerId} style={{
                background: 'rgb(var(--ink) / 0.04)',
                border: `1px solid ${border}`,
                borderRadius: 'var(--radius-control)',
                padding: '10px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{player.playerName}</p>
                  <p style={{ fontSize: 11, color: textSecondary, marginTop: 1 }}>
                    {player.apparatus ? `${String(player.apparatus).replace(' Mallakhamb', '')} · ` : ''}Time: {player.time || 'N/A'}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'rgb(var(--accent-fg))' }}>{player.finalScore?.toFixed(2) || '0.00'}</p>
                  <p style={{ fontSize: 10, color: textMuted }}>Avg: {player.averageMarks?.toFixed(2) || '0.00'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <ResponsiveContainer className={className} {...props}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 14 }}>
        {teams.map((team, i) => <TeamCard key={team.teamId} team={team} index={i} />)}
      </div>
    </ResponsiveContainer>
  );
};

// ─── ResponsiveRankingsFilters ────────────────────────────────────────────────
export const ResponsiveRankingsFilters = ({
  searchTerm,
  onSearchChange,
  selectedGender,
  onGenderChange,
  selectedAgeGroup,
  onAgeGroupChange,
  genders = [],
  ageGroups = [],
  className = '',
  ...props
}) => {
  const { isMobile } = useResponsive();

  const selectStyle = (disabled = false) => ({
    width: '100%',
    padding: '9px 12px',
    background: disabled ? 'rgb(var(--ink) / 0.03)' : elevated,
    border: `1px solid ${borderMid}`,
    borderRadius: 'var(--radius-control)',
    color: disabled ? textMuted : textPrimary,
    fontSize: 13,
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
  });

  const inputStyle = {
    width: '100%',
    padding: '9px 12px',
    background: elevated,
    border: `1px solid ${borderMid}`,
    borderRadius: 'var(--radius-control)',
    color: textPrimary,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <ResponsiveContainer className={className} {...props}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
        <input
          type="text"
          placeholder="Search..." aria-label="Search athletes"
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          style={inputStyle}
          onFocus={e => { e.target.style.borderColor = `${alpha(C.saffron, 0x70)}`; }}
          onBlur={e => { e.target.style.borderColor = borderMid; }}
        />
        <select
          value={selectedGender?.value || ''} aria-label="Gender"
          onChange={e => onGenderChange(genders.find(g => g.value === e.target.value))}
          style={selectStyle()}
          onFocus={e => { e.target.style.borderColor = `${alpha(C.saffron, 0x70)}`; }}
          onBlur={e => { e.target.style.borderColor = borderMid; }}
        >
          <option value="">Select Gender</option>
          {genders.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <select
          value={selectedAgeGroup?.value || ''} aria-label="Age group"
          onChange={e => onAgeGroupChange(ageGroups.find(ag => ag.value === e.target.value))}
          style={selectStyle(!selectedGender)}
          disabled={!selectedGender}
          onFocus={e => { if (selectedGender) e.target.style.borderColor = `${alpha(C.saffron, 0x70)}`; }}
          onBlur={e => { e.target.style.borderColor = borderMid; }}
        >
          <option value="">Select Age Group</option>
          {ageGroups.map(ag => <option key={ag.value} value={ag.value}>{ag.label}</option>)}
        </select>
      </div>
    </ResponsiveContainer>
  );
};

export default {
  ResponsiveIndividualRankings,
  ResponsiveTeamRankings,
  ResponsiveRankingsFilters,
};
