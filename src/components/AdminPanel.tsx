import { FormEvent, useEffect, useState } from 'react';

interface Settings {
  loginEnabled: boolean;
  registrationEnabled: boolean;
  googleEnabled: boolean;
  appleEnabled: boolean;
}

interface AdminResponse {
  settings: Settings;
  authenticationActive: boolean;
  missingEnvironment: string[];
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Zahtjev nije uspio.'), { missing: result.missingEnvironment });
  return result;
}

export default function AdminPanel() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [settings, setSettings] = useState<Settings>({ loginEnabled: false, registrationEnabled: false, googleEnabled: false, appleEnabled: false });
  const [draft, setDraft] = useState<Settings>({ loginEnabled: false, registrationEnabled: false, googleEnabled: false, appleEnabled: false });
  const [missing, setMissing] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [system, setSystem] = useState<{ stats?: { routes: number; stops: number }; rtFeedStatus?: string } | null>(null);

  async function loadSettings() {
    const result = await request<AdminResponse>('/settings');
    setSettings(result.settings);
    setDraft(result.settings);
    setMissing(result.missingEnvironment);
    setAuthenticated(true);
  }

  useEffect(() => {
    loadSettings().catch(() => setAuthenticated(false));
    fetch('/api/system/status').then(response => response.ok ? response.json() : null).then(setSystem).catch(() => {});
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await request('/login', { method: 'POST', body: JSON.stringify({ password }) });
      setPassword('');
      await loadSettings();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Prijava nije uspjela.');
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
      setMessage('Postavke su spremljene.');
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
    setMessage('Odjavljeni ste.');
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <a href="/" className="text-sm text-slate-500 hover:text-slate-900">← Transit Atlas</a>
        <header className="mb-8 mt-6 flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Transit Atlas</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Administracija</h1><p className="mt-2 text-sm text-slate-600">Upravljajte prijavom i provjerite stanje podataka.</p></div>
          {authenticated && <button onClick={signOut} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100">Odjava</button>}
        </header>

        {!authenticated ? (
          <form onSubmit={signIn} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-lg font-semibold">Prijava administratora</h2>
            <label className="mt-5 block text-sm font-medium">Administratorska lozinka
              <input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </label>
            <button disabled={busy} className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">{busy ? 'Provjera…' : 'Prijavi se'}</button>
            {message && <p className="mt-4 text-sm text-red-700" role="alert">{message}</p>}
          </form>
        ) : <>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6"><h2 className="text-lg font-semibold">Prijava i registracija</h2><p className="mt-1 text-sm text-slate-600">Kad su obje opcije isključene, korisnici se ne mogu prijaviti ni registrirati.</p></div>
            <div className="divide-y divide-slate-100">
              {([['loginEnabled', 'Prijava', 'Sprečava prijavu lozinkom i preko povezanih računa.'], ['registrationEnabled', 'Registracija', 'Sprečava stvaranje novih računa.'], ['googleEnabled', 'Google prijava', 'Dostupna kad je Google client ID konfiguriran.'], ['appleEnabled', 'Apple prijava', 'Dostupna kad je Apple Services ID konfiguriran.']] as const).map(([key, title, description]) => (
                <label key={key} className="flex cursor-pointer items-center justify-between gap-4 py-5 first:pt-0 last:pb-0">
                  <span><span className="block text-sm font-medium">{title}</span><span className="mt-1 block text-sm text-slate-500">{description}</span></span>
                  <input type="checkbox" checked={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.checked }))} className="h-5 w-5 shrink-0 accent-blue-700" />
                </label>
              ))}
            </div>
            <button disabled={busy || Object.keys(draft).every(key => draft[key as keyof Settings] === settings[key as keyof Settings])} onClick={save} className="mt-7 rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">{busy ? 'Spremanje…' : 'Spremi promjene'}</button>
            <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${settings.loginEnabled || settings.registrationEnabled ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`} role="status">
              {settings.loginEnabled || settings.registrationEnabled ? 'Prijava je aktivna.' : 'Prijava i registracija su isključene. MongoDB konfiguracija nije potrebna dok su obje ugašene.'}
            </p>
            {missing.length > 0 && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p>Za uključivanje nedostaju ove varijable u okruženju:</p><p className="mt-1 font-mono text-xs">{missing.join(', ')}</p></div>}
            {message && <p className="mt-3 text-sm text-slate-700" role="status">{message}</p>}
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold">Stanje podataka</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Stanice u Zagrebu</p><p className="mt-1 text-xl font-semibold">{system?.stats?.stops?.toLocaleString('hr-HR') ?? '—'}</p></div>
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Linije u Zagrebu</p><p className="mt-1 text-xl font-semibold">{system?.stats?.routes?.toLocaleString('hr-HR') ?? '—'}</p></div>
            </div>
            <p className="mt-3 text-sm text-slate-600">Lokacije vozila: {system?.rtFeedStatus === 'active' ? 'dostupne' : system?.rtFeedStatus || 'provjera nije dostupna'}</p>
          </section>
        </>}
      </div>
    </main>
  );
}
