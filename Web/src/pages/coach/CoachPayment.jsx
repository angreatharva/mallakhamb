import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CreditCard, CheckCircle, ArrowLeft, Trophy, Lock, CalendarClock, AlertTriangle, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { coachAPI } from '@/services/api';
import { COLORS, FG, SAFFRON_CTA, alpha } from '@/styles/tokens';
import { useReducedMotion } from '@/hooks/useResponsive';
import { FadeIn } from '@/components/design-system';
import { logger } from '@/infrastructure/logger';
import {
  getCompetitionPlayerFeeRupees, calculateTeamPaymentAmount, calculatePlayerFee,
  resolveFeeWindow, formatFeeWindowDate, FEE_PHASE,
} from '@/utils/scoring/competitionFee';

const CoachPayment = () => {
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const reduced = useReducedMotion();

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

      // Check if team is already submitted
      if (teamData?.isSubmitted) {
        setPaymentComplete(true);
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
      setPaymentComplete(true);
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
            setPaymentComplete(true);
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
          color: COLORS.saffron,
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.dark }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-4"
            style={{ borderColor: `${alpha(COLORS.saffron, 0x40)}`, borderTopColor: COLORS.saffron }} />
          <p className="text-fg-muted text-sm">Loading payment details...</p>
        </div>
      </div>
    );
  }

  if (paymentComplete) {
    const isAlreadySubmitted = team?.isSubmitted && team?.paymentStatus === 'completed';
    
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: COLORS.dark }}>
        <motion.div className="w-full max-w-md text-center"
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}>
          <div className="rounded-3xl border p-10"
            style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
            <motion.div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: isAlreadySubmitted ? `${alpha(COLORS.saffron, 0x18)}` : '#22C55E18', border: `2px solid ${isAlreadySubmitted ? `${alpha(COLORS.saffron, 0x40)}` : '#22C55E40'}` }}
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}>
              {isAlreadySubmitted ? (
                <Lock className="w-10 h-10" style={{ color: FG.brand }} aria-hidden="true" />
              ) : (
                <CheckCircle className="w-10 h-10" style={{ color: FG.success }} aria-hidden="true" />
              )}
            </motion.div>
            <h2 className="text-2xl font-black text-white mb-3">
              {isAlreadySubmitted ? 'Team Already Submitted' : 'Payment Successful!'}
            </h2>
            <p className="text-fg-muted mb-4 leading-relaxed">
              {isAlreadySubmitted 
                ? `Your team "${team?.name}" has already been submitted for the competition.`
                : `Your team "${team?.name}" has been successfully submitted for the competition.`
              }
            </p>
            {isAlreadySubmitted && (
              <div className="mb-6 p-4 rounded-xl" style={{ background: 'rgb(var(--ink) / 0.03)', border: `1px solid ${COLORS.darkBorderSubtle}` }}>
                <p className="text-white/60 text-sm">
                  To make any changes to your team, please contact the admin.
                </p>
              </div>
            )}
            <button onClick={() => navigate('/coach/dashboard')}
              className="w-full py-3 rounded-xl font-bold text-white min-h-[44px]"
              style={SAFFRON_CTA}>
              Back to Dashboard
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (team && !feeConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: COLORS.dark }}>
        <div className="w-full max-w-md rounded-3xl border p-8 text-center" style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
          <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: FG.brand }}>Payment</p>
          <h1 className="text-xl font-black text-white mb-3">Per-player fee not set</h1>
          <p className="text-fg-muted text-sm mb-6 leading-relaxed">
            This competition does not have a valid per-player registration fee. Ask a super admin to edit the competition and set the fee, then try again.
          </p>
          <button type="button" onClick={() => navigate('/coach/dashboard')}
            className="w-full py-3 rounded-xl font-bold text-white min-h-[44px]"
            style={SAFFRON_CTA}>
            Back to Dashboard
          </button>
        </div>
      </div>
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
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: COLORS.dark }}>
        <div className="w-full max-w-md rounded-3xl border p-8 text-center" style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: `${alpha(COLORS.saffron, 0x18)}`, border: `2px solid ${alpha(COLORS.saffron, 0x40)}` }}>
            <CalendarClock className="w-8 h-8" style={{ color: FG.brand }} aria-hidden="true" />
          </div>
          <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: FG.brand }}>Payment</p>
          <h1 className="text-xl font-black text-white mb-3">
            {notOpen ? 'Registration has not opened yet' : 'Registration is closed'}
          </h1>
          <p className="text-fg-muted text-sm mb-6 leading-relaxed">
            {notOpen
              ? `Fees for ${team?.competition?.name || 'this competition'} can be paid from `
                + `${formatFeeWindowDate(feeWindow.opensAt)}. Come back on or after that date.`
              : `Fees for ${team?.competition?.name || 'this competition'} closed at the end of `
                + `${formatFeeWindowDate(feeWindow.closesAt)}. Contact the organisers if you still need to enter.`}
          </p>
          <button type="button" onClick={() => navigate('/coach/dashboard')}
            className="w-full py-3 rounded-xl font-bold text-white min-h-[44px]"
            style={SAFFRON_CTA}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {!reduced && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full"
            style={{ background: `${alpha(COLORS.saffron, 0x06)}`, filter: 'blur(100px)', transform: 'translate(-50%,-50%)' }} />
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        {/* Back */}
        <FadeIn>
          <button onClick={() => navigate('/coach/dashboard')}
            className="flex items-center gap-2 text-fg-muted hover:text-fg mb-8 transition-colors min-h-[44px] -ml-2 px-2">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to Dashboard
          </button>
          <div className="mb-8">
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: FG.brand }}>
              Registration
            </p>
            <h1 className="text-3xl font-black text-white">Team Payment</h1>
            <p className="text-fg-muted text-sm mt-1">Complete your team registration for the competition</p>
            {team?.competition?.name && (
              <p className="text-fg-muted text-sm mt-2 font-medium">{team.competition.name}</p>
            )}
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team Summary */}
          <FadeIn delay={0.05}>
            <div className="rounded-3xl border p-6 h-full"
              style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: `${alpha(COLORS.saffron, 0x18)}` }}>
                  <Trophy className="w-5 h-5" style={{ color: FG.brand }} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-white font-bold">{team?.name}</h2>
                  <p className="text-fg-muted text-xs">Team Summary</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b" style={{ borderColor: COLORS.darkBorderSubtle }}>
                  <span className="text-fg-muted text-sm">Total Players</span>
                  <span className="text-white font-semibold text-sm">{team?.players?.length || 0}</span>
                </div>
                <div>
                  <p className="text-fg-muted text-xs uppercase tracking-wide mb-2">Age Group Distribution</p>
                  {team?.players && (() => {
                    const grouped = {};
                    team.players.forEach(p => {
                      const key = `${p.gender} ${p.ageGroup}`;
                      grouped[key] = (grouped[key] || 0) + 1;
                    });
                    return Object.entries(grouped).map(([group, count]) => (
                      <div key={group} className="flex justify-between py-1.5">
                        <span className="text-fg-muted text-sm">{group}</span>
                        <span className="text-white/60 text-sm">{count} players</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          </FadeIn>

          {/* Payment */}
          <FadeIn delay={0.1}>
            <div className="rounded-3xl border p-6"
              style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: '#22C55E18' }}>
                  <CreditCard className="w-5 h-5" style={{ color: FG.success }} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-white font-bold">Payment Details</h2>
                  <p className="text-fg-muted text-xs">Per-player fee for this competition (no base fee)</p>
                </div>
              </div>

              {/* Late-fee notice: the total below is bigger than the rows add up
                  to, and the coach is owed the reason before they pay it. */}
              {feeWindow.isLate && (
                <div className="flex gap-3 mb-5 p-4 rounded-2xl"
                  style={{ background: `${alpha(COLORS.saffron, 0x12)}`, border: `1px solid ${alpha(COLORS.saffron, 0x35)}` }}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: FG.brand }} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold text-white">Late fee applies</p>
                    <p className="text-fg-muted text-xs mt-1 leading-relaxed">
                      The last date to pay without a penalty was {formatFeeWindowDate(feeWindow.dueBy)}.
                      A late fee of ₹{feeWindow.lateFeePerPlayer.toLocaleString()} per athlete is added
                      to the fees below. Registration closes at the end of {formatFeeWindowDate(feeWindow.closesAt)}.
                    </p>
                  </div>
                </div>
              )}

              {!feeWindow.isLate && feeWindow.dueBy && feeWindow.lateFeePerPlayer === 0 && Number(team?.competition?.lateFee) > 0 && (
                <p className="text-fg-muted text-xs mb-5 leading-relaxed">
                  Pay by {formatFeeWindowDate(feeWindow.dueBy)} to avoid a late fee of
                  {' '}₹{Number(team.competition.lateFee).toLocaleString()} per athlete.
                </p>
              )}

              {/* Fee breakdown */}
              <div className="space-y-2 mb-6 p-4 rounded-2xl" style={{ background: 'rgb(var(--ink) / 0.03)', border: `1px solid ${COLORS.darkBorderSubtle}` }}>
                {team?.players?.length > 0 ? (
                  <div className="max-h-[200px] overflow-y-auto pr-2 space-y-2 mb-3">
                    {team.players.map((p, i) => (
                      <div key={p.player?._id || i} className="flex justify-between items-center text-sm py-1 border-b border-white/5 last:border-0">
                        <div>
                          <span className="text-white/80">{p.player?.firstName} {p.player?.lastName}</span>
                          <span className="text-fg-muted text-xs ml-2">
                            ({typeof p.apparatus === 'string' ? p.apparatus : (Object.keys(p.apparatus||{}).length > 0 ? 'Multiple' : 'Base')})
                          </span>
                        </div>
                        <span className="text-white">₹{calculatePlayerFee(p, team.competition).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex justify-between text-sm mb-3">
                    <span className="text-fg-muted">No players</span>
                    <span className="text-white">₹0</span>
                  </div>
                )}
                
                {lateFeeTotal > 0 && (
                  <div className="flex justify-between items-center text-sm py-1 border-t pt-3"
                    style={{ borderColor: COLORS.darkBorderSubtle }}>
                    <span className="text-white/70">
                      Late fee
                      <span className="text-fg-muted text-xs ml-2">
                        (₹{feeWindow.lateFeePerPlayer.toLocaleString()} × {playerCount})
                      </span>
                    </span>
                    <span style={{ color: FG.brand }}>+₹{lateFeeTotal.toLocaleString()}</span>
                  </div>
                )}

                {discountApplied && (
                  <div className="flex justify-between items-center text-sm py-1 border-t pt-3"
                    style={{ borderColor: COLORS.darkBorderSubtle }}>
                    <span className="text-white/70">
                      Discount code
                      <span className="text-fg-muted text-xs ml-2">({appliedDiscount.percent}% off)</span>
                    </span>
                    <span style={{ color: FG.success }}>
                      −₹{(appliedDiscount.discountAmount ?? 0).toLocaleString()}
                    </span>
                  </div>
                )}

                <div className="border-t pt-3 flex justify-between items-baseline" style={{ borderColor: COLORS.darkBorderSubtle }}>
                  <span className="text-white font-bold">Total Amount</span>
                  <span className="flex items-baseline gap-2">
                    {discountApplied && (
                      <span className="text-fg-muted text-sm line-through">
                        ₹{calculateTotal().toLocaleString()}
                      </span>
                    )}
                    <span className="font-black text-lg" style={{ color: discountApplied ? FG.success : FG.brand }}>
                      ₹{payableTotal.toLocaleString()}
                    </span>
                  </span>
                </div>
              </div>

              {/* Discount code — only when the server says codes are being taken */}
              {discountEnabled && (
                <div className="mb-6">
                  {discountApplied ? (
                    <div className="flex items-center justify-between gap-3 p-4 rounded-2xl"
                      style={{ background: '#22C55E10', border: '1px solid #22C55E35' }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Tag className="w-4 h-4 flex-shrink-0" style={{ color: FG.success }} aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">
                            {appliedDiscount.percent}% off applied
                          </p>
                          <p className="text-fg-muted text-xs">Nothing to pay for this entry</p>
                        </div>
                      </div>
                      <button type="button" onClick={handleRemoveDiscount} disabled={processing}
                        className="text-xs font-bold text-fg-muted hover:text-white/80 transition-colors tap-safe px-2 disabled:opacity-40">
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="discount-code"
                        className="block text-xs font-bold tracking-wide uppercase mb-1.5" style={{ color: FG.brand }}>
                        Discount Code
                      </label>
                      <div className="flex gap-2">
                        <input
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
                          className="flex-1 min-w-0 rounded-xl text-base mouse:text-sm text-white placeholder-white/30 min-h-[44px] px-3.5 transition-all disabled:opacity-50"
                          style={{ background: 'rgb(var(--ink) / 0.04)', border: `1px solid ${COLORS.darkBorderSubtle}` }}
                        />
                        <button type="button" onClick={handleApplyDiscount}
                          disabled={checkingCode || processing || !discountCode.trim()}
                          className="rounded-xl font-bold text-sm text-white px-4 min-h-[44px] flex-shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ background: 'rgb(var(--ink) / 0.08)', border: `1px solid ${COLORS.darkBorderSubtle}` }}>
                          {checkingCode ? 'Checking…' : 'Apply'}
                        </button>
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
                <motion.button onClick={discountApplied ? handleFreeSubmit : handlePayment} disabled={processing}
                  className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: discountApplied
                    ? 'linear-gradient(135deg, #22C55E, #16A34A)'
                    : SAFFRON_CTA.background, color: SAFFRON_CTA.color }}
                  whileHover={processing ? {} : { scale: 1.01 }}
                  whileTap={processing ? {} : { scale: 0.98 }}>
                  {processing ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {discountApplied ? 'Submitting Team…' : 'Processing Payment...'}
                    </>
                  ) : discountApplied ? (
                    <>
                      <CheckCircle className="w-4 h-4" aria-hidden="true" />
                      Submit Team — No Payment Due
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" aria-hidden="true" />
                      Pay ₹{calculateTotal().toLocaleString()}
                    </>
                  )}
                </motion.button>

                <div className="flex items-center justify-center gap-2 text-fg-muted text-xs">
                  <Lock className="w-3 h-3" aria-hidden="true" />
                  {discountApplied ? 'Discount verified on the server' : 'Secure Razorpay checkout'}
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </div>
  );
};

export default CoachPayment;
