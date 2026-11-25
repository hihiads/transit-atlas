import { locale, relativeUpdateTime, t } from '../services/i18n';
import { FormEvent, useEffect, useState } from 'react';
import AdminAnnouncement from './AdminAnnouncement';

interface Settings {
  loginEnabled: boolean;
  registrationEnabled: boolean;
  googleEnabled: boolean;
}

interface AdminResponse {
  settings: Settings;
  authenticationActive: boolean;
  missingEnvironment: string[];
}

interface SystemStatus {
  stats?: { routes: number; stops: number };
  rtFeedStatus?: string;
  staleVehiclesDropped?: number;
  lastGtfsUpdate?: string | null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(t(result.error || "Zahtjev nije uspio.")), { missing: result.missingEnvironment });
  return result;
}

export default function AdminPanel() {
  useEffect(() => { document.title = t("Transitly – Administracija"); }, []);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [settings, setSettings] = useState<Settings>({ loginEnabled: false, registrationEnabled: false, googleEnabled: false });
  const [draft, setDraft] = useState<Settings>({ loginEnabled: false, registrationEnabled: false, googleEnabled: false });
  const [missing, setMissing] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshingData, setRefreshingData] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const [refreshingTimetable, setRefreshingTimetable] = useState(false);
  const [timetableMessage, setTimetableMessage] = useState('');
  const [system, setSystem] = useState<SystemStatus | null>(null);

  async function loadSettings() {
    const result = await request<AdminResponse>('/settings');
    setSettings(result.settings);
    setDraft(result.settings);
    setMissing(result.missingEnvironment);
    setSystem(await request<SystemStatus>('/system/status').catch(() => null));
    setAuthenticated(true);
  }

  useEffect(() => {
    loadSettings().catch(() => setAuthenticated(false));
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await request('/login', { method: 'POST', body: JSON.stringify({ password, code }) });
      setPassword('');
      setCode('');
      await loadSettings();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Prijava nije uspjela."));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const result = await request<AdminResponse>('/settings', { method: 'PATCH', body: JSON.stringify(draft) });
      setSettings(result.settings);
      setDraft(result.settings);
      setMissing(result.missingEnvironment);
      setMessage(t("Postavke su spremljene."));
    } catch (error) {
      const cause = error as Error & { missing?: string[] };
      setMessage(cause.message);
      if (cause.missing) setMissing(cause.missing);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await request('/logout', { method: 'POST' }).catch(() => {});
    setAuthenticated(false);
    setSystem(null);
    setMessage(t("Odjavljeni ste."));
  }

  async function refreshTransitData() {
    setRefreshingData(true);
    setRefreshMessage('');
    try {
      const response = await fetch('/api/vehicles/zagreb', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || result.status !== 'live') throw new Error(t("ZET podatke nije moguće osvježiti."));
      const newestUpdate = Math.max(0, ...result.vehicles.map((vehicle: { lastUpdate: number }) => vehicle.lastUpdate));
      const age = newestUpdate ? relativeUpdateTime(newestUpdate) : t("nema svježih lokacija");
      setRefreshMessage(t("Dohvaćeno {0} svježih vozila; najnoviji podatak {1}. Odbačeno zastarjelih lokacija: {2}.", result.vehicles.length, age, result.staleVehiclesDropped || 0));
      setSystem(await request<SystemStatus>('/system/status'));
    } catch (error) {
      setRefreshMessage(error instanceof Error ? error.message : t("Osvježavanje nije uspjelo."));
    } finally {
      setRefreshingData(false);
    }
  }

  async function refreshTimetable() {
    setTimetableMessage('');
    setRefreshingTimetable(true);
    try {
      const result = await request<{ lastGtfsUpdate: string }>('/system/refresh-timetable', { method: 'POST' });
      setSystem(previous => ({ ...previous, lastGtfsUpdate: result.lastGtfsUpdate }));
      setTimetableMessage(t("Vozni red je osvježen."));
    } catch (error) {
      setTimetableMessage(error instanceof Error ? error.message : t("Osvježavanje voznog reda nije uspjelo."));
    } finally {
      setRefreshingTimetable(false);
    }
  }

  return (
    <main className="h-screen overflow-y-auto bg-slate-50 px-4 py-8 text-slate-900 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <a href={import.meta.env.DEV ? "/" : "https://transitly.eu/"} className="text-sm text-slate-500 hover:text-slate-900">← Transitly</a>
        <header className="mb-8 mt-6 flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Transitly</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("Administracija")}</h1><p className="mt-2 text-sm text-slate-600">{t("Upravljajte prijavom i provjerite stanje podataka.")}</p></div>
          {authenticated && <button onClick={signOut} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100">{t("Odjava")}</button>}
        </header>

        {!authenticated ? (
          <form onSubmit={signIn} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-lg font-semibold">{t("Prijava administratora")}</h2>
            <label className="mt-5 block text-sm font-medium">{t("Administratorska lozinka")}<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="mt-5 block text-sm font-medium">{t("Kod iz aplikacije za autentifikaciju")}
              <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </label>
            <button disabled={busy} className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">{busy ? t("Provjera…") : t("Prijavi se")}</button>
            {message && <p className="mt-4 text-sm text-red-700" role="alert">{message}</p>}
          </form>
        ) : <>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6"><h2 className="text-lg font-semibold">{t("Prijava i registracija")}</h2><p className="mt-1 text-sm text-slate-600">{t("Kad su obje opcije isključene, korisnici se ne mogu prijaviti ni registrirati.")}</p></div>
            <div className="divide-y divide-slate-100">
              {([['loginEnabled', t("Prijava"), t("Sprečava prijavu lozinkom i preko povezanih računa.")], ['registrationEnabled', t("Registracija"), t("Sprečava stvaranje novih računa.")], ['googleEnabled', t("Google prijava"), t("Dostupna kad je Google client ID konfiguriran.")]] as const).map(([key, title, description]) => (
                <label key={key} className="flex cursor-pointer items-center justify-between gap-4 py-5 first:pt-0 last:pb-0">
                  <span><span className="block text-sm font-medium">{title}</span><span className="mt-1 block text-sm text-slate-500">{description}</span></span>
                  <input type="checkbox" checked={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.checked }))} className="h-5 w-5 shrink-0 accent-blue-700" />
                </label>
              ))}
            </div>
            <button disabled={busy || Object.keys(draft).every(key => draft[key as keyof Settings] === settings[key as keyof Settings])} onClick={save} className="mt-7 rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">{busy ? t("Spremanje…") : t("Spremi promjene")}</button>
            <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${settings.loginEnabled || settings.registrationEnabled ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`} role="status">
              {settings.loginEnabled || settings.registrationEnabled ? t("Prijava je aktivna.") : t("Prijava i registracija su isključene. MongoDB konfiguracija nije potrebna dok su obje ugašene.")}
            </p>
            {missing.length > 0 && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p>{t("Za uključivanje nedostaju ove varijable u okruženju:")}</p><p className="mt-1 font-mono text-xs">{missing.join(', ')}</p></div>}
            {message && <p className="mt-3 text-sm text-slate-700" role="status">{message}</p>}
          </section>

          <AdminAnnouncement request={request} />

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold">{t("Stanje podataka")}</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{t("Stanice u Zagrebu")}</p><p className="mt-1 text-xl font-semibold">{system?.stats?.stops?.toLocaleString(locale) ?? '—'}</p></div>
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{t("Linije u Zagrebu")}</p><p className="mt-1 text-xl font-semibold">{system?.stats?.routes?.toLocaleString(locale) ?? '—'}</p></div>
            </div>
            <p className="mt-3 text-sm text-slate-600">{t("Lokacije vozila:") + " "}{system?.rtFeedStatus === 'active' ? t("dostupne") : t(system?.rtFeedStatus || "provjera nije dostupna")}</p>
            {system?.staleVehiclesDropped ? <p className="mt-1 text-sm text-amber-800">{t("Odbačeno zastarjelih lokacija:") + " "}{system.staleVehiclesDropped}</p> : null}
            <button onClick={refreshTransitData} disabled={refreshingData} className="mt-4 rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:bg-slate-400">{refreshingData ? t("Dohvaćam ZET podatke…") : t("Osvježi podatke sa ZET-a")}</button>
            {refreshMessage && <p className="mt-3 text-sm text-slate-700" role="status">{refreshMessage}</p>}
            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="text-sm text-slate-600">{t("Vozni red zadnji put učitan")}{": "}{system?.lastGtfsUpdate ? new Date(system.lastGtfsUpdate).toLocaleString(locale) : "—"}</p>
              <button onClick={refreshTimetable} disabled={refreshingTimetable} className="mt-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">{refreshingTimetable ? t("Učitavam vozni red…") : t("Osvježi zagrebački vozni red")}</button>
              {timetableMessage && <p className="mt-2 text-sm text-slate-700" role="status">{timetableMessage}</p>}
            </div>
          </section>
        </>}
      </div>
    </main>
  );
}
