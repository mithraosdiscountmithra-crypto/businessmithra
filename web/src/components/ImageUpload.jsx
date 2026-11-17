import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

let configPromise = null;
const getConfig = () => (configPromise ||= api('/shop-admin/upload-config').catch(() => ({ enabled: false })));

// Uploads a photo to Cloudinary (signed by our server). Falls back to pasting an image link.
export async function uploadImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo');
  if (file.size > 8 * 1024 * 1024) throw new Error('Photo is too big (max 8 MB)');
  const sig = await api('/shop-admin/upload-sign', { method: 'POST' });
  const fd = new FormData();
  fd.append('file', file);
  fd.append('api_key', sig.apiKey);
  fd.append('timestamp', sig.timestamp);
  fd.append('folder', sig.folder);
  fd.append('signature', sig.signature);
  const res = await fetch(sig.url, { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Upload failed');
  // Smaller, faster version for the shop.
  return data.secure_url.replace('/upload/', '/upload/f_auto,q_auto,w_1000/');
}

export default function ImageUpload({ images, onChange, max = 4, label = 'Photos' }) {
  const [enabled, setEnabled] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [link, setLink] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    getConfig().then((c) => setEnabled(c.enabled));
  }, []);

  const onFiles = async (files) => {
    setErr('');
    setBusy(true);
    try {
      const out = [...images];
      for (const f of [...files].slice(0, max - images.length)) out.push(await uploadImage(f));
      onChange(out);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addLink = () => {
    const v = link.trim();
    if (!/^https:\/\//.test(v)) return setErr('Image link must start with https://');
    setErr('');
    onChange([...images, v].slice(0, max));
    setLink('');
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="label mb-0">{label}</span>
      <div className="flex flex-wrap gap-2">
        {images.map((src, i) => (
          <div key={src + i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-line bg-gray-50">
            <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
            <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(images.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white text-sm font-bold">×</button>
          </div>
        ))}
        {images.length < max && enabled && (
          <label className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-xs font-semibold text-muted cursor-pointer hover:border-brand">
            {busy ? 'Uploading…' : <><span className="text-2xl leading-none">+</span>Add photo</>}
            <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" disabled={busy} onChange={(e) => onFiles(e.target.files)} />
          </label>
        )}
      </div>
      {images.length < max && enabled === false && (
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="img-link">Image link</label>
          <input id="img-link" className="input" placeholder="Paste image link (https://…)" value={link} onChange={(e) => setLink(e.target.value)} />
          <button type="button" className="btn-ghost shrink-0" onClick={addLink}>Add</button>
        </div>
      )}
      {enabled === false && <p className="text-xs text-muted">Direct photo upload ki Cloudinary setup cheyyali (Settings lo steps). Appati varaku image link paste cheyyochu.</p>}
      {err && <p className="text-xs font-semibold text-red-700">{err}</p>}
    </div>
  );
}
