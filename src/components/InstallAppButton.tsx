import { useEffect, useState } from 'react';
import { t } from '../services/i18n';
import { isNativeApp } from '../services/platform';

// "Install app" for the browser: Android and desktop Chrome/Edge give a prompt; iPhone and iPad
// need the Share sheet, so the button shows how to add it to the Home Screen.
type InstallPromptEvent = Event & { prompt: () => Promise<void> };

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isNativeApp() || installed || isStandalone()) return null;

  async function install() {
    if (prompt) {
      await prompt.prompt();
      setPrompt(null);
      return;
    }
    setShowHelp(open => !open);
  }

  return (
    <div className="mb-2">
      <button type="button" onClick={() => void install()}
        className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm">
        {t("Instaliraj aplikaciju")}
      </button>
      {showHelp && <p role="status" className="mt-2 rounded-xl bg-white p-3 text-sm text-slate-700">
        {isIos()
          ? t("Na iPhoneu: dodirni Podijeli, pa Dodaj na početni zaslon.")
          : t("U izborniku preglednika odaberi Instaliraj aplikaciju ili Dodaj na početni zaslon.")}
      </p>}
    </div>
  );
}
