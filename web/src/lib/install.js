// "Install app" support: Android/Chrome gives a prompt; iPhone needs Share → Add to Home Screen.
import { useEffect, useState } from 'react';

let deferred = null;
const subs = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    subs.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    subs.forEach((f) => f());
  });
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    return () => subs.delete(f);
  }, []);
  if (standalone()) return { can: false };
  if (deferred) return { can: true, install: async () => { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; force((n) => n + 1); } };
  if (isIos()) return { can: true, ios: true };
  return { can: false };
}

export function InstallButton({ className = '', label = '📲 Install app' }) {
  const app = useInstall();
  const [tip, setTip] = useState(false);
  if (!app.can) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => (app.ios ? setTip((t) => !t) : app.install())}>{label}</button>
      {tip && <p className="text-xs bg-white text-ink rounded-lg p-2 mt-1 shadow">iPhone: Safari lo <b>Share ⬆️</b> nokki <b>"Add to Home Screen"</b> select cheyyandi.</p>}
    </>
  );
}
