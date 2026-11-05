import { City } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {
  cities: City[];
  selectedCity: City;
  onCityChange: (city: City) => void;
  vehicleCount: number;
  totalVehicles: number;
  dataStatus: 'demo' | 'live' | 'unavailable';
  onAuthClick: () => void;
  loginEnabled: boolean;
  registrationEnabled: boolean;
}

export default function Header({
  cities,
  selectedCity,
  onCityChange,
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

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-xs sm:text-sm text-gray-300 whitespace-nowrap">Grad:</label>
              <select
                value={selectedCity.id}
                onChange={(e) => {
                  const city = cities.find(c => c.id === e.target.value);
                  if (city) onCityChange(city);
                }}
                className="flex-1 sm:flex-initial bg-slate-700 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-accent text-sm"
              >
                {cities.map(city => (
                  <option key={city.id} value={city.id}>
                    {city.name} {city.status === 'coming_soon' && '(Uskoro)'}
                  </option>
                ))}
              </select>
            </div>

            {selectedCity.hasRealtime && <div className="text-xs sm:text-sm w-full sm:w-auto">
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
            </div>}
            {!selectedCity.hasRealtime && (
              <div className="text-xs text-emerald-300">Planirani polasci</div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
