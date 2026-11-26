import { t } from '../services/i18n';
import { FormEvent, useEffect, useState } from 'react';
import AdminAnnouncement from './AdminAnnouncement';
import { AdminSection, DashboardBulletins, DashboardControls, DashboardFeedback, DashboardRareVehicles, DashboardReports, DashboardSecurity } from './AdminDashboard';
import { TransitStatusList, type TransitStatus } from './TransitHelp';

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

const tabs = { overview: 'Pregled', content: 'Objave i vozila', reports: 'Dojave', security: 'Sigurnost' };
type Tab = keyof typeof tabs;

interface SystemStatus extends TransitStatus {
  vehicles: number;
  gtfsLoadError?: string | null;
  hzppSearchError?: string | null;
  rtFeedError?: string | null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(t(result?.error || "Zahtjev nije uspio.")), { missing: result?.missingEnvironment });
  return result;
}

export default function AdminPanel() {
  useEffect(() => { document.title = t("Transitly – Administracija"); }, []);
  const [tab, setTab] = useState<Tab>('overview');
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
    setTab('overview');
    setSystem(null);
    setMessage(t("Odjavljeni ste."));
  }

  async function refreshTransitData() {
    setRefreshingData(true);
    setRefreshMessage('');
    try {
      const result = await request<{ count: number }>('/system/refresh-live', { method: 'POST' });
      setRefreshMessage(t("Broj vozila u zadnjem uspješnom dohvaćanju: {0}", result.count));
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
      await request('/system/refresh-timetable', { method: 'POST' });
      setSystem(await request<SystemStatus>('/system/status'));
      setTimetableMessage(t("Vozni red je osvježen."));
    } catch (error) {
      setTimetableMessage(error instanceof Error ? error.message : t("Osvježavanje voznog reda nije uspjelo."));
    } finally {
      setRefreshingTimetable(false);
    }
  }

  return (
    <main className="h-screen overflow-y-auto bg-slate-50 px-4 py-5 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <a href={import.meta.env.DEV ? "/" : "https://transitly.eu/"} className="text-sm text-slate-500 hover:text-slate-900">← Transitly</a>
        <header className="mb-8 mt-6 flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Transitly</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("Administracija")}</h1></div>
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
          <nav aria-label={t("Administracija")} className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 sm:grid-cols-4">
            {(Object.keys(tabs) as Tab[]).map(name => <button key={name} type="button" aria-pressed={tab === name} onClick={() => { setTab(name); setMessage(''); }}
              className="min-h-11 rounded-lg px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 aria-pressed:bg-[#102638] aria-pressed:text-white">{t(tabs[name])}</button>)}
          </nav>
          <div className="space-y-3">
          {tab === 'security' && <>
          <DashboardSecurity request={request} onSignedOut={() => { setAuthenticated(false); setTab('overview'); }} />
          <AdminSection title="Prijava i registracija">
            <p className="text-sm text-slate-600">{t("Kad su obje opcije isključene, korisnici se ne mogu prijaviti ni registrirati.")}</p>
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
          </AdminSection>
          </>}
          {tab === 'content' && <>
            <DashboardBulletins request={request} />
            <DashboardRareVehicles request={request} />
            <AdminSection title="Postojeća naslovna najava"><AdminAnnouncement request={request} /></AdminSection>
          </>}
          {tab === 'reports' && <><DashboardReports request={request} /><DashboardFeedback request={request} /></>}
          {tab === 'overview' && <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">{t("Stanje podataka")}</h2>
            {system?.services ? <TransitStatusList status={system} /> : <p className="my-3 text-sm text-slate-600">{t("Stanje usluga trenutačno nije dostupno.")}</p>}
            {system && <p className="text-sm text-slate-600">{t("Broj vozila u zadnjem uspješnom dohvaćanju: {0}", system.vehicles ?? 0)}</p>}
            {system?.rtFeedError && <p className="break-all text-sm text-amber-900">ZET GPS · {system.rtFeedError}</p>}
            {system?.gtfsLoadError && <p className="break-all text-sm text-amber-900">ZET · {system.gtfsLoadError}</p>}
            {system?.hzppSearchError && <p className="text-sm text-amber-900">HŽPP · {system.hzppSearchError}</p>}
            <button onClick={refreshTransitData} disabled={refreshingData} className="mt-4 rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:bg-slate-400">{refreshingData ? t("Dohvaćam ZET podatke…") : t("Osvježi podatke sa ZET-a")}</button>
            {refreshMessage && <p className="mt-3 text-sm text-slate-700" role="status">{refreshMessage}</p>}
            <div className="mt-4 border-t border-slate-200 pt-4">
              <button onClick={refreshTimetable} disabled={refreshingTimetable} className="mt-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">{refreshingTimetable ? t("Učitavam vozni red…") : t("Osvježi zagrebački vozni red")}</button>
              {timetableMessage && <p className="mt-2 text-sm text-slate-700" role="status">{timetableMessage}</p>}
            </div>
          </section>
          <DashboardControls request={request} onSave={() => { void request<SystemStatus>('/system/status').then(setSystem).catch(() => {}); }} />
          </>}
          </div>
        </>}
      </div>
    </main>
  );
}
