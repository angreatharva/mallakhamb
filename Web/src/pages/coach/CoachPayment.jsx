import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { CreditCard, CheckCircle, ArrowLeft, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { coachAPI } from '@/services/api';
import { logger } from '@/infrastructure/logger';
import looksMeta from '@/styles/generated/looks.meta.json';
import { Button, Heading, Input, Notice, Panel, Tag as UiTag, TextLink } from '@/components/ui';
import { PageHeader } from '@/components/shell';
import {
  getCompetitionPlayerFeeRupees, calculateTeamPaymentAmount, calculatePlayerFee,
  resolveFeeWindow, formatFeeWindowDate, FEE_PHASE,
} from '@/utils/scoring/competitionFee';

/**
 * Razorpay's checkout takes a hex for its theme, not a token: the brand
 * saffron, read from the generated pack metadata so it follows the pack.
 */
const RAZORPAY_THEME = looksMeta.looks['prime-time'].dark.accent;

/** A one-message screen (done, no fee set, outside the window): a panel, one way back. */
const PayMessage = ({ tag, title, titleLevel = 1, onBack, children }) => (
  <div className="min-h-screen flex items-center justify-center px-[var(--pad)] bg-bg text-fg">
    <Panel variant="feature" className="w-full max-w-md grid gap-4 ui-fade-in">
      <UiTag tone="accent">{tag}</UiTag>
      <Heading level={titleLevel} step="display-m">{title}</Heading>
      {children}
      <Button block onClick={onBack}>Back to Dashboard</Button>
    </Panel>
  </div>
);
PayMessage.propTypes = {
  tag: PropTypes.node, title: PropTypes.node, titleLevel: PropTypes.number, onBack: PropTypes.func, children: PropTypes.node,
};

const CoachPayment = () => {
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  /*
   * How this page came to be showing a submitted team: 'paid' or 'free' when
   * the coach submitted it on this visit, 'already' when it was submitted
   * before they arrived. The refetch after a submit sees `isSubmitted` too, so
   * that alone can't tell a fresh success from a return visit.
   */
  const [submittedVia, setSubmittedVia] = useState(null);

  /*
   * Discount code.
   *
   * `discountEnabled` comes from the server — the code itself never reaches the
   * browser, and neither does any hint of it. `appliedDiscount` holds the
   * server's quote, so what is shown as the new total is the server's number
   * and not one this page worked out for itself.
   */
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [checkingCode, setCheckingCode] = useState(false);

  useEffect(() => { fetchTeamData(); }, []);

  const loadRazorpayScript = () => new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    let settled = false;
    const done = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const timeoutId = window.setTimeout(() => {
      done(Boolean(window.Razorpay));
    }, 20000);

    const onLoad = () => {
      window.clearTimeout(timeoutId);
      done(true);
    };

    const onError = () => {
      window.clearTimeout(timeoutId);
      done(false);
    };

    let existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existingScript?.dataset?.rzpFailed === 'true') {
      existingScript.remove();
      existingScript = null;
    }

    if (existingScript) {
      // If the browser already finished loading this script, events won't fire again.
      // In that case, directly resolve based on global availability.
      if (existingScript.dataset?.rzpLoaded === 'true') {
        window.clearTimeout(timeoutId);
        done(Boolean(window.Razorpay));
        return;
      }
      existingScript.addEventListener('load', onLoad, { once: true });
      existingScript.addEventListener('error', onError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      script.dataset.rzpLoaded = 'true';
      onLoad();
    };
    script.onerror = () => {
      script.dataset.rzpFailed = 'true';
      onError();
    };
    document.body.appendChild(script);
  });

  const fetchTeamData = async () => {
    try {
      const response = await coachAPI.getDashboard();
      // API returns: { success: true, data: { team: {...}, competitionId, totalTeams, discount } }
      const payload = response.data?.data || response.data;
      const teamData = payload?.team;
      setTeam(teamData);
      setDiscountEnabled(payload?.discount?.enabled === true);

      // Submitted before this visit — unless this visit is what submitted it.
      if (teamData?.isSubmitted) {
        setSubmittedVia((prev) => prev ?? 'already');
      }
    } catch {
      toast.error('Failed to load team data');
      navigate('/coach/dashboard');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Ask the server what this entry costs with the code applied.
   *
   * Quote only — nothing is submitted here, and a valid code grants nothing
   * that the redeem call does not check again for itself.
   */
  const handleApplyDiscount = async () => {
    const code = discountCode.trim();
    if (!code) {
      toast.error('Enter a discount code');
      return;
    }

    try {
      setCheckingCode(true);
      const response = await coachAPI.validateDiscountCode(code);
      const quote = response.data?.data || response.data;
      setAppliedDiscount(quote);
      toast.success(`Discount code applied — ${quote?.percent ?? 100}% off`);
    } catch (error) {
      setAppliedDiscount(null);
      toast.error(error?.response?.data?.message || 'That discount code is not valid');
    } finally {
      setCheckingCode(false);
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode('');
  };

  /**
   * Submit at no charge.
   *
   * A fully discounted entry never reaches Razorpay — the gateway has no
   * zero-value order — so this is its own endpoint rather than a variant of the
   * checkout flow, and it re-validates the code before submitting anything.
   */
  const handleFreeSubmit = async () => {
    try {
      setProcessing(true);
      await coachAPI.redeemDiscountCode(discountCode.trim());
      setSubmittedVia('free');
      toast.success('Discount applied. Team submitted for the competition.');
      await fetchTeamData();
    } catch (error) {
      const message = error?.response?.data?.message || 'Could not submit with that discount code.';
      toast.error(message);
      logger.error('Discount redemption failed:', { error: message });
      // The code may have been switched off between quoting and redeeming, so
      // drop the quote rather than leaving a ₹0 total the server will refuse.
      setAppliedDiscount(null);
    } finally {
      setProcessing(false);
    }
  };

  const handlePayment = async () => {
    try {
      setProcessing(true);

      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        setProcessing(false);
        toast.error('Razorpay checkout failed to load. Disable ad-block/privacy extensions or try another network.');
        return;
      }

      const orderResponse = await coachAPI.createPaymentOrder();
      // API returns: { success: true, data: { order, razorpayKeyId, team } }
      const responseData = orderResponse.data?.data || orderResponse.data;
      const { order, razorpayKeyId, team: orderTeam } = responseData;

      if (!order?.id || !razorpayKeyId) {
        setProcessing(false);
        toast.error('Unable to initialize payment. Please try again.');
        return;
      }

      const options = {
        key: razorpayKeyId,
        name: 'Mallakhamb Competition',
        description: `Registration for ${orderTeam?.name || team?.name || 'Team'}`,
        order_id: order.id,
        retry: {
          enabled: true,
          max_count: 3
        },
        timeout: 900, // 15 minutes in seconds
        handler: async (response) => {
          try {
            setProcessing(true);
            await coachAPI.verifyPaymentAndSubmit(response);
            setSubmittedVia('paid');
            toast.success('Payment successful! Team submitted for competition.');
            // Refresh team data to get updated submission status
            await fetchTeamData();
          } catch (error) {
            const errorMessage = error?.response?.data?.message || 'Payment verification failed. Please contact support with your payment reference.';
            toast.error(errorMessage);
            
            // Log error for debugging
            logger.error('Payment verification failed:', {
              error: errorMessage,
              paymentId: response?.razorpay_payment_id,
              orderId: response?.razorpay_order_id
            });
          } finally {
            setProcessing(false);
          }
        },
        modal: {
          ondismiss: () => {
            setProcessing(false);
            toast.error('Payment cancelled. Please try again when ready.');
            logger.info('Payment modal dismissed by user');
          },
          escape: true,
          backdropclose: false,
          confirm_close: true,
          animation: true,
        },
        prefill: {
          name: orderTeam?.name || team?.name || '',
        },
        theme: {
          color: RAZORPAY_THEME,
        },
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
        },
        config: {
          display: {
            blocks: {
              banks: {
                name: 'All payment methods',
                instruments: [
                  {
                    method: 'upi'
                  },
                  {
                    method: 'card'
                  },
                  {
                    method: 'netbanking'
                  },
                  {
                    method: 'wallet'
                  }
                ]
              }
            },
            sequence: ['block.banks'],
            preferences: {
              show_default_blocks: true
            }
          }
        }
      };

      if (!window.Razorpay) {
        setProcessing(false);
        toast.error('Payment gateway is unavailable right now. Please retry.');
        return;
      }

      const instance = new window.Razorpay(options);
      instance.open();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Payment failed. Please try again.');
      setProcessing(false);
    }
  };

  const basePlayerFee = getCompetitionPlayerFeeRupees(team?.competition);
  const feeConfigured = basePlayerFee !== null;

  /*
   * The registration window, resolved the same way the server resolves it
   * (`Server/src/config/payment.config.js`). The coach has to see the same
   * total the order will be created for — a page that quotes the base fee while
   * Razorpay asks for base + late fee is worse than one that refuses to load.
   */
  const feeWindow = resolveFeeWindow(team?.competition);
  const playerCount = team?.players?.length || 0;
  const lateFeeTotal = feeWindow.lateFeePerPlayer * playerCount;

  /** What the entry costs before any discount. */
  const calculateTotal = () => {
    if (!feeConfigured || !team?.players) return 0;
    return calculateTeamPaymentAmount(team.players, team.competition);
  };

  /*
   * What is actually owed.
   *
   * Taken from the server's quote rather than recomputed here — this page must
   * never be the thing that decides a fee is zero.
   */
  const discountApplied = appliedDiscount?.applied === true;
  const payableTotal = discountApplied ? (appliedDiscount.payableAmount ?? 0) : calculateTotal();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="type-body-s text-fg-muted flex items-center gap-3 m-0">
          <span className="ui-spinner" aria-hidden="true" />
          Loading payment details...
        </p>
      </div>
    );
  }

  if (submittedVia) {
    const isAlreadySubmitted = submittedVia === 'already';
    const COPY = {
      already: { tag: 'Submitted', title: 'Team Already Submitted' },
      paid: { tag: 'Paid', title: 'Payment Successful!' },
      free: { tag: 'Submitted', title: 'Team Submitted Successfully!' },
    };

    return (
      <PayMessage onBack={() => navigate('/coach/dashboard')} tag={COPY[submittedVia].tag} titleLevel={2}
        title={COPY[submittedVia].title}>
        <p className="type-body text-fg-muted m-0">
          {isAlreadySubmitted
            ? `Your team "${team?.name}" has already been submitted for the competition.`
            : `Your team "${team?.name}" has been successfully submitted for the competition.`
          }
        </p>
        <Notice tone="info">To make any changes to your team, please contact the admin.</Notice>
      </PayMessage>
    );
  }

  if (team && !feeConfigured) {
    return (
      <PayMessage onBack={() => navigate('/coach/dashboard')} tag="Payment" title="Per-player fee not set">
        <p className="type-body-s text-fg-muted m-0">
          This competition does not have a valid per-player registration fee. Ask a super admin to edit the competition and set the fee, then try again.
        </p>
      </PayMessage>
    );
  }

  /*
   * Outside the window there is nothing to do on this page.
   *
   * The server refuses to create an order in either state, so rendering the
   * checkout would only offer a button that answers with an error — this says
   * which dates apply instead.
   */
  if (team && !feeWindow.canPay) {
    const notOpen = feeWindow.phase === FEE_PHASE.NOT_OPEN;
    return (
      <PayMessage onBack={() => navigate('/coach/dashboard')} tag="Payment" title={notOpen ? 'Registration has not opened yet' : 'Registration is closed'}>
        <p className="type-body-s text-fg-muted m-0">
          {notOpen
            ? `Fees for ${team?.competition?.name || 'this competition'} can be paid from `
              + `${formatFeeWindowDate(feeWindow.opensAt)}. Come back on or after that date.`
            : `Fees for ${team?.competition?.name || 'this competition'} closed at the end of `
              + `${formatFeeWindowDate(feeWindow.closesAt)}. Contact the organisers if you still need to enter.`}
        </p>
      </PayMessage>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="max-w-5xl mx-auto px-[var(--pad)] pb-12">
        <div className="pt-6">
          <TextLink as="button" type="button" className="ui-link--quiet" onClick={() => navigate('/coach/dashboard')}>
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to Dashboard
          </TextLink>
        </div>
        <PageHeader
          eyebrow="Registration"
          title="Team Payment"
          lede={(
            <>
              Complete your team registration for the competition
              {team?.competition?.name && <span className="block mt-1 text-fg font-semibold">{team.competition.name}</span>}
            </>
          )}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team Summary */}
          <Panel className="h-full">
            <div className="grid gap-1 mb-5">
              <p className="type-tag text-fg-muted m-0">Team Summary</p>
              <Heading level={2} step="display-s" asIs>{team?.name}</Heading>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-line">
                <span className="text-fg-muted type-body-s">Total Players</span>
                <span className="text-fg font-semibold type-body-s tabular-nums">{team?.players?.length || 0}</span>
              </div>
              <div>
                <p className="type-tag text-fg-muted mt-0 mb-2">Age Group Distribution</p>
                {team?.players && (() => {
                  const grouped = {};
                  team.players.forEach(p => {
                    const key = `${p.gender} ${p.ageGroup}`;
                    grouped[key] = (grouped[key] || 0) + 1;
                  });
                  return Object.entries(grouped).map(([group, count]) => (
                    <div key={group} className="flex justify-between py-1.5">
                      <span className="text-fg-muted type-body-s">{group}</span>
                      <span className="text-fg type-body-s tabular-nums">{count} players</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </Panel>

          {/* Payment */}
          <Panel variant="feature">
            <div className="grid gap-1 mb-5">
              <Heading level={2} step="display-s">Payment Details</Heading>
              <p className="type-caption text-fg-muted m-0">Per-player fee for this competition (no base fee)</p>
            </div>

            {/* Late-fee notice: the total below is bigger than the rows add up
                to, and the coach is owed the reason before they pay it. */}
            {feeWindow.isLate && (
              <Notice tone="warning" title="Late fee applies" className="mb-5">
                The last date to pay without a penalty was {formatFeeWindowDate(feeWindow.dueBy)}.
                A late fee of ₹{feeWindow.lateFeePerPlayer.toLocaleString()} per athlete is added
                to the fees below. Registration closes at the end of {formatFeeWindowDate(feeWindow.closesAt)}.
              </Notice>
            )}

            {!feeWindow.isLate && feeWindow.dueBy && feeWindow.lateFeePerPlayer === 0 && Number(team?.competition?.lateFee) > 0 && (
              <p className="type-caption text-fg-muted mt-0 mb-5">
                Pay by {formatFeeWindowDate(feeWindow.dueBy)} to avoid a late fee of
                {' '}₹{Number(team.competition.lateFee).toLocaleString()} per athlete.
              </p>
            )}

            {/* Fee breakdown */}
            <div className="mb-6 pay-sheet">
              {team?.players?.length > 0 ? (
                <div className="max-h-[200px] overflow-y-auto pr-2 mb-3">
                  {team.players.map((p, i) => (
                    <div key={p.player?._id || i} className="pay-sheet__row">
                      <div className="min-w-0">
                        <span className="text-fg">{p.player?.firstName} {p.player?.lastName}</span>
                        <span className="text-fg-muted type-caption ml-2">
                          ({typeof p.apparatus === 'string' ? p.apparatus : (Object.keys(p.apparatus||{}).length > 0 ? 'Multiple' : 'Base')})
                        </span>
                      </div>
                      <span className="text-fg tabular-nums">₹{calculatePlayerFee(p, team.competition).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pay-sheet__row">
                  <span className="text-fg-muted">No players</span>
                  <span className="text-fg tabular-nums">₹0</span>
                </div>
              )}

              {lateFeeTotal > 0 && (
                <div className="pay-sheet__row pay-sheet__row--rule">
                  <span className="text-fg">
                    Late fee
                    <span className="text-fg-muted type-caption ml-2">
                      (₹{feeWindow.lateFeePerPlayer.toLocaleString()} × {playerCount})
                    </span>
                  </span>
                  <span className="text-warning-fg tabular-nums">+₹{lateFeeTotal.toLocaleString()}</span>
                </div>
              )}

              {discountApplied && (
                <div className="pay-sheet__row pay-sheet__row--rule">
                  <span className="text-fg">
                    Discount code
                    <span className="text-fg-muted type-caption ml-2">({appliedDiscount.percent}% off)</span>
                  </span>
                  <span className="text-success-fg tabular-nums">
                    −₹{(appliedDiscount.discountAmount ?? 0).toLocaleString()}
                  </span>
                </div>
              )}

              <div className="pay-sheet__total">
                <span className="type-tag text-fg">Total Amount</span>
                <span className="flex items-baseline gap-2">
                  {discountApplied && (
                    <span className="text-fg-muted type-body-s line-through tabular-nums">
                      ₹{calculateTotal().toLocaleString()}
                    </span>
                  )}
                  <span className="type-num-m pay-sheet__amount">
                    ₹{payableTotal.toLocaleString()}
                  </span>
                </span>
              </div>
            </div>

            {/* Discount code — only when the server says codes are being taken */}
            {discountEnabled && (
              <div className="mb-6">
                {discountApplied ? (
                  <Notice tone="success" title={`${appliedDiscount.percent}% off applied`}>
                    <div className="flex items-center justify-between gap-3">
                      <span>Nothing to pay for this entry</span>
                      <Button variant="ghost" size="sm" onClick={handleRemoveDiscount} disabled={processing}>Remove</Button>
                    </div>
                  </Notice>
                ) : (
                  <div className="ui-field">
                    <label htmlFor="discount-code" className="ui-field__label type-tag">Discount Code</label>
                    <div className="flex gap-2">
                      <Input
                        id="discount-code"
                        type="text"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck="false"
                        placeholder="Enter code"
                        value={discountCode}
                        disabled={checkingCode || processing}
                        onChange={(e) => setDiscountCode(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyDiscount(); } }}
                        className="flex-1 min-w-0"
                      />
                      <Button variant="line" onClick={handleApplyDiscount}
                        disabled={checkingCode || processing || !discountCode.trim()}>
                        {checkingCode ? 'Checking…' : 'Apply'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/*
              * Checkout.
              *
              * At ₹0 this is NOT a payment button with a different label — it
              * calls a different endpoint. Razorpay has no zero-value order,
              * so a fully discounted entry has to be submitted directly.
              */}
            <div className="space-y-4">
              <Button
                size="lg"
                block
                onClick={discountApplied ? handleFreeSubmit : handlePayment}
                loading={processing}
                icon={processing ? null : (discountApplied ? CheckCircle : CreditCard)}
              >
                {processing
                  ? (discountApplied ? 'Submitting Team…' : 'Processing Payment...')
                  : discountApplied
                    ? 'Submit Team — No Payment Due'
                    : `Pay ₹${calculateTotal().toLocaleString()}`}
              </Button>

              <p className="flex items-center justify-center gap-2 text-fg-muted type-caption m-0">
                <Lock className="w-3 h-3" aria-hidden="true" />
                {discountApplied ? 'Discount verified on the server' : 'Secure Razorpay checkout'}
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
};

export default CoachPayment;
