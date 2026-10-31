import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { UserMinus } from 'lucide-react';
import { coachAPI } from '@/services/api';
import { Button, ConfirmDialog, Notice, Panel, Heading } from '@/components/ui';

const errorOf = (error, fallback) => error?.response?.data?.error?.message || error?.response?.data?.message || fallback;

/**
 * Co-coaches on the coach dashboard (docs/superadmin-control-plan.md, D5).
 * The main coach sees who co-coaches their team and can remove them; a
 * co-coach sees whose team they work on. Hidden when there is nothing to say.
 */
const CoCoachesPanel = () => {
  const [data, setData] = useState(null);
  const [removing, setRemoving] = useState(null);

  useEffect(() => {
    coachAPI.getCoCoaches()
      .then((res) => setData(res.data?.data || null))
      .catch(() => setData(null));
  }, []);

  if (!data) return null;
  if (!data.isMain) {
    const team = data.teams?.[0];
    if (!team) return null;
    return (
      <Notice tone="info" title={`You are a co-coach of ${team.name}`}>
        Main coach: <strong>{team.mainCoach?.name}</strong>. You can do everything for this team that they can.
      </Notice>
    );
  }
  const withCo = (data.teams || []).filter((t) => t.coCoaches.length > 0);
  if (withCo.length === 0) return null;

  const remove = async () => {
    try {
      const res = await coachAPI.removeCoCoach(removing._id);
      setData(res.data?.data || null);
      toast.success(`${removing.name} removed`);
    } catch (error) {
      toast.error(errorOf(error, 'Could not remove the co-coach'));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Panel className="grid gap-3" data-testid="co-coaches-panel">
      <Heading level={2} step="display-s">Co-coaches</Heading>
      {withCo.map((t) => (
        <ul key={t._id} className="m-0 p-0 list-none grid gap-1">
          {t.coCoaches.map((c) => (
            <li key={c._id} className="flex flex-wrap items-center justify-between gap-2 type-body-s">
              <span><strong>{c.name}</strong> <span className="text-fg-muted">{c.email}</span>{withCo.length > 1 ? ` · ${t.name}` : ''}</span>
              <Button size="sm" variant="ghost" icon={UserMinus} onClick={() => setRemoving(c)}>Remove</Button>
            </li>
          ))}
        </ul>
      ))}
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} title={`Remove ${removing?.name || ''}?`} confirmText="Remove" tone="danger">
        They lose access to your team straight away.
      </ConfirmDialog>
    </Panel>
  );
};

export default CoCoachesPanel;
