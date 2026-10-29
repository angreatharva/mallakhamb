import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Medal } from 'lucide-react';
import { Heading, Panel, Tag } from '@/components/ui';
import { logger } from '@/infrastructure/logger';

/**
 * "Qualified for …" — the Competition II / III finals a coach's players, or a
 * player, moved into from Competition I (docs/qualification-plan.md). Renders
 * nothing until there is something to show.
 *
 * @param {Object} props
 * @param {() => Promise} props.load - resolves to an axios response with `data.data.finals`
 * @param {*} [props.reloadKey] - reload when this changes (e.g. the competition)
 * @param {'coach'|'player'} props.who
 */
const QualifiedFinals = ({ load, reloadKey = null, who }) => {
  const [finals, setFinals] = useState([]);

  useEffect(() => {
    let alive = true;
    load()
      .then((res) => { if (alive) setFinals(res.data?.data?.finals || []); })
      .catch((error) => logger.warn('Could not load finals', { message: error?.message }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  if (!finals.length) return null;

  return (
    <Panel className="grid gap-3" data-testid="qualified-finals">
      <div className="flex items-center gap-2">
        <Medal className="w-5 h-5 text-accent-fg" aria-hidden="true" />
        <Heading level={2} step="display-s">{who === 'coach' ? 'Finals: your qualifiers' : 'Qualified for the finals'}</Heading>
      </div>
      <ul className="m-0 p-0 list-none grid gap-2">
        {finals.map((f) => (
          <li key={`${f._id || f.label}-${f.competition?._id || ''}`} className="grid gap-1">
            <span className="type-body-s font-semibold">
              {f.label}{who === 'player' && f.competition?.name ? ` · ${f.competition.name}` : ''}
            </span>
            {who === 'coach' && (
              <span className="flex flex-wrap gap-1.5">
                {(f.qualifiers || []).map((q) => (
                  <Tag key={q.player} tone="ident">{q.playerName}{q.replacement ? ' (replacement)' : ''}</Tag>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
};

QualifiedFinals.propTypes = {
  load: PropTypes.func.isRequired,
  reloadKey: PropTypes.any,
  who: PropTypes.oneOf(['coach', 'player']).isRequired,
};

export default QualifiedFinals;
