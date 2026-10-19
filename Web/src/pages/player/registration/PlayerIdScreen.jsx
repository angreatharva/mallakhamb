import { useState } from 'react';
import PropTypes from 'prop-types';
import { ArrowRight, Check, Copy, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Notice } from '@/components/ui';
import { AuthHeader } from '@/components/shell';
import { playerIdCardText } from './playerRegistration';

/**
 * Shown once, straight after registration: the Player ID the server assigned.
 *
 * For a player without an email of their own it is the only way to sign in,
 * and with no email at all nobody can mail it to them — so the screen stops
 * here until they choose to continue, with Copy and Download to keep it.
 */
const PlayerIdScreen = ({ player, emailType, onContinue }) => {
  const [copied, setCopied] = useState(false);
  const loginUrl = `${window.location.origin}/player/login`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(player.loginId);
      setCopied(true);
      toast.success('Player ID copied');
    } catch {
      toast.error('Could not copy — please write it down');
    }
  };

  const download = () => {
    const blob = new Blob([playerIdCardText(player, loginUrl)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `player-id-${player.loginId}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const signInHint = emailType === 'self'
    ? 'Sign in with your email or this Player ID.'
    : 'Sign in with this Player ID and your password.';

  return (
    <section className="grid gap-5">
      <AuthHeader tag="Registration complete" title="Your Player ID" lede={signInHint} />

      <div className="shell-auth__player-id">
        <span id="player-id-label" className="type-tag text-fg-secondary">Player ID</span>
        <output aria-labelledby="player-id-label" className="shell-auth__player-id-value">{player.loginId}</output>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="line" icon={copied ? Check : Copy} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
        <Button variant="line" icon={Download} onClick={download}>Download</Button>
      </div>

      {emailType === 'none' ? (
        <Notice tone="warning" title="Write it down now">
          There is no email on this account, so we cannot send it to you. If you forget your password, ask your coach to reset it.
        </Notice>
      ) : (
        <Notice tone="info">
          We have also emailed it to {emailType === 'guardian' ? "your parent's or guardian's" : 'your'} address.
        </Notice>
      )}

      <Button size="lg" block iconRight={ArrowRight} onClick={onContinue}>Continue</Button>
    </section>
  );
};

PlayerIdScreen.propTypes = {
  player: PropTypes.shape({
    firstName: PropTypes.string,
    lastName: PropTypes.string,
    loginId: PropTypes.string.isRequired,
  }).isRequired,
  emailType: PropTypes.oneOf(['self', 'guardian', 'none']).isRequired,
  onContinue: PropTypes.func.isRequired,
};

export default PlayerIdScreen;
