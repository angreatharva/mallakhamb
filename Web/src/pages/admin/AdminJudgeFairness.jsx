import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle, CheckCircle2, Home, Scale, Users, X } from 'lucide-react';
import { statsAPI } from '@/services/api';
import { logger } from '@/infrastructure/logger';
import {
  Button, DataTable, EmptyState, ErrorState, Heading, IconButton, Notice, Panel, Select, Tag,
} from '@/components/ui';
import { ChartCard, Heatmap, LeanRows, StatTile, fmt, signed, vizToken } from '@/components/charts';
import { deviationWords, leanDetail, leanSentence, styleWord } from '@/pages/shared/stats/statsModel';

const SAME = 0.15; // below this a difference reads as "about the same"

/** Diverging fill: warm = gives this team more, cool = less, grey = about the same. */
function leanFill(lean) {
  if (lean == null) return null;
  if (Math.abs(lean) < SAME) return 'rgb(var(--viz-mid))';
  const strength = Math.min(1, 0.3 + Math.abs(lean) / 0.8);
  return vizToken(lean > 0 ? 'up' : 'down', strength);
}

/**
 * One judge × team comparison, in words and two bars: how this judge marks the
 * team against the panel, and how they mark everyone else. Used for every
 * "needs a look" item and for any cell opened from the grid.
 */
function Comparison({ item, onClose = null }) {
  const isHome = item.kind === 'homeState';
  const subject = isHome ? `teams from their home state (${item.stateUnit})` : item.teamName;
  const title = isHome
    ? `${item.judgeName} marks ${subject} ${item.lean > 0 ? 'higher' : 'lower'} than other teams`
    : leanSentence(item);
  const limit = Math.max(0.6, Math.abs(item.groupMean ?? 0) * 1.25, Math.abs(item.othersMean ?? 0) * 1.25);
  return (
    <Panel variant={item.flagged ? 'feature' : 'band'} rule={item.flagged ? 'danger' : 'accent'} className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1 min-w-0">
          <p className="type-body m-0" style={{ fontWeight: 600 }}>{item.enough ? title : `${item.judgeName} and ${subject}`}</p>
          <div className="flex flex-wrap gap-2">
            {item.flagged && <Tag tone="accent">Needs a look</Tag>}
            {(item.isHomeState || isHome) && <Tag><Home className="w-3 h-3 inline mr-1" aria-hidden="true" />Home state</Tag>}
            <Tag>{item.n} performance{item.n === 1 ? '' : 's'}</Tag>
          </div>
        </div>
        {onClose && <IconButton label="Close" icon={X} variant="ghost" onClick={onClose} />}
      </div>
      {item.enough ? (
        <>
          <LeanRows
            ariaLabel="Marks against the panel: this team compared with other teams"
            limit={limit}
            lowLabel="Below the rest of the panel"
            highLabel="Above the rest of the panel"
            rows={[
              { id: 'this', label: isHome ? 'Home-state teams' : item.teamName, value: item.groupMean, enough: true, flagged: item.flagged },
              { id: 'others', label: 'Every other team', value: item.othersMean, enough: true },
            ]}
          />
          <p className="type-body-s text-fg-secondary m-0">
            {leanDetail(item)} The gap is <strong>{signed(item.lean)}</strong>
            {item.ci && <> (most likely between {signed(item.ci[0])} and {signed(item.ci[1])})</>}.
          </p>
          {item.flagged && (
            <p className="type-body-s m-0">
              Worth checking this judge&apos;s slips for {isHome ? 'those teams' : item.teamName} in the score sheets before drawing any conclusion.
            </p>
          )}
        </>
      ) : (
        <p className="type-body-s text-fg-secondary m-0">
          Only {item.n} performance{item.n === 1 ? '' : 's'} — too few to say anything either way.
        </p>
      )}
    </Panel>
  );
}
Comparison.propTypes = { item: PropTypes.object.isRequired, onClose: PropTypes.func };

/**
 * Judge fairness — are any judges marking one team differently from the rest?
 *
 * Written to be read by an organiser in a minute: the headline numbers, then
 * every pair that needs a look as a plain sentence with two bars, then the
 * whole grid for anyone who wants to browse, then each judge's general style.
 */
const AdminJudgeFairness = ({ competitionId = null, isSuperAdmin = false }) => {
  // An admin is held to the competition chosen on the dashboard; a super admin
  // may look at any one competition or at all of them together.
  const [meet, setMeet] = useState(competitionId || 'all');
  const [meetOptions, setMeetOptions] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(null);

  useEffect(() => { setMeet(competitionId || 'all'); }, [competitionId]);
  const requested = isSuperAdmin ? (meet === 'all' ? null : meet) : competitionId;
  const needsMeet = !isSuperAdmin && !competitionId;

  const load = useCallback(async () => {
    if (needsMeet) return;
    setLoading(true);
    setError(null);
    setOpen(null);
    try {
      const response = await statsAPI.judgeFairness(requested);
      const next = response.data?.data || null;
      setData(next);
      // The all-competitions answer lists every meet with marks: keep it for the picker.
      if (!requested && next?.competitions) setMeetOptions(next.competitions);
    } catch (err) {
      logger.error('Could not load the judge fairness board', err);
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Could not load the judge fairness board');
    } finally {
      setLoading(false);
    }
  }, [requested, needsMeet]);
  useEffect(() => { load(); }, [load]);

  const judgeName = useMemo(() => new Map((data?.judges || []).map((j) => [j.id, j.name])), [data]);
  const cellByKey = useMemo(() => new Map((data?.cells || []).map((c) => [`${c.judgeId}|${c.teamId}`, c])), [data]);

  if (needsMeet) {
    return <EmptyState tag="Choose a competition">Pick one of your competitions at the top of the dashboard to see its judges.</EmptyState>;
  }

  const intro = (
    <Panel variant="feature" className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Tag tone="ident">Judges</Tag>
          <Heading level={2} step="display-m" className="m-0">Judge fairness</Heading>
        </div>
        {isSuperAdmin && (meetOptions.length > 1 || meet !== 'all') && (
          <label className="grid gap-1 min-w-[min(100%,260px)]">
            <span className="type-tag text-fg-secondary">Competition</span>
            <Select value={meet} onChange={(e) => setMeet(e.target.value)}>
              <option value="all">All competitions</option>
              {meetOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              {meet !== 'all' && !meetOptions.some((m) => m.id === meet) && <option value={meet}>Selected competition</option>}
            </Select>
          </label>
        )}
      </div>
      <p className="type-body text-fg-secondary m-0 max-w-[70ch]">
        Every judge&apos;s mark is compared with the rest of the panel on the same performance. A judge who is
        a little strict or generous with <em>everyone</em> is normal. This page looks for something else: a judge
        who marks <strong>one team</strong> differently from all the others.
      </p>
    </Panel>
  );

  if (loading && !data) {
    return (
      <div className="grid gap-6">
        {intro}
        <p className="type-body-s text-fg-muted flex items-center gap-3 m-0" role="status">
          <span className="ui-spinner" aria-hidden="true" />
          Comparing every judge with their panels…
        </p>
      </div>
    );
  }
  if (error) return <div className="grid gap-6">{intro}<ErrorState action={<Button variant="line" onClick={load}>Try again</Button>}>{error}</ErrorState></div>;
  if (!data || data.performances === 0) {
    return (
      <div className="grid gap-6">
        {intro}
        <EmptyState tag="Nothing to compare yet">This fills in once performances are finalized and their sheets locked.</EmptyState>
      </div>
    );
  }

  const { judges, teams, flags, thresholds } = data;
  const teamFlags = flags.filter((f) => f.kind === 'team');
  const homeFlags = flags.filter((f) => f.kind === 'homeState');
  const openItem = open && cellByKey.get(open)
    ? { ...cellByKey.get(open), judgeName: judgeName.get(open.split('|')[0]) }
    : null;

  return (
    <div className="grid gap-6">
      {intro}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Users} label="Judges checked" value={judges.length} hint={`${teams.length} teams`} />
        <StatTile icon={Scale} label="Performances compared" value={data.performances} hint={data.competitions.length === 1 ? data.competitions[0].name : `${data.competitions.length} competitions`} />
        <StatTile
          icon={flags.length ? AlertTriangle : CheckCircle2}
          label="Need a look"
          value={teamFlags.length}
          hint={teamFlags.length ? 'Judge–team pairs above the threshold' : 'Nothing above the threshold'}
          tone={teamFlags.length ? 'down' : 'up'}
        />
        <StatTile icon={Home} label="Home-state leanings" value={homeFlags.length} hint="Judges marking their own state differently" tone={homeFlags.length ? 'down' : null} />
      </div>

      <section aria-labelledby="fairness-flags" className="grid gap-3">
        <Heading level={3} step="display-s" id="fairness-flags" className="m-0">Needs a look</Heading>
        {flags.length === 0 ? (
          <Notice tone="success" title="Nothing needs a look">
            No judge marks any team noticeably differently from the other teams they judged, on this evidence.
          </Notice>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {flags.map((f) => <Comparison key={`${f.kind}-${f.judgeId}-${f.teamId || 'home'}`} item={f} />)}
          </div>
        )}
        <p className="type-body-s text-fg-muted m-0">
          A pair is raised only with at least {thresholds.minPerformances} performances, a gap of at least {fmt(thresholds.minLean)},
          and when the gap is clearly not chance. It is a prompt to look at the score sheets, never a verdict.
        </p>
      </section>

      <ChartCard
        title="Every judge, every team"
        takeaway="Each square compares how a judge marks that team with how they mark every other team. Click a square for the detail."
        legend={[
          { label: 'Marks this team lower', color: vizToken('down', 0.85) },
          { label: 'About the same', color: 'rgb(var(--viz-mid))' },
          { label: 'Marks this team higher', color: vizToken('up', 0.85) },
          { label: 'Too few performances', hatched: true },
          { label: 'Outlined = judge’s home state', outlined: true },
        ]}
        table={{
          caption: 'Judge × team differences',
          columns: [
            { key: 'judge', header: 'Judge' },
            { key: 'team', header: 'Team' },
            { key: 'n', header: 'Performances', numeric: true },
            { key: 'lean', header: 'Difference', numeric: true },
            { key: 'note', header: 'Note' },
          ],
          rows: data.cells.map((c) => ({
            id: `${c.judgeId}|${c.teamId}`,
            judge: judgeName.get(c.judgeId),
            team: c.teamName,
            n: c.n,
            lean: c.enough ? signed(c.lean) : '—',
            note: [c.flagged && 'Needs a look', c.isHomeState && 'Home state', !c.enough && 'Too few'].filter(Boolean).join(' · '),
          })),
          getRowKey: (r) => r.id,
        }}
      >
        <Heatmap
          caption="Judge by team differences"
          rowHeader="Judge"
          minColumn={84}
          rowLabelWidth={170}
          rows={judges.map((j) => ({ id: j.id, label: j.name, title: `${j.name}${j.stateUnit ? ` · ${j.stateUnit}` : ''}` }))}
          columns={teams.map((t) => ({ id: t.id, label: t.name.length > 14 ? `${t.name.slice(0, 13)}…` : t.name, title: `${t.name}${t.stateUnit ? ` · ${t.stateUnit}` : ''}` }))}
          cell={(row, col) => {
            const c = cellByKey.get(`${row.id}|${col.id}`);
            const key = `${row.id}|${col.id}`;
            if (!c) return { empty: true, label: '', title: `${row.label} did not judge ${col.title}` };
            if (!c.enough) {
              return { empty: true, outlined: c.isHomeState, label: 'Too few', title: `${row.label} → ${c.teamName}: only ${c.n} performances`, onClick: () => setOpen(key) };
            }
            const same = Math.abs(c.lean) < SAME;
            return {
              background: leanFill(c.lean),
              outlined: c.isHomeState,
              label: same ? 'Same' : `${c.lean > 0 ? '▲' : '▼'} ${signed(c.lean)}${c.flagged ? ' !' : ''}`,
              title: `${row.label} → ${c.teamName}: ${same ? 'about the same as other teams' : `${signed(c.lean)} compared with other teams`}${c.flagged ? ' — needs a look' : ''}${c.isHomeState ? ' (home state)' : ''}`,
              onClick: () => setOpen(key),
            };
          }}
        />
        {openItem && <div className="mt-4"><Comparison item={openItem} onClose={() => setOpen(null)} /></div>}
      </ChartCard>

      <ChartCard
        title="Each judge's style"
        takeaway="How each judge marks in general. Being stricter or more generous than the panel with everyone is not a concern on its own."
      >
        <DataTable
          caption="Judges' general marking style"
          getRowKey={(r) => r.id}
          columns={[
            { key: 'name', header: 'Judge' },
            { key: 'state', header: 'State' },
            { key: 'n', header: 'Marks', numeric: true },
            { key: 'style', header: 'Style' },
            { key: 'agreement', header: 'Avg distance', numeric: true },
            { key: 'home', header: 'Home-state teams', numeric: true },
            { key: 'concerns', header: 'Need a look', numeric: true },
          ]}
          rows={judges.map((j) => ({
            id: j.id,
            name: j.name,
            state: j.stateUnit || '—',
            n: j.performances,
            style: `${styleWord(j.strictness.mean).word} (${signed(j.strictness.mean)})`,
            agreement: fmt(j.agreement),
            home: j.homeState?.enough ? signed(j.homeState.lean) : '—',
            concerns: j.flaggedTeams + (j.homeState?.flagged ? 1 : 0),
          }))}
        />
        {judges.some((j) => j.inferredShare > 0) && (
          <p className="type-body-s text-fg-muted m-0 mt-3">
            Some older marks were matched to judges from the panel seat list because they were given before marks were
            signed by account. They are shown, but a pair is only raised on signed marks.
          </p>
        )}
      </ChartCard>

      <Panel variant="band">
        <details>
          <summary className="type-body cursor-pointer">How the comparison works</summary>
          <ul className="type-body-s text-fg-secondary mt-3 mb-0 grid gap-2 pl-5">
            <li>For each performance, a judge&apos;s total is compared with the <strong>middle</strong> of the other judges&apos; totals on that panel — so one unusual colleague can&apos;t make everyone else look odd, and the judge&apos;s own mark is never part of it.</li>
            <li>A judge&apos;s <strong>style</strong> is the average of those differences ({deviationWords(-0.12)}, for example).</li>
            <li>For a team, the number is how the judge marks that team <strong>minus</strong> how they mark every other team. Style cancels out, so only different treatment remains.</li>
            <li>Raised only with at least {thresholds.minPerformances} performances of that team, a gap of at least {fmt(thresholds.minLean)}, and a 90% range that does not include zero.</li>
          </ul>
        </details>
      </Panel>
    </div>
  );
};

AdminJudgeFairness.propTypes = {
  competitionId: PropTypes.string,
  isSuperAdmin: PropTypes.bool,
};

export default AdminJudgeFairness;
