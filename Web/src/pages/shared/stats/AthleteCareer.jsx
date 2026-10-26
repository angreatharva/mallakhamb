import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { Award, Gauge, Medal, Trophy } from 'lucide-react';
import {
  ChartCard, LineChart, StackedBars, StatTile, SECTIONS, apparatusLabel, fmt, ordinal, shortDate, signed,
} from '@/components/charts';
import { biggestGapSentence, careerSeries, meetsOf, summarize, trendSentence } from './statsModel';

const meetShort = (name) => (name && name.length > 18 ? `${name.slice(0, 17)}…` : name || '');

/**
 * An athlete's whole record: headline tiles, the score line across meets, where
 * the points come from, and each section's own trend. Shared by the player's
 * own Stats tab and the coach's athlete focus.
 */
const AthleteCareer = ({ performances, who = 'you' }) => {
  const you = who === 'you';
  const summary = useMemo(() => summarize(performances), [performances]);
  const career = useMemo(() => careerSeries(performances), [performances]);
  const ordered = useMemo(() => [...performances].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0)), [performances]);
  if (!summary) return null;

  const trend = trendSentence(career.series);
  const pbSentence = `${you ? 'Your' : 'Their'} best: ${fmt(summary.best.finalScore)} on ${apparatusLabel(summary.best.apparatus)} at ${summary.best.competitionName}.`;

  // One line per section: that section's average at each meet, across apparatus.
  const sectionMeets = meetsOf(performances.filter((p) => p.sections));
  const sectionCharts = SECTIONS.map((s) => ({
    section: s,
    meets: sectionMeets,
    points: sectionMeets.map((m, i) => {
      const here = performances.filter((p) => p.sections && p.competitionId === m.id).map((p) => p.sections[s.key]);
      return { x: i, y: here.reduce((a, b) => a + b, 0) / here.length };
    }),
  }));

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Trophy}
          label="Personal best"
          value={fmt(summary.best.finalScore)}
          hint={`${apparatusLabel(summary.best.apparatus)} · ${meetShort(summary.best.competitionName)}`}
        />
        <StatTile
          icon={Gauge}
          label="Average"
          value={fmt(summary.average)}
          hint={summary.improvement == null ? `${summary.count} performance${summary.count === 1 ? '' : 's'}` : `${signed(summary.improvement)} since the first meet`}
          tone={summary.improvement == null ? null : summary.improvement >= 0 ? 'up' : 'down'}
          spark={summary.trend.length >= 2 ? { values: summary.trend, slot: 1 } : null}
        />
        <StatTile icon={Award} label="Meets" value={summary.meets} hint={`${summary.count} performance${summary.count === 1 ? '' : 's'}`} />
        <StatTile
          icon={Medal}
          label="Best placing"
          value={summary.bestRank ? ordinal(summary.bestRank.rank) : '—'}
          hint={summary.bestRank ? `of ${summary.bestRank.fieldSize} · ${meetShort(summary.bestRank.competitionName)}` : 'Not ranked yet'}
        />
      </div>

      <ChartCard
        title="Score, meet by meet"
        takeaway={[pbSentence, trend].filter(Boolean).join(' ')}
        legend={career.series.map((s) => ({ label: s.label, slot: s.slot, line: true, dash: s.dash }))}
        table={{
          caption: 'Final score by meet and apparatus',
          columns: [
            { key: 'meet', header: 'Competition' },
            { key: 'date', header: 'Date' },
            { key: 'apparatus', header: 'Apparatus' },
            { key: 'score', header: 'Final', numeric: true },
            { key: 'rank', header: 'Place', numeric: true },
          ],
          rows: ordered.map((p) => ({
            id: p.key, meet: p.competitionName, date: shortDate(p.date), apparatus: apparatusLabel(p.apparatus),
            score: fmt(p.finalScore), rank: p.rank ? `${ordinal(p.rank)} / ${p.fieldSize}` : '—',
          })),
          getRowKey: (r) => r.id,
        }}
      >
        <LineChart
          ariaLabel={`Final score at each meet, one line per apparatus. ${pbSentence}`}
          xLabels={career.meets.map((m) => m.name)}
          series={career.series}
          markers={career.best ? [{ seriesId: career.best.seriesId, x: career.best.x, kind: 'star', label: `PB ${fmt(career.best.score)}` }] : []}
          tooltipTitle={(i) => `${career.meets[i].name}${career.meets[i].date ? ` · ${shortDate(career.meets[i].date)}` : ''}`}
        />
      </ChartCard>

      <ChartCard
        title="Where the points come from"
        takeaway={biggestGapSentence(performances)}
        legend={[
          ...SECTIONS.map((s) => ({ label: `${s.label} (of ${fmt(s.max)})`, slot: s.slot })),
          { label: 'Points left on the table', color: 'rgb(var(--viz-mid))' },
        ]}
        table={{
          caption: 'Section marks by performance',
          columns: [
            { key: 'label', header: 'Performance' },
            ...SECTIONS.map((s) => ({ key: s.key, header: s.label, numeric: true })),
            { key: 'final', header: 'Final', numeric: true },
          ],
          rows: ordered.filter((p) => p.sections).map((p) => ({
            id: p.key,
            label: `${p.competitionName} · ${apparatusLabel(p.apparatus)}`,
            ...Object.fromEntries(SECTIONS.map((s) => [s.key, fmt(p.sections[s.key])])),
            final: fmt(p.finalScore),
          })),
          getRowKey: (r) => r.id,
        }}
      >
        <StackedBars
          ariaLabel="Difficulty, Combination and Execution for each performance, out of 10"
          rows={ordered.filter((p) => p.sections).slice(-12).map((p) => ({
            id: p.key,
            label: `${meetShort(p.competitionName)} · ${apparatusLabel(p.apparatus)}`,
            title: `${p.competitionName} · ${apparatusLabel(p.apparatus)}`,
            total: SECTIONS.reduce((sum, s) => sum + (p.sections[s.key] || 0), 0),
            segments: SECTIONS.map((s) => ({ key: s.key, label: s.label, value: p.sections[s.key], slot: s.slot, max: s.max })),
            extra: [{ label: 'Final score', value: fmt(p.finalScore) }],
          }))}
        />
      </ChartCard>

      {sectionCharts[0].meets.length >= 2 && (
        <div className="grid gap-4 md:grid-cols-3">
          {sectionCharts.map(({ section, meets, points }) => (
            <ChartCard
              key={section.key}
              title={section.label}
              takeaway={`Average per meet, out of ${fmt(section.max)}.`}
            >
              <LineChart
                ariaLabel={`${section.label} average at each meet`}
                height={170}
                yStep={section.max > 2 ? 0.5 : 0.2}
                xLabels={meets.map((m) => m.name)}
                series={[{ id: section.key, label: section.short, slot: section.slot, points }]}
              />
            </ChartCard>
          ))}
        </div>
      )}
    </div>
  );
};

AthleteCareer.propTypes = {
  performances: PropTypes.arrayOf(PropTypes.object).isRequired,
  who: PropTypes.oneOf(['you', 'them']),
};

export default AthleteCareer;
