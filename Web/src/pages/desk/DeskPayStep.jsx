import { useState } from 'react';
import PropTypes from 'prop-types';
import toast from 'react-hot-toast';
import { CheckCircle, CreditCard, Tag as TagIcon } from 'lucide-react';
import { deskAPI } from '@/services/user/desk.api';
import { logger } from '@/infrastructure/logger';
import { loadRazorpayScript, RAZORPAY_THEME } from '@/utils/payment/razorpay';
import { Button, Field, Heading, Input, Notice, Panel, SpecList } from '@/components/ui';
import { errorText } from './deskShared';

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/**
 * Step 7: the coach pays — through the coach's own Razorpay checkout (UPI on
 * the coach's phone, or a card), or the discount code. The server records the
 * admin at the desk as `recordedBy` on the transaction.
 */
const DeskPayStep = ({ draft, onDraft }) => {
  const [processing, setProcessing] = useState(false);
  const [code, setCode] = useState('');
  const [quote, setQuote] = useState(null);
  const due = draft.registration?.amountDue ?? 0;
  const players = draft.registration?.players ?? 0;
  // A team the Super Admin reopened: these players paid before and owe nothing.
  const paidPlayers = draft.registration?.paidPlayers ?? 0;
  const nothingNewToPay = paidPlayers > 0 && due === 0 && players > 0;
  const late = draft.competition.feePhase === 'late';
  // New players' fees and the late fee on each of them (paid players excluded).
  const fees = draft.registration?.fees || null;

  const pay = async () => {
    setProcessing(true);
    try {
      if (!(await loadRazorpayScript())) {
        toast.error('Razorpay checkout failed to load. Check the network, or disable ad-block for this site.');
        setProcessing(false);
        return;
      }
      const res = await deskAPI.createPaymentOrder(draft._id);
      const { order, razorpayKeyId, team } = res.data?.data || {};
      if (!order?.id || !razorpayKeyId) throw new Error('Unable to start the payment');
      const checkout = new window.Razorpay({
        key: razorpayKeyId,
        name: 'Mallakhamb Competition',
        description: `Walk-in registration · ${team?.name || draft.team?.name || 'Team'}`,
        order_id: order.id,
        retry: { enabled: true, max_count: 3 },
        timeout: 900,
        prefill: { name: draft.coach?.name || '', email: draft.coach?.email || '', contact: draft.coach?.phone || '' },
        theme: { color: RAZORPAY_THEME },
        handler: async (response) => {
          try {
            const verified = await deskAPI.verifyPayment(draft._id, response);
            toast.success('Payment received');
            onDraft(verified.data?.data?.draft);
          } catch (error) {
            logger.error('Desk payment verification failed', { paymentId: response?.razorpay_payment_id });
            toast.error(errorText(error, 'Payment taken but not confirmed. Note the payment ID and check Transactions.'));
          } finally {
            setProcessing(false);
          }
        },
        modal: {
          ondismiss: () => { setProcessing(false); toast('Payment cancelled'); },
          confirm_close: true,
          backdropclose: false,
        },
      });
      checkout.open();
    } catch (error) {
      toast.error(errorText(error, 'Could not start the payment'));
      setProcessing(false);
    }
  };

  const check = async () => {
    setProcessing(true);
    try {
      const res = await deskAPI.quoteDiscount(draft._id, code.trim());
      setQuote(res.data?.data);
    } catch (error) {
      setQuote(null);
      toast.error(errorText(error, 'That discount code is not valid'));
    } finally {
      setProcessing(false);
    }
  };

  const resubmit = async () => {
    setProcessing(true);
    try {
      const res = await deskAPI.resubmitPaid(draft._id);
      toast.success('Entry submitted — nothing new to pay');
      onDraft(res.data?.data?.draft);
    } catch (error) {
      toast.error(errorText(error, 'Could not submit the entry'));
    } finally {
      setProcessing(false);
    }
  };

  const redeem = async () => {
    setProcessing(true);
    try {
      const res = await deskAPI.redeemDiscount(draft._id, code.trim());
      toast.success('Entry submitted');
      onDraft(res.data?.data?.draft);
    } catch (error) {
      toast.error(errorText(error, 'Could not submit with the discount code'));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Panel className="grid gap-5 p-5">
      <Heading level={3} step="display-s">Payment</Heading>
      <SpecList items={[
        { label: 'Team', value: draft.team?.name || '—' },
        { label: 'Players in this entry', value: String(players) },
        ...(paidPlayers > 0 ? [{ label: 'Already paid for', value: `${paidPlayers} player${paidPlayers === 1 ? '' : 's'} · not charged again` }] : []),
        ...(fees ? [{ label: `Entry fee · ${fees.newPlayers} new player${fees.newPlayers === 1 ? '' : 's'}`, value: rupees(fees.entryFees) }] : []),
        ...(fees?.lateFeeTotal ? [{ label: `Late fee · ${rupees(fees.lateFeePerPlayer)} × ${fees.newPlayers}`, value: rupees(fees.lateFeeTotal) }] : []),
        { label: 'Amount due', value: rupees(due) },
      ]} />
      {late && !fees && (
        <Notice tone="warning" title="Late fee applies">
          Past the fee deadline: {rupees(draft.competition.lateFeePerPlayer)} per player is included.
        </Notice>
      )}
      {nothingNewToPay ? (
        <Button icon={CheckCircle} loading={processing} onClick={resubmit}>Submit entry — nothing new to pay</Button>
      ) : (
        <Button icon={CreditCard} loading={processing} onClick={pay}>Take payment · {rupees(due)}</Button>
      )}

      {!nothingNewToPay && (
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field id="desk-discount" label="Discount code (if the coach has one)">
          <Input autoComplete="off" value={code} onChange={(e) => { setCode(e.target.value); setQuote(null); }} />
        </Field>
        <Button variant="line" icon={TagIcon} disabled={!code.trim() || processing} onClick={check}>Check code</Button>
      </div>
      )}
      {quote && (
        <Notice tone="success" title={`${quote.percent}% off — ${rupees(quote.payableAmount)} to pay`}>
          <Button size="sm" loading={processing} onClick={redeem}>Submit entry with this code</Button>
        </Notice>
      )}
    </Panel>
  );
};

DeskPayStep.propTypes = { draft: PropTypes.object.isRequired, onDraft: PropTypes.func.isRequired };

export default DeskPayStep;
