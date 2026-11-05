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

  return (
    <header className="bg-slate-800 text-white shadow-lg z-[1001] relative">
      <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold truncate">Transit Atlas</h1>
              <p className="text-xs sm:text-sm text-gray-300 hidden sm:block">Pronađi prijevoz u blizini</p>
            </div>

            <div className="flex items-center gap-2">
              {user ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-gray-300 hidden sm:inline truncate max-w-[120px]">{user.email}</span>
                  <button
                    onClick={logout}
                    className="text-xs sm:text-sm bg-slate-700 hover:bg-slate-600 px-2 sm:px-3 py-1.5 sm:py-2 rounded transition-colors whitespace-nowrap"
                  >
                    Odjava
                  </button>
                </div>
              ) : (loginEnabled || registrationEnabled) ? (
                <button
                  onClick={onAuthClick}
                  className="text-xs sm:text-sm bg-primary hover:bg-blue-700 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium transition-colors whitespace-nowrap"
                >
                  {loginEnabled ? 'Prijava' : 'Registracija'}
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-xs sm:text-sm">
              <div className="text-gray-300">
                Prikazano: <span className="font-bold text-white">{vehicleCount}</span> / {totalVehicles}
              </div>
              {dataStatus === 'demo' && (
                <div className="text-xs text-yellow-400">Ogledni podaci</div>
              )}
              {dataStatus === 'live' && (
                <div className="text-xs text-green-400">Podaci uživo</div>
              )}
              {dataStatus === 'unavailable' && (
                <div className="text-xs text-amber-300">Live feed nedostupan</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
