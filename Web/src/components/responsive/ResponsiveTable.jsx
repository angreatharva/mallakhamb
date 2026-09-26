import { useResponsive } from '../../hooks/useResponsive';
import { ResponsiveContainer } from './ResponsiveContainer';
import { ADMIN_COLORS } from '../../styles/tokens';
import { calculateAverageMarks, calculateFinalScore } from '../../utils/scoring/copRules';

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
/*
 * `fluid` fills the cell instead of claiming a fixed 80px.
 *
 * The scoring sheet's desktop table divides the width it HAS between its
 * columns (see the `tableLayout: fixed` note there), so a cell can be narrower
 * than 80px — and an input that insists on 80 would spill out of it. The
 * mobile cards are a label-and-field row with room to spare, and keep the
 * fixed width so the fields line up down the card.
 */
const inputStyle = (locked, fluid = false) => ({
  background: locked ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
  border: `1px solid ${locked ? border : borderMid}`,
  borderRadius: 8,
  color: locked ? textSecondary : textPrimary,
  padding: fluid ? '6px 8px' : '6px 10px',
  fontSize: 13,
  outline: 'none',
  width: fluid ? '100%' : 80,
  minWidth: fluid ? 0 : undefined,
  boxSizing: 'border-box',
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

// ─── ScoreInputCell ───────────────────────────────────────────────────────────
//
// A mark cell (type "number") is a plain TEXT field that only accepts a
// decimal number — never a native `type="number"` input. Those carry spinner
// arrows, and the mouse wheel over a focused one changes the value: a scorer
// scrolling the sheet was silently altering marks. Digits and one point only
// ("," is read as "."), with leading zeros dropped ("03" → "3", "0.5" stays).
// Values stay strings, as the sheet has always stored them.
const toMarkText = (raw) => {
  const text = String(raw).replace(/,/g, '.');
  if (!/^\d*\.?\d*$/.test(text)) return null;
  return text.replace(/^0+(?=\d)/, '');
};

const ScoreInputCell = ({ value = '', onChange, isLocked, placeholder, type = 'number', fluid = false }) => (
  <input
    type="text"
    inputMode={type === 'number' ? 'decimal' : undefined}
    autoComplete="off"
    value={value ?? ''}
    onChange={e => {
      if (type !== 'number') { onChange(e.target.value); return; }
      const text = toMarkText(e.target.value);
      if (text !== null) onChange(text);
    }}
    disabled={isLocked}
    placeholder={placeholder}
    style={inputStyle(isLocked, fluid)}
    onFocus={e => { if (!isLocked) e.target.style.borderColor = `${C.saffron}80`; }}
    onBlur={e => { e.target.style.borderColor = isLocked ? border : borderMid; }}
  />
);

// ─── ResponsiveScoringTable ───────────────────────────────────────────────────
export const ResponsiveScoringTable = ({
  players = [],
  scores = {},
  judges = [],
  panelSize: seatedPanelSize,
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

  /*
   * A seat may name the cell it reads. `mirrorChiefSeat` (utils/scoring/
   * judgePanel) uses that to point the Sr. Judge's copy in the vacant Judge 4
   * column back at the Sr. Judge's own cell, so the two can never disagree.
   */
  const fieldOf = (judge) => judge?.scoreField || fieldMap[judge?.judgeType] || 'seniorJudge';

  /*
   * The seated panel decides which rule applies, so it is passed in rather
   * than inferred from how many marks have been typed. Without it a 5-judge
   * sheet with three marks entered reads as a 3-judge panel — simple average,
   * no tolerance — and the numbers on screen change as the fourth and fifth
   * arrive.
   *
   * COLUMNS ARE NOT SEATS once a 4-judge panel is drawn with the Chief's copy
   * in it: five columns, four judges. Callers that mirror pass the seated size
   * explicitly; `judges.length` is still the answer for everyone else.
   */
  const panelSize = seatedPanelSize || judges.length || undefined;

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
                <label style={{ fontSize: 12, color: textSecondary }}>
                  Time <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <ScoreInputCell
                  value={scores[player.id]?.time}
                  onChange={val => onScoreChange(player.id, 'time', val)}
                  isLocked={isLocked}
                  placeholder="00:00"
                  type="text"
                />
              </div>

              {/* Judge scores */}
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: textMuted, marginBottom: 8 }}>Judge Scores</p>
              {judges.map(judge => {
                const field = fieldOf(judge);
                return (
                  <div key={judge._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <label style={{ fontSize: 12, color: textSecondary, display: 'block' }}>{judge.judgeType}</label>
                      {judge.name && <span style={{ fontSize: 10, color: C.purpleLight, opacity: 0.85 }}>{judge.name}</span>}
                      {judge.isChiefCopy && (
                        <span style={{ fontSize: 10, color: textMuted, display: 'block' }}>Senior Judge&rsquo;s mark</span>
                      )}
                    </div>
                    <ScoreInputCell
                      value={scores[player.id]?.[field]}
                      onChange={val => onScoreChange(player.id, field, val)}
                      // The copy is typed once, in the Sr. Judge's own cell.
                      isLocked={isLocked || !!judge.isChiefCopy}
                      placeholder="0.0"
                      type="number"
                    />
                  </div>
                );
              })}

              {/* Calculated */}
              <div style={{ borderTop: `1px solid ${border}`, paddingTop: 12, marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: textSecondary }}>Average</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {(() => {
                      const result = calculateAverageMarks(scores[player.id] || {}, panelSize);
                      return (
                        <>
                          {result.baseScoreApplied && (
                            <span style={{ fontSize: 10, background: `${C.amber}22`, color: C.amber, padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                              Base Score Applied (±{result.tolerance.toFixed(2)})
                            </span>
                          )}
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.blue }}>{result.average.toFixed(2)}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, color: textSecondary }}>Deduction</label>
                  <ScoreInputCell
                    value={scores[player.id]?.deduction}
                    onChange={val => onScoreChange(player.id, 'deduction', val)}
                    isLocked={isLocked}
                    placeholder="0.0"
                    type="number"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: textSecondary }}>Other Deduction</label>
                  <ScoreInputCell
                    value={scores[player.id]?.otherDeduction}
                    onChange={val => onScoreChange(player.id, 'otherDeduction', val)}
                    isLocked={isLocked}
                    placeholder="0.0"
                    type="number"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: `1px solid ${border}` }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>Final Score</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: C.green }}>{calculateFinalScore(scores[player.id] || {}, panelSize)}</span>
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
        {/*
          * THE SHEET FITS THE SCREEN; IT DOES NOT SCROLL SIDEWAYS.
          *
          * `tableLayout: fixed` is what makes that true. With the default auto
          * layout every column asks for the width of its widest content — an
          * 80px input plus 28px of padding, or an unbreakable `SENIOR JUDGE` —
          * and the table simply grows past its container: eleven columns needed
          * 1156px in an 837px card, so the Scorer had to scroll right to reach
          * the deductions and the final score, on the one screen where every
          * number has to be visible at once.
          *
          * Fixed layout inverts that. The table takes the width it HAS and
          * divides it: the participant column gets a fixed share (it holds two
          * lines of prose, not a number) and the rest split what is left
          * EQUALLY, so a 3-judge panel gets wide columns and a 5-judge panel
          * gets narrow ones without a number in this file changing.
          *
          * What each cell must then accept, because no cell can push back:
          *   - inputs fill their cell (`fluid`) instead of claiming 80px;
          *   - headers wrap. `SENIOR JUDGE` breaking over two lines is the
          *     mechanism, not a defect — `nowrap` here is what forced the
          *     overflow in the first place.
          *
          * `overflowX: auto` above stays as a backstop for a panel nobody has
          * seated yet; it should never have anything to scroll.
          */}
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            {/* Named athletes and squads, so it is given room; every other
                column holds a number and takes an equal share of the rest. */}
            <col style={{ width: '16%' }} />
          </colgroup>
          <thead>
            <tr style={{ background: elevated }}>
              {/* `Time Ded.` rather than `Deduction`: it is the time penalty —
                  the cell below derives it from the time — and the two-word
                  form wraps at its space instead of breaking mid-word in a
                  column this narrow, matching `Other Ded.` beside it. */}
              {['Participant', 'Time', ...judges.map(j => j.judgeType), 'Average', 'Time Ded.', 'Other Ded.', 'Final Score'].map((h, i) => {
                const judgeObj = judges[i - 2]; // offset by 2 (Participant, Time)
                const isJudgeCol = i >= 2 && i < 2 + judges.length;
                return (
                  <th key={i} style={{ padding: '10px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: textSecondary, borderBottom: `1px solid ${border}`, overflowWrap: 'break-word' }}>
                    {h === 'Time' ? <>{h} <span style={{ color: '#EF4444' }}>*</span></> : h}
                    {isJudgeCol && judgeObj?.name && (
                      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: C.purpleLight, marginTop: 2, opacity: 0.85 }}>{judgeObj.name}</div>
                    )}
                    {isJudgeCol && judgeObj?.isChiefCopy && (
                      <div style={{ fontSize: 9, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: textMuted, marginTop: 1 }}>Senior Judge&rsquo;s mark</div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {players.map((player, ri) => (
              <tr key={player.id} style={{ background: ri % 2 === 0 ? surface : 'rgba(255,255,255,0.015)', borderBottom: `1px solid ${border}` }}>
                <td style={{ padding: '12px 8px', overflowWrap: 'break-word' }}>
                  <p style={{ fontWeight: 600, color: textPrimary, fontSize: 13 }}>{player.name}</p>
                  {player.teamName && <p style={{ fontSize: 11, color: textSecondary }}>{player.teamName}</p>}
                </td>
                <td style={{ padding: '12px 8px' }}>
                  <ScoreInputCell
                    value={scores[player.id]?.time}
                    onChange={val => onScoreChange(player.id, 'time', val)}
                    isLocked={isLocked}
                    placeholder="00:00"
                    type="text"
                    fluid
                  />
                </td>
                {judges.map(judge => {
                  const field = fieldOf(judge);
                  return (
                    <td key={judge._id} style={{ padding: '12px 8px' }}>
                      <ScoreInputCell
                        value={scores[player.id]?.[field]}
                        onChange={val => onScoreChange(player.id, field, val)}
                        // The copy is typed once, in the Sr. Judge's own cell.
                        isLocked={isLocked || !!judge.isChiefCopy}
                        placeholder="0.0"
                        type="number"
                        fluid
                      />
                    </td>
                  );
                })}
                <td style={{ padding: '12px 8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    <span style={{ background: `${C.blue}18`, color: C.blue, borderRadius: 8, padding: '4px 8px', fontSize: 13, fontWeight: 600 }}>
                      {(() => {
                        const result = calculateAverageMarks(scores[player.id] || {}, panelSize);
                        return result.average.toFixed(2);
                      })()}
                    </span>
                    {(() => {
                      const result = calculateAverageMarks(scores[player.id] || {}, panelSize);
                      if (result.baseScoreApplied) {
                        return (
                          // Wraps: this badge is ~110px on one line and the
                          // column it sits in is narrower than that.
                          <span style={{ fontSize: 9, background: `${C.amber}22`, color: C.amber, padding: '2px 6px', borderRadius: 4, fontWeight: 600, lineHeight: 1.3 }}>
                            Base Score (±{result.tolerance.toFixed(2)})
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </td>
                <td style={{ padding: '12px 8px' }}>
                  <ScoreInputCell
                    value={scores[player.id]?.deduction}
                    onChange={val => onScoreChange(player.id, 'deduction', val)}
                    isLocked={isLocked}
                    placeholder="0.0"
                    type="number"
                    fluid
                  />
                </td>
                <td style={{ padding: '12px 8px' }}>
                  <ScoreInputCell
                    value={scores[player.id]?.otherDeduction}
                    onChange={val => onScoreChange(player.id, 'otherDeduction', val)}
                    isLocked={isLocked}
                    placeholder="0.0"
                    type="number"
                    fluid
                  />
                </td>
                <td style={{ padding: '12px 8px' }}>
                  <span style={{ background: `${C.green}18`, color: C.green, borderRadius: 8, padding: '4px 8px', fontSize: 14, fontWeight: 700 }}>
                    {calculateFinalScore(scores[player.id] || {}, panelSize)}
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
