import { useEffect, useState } from 'react';
import { t } from '../services/i18n';
import { isNativeApp } from '../services/platform';

// Install pop-up. Android and desktop Chrome/Edge: our dialog starts the browser's install prompt.
// iPhone and iPad: the dialog shows the Share, Add to Home Screen steps. Hidden in the native app
// and once installed. "Ne sad" hides it for 14 days.

type InstallPromptEvent = Event & { prompt: () => Promise<void> };

const dismissedKey = 'transit-install-dismissed';
const dismissDays = 14;
const openEvent = 'transit-open-install';
const availableEvent = 'transit-install-available';
let deferredPrompt: InstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    window.dispatchEvent(new Event(availableEvent));
  });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; });
}

export function openInstallPrompt() {
  window.dispatchEvent(new Event(openEvent));
}

export function installPromptUnavailable() {
  return isNativeApp() || window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function recentlyDismissed() {
  const at = Number(localStorage.getItem(dismissedKey));
  return Number.isFinite(at) && Date.now() - at < dismissDays * 86400_000;
}

export default function InstallAppPrompt() {
  const unavailable = installPromptUnavailable();
  const [open, setOpen] = useState(false);
  const [canInstall, setCanInstall] = useState(Boolean(deferredPrompt));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (unavailable) return;
    const onAvailable = () => setCanInstall(true);
    const onOpen = () => setOpen(true);
    window.addEventListener(availableEvent, onAvailable);
    window.addEventListener(openEvent, onOpen);
    // Open once on its own, a few seconds after the page loads, if it can be installed here and was not dismissed recently.
    const autoOpen = window.setTimeout(() => {
      if (!recentlyDismissed() && (deferredPrompt || isIos())) setOpen(true);
    }, 8000);
    return () => {
      window.removeEventListener(availableEvent, onAvailable);
      window.removeEventListener(openEvent, onOpen);
      window.clearTimeout(autoOpen);
    };
  }, [unavailable]);

  if (unavailable || !open) return null;

  function dismiss() {
    localStorage.setItem(dismissedKey, String(Date.now()));
    setOpen(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    setBusy(true);
    try {
      await deferredPrompt.prompt();
    } finally {
      deferredPrompt = null;
      setCanInstall(false);
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="install-app-title"
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-slate-900 shadow-xl">
        <h2 id="install-app-title" className="text-lg font-bold">{t("Instaliraj Transitly")}</h2>
        <p className="mt-2 text-sm text-slate-700">
          {isIos()
            ? t("Na iPhoneu: dodirni Podijeli, pa Dodaj na početni zaslon.")
            : t("Dodaj Transitly na početni zaslon za brži pristup i obavijesti o polascima.")}
        </p>
        <div className="mt-4 flex gap-2">
          {canInstall && (
            <button type="button" disabled={busy} onClick={() => void install()}
              className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {t("Instaliraj")}
            </button>
          )}
          <button type="button" onClick={dismiss}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800">
            {t("Ne sad")}
          </button>
        </div>
      </div>
    </div>
  );
}
