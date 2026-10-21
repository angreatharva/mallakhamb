import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Download, Printer } from 'lucide-react';
import { deskAPI } from '@/services/user/desk.api';
import { Button, DataTable, Heading, Notice, Panel, SpecList, Spinner } from '@/components/ui';
import { APPARATUS_LABEL, ageLabel, errorText, genderWord, saveBlob } from './deskShared';

/** The slip as plain text: what the coach takes away. No passwords — the coach chose the default. */
export const slipText = (slip, loginUrl) => [
  `Mallakhamb — walk-in registration`,
  `${slip.competition?.name || ''}${slip.competition?.place ? `, ${slip.competition.place}` : ''}`,
  '',
  `Coach: ${slip.coach?.name || ''} (${slip.coach?.email || ''})`,
  `Team:  ${slip.team?.name || ''}`,
  `Paid:  ${slip.payment?.status === 'completed' ? `Rs ${slip.payment.amount ?? 0}${slip.payment.paymentId ? ` · ${slip.payment.paymentId}` : ''}` : 'not yet'}`,
  '',
  'Players (sign in with the Player ID and the coach’s default player password):',
  ...slip.players.map((p, i) => `${String(i + 1).padStart(2)}. ${p.loginId.padEnd(32)} ${p.name} · ${genderWord(p.gender)} ${ageLabel(p.ageGroup)} · ${p.apparatus.map((a) => APPARATUS_LABEL[a] || a).join(', ')}`),
  '',
  `Sign in at ${loginUrl}`,
  '',
].join('\n');

/** Step 8: Player IDs for the coach, to print or save. */
const DeskSlip = ({ draftId, onDone }) => {
  const [slip, setSlip] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    deskAPI.slip(draftId)
      .then((res) => setSlip(res.data?.data))
      .catch((err) => setError(errorText(err, 'Could not load the slip')));
  }, [draftId]);

  if (error) return <Notice tone="danger" title="Slip unavailable">{error}</Notice>;
  if (!slip) return <Spinner label="Loading the slip" />;

  const loginUrl = `${window.location.origin}/player/login`;
  return (
    <Panel className="grid gap-5 p-5 desk-slip">
      <Notice tone="success" title="Registration complete">
        Hand the coach this slip. Each player signs in with their Player ID and the coach’s default player password.
      </Notice>
      <Heading level={3} step="display-s">{slip.team?.name}</Heading>
      <SpecList items={[
        { label: 'Competition', value: slip.competition?.name || '—' },
        { label: 'Coach', value: `${slip.coach?.name || ''} · ${slip.coach?.email || ''}` },
        { label: 'Payment', value: slip.payment?.status === 'completed' ? `₹${slip.payment.amount ?? 0}${slip.payment.paymentId ? ` · ${slip.payment.paymentId}` : ''}` : 'Pending' },
      ]} />
      <DataTable
        caption="Players registered"
        columns={[
          { key: 'name', header: 'Player' },
          { key: 'loginId', header: 'Player ID', render: (p) => <code className="break-all" data-testid="slip-login-id">{p.loginId}</code> },
          { key: 'group', header: 'Category', render: (p) => `${genderWord(p.gender)} ${ageLabel(p.ageGroup)}` },
          { key: 'apparatus', header: 'Apparatus', render: (p) => p.apparatus.map((a) => APPARATUS_LABEL[a] || a).join(', ') },
        ]}
        rows={slip.players}
        getRowKey={(p) => p.loginId}
      />
      <div className="flex flex-col gap-2 sm:flex-row print:hidden">
        <Button icon={Printer} onClick={() => window.print()}>Print</Button>
        <Button variant="line" icon={Download}
          onClick={() => saveBlob(new Blob([slipText(slip, loginUrl)], { type: 'text/plain' }), `walk-in-${(slip.team?.name || 'team').replace(/[^A-Za-z0-9]+/g, '-')}.txt`)}>
          Save as text
        </Button>
        <Button variant="line" onClick={onDone}>Next coach</Button>
      </div>
    </Panel>
  );
};

DeskSlip.propTypes = { draftId: PropTypes.string.isRequired, onDone: PropTypes.func.isRequired };

export default DeskSlip;
