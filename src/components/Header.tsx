import { useAuth } from '../contexts/AuthContext';
import { useState } from 'react';

interface HeaderProps {
  vehicleCount: number;
  totalVehicles: number;
  dataStatus: 'demo' | 'live' | 'unavailable';
  onAuthClick: () => void;
  loginEnabled: boolean;
  registrationEnabled: boolean;
}

export default function Header({
  vehicleCount,
  totalVehicles,
  dataStatus,
  onAuthClick,
  loginEnabled,
  registrationEnabled
}: HeaderProps) {
  const { user, logout, deleteAccount } = useAuth();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const status = dataStatus === 'live'
    ? { label: 'Uživo', style: 'bg-emerald-400/15 text-emerald-200', dot: 'bg-emerald-400' }
    : dataStatus === 'demo'
      ? { label: 'Demo podaci', style: 'bg-amber-300/15 text-amber-100', dot: 'bg-amber-300' }
      : { label: 'Feed nedostupan', style: 'bg-rose-300/15 text-rose-100', dot: 'bg-rose-300' };

  return (
    <header className="relative z-[1001] border-b border-white/10 bg-[#102638] text-white shadow-[0_8px_28px_rgba(15,35,50,0.18)]">
      <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3 px-3 py-3 sm:px-5 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#a9f0d1] text-[#102638] shadow-inner shadow-white/30">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7 3.75h10a2.25 2.25 0 0 1 2.25 2.25v9A2.25 2.25 0 0 1 17 17.25H7A2.25 2.25 0 0 1 4.75 15V6A2.25 2.25 0 0 1 7 3.75Z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M7.5 7h9v5h-9zM8 20l2-2.75m6 2.75L14 17.25M8 14.5h.01m8-.01h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">Transitly</h1>
              <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${status.style}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{status.label}
              </span>
            </div>
            <p className="hidden text-xs text-slate-300 sm:block">Linije i polasci javnog prijevoza</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-right sm:px-3">
            <div className="text-sm font-bold leading-4 tabular-nums">{vehicleCount}<span className="font-normal text-slate-300"> / {totalVehicles}</span></div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-300">vozila</div>
          </div>
          {user ? (
            <div className="flex items-center gap-2">
              <span className="hidden max-w-[160px] truncate text-xs text-slate-300 lg:inline">{user.email}</span>
              <button onClick={() => { setDeleteError(''); setShowDelete(true); }} className="rounded-xl border border-white/15 px-2.5 py-2 text-xs font-semibold underline underline-offset-2 transition hover:bg-white/10">Obriši račun</button>
              <button onClick={logout} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold transition hover:bg-white/10 sm:text-sm">Odjava</button>
            </div>
          ) : (loginEnabled || registrationEnabled) ? (
            <button onClick={onAuthClick} className="rounded-xl bg-[#a9f0d1] px-3 py-2 text-xs font-bold text-[#102638] shadow-sm transition hover:bg-[#c3f6df] sm:px-4 sm:text-sm">
              {loginEnabled ? 'Prijava' : 'Registracija'}
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-3 pb-2 sm:hidden">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold ${status.style}`}><span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{status.label}</span>
        <span className="text-[10px] text-slate-300">· Linije i polasci javnog prijevoza</span>
      </div>
      <nav aria-label="Pravne informacije" className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-2 text-[11px] text-slate-200">
        <a className="underline underline-offset-2 hover:text-white" href="/privacy">Privatnost</a>
        <a className="underline underline-offset-2 hover:text-white" href="/terms">Uvjeti korištenja</a>
        <a className="underline underline-offset-2 hover:text-white" href="/cookies">Kolačići</a>
        <a className="underline underline-offset-2 hover:text-white" href="mailto:info@transitly.eu">Kontakt: info@transitly.eu</a>
        <span>Transitly vodi Din Mulajusufović</span>
      </nav>
      {showDelete && <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4" role="presentation">
        <section role="dialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description" onKeyDown={event => {
          if (event.key === 'Escape' && !deleting) setShowDelete(false);
          if (event.key === 'Tab') {
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
            const first = buttons[0]; const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }} className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
          <h2 id="delete-account-title" className="text-xl font-bold">Trajno brisanje računa</h2>
          <p id="delete-account-description" className="mt-3 text-sm leading-6 text-slate-700">Izbrisat ćemo račun i njegove podatke iz Transitlyja. Omiljene linije i praćeni polasci spremljeni u ovom pregledniku također će se ukloniti. Ovu radnju nije moguće poništiti.</p>
          {deleteError && <p className="mt-3 text-sm text-red-800" role="alert">{deleteError}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" autoFocus disabled={deleting} onClick={() => setShowDelete(false)} className="rounded-lg border border-slate-400 px-4 py-2 font-semibold text-slate-800 hover:bg-slate-100">Odustani</button>
            <button type="button" disabled={deleting} onClick={async () => { setDeleting(true); try { await deleteAccount(); setShowDelete(false); } catch (error) { setDeleteError(error instanceof Error ? error.message : 'Brisanje nije uspjelo.'); } finally { setDeleting(false); } }} className="rounded-lg bg-red-800 px-4 py-2 font-semibold text-white hover:bg-red-900">{deleting ? 'Brišem…' : 'Trajno izbriši račun'}</button>
          </div>
        </section>
      </div>}
    </header>
  );
}
