import { useState, useEffect } from 'react';
import MapView from './components/MapView';
import Header from './components/Header';
import FilterPanel from './components/FilterPanel';
import VehicleCard from './components/VehicleCard';
import SchedulePanel from './components/SchedulePanel';
import AuthModal from './components/Auth/AuthModal';
import { api, AuthStatus } from './api';
import { useAuth } from './contexts/AuthContext';
import { Vehicle, City, Route, Stop, TransitShape } from './types';

function App() {
  const { user } = useAuth();
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [shapes, setShapes] = useState<TransitShape[]>([]);
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<'demo' | 'live' | 'unavailable'>('demo');
  const [showStops, setShowStops] = useState(false);
  const [showShapes, setShowShapes] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([45.815, 15.9819]);
  const [mapZoom, setMapZoom] = useState(12);
  const [userLocation, setUserLocation] = useState<[number, number] | undefined>();
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [nearestDistance, setNearestDistance] = useState<number | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ loginEnabled: true, registrationEnabled: true, authenticationActive: true });
  const [authStatusLoading, setAuthStatusLoading] = useState(true);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('token') || ['/verify-email', '/reset-password'].includes(window.location.pathname)) setShowAuthModal(true);
  }, []);

  const [selectedType, setSelectedType] = useState<'all' | 'bus' | 'tram'>('all');
  const [selectedLine, setSelectedLine] = useState<string>('');

  useEffect(() => {
    const checkTrackedDepartures = () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (!user) return;
      const tracked: string[] = JSON.parse(localStorage.getItem(`transit-atlas-tracked:${user.id}`) || '[]');
      const now = new Date();
      for (const item of tracked) {
        const time = item.split(':').slice(-3).join(':');
        if (!/^\d{2}:\d{2}:\d{2}$/.test(time)) continue;
        const [hour, minute] = time.split(':').map(Number);
        const departure = new Date(now);
        departure.setHours(hour, minute, 0, 0);
        const mins = Math.round((departure.getTime() - now.getTime()) / 60000);
        const moment = mins <= 10 && mins >= 0 ? 'soon' : mins < 0 && mins >= -1 ? 'now' : '';
        const key = `transit-notified:${now.toDateString()}:${item}:${moment}`;
        if (moment && !sessionStorage.getItem(key)) {
          new Notification(moment === 'soon' ? 'Polazak za 10 minuta' : 'Vrijeme polaska', { body: `Praćeni polazak je u ${time.slice(0, 5)}. Otvorite Transitly za stanje.` });
          sessionStorage.setItem(key, '1');
        }
      }
    };
    checkTrackedDepartures();
    const interval = setInterval(checkTrackedDepartures, 30000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    api.getAuthStatus().then(setAuthStatus).catch(() => {}).finally(() => setAuthStatusLoading(false));
    const refreshAuthStatus = () => api.getAuthStatus().then(setAuthStatus).catch(() => {});
    const interval = window.setInterval(refreshAuthStatus, 30000);
    window.addEventListener('focus', refreshAuthStatus);
    api.getCities()
      .then(cities => {
        const activeCity = cities.find(c => c.status === 'active');
        if (activeCity) setSelectedCity(activeCity);
      })
      .catch(() => setError('Nije moguće učitati popis gradova'))
      .finally(() => setLoading(false));
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refreshAuthStatus); };
  }, []);

  useEffect(() => {
    if (!authStatus.loginEnabled && !authStatus.registrationEnabled) setShowAuthModal(false);
  }, [authStatus]);

  useEffect(() => {
    if (!selectedCity) return;
    setMapCenter(selectedCity.center);
    setMapZoom(selectedCity.zoom);
    setUserLocation(undefined);
    setSelectedStop(null);
    setLocationMessage('');
    setNearestDistance(null);
    let cancelled = false;

    if (selectedCity.status !== 'active') {
      setVehicles([]);
      setRoutes([]);
      setStops([]);
      setShapes([]);
      setDataStatus('unavailable');
      return;
    }

    setShowStops(selectedCity.id !== 'zagreb');
    setShowShapes(false);

    // Učitaj vozila
    api.getVehicles(selectedCity.id)
      .then(response => {
        setVehicles(response.vehicles);
        setDataStatus(response.status);
      })
      .catch(() => {
        setError('Nije moguće učitati podatke o vozilima');
        setVehicles([]);
      });

    let routeRetry: number | undefined;
    const scheduleRoutesRetry = () => {
      routeRetry = window.setTimeout(() => {
        routeRetry = undefined;
        void loadRoutes();
      }, 5000);
    };
    const loadRoutes = async () => {
      try {
        const response = await api.getRoutes(selectedCity.id);
        if (cancelled) return;
        setRoutes(response.routes);
        if (response.routes.length && routeRetry !== undefined) {
          window.clearTimeout(routeRetry);
          routeRetry = undefined;
        } else if (!response.routes.length && routeRetry === undefined) scheduleRoutesRetry();
      } catch {
        if (!cancelled && routeRetry === undefined) scheduleRoutesRetry();
      }
    };
    void loadRoutes();

    let stopsRetry: number | undefined;
    const scheduleStopsRetry = () => {
      stopsRetry = window.setTimeout(() => {
        stopsRetry = undefined;
        void loadStops();
      }, 5000);
    };
    const loadStops = async () => {
      try {
        const response = await api.getStops(selectedCity.id);
        if (cancelled) return;
        if (response.stops.length) {
          setStops(response.stops.map(stop => ({ ...stop, cityId: selectedCity.id })));
          if (stopsRetry !== undefined) {
            window.clearTimeout(stopsRetry);
            stopsRetry = undefined;
          }
        } else if (stopsRetry === undefined) scheduleStopsRetry();
      } catch {
        if (!cancelled && stopsRetry === undefined) scheduleStopsRetry();
      }
    };
    void loadStops();

    setStops([]);

    api.getShapes(selectedCity.id)
      .then(response => setShapes(response.shapes))
      .catch(() => setShapes([]));

    // Osvježi podatke svakih 10 sekundi
    const interval = setInterval(() => {
      if (selectedCity.status === 'active') {
        api.getVehicles(selectedCity.id)
          .then(response => {
            setVehicles(response.vehicles);
            setDataStatus(response.status);
          })
          .catch(() => {});
      }
    }, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (routeRetry !== undefined) window.clearTimeout(routeRetry);
      if (stopsRetry !== undefined) window.clearTimeout(stopsRetry);
    };
  }, [selectedCity]);

  function findMyLocation() {
    setLocationMessage('');
    if (!navigator.geolocation) {
      setLocationMessage('Ovaj uređaj ne može pronaći lokaciju.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const location: [number, number] = [coords.latitude, coords.longitude];
      setUserLocation(location);
      setSelectedStop(null);
      setNearestDistance(null);
      setMapCenter(location);
      setMapZoom(17);
      setLocating(false);
    }, error => {
      setLocating(false);
      setLocationMessage(error.code === error.PERMISSION_DENIED ? 'Lokacija nije dopuštena. Možete je uključiti u postavkama uređaja.' : 'Lokacija trenutačno nije dostupna. Pokušajte ponovno.');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  function findNearestStop() {
    setLocationMessage('');
    if (!navigator.geolocation) {
      setLocationMessage('Ovaj uređaj ne može pronaći lokaciju.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const validStops = stops.filter(stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lon) && Math.abs(stop.lat) <= 90 && Math.abs(stop.lon) <= 180);
      if (!validStops.length) {
        setLocationMessage('Stanice trenutačno nisu dostupne.');
        setLocating(false);
        return;
      }
      const radians = (degrees: number) => degrees * Math.PI / 180;
      const distance = (stop: Stop) => {
        const dLat = radians(stop.lat - coords.latitude);
        const dLon = radians(stop.lon - coords.longitude);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(coords.latitude)) * Math.cos(radians(stop.lat)) * Math.sin(dLon / 2) ** 2;
        return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };
      const nearest = validStops.reduce((best, stop) => distance(stop) < distance(best) ? stop : best);
      const meters = Math.round(distance(nearest));
      setUserLocation([coords.latitude, coords.longitude]);
      setNearestDistance(meters);
      setSelectedStop(nearest);
      setShowStops(true);
      setMapCenter([nearest.lat, nearest.lon]);
      setMapZoom(15);
      setLocationMessage(`Najbliža stanica je ${meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`} od vas.`);
      setLocating(false);
    }, error => {
      setLocating(false);
      setLocationMessage(error.code === error.PERMISSION_DENIED ? 'Lokacija nije dopuštena. Možete je uključiti u postavkama uređaja.' : 'Lokacija trenutačno nije dostupna. Pokušajte ponovno.');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  useEffect(() => {
    let filtered = vehicles;

    if (selectedType !== 'all') {
      filtered = filtered.filter(v => v.type === selectedType);
    }

    if (selectedLine) {
      filtered = filtered.filter(v => v.line === selectedLine);
    }

    setFilteredVehicles(filtered);
  }, [vehicles, selectedType, selectedLine]);

  if (loading || authStatusLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#f3f7f6]">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#102638] text-[#a9f0d1] shadow-lg">
            <svg className="h-7 w-7 animate-pulse" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.75h10A2.25 2.25 0 0 1 19.25 6v9A2.25 2.25 0 0 1 17 17.25H7A2.25 2.25 0 0 1 4.75 15V6A2.25 2.25 0 0 1 7 3.75Z" stroke="currentColor" strokeWidth="1.8"/><path d="M7.5 7h9v5h-9zM8 20l2-2.75m6 2.75L14 17.25" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>
          </div>
          <div className="text-sm font-medium text-slate-600">Učitavam kartu…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#f3f7f6] p-4">
        <div className="max-w-md rounded-3xl border border-rose-100 bg-white p-8 text-center shadow-xl shadow-slate-900/5">
          <div className="mb-2 text-xl font-bold text-slate-900">Nešto nije učitano</div>
          <div className="text-sm leading-6 text-slate-600">{error}</div>
        </div>
      </div>
    );
  }

  if (!selectedCity) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#f3f7f6]">
        <div className="rounded-2xl bg-white px-6 py-5 text-sm font-medium text-slate-600 shadow">Trenutno nema dostupnih gradova.</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <Header
        vehicleCount={filteredVehicles.length}
        totalVehicles={vehicles.length}
        dataStatus={dataStatus}
        onAuthClick={() => setShowAuthModal(true)}
        loginEnabled={authStatus.loginEnabled}
        registrationEnabled={authStatus.registrationEnabled}
      />

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="hidden w-80 shrink-0 overflow-y-auto border-r border-slate-200/80 bg-[#f3f7f6] p-4 md:block lg:w-[352px] lg:p-5">
          <FilterPanel
            vehicles={vehicles}
            routes={routes}
            selectedType={selectedType}
            selectedLine={selectedLine}
            onTypeChange={(type) => {
              setSelectedType(type);
              setSelectedLine('');
            }}
            onLineChange={setSelectedLine}
          />

          <div className="mt-4 space-y-2.5">
            <button onClick={findMyLocation} disabled={locating} className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 text-left font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md disabled:opacity-60">
              {locating ? 'Tražim lokaciju…' : 'Moja lokacija'}
              <span className="mt-1 block text-xs font-normal text-slate-500">Prikaži me na karti</span>
            </button>
            <button onClick={findNearestStop} disabled={locating} className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 text-left font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md disabled:opacity-60">
              {locating ? 'Tražim…' : 'Moja najbliža stanica'}
              <span className="mt-1 block text-xs font-normal text-slate-500">Prikaži stanicu i udaljenost</span>
            </button>
            <button
              onClick={() => setShowSchedule(true)}
              className="w-full rounded-2xl bg-[#102638] px-4 py-3.5 font-semibold text-white shadow-md shadow-slate-900/10 transition hover:bg-[#183a4d]"
            >
              Linije i polasci
            </button>

            <button
              onClick={() => setShowStops(!showStops)}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                showStops
                  ? 'bg-teal-700 text-white shadow-sm hover:bg-teal-800'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {showStops ? '✓ Sakrij stanice' : '🚏 Prikaži stanice'}
            </button>

            <button
              onClick={() => setShowShapes(!showShapes)}
              className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${showShapes ? 'border-indigo-700 bg-indigo-700 text-white hover:bg-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              {showShapes ? '✓ Sakrij trase linija' : 'Prikaži trase linija'}
            </button>
          </div>
          {locationMessage && <p className="mt-2 text-sm text-slate-600" role="status">{locationMessage}</p>}

          {selectedCity.status === 'unavailable' && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-5 text-amber-900">
              <strong>Grad trenutno nije podržan.</strong><br />
              Podaci za {selectedCity.name} još nisu dostupni.
            </div>
          )}

          {dataStatus === 'live' && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-5 text-emerald-900">
              <strong>✓ Podaci uživo</strong><br />
              Prikazuju se lokacije koje šalje ZET.
            </div>
          )}

          {dataStatus === 'unavailable' && selectedCity.id === 'zagreb' && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-5 text-rose-900">
              <strong>Lokacije trenutačno nisu dostupne</strong><br />
              Pokušajte ponovno malo kasnije.
            </div>
          )}
        </div>

        <div className="flex-1 relative">
          <div className="absolute top-3 left-3 right-3 z-[999] grid grid-cols-3 gap-2 md:hidden">
            <button onClick={findMyLocation} disabled={locating} className="min-w-0 rounded-xl bg-white px-2 py-3 text-center text-xs font-semibold text-slate-800 shadow-lg disabled:opacity-60" aria-label="Moja lokacija">
              {locating ? 'Tražim…' : 'Moja lokacija'}
            </button>
            <button onClick={findNearestStop} disabled={locating} className="min-w-0 rounded-xl bg-white px-2 py-3 text-center text-xs font-semibold text-slate-800 shadow-lg disabled:opacity-60" aria-label="Moja najbliža stanica">
              {locating ? 'Tražim…' : 'Najbliža stanica'}
            </button>
            <button onClick={() => setShowSchedule(true)} className="min-w-0 rounded-xl bg-slate-900 px-2 py-3 text-center text-xs font-semibold text-white shadow-lg">
              Linije i polasci
            </button>
          </div>
          <div className="absolute top-20 left-3 right-3 z-[999] md:hidden">
            <FilterPanel
              compact
              vehicles={vehicles}
              routes={routes}
              selectedType={selectedType}
              selectedLine={selectedLine}
              onTypeChange={(type) => {
                setSelectedType(type);
                setSelectedLine('');
              }}
              onLineChange={setSelectedLine}
            />
          </div>
          {locationMessage && <div className="absolute top-40 left-3 right-3 z-[999] rounded-lg bg-white/95 p-3 text-sm text-slate-700 shadow md:hidden" role="status">{locationMessage}</div>}
          {selectedCity.status === 'active' ? (
            <MapView
              vehicles={filteredVehicles}
              stops={showStops ? stops : []}
              shapes={shapes}
              center={mapCenter}
              zoom={mapZoom}
              userLocation={userLocation}
              showStops={showStops}
              showShapes={showShapes}
              onVehicleClick={setSelectedVehicle}
              onStopClick={(stop) => {
                setNearestDistance(null);
                setSelectedStop(stop);
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100">
              <div className="text-center max-w-md p-8">
                <div className="text-2xl font-bold text-gray-800 mb-2">
                  {selectedCity.name}
                </div>
                <div className="text-gray-600 mb-4">
                  Podaci uživo trenutno nisu dostupni za ovaj grad.
                </div>
                <div className="text-sm text-gray-500">
                  Uskoro ćemo dodati podršku za više gradova.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedVehicle && (
        <VehicleCard
          vehicle={selectedVehicle}
          onClose={() => setSelectedVehicle(null)}
          onViewProfile={() => {
            // Profil vozila - za sada samo zatvori
            setSelectedVehicle(null);
          }}
        />
      )}

      {selectedStop && (
        <div className="fixed bottom-0 left-0 right-0 z-[1000] max-h-[50vh] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-[0_-12px_40px_rgba(15,35,50,0.18)] md:bottom-4 md:left-auto md:right-4 md:w-96 md:rounded-3xl">
          <div className="p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-xl font-bold text-primary">{selectedStop.name}</div>
                <div className="mt-1 text-sm text-gray-500">Stanica autobusa ili tramvaja{nearestDistance !== null ? ` · ${nearestDistance < 1000 ? `${nearestDistance} m od vas` : `${(nearestDistance / 1000).toFixed(1)} km od vas`}` : ''}</div>
                {selectedStop.code && (
                  <div className="text-sm text-gray-500">Kod: {selectedStop.code}</div>
                )}
              </div>
              <button
                onClick={() => setSelectedStop(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <button
              onClick={() => {
                setShowSchedule(true);
              }}
              className="w-full bg-primary text-white py-2 rounded-lg hover:bg-blue-700"
            >
              Pogledaj polaske
            </button>
          </div>
        </div>
      )}

      {showSchedule && (
        <SchedulePanel
          cityId={selectedCity.id}
          initialStopId={selectedStop?.id}
          onClose={() => setShowSchedule(false)}
          onRequireLogin={() => setShowAuthModal(true)}
        />
      )}

      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} loginEnabled={authStatus.loginEnabled} registrationEnabled={authStatus.registrationEnabled} />
      )}
    </div>
  );
}

export default App;
