import { useState, useEffect } from 'react';
import { Route, Stop, Departure } from '../types';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';

interface SchedulePanelProps {
  cityId: string;
  initialStopId?: string;
  onClose: () => void;
  onRequireLogin: () => void;
}

export default function SchedulePanel({ cityId, initialStopId, onClose, onRequireLogin }: SchedulePanelProps) {
  const { user } = useAuth();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string>('');
  const [selectedStop, setSelectedStop] = useState(initialStopId || '');
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [departuresLoading, setDeparturesLoading] = useState(false);
  const [departuresError, setDeparturesError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'route' | 'stop'>(initialStopId ? 'stop' : 'route');
  const [tracked, setTracked] = useState<string[]>([]);
  const [favoriteRoutes, setFavoriteRoutes] = useState<string[]>([]);
  const [favoriteStops, setFavoriteStops] = useState<string[]>([]);
  const [departureMessage, setDepartureMessage] = useState('');

  useEffect(() => {
    setTracked(user ? JSON.parse(localStorage.getItem(`transit-atlas-tracked:${user.id}`) || '[]') : []);
    setFavoriteRoutes(user ? JSON.parse(localStorage.getItem(`transit-atlas-favorite-routes:${user.id}`) || '[]') : []);
    setFavoriteStops(user ? JSON.parse(localStorage.getItem(`transit-atlas-favorite-stops:${user.id}`) || '[]') : []);
  }, [user]);

  useEffect(() => {
    Promise.all([
      api.getRoutes(cityId),
      api.getStops(cityId)
    ]).then(([routesRes, stopsRes]) => {
      setRoutes(routesRes.routes);
      setStops(stopsRes.stops);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [cityId]);

  useEffect(() => {
    if (selectedStop) {
      let cancelled = false;
      setDepartures([]);
      setDeparturesLoading(true);
      setDeparturesError(false);

      api.getStopDepartures(cityId, selectedStop)
        .then(res => {
          if (!cancelled) { setDepartures(res.departures); setDepartureMessage(res.message || ''); }
        })
        .catch(() => {
          if (!cancelled) setDeparturesError(true);
        })
        .finally(() => {
          if (!cancelled) setDeparturesLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }
  }, [selectedStop, cityId]);

  function toggleTrack(dep: Departure) {
    if (!user) { onRequireLogin(); return; }
    const key = `${cityId}:${selectedStop}:${dep.tripId}:${dep.time}`;
    const next = tracked.includes(key) ? tracked.filter(item => item !== key) : [...tracked, key];
    setTracked(next);
    localStorage.setItem(`transit-atlas-tracked:${user.id}`, JSON.stringify(next));
  }

  function toggleFavorite(id: string, kind: 'route' | 'stop') {
    if (!user) { onRequireLogin(); return; }
    const favorites = kind === 'route' ? favoriteRoutes : favoriteStops;
    const next = favorites.includes(id) ? favorites.filter(item => item !== id) : [...favorites, id];
    if (kind === 'route') setFavoriteRoutes(next);
    else setFavoriteStops(next);
    localStorage.setItem(`transit-atlas-favorite-${kind === 'route' ? 'routes' : 'stops'}:${user.id}`, JSON.stringify(next));
  }

  async function enableNotifications() {
    if (!user) { onRequireLogin(); return; }
    if (!('Notification' in window)) { setDepartureMessage('Ovaj preglednik ne podržava obavijesti.'); return; }
    const permission = await Notification.requestPermission();
    setDepartureMessage(permission === 'granted' ? 'Obavijesti su uključene dok je aplikacija otvorena.' : 'Dozvola za obavijesti nije odobrena.');
  }

  const filteredRoutes = routes.filter(route =>
    String(route.shortName ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(route.longName ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredStops = stops.filter(stop =>
    String(stop.name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (stop.code != null && String(stop.code).toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white z-[1500] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <div className="text-gray-600">Učitavamo linije i polaske…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white z-[1500] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 text-white p-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Linije i polasci</h2>
        <button
          onClick={onClose}
          className="text-white hover:text-gray-300 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('route')}
          className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${
            activeTab === 'route'
              ? 'border-b-2 border-primary text-primary'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Linije
        </button>
        <button
          onClick={() => setActiveTab('stop')}
          className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${
            activeTab === 'stop'
              ? 'border-b-2 border-primary text-primary'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Stanice
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder={activeTab === 'route' ? 'Pretraži linije...' : 'Pretraži stanice...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {activeTab === 'stop' && selectedStop && (
          <div className="mb-6 bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-3">
              Sljedeći polasci{stops.find(stop => stop.id === selectedStop)?.name
                ? ` — ${stops.find(stop => stop.id === selectedStop)?.name}`
                : ''}
            </h3>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-gray-500">{departureMessage || (!user ? 'Prijavite se za praćenje polazaka i podsjetnike.' : '')}</span><button onClick={enableNotifications} className="text-sm text-primary underline">{user ? 'Uključi obavijesti' : 'Prijavi se za obavijesti'}</button></div>
            {departuresLoading ? (
              <div className="text-center text-gray-500 py-4">Učitavanje polazaka...</div>
            ) : departuresError ? (
              <div className="text-center text-red-600 py-4">Nije moguće učitati polaske. Pokušajte ponovno.</div>
            ) : departures.length === 0 ? (
              <div className="text-center text-gray-500 py-4">Nema dostupnih polazaka za ovu stanicu.</div>
            ) : (
              <div className="space-y-2">
                {departures.slice(0, 20).map((dep, idx) => (
                  <div key={`${dep.tripId}-${idx}`} className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                        {dep.route}
                      </div>
                      <div>
                        <div className="font-medium">{dep.direction}</div>
                        <div className="text-sm text-gray-500">{dep.time}</div>
                      </div>
                    </div>
                    <button onClick={() => toggleTrack(dep)} className={`text-xs px-3 py-2 rounded-lg ${tracked.includes(`${cityId}:${selectedStop}:${dep.tripId}:${dep.time}`) ? 'bg-green-100 text-green-800' : 'bg-blue-50 text-primary'}`}>{tracked.includes(`${cityId}:${selectedStop}:${dep.tripId}:${dep.time}`) ? 'Prati se' : user ? 'Prati polazak' : 'Prijavi se za praćenje'}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'route' && (
          <div className="space-y-2">
            {user && favoriteRoutes.length > 0 && (
              <div className="mb-4 rounded-lg bg-amber-50 p-3">
                <h3 className="mb-2 text-sm font-semibold text-amber-900">Omiljene linije</h3>
                <div className="flex flex-wrap gap-2">
                  {routes.filter(route => favoriteRoutes.includes(route.id)).map(route => (
                    <button key={route.id} onClick={() => setSelectedRoute(route.id)} className="rounded-full bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm hover:bg-amber-100">
                      {route.shortName} · {route.longName}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {filteredRoutes.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                Nema rezultata pretrage
              </div>
            ) : (
              filteredRoutes.map(route => (
                <div key={route.id} className={`flex items-center gap-2 rounded-lg border-2 p-2 transition-colors ${
                    selectedRoute === route.id
                      ? 'border-primary bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <button
                    onClick={() => setSelectedRoute(route.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left"
                  >
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
                      route.type === 'bus' ? 'bg-blue-600' : 'bg-red-600'
                    }`}>
                      {route.shortName}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{route.longName}</div>
                      <div className="text-sm text-gray-500">
                        {route.type === 'bus' ? 'Autobus' : 'Tramvaj'}
                      </div>
                    </div>
                  </button>
                  <button onClick={() => toggleFavorite(route.id, 'route')} aria-label={`${favoriteRoutes.includes(route.id) ? 'Ukloni iz' : 'Dodaj u'} omiljene linije`} title={user ? 'Omiljena linija' : 'Prijavite se za spremanje omiljenih linija'} className="rounded-lg px-3 py-2 text-xl text-amber-500 hover:bg-amber-50">
                    {favoriteRoutes.includes(route.id) ? '★' : '☆'}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'stop' && (
          <div className="space-y-2">
            {user && favoriteStops.length > 0 && (
              <div className="mb-4 rounded-lg bg-amber-50 p-3">
                <h3 className="mb-2 text-sm font-semibold text-amber-900">Omiljene stanice</h3>
                <div className="flex flex-wrap gap-2">
                  {stops.filter(stop => favoriteStops.includes(stop.id)).map(stop => (
                    <button key={stop.id} onClick={() => setSelectedStop(stop.id)} className="rounded-full bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm hover:bg-amber-100">
                      {stop.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {filteredStops.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                Nema rezultata pretrage
              </div>
            ) : (
              filteredStops.slice(0, 100).map(stop => (
                <div key={stop.id} className={`flex items-center gap-2 rounded-lg border-2 p-2 transition-colors ${
                    selectedStop === stop.id
                      ? 'border-primary bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <button onClick={() => setSelectedStop(stop.id)} className="min-w-0 flex-1 p-2 text-left">
                    <div className="font-medium">{stop.name}</div>
                    {stop.code && <div className="text-sm text-gray-500">Kod: {stop.code}</div>}
                    {stop.wheelchairAccessible && <div className="mt-1 text-xs text-green-600">♿ Pristupačno</div>}
                  </button>
                  <button onClick={() => toggleFavorite(stop.id, 'stop')} aria-label={`${favoriteStops.includes(stop.id) ? 'Ukloni iz' : 'Dodaj u'} omiljene stanice`} title={user ? 'Omiljena stanica' : 'Prijavite se za spremanje omiljenih stanica'} className="rounded-lg px-3 py-2 text-xl text-amber-500 hover:bg-amber-50">
                    {favoriteStops.includes(stop.id) ? '★' : '☆'}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
}
