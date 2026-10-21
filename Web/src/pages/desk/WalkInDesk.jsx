import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FileDown, RotateCcw, Trash2 } from 'lucide-react';
import { deskAPI } from '@/services/user/desk.api';
import { useCompetition } from '@/contexts/CompetitionContext';
import { logger } from '@/infrastructure/logger';
import {
  Button, ConfirmDialog, EmptyState, Field, Heading, Notice, Panel, Select, Spinner, StatusTag,
} from '@/components/ui';
import DeskCoachStep from './DeskCoachStep';
import DeskFormStep from './DeskFormStep';
import DeskPayStep from './DeskPayStep';
import DeskSlip from './DeskSlip';
import { errorText, saveBlob } from './deskShared';

const STEPS = ['Competition', 'Coach & team', 'Form', 'Payment', 'Slip'];

const stepOf = (draft) => {
  if (!draft) return 1;
  if (draft.status === 'paid') return 4;
  if (draft.status === 'submitted') return 3;
  return 2;
};

/**
 * The walk-in desk (Admin and Super Admin): a coach arrives on competition day
 * with a filled paper form, and leaves registered, entered and paid, holding
 * a slip of Player IDs. See Server/src/services/walk-in/walk-in.service.js.
 */
const WalkInDesk = () => {
  const { currentCompetition } = useCompetition();
  const [meets, setMeets] = useState(null);
  const [ocr, setOcr] = useState(null);
  const [meetId, setMeetId] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [draft, setDraft] = useState(null);
  const [opening, setOpening] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [coachKey, setCoachKey] = useState(0);

  useEffect(() => {
    deskAPI.openMeets()
      .then((res) => {
        const list = res.data?.data || [];
        setMeets(list);
        const preferred = list.find((m) => String(m._id) === String(currentCompetition?._id)) || (list.length === 1 ? list[0] : null);
        if (preferred) setMeetId(String(preferred._id));
      })
      .catch((error) => { setMeets([]); toast.error(errorText(error, 'Could not load competitions')); });
    deskAPI.ocrStatus().then((res) => setOcr(res.data?.data)).catch(() => setOcr({ enabled: false, healthy: false }));
  }, [currentCompetition?._id]);

  const loadDrafts = useCallback(() => {
    if (!meetId) { setDrafts([]); return; }
    deskAPI.listDrafts(meetId)
      .then((res) => setDrafts(res.data?.data || []))
      .catch((error) => logger.warn('Could not list walk-in drafts', { message: error?.message }));
  }, [meetId]);
  useEffect(loadDrafts, [loadDrafts]);

  const meet = meets?.find((m) => String(m._id) === meetId) || null;

  const printForm = async () => {
    setPrinting(true);
    try {
      const res = await deskAPI.formPdf(meetId);
      saveBlob(res.data, `walk-in-form-${(meet?.name || 'competition').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.pdf`);
    } catch (error) {
      toast.error(errorText(error, 'Could not make the form'));
    } finally {
      setPrinting(false);
    }
  };

  const openFor = async (coach) => {
    setOpening(true);
    try {
      const res = await deskAPI.openDraft({ competitionId: meetId, coachId: coach._id });
      setDraft(res.data?.data);
    } catch (error) {
      toast.error(errorText(error, 'Could not start the form'));
    } finally {
      setOpening(false);
    }
  };

  const resume = async (id) => {
    try {
      setDraft((await deskAPI.getDraft(id)).data?.data);
    } catch (error) {
      toast.error(errorText(error, 'Could not open that form'));
    }
  };

  const discard = async () => {
    await deskAPI.cancelDraft(draft._id);
    toast.success('Form discarded');
    finish();
  };

  const finish = () => {
    setDraft(null);
    setCoachKey((k) => k + 1);
    loadDrafts();
  };

  const step = stepOf(draft);

  if (meets === null) return <div className="py-16 flex justify-center"><Spinner label="Loading the desk" /></div>;

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Heading level={2} step="display-m">Walk-in desk</Heading>
        <ol className="flex flex-wrap gap-2 m-0 p-0 list-none" aria-label="Steps">
          {STEPS.map((label, i) => (
            <li key={label}>
              <StatusTag status={i < step ? 'success' : i === step ? 'info' : 'warning'}>
                {i + 1}. {label}
              </StatusTag>
            </li>
          ))}
        </ol>
      </div>

      {meets.length === 0 ? (
        <EmptyState tag="No competition is taking entries">
          The desk lists competitions whose registration window is open today
          {currentCompetition ? '' : ' and that you are assigned to'}.
        </EmptyState>
      ) : (
        <Panel className="grid gap-4 p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field id="desk-meet" label="Competition">
              <Select value={meetId} disabled={Boolean(draft)} onChange={(e) => { setMeetId(e.target.value); setDraft(null); }}>
                <option value="" disabled>Choose a competition</option>
                {meets.map((m) => (
                  <option key={m._id} value={m._id}>{m.name}{m.isLate ? ' · late fee' : ''}</option>
                ))}
              </Select>
            </Field>
            <Button variant="line" icon={FileDown} disabled={!meetId} loading={printing} onClick={printForm}>Print blank form</Button>
          </div>
          {meet && (
            <p className="type-caption text-fg-muted m-0">
              Fee ₹{meet.playerFee} per player{meet.isLate ? ` + ₹${meet.lateFeePerPlayer} late fee` : ''}
              {' · '}ages on 31 Dec {meet.ageCutoffYear}
              {meet.maxTeamSize ? ` · up to ${meet.maxTeamSize} per age group` : ''}
            </p>
          )}
          {!draft && drafts.length > 0 && (
            <div className="grid gap-2">
              <p className="ui-field__label type-tag m-0">Unfinished forms</p>
              <ul className="grid gap-2 m-0 p-0 list-none">
                {drafts.map((d) => (
                  <li key={d._id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="type-body-s">
                      {d.team?.name || 'Team'} · {d.coach?.name} · {d.rows} player{d.rows === 1 ? '' : 's'}
                      {d.status === 'submitted' ? ' · awaiting payment' : ''}
                    </span>
                    <Button size="sm" variant="line" icon={RotateCcw} onClick={() => resume(d._id)}>Resume</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}

      {meetId && !draft && (
        opening
          ? <div className="py-8 flex justify-center"><Spinner label="Starting the form" /></div>
          : <DeskCoachStep key={coachKey} onReady={openFor} />
      )}

      {draft && (
        <Notice tone="info" title={`${draft.team?.name} · ${draft.coach?.name}`}>
          {draft.competition?.name}
          {draft.status === 'draft' && !draft.rows.some((r) => r.player) && (
            <Button size="sm" variant="ghost" icon={Trash2} className="ml-2" onClick={() => setDiscarding(true)}>Discard this form</Button>
          )}
        </Notice>
      )}

      {draft?.status === 'draft' && <DeskFormStep draft={draft} ocr={ocr} onDraft={setDraft} />}
      {draft?.status === 'submitted' && <DeskPayStep draft={draft} onDraft={setDraft} />}
      {draft?.status === 'paid' && <DeskSlip draftId={String(draft._id)} onDone={finish} />}

      <ConfirmDialog open={discarding} onClose={() => setDiscarding(false)} onConfirm={discard}
        title="Discard this form?" confirmText="Discard" tone="danger">
        What was read from the photos is thrown away. The coach and team stay registered.
      </ConfirmDialog>
    </div>
  );
};

export default WalkInDesk;
