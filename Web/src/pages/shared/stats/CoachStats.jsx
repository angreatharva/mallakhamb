import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Medal, TrendingUp, Trophy, Users } from 'lucide-react';
import { statsAPI } from '@/services/api';
import { logger } from '@/infrastructure/logger';
import { Button, EmptyState, ErrorState, Heading, Panel, TextLink } from '@/components/ui';
import {
  ChartCard, Heatmap, LineChart, Sparkline, StackedBars, StatTile, SECTIONS, apparatusLabel, fmt, niceDomain, ordinal, signed, viz,
} from '@/components/charts';
import AthleteCareer from './AthleteCareer';
import PerformanceDetail from './PerformanceDetail';
import StatsFilters from './StatsFilters';
import { toggleApparatus } from './PlayerStats';
import { apparatusPresent, athleteCards, checklistMisses, filterPerformances, summarize, trainingFocus } from './statsModel';

/**
 * Fill for a share of a section's maximum, scaled across this squad's range so
 * the differences that matter are visible: deeper = stronger. One hue per column.
 */
const shareFill = (share, slot, [lo, hi]) => viz(slot, 0.18 + 0.82 * ((share - lo) / (hi - lo || 1)));

/**
 * The coach's Stats tab: the squad across every meet (or one meet in detail),
 * with any athlete opened into the same career view a player sees.
 */
const CoachStats = () => {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await statsAPI.coach();
      setData(response.data?.data || null);
    } catch (err) {
      logger.error('Could not load squad stats', err);
      setError(err.response?.data?.message || 'Could not load your squad stats');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const meet = params.get('meet') || 'all';
  const team = params.get('team') || 'all';
  const athlete = params.get('athlete');
  const appParam = params.get('app') || '';
  const selected = useMemo(() => new Set(appParam.split(',').filter(Boolean)), [appParam]);
  const performances = useMemo(() => data?.performances || [], [data]);
  const available = useMemo(() => apparatusPresent(performances), [performances]);
  const shown = useMemo(() => filterPerformances(performances, { meet, apparatus: selected, team }), [performances, meet, selected, team]);

  const setParam = (key, value, empty = 'all') => {
    const next = new URLSearchParams(params);
    if (!value || value === empty) next.delete(key); else next.set(key, value);
    setParams(next, { replace: key !== 'athlete' });
  };

  if (loading) {
    return (
      <p className="type-body-s text-fg-muted flex items-center gap-3 m-0" role="status">
        <span className="ui-spinner" aria-hidden="true" />
        Loading your squad…
      </p>
    );
  }
  if (error) return <ErrorState action={<Button variant="line" onClick={load}>Try again</Button>}>{error}</ErrorState>;
  if (!performances.length) {
    return (
      <EmptyState tag="No published scores yet">
        Your squad&apos;s graphs appear here once a competition your athletes performed in publishes its results.
      </EmptyState>
    );
  }

  const filters = (
    <StatsFilters
      meets={data.competitions}
      meet={meet}
      onMeet={(v) => setParam('meet', v)}
      apparatus={available}
      selected={selected}
      onToggleApparatus={(key) => toggleApparatus(params, setParams, key, available)}
      teams={data.teams}
      team={team}
      onTeam={(v) => setParam('team', v)}
    />
  );

  // ── One athlete opened ──
  if (athlete) {
    const theirs = shown.filter((p) => p.playerId === athlete);
    const name = performances.find((p) => p.playerId === athlete)?.playerName || 'Athlete';
    return (
      <div className="grid gap-6">
        <TextLink as="button" type="button" className="ui-link--quiet justify-self-start" onClick={() => setParam('athlete', null)}>
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to the squad
        </TextLink>
        <Heading level={2} step="display-m" className="m-0">{name}</Heading>
        {filters}
        {theirs.length === 0 && <EmptyState tag="Nothing matches">No published performance for these filters.</EmptyState>}
        {meet === 'all' && theirs.length > 0 && <AthleteCareer performances={theirs} who="them" />}
        {meet !== 'all' && theirs.map((p) => (
          <PerformanceDetail key={p.key} performance={p} checklist={data.checklists?.[p.apparatus] || []} />
        ))}
      </div>
    );
  }

  const open = (playerId) => setParam('athlete', playerId);
  return (
    <div className="grid gap-6">
      {filters}
      {shown.length === 0 && <EmptyState tag="Nothing matches">Try another competition, team or apparatus.</EmptyState>}
      {shown.length > 0 && (meet === 'all'
        ? <SquadOverview performances={shown} teamTrend={data.teamTrend.filter((t) => team === 'all' || t.teamId === team)} onOpen={open} />
        : <SquadAtMeet performances={shown} checklists={data.checklists || {}} onOpen={open} />)}
    </div>
  );
};

/** Every meet: squad tiles, the team championship line, and a card per athlete. */
function SquadOverview({ performances, teamTrend, onOpen }) {
  const squad = summarize(performances);
  const cards = athleteCards(performances);
  const improver = cards.find((c) => c.improvement != null && c.improvement > 0);

  const trendKeys = [...new Set(teamTrend.map((t) => `${t.teamId}|${t.gender}|${t.ageGroup}`))];
  const trendMeets = [...new Map(teamTrend.map((t) => [t.competitionId, { id: t.competitionId, name: t.competitionName, date: t.date }])).values()]
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  const drawable = trendKeys.length > 0 && trendKeys.length <= 3 && trendMeets.length >= 2;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Users} label="Athletes scored" value={cards.length} hint={`${squad.count} performances · ${squad.meets} meets`} />
        <StatTile icon={Trophy} label="Squad average" value={fmt(squad.average)} hint={squad.improvement == null ? null : `${signed(squad.improvement)} since the first meet`} tone={squad.improvement == null ? null : squad.improvement >= 0 ? 'up' : 'down'} spark={squad.trend.length >= 2 ? { values: squad.trend } : null} />
        <StatTile icon={Medal} label="Podium finishes" value={squad.podiums} hint="Top three in a category" />
        <StatTile icon={TrendingUp} label="Most improved" value={improver ? signed(improver.improvement) : '—'} hint={improver ? improver.name : 'Needs two meets'} tone={improver ? 'up' : null} />
      </div>

      {teamTrend.length > 0 && (
        <ChartCard
          title="Team championship"
          takeaway="Your team's total (best scores per apparatus, as the championship counts them) at each meet."
          legend={drawable ? trendKeys.map((key, i) => {
            const t = teamTrend.find((x) => `${x.teamId}|${x.gender}|${x.ageGroup}` === key);
            return { label: `${t.teamName} (${t.ageGroup})`, slot: i + 1, line: true };
          }) : null}
          table={{
            caption: 'Team championship by meet',
            columns: [
              { key: 'meet', header: 'Competition' },
              { key: 'team', header: 'Team' },
              { key: 'category', header: 'Category' },
              { key: 'total', header: 'Total', numeric: true },
              { key: 'rank', header: 'Place', numeric: true },
            ],
            rows: teamTrend.map((t) => ({
              id: `${t.competitionId}-${t.teamId}-${t.ageGroup}-${t.gender}`,
              meet: t.competitionName,
              team: t.teamName,
              category: `${t.gender === 'Female' ? 'Girls' : 'Boys'} ${t.ageGroup}`,
              total: fmt(t.total),
              rank: t.rank ? `${ordinal(t.rank)} / ${t.teamsInStanding}` : '—',
            })),
            getRowKey: (r) => r.id,
          }}
        >
          {drawable ? (
            <LineChart
              ariaLabel="Team championship total at each meet"
              xLabels={trendMeets.map((m) => m.name)}
              yStep={5}
              yDomain={niceDomain(teamTrend.map((t) => t.total), { step: 5, pad: 1, floor: 0, ceil: Infinity })}
              series={trendKeys.map((key, i) => {
                const list = teamTrend.filter((x) => `${x.teamId}|${x.gender}|${x.ageGroup}` === key);
                return {
                  id: key,
                  label: list[0].teamName,
                  slot: i + 1,
                  points: list.map((x) => ({
                    x: trendMeets.findIndex((m) => m.id === x.competitionId),
                    y: x.total,
                    tip: x.rank ? `${ordinal(x.rank)} of ${x.teamsInStanding}` : undefined,
                  })),
                };
              })}
            />
          ) : (
            <p className="type-body-s text-fg-muted m-0">
              {trendMeets.length < 2 ? 'The line appears after a second meet. ' : 'Pick one team to see its line. '}
              Use “Show table” for every placing.
            </p>
          )}
        </ChartCard>
      )}

      <section aria-labelledby="squad-athletes" className="grid gap-3">
        <Heading level={3} step="display-s" id="squad-athletes" className="m-0">Athletes</Heading>
        <p className="type-body-s text-fg-secondary m-0">Most improved first. Open an athlete for their full record.</p>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 m-0 p-0 list-none">
          {cards.map((c) => (
            <li key={c.playerId}>
              <button
                type="button"
                onClick={() => onOpen(c.playerId)}
                className="ui-panel w-full text-left grid gap-2 hover:bg-surface-raised px-4 py-3.5 cursor-pointer"
                aria-label={`${c.name}, average ${fmt(c.average)}, best ${fmt(c.best.finalScore)}. Open full record`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="type-body block truncate" style={{ fontWeight: 600 }}>{c.name}</span>
                    <span className="type-body-s text-fg-muted block truncate">{c.teamName} · {c.category}</span>
                  </span>
                  <Sparkline values={c.trend} />
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 type-body-s">
                  <span>Avg <strong>{fmt(c.average)}</strong></span>
                  <span>Best <strong>{fmt(c.best.finalScore)}</strong></span>
                  {c.bestRank && <span>Top <strong>{ordinal(c.bestRank.rank)}</strong></span>}
                  {c.improvement != null && (
                    <span style={{ color: c.improvement >= 0 ? 'rgb(var(--success-fg))' : 'rgb(var(--danger-fg))' }}>
                      {signed(c.improvement)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** One meet: the squad leaderboard, the training-focus grid and the combination misses. */
function SquadAtMeet({ performances, checklists, onOpen }) {
  const ranked = [...performances].sort((a, b) => b.finalScore - a.finalScore);
  const focus = trainingFocus(performances);
  const misses = checklistMisses(performances, checklists);
  const range = (key) => {
    const v = focus.map((f) => f.shares[key]).filter((x) => x != null);
    return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1];
  };
  const ranges = Object.fromEntries(SECTIONS.map((s) => [s.key, range(s.key)]));
  const weakCount = SECTIONS.map((s) => ({ ...s, count: focus.filter((f) => f.weakest === s.key).length }))
    .sort((a, b) => b.count - a.count)[0];

  return (
    <div className="grid gap-6">
      <ChartCard
        title="Squad leaderboard"
        takeaway={`${ranked[0].playerName} led the squad with ${fmt(ranked[0].finalScore)} on ${apparatusLabel(ranked[0].apparatus)}.`}
        legend={SECTIONS.map((s) => ({ label: s.label, slot: s.slot }))}
        table={{
          caption: 'Squad results at this meet',
          columns: [
            { key: 'name', header: 'Athlete' },
            { key: 'apparatus', header: 'Apparatus' },
            ...SECTIONS.map((s) => ({ key: s.key, header: s.short, numeric: true })),
            { key: 'final', header: 'Final', numeric: true },
            { key: 'rank', header: 'Place', numeric: true },
          ],
          rows: ranked.map((p) => ({
            id: p.key,
            name: p.playerName,
            apparatus: apparatusLabel(p.apparatus),
            ...Object.fromEntries(SECTIONS.map((s) => [s.key, fmt(p.sections?.[s.key])])),
            final: fmt(p.finalScore),
            rank: p.rank ? `${ordinal(p.rank)} / ${p.fieldSize}` : '—',
          })),
          getRowKey: (r) => r.id,
        }}
      >
        <StackedBars
          ariaLabel="Each athlete's Difficulty, Combination and Execution at this meet"
          rows={ranked.filter((p) => p.sections).map((p) => ({
            id: p.key,
            label: `${p.playerName} · ${apparatusLabel(p.apparatus)}`,
            total: SECTIONS.reduce((sum, s) => sum + (p.sections[s.key] || 0), 0),
            valueLabel: fmt(p.finalScore),
            segments: SECTIONS.map((s) => ({ key: s.key, label: s.label, value: p.sections[s.key], slot: s.slot, max: s.max })),
            extra: [
              { label: 'Final score', value: fmt(p.finalScore) },
              ...(p.rank ? [{ label: 'Place', value: `${ordinal(p.rank)} of ${p.fieldSize}` }] : []),
            ],
          }))}
        />
      </ChartCard>

      <ChartCard
        title="Training focus"
        takeaway={weakCount?.count
          ? `${weakCount.label} is where ${weakCount.count} of ${focus.length} athletes trail the squad most. Each cell is the share of that section's maximum won; ▼ marks the section where an athlete is furthest below the squad.`
          : "Each cell is the share of that section's maximum won. Nobody trails the squad noticeably in any section."}
        legend={[
          { label: 'Darker = stronger, within this squad', color: viz(1) },
          { label: '▼ = furthest below the squad', bare: true },
        ]}
      >
        <Heatmap
          caption="Share of each section's maximum, per athlete"
          rowHeader="Athlete"
          rows={focus.map((f) => ({ id: f.playerId, label: f.name, title: `${f.name} · ${f.teamName}` }))}
          columns={SECTIONS.map((s) => ({ id: s.key, label: `${s.label} /${fmt(s.max)}` }))}
          cell={(row, col) => {
            const f = focus.find((x) => x.playerId === row.id);
            const share = f.shares[col.id];
            const section = SECTIONS.find((s) => s.key === col.id);
            if (share == null) return { empty: true, label: 'No data', title: `${f.name}: no ${section.label} data` };
            const weakest = f.weakest === col.id;
            return {
              background: shareFill(share, section.slot, ranges[col.id]),
              label: `${weakest ? '▼ ' : ''}${Math.round(share * 100)}%`,
              title: `${f.name}: ${Math.round(share * 100)}% of ${section.label}${weakest ? ' — furthest below the squad' : ''}. Open record`,
              onClick: () => onOpen(f.playerId),
            };
          }}
        />
      </ChartCard>

      {misses.length > 0 && (
        <ChartCard
          title="Combination requirements missed"
          takeaway="How many performances the judges marked as missing each requirement — the drills that would lift the whole squad."
        >
          <div className="grid gap-6 md:grid-cols-2">
            {misses.map((group) => (
              <section key={group.apparatus} aria-label={`${apparatusLabel(group.apparatus)} requirements`} className="grid gap-2 content-start">
                <p className="type-tag text-fg-secondary m-0">{apparatusLabel(group.apparatus)} · {group.total} performances</p>
                {group.items.filter((i) => i.missed > 0).length === 0 && (
                  <p className="type-body-s m-0">Every requirement met in every performance.</p>
                )}
                {group.items.filter((i) => i.missed > 0).map((item) => (
                  <div key={item.id} className="grid gap-1">
                    <span className="type-body-s">{item.rule}</span>
                    <span className="flex items-center gap-2">
                      <span className="viz-bullet__track flex-1" style={{ height: 10 }}>
                        <span className="viz-bullet__fill viz-grow" style={{ width: `${(item.missed / group.total) * 100}%`, background: 'rgb(var(--viz-up))' }} />
                      </span>
                      <span className="type-body-s tabular-nums min-w-16 text-right">
                        {item.missed} of {group.total}
                      </span>
                    </span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </ChartCard>
      )}

      <Panel variant="band">
        <p className="type-body-s m-0 text-fg-secondary">
          Tip: click any cell in Training focus to open that athlete&apos;s full breakdown for this meet.
        </p>
      </Panel>
    </div>
  );
}

export default CoachStats;
