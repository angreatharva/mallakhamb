import { expect } from '@playwright/test';

/**
 * The coach's payment screen, as reusable steps.
 *
 * WHY A 100%-OFF CODE AND NOT A CARD. A team reaches a judge only once its
 * coach has final-submitted AND paid, so a seeded season has to get through
 * this screen somehow — and the ordinary way through it is Razorpay, whose
 * callback is signature-verified. Forging that signature from a spec would
 * either be rejected or prove the verification is not doing its job.
 *
 * A fully discounted entry is a different, shipped path: at ₹0 the page calls
 * `redeemDiscountCode` instead of opening the gateway, because Razorpay has no
 * zero-value order. That is a real product behaviour with a real endpoint
 * behind it, so driving it here exercises submission for free without faking
 * anything — the same trade `Server/scripts/payWithDiscount.js` makes over
 * HTTP, through the screen instead.
 *
 * To exercise the REAL gateway, leave this out and pay by hand in test mode.
 */

/**
 * Is this entry already submitted?
 *
 * The page swaps itself for a confirmation panel when it is, so there is no
 * code box to fill and nothing to press. Read before anything is typed, because
 * submission is irreversible from the coach's side and a second attempt is
 * refused with an error that reads like a broken discount code.
 *
 * @param {import('@playwright/test').Page} page - on /coach/payment
 */
export const alreadySubmitted = async (page) => {
  const confirmation = page.getByRole('heading', { name: /Team Already Submitted|Payment Successful|Team Submitted Successfully/ });
  const payable = page.locator('#discount-code');
  const payButton = page.getByRole('button', { name: /Pay ₹|Submit Team/ });

  /*
   * WAITED FOR, not sampled. The page renders its frame first and decides
   * between these two states only once `fetchTeamData` resolves, so a count
   * taken immediately after the navigation sees neither and reports "not
   * submitted" for an entry that is. The caller then waits out its own timeout
   * on a discount box this state never renders.
   */
  await expect(async () => {
    expect(
      (await confirmation.count()) + (await payable.count()) + (await payButton.count()),
      'the payment page settled on neither a confirmation nor a way to pay'
    ).toBeGreaterThan(0);
  }).toPass({ timeout: 30_000 });

  return (await confirmation.count()) > 0;
};

/**
 * Apply a discount code and submit the entry at no charge.
 *
 * Two steps, as the screen has them. The first only QUOTES — the server prices
 * the entry with the code applied and grants nothing — and the second
 * re-checks the code from scratch before submitting. Driving both is the point:
 * a code that validates and then fails to redeem is a real failure mode, and
 * skipping the quote would hide it.
 *
 * @param {import('@playwright/test').Page} page - on /coach/payment
 * @param {string} code
 */
export const submitWithDiscount = async (page, code) => {
  const box = page.locator('#discount-code');
  await expect(
    box,
    'there is no discount-code box on this page — DISCOUNT_CODE_ENABLED is not true on the server'
  ).toBeVisible({ timeout: 20_000 });

  await box.fill(code);
  await page.getByRole('button', { name: /^Apply$/ }).click();

  /*
   * The quote landed. Asserted on the applied panel rather than on the toast:
   * toasts expire, and this screen replaces the code box with the panel, which
   * is also what enables the free-submit button below.
   */
  await expect(
    page.getByText(/% off applied/),
    `the server refused the discount code — check DISCOUNT_CODE in Server/.env`
  ).toBeVisible({ timeout: 20_000 });

  const submit = page.getByRole('button', { name: /Submit Team — No Payment Due/ });
  await expect(
    submit,
    'a fully discounted entry must offer free submission rather than a Pay button'
  ).toBeEnabled({ timeout: 20_000 });
  await submit.click();

  // Submission is one-way, so the confirmation panel is the honest end of it.
  await expect(
    page.getByRole('heading', { name: /Payment Successful|Team Submitted Successfully|Team Already Submitted/ }),
    'the entry was not submitted — the redemption failed after the quote succeeded'
  ).toBeVisible({ timeout: 60_000 });
};
