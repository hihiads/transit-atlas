import { t } from '../services/i18n';
import { useState } from 'react';

const key = 'transitly-cookie-notice-v1';

function hasSeenNotice() {
  try { return localStorage.getItem(key) === 'seen'; } catch { return false; }
}

export default function CookieNotice() {
  const [visible, setVisible] = useState(() => !hasSeenNotice());
  if (!visible) return null;
  function close() {
    try { localStorage.setItem(key, 'seen'); } catch { /* The notice remains dismissible for this page view. */ }
    setVisible(false);
  }
  return <aside className="fixed bottom-3 left-3 right-3 z-[1500] mx-auto max-w-3xl rounded-2xl border border-slate-300 bg-white p-4 text-slate-900 shadow-xl" aria-label={t("Obavijest o kolačićima")}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm leading-5">{t("Transitlyjeva aplikacija koristi nužne kolačiće za prijavu i lokalnu pohranu za postavke. Ne ugrađujemo oglašivačke ni analitičke alate; vanjski servisi mogu imati vlastite tehnologije.") + " "}<a href="/cookies" className="font-semibold text-blue-800 underline">{t("Saznajte više")}</a>.</p>
      <button type="button" onClick={close} className="shrink-0 rounded-lg bg-[#102638] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">{t("U redu")}</button>
    </div>
  </aside>;
}
