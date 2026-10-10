import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, CheckCircle, ArrowLeft, Trophy, Lock, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { superAdminAPI } from '@/services/api';
import looksMeta from '@/styles/generated/looks.meta.json';
import { FadeIn } from '@/components/admin/AdminKit';
import { logger } from '@/infrastructure/logger';
import { calculatePlayerFee, resolveFeeWindow, formatFeeWindowDate } from '@/utils/scoring/competitionFee';

/** Razorpay takes a hex for its theme: the brand saffron from the pack metadata. */
const RAZORPAY_THEME = looksMeta.looks['prime-time'].dark.accent;

/** Keep in sync with AddPlayerForm checkout session key */
const SUPERADMIN_PLAYER_CHECKOUT_STORAGE_KEY = 'mallakhamb_superadmin_player_checkout_v1';

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

const managementPath = '/superadmin/dashboard/management';

const SuperAdminAddPlayerPayment = () => {
  const navigate = useNavigate();
  const [checkout, setCheckout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SUPERADMIN_PLAYER_CHECKOUT_STORAGE_KEY);
      if (!raw) {
        toast.error('No pending player registration. Fill the form on Management → Add Player first.');
        navigate(managementPath, { replace: true });
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed?.playerData?.teamId || !parsed?.playerData?.competitionId) {
        sessionStorage.removeItem(SUPERADMIN_PLAYER_CHECKOUT_STORAGE_KEY);
        toast.error('Invalid checkout session.');
        navigate(managementPath, { replace: true });
        return;
      }
      if (!parsed?.competitionPlayerFee) {
        sessionStorage.removeItem(SUPERADMIN_PLAYER_CHECKOUT_STORAGE_KEY);
        toast.error('Checkout is missing a valid competition per-player fee. Start again from Add Player.');
        navigate(managementPath, { replace: true });
        return;
      }
      setCheckout(parsed);
    } catch (e) {
      logger.error('SuperAdmin checkout parse error', e);
      sessionStorage.removeItem(SUPERADMIN_PLAYER_CHECKOUT_STORAGE_KEY);
      toast.error('Could not load checkout data.');
      navigate(managementPath, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const handlePayment = async () => {
    if (!checkout?.playerData) return;

    const { playerData } = checkout;

    try {
      setProcessing(true);

      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        setProcessing(false);
        toast.error('Razorpay checkout failed to load. Disable ad-block/privacy extensions or try another network.');
        return;
      }

      const orderResponse = await superAdminAPI.createPlayerPaymentOrder({
        teamId: playerData.teamId,
        competitionId: playerData.competitionId,
        firstName: playerData.firstName,
        lastName: playerData.lastName,
      });

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
        description: `Add player ${playerData.firstName} ${playerData.lastName} — ${orderTeam?.name || checkout.teamLabel || 'Team'}`,
        order_id: order.id,
        retry: {
          enabled: true,
          max_count: 3,
        },
        timeout: 900,
        handler: async (response) => {
          try {
            setProcessing(true);
            await superAdminAPI.verifyPlayerPaymentAndAdd({
              playerData,
              payment: response,
            });
            sessionStorage.removeItem(SUPERADMIN_PLAYER_CHECKOUT_STORAGE_KEY);
            setPaymentComplete(true);
            toast.success('Payment successful! Player has been added to the team.');
          } catch (error) {
            const errorMessage =
              error?.response?.data?.message ||
              'Payment verification failed. Please contact support with your payment reference.';
            toast.error(errorMessage);
            logger.error('SuperAdmin player payment verification failed:', {
              error: errorMessage,
              paymentId: response?.razorpay_payment_id,
              orderId: response?.razorpay_order_id,
            });
          } finally {
            setProcessing(false);
          }
        },
        modal: {
          ondismiss: () => {
            setProcessing(false);
            toast.error('Payment cancelled. Try again when ready.');
            logger.info('SuperAdmin payment modal dismissed by user');
          },
          escape: true,
          backdropclose: false,
          confirm_close: true,
          animation: true,
        },
        prefill: {
          name: `${playerData.firstName} ${playerData.lastName}`.trim(),
          email: playerData.email || undefined,
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
                instruments: [{ method: 'upi' }, { method: 'card' }, { method: 'netbanking' }, { method: 'wallet' }],
              },
            },
            sequence: ['block.banks'],
            preferences: {
              show_default_blocks: true,
            },
          },
        },
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-center">
          <div
            className="ui-spinner text-accent-fg mx-auto mb-4"
            aria-hidden="true"
          />
          <p className="text-fg-muted text-sm">Loading checkout…</p>
        </div>
      </div>
    );
  }

  if (paymentComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-bg">
        <div className="w-full max-w-md text-center">
          <div
            className="rounded-3xl border p-10 bg-surface border-line"
          >
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: '#22C55E18', border: '2px solid #22C55E40' }}>
              <CheckCircle className="w-10 h-10 text-success-fg" aria-hidden="true" />
            </div>
            <h2 className="text-2xl font-black text-ink mb-3">Payment Successful!</h2>
            <p className="text-fg-muted mb-6 leading-relaxed">
              {checkout?.playerData?.firstName} {checkout?.playerData?.lastName} has been registered and added to{' '}
              {checkout?.teamLabel || 'the team'}.
            </p>
            <button
              type="button"
              onClick={() =>
                navigate(managementPath, {
                  replace: true,
                  state: { superadminPlayerAddedCompetitionId: checkout?.playerData?.competitionId },
                })
              }
              className="w-full py-3 rounded-xl font-bold text-ink min-h-[44px] bg-accent text-on-accent"
            >
              Back to Management
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!checkout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-fg-muted text-sm">Redirecting…</p>
      </div>
    );
  }

  const pd = checkout?.playerData;
  const mockCompetition = {
    playerFee: checkout?.competitionPlayerFee,
    apparatusFees: checkout?.competitionApparatusFees || {},
    registrationOpenDate: checkout?.competitionRegistrationOpenDate || null,
    feeDueDate: checkout?.competitionFeeDueDate || null,
    endDate: checkout?.competitionEndDate || null,
    lateFee: Number(checkout?.competitionLateFee) || 0,
  };
  const baseFee = calculatePlayerFee(pd, mockCompetition) ?? 0;

  /*
   * A super admin is NOT blocked outside the window — this is the override path
   * (see `super-admin.service.createPlayerPaymentOrder`) — but the late fee
   * still applies, so the phase is resolved here purely to price and explain it.
   */
  const feeWindow = resolveFeeWindow(mockCompetition);
  const lateFee = feeWindow.lateFeePerPlayer;
  const playerFee = baseFee + lateFee;

  return (
    <div className="min-h-screen bg-bg text-fg">

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        <FadeIn>
          <button
            type="button"
            onClick={() => navigate(managementPath)}
            className="flex items-center gap-2 text-fg-muted hover:text-fg mb-8 transition-colors min-h-[44px] -ml-2 px-2"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to Management
          </button>
          <div className="mb-8">
            <p className="type-tag mb-2 text-accent-fg">
              Add player
            </p>
            <h1 className="type-display-l text-fg">Player registration payment</h1>
            <p className="text-fg-muted text-sm mt-1">Same secure Razorpay checkout as coach team registration</p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <FadeIn delay={0.05}>
            <div
              className="rounded-3xl border p-6 h-full bg-surface border-line"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-surface-raised">
                  <Trophy className="w-5 h-5 text-accent-fg" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-ink font-bold">{checkout?.teamLabel || 'Team'}</h2>
                  <p className="text-fg-muted text-xs">{checkout?.competitionLabel || 'Competition'}</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-fg-muted text-xs uppercase tracking-wide mb-2">
                  <User className="w-3.5 h-3.5" aria-hidden="true" />
                  New player
                </div>
                <div className="flex justify-between py-2 border-b border-line">
                  <span className="text-fg-muted text-sm">Name</span>
                  <span className="text-ink font-semibold text-sm">
                    {pd?.firstName} {pd?.lastName}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-line">
                  <span className="text-fg-muted text-sm">Email</span>
                  <span className="text-ink font-semibold text-sm truncate max-w-[55%]">{pd?.email}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-line">
                  <span className="text-fg-muted text-sm">Age group</span>
                  <span className="text-ink font-semibold text-sm">{pd?.ageGroup}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-fg-muted text-sm">Gender</span>
                  <span className="text-ink font-semibold text-sm">{pd?.gender}</span>
                </div>
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div
              className="rounded-3xl border p-6 bg-surface border-line"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: '#22C55E18' }}>
                  <CreditCard className="w-5 h-5 text-success-fg" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-ink font-bold">Payment details</h2>
                  <p className="text-fg-muted text-xs">This competition&apos;s per-player fee (no base fee)</p>
                </div>
              </div>

              <div
                className="space-y-2 mb-6 p-4 rounded-2xl"
                style={{ background: 'rgb(var(--surface-sunken))', border: '1px solid var(--line)' }}
              >
                <div className="flex justify-between text-sm items-center">
                  <div>
                    <span className="text-fg-muted block">Per-player registration (this competition)</span>
                    {pd?.apparatus && (
                      <span className="text-fg-muted text-xs">
                        Apparatus: {typeof pd.apparatus === 'string' ? pd.apparatus : (Array.isArray(pd.apparatus) ? pd.apparatus.join(', ') : 'Multiple')}
                      </span>
                    )}
                  </div>
                  <span className="text-ink">₹{baseFee.toLocaleString()}</span>
                </div>
                {lateFee > 0 && (
                  <div className="flex justify-between text-sm items-center">
                    <div>
                      <span className="text-fg-muted block">Late fee</span>
                      <span className="text-fg-muted text-xs">
                        Fees were due by {formatFeeWindowDate(feeWindow.dueBy)}
                      </span>
                    </div>
                    <span className="text-accent-fg">+₹{lateFee.toLocaleString()}</span>
                  </div>
                )}
                <div className="border-t pt-2 mt-2 flex justify-between border-line">
                  <span className="text-ink font-bold">Total</span>
                  <span className="font-black text-lg text-accent-fg">
                    ₹{playerFee.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <button type="button" onClick={handlePayment} disabled={processing || !pd} className="w-full py-3 rounded-xl font-bold text-ink flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed bg-accent text-on-accent">
                  {processing ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Processing…
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" aria-hidden="true" />
                      Pay ₹{playerFee.toLocaleString()}
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-2 text-fg-muted text-xs">
                  <Lock className="w-3 h-3" aria-hidden="true" />
                  Secure Razorpay checkout
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminAddPlayerPayment;
