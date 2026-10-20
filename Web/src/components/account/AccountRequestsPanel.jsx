import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import toast from 'react-hot-toast';
import { Check, KeyRound, Mail, RefreshCw, X } from 'lucide-react';
import { logger } from '@/infrastructure/logger';
import { Button, ConfirmDialog, Dialog, EmptyState, Heading, Panel, Tag } from '@/components/ui';

/**
 * Requests from players who registered without an email, waiting on a person
 * (plan Part C): a password reset, or an email they want to add. The coach
 * sees their own players' requests on the dashboard; the super admin sees all
 * except those from players a coach registered, which only that coach sees.
 *
 * Approving a reset shows a one-time code to hand to the player — once. The
 * approver is asked first to check it is really the player or their parent,
 * because that check is the whole point of routing it through a person.
 *
 * `api` is the role's three calls: { list, approve(id), reject(id) }.
 */

const fullName = (player) => [player?.firstName, player?.lastName].filter(Boolean).join(' ') || 'This player';
const when = (date) => (date ? new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
const errorMessage = (error, fallback) =>
  error?.response?.data?.error?.message || error?.response?.data?.message || fallback;

const KIND = {
  'password-reset': { label: 'Password reset', icon: KeyRound },
  'email-change': { label: 'Add email', icon: Mail },
};

const AccountRequestsPanel = ({ api, title = 'Player requests', hideWhenEmpty = false, showTeam = false }) => {
  const [requests, setRequests] = useState(null);
  const [confirming, setConfirming] = useState(null); // { request, action }
  const [issued, setIssued] = useState(null); // { player, code, codeExpiresAt }

  const load = useCallback(async () => {
    try {
      const response = await api.list();
      setRequests(response.data?.data || []);
    } catch (error) {
      logger.error('Could not load account requests', error);
      setRequests([]);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const decide = async () => {
    const { request, action } = confirming;
    try {
      const response = await (action === 'approve' ? api.approve(request.id) : api.reject(request.id));
      const data = response.data?.data || {};
      if (data.code) setIssued({ player: request.player, code: data.code, codeExpiresAt: data.codeExpiresAt });
      else toast.success(response.data?.message || 'Done');
      await load();
    } catch (error) {
      // ConfirmDialog shows a thrown message inside the dialog.
      throw new Error(errorMessage(error, 'That did not work. Try again.'));
    }
  };

  if (requests === null) return null;
  if (hideWhenEmpty && requests.length === 0) return null;

  return (
    <Panel aria-labelledby="account-requests-title">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="grid gap-1">
          <Heading level={2} step="display-s"><span id="account-requests-title">{title}</span></Heading>
          <p className="type-caption text-fg-muted m-0">
            Players registered without an email. Check it is really them or their parent before you approve.
          </p>
        </div>
        <Button variant="ghost" size="sm" icon={RefreshCw} onClick={load}>Refresh</Button>
      </div>

      {requests.length === 0 ? (
        <EmptyState tag="No requests">Nobody is waiting for a reset or an email approval.</EmptyState>
      ) : (
        <ul className="grid gap-3 m-0 p-0 list-none">
          {requests.map((request) => {
            const kind = KIND[request.kind] || KIND['password-reset'];
            const Icon = kind.icon;
            return (
              <li key={request.id} className="account-request">
                <div className="account-request__who">
                  <Icon className="account-request__icon" aria-hidden="true" />
                  <div className="grid gap-1 min-w-0">
                    <span className="type-body font-semibold break-words">{fullName(request.player)}</span>
                    <span className="type-caption text-fg-secondary break-all">{request.player?.loginId}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <Tag>{kind.label}</Tag>
                      {request.status === 'approved' && <Tag tone="ident">Code given</Tag>}
                      {showTeam && request.player?.team && <span className="type-caption text-fg-muted">{request.player.team}</span>}
                    </span>
                    {request.kind === 'email-change' && (
                      <span className="type-caption break-all">
                        {request.newEmail} ({request.newEmailType === 'guardian' ? "parent's or guardian's" : 'their own'})
                      </span>
                    )}
                    <span className="type-caption text-fg-muted">Asked {when(request.createdAt)}</span>
                  </div>
                </div>
                <div className="account-request__actions">
                  <Button size="sm" icon={Check} onClick={() => setConfirming({ request, action: 'approve' })}>
                    {request.status === 'approved' ? 'New code' : 'Approve'}
                  </Button>
                  <Button size="sm" variant="line" icon={X} onClick={() => setConfirming({ request, action: 'reject' })}>
                    Reject
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {confirming && (
        <ConfirmDialog
          open
          onClose={() => setConfirming(null)}
          onConfirm={decide}
          tone={confirming.action === 'reject' ? 'danger' : 'default'}
          title={confirming.action === 'approve'
            ? `Approve for ${fullName(confirming.request.player)}?`
            : `Reject for ${fullName(confirming.request.player)}?`}
          confirmText={confirming.action === 'approve' ? 'Yes, approve' : 'Reject'}
        >
          {confirming.action === 'approve' && confirming.request.kind === 'password-reset' && (
            <p className="type-body-s m-0">
              Only approve if you have checked, in person or by phone, that this is the player or their parent.
              You will get a one-time code to give them; it works for 24 hours.
              {confirming.request.status === 'approved' && ' The code you gave before stops working.'}
            </p>
          )}
          {confirming.action === 'approve' && confirming.request.kind === 'email-change' && (
            <p className="type-body-s m-0 break-words">
              {confirming.request.newEmail} becomes this player&apos;s email. Approve only if it belongs to the player or their family.
            </p>
          )}
          {confirming.action === 'reject' && (
            <p className="type-body-s m-0">The player will have to ask again.</p>
          )}
        </ConfirmDialog>
      )}

      {issued && (
        <Dialog
          open
          onClose={() => setIssued(null)}
          title={`Code for ${fullName(issued.player)}`}
          actions={<Button onClick={() => setIssued(null)}>Done</Button>}
        >
          <div className="grid gap-3">
            <p className="type-body-s m-0">
              Give this code to the player. They enter it with their Player ID under &ldquo;Forgot password → My coach gave me a code&rdquo;.
              It is shown only now.
            </p>
            <output className="account-request__code" aria-label="One-time code">{issued.code}</output>
            <p className="type-caption text-fg-muted m-0">Player ID {issued.player?.loginId} · works once, until {when(issued.codeExpiresAt)}</p>
          </div>
        </Dialog>
      )}
    </Panel>
  );
};

AccountRequestsPanel.propTypes = {
  api: PropTypes.shape({ list: PropTypes.func.isRequired, approve: PropTypes.func.isRequired, reject: PropTypes.func.isRequired }).isRequired,
  title: PropTypes.string,
  hideWhenEmpty: PropTypes.bool,
  showTeam: PropTypes.bool,
};

export default AccountRequestsPanel;
