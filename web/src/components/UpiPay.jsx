import { useState } from 'react';

// Shows one button per UPI app so the phone doesn't jump to a default app (e.g. WhatsApp Pay).
const APPS = [
  { id: 'gpay', name: 'GPay', android: 'com.google.android.apps.nbu.paisa.user', ios: 'gpay://upi/pay', bg: '#1A73E8' },
  { id: 'phonepe', name: 'PhonePe', android: 'com.phonepe.app', ios: 'phonepe://pay', bg: '#5F259F' },
  { id: 'paytm', name: 'Paytm', android: 'net.one97.paytm', ios: 'paytmmp://pay', bg: '#00BAF2' },
  { id: 'bhim', name: 'BHIM', android: 'in.org.npci.upiapp', ios: 'bhim://upi/pay', bg: '#00796B' },
];

const platform = () => {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'desktop';
};

export default function UpiPay({ upiLink, upiId, amountLabel, color = '#3730A3' }) {
  const [copied, setCopied] = useState(false);
  const os = platform();
  const query = upiLink.split('?')[1] || '';

  const hrefFor = (app) => {
    if (os === 'android') return `intent://pay?${query}#Intent;scheme=upi;package=${app.android};end`;
    return `${app.ios}?${query}`;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-200 p-5 flex flex-col gap-3">
      <p className="font-bold text-center">Pay {amountLabel} by UPI</p>
      {os !== 'desktop' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {APPS.map((a) => (
              <a key={a.id} href={hrefFor(a)} className="h-12 rounded-xl text-white font-bold flex items-center justify-center" style={{ background: a.bg }}>
                {a.name}
              </a>
            ))}
          </div>
          <a href={upiLink} className="h-11 rounded-xl border-2 font-bold flex items-center justify-center text-sm" style={{ borderColor: color, color }}>Other UPI app</a>
        </>
      )}
      <details className="text-center" open={os === 'desktop'}>
        <summary className="text-sm font-semibold cursor-pointer" style={{ color }}>Scan QR (vere phone tho pay cheyyadaniki)</summary>
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(upiLink)}`}
          alt="UPI QR code"
          width="200"
          height="200"
          className="mx-auto mt-2 rounded-xl border border-gray-200"
        />
      </details>
      <div className="flex items-center justify-center gap-2 text-xs text-gray-600">
        <span>UPI ID: <strong>{upiId}</strong></span>
        <button type="button" onClick={copy} className="underline font-semibold min-h-[32px]">{copied ? 'Copied ✓' : 'Copy'}</button>
      </div>
      <p className="text-xs text-center text-gray-500">Pay chesaka screenshot shop ki WhatsApp lo pampandi.</p>
    </div>
  );
}
