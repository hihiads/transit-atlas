import { useState, useEffect } from 'react';
import { Route, Stop, Departure } from '../types';
import { api } from '../api';

interface SchedulePanelProps {
  cityId: string;
  initialStopId?: string;
  onClose: () => void;
}

export default function SchedulePanel({ cityId, initialStopId, onClose }: SchedulePanelProps) {
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
  const [tracked, setTracked] = useState<string[]>(() => JSON.parse(localStorage.getItem('transit-atlas-tracked') || '[]'));
  const [departureMessage, setDepartureMessage] = useState('');

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
    const key = `${cityId}:${selectedStop}:${dep.tripId}:${dep.time}`;
    const next = tracked.includes(key) ? tracked.filter(item => item !== key) : [...tracked, key];
    setTracked(next);
    localStorage.setItem('transit-atlas-tracked', JSON.stringify(next));
  }

  async function enableNotifications() {
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-gray-500">{departureMessage}</span><button onClick={enableNotifications} className="text-sm text-primary underline">Uključi obavijesti</button></div>
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
                    <button onClick={() => toggleTrack(dep)} className={`text-xs px-3 py-2 rounded-lg ${tracked.includes(`${cityId}:${selectedStop}:${dep.tripId}:${dep.time}`) ? 'bg-green-100 text-green-800' : 'bg-blue-50 text-primary'}`}>{tracked.includes(`${cityId}:${selectedStop}:${dep.tripId}:${dep.time}`) ? 'Prati se' : 'Prati polazak'}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'route' && (
          <div className="space-y-2">
            {filteredRoutes.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                Nema rezultata pretrage
              </div>
            ) : (
              filteredRoutes.map(route => (
                <button
                  key={route.id}
                  onClick={() => setSelectedRoute(route.id)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                    selectedRoute === route.id
                      ? 'border-primary bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
                      route.type === 'train' ? 'bg-emerald-700' : route.type === 'bus' ? 'bg-blue-600' : 'bg-red-600'
                    }`}>
                      {route.shortName}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{route.longName}</div>
                      <div className="text-sm text-gray-500">
                        {route.type === 'train' ? 'Vlak' : route.type === 'bus' ? 'Autobus' : 'Tramvaj'}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {activeTab === 'stop' && (
          <div className="space-y-2">
            {filteredStops.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                Nema rezultata pretrage
              </div>
            ) : (
              filteredStops.slice(0, 100).map(stop => (
                <button
                  key={stop.id}
                  onClick={() => setSelectedStop(stop.id)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                    selectedStop === stop.id
                      ? 'border-primary bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium">{stop.name}</div>
                  {stop.code && (
                    <div className="text-sm text-gray-500">Kod: {stop.code}</div>
                  )}
                  {stop.wheelchairAccessible && (
                    <div className="text-xs text-green-600 mt-1">♿ Pristupačno</div>
                  )}
                </button>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
}
