import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { statsAPI } from '@/services/api';
import { logger } from '@/infrastructure/logger';
import { Button, EmptyState, ErrorState, Heading } from '@/components/ui';
import { apparatusLabel, fmt, ordinal } from '@/components/charts';
import AthleteCareer from './AthleteCareer';
import PerformanceDetail from './PerformanceDetail';
import StatsFilters from './StatsFilters';
import { apparatusPresent, filterPerformances } from './statsModel';

/** `?app=Pole Mallakhamb,Rope Mallakhamb` ↔ a Set. Empty = every apparatus. */
export const readApparatus = (params) => new Set((params.get('app') || '').split(',').filter(Boolean));

/** Toggle one apparatus in the URL, never leaving all of them switched off. */
export function toggleApparatus(params, setParams, key, available) {
  const current = readApparatus(params);
  const on = current.size === 0 ? new Set(available) : current;
  if (on.has(key)) on.delete(key); else on.add(key);
  const next = new URLSearchParams(params);
  if (on.size === 0 || on.size === available.length) next.delete('app');
  else next.set('app', [...on].join(','));
  setParams(next, { replace: true });
}

/**
 * The player's Stats tab: every published performance, as a career (all meets)
 * or as a meet explained (one meet). Filters live in the URL so Back and a
 * shared link land on the same view.
 */
const PlayerStats = () => {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await statsAPI.player();
      setData(response.data?.data || null);
    } catch (err) {
      logger.error('Could not load player stats', err);
      setError(err.response?.data?.message || 'Could not load your stats');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const meet = params.get('meet') || 'all';
  const appParam = params.get('app') || '';
  const selected = useMemo(() => new Set(appParam.split(',').filter(Boolean)), [appParam]);
  const performances = useMemo(() => data?.performances || [], [data]);
  const available = useMemo(() => apparatusPresent(performances), [performances]);
  const shown = useMemo(() => filterPerformances(performances, { meet, apparatus: selected }), [performances, meet, selected]);

  const setMeet = (value) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('meet'); else next.set('meet', value);
    setParams(next, { replace: true });
  };

  if (loading) {
    return (
      <p className="type-body-s text-fg-muted flex items-center gap-3 m-0" role="status">
        <span className="ui-spinner" aria-hidden="true" />
        Loading your stats…
      </p>
    );
  }
  if (error) return <ErrorState action={<Button variant="line" onClick={load}>Try again</Button>}>{error}</ErrorState>;
  if (!performances.length) {
    return (
      <EmptyState tag="No published scores yet">
        Your graphs appear here once a competition you performed in publishes its results.
      </EmptyState>
    );
  }

  const meetName = data.competitions.find((c) => c.id === meet)?.name;
  return (
    <div className="grid gap-6">
      <StatsFilters
        meets={data.competitions}
        meet={meet}
        onMeet={setMeet}
        apparatus={available}
        selected={selected}
        onToggleApparatus={(key) => toggleApparatus(params, setParams, key, available)}
      />

      {shown.length === 0 && (
        <EmptyState tag="Nothing matches">Try another competition or switch an apparatus back on.</EmptyState>
      )}

      {meet === 'all' && shown.length > 0 && <AthleteCareer performances={shown} />}

      {meet !== 'all' && shown.length > 0 && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Heading level={2} step="display-m" className="m-0 flex items-center gap-2">
              <BarChart3 className="w-6 h-6" aria-hidden="true" />
              {meetName}
            </Heading>
            <p className="type-body-s text-fg-secondary m-0">
              {shown.map((p) => `${apparatusLabel(p.apparatus)} ${fmt(p.finalScore)}${p.rank ? ` (${ordinal(p.rank)})` : ''}`).join(' · ')}
            </p>
          </div>
          {shown.map((p) => (
            <PerformanceDetail key={p.key} performance={p} checklist={data.checklists?.[p.apparatus] || []} />
          ))}
        </div>
      )}
    </div>
  );
};

export default PlayerStats;
