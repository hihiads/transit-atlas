import { useEffect, useState, type FormEvent } from 'react';
import { API_ROOT } from '../services/platform';
import { locale, t } from '../services/i18n';

const stateLabels: Record<string, string> = {
  available: 'Dostupno', unavailable: 'Nedostupno', degraded: 'Djelomično dostupno',
  maintenance: 'Privremeno pauzirano', unknown: 'Još nije provjereno'
};
const names: Record<string, string> = { zetLive: 'ZET karta uživo', zetTimetable: 'ZET vozni red', hzppSearch: 'HŽPP pretraga' };
export interface TransitStatus {
  message: string;
  services: Record<string, { state: string; updatedAt: number | string | null }>;
}

export function formatZagreb(value: number | string | null) {
  return value ? new Date(value).toLocaleString(locale, { timeZone: 'Europe/Zagreb', dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export function TransitStatusList({ status }: { status: TransitStatus }) {
  return <dl className="divide-y divide-slate-200">
    {Object.entries(names).map(([id, name]) => {
      const entry = status.services[id];
      return <div key={id} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <dt className="font-semibold">{t(name)}</dt>
        <dd className="text-right text-sm">{t(stateLabels[entry?.state] || stateLabels.unknown)}
          {entry?.updatedAt && <span className="ml-2 text-xs text-slate-600">{formatZagreb(entry.updatedAt)}</span>}
        </dd>
      </div>;
    })}
  </dl>;
}

export const feedbackCategories: Record<string, string> = { map: 'Karta', search: 'Pretraga', data: 'Podaci', other: 'Drugo' };

export default function TransitHelp({ feedback }: { feedback: boolean }) {
  const [status, setStatus] = useState<TransitStatus>();
  const [category, setCategory] = useState('map');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const area = new URLSearchParams(location.search).get('area') === 'hzpp' ? 'hzpp' : 'zet';
  const title = feedback ? t("Prijavi grešku") : t("Stanje usluga");

  useEffect(() => {
    document.title = `${title} – Transitly`;
    if (feedback) return;
    async function refresh() {
      try {
        const response = await fetch(API_ROOT + '/transit-status', { cache: 'no-store' });
        if (!response.ok) throw new Error();
        setStatus(await response.json());
        setMessage('');
      } catch {
        setMessage(t("Stanje usluga trenutačno nije dostupno."));
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, [feedback, title]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(API_ROOT + '/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area, category, text })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(t(result.error || "Zahtjev nije uspio."));
      setText('');
      setMessage(t("Prijava je zaprimljena."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Zahtjev nije uspio."));
    } finally { setBusy(false); }
  }

  return <main className="h-full overflow-y-auto bg-slate-50 p-4 text-slate-900 sm:p-8">
    <article className="mx-auto max-w-xl rounded-2xl bg-white p-5 shadow-sm sm:p-8">
      <a href={area === 'hzpp' ? '/hzpp/' : '/'} className="text-sm font-semibold text-blue-800 underline">{t("← Natrag na Transitly")}</a>
      <h1 className="my-4 text-2xl font-bold">{title}</h1>
      {feedback ? <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium">{t("Vrsta problema")}
          <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2" value={category} onChange={event => setCategory(event.target.value)}>
            {Object.entries(feedbackCategories).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">{t("Opis problema")}
          <textarea className="mt-1 block w-full rounded-lg border border-slate-300 p-2" rows={5} value={text} minLength={10} maxLength={600} required onChange={event => setText(event.target.value)} />
        </label>
        <p className="text-sm text-slate-600">{t("Nemoj unositi osobne podatke. Prijava se briše nakon 30 dana.")}</p>
        <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || text.trim().length < 10}>{t("Pošalji prijavu")}</button>
      </form> : status ? <>
        {status.message && <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-950">{status.message}</p>}
        <TransitStatusList status={status} />
      </> : !message && <p>{t("Učitavanje…")}</p>}
      {message && <p role="status" className="mt-3 text-sm text-slate-700">{message}</p>}
    </article>
  </main>;
}
