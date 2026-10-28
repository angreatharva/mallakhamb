import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, FileDown, ScanLine, Trash2 } from 'lucide-react';
import { paperFormAPI } from '@/services/user/paper-form.api';
import { useCompetition } from '@/contexts/CompetitionContext';
import CompetitionLockBanner from '@/components/competition/CompetitionLockBanner';
import { Button, ConfirmDialog, Heading, Notice, Panel, Spinner } from '@/components/ui';
import DeskFormStep from '@/pages/desk/DeskFormStep';
import DeskSlip from '@/pages/desk/DeskSlip';
import { errorText, saveBlob } from '@/pages/desk/deskShared';

/**
 * Paper form for a coach's own team (docs/team-per-level-plan.md step 4): the
 * walk-in desk's photograph → review → register flow, for the competition
 * chosen in the menu bar. Players are registered on this coach's team and
 * entered in its squad; the fees are paid from the dashboard as usual.
 *
 * Shares one draft with the desk: a form started here can be finished at the
 * desk on competition day, and the other way round.
 */
const CoachPaperForm = () => {
  const navigate = useNavigate();
  const { currentCompetition } = useCompetition();
  const [draft, setDraft] = useState(undefined);
  const [ocr, setOcr] = useState(null);
  const [opening, setOpening] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [blocked, setBlocked] = useState(null);

  useEffect(() => {
    if (!currentCompetition?._id) return;
    setDraft(undefined);
    paperFormAPI.current()
      .then((res) => setDraft(res.data?.data?.draft || null))
      .catch((error) => { setDraft(null); setBlocked(errorText(error, 'Could not load your form')); });
    paperFormAPI.ocrStatus().then((res) => setOcr(res.data?.data)).catch(() => setOcr({ enabled: false, healthy: false }));
  }, [currentCompetition?._id]);

  const back = () => navigate('/coach/dashboard');

  const start = async () => {
    setOpening(true);
    setBlocked(null);
    try {
      setDraft((await paperFormAPI.open()).data?.data);
    } catch (error) {
      setBlocked(errorText(error, 'Could not start the form'));
    } finally {
      setOpening(false);
    }
  };

  const printForm = async () => {
    setPrinting(true);
    try {
      saveBlob((await paperFormAPI.formPdf()).data, 'mallakhamb-registration-form.pdf');
    } catch (error) {
      toast.error(errorText(error, 'Could not make the form'));
    } finally {
      setPrinting(false);
    }
  };

  const discard = async () => {
    try {
      await paperFormAPI.cancelDraft(draft._id);
      toast.success('Form discarded');
      setDraft(null);
    } catch (error) {
      toast.error(errorText(error, 'Could not discard the form'));
    }
  };

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="max-w-5xl mx-auto px-[var(--pad)] pb-12 pt-6 grid gap-6">
        <CompetitionLockBanner />
        <div className="grid gap-2">
          <Button variant="ghost" size="sm" icon={ArrowLeft} className="justify-self-start" onClick={back}>Dashboard</Button>
          <Heading level={1} step="display-l">Scan paper form</Heading>
          <p className="type-body-s text-fg-muted m-0">
            {currentCompetition?.name || 'Choose a competition in the menu bar'} · photograph your filled registration form,
            check every player, and register them on your team in one go.
          </p>
        </div>

        {blocked && <Notice tone="warning" title="Not available">{blocked}</Notice>}

        {draft === undefined && <div className="py-12 flex justify-center"><Spinner label="Loading your form" /></div>}

        {draft === null && (
          <Panel className="grid gap-4 p-5">
            <Heading level={2} step="display-s">How it works</Heading>
            <ol className="m-0 pl-5 grid gap-1 type-body-s list-decimal">
              <li>Print the form and fill it in English CAPITALS, one box per digit for the date of birth.</li>
              <li>Photograph each page — flat, well lit, all four corner squares in view.</li>
              <li>Check every player: age on 31 December, age group, apparatus. Rows in red need fixing.</li>
              <li>Register: each player gets a Player ID on your team and a place in your squad. Then pay from the dashboard.</li>
            </ol>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button icon={ScanLine} loading={opening} onClick={start}>Start a form</Button>
              <Button variant="line" icon={FileDown} loading={printing} onClick={printForm}>Print blank form</Button>
            </div>
          </Panel>
        )}

        {draft && draft.status === 'draft' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="line" size="sm" icon={FileDown} loading={printing} onClick={printForm}>Print blank form</Button>
              {!draft.rows.some((r) => r.player) && (
                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setDiscarding(true)}>Discard this form</Button>
              )}
            </div>
            <DeskFormStep draft={draft} ocr={ocr} onDraft={setDraft} api={paperFormAPI} who="coach" />
          </>
        )}

        {draft && (draft.status === 'submitted' || draft.status === 'paid') && (
          <DeskSlip draftId={String(draft._id)} api={paperFormAPI} who="coach" doneLabel="Back to dashboard" onDone={back} />
        )}
      </div>

      <ConfirmDialog open={discarding} onClose={() => setDiscarding(false)} onConfirm={async () => { setDiscarding(false); await discard(); }}
        title="Discard this form?" confirmText="Discard" tone="danger">
        What was read from the photos is thrown away. Nothing has been registered yet.
      </ConfirmDialog>
    </div>
  );
};

export default CoachPaperForm;
