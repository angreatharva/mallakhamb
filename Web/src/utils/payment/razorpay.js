/**
 * Razorpay Checkout, shared by the coach's payment page and the walk-in desk.
 *
 * The script is loaded on demand (never at app start), and only once; a load
 * that failed is retried by removing the dead tag. Resolves false rather than
 * rejecting, so callers show one message for "blocked / offline / slow".
 */
import looksMeta from '@/styles/generated/looks.meta.json';

/**
 * Razorpay's checkout takes a hex for its theme, not a token: the brand
 * saffron, read from the generated pack metadata so it follows the pack.
 */
export const RAZORPAY_THEME = looksMeta.looks['prime-time'].dark.accent;

export const loadRazorpayScript = () => new Promise((resolve) => {
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
