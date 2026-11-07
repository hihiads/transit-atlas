import { useState, useEffect } from 'react';
import MapView from './components/MapView';
import Header from './components/Header';
import FilterPanel from './components/FilterPanel';
import VehicleCard from './components/VehicleCard';
import SchedulePanel from './components/SchedulePanel';
import SchoolRoutePanel from './components/SchoolRoutePanel';
import AuthModal from './components/Auth/AuthModal';
import { api, AuthStatus } from './api';
import { Vehicle, City, Stop, TransitShape, SchoolRoutePlan } from './types';

function App() {
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [shapes, setShapes] = useState<TransitShape[]>([]);
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showSchoolRoute, setShowSchoolRoute] = useState(false);
  const [schoolPlan, setSchoolPlan] = useState<SchoolRoutePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<'demo' | 'live' | 'unavailable'>('demo');
  const [showStops, setShowStops] = useState(false);
  const [showShapes, setShowShapes] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [nearbyStops, setNearbyStops] = useState<Stop[]>([]);
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
      const tracked: string[] = JSON.parse(localStorage.getItem('transit-atlas-tracked') || '[]');
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
          new Notification(moment === 'soon' ? 'Polazak za 10 minuta' : 'Vrijeme polaska', { body: `Praćeni polazak je u ${time.slice(0, 5)}. Otvorite Transit Atlas za stanje.` });
          sessionStorage.setItem(key, '1');
        }
      }
    };
    checkTrackedDepartures();
    const interval = setInterval(checkTrackedDepartures, 30000);
    return () => clearInterval(interval);
  }, []);

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
    setNearbyStops([]);
    setSelectedStop(null);
    setNearestDistance(null);
    setLocationMessage('');
    let cancelled = false;

    if (selectedCity.status !== 'active') {
      setVehicles([]);
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

    // Učitaj stanice
    api.getStops(selectedCity.id)
      .then(response => {
        const cityStops = response.stops.map(stop => ({ ...stop, cityId: selectedCity.id }));
        if (cancelled) return;
        setStops(cityStops);
        setNearbyStops(cityStops);
      })
      .catch(() => {
        setStops([]);
      });

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

    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedCity]);

  function findNearestStop() {
    setLocationMessage('');
    if (!navigator.geolocation) {
      setLocationMessage('Ovaj uređaj ne može pronaći lokaciju.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const validStops = nearbyStops.filter(stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lon) && Math.abs(stop.lat) <= 90 && Math.abs(stop.lon) <= 180);
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
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <div className="text-gray-600">Učitavanje...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md p-8">
          <div className="text-red-600 text-xl font-semibold mb-2">Greška</div>
          <div className="text-gray-600">{error}</div>
        </div>
      </div>
    );
  }

  if (!selectedCity) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Nema dostupnih gradova</div>
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
        <div className="hidden md:block md:w-80 p-4 bg-gray-50 overflow-y-auto">
          <FilterPanel
            vehicles={vehicles}
            selectedType={selectedType}
            selectedLine={selectedLine}
            onTypeChange={(type) => {
              setSelectedType(type);
              setSelectedLine('');
            }}
            onLineChange={setSelectedLine}
          />

          <div className="mt-4 space-y-2">
            <button onClick={findNearestStop} disabled={locating || nearbyStops.length === 0} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60">
              {locating ? 'Tražim najbližu stanicu…' : 'Pronađi najbližu stanicu'}
              <span className="mt-0.5 block text-xs font-normal text-slate-500">Autobus ili tramvaj</span>
            </button>
            <button
              onClick={() => setShowSchoolRoute(true)}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-left font-medium text-white shadow-sm hover:bg-slate-800"
            >
              Do škole <span className="mt-0.5 block text-xs font-normal text-slate-300">Planiraj polazak ili pronađi najbržu rutu</span>
            </button>
            <button
              onClick={() => setShowSchedule(true)}
              className="w-full bg-primary text-white py-3 px-4 rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Linije i polasci
            </button>

            <button
              onClick={() => setShowStops(!showStops)}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                showStops
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              {showStops ? '✓ Sakrij stanice' : '🚏 Prikaži stanice'}
            </button>

            <button
              onClick={() => setShowShapes(!showShapes)}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${showShapes ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
            >
              {showShapes ? '✓ Sakrij trase linija' : 'Prikaži trase linija'}
            </button>
          </div>
          {locationMessage && <p className="mt-2 text-sm text-slate-600" role="status">{locationMessage}</p>}

          {selectedCity.status === 'unavailable' && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
              <strong>Grad trenutno nije podržan.</strong><br />
              Podaci za {selectedCity.name} još nisu dostupni.
            </div>
          )}

          {dataStatus === 'live' && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
              <strong>✓ Podaci uživo</strong><br />
              Prikazuju se lokacije koje šalje ZET.
            </div>
          )}

          {dataStatus === 'unavailable' && selectedCity.id === 'zagreb' && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
              <strong>Lokacije trenutačno nisu dostupne</strong><br />
              Pokušajte ponovno malo kasnije.
            </div>
          )}
        </div>

        <div className="flex-1 relative">
          <div className="absolute top-3 left-3 right-3 z-[999] flex items-start justify-between gap-2 md:hidden">
            <button onClick={findNearestStop} disabled={locating || nearbyStops.length === 0} className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-lg disabled:opacity-60" aria-label="Pronađi najbližu stanicu">
              {locating ? 'Tražim…' : 'Najbliža stanica'}
            </button>
            <button onClick={() => setShowSchoolRoute(true)} className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-lg">Do škole</button>
            <button onClick={() => setShowSchedule(true)} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">
              Linije i polasci
            </button>
          </div>
          <div className="absolute top-[4.25rem] left-3 right-3 z-[999] md:hidden">
            <FilterPanel
              compact
              vehicles={vehicles}
              selectedType={selectedType}
              selectedLine={selectedLine}
              onTypeChange={(type) => {
                setSelectedType(type);
                setSelectedLine('');
              }}
              onLineChange={setSelectedLine}
            />
          </div>
          {locationMessage && <div className="absolute top-28 left-3 right-3 z-[999] rounded-lg bg-white/95 p-3 text-sm text-slate-700 shadow md:hidden" role="status">{locationMessage}</div>}
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
                setSelectedStop(stop);
              }}
              schoolPlan={schoolPlan}
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
        <div className="fixed bottom-0 left-0 right-0 md:left-auto md:right-4 md:bottom-4 md:w-96 bg-white rounded-t-2xl md:rounded-2xl shadow-2xl z-[1000] max-h-[50vh] overflow-y-auto">
          <div className="p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-xl font-bold text-primary">{selectedStop.name}</div>
                <div className="mt-1 text-sm text-gray-500">Stanica autobusa ili tramvaja{nearestDistance !== null && selectedStop === nearbyStops.find(stop => stop.id === selectedStop.id) ? ` · ${nearestDistance < 1000 ? `${nearestDistance} m od vas` : `${(nearestDistance / 1000).toFixed(1)} km od vas`}` : ''}</div>
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
        />
      )}

      {showSchoolRoute && <SchoolRoutePanel onClose={() => setShowSchoolRoute(false)} onPlan={setSchoolPlan} />}

      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} loginEnabled={authStatus.loginEnabled} registrationEnabled={authStatus.registrationEnabled} />
      )}
    </div>
  );
}

export default App;
