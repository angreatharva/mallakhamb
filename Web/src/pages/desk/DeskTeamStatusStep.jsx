import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import toast from 'react-hot-toast';
import { LockOpen } from 'lucide-react';
import { deskAPI } from '@/services/user/desk.api';
import {
  Button, Dialog, Field, Heading, Notice, Panel, SpecList, Spinner, StatusTag, Textarea,
} from '@/components/ui';
import { ageLabel, errorText, genderWord } from './deskShared';

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/**
 * Step 3: the coach's team is already submitted (usually paid) at this meet.
 * The Admin or Super Admin unlocks it to add players. Everyone already paid
 * for stays paid; the coach pays only for the players added now, plus the
 * late fee per new player if the deadline has passed. Recorded in History.
 */
const DeskTeamStatusStep = ({ competitionId, coach, onUnlocked, onBack }) => {
  const [status, setStatus] = useState(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    deskAPI.teamStatus(competitionId, coach._id)
      .then((res) => setStatus(res.data?.data))
      .catch((error) => { toast.error(errorText(error, 'Could not read the team’s entry')); setStatus({ error: true }); });
  }, [competitionId, coach._id]);

  const unlock = async () => {
    setUnlocking(true);
    try {
      await deskAPI.unlockTeam({ competitionId, coachId: coach._id, reason: reason.trim() });
      toast.success('Team unlocked');
      setAsking(false);
      onUnlocked(coach);
    } catch (error) {
      toast.error(errorText(error, 'Could not unlock the team'));
    } finally {
      setUnlocking(false);
    }
  };

  if (!status) return <div className="py-8 flex justify-center"><Spinner label="Reading the team’s entry" /></div>;

  const paid = status.paymentStatus === 'completed';
  const canPay = status.feeWindow?.canPay !== false;

  return (
    <Panel className="grid gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level={3} step="display-s">Team already submitted</Heading>
        <StatusTag status={paid ? 'success' : 'warning'}>{paid ? 'Submitted · paid' : 'Submitted'}</StatusTag>
      </div>
      <SpecList items={[
        { label: 'Team', value: coach.team?.name || '—' },
        { label: 'Players entered', value: String(status.players ?? 0) },
        { label: 'Paid for', value: `${status.paidPlayers || (paid ? status.players : 0)} player${(status.paidPlayers || status.players) === 1 ? '' : 's'}` },
        ...(status.paymentAmount !== null && status.paymentAmount !== undefined ? [{ label: 'Amount paid', value: rupees(status.paymentAmount) }] : []),
      ]} />

      {status.squad?.length > 0 && (
        <ul className="grid gap-1 m-0 p-0 list-none" aria-label="Players already entered">
          {status.squad.map((p) => (
            <li key={p._id} className="flex flex-wrap items-center justify-between gap-2 type-body-s">
              <span>{p.name} <span className="text-fg-muted">· {p.loginId} · {genderWord(p.gender)} {ageLabel(p.ageGroup)}</span></span>
              <StatusTag status={p.paid ? 'success' : 'warning'}>{p.paid ? 'Paid' : 'Not paid'}</StatusTag>
            </li>
          ))}
        </ul>
      )}

      <Notice tone="info" title="Unlock to add players">
        Players already paid for stay paid and are never charged again. The coach pays only for the players
        added now{status.feeWindow?.isLate ? `, plus the late fee of ${rupees(status.feeWindow.lateFeePerPlayer)} per new player` : ''}.
      </Notice>
      {!canPay && (
        <Notice tone="warning" title="Not taking entries">This competition is not taking entries right now, so the team cannot be unlocked.</Notice>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button icon={LockOpen} disabled={!canPay} onClick={() => setAsking(true)}>Unlock team</Button>
        <Button variant="line" onClick={onBack}>Choose a different coach</Button>
      </div>

      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        title="Unlock this team?"
        actions={(
          <>
            <Button variant="line" onClick={() => setAsking(false)}>Back</Button>
            <Button icon={LockOpen} loading={unlocking} disabled={reason.trim().length < 5} onClick={unlock}>Unlock</Button>
          </>
        )}
      >
        <div className="grid gap-3">
          <p className="type-body-s m-0">
            {coach.team?.name} can then take new players. The {status.paidPlayers || status.players} player(s) already
            paid for stay paid. This is recorded in History.
          </p>
          <Field id="desk-unlock-reason" label="Reason" required help="At least 5 characters, for example “Two players arrived at the desk”.">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </Panel>
  );
};

DeskTeamStatusStep.propTypes = {
  competitionId: PropTypes.string.isRequired,
  coach: PropTypes.object.isRequired,
  onUnlocked: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
};

export default DeskTeamStatusStep;
