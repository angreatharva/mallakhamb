import React from 'react';
import { useResponsive } from '../../hooks/useResponsive';
import { ResponsiveContainer } from './ResponsiveContainer';
import { ADMIN_COLORS } from '../../styles/tokens';

// ─── Shared token shortcuts ───────────────────────────────────────────────────
const C = ADMIN_COLORS;
const surface  = C.darkCard;       // #111
const elevated = C.darkElevated;   // #161616
const border   = C.darkBorderSubtle;
const borderMid = C.darkBorderMid;
const textPrimary   = 'rgba(255,255,255,0.90)';
const textSecondary = 'rgba(255,255,255,0.50)';
const textMuted     = 'rgba(255,255,255,0.30)';

// ─── Shared input style ───────────────────────────────────────────────────────
const inputStyle = (locked) => ({
  background: locked ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
  border: `1px solid ${locked ? border : borderMid}`,
  borderRadius: 8,
  color: locked ? textSecondary : textPrimary,
  padding: '6px 10px',
  fontSize: 13,
  outline: 'none',
  width: 80,
  cursor: locked ? 'not-allowed' : 'text',
  transition: 'border-color 0.15s',
});

// ─── Pill badge ───────────────────────────────────────────────────────────────
const Pill = ({ children, color }) => (
  <span style={{
    background: `${color}22`,
    color,
    border: `1px solid ${color}44`,
    borderRadius: 20,
    padding: '2px 10px',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.03em',
  }}>
    {children}
  </span>
);

// ─── Empty state ──────────────────────────────────────────────────────────────
const EmptyState = ({ message = 'No data available' }) => (
  <div style={{ textAlign: 'center', padding: '40px 16px', color: textMuted, fontSize: 14 }}>
    {message}
  </div>
);

// ─── ResponsiveTable ─────────────────────────────────────────────────────────
export const ResponsiveTable = ({
  columns = [],
  data = [],
  type = 'data',
  renderMobileCard = null,
  className = '',
  mobileConfig = {},
  onRowClick = null,
  ...props
}) => {
  const { isMobile } = useResponsive();

  const defaultMobileCardRenderer = (item, index) => (
    <div
      key={index}
      onClick={() => onRowClick?.(item)}
      style={{
        background: elevated,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: '14px 16px',
        cursor: onRowClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { if (onRowClick) { e.currentTarget.style.borderColor = `${C.saffron}44`; e.currentTarget.style.boxShadow = `0 4px 20px rgba(0,0,0,0.4)`; }}}
      onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {columns.map((col, ci) => {
        if (col.hideOnMobile) return null;
        const value = col.accessor ? item[col.accessor] : col.render ? col.render(item) : '';
        return (
          <div key={ci} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: ci < columns.length - 1 ? 10 : 0 }}>
            <span style={{ fontSize: 12, color: textSecondary, flexShrink: 0, marginRight: 12 }}>{col.header}</span>
            <span style={{ fontSize: 13, color: textPrimary, textAlign: 'right' }}>{value}</span>
          </div>
        );
      })}
    </div>
  );

  if (isMobile) {
    const cardRenderer = renderMobileCard || defaultMobileCardRenderer;
    return (
      <ResponsiveContainer className={className} {...props}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.length === 0 ? <EmptyState /> : data.map((item, i) => cardRenderer(item, i))}
        </div>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer className={className} {...props}>
      <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: elevated }}>
              {columns.map((col, i) => (
                <th key={i} style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: textSecondary,
                  borderBottom: `1px solid ${border}`,
                  whiteSpace: 'nowrap',
                }} className={col.className || ''}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0
              ? <tr><td colSpan={columns.length}><EmptyState /></td></tr>
              : data.map((item, ri) => (
                <tr key={ri}
                  onClick={() => onRowClick?.(item)}
                  style={{
                    background: ri % 2 === 0 ? surface : 'rgba(255,255,255,0.015)',
                    cursor: onRowClick ? 'pointer' : 'default',
                    transition: 'background 0.12s',
                    borderBottom: `1px solid ${border}`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${C.saffron}0A`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ri % 2 === 0 ? surface : 'rgba(255,255,255,0.015)'; }}
                >
                  {columns.map((col, ci) => (
                    <td key={ci} style={{ padding: '13px 16px', fontSize: 13, color: textPrimary, whiteSpace: 'nowrap' }} className={col.cellClassName || ''}>
                      {col.accessor ? item[col.accessor] : col.render ? col.render(item) : ''}
                    </td>
                  ))}
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </ResponsiveContainer>
  );
};

// ─── ResponsiveScoringTable ───────────────────────────────────────────────────
export const ResponsiveScoringTable = ({
  players = [],
  scores = {},
  judges = [],
  onScoreChange,
  isLocked = false,
  className = '',
  ...props
}) => {
  const { isMobile } = useResponsive();

  const fieldMap = {
    'Senior Judge': 'seniorJudge',
    'Judge 1': 'judge1',
    'Judge 2': 'judge2',
    'Judge 3': 'judge3',
    'Judge 4': 'judge4',
  };

  const calculateAverageMarks = (ps) => {
    const judgeScores = [ps.seniorJudge, ps.judge1, ps.judge2, ps.judge3, ps.judge4]
      .map(Number).filter(s => s > 0);
    if (!judgeScores.length) return '0.00';
    if (judgeScores.length <= 3) return (judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length).toFixed(2);
    const sorted = [...judgeScores].sort((a, b) => a - b);
    const trimmed = sorted.slice(1, -1);
    return (trimmed.reduce((a, b) => a + b, 0) / trimmed.length).toFixed(2);
  };

  const calculateFinalScore = (ps) => {
    const avg = parseFloat(calculateAverageMarks(ps));
    return Math.max(0, avg - (parseFloat(ps.deduction) || 0) - (parseFloat(ps.otherDeduction) || 0)).toFixed(2);
  };

  const ScoreInput = ({ playerId, field, placeholder, type = 'number', step, min, max }) => (
    <input
      type={type}
      step={step}
      min={min}
      max={max}
      value={scores[playerId]?.[field] || ''}
      onChange={e => onScoreChange(playerId, field, e.target.value)}
      disabled={isLocked}
      placeholder={placeholder}
      style={inputStyle(isLocked)}
      onFocus={e => { if (!isLocked) e.target.style.borderColor = `${C.saffron}80`; }}
      onBlur={e => { e.target.style.borderColor = isLocked ? border : borderMid; }}
    />
  );

  if (isMobile) {
    return (
      <ResponsiveContainer className={className} {...props}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {players.map(player => (
            <div key={player.id} style={{ background: elevated, border: `1px solid ${border}`, borderRadius: 14, padding: 16 }}>
              {/* Header */}
              <div style={{ borderBottom: `1px solid ${border}`, paddingBottom: 12, marginBottom: 14 }}>
                <p style={{ fontWeight: 700, color: textPrimary, fontSize: 15 }}>{player.name}</p>
                {player.teamName && <p style={{ fontSize: 12, color: textSecondary, marginTop: 2 }}>{player.teamName}</p>}
              </div>

              {/* Time */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: textSecondary }}>Time</label>
                <ScoreInput playerId={player.id} field="time" placeholder="00:00" type="text" />
              </div>

              {/* Judge scores */}
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: textMuted, marginBottom: 8 }}>Judge Scores</p>
              {judges.map(judge => {
                const field = fieldMap[judge.judgeType] || 'seniorJudge';
                return (
                  <div key={judge._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 12, color: textSecondary }}>{judge.judgeType}</label>
                    <ScoreInput playerId={player.id} field={field} placeholder="0.0" step="0.1" min="0" max="10" />
                  </div>
                );
              })}

              {/* Calculated */}
              <div style={{ borderTop: `1px solid ${border}`, paddingTop: 12, marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: textSecondary }}>Average</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.blue }}>{calculateAverageMarks(scores[player.id] || {})}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, color: textSecondary }}>Deduction</label>
                  <ScoreInput playerId={player.id} field="deduction" placeholder="0.0" step="0.1" min="0" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: textSecondary }}>Other Deduction</label>
                  <ScoreInput playerId={player.id} field="otherDeduction" placeholder="0.0" step="0.1" min="0" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: `1px solid ${border}` }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>Final Score</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: C.green }}>{calculateFinalScore(scores[player.id] || {})}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer className={className} {...props}>
      <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: elevated }}>
              {['Participant', 'Time', ...judges.map(j => j.judgeType), 'Average', 'Deduction', 'Other Ded.', 'Final Score'].map((h, i) => (
                <th key={i} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: textSecondary, borderBottom: `1px solid ${border}`, whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((player, ri) => (
              <tr key={player.id} style={{ background: ri % 2 === 0 ? surface : 'rgba(255,255,255,0.015)', borderBottom: `1px solid ${border}` }}>
                <td style={{ padding: '12px 14px' }}>
                  <p style={{ fontWeight: 600, color: textPrimary, fontSize: 13 }}>{player.name}</p>
                  {player.teamName && <p style={{ fontSize: 11, color: textSecondary }}>{player.teamName}</p>}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <ScoreInput playerId={player.id} field="time" placeholder="00:00" type="text" />
                </td>
                {judges.map(judge => {
                  const field = fieldMap[judge.judgeType] || 'seniorJudge';
                  return (
                    <td key={judge._id} style={{ padding: '12px 14px' }}>
                      <ScoreInput playerId={player.id} field={field} placeholder="0.0" step="0.1" min="0" max="10" />
                    </td>
                  );
                })}
                <td style={{ padding: '12px 14px' }}>
                  <span style={{ background: `${C.blue}18`, color: C.blue, borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 600 }}>
                    {calculateAverageMarks(scores[player.id] || {})}
                  </span>
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <ScoreInput playerId={player.id} field="deduction" placeholder="0.0" step="0.1" min="0" />
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <ScoreInput playerId={player.id} field="otherDeduction" placeholder="0.0" step="0.1" min="0" />
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <span style={{ background: `${C.green}18`, color: C.green, borderRadius: 8, padding: '4px 10px', fontSize: 14, fontWeight: 700 }}>
                    {calculateFinalScore(scores[player.id] || {})}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ResponsiveContainer>
  );
};

// ─── ResponsiveTeamTable ──────────────────────────────────────────────────────
export const ResponsiveTeamTable = ({
  teams = [],
  onTeamClick,
  searchTerm = '',
  className = '',
  ...props
}) => {
  const { isMobile } = useResponsive();

  const TeamCard = ({ team, compact = false }) => (
    <div
      onClick={() => onTeamClick?.(team._id)}
      style={{
        background: elevated,
        border: `1px solid ${border}`,
        borderRadius: 14,
        padding: compact ? '14px 16px' : '18px 20px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.purple}55`; e.currentTarget.style.boxShadow = `0 4px 24px rgba(0,0,0,0.5)`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <p style={{ fontWeight: 700, color: textPrimary, fontSize: compact ? 14 : 16, marginBottom: 6 }}>
            {team.team?.name || team.name}
          </p>
          <p style={{ fontSize: 12, color: textSecondary, marginBottom: 2 }}>
            Coach: {team.coach?.name || 'Unassigned'}
          </p>
          {team.coach?.email && (
            <p style={{ fontSize: 11, color: textMuted }}>{team.coach.email}</p>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, width: 'auto' }}>
          <div style={{ background: `${C.purple}18`, border: `1px solid ${C.purple}30`, borderRadius: 10, padding: '8px 14px', marginBottom: 6 }}>
            <p style={{ fontSize: 11, color: C.purpleLight, fontWeight: 600, letterSpacing: '0.04em' }}>Players</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: C.purple }}>{team.players?.length || 0}</p>
          </div>
          <span style={{ fontSize: 12, color: C.purpleLight, fontWeight: 500 }}>View Details →</span>
        </div>
      </div>
    </div>
  );

  // Remove ResponsiveContainer wrapper to match parent container width
  return (
    <div className={className} {...props}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 14 }}>
        {teams.length === 0 ? <EmptyState message="No teams found" /> : teams.map(team => (
          <TeamCard key={team._id} team={team} compact={isMobile} />
        ))}
      </div>
    </div>
  );
};

export default ResponsiveTable;
