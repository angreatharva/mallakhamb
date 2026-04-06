import React from 'react';
import { useResponsive } from '../../hooks/useResponsive';
import { ResponsiveContainer } from './ResponsiveContainer';
import { ADMIN_COLORS } from '../../styles/tokens';

const C = ADMIN_COLORS;
const surface    = C.darkCard;
const elevated   = C.darkElevated;
const border     = C.darkBorderSubtle;
const borderMid  = C.darkBorderMid;
const textPrimary   = 'rgba(255,255,255,0.90)';
const textSecondary = 'rgba(255,255,255,0.50)';
const textMuted     = 'rgba(255,255,255,0.28)';

// ─── Medal config ─────────────────────────────────────────────────────────────
const MEDALS = [
  { emoji: '🥇', color: '#F5A623', bg: 'rgba(245,166,35,0.10)', border: 'rgba(245,166,35,0.25)' },
  { emoji: '🥈', color: '#94A3B8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.20)' },
  { emoji: '🥉', color: '#CD7F32', bg: 'rgba(205,127,50,0.10)', border: 'rgba(205,127,50,0.20)' },
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
    background: `${C.gold}22`, color: C.gold,
    border: `1px solid ${C.gold}44`,
    borderRadius: 20, padding: '1px 8px',
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

    return (
      <div style={{
        background: ms.bg,
        border: `1px solid ${ms.border}`,
        borderRadius: 14,
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
              {tied && <p style={{ fontSize: 11, color: C.gold, marginTop: 2 }}>{player.tieBreakNotes}</p>}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 20, fontWeight: 800, color: C.green }}>{player.finalScore?.toFixed(2) || '0.00'}</p>
            <p style={{ fontSize: 10, color: textMuted, letterSpacing: '0.04em' }}>FINAL</p>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${border}` }}>
          <ScoreChip value={player.averageMarks?.toFixed(2) || '0.00'} color={C.blue} label="Average" />
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
          {open ? '▲' : '▼'} Judge Scores
        </button>
        {open && player.judgeScores && (
          <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['seniorJudge', 'judge1', 'judge2', 'judge3', 'judge4'].map(key => (
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
            ))}
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
      <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: elevated }}>
              {['Rank', 'Player', 'Team', 'Time', 'Average', 'Senior Judge', 'Final Score'].map((h, i) => (
                <th key={i} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: textSecondary, borderBottom: `1px solid ${border}`, whiteSpace: 'nowrap' }}>
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
                  onMouseEnter={e => { e.currentTarget.style.background = `${C.saffron}08`; }}
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
                    {tied && <p style={{ fontSize: 11, color: C.gold, marginTop: 2 }}>{player.tieBreakNotes}</p>}
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: textSecondary, whiteSpace: 'nowrap' }}>{player.teamName}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: textSecondary, whiteSpace: 'nowrap' }}>{player.time || 'N/A'}</td>
                  <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{ background: `${C.blue}18`, color: C.blue, borderRadius: 8, padding: '3px 10px', fontSize: 13, fontWeight: 600 }}>
                      {player.averageMarks?.toFixed(2) || '0.00'}
                    </span>
                    {player.baseScoreApplied && (
                      <p style={{ fontSize: 10, color: C.purple, marginTop: 3, fontWeight: 600 }}>Base Score</p>
                    )}
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: textSecondary, whiteSpace: 'nowrap' }}>
                    {player.judgeScores?.seniorJudge?.toFixed(2) || '0.00'}
                  </td>
                  <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{ background: `${C.green}18`, color: C.green, borderRadius: 8, padding: '4px 12px', fontSize: 15, fontWeight: 800 }}>
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
        borderRadius: 14,
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
            <p style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, color: C.green }}>{team.teamTotalScore?.toFixed(2) || '0.00'}</p>
            <p style={{ fontSize: 10, color: textMuted, letterSpacing: '0.04em' }}>TOTAL</p>
            <p style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>Avg: {team.averageTeamScore?.toFixed(2) || '0.00'}</p>
          </div>
        </div>

        {/* Top players */}
        <div style={{ borderTop: `1px solid ${border}`, paddingTop: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: textMuted, marginBottom: 10 }}>Top Players</p>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 8 }}>
            {team.topPlayerScores?.map(player => (
              <div key={player.playerId} style={{
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${border}`,
                borderRadius: 10,
                padding: '10px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{player.playerName}</p>
                  <p style={{ fontSize: 11, color: textSecondary, marginTop: 1 }}>Time: {player.time || 'N/A'}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.green }}>{player.finalScore?.toFixed(2) || '0.00'}</p>
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
    background: disabled ? 'rgba(255,255,255,0.03)' : elevated,
    border: `1px solid ${borderMid}`,
    borderRadius: 10,
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
    borderRadius: 10,
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
          placeholder="Search..."
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          style={inputStyle}
          onFocus={e => { e.target.style.borderColor = `${C.saffron}70`; }}
          onBlur={e => { e.target.style.borderColor = borderMid; }}
        />
        <select
          value={selectedGender?.value || ''}
          onChange={e => onGenderChange(genders.find(g => g.value === e.target.value))}
          style={selectStyle()}
          onFocus={e => { e.target.style.borderColor = `${C.saffron}70`; }}
          onBlur={e => { e.target.style.borderColor = borderMid; }}
        >
          <option value="">Select Gender</option>
          {genders.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <select
          value={selectedAgeGroup?.value || ''}
          onChange={e => onAgeGroupChange(ageGroups.find(ag => ag.value === e.target.value))}
          style={selectStyle(!selectedGender)}
          disabled={!selectedGender}
          onFocus={e => { if (selectedGender) e.target.style.borderColor = `${C.saffron}70`; }}
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
