import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { RotateCcw } from 'lucide-react';
import { superAdminAPI } from '@/services/api';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { ReasonDialog, errorOf } from '../SuperAdminHistory';

/** Deleted competitions, with Restore. Deleted teams are restored from Teams. */
const RestoreSection = () => {
  const [list, setList] = useState(null);
  const [picked, setPicked] = useState(null);

  const load = useCallback(() => {
    superAdminAPI.fix.deletedCompetitions()
      .then((res) => setList(res.data?.data || []))
      .catch((error) => { setList([]); toast.error(errorOf(error, 'Could not load deleted competitions')); });
  }, []);
  useEffect(load, [load]);

  const restore = async (reason) => {
    try {
      await superAdminAPI.fix.restoreCompetition(picked._id, reason);
      toast.success(`${picked.name} restored`);
      setPicked(null);
      load();
    } catch (error) {
      toast.error(errorOf(error, 'Could not restore it'));
    }
  };

  if (list === null) return <div className="py-8 flex justify-center"><Spinner label="Loading deleted competitions" /></div>;
  return (
    <div className="grid gap-3">
      <p className="type-body-s text-fg-muted m-0">Competitions deleted from Management. Restoring brings back the meet with its teams, entries and scores.</p>
      {list.length === 0 ? <EmptyState tag="Nothing deleted">No deleted competitions.</EmptyState> : (
        <ul className="m-0 p-0 list-none grid gap-2">
          {list.map((c) => (
            <li key={c._id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-line">
              <span className="type-body-s"><strong>{c.name}</strong> · {c.place} · {c.year}</span>
              <Button size="sm" variant="line" icon={RotateCcw} onClick={() => setPicked(c)}>Restore</Button>
            </li>
          ))}
        </ul>
      )}
      <ReasonDialog open={!!picked} title={`Restore ${picked?.name || ''}?`} confirmText="Restore" onClose={() => setPicked(null)} onConfirm={restore} />
    </div>
  );
};

export default RestoreSection;
