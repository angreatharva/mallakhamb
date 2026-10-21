import { useState } from 'react';
import PropTypes from 'prop-types';
import toast from 'react-hot-toast';
import { CreditCard, Tag as TagIcon } from 'lucide-react';
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
  const late = draft.competition.feePhase === 'late';

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
        { label: 'Amount due', value: rupees(due) },
      ]} />
      {late && (
        <Notice tone="warning" title="Late fee applies">
          Past the fee deadline: {rupees(draft.competition.lateFeePerPlayer)} per player is included.
        </Notice>
      )}
      <Button icon={CreditCard} loading={processing} onClick={pay}>Take payment · {rupees(due)}</Button>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field id="desk-discount" label="Discount code (if the coach has one)">
          <Input autoComplete="off" value={code} onChange={(e) => { setCode(e.target.value); setQuote(null); }} />
        </Field>
        <Button variant="line" icon={TagIcon} disabled={!code.trim() || processing} onClick={check}>Check code</Button>
      </div>
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
