import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { t } from '../services/i18n';
import { AnnouncementBanner, bulletinKinds, type Bulletin } from './SiteAnnouncement';
import { feedbackCategories, formatZagreb } from './TransitHelp';

export type AdminRequest = <T>(path: string, options?: RequestInit) => Promise<T>;
const input = 'mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50';
const primary = 'rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50';

function edit(method: string, value?: unknown): RequestInit {
  return { method, ...(value === undefined ? {} : { body: JSON.stringify(value) }) };
}

export function AdminSection({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return <details open={open} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <summary className="cursor-pointer rounded text-base font-semibold">{t(title)}</summary>
    <div className="mt-4 space-y-3">{children}</div>
  </details>;
}

function Result({ message }: { message: string }) {
  return message ? <p className="text-sm text-slate-700" role="status">{message}</p> : null;
}

function usePanel<T>(request: AdminRequest, path: string, initial: T) {
  const [data, setData] = useState(initial);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    request<T>(path, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setData(value);
    }).catch(error => {
      if (!controller.signal.aborted) setMessage(error.message);
    }).finally(() => {
      if (!controller.signal.aborted) setBusy(false);
    });
    return () => controller.abort();
  }, [path, request]);

  async function act(run?: () => Promise<unknown>, refresh = true) {
    setBusy(true);
    setMessage('');
    try {
      await run?.();
      if (refresh) setData(await request<T>(path));
      if (run) setMessage(t("Promjena je spremljena."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Zahtjev nije uspio."));
    } finally { setBusy(false); }
  }
  return { data, setData, message, busy, act };
}

export function DashboardControls({ request, onSave }: { request: AdminRequest; onSave: () => void }) {
  const path = '/dashboard/controls';
  const empty = { hideLiveVehicles: false, pauseReports: false, statusMessage: '' };
  const panel = usePanel<typeof empty | null>(request, path, null);
  const draft = panel.data ?? empty;
  return <AdminSection title="Održavanje i status">
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault();
      void panel.act(async () => { await request(path, edit('PUT', draft)); onSave(); });
    }}>
      <fieldset disabled={panel.busy || !panel.data} className="space-y-3 disabled:opacity-60">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={draft.hideLiveVehicles} onChange={event => panel.setData({ ...draft, hideLiveVehicles: event.target.checked })} />
          <span>{t("Sakrij ZET lokacije vozila")}<span className="block text-xs text-slate-600">{t("Vozni redovi i stajališta ostaju dostupni.")}</span></span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.pauseReports} onChange={event => panel.setData({ ...draft, pauseReports: event.target.checked })} />
          {t("Pauziraj automatsku objavu dojava")}
        </label>
        <label className="block text-sm">{t("Poruka na javnom statusu")}
          <textarea maxLength={220} rows={2} className={input} value={draft.statusMessage} onChange={event => panel.setData({ ...draft, statusMessage: event.target.value })} />
        </label>
        <button className={primary}>{t("Spremi promjene")}</button>
      </fieldset>
    </form>
    <Result message={panel.message} />
  </AdminSection>;
}

const emptyBulletin = { kind: 'announcement', audience: 'all', level: 'warning', line: '', text: '', textEn: '', startsAt: '', expiresAt: '' } as const;

export function DashboardBulletins({ request }: { request: AdminRequest }) {
  const path = '/dashboard/bulletins';
  const panel = usePanel<Bulletin[]>(request, path, []);
  const [draft, setDraft] = useState<Record<keyof typeof emptyBulletin, string>>({ ...emptyBulletin });
  const [previewLanguage, setPreviewLanguage] = useState('hr');
  const [previewSize, setPreviewSize] = useState('mobile');
  const schedule = draft.kind === 'announcement';

  function update(key: keyof typeof emptyBulletin, value: string) {
    setDraft(current => ({ ...current, [key]: value }));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void panel.act(async () => {
      await request(path, edit('POST', { ...draft, audience: schedule ? draft.audience : 'zet',
        startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : new Date().toISOString(),
        expiresAt: new Date(draft.expiresAt).toISOString()
      }));
      setDraft({ ...emptyBulletin });
    });
  }
  const englishKind: Record<string, string> = { detour: 'Detour', stop: 'Skipped stop', replacement: 'Replacement bus' };
  const kindLabel = previewLanguage === 'en' ? englishKind[draft.kind] : bulletinKinds[draft.kind as keyof typeof bulletinKinds];
  const prefix = draft.line && !schedule ? `${previewLanguage === 'en' ? 'Route' : 'Linija'} ${draft.line} · ${kindLabel} · ` : '';
  return <AdminSection title="Zakazane objave i prometne izmjene" open>
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">{t("Vrsta objave")}
          <select className={input} value={draft.kind} onChange={event => update('kind', event.target.value)}>
            {Object.entries(bulletinKinds).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
          </select>
        </label>
        {schedule ? <label className="text-sm">{t("Prikaži na")}
          <select className={input} value={draft.audience} onChange={event => update('audience', event.target.value)}>
            <option value="all">{t("ZET i HŽPP")}</option><option value="zet">ZET</option><option value="hzpp">HŽPP</option>
          </select>
        </label> : <label className="text-sm">{t("ZET linija")}
          <input className={input} maxLength={16} pattern="[A-Za-z0-9\-]+" required value={draft.line} onChange={event => update('line', event.target.value.trim())} />
        </label>}
        <label className="text-sm">{t("Vrsta najave")}
          <select className={input} value={draft.level} onChange={event => update('level', event.target.value)}>
            <option value="info">{t("Informacija")}</option><option value="warning">{t("Upozorenje")}</option>
          </select>
        </label>
        <label className="min-w-0 text-sm">{t("Početak (prazno za odmah)")}
          <input type="datetime-local" className={input} value={draft.startsAt} onChange={event => update('startsAt', event.target.value)} />
        </label>
        <label className="min-w-0 text-sm">{t("Istek")}
          <input type="datetime-local" className={input} required value={draft.expiresAt} onChange={event => update('expiresAt', event.target.value)} />
        </label>
      </div>
      <p className="text-xs text-slate-600">{t("Vrijeme unesi prema vremenskoj zoni uređaja.")}</p>
      <label className="block text-sm">{t("Poruka na hrvatskom")}
        <textarea className={input} rows={2} required maxLength={280} value={draft.text} onChange={event => update('text', event.target.value)} />
      </label>
      <label className="block text-sm">{t("Poruka na engleskom (neobavezno)")}
        <textarea className={input} rows={2} maxLength={280} value={draft.textEn} onChange={event => update('textEn', event.target.value)} />
      </label>
      {draft.text.trim() && <div className="space-y-2">
        <div className="flex flex-wrap gap-3 text-sm">
          <label>{t("Jezik pregleda")} <select className="rounded border p-1" value={previewLanguage} onChange={event => setPreviewLanguage(event.target.value)}><option value="hr">Hrvatski</option><option value="en">English</option></select></label>
          <label>{t("Veličina prikaza")} <select className="rounded border p-1" value={previewSize} onChange={event => setPreviewSize(event.target.value)}><option value="mobile">{t("Mobitel")}</option><option value="desktop">{t("Računalo")}</option></select></label>
        </div>
        <div className={previewSize === 'mobile' ? 'max-w-[360px] overflow-hidden rounded-lg border' : 'overflow-hidden rounded-lg border'}>
          <AnnouncementBanner text={prefix + (previewLanguage === 'en' && draft.textEn ? draft.textEn : draft.text)} level={draft.level === 'info' ? 'info' : 'warning'} />
        </div>
      </div>}
      <button className={primary} disabled={panel.busy}>{t("Spremi objavu")}</button>
    </form>
    <ul className="divide-y divide-slate-200">
      {panel.data.map(entry => <li key={entry._id} className="flex items-start justify-between gap-3 py-3 text-sm">
        <div className="min-w-0"><span className="font-semibold">{t(bulletinKinds[entry.kind])} · {entry.line || entry.audience.toUpperCase()}</span>
          <p className="break-words">{entry.text}</p><small>{formatZagreb(entry.startsAt)} – {formatZagreb(entry.expiresAt)}</small>
        </div>
        <button className={button} disabled={panel.busy} onClick={() => void panel.act(() => request(path + '/' + entry._id, edit('DELETE')))}>{t("Povuci")}</button>
      </li>)}
    </ul>
    <Result message={panel.message} />
  </AdminSection>;
}

interface RareVehicle {
  _id: string;
  type: 'bus' | 'tram';
  model: string;
  garageNumber: string;
  source: string;
  sighting: { line: string; seenAt: string } | null;
  rare: boolean;
  previous?: unknown;
}

export function DashboardRareVehicles({ request }: { request: AdminRequest }) {
  const path = '/dashboard/rare-vehicles';
  const panel = usePanel<RareVehicle[]>(request, path, []);
  const [draft, setDraft] = useState({ id: '', type: 'tram', model: '', garageNumber: '', source: '', rare: true });
  const [today, setToday] = useState(false);
  return <AdminSection title="Rijetka vozila i ispravci">
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => {
      event.preventDefault();
      void panel.act(() => request(path + '/' + encodeURIComponent(draft.id), edit('PUT', draft)));
    }}>
      <label className="text-sm">ZET ID<input className={input} inputMode="numeric" pattern="[0-9]{1,8}" required value={draft.id} onChange={event => setDraft({ ...draft, id: event.target.value })} /></label>
      <label className="text-sm">{t("Vrsta vozila")}<select className={input} value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value })}>
        <option value="tram">{t("Tramvaj")}</option><option value="bus">{t("Autobus")}</option>
      </select></label>
      <label className="text-sm">{t("Model")}<input className={input} maxLength={80} required value={draft.model} onChange={event => setDraft({ ...draft, model: event.target.value })} /></label>
      <label className="text-sm">{t("Garažni broj (neobavezno)")}<input className={input} maxLength={16} value={draft.garageNumber} onChange={event => setDraft({ ...draft, garageNumber: event.target.value })} /></label>
      <label className="text-sm sm:col-span-2">{t("HTTPS poveznica na izvor")}<input className={input} type="url" maxLength={400} required value={draft.source} onChange={event => setDraft({ ...draft, source: event.target.value })} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.rare} onChange={event => setDraft({ ...draft, rare: event.target.checked })} />{t("Označi kao rijetko vozilo")}</label>
      <button className={primary} disabled={panel.busy}>{t("Spremi vozilo")}</button>
    </form>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={today} onChange={event => setToday(event.target.checked)} />{t("Samo danas zabilježena")}</label>
      <button className={button} disabled={panel.busy} onClick={() => void panel.act()}>{t("Osvježi")}</button>
    </div>
    <ul className="divide-y divide-slate-200">{panel.data.filter(row => !today || (row.rare && row.sighting)).map(row => <li key={row._id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
      <div><p className="font-semibold">{row._id} · {row.model}</p>
        <p>{!row.rare ? t("Ispravak podataka") : row.sighting ? `${t("Linija")} ${row.sighting.line} · ${formatZagreb(row.sighting.seenAt)}` : t("Danas nije zabilježeno")}</p></div>
      <div className="flex gap-2">
        <button className={button} onClick={() => setDraft({ id: row._id, type: row.type, model: row.model, garageNumber: row.garageNumber, source: row.source, rare: row.rare })}>{t("Uredi")}</button>
        {row.previous != null && <button className={button} disabled={panel.busy} onClick={() => void panel.act(() => request(path + '/' + row._id + '/restore', edit('POST')))}>{t("Vrati prethodne podatke")}</button>}
        <button className={button} disabled={panel.busy} onClick={() => void panel.act(() => request(path + '/' + row._id, edit('DELETE')))}>{t("Ukloni")}</button>
      </div>
    </li>)}</ul>
    <Result message={panel.message} />
  </AdminSection>;
}

interface Report { id: string; vehicleId?: string; line: string; type: string; reason: string; count: number; state: string }
interface Feedback { _id: string; category: string; area: string; text: string; state: string; createdAt: string }

export function DashboardReports({ request }: { request: AdminRequest }) {
  const path = '/dashboard/reports';
  const panel = usePanel<Report[]>(request, path, []);
  const [email, setEmail] = useState('');
  const [days, setDays] = useState(7);
  const [restriction, setRestriction] = useState('');
  return <>
    <AdminSection title="Moderiranje dojava putnika" open>
      <button className={button} disabled={panel.busy} onClick={() => void panel.act()}>{t("Osvježi")}</button>
      {!panel.busy && !panel.data.length && <p className="text-sm">{t("Trenutačno nema dojava.")}</p>}
      <ul className="divide-y divide-slate-200">{panel.data.map(row => {
        const label = row.state === 'resolved' ? t("Riješeno") : row.state === 'hidden' ? t("Skriveno") : row.count >= 3 ? t("Objavljeno") : t("Čeka još dojava");
        return <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
          <div><p className="font-semibold">{t("Linija")} {row.line} · {row.type === 'bus' ? t("Autobus") : t("Tramvaj")} {row.vehicleId ?? ''}</p>
            <p>{row.reason === 'delay' ? t("Kašnjenje") : t("Kvar vozila")} · {row.count} · {label}</p></div>
          <div className="flex flex-wrap gap-1">
            {(row.state === 'visible' ? [['hidden', 'Sakrij'], ['resolved', 'Riješeno']] : [['visible', 'Vrati prikaz']]).map(([state, name]) =>
              <button key={state} className={button} disabled={panel.busy} onClick={() => void panel.act(() => request(path, edit('PATCH', { id: row.id, state })))}>{t(name)}</button>
            )}
          </div>
        </li>;
      })}</ul>
      <Result message={panel.message} />
    </AdminSection>
    <AdminSection title="Ograničenje dojava za račun">
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        setRestriction('');
        void panel.act(async () => {
          const result = await request<{ until: string | null }>('/dashboard/report-restriction', edit('PUT', { email, days }));
          setRestriction(result.until ? t("Dojave blokirane do {0}.", formatZagreb(result.until)) : t("Ograničenje je ukinuto."));
        }, false);
      }}>
        <label className="block text-sm">{t("Email korisničkog računa")}<input type="email" required maxLength={254} className={input} value={email} onChange={event => { setEmail(event.target.value); setRestriction(''); }} /></label>
        <label className="block text-sm">{t("Broj dana (0 za ukidanje)")}<input type="number" min={0} max={30} required className={input} value={days} onChange={event => setDays(Number(event.target.value))} /></label>
        <button className={primary} disabled={panel.busy}>{t("Spremi ograničenje")}</button>
        <Result message={restriction || panel.message} />
      </form>
    </AdminSection>
  </>;
}

export function DashboardFeedback({ request }: { request: AdminRequest }) {
  const path = '/dashboard/feedback';
  const panel = usePanel<Feedback[]>(request, path, []);
  return <AdminSection title="Prijave grešaka">
    <button className={button} disabled={panel.busy} onClick={() => void panel.act()}>{t("Osvježi")}</button>
    {!panel.busy && !panel.data.length && <p className="text-sm">{t("Trenutačno nema prijava grešaka.")}</p>}
    <ul className="divide-y divide-slate-200">{panel.data.map(row => <li key={row._id} className="space-y-2 py-3 text-sm">
      <p className="font-semibold">{row.area.toUpperCase()} · {t(feedbackCategories[row.category])} · {row.state === 'open' ? t("Otvoreno") : t("Riješeno")}</p>
      <p className="whitespace-pre-wrap break-words">{row.text}</p>
      <div className="flex flex-wrap items-center gap-3">
        <small>{formatZagreb(row.createdAt)}</small>
        <button className={button} disabled={panel.busy} onClick={() => void panel.act(() => request(path + '/' + row._id, edit('PATCH', { state: row.state === 'open' ? 'resolved' : 'open' })))}>
          {row.state === 'open' ? t("Označi riješenim") : t("Ponovno otvori")}
        </button>
      </div>
    </li>)}</ul>
    <Result message={panel.message} />
  </AdminSection>;
}

interface AdminSession { id: string; browser: string; current: boolean; createdAt: number; expiresAt: number }
interface AuditEntry { _id: string; action: string; target: string; at: string }
const auditLabels: Record<string, string> = {
  'announcement.publish': 'Najava objavljena', 'announcement.withdraw': 'Najava povučena',
  'bulletin.publish': 'Objava spremljena', 'bulletin.withdraw': 'Objava povučena',
  'controls.save': 'Kontrole ažurirane', 'auth.settings': 'Postavke prijave promijenjene',
  'rare.save': 'Vozilo spremljeno', 'rare.restore': 'Prethodni podaci vozila vraćeni', 'rare.delete': 'Vozilo uklonjeno',
  'report.hidden': 'Dojava skrivena', 'report.resolved': 'Dojava riješena', 'report.visible': 'Dojava vraćena',
  'restriction.set': 'Slanje dojava ograničeno', 'restriction.clear': 'Ograničenje dojava ukinuto',
  'feedback.resolved': 'Greška označena riješenom', 'feedback.open': 'Prijava greške ponovno otvorena',
  'sessions.revoke': 'Sesija odjavljena', 'sessions.revoke_others': 'Ostale sesije odjavljene',
  'timetable.refresh': 'Vozni red osvježen', 'realtime.refresh': 'Lokacije osvježene'
};

export function DashboardSecurity({ request, onSignedOut }: { request: AdminRequest; onSignedOut: () => void }) {
  const sessions = usePanel<AdminSession[]>(request, '/sessions', []);
  const audit = usePanel<AuditEntry[]>(request, '/dashboard/audit', []);
  return <>
    <AdminSection title="Aktivne admin sesije" open>
      <button className={button} disabled={sessions.busy || !sessions.data.some(session => !session.current)} onClick={() => void sessions.act(() => request('/sessions/others', edit('DELETE')))}>{t("Odjavi sve ostale sesije")}</button>
      <ul className="divide-y divide-slate-200">{sessions.data.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
        <div className="min-w-0"><p className="font-semibold">{row.current ? t("Ovaj preglednik") : t("Drugi preglednik")}</p>
          <p className="break-all text-xs text-slate-600">{row.browser}</p><small>{formatZagreb(row.createdAt)} – {formatZagreb(row.expiresAt)}</small>
        </div>
        <button className={button} disabled={sessions.busy} onClick={() => void sessions.act(async () => {
          await request('/sessions/' + row.id, edit('DELETE'));
          if (row.current) onSignedOut();
        }, !row.current)}>{t("Odjavi sesiju")}</button>
      </li>)}</ul>
      <Result message={sessions.message} />
    </AdminSection>
    <AdminSection title="Povijest admin radnji">
      <button className={button} disabled={audit.busy} onClick={() => void audit.act()}>{t("Osvježi")}</button>
      <ul className="divide-y divide-slate-200">{audit.data.map(row => <li key={row._id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
        <span>{t(auditLabels[row.action] || row.action)}{row.target && ` · ${row.target}`}</span><small>{formatZagreb(row.at)}</small>
      </li>)}</ul>
      <Result message={audit.message} />
    </AdminSection>
  </>;
}
