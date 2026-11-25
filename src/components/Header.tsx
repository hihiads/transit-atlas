import { t } from '../services/i18n';
import { useAuth } from '../contexts/AuthContext';
import { useState } from 'react';
import type { ReactNode } from 'react';

interface HeaderProps {
  vehicleCount: number;
  totalVehicles: number;
  dataStatus: 'demo' | 'live' | 'unavailable';
  onAuthClick: () => void;
  loginEnabled: boolean;
  registrationEnabled: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
  menuContent: ReactNode;
}

export default function Header({
  vehicleCount,
  totalVehicles,
  dataStatus,
  onAuthClick,
  loginEnabled,
  registrationEnabled,
  menuOpen,
  onMenuToggle,
  menuContent
}: HeaderProps) {
  const { user, logout, deleteAccount } = useAuth();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deletePassword, setDeletePassword] = useState('');

  const openDeleteDialog = () => {
    setDeleteError('');
    setDeletePassword('');
    setShowDelete(true);
  };

  const status = dataStatus === 'live'
    ? { label: t("Uživo"), style: 'bg-emerald-400/15 text-emerald-200', dot: 'bg-emerald-400' }
    : dataStatus === 'demo'
      ? { label: t("Demo podaci"), style: 'bg-amber-300/15 text-amber-100', dot: 'bg-amber-300' }
      : { label: t("Feed nedostupan"), style: 'bg-rose-300/15 text-rose-100', dot: 'bg-rose-300' };

  return (
    <header className="relative z-[1001] border-b border-white/10 bg-[#102638] text-white shadow-[0_8px_28px_rgba(15,35,50,0.18)]">
      <div className="mx-auto grid max-w-[1800px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-1.5 sm:flex sm:justify-between sm:gap-3 sm:px-5 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#a9f0d1] text-[#102638] shadow-inner shadow-white/30 sm:h-10 sm:w-10 sm:rounded-2xl">
            <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7 3.75h10a2.25 2.25 0 0 1 2.25 2.25v9A2.25 2.25 0 0 1 17 17.25H7A2.25 2.25 0 0 1 4.75 15V6A2.25 2.25 0 0 1 7 3.75Z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M7.5 7h9v5h-9zM8 20l2-2.75m6 2.75L14 17.25M8 14.5h.01m8-.01h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-bold tracking-tight sm:text-xl">Transitly</h1>
              <label className="sr-only" htmlFor="transit-provider">{t("Odaberi prijevoznika")}</label>
              <select id="transit-provider" aria-label={t("Odaberi prijevoznika")} defaultValue="zet" onChange={event => { if (event.target.value === 'hzpp') window.location.assign('/hzpp/'); }} className="min-h-8 max-w-[5.5rem] rounded-lg border border-white/20 bg-[#19364a] px-2 text-xs font-bold text-white outline-none hover:bg-[#25475d] focus-visible:ring-2 focus-visible:ring-[#a9f0d1]">
                <option className="text-slate-900" value="zet">ZET</option>
                <option className="text-slate-900" value="hzpp">HŽPP</option>
              </select>
              <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${status.style}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{status.label}
              </span>
            </div>
            <p className="hidden text-xs text-slate-300 md:block">{t("Linije i polasci javnog prijevoza")}</p>
          </div>
          <div className="shrink-0 sm:relative">
            <button type="button" aria-expanded={menuOpen} aria-controls="site-menu" onClick={onMenuToggle} className="flex min-h-10 items-center gap-1.5 rounded-xl border border-white/15 px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-white/10 sm:gap-2 sm:px-3 sm:text-sm">
              <span aria-hidden="true" className="text-base leading-none">☰</span><span>{t("Izbornik")}</span>
            </button>
            {menuOpen && <div id="site-menu" className="absolute left-3 right-3 top-full z-[1200] mt-1 max-h-[min(75dvh,38rem)] overflow-y-auto rounded-2xl border border-white/70 bg-[#f3f7f6]/95 p-3 text-slate-800 shadow-2xl backdrop-blur sm:left-0 sm:right-auto sm:mt-2 sm:w-[21rem] sm:p-4">
              {menuContent}
              {user && <button type="button" onClick={() => { onMenuToggle(); openDeleteDialog(); }} className="mt-2 min-h-10 rounded-lg px-2 text-sm font-semibold text-red-800 underline underline-offset-2 hover:bg-white sm:hidden">{t("Obriši račun")}</button>}
            </div>}
          </div>
        </div>

        <div className="col-start-1 row-start-2 flex items-center gap-1.5 sm:hidden">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold ${status.style}`}><span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{status.label}</span>
        </div>
        <div className="col-start-2 row-start-2 flex items-baseline justify-end gap-1.5 text-right sm:ml-auto sm:block sm:rounded-xl sm:border sm:border-white/10 sm:bg-white/[0.06] sm:px-3 sm:py-1.5">
          <div className="text-xs font-bold leading-4 tabular-nums sm:text-sm">{vehicleCount}<span className="font-normal text-slate-300"> / {totalVehicles}</span></div>
          <div className="text-[10px] uppercase tracking-wider text-slate-300 sm:mt-0.5">{t("vozila")}</div>
        </div>
        <div className="col-start-2 row-start-1 flex shrink-0 items-center justify-end">
          {user ? (
            <div className="flex items-center gap-2">
              <span className="hidden max-w-[160px] truncate text-xs text-slate-300 lg:inline">{user.email}</span>
              <button onClick={openDeleteDialog} className="hidden rounded-xl border border-white/15 px-2.5 py-2 text-xs font-semibold underline underline-offset-2 transition hover:bg-white/10 sm:block">{t("Obriši račun")}</button>
              <button onClick={logout} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold transition hover:bg-white/10 sm:text-sm">{t("Odjava")}</button>
            </div>
          ) : (loginEnabled || registrationEnabled) ? (
            <button onClick={onAuthClick} className="rounded-xl bg-[#a9f0d1] px-3 py-2 text-xs font-bold text-[#102638] shadow-sm transition hover:bg-[#c3f6df] sm:px-4 sm:text-sm">
              {loginEnabled ? t("Prijava") : t("Registracija")}
            </button>
          ) : null}
        </div>
      </div>
      {showDelete && <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4" role="presentation">
        <section role="dialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description" onKeyDown={event => {
          if (event.key === 'Escape' && !deleting) setShowDelete(false);
          if (event.key === 'Tab') {
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])'));
            const first = buttons[0]; const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }} className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
          <h2 id="delete-account-title" className="text-xl font-bold">{t("Trajno brisanje računa")}</h2>
          <p id="delete-account-description" className="mt-3 text-sm leading-6 text-slate-700">{t("Izbrisat ćemo račun i njegove podatke iz Transitlyja. Omiljene linije i praćeni polasci spremljeni u ovom pregledniku također će se ukloniti. Ovu radnju nije moguće poništiti.")}</p>
          <label className="mt-4 block text-sm font-medium">{t("Potvrdite lozinku")}
            <input autoFocus type="password" autoComplete="current-password" maxLength={128} value={deletePassword} disabled={deleting} onChange={event => setDeletePassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-400 px-3 py-2" />
          </label>
          <p className="mt-2 text-sm text-slate-700">{t("Ako koristite Google, možete ostaviti lozinku praznom i izbrisati račun unutar pet minuta od Google prijave.")}</p>
          {deleteError && <p className="mt-3 text-sm text-red-800" role="alert">{deleteError}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" disabled={deleting} onClick={() => setShowDelete(false)} className="rounded-lg border border-slate-400 px-4 py-2 font-semibold text-slate-800 hover:bg-slate-100">{t("Odustani")}</button>
            <button type="button" disabled={deleting} onClick={async () => { setDeleting(true); try { await deleteAccount(deletePassword); setDeletePassword(''); setShowDelete(false); } catch (error) { setDeleteError(error instanceof Error ? error.message : t("Brisanje nije uspjelo.")); } finally { setDeleting(false); } }} className="rounded-lg bg-red-800 px-4 py-2 font-semibold text-white hover:bg-red-900">{deleting ? t("Brišem…") : t("Trajno izbriši račun")}</button>
          </div>
        </section>
      </div>}
    </header>
  );
}
