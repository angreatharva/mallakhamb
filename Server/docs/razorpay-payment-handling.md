# Razorpay Payment Handling - Edge Cases & Security

## Overview
This document outlines all edge cases and security measures implemented for Razorpay payment processing in the Mallakhamb Competition system.

## Security Measures Implemented

### 1. Server-Side Signature Verification
**Location**: `coach.service.js:verifyTeamPaymentAndSubmit()`

**Implementation**:
```javascript
const generatedSignature = crypto
  .createHmac('sha256', razorpayKeySecret)
  .update(`${razorpay_order_id}|${razorpay_payment_id}`)
  .digest('hex');
```

**Security Features**:
- ✅ HMAC-SHA256 signature verification
- ✅ Timing-safe comparison using `crypto.timingSafeEqual()`
- ✅ Prevents signature forgery attacks
- ✅ Validates payment authenticity before processing

### 2. Payment Status Verification via Razorpay API
**Implementation**:
```javascript
const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
if (paymentDetails.status !== 'captured' && paymentDetails.status !== 'authorized') {
  throw new ValidationError(`Payment ${paymentDetails.status}`);
}
```

**Verified Statuses**:
- ✅ `captured` - Payment successfully captured
- ✅ `authorized` - Payment authorized (for cards)
- ❌ `failed` - Payment failed
- ❌ `cancelled` - Payment cancelled by user
- ❌ `pending` - Payment still processing
- ❌ `refunded` - Payment refunded

### 3. Order ID Verification
**Implementation**:
```javascript
if (paymentDetails.order_id !== payload.razorpay_order_id) {
  throw new ValidationError('Payment verification failed: Order mismatch');
}
```

**Prevents**:
- Payment ID reuse across different orders
- Order substitution attacks

### 4. Amount Verification
**Implementation**:
```javascript
const expectedAmount = (500 + (playerCount * 100)) * 100; // Convert to paise
if (paymentDetails.amount !== expectedAmount) {
  throw new ValidationError('Payment verification failed: Amount mismatch');
}
```

**Prevents**:
- Partial payments
- Amount tampering
- Price manipulation

## Edge Cases Handled

### 1. Payment Cancellation
**Scenario**: User closes payment modal or clicks "Cancel" button

**Frontend Handling**:
```javascript
modal: {
  ondismiss: () => {
    setProcessing(false);
    toast.error('Payment cancelled. Please try again when ready.');
  }
}
```

**Backend Handling**:
- No database changes made
- Team remains in "not submitted" state
- User can retry payment

### 2. Payment Timeout
**Scenario**: Payment gateway times out (504 Gateway Timeout)

**Frontend Handling**:
```javascript
timeout: 900, // 15 minutes
retry: {
  enabled: true,
  max_count: 3
}
```

**Backend Handling**:
- Payment status check via API returns `failed` or `pending`
- Transaction record created with `paymentStatus: 'failed'`
- Team submission rejected
- Error message: "Payment failed. Please try again or contact support."

### 3. Payment Failed
**Scenario**: Payment fails due to insufficient funds, card decline, etc.

**Backend Handling**:
```javascript
if (paymentDetails.status !== 'captured' && paymentDetails.status !== 'authorized') {
  // Create failed transaction record
  await transactionRepository.create([{
    paymentStatus: 'failed',
    metadata: {
      razorpay_status: paymentDetails.status,
      error_code: paymentDetails.error_code,
      error_description: paymentDetails.error_description,
      failedAt: new Date()
    }
  }]);
  throw new ValidationError(`Payment ${paymentDetails.status}`);
}
```

**Result**:
- Failed transaction logged for audit
- Team not submitted
- User receives clear error message

### 4. Duplicate Submission
**Scenario**: User clicks submit multiple times or payment succeeds but frontend retries

**Backend Handling**:
```javascript
if (registeredTeam.isSubmitted) {
  return {
    verified: true,
    submitted: true,
    alreadySubmitted: true
  };
}
```

**Result**:
- Idempotent operation
- No duplicate charges
- Returns success response

### 5. Network Failure During Verification
**Scenario**: Network fails while verifying payment with Razorpay API

**Backend Handling**:
```javascript
try {
  paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
} catch (error) {
  throw new ValidationError('Payment verification failed: Unable to verify payment status');
}
```

**Result**:
- Team not submitted
- User must retry
- Payment can be verified later via webhook

### 6. Invalid Signature
**Scenario**: Tampered payment response or man-in-the-middle attack

**Backend Handling**:
```javascript
if (!crypto.timingSafeEqual(generatedBuffer, receivedBuffer)) {
  logger.error('Payment signature verification failed');
  throw new ValidationError('Payment verification failed: Invalid signature');
}
```

**Result**:
- Payment rejected immediately
- Security incident logged
- Team not submitted

### 7. Amount Mismatch
**Scenario**: Frontend sends different amount than expected

**Backend Handling**:
```javascript
const expectedAmount = (500 + (playerCount * 100)) * 100;
if (paymentDetails.amount !== expectedAmount) {
  throw new ValidationError('Payment verification failed: Amount mismatch');
}
```

**Result**:
- Payment rejected
- Prevents price manipulation
- Logged for investigation

### 8. Missing Payment Details
**Scenario**: Frontend sends incomplete payment data

**Backend Handling**:
```javascript
if (!payload?.razorpay_order_id || !payload?.razorpay_payment_id || !payload?.razorpay_signature) {
  throw new ValidationError('Missing required payment details');
}
```

**Result**:
- Early validation failure
- Clear error message
- No database queries wasted

### 9. Configuration Errors
**Scenario**: Razorpay credentials not configured or invalid

**Backend Handling**:
```javascript
if (!razorpayKeySecret || !razorpayKeyId) {
  throw new ValidationError('Payment verification failed: Configuration error');
}
```

**Result**:
- Generic error message (doesn't expose config details)
- Logged for admin investigation
- Payment not processed

### 10. Webhook Reconciliation
**Scenario**: Payment succeeds but frontend verification fails

**Webhook Handler**: `POST /api/webhooks/razorpay`

**Handling**:
```javascript
if (event === 'payment.captured') {
  matchingTeam.paymentStatus = 'completed';
  matchingTeam.paymentVerifiedAt = new Date();
  await matchingCompetition.save();
}
```

**Result**:
- Payment status updated asynchronously
- Ensures no successful payments are lost
- Idempotent webhook processing

## Payment Flow Diagram

```
┌─────────────┐
│   Frontend  │
└──────┬──────┘
       │
       │ 1. Create Order
       ▼
┌─────────────────┐
│  POST /create-  │
│  order          │
└──────┬──────────┘
       │
       │ 2. Order Created
       ▼
┌─────────────────┐
│  Razorpay Modal │
│  Opens          │
└──────┬──────────┘
       │
       │ 3. User Pays
       ▼
┌─────────────────┐
│  Razorpay       │
│  Processes      │
└──────┬──────────┘
       │
       ├─────────────────┐
       │                 │
       │ Success         │ Failure/Cancel
       ▼                 ▼
┌─────────────┐   ┌─────────────┐
│  handler()  │   │ ondismiss() │
└──────┬──────┘   └──────┬──────┘
       │                 │
       │ 4. Verify       │ Show Error
       ▼                 │
┌─────────────────┐      │
│  POST /verify-  │      │
│  and-submit     │      │
└──────┬──────────┘      │
       │                 │
       │ 5. Verify:      │
       │ - Signature     │
       │ - Status        │
       │ - Order ID      │
       │ - Amount        │
       ▼                 │
┌─────────────────┐      │
│  All Valid?     │      │
└──────┬──────────┘      │
       │                 │
   Yes │            No   │
       ▼                 ▼
┌─────────────┐   ┌─────────────┐
│  Submit     │   │  Reject &   │
│  Team       │   │  Log Failed │
└─────────────┘   └─────────────┘
```

## Transaction Logging

All payment attempts are logged in the Transaction model:

**Successful Payment**:
```javascript
{
  source: 'coach',
  type: 'team_submission',
  amount: 600,
  paymentStatus: 'completed',
  metadata: {
    razorpay_order_id: 'order_xxx',
    razorpay_payment_id: 'pay_xxx',
    razorpay_signature: 'xxx',
    razorpay_status: 'captured',
    payment_method: 'upi',
    verified: true
  }
}
```

**Failed Payment**:
```javascript
{
  source: 'coach',
  type: 'team_submission',
  amount: 600,
  paymentStatus: 'failed',
  metadata: {
    razorpay_order_id: 'order_xxx',
    razorpay_payment_id: 'pay_xxx',
    razorpay_status: 'failed',
    error_code: 'BAD_REQUEST_ERROR',
    error_description: 'Payment failed',
    failedAt: '2026-05-08T16:00:00.000Z'
  }
}
```

## Testing Checklist

- [ ] Successful payment with UPI
- [ ] Successful payment with Card
- [ ] Successful payment with Net Banking
- [ ] Payment cancellation by user
- [ ] Payment timeout
- [ ] Insufficient funds
- [ ] Invalid card details
- [ ] Network failure during payment
- [ ] Network failure during verification
- [ ] Duplicate submission attempt
- [ ] Signature tampering attempt
- [ ] Amount tampering attempt
- [ ] Webhook reconciliation
- [ ] Already submitted team

## Monitoring & Alerts

**Key Metrics to Monitor**:
1. Payment success rate
2. Signature verification failures (potential attacks)
3. Amount mismatch incidents (potential fraud)
4. Payment timeouts
5. Webhook delivery failures

**Alert Triggers**:
- Multiple signature verification failures from same IP
- Amount mismatch detected
- High payment failure rate
- Webhook delivery failures

## Support Scenarios

### User Reports: "Payment deducted but team not submitted"
**Investigation Steps**:
1. Check Transaction collection for payment ID
2. Check Razorpay dashboard for payment status
3. If payment captured but team not submitted:
   - Manually trigger webhook reconciliation
   - Or manually update team submission status
4. If payment failed/refunded:
   - Inform user to retry
   - Verify refund processed

### User Reports: "Payment failed but money deducted"
**Investigation Steps**:
1. Check Razorpay dashboard for payment status
2. If status is `failed` or `cancelled`:
   - Razorpay auto-refunds within 5-7 business days
   - Provide transaction ID for bank reference
3. If status is `captured`:
   - Check why team submission failed
   - Manually complete submission if payment valid

## Security Best Practices

1. ✅ **Never trust frontend data** - Always verify server-side
2. ✅ **Use timing-safe comparisons** - Prevents timing attacks
3. ✅ **Verify payment status via API** - Don't rely on frontend status
4. ✅ **Log all payment attempts** - Audit trail for disputes
5. ✅ **Implement idempotency** - Prevent duplicate charges
6. ✅ **Use webhooks as backup** - Catch missed payments
7. ✅ **Validate amounts server-side** - Prevent price manipulation
8. ✅ **Rate limit payment endpoints** - Prevent abuse
9. ✅ **Monitor for anomalies** - Detect fraud attempts
10. ✅ **Keep secrets secure** - Never expose in logs/errors

## Configuration

**Required Environment Variables**:
```env
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
```

**Webhook Configuration**:
- URL: `https://your-domain.com/api/webhooks/razorpay`
- Events: `payment.captured`, `payment.failed`
- Secret: Same as `RAZORPAY_KEY_SECRET`

## References

- [Razorpay Payment Verification](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/verify-payment/)
- [Razorpay Webhooks](https://razorpay.com/docs/webhooks/)
- [Razorpay Payment Status](https://razorpay.com/docs/api/payments/#payment-status)
