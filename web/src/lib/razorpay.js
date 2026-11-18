// Opens Razorpay Checkout (UPI / card / netbanking). Resolves with the payment ids, rejects if closed.
let loading;
const load = () => {
  if (window.Razorpay) return Promise.resolve();
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => { loading = null; reject(new Error('Payment page open avvaledu. Internet check chesi malli try cheyyandi.')); };
    document.body.appendChild(s);
  });
  return loading;
};

export async function payWithRazorpay(pay) {
  await load();
  return new Promise((resolve, reject) => {
    const rz = new window.Razorpay({
      key: pay.keyId,
      order_id: pay.orderId,
      amount: pay.amount,
      currency: 'INR',
      name: pay.name,
      description: pay.description,
      image: pay.image,
      prefill: pay.prefill,
      theme: { color: pay.color || '#3730A3' },
      // Show UPI first (GPay / PhonePe / Paytm / QR in live mode), then the rest.
      config: {
        display: {
          blocks: { upi: { name: 'Pay with UPI', instruments: [{ method: 'upi' }] } },
          sequence: ['block.upi'],
          preferences: { show_default_blocks: true },
        },
      },
      handler: (r) => resolve(r),
      modal: { ondismiss: () => reject(Object.assign(new Error('Payment cancel chesaru'), { dismissed: true })), confirm_close: true },
    });
    rz.on('payment.failed', (r) => reject(new Error(r?.error?.description || 'Payment fail ayyindi')));
    rz.open();
  });
}
