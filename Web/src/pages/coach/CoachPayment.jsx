import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { CreditCard, CheckCircle, ArrowLeft, Trophy, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { coachAPI } from '../../services/api';
import { COLORS, FadeIn, useReducedMotion } from '../public/Home';

const CoachPayment = () => {
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const reduced = useReducedMotion();

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
      setTeam(response.data.team);
    } catch {
      toast.error('Failed to load team data');
      navigate('/coach/dashboard');
    } finally {
      setLoading(false);
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
      const { order, razorpayKeyId, team: orderTeam } = orderResponse.data;

      if (!order?.id || !razorpayKeyId) {
        setProcessing(false);
        toast.error('Unable to initialize payment. Please try again.');
        return;
      }

      const options = {
        key: razorpayKeyId,
        amount: order.amount * 100,
        currency: order.currency || 'INR',
        name: 'Mallakhamb Competition',
        description: `Registration for ${orderTeam?.name || team?.name || 'Team'}`,
        order_id: order.id,
        handler: async (response) => {
          try {
            await coachAPI.verifyPaymentAndSubmit(response);
            setPaymentComplete(true);
            toast.success('Payment successful! Team submitted for competition.');
          } catch {
            toast.error('Payment verification failed. Please contact support with your payment reference.');
          } finally {
            setProcessing(false);
          }
        },
        modal: {
          ondismiss: () => {
            setProcessing(false);
          },
        },
        prefill: {
          name: orderTeam?.name || team?.name || '',
        },
        theme: {
          color: COLORS.saffron,
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

  const calculateTotal = () => {
    const count = team?.players?.length || 0;
    return 500 + count * 100;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.dark }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-4"
            style={{ borderColor: `${COLORS.saffron}40`, borderTopColor: COLORS.saffron }} />
          <p className="text-white/45 text-sm">Loading payment details...</p>
        </div>
      </div>
    );
  }

  if (paymentComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: COLORS.dark }}>
        <motion.div className="w-full max-w-md text-center"
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}>
          <div className="rounded-3xl border p-10"
            style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
            <motion.div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: '#22C55E18', border: '2px solid #22C55E40' }}
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}>
              <CheckCircle className="w-10 h-10" style={{ color: '#22C55E' }} aria-hidden="true" />
            </motion.div>
            <h2 className="text-2xl font-black text-white mb-3">Payment Successful!</h2>
            <p className="text-white/45 mb-8 leading-relaxed">
              Your team "{team?.name}" has been successfully submitted for the competition.
            </p>
            <button onClick={() => navigate('/coach/dashboard')}
              className="w-full py-3 rounded-xl font-bold text-white min-h-[44px]"
              style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}>
              Back to Dashboard
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {!reduced && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full"
            style={{ background: `${COLORS.saffron}06`, filter: 'blur(100px)', transform: 'translate(-50%,-50%)' }} />
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        {/* Back */}
        <FadeIn>
          <button onClick={() => navigate('/coach/dashboard')}
            className="flex items-center gap-2 text-white/40 hover:text-white/70 mb-8 transition-colors min-h-[44px] -ml-2 px-2">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to Dashboard
          </button>
          <div className="mb-8">
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: COLORS.saffron }}>
              Registration
            </p>
            <h1 className="text-3xl font-black text-white">Team Payment</h1>
            <p className="text-white/40 text-sm mt-1">Complete your team registration for the competition</p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team Summary */}
          <FadeIn delay={0.05}>
            <div className="rounded-3xl border p-6 h-full"
              style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: `${COLORS.saffron}18` }}>
                  <Trophy className="w-5 h-5" style={{ color: COLORS.saffron }} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-white font-bold">{team?.name}</h2>
                  <p className="text-white/40 text-xs">Team Summary</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b" style={{ borderColor: COLORS.darkBorderSubtle }}>
                  <span className="text-white/50 text-sm">Total Players</span>
                  <span className="text-white font-semibold text-sm">{team?.players?.length || 0}</span>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase tracking-wide mb-2">Age Group Distribution</p>
                  {team?.players && (() => {
                    const grouped = {};
                    team.players.forEach(p => {
                      const key = `${p.gender} ${p.ageGroup}`;
                      grouped[key] = (grouped[key] || 0) + 1;
                    });
                    return Object.entries(grouped).map(([group, count]) => (
                      <div key={group} className="flex justify-between py-1.5">
                        <span className="text-white/40 text-sm">{group}</span>
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
                  <CreditCard className="w-5 h-5" style={{ color: '#22C55E' }} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-white font-bold">Payment Details</h2>
                  <p className="text-white/40 text-xs">Registration fees</p>
                </div>
              </div>

              {/* Fee breakdown */}
              <div className="space-y-2 mb-6 p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${COLORS.darkBorderSubtle}` }}>
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Base Registration Fee</span>
                  <span className="text-white">₹500</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Per Player ({team?.players?.length || 0} × ₹100)</span>
                  <span className="text-white">₹{((team?.players?.length || 0) * 100).toLocaleString()}</span>
                </div>
                <div className="border-t pt-2 mt-2 flex justify-between" style={{ borderColor: COLORS.darkBorderSubtle }}>
                  <span className="text-white font-bold">Total Amount</span>
                  <span className="font-black text-lg" style={{ color: COLORS.saffron }}>
                    ₹{calculateTotal().toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Checkout */}
              <div className="space-y-4">
                <motion.button onClick={handlePayment} disabled={processing}
                  className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}
                  whileHover={processing ? {} : { scale: 1.01 }}
                  whileTap={processing ? {} : { scale: 0.98 }}>
                  {processing ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Processing Payment...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" aria-hidden="true" />
                      Pay ₹{calculateTotal().toLocaleString()}
                    </>
                  )}
                </motion.button>

                <div className="flex items-center justify-center gap-2 text-white/20 text-xs">
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

export default CoachPayment;
