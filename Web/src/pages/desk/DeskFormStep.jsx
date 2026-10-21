import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import toast from 'react-hot-toast';
import { Camera, ImageUp, Plus, Send } from 'lucide-react';
import { deskAPI } from '@/services/user/desk.api';
import { logger } from '@/infrastructure/logger';
import { Button, ConfirmDialog, Field, Heading, Notice, Panel, Select, StatusTag } from '@/components/ui';
import DeskReviewRow from './DeskReviewRow';
import { shrinkPhoto } from './shrinkPhoto';
import { CheckBox, errorText } from './deskShared';

const AUTOSAVE_MS = 1200;

/** What the review grid sends back: only what the admin can change. */
const editable = (row) => ({
  _id: row._id || undefined,
  firstName: row.firstName || '',
  lastName: row.lastName || '',
  dateOfBirth: row.dateOfBirth || '',
  gender: row.gender || null,
  ageGroup: row.ageGroup || null,
  apparatus: row.apparatus || [],
  confirmDuplicate: Boolean(row.confirmDuplicate),
  matchChoice: row.matchChoice || null,
  matchPlayer: row.matchChoice === 'existing' ? row.matchPlayer || null : null,
});

/**
 * Steps 4–6: photograph each page, review every row, submit.
 *
 * Edits save themselves a moment after typing stops, and the server's answer
 * (age, allowed groups, squad room, duplicates) replaces the rows — so what is
 * red on screen is what the server would refuse. Row photos (`crops`) live in
 * this component only: they are never stored, and a reload drops them.
 */
const DeskFormStep = ({ draft, ocr, onDraft }) => {
  const [rows, setRows] = useState(draft.rows);
  const [consent, setConsent] = useState(Boolean(draft.guardianConsent));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pageHint, setPageHint] = useState('');
  const [crops, setCrops] = useState({});
  const [scanError, setScanError] = useState(null);
  const cameraInput = useRef(null);
  const fileInput = useRef(null);
  const timer = useRef(null);
  const latest = useRef({ rows, consent });
  latest.current = { rows, consent };

  // A fresh draft from outside (scan, submit) wins over local state.
  useEffect(() => {
    setRows(draft.rows);
    setConsent(Boolean(draft.guardianConsent));
  }, [draft]);

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    setSaving(true);
    try {
      const res = await deskAPI.saveRows(draft._id, {
        rows: latest.current.rows.map(editable),
        guardianConsent: latest.current.consent,
      });
      setDirty(false);
      onDraft(res.data?.data);
      return true;
    } catch (error) {
      toast.error(errorText(error, 'Could not save the form'));
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft._id, onDraft]);

  const touch = (nextRows, nextConsent = consent) => {
    setRows(nextRows);
    setConsent(nextConsent);
    setDirty(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(save, AUTOSAVE_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const onPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setScanError(null);
    setScanning(true);
    try {
      if (dirty && !(await save())) return;
      const blob = await shrinkPhoto(file);
      const res = await deskAPI.scan(draft._id, blob, pageHint || undefined);
      const data = res.data?.data;
      setCrops((prev) => ({ ...prev, ...(data?.crops || {}) }));
      onDraft(data.draft);
      const read = data.draft.rows.filter((r) => r.page === data.page).length;
      toast.success(`Page ${data.page}: ${read} player${read === 1 ? '' : 's'} read${data.qrRead ? '' : ' (page chosen by hand)'}`);
      setPageHint('');
    } catch (error) {
      const code = error?.response?.data?.error?.code;
      logger.warn('Walk-in scan failed', { code });
      setScanError(code === 'OCR_BUSY'
        ? 'The form reader is busy with another page. Try again in a few seconds.'
        : errorText(error, 'Could not read that photo'));
    } finally {
      setScanning(false);
    }
  };

  const addRow = () => touch([...rows, {
    firstName: '', lastName: '', dateOfBirth: '', gender: null, ageGroup: null, apparatus: [], issues: [],
  }]);

  const submit = async () => {
    if (dirty && !(await save())) return;
    setSubmitting(true);
    try {
      const res = await deskAPI.submit(draft._id);
      onDraft(res.data?.data);
      toast.success('Players registered and entered');
    } catch (error) {
      toast.error(errorText(error, 'Could not submit — nothing is lost; fix the rows in red and submit again'));
      // Partial progress (players already created) is in the draft: reload it.
      try { onDraft((await deskAPI.getDraft(draft._id)).data?.data); } catch { /* keep what we have */ }
    } finally {
      setSubmitting(false);
    }
  };

  const pages = draft.competition.formPages || [];
  const scannedPages = new Set((draft.scans || []).map((s) => s.page));
  const errors = rows.filter((r) => (r.issues || []).some((i) => i.level === 'error')).length;
  const needsConsent = rows.some((r) => !r.player && r.dateOfBirth && (r.age === null || r.age === undefined || r.age < 18));
  const canSubmit = rows.length > 0 && !dirty && !saving && draft.blocking === 0;

  return (
    <div className="grid gap-6">
      <Panel className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading level={3} step="display-s">Photograph the form</Heading>
          {pages.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Pages read">
              {pages.map((p) => (
                <StatusTag key={p.page} status={scannedPages.has(p.page) ? 'success' : 'info'}>
                  Page {p.page}{scannedPages.has(p.page) ? ' read' : ''}
                </StatusTag>
              ))}
            </div>
          )}
        </div>

        {!ocr?.enabled && (
          <Notice tone="info" title="Form reader not set up on this server">Type each player in below with “Add a player”.</Notice>
        )}
        {ocr?.enabled && !ocr.healthy && (
          <Notice tone="warning" title="The form reader is not answering">You can still type players in by hand, or try a photo anyway.</Notice>
        )}

        {ocr?.enabled && (
          <>
            <p className="type-body-s text-fg-muted m-0">
              One page per photo: flat, well lit, all four black corner squares in view. Pages left blank need no photo.
            </p>
            <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr] sm:items-end">
              <Button icon={Camera} loading={scanning} onClick={() => cameraInput.current?.click()}>Take photo</Button>
              <Button variant="line" icon={ImageUp} disabled={scanning} onClick={() => fileInput.current?.click()}>Choose photo</Button>
              <Field id="desk-page-hint" label="Page (only if asked)">
                <Select value={pageHint} onChange={(e) => setPageHint(e.target.value)}>
                  <option value="">From the code on the page</option>
                  {pages.map((p) => <option key={p.page} value={p.page}>Page {p.page}</option>)}
                </Select>
              </Field>
            </div>
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onPhoto} />
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onPhoto} />
            {scanError && <Notice tone="danger" title="That photo could not be read">{scanError}</Notice>}
          </>
        )}
      </Panel>

      <Panel className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading level={3} step="display-s">Check every player</Heading>
          <span className="type-caption text-fg-muted" aria-live="polite">
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
        </div>

        {rows.length === 0 && <p className="type-body-s text-fg-muted m-0">No players yet. Photograph a page, or add one by hand.</p>}

        <ol className="grid gap-4 m-0 p-0 list-none">
          {rows.map((row, i) => (
            <DeskReviewRow
              key={row._id || `new-${i}`}
              index={i}
              row={row}
              crop={row._id ? crops[String(row._id)] : null}
              competition={draft.competition}
              locked={Boolean(row.player)}
              onChange={(next) => touch(rows.map((r, j) => (j === i ? next : r)))}
              onRemove={() => touch(rows.filter((_, j) => j !== i))}
            />
          ))}
        </ol>

        <Button variant="line" icon={Plus} onClick={addRow}>Add a player</Button>

        {needsConsent && (
          <CheckBox id="desk-consent" checked={consent} onChange={(on) => touch(rows, on)}>
            The coach confirms each under-18 player&apos;s parent or guardian agreed to this registration.
          </CheckBox>
        )}

        {errors > 0 && <Notice tone="danger" title={`${errors} row${errors === 1 ? '' : 's'} to fix`}>Rows in red cannot be submitted yet.</Notice>}

        <Button icon={Send} loading={submitting} disabled={!canSubmit || submitting} onClick={() => setConfirming(true)}>
          Register {rows.filter((r) => !r.entered).length} player{rows.filter((r) => !r.entered).length === 1 ? '' : 's'}
        </Button>
      </Panel>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={submit}
        title="Register these players?"
        confirmText="Register"
        cancelText="Back"
      >
        Each player gets an account and is entered in the competition. If the connection drops part-way,
        registering again carries on where it stopped.
      </ConfirmDialog>
    </div>
  );
};

DeskFormStep.propTypes = {
  draft: PropTypes.object.isRequired,
  ocr: PropTypes.object,
  onDraft: PropTypes.func.isRequired,
};

export default DeskFormStep;
