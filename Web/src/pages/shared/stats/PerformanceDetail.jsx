import PropTypes from 'prop-types';
import { Check, Medal, X } from 'lucide-react';
import { Heading, Panel, Tag } from '@/components/ui';
import { BulletMeter, PanelStrip, SECTIONS, apparatusLabel, fmt, ordinal } from '@/components/charts';

const CATEGORY = { 'Competition I': 'Team', 'Competition II': 'Individual', 'Competition III': 'Apparatus' };
const MEDAL = { 1: 'medal-gold', 2: 'medal-silver', 3: 'medal-bronze' };

/**
 * One performance, explained: the result and placing, each section against the
 * category average and best, which combination requirements the judges saw,
 * the difficulty make-up, and how the panel's marks became the score.
 */
const PerformanceDetail = ({ performance: p, checklist = [], showAthlete = false }) => {
  const deductions = (p.deductions?.time || 0) + (p.deductions?.other || 0);
  const missed = p.checklist ? p.checklist.items.filter((i) => i.metBy * 2 < p.checklist.of) : [];
  return (
    <Panel className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1 min-w-0">
          <div className="flex flex-wrap gap-2">
            <Tag tone="ident">{apparatusLabel(p.apparatus)}</Tag>
            <Tag>{CATEGORY[p.competitionType] || p.competitionType}</Tag>
            <Tag>{`${p.gender === 'Female' ? 'Girls' : 'Boys'} · ${p.ageGroup}`}</Tag>
          </div>
          <Heading level={3} step="display-s" className="m-0 mt-1">
            {showAthlete ? p.playerName : p.competitionName}
          </Heading>
          {showAthlete && <p className="type-body-s text-fg-muted m-0">{p.teamName}</p>}
        </div>
        <div className="text-right">
          <p className="type-tag text-fg-secondary m-0">Final score</p>
          <p className="type-num-l m-0" style={{ lineHeight: 1 }}>{fmt(p.finalScore)}</p>
          {p.rank && (
            <p className="type-body-s m-0 mt-1 flex items-center justify-end gap-1.5">
              {MEDAL[p.rank] && <Medal className="w-4 h-4" style={{ color: `rgb(var(--${MEDAL[p.rank]}))` }} aria-hidden="true" />}
              <strong>{ordinal(p.rank)}</strong>
              <span className="text-fg-muted">of {p.fieldSize}</span>
            </p>
          )}
        </div>
      </div>

      {deductions > 0 && (
        <p className="type-body-s m-0 text-fg-secondary">
          Deductions: <strong>−{fmt(deductions)}</strong>
          {p.deductions.time > 0 && ` (time ${p.time || ''} −${fmt(p.deductions.time)})`}
          {p.deductions.other > 0 && ` (other −${fmt(p.deductions.other)})`}
        </p>
      )}

      {p.sections && (
        <section aria-label="Score by section" className="grid gap-5">
          {SECTIONS.map((s) => (
            <BulletMeter
              key={s.key}
              label={s.label}
              value={p.sections[s.key]}
              max={s.max}
              average={p.category?.sectionAverage?.[s.key] ?? null}
              best={p.category?.sectionBest?.[s.key] ?? null}
              slot={s.slot}
            />
          ))}
          {p.sections.bonus > 0 && <p className="type-body-s m-0 text-fg-secondary">Bonus: +{fmt(p.sections.bonus)}</p>}
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {p.checklist && checklist.length > 0 && (
          <section aria-label="Combination requirements" className="grid gap-2 content-start">
            <p className="type-tag text-fg-secondary m-0">
              Combination requirements {missed.length === 0 ? '— all met' : `— ${missed.length} missed`}
            </p>
            <ul className="m-0 p-0 list-none grid gap-1.5">
              {checklist.map((item) => {
                const hit = p.checklist.items.find((i) => i.id === item.id);
                const met = hit && hit.metBy * 2 >= p.checklist.of;
                return (
                  <li key={item.id} className="flex items-start gap-2 type-body-s">
                    {met
                      ? <Check className="w-4 h-4 mt-0.5 flex-none" style={{ color: 'rgb(var(--success-fg))' }} aria-label="Met" />
                      : <X className="w-4 h-4 mt-0.5 flex-none" style={{ color: 'rgb(var(--danger-fg))' }} aria-label="Missed" />}
                    <span className={met ? 'text-fg-secondary' : ''}>
                      {item.rule}
                      {!met && <span className="text-fg-muted"> (−{fmt(item.penalty)})</span>}
                      {hit && p.checklist.of > 1 && hit.metBy > 0 && hit.metBy < p.checklist.of && (
                        <span className="text-fg-muted"> · {hit.metBy} of {p.checklist.of} judges</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="grid gap-5 content-start">
          {p.elements && (
            <section aria-label="Difficulty make-up" className="grid gap-2">
              <p className="type-tag text-fg-secondary m-0">Difficulty elements</p>
              <div className="flex flex-wrap gap-2">
                {[['A', p.elements.a, '0.20'], ['B', p.elements.b, '0.40'], ['C', p.elements.c, '0.60']].map(([cls, count, value]) => (
                  <span key={cls} className="ui-panel ui-panel--band type-body-s px-2.5 py-1.5">
                    <strong>{count}</strong> × {cls}-class <span className="text-fg-muted">({value} each)</span>
                  </span>
                ))}
              </div>
            </section>
          )}
          {p.panel && p.panel.length > 0 && (
            <section aria-label="How the judges marked it" className="grid gap-2">
              <p className="type-tag text-fg-secondary m-0">How the judges marked it</p>
              <PanelStrip panel={p.panel} />
              <p className="type-body-s text-fg-muted m-0">
                Filled dots are the marks the panel rule counted; hollow ones were dropped.
              </p>
            </section>
          )}
        </div>
      </div>
    </Panel>
  );
};

PerformanceDetail.propTypes = {
  performance: PropTypes.object.isRequired,
  checklist: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, rule: PropTypes.string, penalty: PropTypes.number })),
  showAthlete: PropTypes.bool,
};

export default PerformanceDetail;
