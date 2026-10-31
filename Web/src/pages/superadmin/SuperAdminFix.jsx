import { lazy, Suspense, useState } from 'react';
import { Heading, Spinner, Tabs, TabPanel } from '@/components/ui';

const AccountsSection = lazy(() => import('./fix/AccountsSection'));
const TeamsSection = lazy(() => import('./fix/TeamsSection'));
const TransferSection = lazy(() => import('./fix/TransferSection'));
const RestoreSection = lazy(() => import('./fix/RestoreSection'));

const ID = 'sa-fix';

/**
 * The sections, in the order the owner reaches for them. Each one is its own
 * file under ./fix and every write it makes asks for a reason, which History
 * keeps (docs/superadmin-control-plan.md).
 */
const SECTIONS = [
  { id: 'accounts', label: 'Accounts', Component: AccountsSection },
  { id: 'teams', label: 'Teams & coaches', Component: TeamsSection },
  { id: 'transfer', label: 'Move a player', Component: TransferSection },
  { id: 'restore', label: 'Restore', Component: RestoreSection },
];

/** Super Admin → Fix: correct anything, always with a reason. */
const SuperAdminFix = () => {
  const [tab, setTab] = useState(SECTIONS[0].id);
  const { Component } = SECTIONS.find((s) => s.id === tab) || SECTIONS[0];
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Heading level={2} step="display-m">Fix</Heading>
        <p className="type-body-s text-fg-muted m-0">Correct people, teams, entries, payments and scores. Every change asks for a reason and lands in History.</p>
      </div>
      <Tabs tabs={SECTIONS.map(({ id, label }) => ({ id, label }))} value={tab} onChange={setTab} label="Fix" idBase={ID} />
      <TabPanel idBase={ID} tabId={tab}>
        <Suspense fallback={<div className="py-8 flex justify-center"><Spinner label="Loading" /></div>}>
          <Component />
        </Suspense>
      </TabPanel>
    </div>
  );
};

export default SuperAdminFix;
