import { t } from './services/i18n';
import { useState, useEffect } from 'react';
import MapView from './components/MapView';
import SiteAnnouncement from './components/SiteAnnouncement';
import Header from './components/Header';
import LanguageSelect from './components/LanguageSelect';
import FilterPanel from './components/FilterPanel';
import VehicleSearch from './components/VehicleSearch';
import VehicleCard from './components/VehicleCard';
import VehicleProfileModal from './components/VehicleProfileModal';
import SchedulePanel from './components/SchedulePanel';
import AuthModal from './components/Auth/AuthModal';
import { api, AuthStatus } from './api';
import { useAuth } from './contexts/AuthContext';
import { Vehicle, City, Route, Stop, TransitShape } from './types';
import CookieNotice from './components/CookieNotice';
import { readStoredStringList } from './services/localPreferences';
import { applyTheme, readTheme } from './services/theme';
import { getDevicePosition } from './services/deviceLocation';
import { isNativeApp } from './services/platform';
import { alertsAllowed, showAlert } from './services/alerts';
import InstallAppButton from './components/InstallAppButton';
import InstallAppPrompt from './components/InstallAppPrompt';
import TransitLoadingAnimation from './components/TransitLoadingAnimation';

function App() {
  const { user } = useAuth();
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [shapes, setShapes] = useState<TransitShape[]>([]);
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [profileVehicle, setProfileVehicle] = useState<Vehicle | null>(null);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showVehicleSearch, setShowVehicleSearch] = useState(false);
  const [showMapMenu, setShowMapMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(() => readTheme() === 'dark');
  const [loading, setLoading] = useState(true);
  const [transitDataLoading, setTransitDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState(false);
  const [dataStatus, setDataStatus] = useState<'demo' | 'live' | 'unavailable'>('demo');
  const [showStops, setShowStops] = useState(false);
  const [showShapes, setShowShapes] = useState(false);
  const [showSelectedRoute, setShowSelectedRoute] = useState(() => localStorage.getItem('transit-show-selected-route') !== '0');
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [showBikes, setShowBikes] = useState(() => localStorage.getItem('transit-show-bikes') === '1');
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
    if (['/verify-email', '/reset-password'].includes(window.location.pathname)) setShowAuthModal(true);
  }, []);

  useEffect(() => { applyTheme(darkMode ? 'dark' : 'light'); }, [darkMode]);

  const [selectedType, setSelectedType] = useState<'all' | 'bus' | 'tram'>('all');
  const [selectedLine, setSelectedLine] = useState<string>('');

  useEffect(() => {
    const checkTrackedDepartures = () => {
      if (isNativeApp()) return;
      if (!alertsAllowed()) return;
      if (!user) return;
      const tracked = readStoredStringList(`transit-atlas-tracked:${user.id}`);
      const now = new Date();
      for (const item of tracked) {
        // Keys end with HH:MM and the departure epoch in ms (cityId:stopId:tripId:HH:MM:timestamp); older keys may carry seconds.
        const match = item.match(/:(\d{2}):(\d{2})(?::\d{2})?(?::(\d{10,13}))?$/);
        if (!match) continue;
        const time = `${match[1]}:${match[2]}`;
        const scheduledTimestamp = Number(match[3]);
        const departure = Number.isFinite(scheduledTimestamp) && scheduledTimestamp > 0
          ? new Date(scheduledTimestamp)
          : new Date(now);
        if (!scheduledTimestamp) {
          departure.setHours(Number(match[1]), Number(match[2]), 0, 0);
        }
        const mins = Math.round((departure.getTime() - now.getTime()) / 60000);
        const moment = mins <= 10 && mins >= 0 ? 'soon' : mins < 0 && mins >= -1 ? 'now' : '';
        const key = `transit-notified:${now.toDateString()}:${item}:${moment}`;
        if (moment && !sessionStorage.getItem(key)) {
          showAlert(moment === 'soon' ? t("Polazak za 10 minuta") : t("Vrijeme polaska"), t("Praćeni polazak je u {0}. Otvorite Transitly za stanje.", time.slice(0, 5)), item);
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
        else setTransitDataLoading(false);
      })
      .catch(() => { setError(t("Nije moguće učitati popis gradova")); setTransitDataLoading(false); })
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
      setTransitDataLoading(false);
      return;
    }

    setShowStops(selectedCity.id !== 'zagreb');
    setShowShapes(false);

    // Učitaj vozila
    setTransitDataLoading(true);
    api.getVehicles(selectedCity.id)
      .then(response => {
        if (cancelled) return;
        setVehicles(response.vehicles);
        setDataStatus(response.status);
        setMaintenance(Boolean(response.maintenance));
      })
      .catch(() => {
        if (cancelled) return;
        setError(t("Nije moguće učitati podatke o vozilima"));
        setVehicles([]);
      })
      .finally(() => { if (!cancelled) setTransitDataLoading(false); });

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
            if (cancelled) return;
            setVehicles(response.vehicles);
            setDataStatus(response.status);
            setMaintenance(Boolean(response.maintenance));
            if (response.maintenance) { setSelectedVehicle(null); setProfileVehicle(null); }
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
    setLocating(true);
    getDevicePosition(({ coords }) => {
      const location: [number, number] = [coords.latitude, coords.longitude];
      setUserLocation(location);
      setSelectedStop(null);
      setNearestDistance(null);
      setMapCenter(location);
      setMapZoom(17);
      setLocating(false);
    }, error => {
      setLocating(false);
      setLocationMessage(error.code === error.PERMISSION_DENIED ? t("Lokacija nije dopuštena. Možete je uključiti u postavkama uređaja.") : t("Lokacija trenutačno nije dostupna. Pokušajte ponovno."));
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  function findNearestStop() {
    setLocationMessage('');
    setLocating(true);
    getDevicePosition(({ coords }) => {
      const validStops = stops.filter(stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lon) && Math.abs(stop.lat) <= 90 && Math.abs(stop.lon) <= 180);
      if (!validStops.length) {
        setLocationMessage(t("Stanice trenutačno nisu dostupne."));
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
      setLocationMessage(t("Najbliža stanica je {0} od vas.", meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`));
      setLocating(false);
    }, error => {
      setLocating(false);
      setLocationMessage(error.code === error.PERMISSION_DENIED ? t("Lokacija nije dopuštena. Možete je uključiti u postavkama uređaja.") : t("Lokacija trenutačno nije dostupna. Pokušajte ponovno."));
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

  const selectedTripId = selectedVehicle?.tripId ?? null;
  useEffect(() => {
    if (!selectedCity || !selectedTripId || !showSelectedRoute) { setTripStops([]); return; }
    const controller = new AbortController();
    api.getTripStops(selectedCity.id, selectedTripId, controller.signal)
      .then(response => setTripStops(response.stops.map(stop => ({ ...stop, cityId: selectedCity.id }))))
      .catch(() => { if (!controller.signal.aborted) setTripStops([]); });
    return () => controller.abort();
  }, [selectedCity, selectedTripId, showSelectedRoute]);

  if (loading || authStatusLoading || transitDataLoading) {
    return (
      <div className="transit-loader-page"><TransitLoadingAnimation mode="tram" label={t("Učitavam ZET i Transitly podatke…")} /></div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#f3f7f6] p-4">
        <div className="max-w-md rounded-3xl border border-rose-100 bg-white p-8 text-center shadow-xl shadow-slate-900/5">
          <div className="mb-2 text-xl font-bold text-slate-900">{t("Nešto nije učitano")}</div>
          <div className="text-sm leading-6 text-slate-600">{error}</div>
        </div>
      </div>
    );
  }

  const selectedRouteId = selectedVehicle
    ? selectedVehicle.routeId ?? routes.find(route => route.shortName === selectedVehicle.line)?.id ?? null
    : null;

  if (!selectedCity) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#f3f7f6]">
        <div className="rounded-2xl bg-white px-6 py-5 text-sm font-medium text-slate-600 shadow">{t("Trenutno nema dostupnih gradova.")}</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <SiteAnnouncement line={selectedVehicle?.line || selectedLine} />
      {maintenance && <p className="shrink-0 bg-amber-100 px-3 py-2 text-sm text-amber-950">{t("Lokacije vozila privremeno su skrivene.")}</p>}
      <Header
        vehicleCount={filteredVehicles.length}
        totalVehicles={vehicles.length}
        dataStatus={dataStatus}
        onAuthClick={() => setShowAuthModal(true)}
        loginEnabled={authStatus.loginEnabled}
        registrationEnabled={authStatus.registrationEnabled}
        menuOpen={showMapMenu}
        onMenuToggle={() => { setShowMapMenu(!showMapMenu); setShowVehicleSearch(false); }}
        searchOpen={showVehicleSearch}
        onSearchToggle={() => { setShowVehicleSearch(!showVehicleSearch); setShowMapMenu(false); }}
        searchContent={<VehicleSearch vehicles={vehicles} onClose={() => setShowVehicleSearch(false)} onSelect={vehicle => {
          setShowVehicleSearch(false);
          setSelectedType('all');
          setSelectedLine('');
          setSelectedStop(null);
          setProfileVehicle(null);
          setMapCenter([vehicle.lat, vehicle.lon]);
          setMapZoom(16);
          setSelectedVehicle(vehicle);
        }} />}
        menuContent={<>
          <LanguageSelect />
          <button type="button" aria-pressed={darkMode} onClick={() => setDarkMode(enabled => !enabled)} className="mb-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm">{darkMode ? t("☀️ Svijetli način rada") : t("🌙 Tamni način rada")}</button>
          <details className="mb-2 rounded-xl border border-slate-200 bg-white p-2">
            <summary className="cursor-pointer rounded-lg px-2 py-2 text-sm font-semibold">{t("Postavke karte")}</summary>
            <div className="grid grid-cols-1 gap-2 pt-2">
            <button onClick={() => { findMyLocation(); setShowMapMenu(false); }} disabled={locating} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm disabled:opacity-60">{locating ? t("Tražim lokaciju…") : t("Moja lokacija")}</button>
            <button onClick={() => { findNearestStop(); setShowMapMenu(false); }} disabled={locating} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm disabled:opacity-60">{locating ? t("Tražim…") : t("Moja najbliža stanica")}</button>
            <button onClick={() => setShowStops(!showStops)} aria-pressed={showStops} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm">{showStops ? t("✓ Sakrij stanice") : t("Prikaži stanice")}</button>
            <button onClick={() => setShowShapes(!showShapes)} aria-pressed={showShapes} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm">{showShapes ? t("✓ Sakrij trase linija") : t("Prikaži trase linija")}</button>
            <button onClick={() => { const next = !showSelectedRoute; setShowSelectedRoute(next); localStorage.setItem('transit-show-selected-route', next ? '1' : '0'); }} aria-pressed={showSelectedRoute} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm">{showSelectedRoute ? t("✓ Isključi trasu odabrane linije") : t("Prikaži trasu odabrane linije")}</button>
            <button onClick={() => { const next = !showBikes; setShowBikes(next); localStorage.setItem('transit-show-bikes', next ? '1' : '0'); }} aria-pressed={showBikes} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm">{showBikes ? t("✓ Sakrij javne bicikle") : t("Prikaži javne bicikle")}</button>
            </div>
          </details>
          {locationMessage && <p className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-700" role="status">{locationMessage}</p>}
          {selectedCity.status === 'unavailable' && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t("Podaci za") + " "}{selectedCity.name}{" " + t("još nisu dostupni.")}</p>}
          <div className="mt-3 border-t border-slate-200 pt-2"><InstallAppButton /></div>
          <nav aria-label={t("Pomoć")} className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-2 text-sm font-semibold">
            <a className="rounded-lg px-2 py-2 hover:bg-white" href="/status">{t("Stanje usluga")}</a>
            <a className="rounded-lg px-2 py-2 hover:bg-white" href="/feedback">{t("Prijavi grešku")}</a>
          </nav>
          <nav aria-label={t("Pravne informacije")} className="mt-2 grid grid-cols-2 gap-2 px-2 text-xs text-slate-600">
            <a href="/privacy">{t("Politika privatnosti")}</a>
            <a href="/terms">{t("Uvjeti korištenja")}</a>
            <a href="/cookies">{t("Politika kolačića")}</a>
            <a href="/about/">{t("O Transitlyju")}</a>
            <a href="mailto:info@transitly.eu">{t("Kontakt")}</a>
          </nav>
        </>}
      />

      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-r border-slate-200/80 bg-[#f3f7f6] p-4 lg:w-[352px] lg:p-5 md:block">
          <FilterPanel vehicles={vehicles} routes={routes} selectedType={selectedType} selectedLine={selectedLine} onTypeChange={(type) => { setSelectedType(type); setSelectedLine(''); }} onLineChange={setSelectedLine} />
        </aside>
        <div className="relative min-h-0 flex-1">
          <div className="absolute left-14 right-3 top-2 z-[999] md:hidden">
            <FilterPanel compact vehicles={vehicles} routes={routes} selectedType={selectedType} selectedLine={selectedLine} onTypeChange={(type) => { setSelectedType(type); setSelectedLine(''); }} onLineChange={setSelectedLine} />
          </div>
        {selectedCity.status === 'active' ? <MapView vehicles={filteredVehicles} stops={showStops ? stops : []} shapes={shapes} center={mapCenter} zoom={mapZoom} userLocation={userLocation} showStops={showStops} showShapes={showShapes} selectedRouteId={showSelectedRoute ? selectedRouteId : null} routeStops={showSelectedRoute ? tripStops : []} showBikes={showBikes} onVehicleClick={setSelectedVehicle} onStopClick={(stop) => { setNearestDistance(null); setSelectedStop(stop); }} /> : <div className="flex h-full w-full items-center justify-center bg-gray-100"><div className="max-w-md p-8 text-center"><div className="mb-2 text-2xl font-bold text-gray-800">{selectedCity.name}</div><div className="mb-4 text-gray-600">{t("Podaci uživo trenutno nisu dostupni za ovaj grad.")}</div><div className="text-sm text-gray-500">{t("Uskoro ćemo dodati podršku za više gradova.")}</div></div></div>}
        </div>
      </div>
      {selectedVehicle && (
        <VehicleCard
          key={`${selectedVehicle.id}:${selectedVehicle.tripId ?? ''}`}
          vehicle={vehicles.find(vehicle => vehicle.id === selectedVehicle.id && vehicle.tripId === selectedVehicle.tripId) ?? selectedVehicle}
          onRequireLogin={authStatus.loginEnabled ? () => setShowAuthModal(true) : undefined}
          onClose={() => setSelectedVehicle(null)}
          onViewProfile={() => {
            setProfileVehicle(selectedVehicle);
            setSelectedVehicle(null);
          }}
        />
      )}
      {profileVehicle && (
        <VehicleProfileModal key={profileVehicle.id} vehicle={profileVehicle} onClose={() => setProfileVehicle(null)} />
      )}

      {selectedStop && (
        <div className="fixed bottom-0 left-0 right-0 z-[1000] max-h-[50vh] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-[0_-12px_40px_rgba(15,35,50,0.18)] md:bottom-4 md:left-auto md:right-4 md:w-96 md:rounded-3xl">
          <div className="p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-xl font-bold text-primary">{selectedStop.name}</div>
                <div className="mt-1 text-sm text-gray-500">{t("Stanica autobusa ili tramvaja")}{nearestDistance !== null ? ` · ${nearestDistance < 1000 ? `${nearestDistance} m od vas` : `${(nearestDistance / 1000).toFixed(1)} km od vas`}` : ''}</div>
                {selectedStop.code && (
                  <div className="text-sm text-gray-500">{t("Kod:") + " "}{selectedStop.code}</div>
                )}
              </div>
              <button
                onClick={() => setSelectedStop(null)}
                className="text-gray-600 hover:text-gray-600 transition-colors"
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
            >{t("Pogledaj polaske")}</button>
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
      <CookieNotice />
      <InstallAppPrompt />
    </div>
  );
}

export default App;
