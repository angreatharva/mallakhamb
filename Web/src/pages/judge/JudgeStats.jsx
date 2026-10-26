import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Gauge, Home, Scale } from 'lucide-react';
import { statsAPI } from '@/services/api';
import { logger } from '@/infrastructure/logger';
import { Button, EmptyState, ErrorState, Notice, Panel } from '@/components/ui';
import { ChartCard, LeanRows, LineChart, StatTile, SECTIONS, fmt, shortDate, signed } from '@/components/charts';
import StatsFilters from '@/pages/shared/stats/StatsFilters';
import { deviationWords, styleWord } from '@/pages/shared/stats/statsModel';

/**
 * "Marking insights" — a judge's own marks against the rest of each panel.
 * Only their own: no other judge's name or numbers appear here. The same
 * numbers feed the organisers' Judge fairness board, so a judge can see
 * exactly what the organisers see about them.
 */
const JudgeStats = () => {
  const [params, setParams] = useSearchParams();
  const meet = params.get('meet') || 'all';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await statsAPI.judge(meet === 'all' ? null : meet);
      setData(response.data?.data || null);
    } catch (err) {
      logger.error('Could not load marking insights', err);
      setError(err.response?.data?.message || 'Could not load your marking insights');
    } finally {
      setLoading(false);
    }
  }, [meet]);
  useEffect(() => { load(); }, [load]);

  const setMeet = (value) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('meet'); else next.set('meet', value);
    setParams(next, { replace: true });
  };

  if (loading && !data) {
    return (
      <p className="type-body-s text-fg-muted flex items-center gap-3 m-0" role="status">
        <span className="ui-spinner" aria-hidden="true" />
        Loading your marking insights…
      </p>
    );
  }
  if (error) return <ErrorState action={<Button variant="line" onClick={load}>Try again</Button>}>{error}</ErrorState>;
  if (!data || data.summary.performances === 0) {
    return (
      <EmptyState tag="No published marks yet">
        Once a panel you sat on publishes its results, you&apos;ll see how your marks compare with the rest of the panel.
      </EmptyState>
    );
  }

  const { summary, byCompetition, byTeam, homeState, thresholds } = data;
  const style = styleWord(summary.strictness.mean);
  const sectionRows = SECTIONS.map((s) => ({
    id: s.key,
    label: s.label,
    value: summary.sections[s.key].mean,
    ci: summary.sections[s.key].ci,
    enough: summary.sections[s.key].n >= 2,
    aria: `${s.label}: ${deviationWords(summary.sections[s.key].mean)} on average`,
  }));
  const loudest = [...sectionRows].filter((r) => r.value != null).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
  const agreementTrend = byCompetition.filter((c) => c.agreement != null);
  const firstLast = agreementTrend.length >= 2 ? agreementTrend[agreementTrend.length - 1].agreement - agreementTrend[0].agreement : null;
  const flaggedTeams = byTeam.filter((t) => t.flagged);

  return (
    <div className="grid gap-6">
      <StatsFilters meets={data.competitions.map((c) => ({ id: c.id, name: c.name, date: c.startDate }))} meet={meet} onMeet={setMeet} />

      {summary.inferredShare > 0 && (
        <Notice tone="info">
          {Math.round(summary.inferredShare * 100)}% of these marks were given before marks were signed by account, so they
          were matched to you from the panel seat list. They are shown here but never used to raise a concern.
        </Notice>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Activity} label="Marks compared" value={summary.performances} hint={`${byCompetition.length} competition${byCompetition.length === 1 ? '' : 's'}`} />
        <StatTile icon={Scale} label="Your style" value={signed(summary.strictness.mean)} hint={style.word} />
        <StatTile icon={Gauge} label="Agreement" value={fmt(summary.agreement)} hint="Average distance from the panel — lower is closer" />
        <StatTile icon={Home} label="Home-state teams" value={homeState?.lean != null ? signed(homeState.lean) : '—'} hint={homeState ? (homeState.enough ? 'vs every other team' : 'Too few to say yet') : 'Add your State / Unit to see this'} />
      </div>

      <ChartCard
        title="Section by section"
        takeaway={loudest && Math.abs(loudest.value) >= 0.05
          ? `You differ most on ${loudest.label}: ${deviationWords(loudest.value)} on average.`
          : 'Your section marks sit close to the rest of the panel.'}
        legend={[
          { label: 'Below the panel', color: 'rgb(var(--viz-down))' },
          { label: 'Above the panel', color: 'rgb(var(--viz-up))' },
          { label: '90% range', color: 'var(--fg)' },
        ]}
        table={{
          caption: 'Your average difference from the panel, per section',
          columns: [
            { key: 'label', header: 'Section' },
            { key: 'value', header: 'Average vs panel', numeric: true },
            { key: 'range', header: '90% range', numeric: true },
          ],
          rows: sectionRows.map((r) => ({ ...r, value: signed(r.value), range: r.ci ? `${signed(r.ci[0])} to ${signed(r.ci[1])}` : '—' })),
          getRowKey: (r) => r.id,
        }}
      >
        <LeanRows ariaLabel="Average difference from the panel per section" rows={sectionRows} limit={0.6} lowLabel="Below the panel" highLabel="Above the panel" />
      </ChartCard>

      {agreementTrend.length >= 2 && (
        <ChartCard
          title="Agreement over time"
          takeaway={firstLast == null ? null : firstLast <= 0
            ? `You are ${fmt(-firstLast)} closer to the panel than at your first competition.`
            : `You are ${fmt(firstLast)} further from the panel than at your first competition.`}
          table={{
            caption: 'Agreement by competition',
            columns: [
              { key: 'name', header: 'Competition' },
              { key: 'date', header: 'Date' },
              { key: 'n', header: 'Marks', numeric: true },
              { key: 'agreement', header: 'Avg distance', numeric: true },
              { key: 'strictness', header: 'Avg vs panel', numeric: true },
            ],
            rows: agreementTrend.map((c) => ({ id: c.competitionId, name: c.name, date: shortDate(c.date), n: c.performances, agreement: fmt(c.agreement), strictness: signed(c.strictness) })),
            getRowKey: (r) => r.id,
          }}
        >
          <LineChart
            ariaLabel="Average distance from the panel at each competition; lower is closer"
            height={200}
            yStep={0.1}
            yDomain={[0, Math.max(0.3, Math.ceil(Math.max(...agreementTrend.map((c) => c.agreement)) * 10) / 10)]}
            xLabels={agreementTrend.map((c) => c.name)}
            series={[{ id: 'agreement', label: 'Distance', slot: 1, points: agreementTrend.map((c, i) => ({ x: i, y: c.agreement })) }]}
          />
        </ChartCard>
      )}

      <ChartCard
        title="Your marks by team"
        takeaway={flaggedTeams.length
          ? `For ${flaggedTeams.map((t) => t.teamName).join(', ')}, your marks differ from how you mark other teams by more than the threshold. Organisers can see this too.`
          : 'No team gets noticeably different marks from you compared with the other teams you judge.'}
        legend={[
          { label: 'Lower than your usual', color: 'rgb(var(--viz-down))' },
          { label: 'Higher than your usual', color: 'rgb(var(--viz-up))' },
        ]}
        table={{
          caption: 'Difference per team compared with your other teams',
          columns: [
            { key: 'team', header: 'Team' },
            { key: 'n', header: 'Marks', numeric: true },
            { key: 'lean', header: 'Difference', numeric: true },
            { key: 'note', header: 'Note' },
          ],
          rows: byTeam.map((t) => ({
            id: t.teamId,
            team: t.teamName,
            n: t.n,
            lean: t.enough ? signed(t.lean) : '—',
            note: [t.isHomeState && 'Home state', t.flagged && 'Above threshold', !t.enough && 'Too few marks'].filter(Boolean).join(' · '),
          })),
          getRowKey: (r) => r.id,
        }}
      >
        <LeanRows
          ariaLabel="How your marks for each team differ from your marks for other teams"
          rows={byTeam.slice(0, 15).map((t) => ({
            id: t.teamId,
            label: t.teamName,
            value: t.lean,
            ci: t.ci,
            enough: t.enough,
            flagged: t.flagged,
            badge: t.isHomeState ? 'Home' : null,
            aria: `${t.teamName}: ${t.enough ? signed(t.lean) : 'too few marks'}${t.isHomeState ? ', your home state' : ''}`,
          }))}
        />
        {byTeam.length > 15 && <p className="type-body-s text-fg-muted m-0 mt-3">Showing the 15 largest differences. “Show table” lists every team.</p>}
      </ChartCard>

      <Panel variant="band">
        <details>
          <summary className="type-body cursor-pointer">How this is worked out</summary>
          <ul className="type-body-s text-fg-secondary mt-3 mb-0 grid gap-2 pl-5">
            <li>For every published performance you marked, your total is compared with the <strong>middle</strong> of the other judges&apos; totals on that panel. Your own mark is never part of the comparison.</li>
            <li>Your <strong>style</strong> is the average of those differences. Being a little strict or generous with everyone is normal and is not a concern.</li>
            <li>For each team, the difference is how you mark that team <strong>minus</strong> how you mark every other team, so your style cancels out.</li>
            <li>It is only raised as a concern with at least {thresholds.minPerformances} marks for that team, a difference of at least {fmt(thresholds.minLean)}, and when the 90% range does not include zero.</li>
          </ul>
        </details>
      </Panel>
    </div>
  );
};

export default JudgeStats;
