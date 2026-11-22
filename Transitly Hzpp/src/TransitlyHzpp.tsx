import { useCallback, useEffect, useState, type ReactNode } from 'react';
import AuthModal from '../../src/components/Auth/AuthModal';
import { api, AuthStatus } from '../../src/api';
import { useAuth } from '../../src/contexts/AuthContext';

function Icon({ name, size = 16 }: { name: 'swap' | 'clock' | 'locate' | 'login' | 'logout' | 'pin' | 'train' | 'wifi'; size?: number }) {
  const paths: Record<string, ReactNode> = {
    swap: <path d="m8 3-4 4 4 4M4 7h16m-4 14 4-4-4-4m4 4H4" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    locate: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2" /></>,
    login: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    logout: <><path d="m14 17 5-5-5-5m5 5H9" /><path d="M12 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" /></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2" /></>,
    train: <><rect x="5" y="3" width="14" height="16" rx="3" /><path d="M8 7h8v5H8zm0 12-2 3m10-3 2 3M5 15h14" /></>,
    wifi: <><path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0m-5 3a2 2 0 0 1 2 0" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

type ApiStation = { id: number; name: string };
type GeoStation = { stop_id: string; stop_name: string; stop_lat: number; stop_lon: number };
type Station = ApiStation & { lat: number; lon: number };
type DelayInfo = { Delay?: number | null; Station?: string | null } | null;
type Journey = {
  DepartureDateTime: string;
  ArrivalDateTime: string;
  TransportationsWithDelay?: { TransportationWithDelay?: Array<{ Number?: string; Delay?: DelayInfo }> };
};

const HZPP = '/hzpp-api';
const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const DEFAULT_FROM = 'Trnava';
const DEFAULT_TO = 'Zagreb Glavni kol.';

function normalize(value: string) {
  return value.toLocaleLowerCase('hr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\bkol\.?(?=\s|$)/g, 'kolodvor').replace(/\s+/g, ' ').trim();
}

function time(value?: string) {
  if (!value) return '--:--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--:--' : new Intl.DateTimeFormat('hr-HR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function minutesUntil(value: string) {
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 60000));
}

export default function TransitlyHzpp() {
  const { user, logout } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [from, setFrom] = useState<Station | null>(null);
  const [to, setTo] = useState<Station | null>(null);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loadingStations, setLoadingStations] = useState(true);
  const [loadingJourneys, setLoadingJourneys] = useState(false);
  const [message, setMessage] = useState('');
  const [nearby, setNearby] = useState<Station | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showAuth, setShowAuth] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ loginEnabled: true, registrationEnabled: true, authenticationActive: true });

  useEffect(() => { api.getAuthStatus().then(setAuthStatus).catch(() => {}); }, []);

  const loadJourneys = useCallback(async (origin: Station, destination: Station, quiet = false) => {
    if (!quiet) setLoadingJourneys(true);
    try {
      const date = new Date();
      const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
      const localTime = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zagreb', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
      const params = new URLSearchParams({
        lang: 'hr', deviceType: 'WEB', clientUICOperatorCode: '1178', from: String(origin.id), to: String(destination.id),
        startTime: `${localDate}T${localTime}:00`, trainClass: '2', benefit: '1', countForBenefit: '1', transportChanges: 'DIRECT'
      });
      const response = await fetch(`${HZPP}/journeys-with-details/busInfo?${params}`);
      if (!response.ok) throw new Error('HŽPP trenutačno ne vraća podatke. Pokušaj ponovno.');
      const data = await response.json();
      const found: Journey[] = data?.JourneysTypesResponsev2?.JourneyWithTickets?.JourneysWithTicketsType ?? [];
      const upcoming = found.filter(item => new Date(item.DepartureDateTime).getTime() > Date.now())
        .sort((a, b) => new Date(a.DepartureDateTime).getTime() - new Date(b.DepartureDateTime).getTime());
      setJourneys(upcoming);
      setMessage(upcoming.length ? '' : 'Nema više vlakova za odabranu relaciju danas.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ne mogu učitati polaske.');
    } finally {
      if (!quiet) setLoadingJourneys(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`${HZPP}/stations?lang=hr&deviceType=WEB`).then(response => { if (!response.ok) throw new Error(); return response.json(); }),
      fetch(`${APP_BASE}/stations.json`).then(response => { if (!response.ok) throw new Error(); return response.json() as Promise<GeoStation[]>; })
    ]).then(([apiData, geoData]) => {
      if (!active) return;
      const geoByName = new Map<string, GeoStation>();
      for (const point of geoData) if (!geoByName.has(normalize(point.stop_name))) geoByName.set(normalize(point.stop_name), point);
      const mapped: Station[] = (apiData.response as ApiStation[]).flatMap(station => {
        const geo = geoByName.get(normalize(station.name));
        return geo ? [{ ...station, lat: geo.stop_lat, lon: geo.stop_lon }] : [];
      });
      setStations(mapped);
      const origin = mapped.find(station => normalize(station.name) === normalize(DEFAULT_FROM)) ?? null;
      const destination = mapped.find(station => normalize(station.name) === normalize(DEFAULT_TO)) ?? null;
      setFrom(origin);
      setTo(destination);
      setLoadingStations(false);
    }).catch(() => { if (active) { setLoadingStations(false); setMessage('Ne mogu učitati stanice. Provjeri vezu i osvježi stranicu.'); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    void loadJourneys(from, to);
    const refresh = window.setInterval(() => void loadJourneys(from, to, true), 30000);
    const clock = window.setInterval(() => setNow(Date.now()), 15000);
    return () => { window.clearInterval(refresh); window.clearInterval(clock); };
  }, [from, to, loadJourneys]);

  function useNearestStation() {
    if (!navigator.geolocation) { setMessage('Ovaj uređaj ne podržava lokaciju.'); return; }
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const nearest = stations.reduce<Station | null>((best, station) => {
        const distance = (station.lat - coords.latitude) ** 2 + (station.lon - coords.longitude) ** 2;
        if (!best) return station;
        return distance < (best.lat - coords.latitude) ** 2 + (best.lon - coords.longitude) ** 2 ? station : best;
      }, null);
      if (nearest) { setFrom(nearest); setNearby(nearest); }
      else setMessage('Nisam pronašao stanicu u blizini.');
      setLocationBusy(false);
    }, () => { setMessage('Lokacija nije dostupna. Dopusti pristup lokaciji pa pokušaj ponovno.'); setLocationBusy(false); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  function swapStations() { setFrom(to); setTo(from); }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-group"><a className="brand" href="/" aria-label="Transitly početna stranica"><span className="brand-icon"><Icon name="train" size={21} /></span><span>transitly<span className="brand-muted">.eu</span><small>HŽPP vlakovi</small></span></a><label className="sr-only" htmlFor="hzpp-provider">Odaberi prijevoznika</label><select id="hzpp-provider" aria-label="Odaberi prijevoznika" value="hzpp" onChange={event => { if (event.target.value === 'zet') window.location.assign('/'); }}><option value="zet">ZET</option><option value="hzpp">HŽPP</option></select></div>
      <div className="network-status"><span className="status-dot" /> HŽPP podaci <span className="status-divider">·</span> Zagreb i Hrvatska</div>
      <div className="top-actions">{user ? <><span className="user-email">{user.email}</span><button className="top-action account-button" onClick={() => void logout().catch(() => setMessage('Odjava trenutačno nije uspjela.'))} aria-label="Odjavi se"><span>Odjava</span><Icon name="logout" size={15} /></button></> : authStatus.loginEnabled && <button className="top-action account-button" onClick={() => setShowAuth(true)}><span>Prijava</span><Icon name="login" size={15} /></button>}<button className="top-action refresh-button" onClick={() => from && to && void loadJourneys(from, to)} aria-label="Osvježi polaske"><span>Osvježi</span><Icon name="wifi" size={16} /></button></div>
    </header>

    <div className="workspace">
      <aside className="side-panel">
        <div className="panel-heading"><div><span className="eyebrow">PUTOVANJE VLAKOM</span><h1>Gdje ideš?</h1></div><div className="round-icon"><Icon name="train" size={19} /></div></div>
        <div className="route-form">
          <label className="station-field"><span className="field-dot origin" /><span className="field-copy"><span>Polazna stanica</span><select aria-label="Polazna stanica" value={from?.id ?? ''} disabled={loadingStations} onChange={event => { setFrom(stations.find(station => station.id === Number(event.target.value)) ?? null); setNearby(null); }}><option value="">{loadingStations ? 'Učitavanje stanica…' : 'Odaberi stanicu'}</option>{stations.map(station => <option key={station.id} value={station.id}>{station.name}</option>)}</select></span></label>
          <button className="swap-button" onClick={swapStations} aria-label="Zamijeni stanice"><Icon name="swap" size={16} /></button>
          <label className="station-field"><span className="field-dot destination" /><span className="field-copy"><span>Odredišna stanica</span><select aria-label="Odredišna stanica" value={to?.id ?? ''} disabled={loadingStations} onChange={event => setTo(stations.find(station => station.id === Number(event.target.value)) ?? null)}><option value="">Odaberi stanicu</option>{stations.map(station => <option key={station.id} value={station.id}>{station.name}</option>)}</select></span></label>
        </div>
        <button className="nearest-button" onClick={useNearestStation} disabled={locationBusy || loadingStations}><Icon name="locate" size={17} />{locationBusy ? 'Tražim stanicu…' : 'Pronađi najbližu stanicu'}</button>
        {nearby && <div className="nearest-note"><Icon name="pin" size={14} /> Najbliža stanica: <strong>{nearby.name}</strong></div>}

        <div className="departures-head"><div><span className="eyebrow">DANAŠNJI POLASCI</span><h2>{from?.name ?? 'Odaberi polazište'}</h2></div><span className="count-pill">{journeys.length}</span></div>
        <div className="route-summary"><span>{from?.name || 'Polazak'}</span><i /><span>{to?.name || 'Dolazak'}</span></div>
        <div className="departure-list" aria-live="polite">
          {loadingJourneys && !journeys.length && <div className="empty-state"><span className="loader" />Tražim dostupne vlakove…</div>}
          {!loadingJourneys && !journeys.length && !message && <div className="empty-state">Odaberi polaznu i odredišnu stanicu.</div>}
          {message && !journeys.length && <div className="empty-state error-state">{message}</div>}
          {journeys.map((journey, index) => {
            const vehicle = journey.TransportationsWithDelay?.TransportationWithDelay?.[0];
            const delay = vehicle?.Delay?.Delay;
            const live = typeof delay === 'number' && delay > 0;
            const wait = minutesUntil(journey.DepartureDateTime);
            return <article className={`departure-card ${index === 0 ? 'next-card' : ''}`} key={`${vehicle?.Number}-${journey.DepartureDateTime}`}>
              <div className="departure-times"><strong>{time(journey.DepartureDateTime)}</strong><span className="duration-line" /><strong>{time(journey.ArrivalDateTime)}</strong></div>
              <div className="journey-meta"><span className="train-number"><Icon name="train" size={13} /> Vlak {vehicle?.Number || '—'}</span><span className={`trip-status ${live ? 'late' : ''}`}><i />{live ? `Kasni ${delay} min` : 'Po rasporedu'}</span></div>
              <div className="card-footer"><span><Icon name="clock" size={13} /> {wait === 0 ? 'Uskoro polazi' : `Za ${wait} min`}</span>{live && vehicle?.Delay?.Station && <span>Zadnja prijava: {vehicle.Delay.Station}</span>}</div>
            </article>;
          })}
        </div>
        <div className="panel-footnote">Polasci i kašnjenja preuzeti su iz HŽPP-ovih podataka. HŽPP ne šalje GPS lokaciju vlaka; stanica uz kašnjenje označava zadnju prijavu, ne položaj uživo. <a href="/terms">Uvjeti korištenja</a></div>
      </aside>

      <section className="data-note" aria-live="polite"><span className="status-dot" /> Podaci se osvježavaju svakih 30 sekundi <span>·</span> {new Intl.DateTimeFormat('hr-HR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zagreb' }).format(now)}</section>
    </div>
    {showAuth && <AuthModal onClose={() => setShowAuth(false)} loginEnabled={authStatus.loginEnabled} registrationEnabled={authStatus.registrationEnabled} />}
  </main>;
}
