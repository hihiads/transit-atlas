import { useAuth } from '../contexts/AuthContext';

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
  const { user, logout } = useAuth();

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
            <p className="hidden text-xs text-slate-300 sm:block">Prijevoz u tvom gradu, na jednoj karti</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-right sm:px-3">
            <div className="text-sm font-bold leading-4 tabular-nums">{vehicleCount}<span className="font-normal text-slate-400"> / {totalVehicles}</span></div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-400">vozila</div>
          </div>
          {user ? (
            <div className="flex items-center gap-2">
              <span className="hidden max-w-[160px] truncate text-xs text-slate-300 lg:inline">{user.email}</span>
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
        <span className="text-[10px] text-slate-400">· Prijevoz u tvom gradu, na jednoj karti</span>
      </div>
    </header>
  );
}
