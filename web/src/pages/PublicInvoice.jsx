import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import InvoicePaper from '../components/InvoicePaper.jsx';

// Page the customer opens from the WhatsApp link. No login needed.
export default function PublicInvoice() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api(`/public/invoice/${token}`).then(setData).catch((e) => setErr(e.message));
  }, [token]);

  return (
    <div className="min-h-screen bg-ground py-6 px-3 sm:px-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-4">
        {err && <div className="error-box">{err}</div>}
        {!data && !err && <p className="text-muted text-center">Loading invoice…</p>}
        {data && (
          <>
            <div className="flex justify-end print:hidden">
              <button type="button" className="btn-primary" onClick={() => window.print()}>Download / Print</button>
            </div>
            <InvoicePaper doc={data.invoice} business={data.business} kind="invoice" />
            {data.invoice.status === 'cancelled' && <p className="error-box">This invoice has been cancelled.</p>}
          </>
        )}
        <p className="text-center text-xs text-muted print:hidden">Made with BusinessMithra</p>
      </div>
    </div>
  );
}
