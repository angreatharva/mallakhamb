import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, Download, X } from 'lucide-react';
import {
  Button, IconButton, Field, Input, Textarea, Select, PasswordInput, Panel, Heading, Tag, StatusTag, Stat, SpecList,
  DataTable, Tabs, TabPanel, Segmented, Dialog, ConfirmDialog, Menu, Spinner, Skeleton, EmptyState, ErrorState, Grain,
  Notice, RunningOrder, RunningOrderItem, TextLink,
} from '@/components/ui';
import PlayerRankingBoard from '@/components/scores/PlayerRankingBoard';
import TeamChampionshipBoard from '@/components/scores/TeamChampionshipBoard';
import { useOptionalAppearance } from '@/contexts/AppearanceProvider';
import { AppHeader, PageHeader } from '@/components/shell';
import { PoleMark, Wordmark } from '@/components/brand/Brand';
import { KNOWN_LOOKS, currentLook } from '@/utils/ui/look';

/**
 * /__look — the look specimen (docs/design-language/PLAN.md Phase 3.3).
 *
 * Every primitive in every state, under any look × appearance × role. The one
 * page where a restyle is judged before any screen changes; e2e/look-specimen
 * photographs it and runs the contrast audit over it.
 *
 * Dev and preview builds only (VITE_LOOK_OVERRIDE=1); the route does not exist
 * in the deployed app. State lives in the URL so a combination is a link:
 *   /__look?look=prime-time&role=judge&appearance=light
 * (`look` is honoured by applyLook's preview override; `appearance` by the
 * first-paint script; `role` is applied here.)
 */
const ROLES = ['public', 'player', 'coach', 'admin', 'judge', 'superadmin'];
const ROWS = [
  { id: 1, lot: 1, name: 'Aarav Patil', team: 'SGAM-TRIALS-TEAM-A', d: '3.80', e: '4.25', total: '9.65' },
  { id: 2, lot: 2, name: 'Ravi Gaikwad', team: 'SGAM-TRIALS-TEAM-B', d: '3.60', e: '4.10', total: '9.30' },
  { id: 3, lot: 3, name: 'Kiran More', team: 'SGAM-TRIALS-TEAM-A', d: '3.80', e: '4.40', total: '9.85' },
];

const slip = (judgeRole, d, c, e) => ({ judgeRole, difficultyScore: d, combinationScore: c, executionScore: e, bonusScore: 0, total: d + c + e });
const SLIPS = [slip('SR_JUDGE', 3.8, 1.6, 4.2), slip('J1', 3.8, 1.6, 4.25), slip('J2', 3.6, 1.4, 4.1)];
const BOARD = [
  { uid: 'b1', playerName: 'Kiran More', teamName: 'SGAM-TRIALS-TEAM-A', coach: 'Preetesh Gamre', rank: 1, finalScore: 9.85, time: '1:24', panelSize: 3, judgeSlips: SLIPS },
  { uid: 'b2', playerName: 'Aarav Patil', teamName: 'SGAM-TRIALS-TEAM-A', rank: 2, finalScore: 9.65, panelSize: 3, judgeSlips: SLIPS, tieBreakInfo: { method: 'faster_time' } },
  { uid: 'b3', playerName: 'Ravi Gaikwad', teamName: 'SGAM-TRIALS-TEAM-B', rank: 3, finalScore: 9.3, panelSize: 3, judgeSlips: SLIPS, deduction: 0.1 },
  { uid: 'b4', playerName: 'Om Shinde', teamName: 'SGAM-TRIALS-TEAM-B', rank: 4, finalScore: 8.9, panelSize: 3, judgeSlips: SLIPS, tieBreakInfo: { method: 'identical_time', unresolved: true } },
];
const TEAMS = [
  { teamId: 't1', teamName: 'SGAM-TRIALS-TEAM-A', rank: 1, totalScore: 56.4, teamSize: 4, countedPerApparatus: 3, apparatus: [
    { apparatus: 'Pole Mallakhamb', subtotal: 28.8, counted: [{ playerName: 'Kiran More', finalScore: 9.85 }, { playerName: 'Aarav Patil', finalScore: 9.65 }, { playerName: 'Om Shinde', finalScore: 9.3 }], dropped: [{ playerName: 'Ravi Gaikwad', finalScore: 8.9 }] },
  ] },
  { teamId: 't2', teamName: 'SGAM-TRIALS-TEAM-B', rank: 4, totalScore: 51.2, teamSize: 6, countedPerApparatus: 5, apparatus: [] },
];

const Section = ({ id, title, children }) => (
  <section aria-labelledby={id} className="grid gap-4">
    <Heading id={id} level={2} step="display-m">{title}</Heading>
    {children}
  </section>
);

const Swatch = ({ name, className }) => (
  <div className="grid gap-1">
    <div className={`h-12 ${className}`} style={{ boxShadow: 'inset 0 0 0 1px var(--line)', borderRadius: 'var(--radius-control)' }} />
    <span className="type-caption text-fg-secondary">{name}</span>
  </div>
);

const LookSpecimen = () => {
  const navigate = useNavigate();
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const role = ROLES.includes(params.get('role')) ? params.get('role') : 'public';
  const look = KNOWN_LOOKS.includes(params.get('look')) ? params.get('look') : currentLook();
  const appearanceCtx = useOptionalAppearance();
  const [tab, setTab] = useState('individual');
  const [segment, setSegment] = useState('pole');
  const [dialog, setDialog] = useState(null);
  const [grain, setGrain] = useState(false);

  // After App's layout effect (which clears the role on a public path).
  useEffect(() => {
    if (role === 'public') document.documentElement.removeAttribute('data-role');
    else document.documentElement.setAttribute('data-role', role);
  }, [role, search]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(search);
    next.set(key, value);
    navigate({ search: `?${next}` }, { replace: true });
  };

  return (
    <main className="min-h-screen bg-bg text-fg" style={{ padding: 'var(--pad)' }}>
      {grain && <Grain />}
      <div className="mx-auto grid max-w-6xl gap-12">
        <header className="grid gap-4">
          <Tag tone="ident">Specimen</Tag>
          <Heading level={1} step="display-xl" sting={grain}>The look</Heading>
          <p className="type-body m-0 max-w-2xl text-fg-secondary">
            Every primitive in every state. Change the look, the appearance and the role; nothing else on this page changes.
          </p>
          <div className="flex flex-wrap items-center gap-3" data-specimen-controls>
            <Segmented label="Look" value={look} onChange={(v) => setParam('look', v)} options={KNOWN_LOOKS.map((l) => ({ value: l, label: l }))} />
            {appearanceCtx && (
              <Segmented label="Appearance" value={appearanceCtx.appearance} onChange={(v) => appearanceCtx.setPreference(v)}
                options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
            )}
            <Segmented label="Role" value={role} onChange={(v) => setParam('role', v)} options={ROLES.map((r) => ({ value: r, label: r }))} />
            <Button variant="ghost" size="sm" aria-pressed={grain} onClick={() => setGrain((g) => !g)}>Stage signatures {grain ? 'on' : 'off'}</Button>
          </div>
        </header>

        <Section id="sp-shell" title="Shell and brand">
          <div className="overflow-hidden" style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>
            <AppHeader role={role === 'public' ? null : role} segment="SGAM-TRIALS-1 (2026)" homeTo="/__look"
              navLabel="Specimen sections" onLogout={() => {}} profileTo="/__look"
              nav={[{ to: '/__look', label: 'Overview', end: true }, { to: '/__look/teams', label: 'Teams' }, { to: '/__look/scores', label: 'Scores' }]} />
            <div style={{ padding: '0 var(--pad)' }}>
              <PageHeader eyebrow="Pole · Under 14 Boys" title="Running order" lede="Drag to set who performs when; the lots decide the first order."
                actions={<><Button variant="line" icon={Download}>Export</Button><Button icon={Plus}>Draw lots</Button></>} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Wordmark to={null} />
            <PoleMark className="h-12 w-auto" />
            <PoleMark title="Mallakhamb India" className="h-8 w-auto" />
          </div>
        </Section>

        <Section id="sp-colour" title="Surfaces and text">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Swatch name="bg" className="bg-bg" />
            <Swatch name="surface" className="bg-surface" />
            <Swatch name="raised" className="bg-surface-raised" />
            <Swatch name="sunken" className="bg-surface-sunken" />
            <Swatch name="overlay" className="bg-surface-overlay" />
            <Swatch name="accent" className="bg-accent" />
            <Swatch name="ident" className="bg-ident" />
            <Swatch name="success" className="bg-success-fill" />
            <Swatch name="warning" className="bg-warning-fill" />
            <Swatch name="danger" className="bg-danger-fill" />
          </div>
          <Panel>
            <p className="type-body m-0 text-fg">Primary text — the routine scores 9.85.</p>
            <p className="type-body mt-1.5 mb-0 text-fg-secondary">Secondary text — Senior Judge, Pole, Under 14 Boys.</p>
            <p className="type-body mt-1.5 mb-0 text-fg-muted">Muted text — updated a minute ago.</p>
            <p className="type-body mt-1.5 mb-0 text-accent-fg">Accent text — Open the running order.</p>
            <p className="type-body mt-1.5 mb-0 text-ident-fg">Ident text — {role}.</p>
          </Panel>
        </Section>

        <Section id="sp-type" title="Type">
          <Panel className="grid gap-4">
            <p className="type-display-xl" style={{ margin: 0 }}>Display XL</p>
            <p className="type-display-l" style={{ margin: 0 }}>Display L — running order</p>
            <p className="type-display-m" style={{ margin: 0 }}>Display M — panel review</p>
            <p className="type-display-s" style={{ margin: 0 }}>Display S — remove athlete</p>
            <p className="type-num-l" style={{ margin: 0 }}>9.85<span className="ui-unit">PTS</span></p>
            <p className="type-num-m" style={{ margin: 0 }}>3.80<span className="ui-unit">D</span></p>
            <p className="type-body" style={{ margin: 0 }}>Body — a routine lasts 60 to 90 seconds; the clock starts on the first movement.</p>
            <p className="type-body-s" style={{ margin: 0 }}>Body S — dense cells and meta lines.</p>
            <p className="type-caption m-0 text-fg-secondary">Caption — help text under a field.</p>
            <p className="type-tag" style={{ margin: 0 }}>Tag — eyebrows and labels</p>
          </Panel>
        </Section>

        <Section id="sp-buttons" title="Buttons">
          <div className="grid gap-4">
            {['solid', 'line', 'ghost', 'danger'].map((variant) => (
              <div key={variant} className="flex flex-wrap items-center gap-3">
                <Button variant={variant}>{variant}</Button>
                <Button variant={variant} icon={Plus}>With icon</Button>
                <Button variant={variant} disabled>Disabled</Button>
                <Button variant={variant} loading>Saving</Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="line">Small</Button>
              <Button size="lg">Large</Button>
              <IconButton label="Edit" icon={Pencil} />
              <IconButton label="Delete" icon={Trash2} variant="ghost" />
              <IconButton label="Download" icon={Download} variant="solid" />
              <Button as="a" href="#sp-buttons" variant="line">A link styled as a button</Button>
            </div>
          </div>
        </Section>

        <Section id="sp-fields" title="Fields">
          <Panel className="grid gap-5 md:grid-cols-2">
            <Field label="Athlete name" help="As on the entry form"><Input placeholder="Ravi Gaikwad" /></Field>
            <Field label="Email" error="Enter a valid email address" required><Input type="email" defaultValue="ravi.g@" /></Field>
            <Field label="Execution"><Input numeric inputMode="decimal" defaultValue="4.25" /></Field>
            <Field label="Disabled"><Input disabled defaultValue="Locked after the meet" /></Field>
            <Field label="Apparatus"><Select defaultValue="pole"><option value="pole">Pole Mallakhamb</option><option value="rope">Rope Mallakhamb</option></Select></Field>
            <Field label="Password"><PasswordInput defaultValue="Secret2026" /></Field>
            <Field label="Notes" className="md:col-span-2"><Textarea placeholder="Anything the panel should know" /></Field>
            <Field label="Search"><Input type="search" placeholder="Search athletes" /></Field>
            <div className="flex items-end gap-3"><Button icon={Search}>Search</Button><Button variant="line">Clear</Button></div>
          </Panel>
        </Section>

        <Section id="sp-tags" title="Tags and status">
          <div className="flex flex-wrap items-center gap-3">
            <Tag>Neutral</Tag><Tag tone="accent">Live</Tag><Tag tone="ident">{role}</Tag><Tag tone="ident" solid>{role}</Tag>
            <StatusTag status="success">Paid</StatusTag><StatusTag status="warning">Late fee</StatusTag>
            <StatusTag status="danger">Locked</StatusTag><StatusTag status="info">Submitted</StatusTag>
          </div>
        </Section>

        <Section id="sp-panels" title="Panels, stats, specs">
          <div className="grid gap-4 md:grid-cols-3">
            <Panel><Stat label="Athletes" value="110" /></Panel>
            <Panel variant="feature"><Stat label="Final score" value="9.85" unit="PTS" size="l" hint="Average of the middle two" /></Panel>
            <Panel variant="band"><Stat label="Time" value="01:12" unit="MIN" /></Panel>
            <Panel variant="feature" rule="danger" className="md:col-span-3">
              <p className="type-body" style={{ margin: 0 }}>A feature panel with the danger rule: destructive context.</p>
            </Panel>
            <Panel className="md:col-span-3">
              <SpecList items={[{ label: 'Pole height', value: '2.6', unit: 'm' }, { label: 'Rope length', value: '6.0', unit: 'm' }, { label: 'Routine', value: '60–90', unit: 's' }]} />
            </Panel>
          </div>
        </Section>

        <Section id="sp-table" title="Table">
          <DataTable caption="Running order — Pole, Under 14 Boys" getRowKey={(r) => r.id} activeKey={2} rows={ROWS}
            columns={[
              { key: 'lot', header: 'Lot', numeric: true },
              { key: 'name', header: 'Athlete' },
              { key: 'team', header: 'Team' },
              { key: 'd', header: 'D', numeric: true },
              { key: 'e', header: 'E', numeric: true },
              { key: 'total', header: 'Total', numeric: true },
            ]} />
        </Section>

        <Section id="sp-tabs" title="Tabs and segmented">
          <Tabs label="Results" idBase="sp" value={tab} onChange={setTab}
            tabs={[{ id: 'individual', label: 'Individual' }, { id: 'team', label: 'Team championship' }, { id: 'breakdown', label: 'Breakdown' }]} />
          <TabPanel idBase="sp" tabId={tab}><p className="type-body m-0 text-fg-secondary">The {tab} panel.</p></TabPanel>
          <Segmented label="Apparatus" value={segment} onChange={setSegment}
            options={[{ value: 'pole', label: 'Pole' }, { value: 'rope', label: 'Rope' }, { value: 'hanging', label: 'Hanging' }]} />
        </Section>

        <Section id="sp-overlays" title="Dialogs and menus">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="line" onClick={() => setDialog('default')}>Open dialog</Button>
            <Button variant="danger" onClick={() => setDialog('confirm')}>Remove athlete…</Button>
            <Menu label="Team actions" buttonLabel="Team actions" items={[
              { label: 'Rename', icon: Pencil, onSelect: () => {} },
              { label: 'Download entries', icon: Download, onSelect: () => {} },
              { label: 'Remove', icon: Trash2, onSelect: () => setDialog('confirm'), danger: true },
            ]} />
          </div>
          <Dialog open={dialog === 'default'} onClose={() => setDialog(null)} title="Edit my score"
            actions={<><Button variant="line" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={() => setDialog(null)}>Save</Button></>}>
            <Field label="Execution"><Input numeric inputMode="decimal" defaultValue="4.25" /></Field>
          </Dialog>
          <ConfirmDialog open={dialog === 'confirm'} onClose={() => setDialog(null)} onConfirm={() => {}} tone="danger"
            title="Remove athlete" confirmText="Remove">Ravi Gaikwad leaves the team. Scores already given are kept.</ConfirmDialog>
        </Section>

        <Section id="sp-notices" title="Notices and links">
          <div className="grid gap-3 md:grid-cols-2">
            <Notice tone="danger" title="Login Failed" role="alert">Incorrect credentials. Please try again with correct credentials.</Notice>
            <Notice tone="warning" title="Account Temporarily Locked">Too many failed login attempts. Please try again in <span className="tabular-nums">14:52</span>.</Notice>
            <Notice tone="success" title="Code sent">If that email has an account, a 6-digit code is on its way.</Notice>
            <Notice tone="info">This may take a moment if the server is starting up.</Notice>
          </div>
          <div className="flex flex-wrap items-center gap-x-6">
            <TextLink href="#sp-notices">Forgot password?</TextLink>
            <TextLink href="#sp-notices" className="ui-link--quiet">← Home</TextLink>
          </div>
        </Section>

        <Section id="sp-order" title="Running order">
          <RunningOrder label="Competition levels">
            <RunningOrderItem index={1} title="District" meta="Meets held at district level." aside={<Tag tone="accent">2 competitions</Tag>} selected onClick={() => {}} />
            <RunningOrderItem index={2} title="SGAM-TRIALS-1 2026" meta="Mumbai · 10/10/2026 – 12/10/2026" aside={<><Tag>District</Tag><StatusTag status="success">Live</StatusTag></>} onClick={() => {}} />
            <RunningOrderItem index={3} title="University" meta="University and inter-university meets." aside={<Tag>0 competitions</Tag>} muted onClick={() => {}} />
          </RunningOrder>
        </Section>

        <Section id="sp-board" title="Results board">
          <PlayerRankingBoard players={BOARD} />
          <TeamChampionshipBoard teams={TEAMS} />
        </Section>

        <Section id="sp-states" title="Empty, loading and error">
          <div className="grid gap-4 md:grid-cols-2">
            <EmptyState tag="No teams yet" action={<Button variant="line" icon={Plus}>Create a team</Button>}>Teams you enter for this competition appear here.</EmptyState>
            <ErrorState tag="Could not load" action={<Button variant="line" icon={X}>Try again</Button>}>The scores did not load. Check the connection and try again.</ErrorState>
            <Panel className="grid gap-3"><Skeleton className="h-5 w-3/5" /><Skeleton /><Skeleton className="w-4/5" /></Panel>
            <Panel><Spinner label="Loading the running order" /></Panel>
          </div>
        </Section>
      </div>
    </main>
  );
};

export default LookSpecimen;
