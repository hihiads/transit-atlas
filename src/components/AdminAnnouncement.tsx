import { useEffect, useState } from 'react';
import { t } from '../services/i18n';
import { Announcement, AnnouncementBanner } from './SiteAnnouncement';

interface Props { request<T>(path: string, options?: RequestInit): Promise<T> }
interface AnnouncementResponse { announcement: Announcement | null }

function asLocalInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function AdminAnnouncement({ request }: Props) {
  const [text, setText] = useState('');
  const [level, setLevel] = useState<Announcement['level']>('info');
  const [expires, setExpires] = useState('');
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function showError(reason: unknown) {
    setError(reason instanceof Error ? reason.message : t("Najavu nije moguće spremiti."));
  }

  useEffect(() => {
    const controller = new AbortController();
    request<AnnouncementResponse>('/announcement', { signal: controller.signal }).then(({ announcement }) => {
      if (controller.signal.aborted || !announcement) return;
      setActive(true);
      setText(announcement.text);
      setLevel(announcement.level);
      setExpires(announcement.expiresAt ? asLocalInput(announcement.expiresAt) : '');
    }).catch(reason => { if (!controller.signal.aborted) showError(reason); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [request]);

  async function save(publish: boolean) {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      if (publish) {
        const expiresAt = expires ? new Date(expires).toISOString() : null;
        await request('/announcement', { method: 'PUT', body: JSON.stringify({ text, level, expiresAt }) });
        setActive(true);
        setMessage(t("Najava je objavljena."));
      } else {
        await request('/announcement', { method: 'DELETE' });
        setActive(false);
        setMessage(t("Najava je povučena."));
      }
    } catch (reason) {
      showError(reason);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">{t("Najava na početnoj stranici")}</h2><p className="mt-1 text-sm text-slate-600">{t("Posjetitelji vide jednu najavu iznad karte.")}</p></div>
        <span className={active ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-900" : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"}>{active ? t("Objavljeno") : t("Skriveno")}</span>
      </div>
      <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); void save(true); }}>
        <label className="block text-sm font-medium">{t("Poruka")}
          <textarea value={text} onChange={event => setText(event.target.value)} rows={3} maxLength={280} required disabled={busy} className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">{t("Vrsta najave")}
            <select value={level} onChange={event => setLevel(event.target.value as Announcement["level"])} disabled={busy} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="info">{t("Informacija")}</option><option value="warning">{t("Upozorenje")}</option>
            </select>
          </label>
          <label className="block min-w-0 text-sm font-medium">{t("Istječe (neobavezno)")}
            <input type="datetime-local" value={expires} onChange={event => setExpires(event.target.value)} disabled={busy} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
        </div>
        {text.trim() && <div className="overflow-hidden rounded-lg border border-slate-200"><AnnouncementBanner text={text.trim()} level={level} /></div>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy || !text.trim()} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{active ? t("Ažuriraj najavu") : t("Objavi najavu")}</button>
          {active && <button type="button" onClick={() => void save(false)} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">{t("Povuci najavu")}</button>}
        </div>
        {message && <p className="text-sm text-emerald-800" role="status">{message}</p>}
        {error && <p className="text-sm text-red-800" role="alert">{error}</p>}
      </form>
    </section>
  );
}
