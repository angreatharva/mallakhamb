import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import toast from 'react-hot-toast';
import { Camera, Eye, EyeOff, FileSpreadsheet, FileUp, ImageUp, Plus, Send, UserPlus } from 'lucide-react';
import { deskAPI } from '@/services/user/desk.api';
import { logger } from '@/infrastructure/logger';
import { Button, ConfirmDialog, Field, Heading, Notice, Panel, Select, StatusTag, Tabs, TabPanel } from '@/components/ui';
import DeskReviewRow from './DeskReviewRow';
import { shrinkPhoto } from './shrinkPhoto';
import { CheckBox, ageLabel, errorText, genderWord, saveBlob } from './deskShared';

/** The three ways to add players at the desk (docs/walk-in-desk-v2-plan.md). */
const TABS = [
  { id: 'scan', label: 'Scan form' },
  { id: 'excel', label: 'Excel' },
  { id: 'register', label: 'Register player' },
];

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
const DeskFormStep = ({ draft, ocr, onDraft, api = deskAPI, who = 'admin', excelFile = null, onExcelUsed = () => {} }) => {
  // The Admin desk offers all three ways; a coach's own paper form only scans.
  const desk = who === 'admin';
  const [tab, setTab] = useState(excelFile ? 'excel' : 'scan');
  const [importing, setImporting] = useState(false);
  const [excelResult, setExcelResult] = useState(null);
  const [password, setPassword] = useState(null);
  const excelInput = useRef(null);
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
      const res = await api.saveRows(draft._id, {
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
  }, [draft._id, onDraft, api]);

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
      const res = await api.scan(draft._id, blob, pageHint || undefined);
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

  const importExcel = async (file) => {
    setImporting(true);
    setExcelResult(null);
    try {
      if (dirty && !(await save())) return;
      const res = await api.importExcel(draft._id, file);
      const data = res.data?.data;
      onDraft(data.draft);
      setExcelResult({ name: file.name, added: data.added, skipped: data.skipped, errors: data.errors || [] });
      toast.success(`${file.name}: ${data.added} player${data.added === 1 ? '' : 's'} added${data.skipped ? `, ${data.skipped} already on the form` : ''}`);
    } catch (error) {
      setExcelResult({ name: file.name, failed: errorText(error, 'Could not read that Excel file') });
    } finally {
      setImporting(false);
    }
  };

  // A file chosen on the coach step is imported once, as soon as the form is open.
  useEffect(() => {
    if (!desk || !excelFile) return;
    onExcelUsed();
    setTab('excel');
    importExcel(excelFile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excelFile]);

  const onExcelChosen = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) importExcel(file);
  };

  const downloadTemplate = async () => {
    try {
      saveBlob((await api.excelTemplate()).data, 'mallakhamb-walk-in-template.xlsx');
    } catch (error) {
      toast.error(errorText(error, 'Could not make the Excel template'));
    }
  };

  const togglePassword = async () => {
    if (password !== null) { setPassword(null); return; }
    try {
      const data = (await api.defaultPassword(draft.coach._id)).data?.data;
      setPassword(data?.readable ? data.password : '');
    } catch (error) {
      toast.error(errorText(error, 'Could not read the default password'));
    }
  };

  const addRow = () => touch([...rows, {
    firstName: '', lastName: '', dateOfBirth: '', gender: null, ageGroup: null, apparatus: [], issues: [],
  }]);

  const submit = async () => {
    if (dirty && !(await save())) return;
    setSubmitting(true);
    try {
      const res = await api.submit(draft._id);
      onDraft(res.data?.data);
      toast.success('Players registered and entered');
    } catch (error) {
      toast.error(errorText(error, 'Could not submit — nothing is lost; fix the rows in red and submit again'));
      // Partial progress (players already created) is in the draft: reload it.
      try { onDraft((await api.getDraft(draft._id)).data?.data); } catch { /* keep what we have */ }
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
      {desk && (
        <Panel className="grid gap-3 p-5">
          <Heading level={3} step="display-s">Add players</Heading>
          <p className="type-body-s text-fg-muted m-0">
            Three ways, mixed freely: photograph the paper form, upload the Excel template, or register players by
            typing them in. Every player gets a Player ID and no email, and signs in with the coach&apos;s default player password.
          </p>
          <Tabs idBase="desk-add" label="How to add players" tabs={TABS} value={tab} onChange={setTab} />
        </Panel>
      )}

      {desk && tab === 'excel' && (
        <TabPanel idBase="desk-add" tabId="excel">
          <Panel className="grid gap-4 p-5">
            <Heading level={3} step="display-s">Upload the Excel template</Heading>
            <p className="type-body-s text-fg-muted m-0">
              One coach per file. Players are added to the list below for checking; nobody is registered until you
              press Register. Uploading the same file again adds nobody twice.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button icon={FileUp} loading={importing} onClick={() => excelInput.current?.click()}>Choose Excel file</Button>
              <Button variant="line" icon={FileSpreadsheet} onClick={downloadTemplate}>Download template</Button>
            </div>
            <input ref={excelInput} type="file" className="sr-only" tabIndex={-1} aria-hidden="true"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onExcelChosen} />
            {excelResult?.failed && <Notice tone="danger" title={`${excelResult.name} could not be read`}>{excelResult.failed}</Notice>}
            {excelResult && !excelResult.failed && (
              <Notice tone={excelResult.errors.length ? 'warning' : 'success'}
                title={`${excelResult.name}: ${excelResult.added} added${excelResult.skipped ? ` · ${excelResult.skipped} already on the form` : ''}`}>
                {excelResult.errors.length === 0 ? 'Check each player below.' : (
                  <ul className="m-0 pl-4">
                    {excelResult.errors.map((e, i) => (
                      <li key={`${e.excelRow}-${e.field}-${i}`}>{e.excelRow ? `Excel row ${e.excelRow}: ` : ''}{e.message}</li>
                    ))}
                  </ul>
                )}
              </Notice>
            )}
            {(draft.imports || []).length > 0 && (
              <p className="type-caption text-fg-muted m-0">
                Read so far: {draft.imports.map((f) => `${f.fileName} (${f.rows})`).join(', ')}
              </p>
            )}
          </Panel>
        </TabPanel>
      )}

      {desk && tab === 'register' && (
        <TabPanel idBase="desk-add" tabId="register">
          <Panel className="grid gap-4 p-5">
            <Heading level={3} step="display-s">Register a player</Heading>
            <p className="type-body-s text-fg-muted m-0">
              The same as Register Player on the coach&apos;s dashboard: no email, a Player ID, and the coach&apos;s
              default player password. The Player ID is emailed to the coach.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button icon={UserPlus} onClick={addRow}>Add a player</Button>
              <Button variant="line" icon={password ? EyeOff : Eye} onClick={togglePassword}>
                {password !== null ? 'Hide default password' : 'Show default password'}
              </Button>
              {password !== null && (
                <span className="type-body-s" aria-live="polite">
                  {password
                    ? <>Default player password: <strong className="font-mono">{password}</strong></>
                    : 'It cannot be read: the coach sets it again on their profile.'}
                </span>
              )}
            </div>
          </Panel>
        </TabPanel>
      )}

      {(!desk || tab === 'scan') && (
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
      )}

      {desk && (draft.squad || []).length > 0 && (
        <Panel className="grid gap-3 p-5">
          <Heading level={3} step="display-s">Already in the squad</Heading>
          <p className="type-caption text-fg-muted m-0">Entered before this form. Paid players are never charged again.</p>
          <ul className="grid gap-1 m-0 p-0 list-none">
            {draft.squad.map((p) => (
              <li key={p._id} className="flex flex-wrap items-center justify-between gap-2 type-body-s">
                <span>{p.name} <span className="text-fg-muted">· {p.loginId} · {genderWord(p.gender)} {ageLabel(p.ageGroup)}</span></span>
                <StatusTag status={p.paid ? 'success' : 'warning'}>{p.paid ? 'Paid' : 'Not paid'}</StatusTag>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading level={3} step="display-s">Check every player</Heading>
          <span className="type-caption text-fg-muted" aria-live="polite">
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
        </div>

        {rows.length === 0 && <p className="type-body-s text-fg-muted m-0">No players yet. Photograph a page, upload the Excel file, or register a player.</p>}

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
            {who === 'coach' ? 'I confirm' : 'The coach confirms'} each under-18 player&apos;s parent or guardian agreed to this registration.
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
  /** deskAPI (Admin desk) or paperFormAPI (a coach's own form): same methods. */
  api: PropTypes.object,
  who: PropTypes.oneOf(['admin', 'coach']),
  /** An Excel file chosen on the coach step: imported as soon as the form opens. */
  excelFile: PropTypes.object,
  onExcelUsed: PropTypes.func,
};

export default DeskFormStep;
