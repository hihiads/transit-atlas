import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import AuthModal from '../../src/components/Auth/AuthModal';
import CookieNotice from '../../src/components/CookieNotice';
import { api, AuthStatus } from '../../src/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { applyTheme, readTheme } from '../../src/services/theme';

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
type Station = ApiStation & { lat?: number; lon?: number };
type DelayInfo = { Delay?: number | null; Station?: string | null } | null;
type TrainLeg = { Number?: string; DepartureDateTime?: string; Delay?: DelayInfo; Start?: { Name?: string }; Dest?: { Name?: string } };
type StopDetail = { name: string; arrival: string | null; departure: string | null };
type Journey = {
  DepartureDateTime: string;
  ArrivalDateTime: string;
  TransportationsWithDelay?: { TransportationWithDelay?: TrainLeg[] };
};

const HZPP = '/hzpp-api';
const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const email = 'info@transitly.eu';

type JourneySearch = { from: Station; to: Station; date: string; time: string };

function zagrebDate() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function displayDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat('hr-HR', { dateStyle: 'long' }).format(parsed);
}

function normalize(value: string) {
  return value.toLocaleLowerCase('hr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\bkol\.?(?=\s|$)/g, 'kolodvor').replace(/\s+/g, ' ').trim();
}

function time(value?: string | number) {
  if (!value) return '--:--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--:--' : new Intl.DateTimeFormat('hr-HR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function effectiveDeparture(journey: Journey) {
  const scheduled = new Date(journey.DepartureDateTime).getTime();
  const delay = journey.TransportationsWithDelay?.TransportationWithDelay?.[0]?.Delay?.Delay;
  return scheduled + (typeof delay === 'number' && Number.isFinite(delay) && delay > 0 ? delay * 60000 : 0);
}

function minutesUntil(timestamp: number) {
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 60000));
}

export default function TransitlyHzpp() {
  const { user, logout } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [fromName, setFromName] = useState('');
  const [toName, setToName] = useState('');
  const [travelDate, setTravelDate] = useState(zagrebDate);
  const [travelTime, setTravelTime] = useState('00:00');
  const [search, setSearch] = useState<JourneySearch | null>(null);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loadingStations, setLoadingStations] = useState(true);
  const [loadingJourneys, setLoadingJourneys] = useState(false);
  const [message, setMessage] = useState('');
  const [nearby, setNearby] = useState<Station | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showAuth, setShowAuth] = useState(false);
  const [showSiteMenu, setShowSiteMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(() => readTheme() === 'dark');
  const [expandedJourney, setExpandedJourney] = useState<string | null>(null);
  const [journeyDetails, setJourneyDetails] = useState<Record<string, { loading?: boolean; stops?: StopDetail[]; error?: string }>>({});
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ loginEnabled: true, registrationEnabled: true, authenticationActive: true });
  const requestId = useRef(0);

  useEffect(() => { api.getAuthStatus().then(setAuthStatus).catch(() => {}); }, []);
  useEffect(() => { applyTheme(darkMode ? 'dark' : 'light'); }, [darkMode]);

  const from = stations.find(station => normalize(station.name) === normalize(fromName)) ?? null;
  const to = stations.find(station => normalize(station.name) === normalize(toName)) ?? null;

  const loadJourneys = useCallback(async (query: JourneySearch, quiet = false) => {
    const currentRequest = ++requestId.current;
    if (!quiet) setLoadingJourneys(true);
    try {
      const params = new URLSearchParams({
        lang: 'hr', deviceType: 'WEB', clientUICOperatorCode: '1178', from: String(query.from.id), to: String(query.to.id),
        startTime: `${query.date}T${query.time}:00`, trainClass: '2', benefit: '1', countForBenefit: '1', transportChanges: 'DIRECT'
      });
      const response = await fetch(`${HZPP}/journeys-with-details/busInfo?${params}`);
      if (currentRequest !== requestId.current) return;
      if (!response.ok) throw new Error('HŽPP trenutačno ne vraća podatke. Pokušaj ponovno.');
      const data = await response.json();
      if (currentRequest !== requestId.current) return;
      const found: Journey[] = data?.JourneysTypesResponsev2?.JourneyWithTickets?.JourneysWithTicketsType ?? [];
      const selectedDay = found.filter(item => item.DepartureDateTime?.slice(0, 10) === query.date);
      const currentDayJourneys = query.date === zagrebDate()
        ? selectedDay.filter(item => effectiveDeparture(item) > Date.now())
        : selectedDay;
      const upcoming = currentDayJourneys
        .sort((a, b) => effectiveDeparture(a) - effectiveDeparture(b));
      setJourneys(upcoming);
      setMessage(upcoming.length ? '' : 'Za odabranu relaciju i datum nema dostupnih vlakova.');
    } catch (error) {
      if (currentRequest === requestId.current) setMessage(error instanceof Error ? error.message : 'Ne mogu učitati polaske.');
    } finally {
      if (!quiet && currentRequest === requestId.current) setLoadingJourneys(false);
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
      const mapped: Station[] = (apiData.response as ApiStation[]).map(station => {
        const geo = geoByName.get(normalize(station.name));
        return { ...station, lat: geo?.stop_lat, lon: geo?.stop_lon };
      });
      setStations(mapped);
      setLoadingStations(false);
    }).catch(() => { if (active) { setLoadingStations(false); setMessage('Ne mogu učitati stanice. Provjeri vezu i osvježi stranicu.'); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!search) return;
    void loadJourneys(search);
    if (search.date !== zagrebDate()) return;
    const refresh = window.setInterval(() => void loadJourneys(search, true), 30000);
    const clock = window.setInterval(() => setNow(Date.now()), 15000);
    return () => { window.clearInterval(refresh); window.clearInterval(clock); };
  }, [search, loadJourneys]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to) { setMessage('Odaberi polaznu i odredišnu stanicu s popisa.'); return; }
    setJourneys([]);
    setMessage('');
    setSearch({ from, to, date: travelDate, time: travelTime });
  }

  function useNearestStation() {
    if (!navigator.geolocation) { setMessage('Ovaj uređaj ne podržava lokaciju.'); return; }
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const nearest = stations.filter((station): station is Station & { lat: number; lon: number } => Number.isFinite(station.lat) && Number.isFinite(station.lon)).reduce<Station | null>((best, station) => {
        const distance = (station.lat - coords.latitude) ** 2 + (station.lon - coords.longitude) ** 2;
        if (!best) return station;
        return distance < (best.lat - coords.latitude) ** 2 + (best.lon - coords.longitude) ** 2 ? station : best;
      }, null);
      if (nearest) { setFromName(nearest.name); setNearby(nearest); }
      else setMessage('Nisam pronašao stanicu u blizini.');
      setLocationBusy(false);
    }, () => { setMessage('Lokacija nije dostupna. Dopusti pristup lokaciji pa pokušaj ponovno.'); setLocationBusy(false); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  function swapStations() { setFromName(toName); setToName(fromName); }

  async function toggleJourney(key: string, legs: TrainLeg[]) {
    if (expandedJourney === key) { setExpandedJourney(null); return; }
    setExpandedJourney(key);
    const date = search?.date;
    if (!date) return;
    for (const [index, leg] of legs.entries()) {
      const detailKey = `${key}:${index}`;
      if (journeyDetails[detailKey]?.stops || journeyDetails[detailKey]?.loading) continue;
      setJourneyDetails(current => ({ ...current, [detailKey]: { loading: true } }));
      try {
        const params = new URLSearchParams({ number: String(leg.Number || ''), start: String(leg.Start?.Name || ''), end: String(leg.Dest?.Name || ''), date, departure: time(leg.DepartureDateTime) });
        const response = await fetch(`${HZPP}/journey-stops?${params}`);
        if (!response.ok) throw new Error('Vozni red stanica trenutačno nije dostupan.');
        const data = await response.json();
        const stops = data.journeys?.[0]?.stops as StopDetail[] | undefined;
        setJourneyDetails(current => ({ ...current, [detailKey]: stops?.length ? { stops } : { error: 'Popis stanica nije dostupan za ovaj vlak i datum.' } }));
      } catch (error) {
        setJourneyDetails(current => ({ ...current, [detailKey]: { error: error instanceof Error ? error.message : 'Ne mogu učitati stanice.' } }));
      }
    }
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-group"><a className="brand" href="/" aria-label="Transitly početna stranica"><span className="brand-icon"><Icon name="train" size={21} /></span><span>transitly<span className="brand-muted">.eu</span><small>HŽPP vlakovi</small></span></a><label className="sr-only" htmlFor="hzpp-provider">Odaberi prijevoznika</label><select id="hzpp-provider" aria-label="Odaberi prijevoznika" value="hzpp" onChange={event => { if (event.target.value === 'zet') window.location.assign('/'); }}><option value="zet">ZET</option><option value="hzpp">HŽPP</option></select></div>
      <div className="network-status"><span className="status-dot" /> HŽPP podaci <span className="status-divider">·</span> Zagreb i Hrvatska</div>
      <div className="top-actions">
        <div className="site-menu-wrap">
          <button className="top-action menu-button" type="button" aria-expanded={showSiteMenu} aria-controls="hzpp-site-menu" onClick={() => setShowSiteMenu(open => !open)}>Izbornik <span aria-hidden="true">☰</span></button>
          {showSiteMenu && <nav id="hzpp-site-menu" className="site-menu" aria-label="Informacije o Transitlyju">
            <button type="button" aria-pressed={darkMode} onClick={() => setDarkMode(enabled => !enabled)}>{darkMode ? '☀️ Svijetli način rada' : '🌙 Tamni način rada'}</button>
            <a href="/privacy">Privatnost</a><a href="/terms">Uvjeti korištenja</a><a href="/cookies">Kolačići</a><a href={`mailto:${email}`}>Kontakt i prijava greške</a>
            <p>Transitly vodi <strong>Din Mulajusufović</strong></p>
          </nav>}
        </div>
        {user ? <><span className="user-email">{user.email}</span><button className="top-action account-button" onClick={() => void logout().catch(() => setMessage('Odjava trenutačno nije uspjela.'))} aria-label="Odjavi se"><span>Odjava</span><Icon name="logout" size={15} /></button></> : authStatus.loginEnabled && <button className="top-action account-button" onClick={() => setShowAuth(true)}><span>Prijava</span><Icon name="login" size={15} /></button>}
        <button className="top-action refresh-button" onClick={() => search && void loadJourneys(search)} aria-label="Osvježi polaske"><span>Osvježi</span><Icon name="wifi" size={16} /></button>
      </div>
    </header>

    <div className="workspace">
      <aside className="side-panel">
        <div className="panel-heading"><div><span className="eyebrow">PLANER PUTOVANJA VLAKOM</span><h1>Gdje i kada putuješ?</h1></div><div className="round-icon"><Icon name="train" size={19} /></div></div>
        <form onSubmit={submitSearch}>
          <div className="route-form">
            <label className="station-field"><span className="field-dot origin" /><span className="field-copy"><span>Polazna stanica</span><input list="hzpp-stations" aria-label="Polazna stanica" placeholder={loadingStations ? 'Učitavanje stanica…' : 'Pretraži stanice'} value={fromName} disabled={loadingStations} onChange={event => { setFromName(event.target.value); setNearby(null); }} /></span></label>
            <button className="swap-button" type="button" onClick={swapStations} aria-label="Zamijeni stanice"><Icon name="swap" size={16} /></button>
            <label className="station-field"><span className="field-dot destination" /><span className="field-copy"><span>Odredišna stanica</span><input list="hzpp-stations" aria-label="Odredišna stanica" placeholder={loadingStations ? 'Učitavanje stanica…' : 'Pretraži stanice'} value={toName} disabled={loadingStations} onChange={event => setToName(event.target.value)} /></span></label>
            <datalist id="hzpp-stations">{stations.map(station => <option key={station.id} value={station.name} />)}</datalist>
          </div>
          <div className="journey-filters">
            <label><span>Datum putovanja</span><input type="date" value={travelDate} onChange={event => setTravelDate(event.target.value)} required /></label>
            <label><span>Polazak nakon</span><input type="time" value={travelTime} onChange={event => setTravelTime(event.target.value)} required /></label>
          </div>
          <div className="search-actions">
            <button className="nearest-button" type="button" onClick={useNearestStation} disabled={locationBusy || loadingStations}><Icon name="locate" size={17} />{locationBusy ? 'Tražim stanicu…' : 'Najbliža stanica'}</button>
            <button className="search-button" type="submit" disabled={loadingStations || loadingJourneys}>{loadingJourneys ? 'Tražim vlakove…' : 'Pronađi vlakove'}</button>
          </div>
        </form>
        {nearby && <div className="nearest-note"><Icon name="pin" size={14} /> Najbliža stanica: <strong>{nearby.name}</strong></div>}

        <div className="departures-head"><div><span className="eyebrow">POLASCI ZA ODABRANI DAN</span><h2>{search?.from.name ?? 'Odaberi relaciju'}</h2></div><span className="count-pill">{journeys.length}</span></div>
        <div className="route-summary"><span>{search?.from.name || 'Polazak'}</span><i /><span>{search?.to.name || 'Dolazak'}</span><span>{search ? `${displayDate(search.date)} · nakon ${search.time}` : ''}</span></div>
        <div className="departure-list" aria-live="polite">
          {loadingJourneys && !journeys.length && <div className="empty-state"><span className="loader" />Tražim vlakove za odabranu relaciju i datum…</div>}
          {!loadingJourneys && !journeys.length && !message && <div className="empty-state">Odaberi polaznu stanicu, odredište i datum pa potraži vlakove.</div>}
          {message && !journeys.length && <div className="empty-state error-state">{message}</div>}
          {journeys.map((journey, index) => {
            const legs = journey.TransportationsWithDelay?.TransportationWithDelay ?? [];
            const delays = legs.map(leg => leg.Delay?.Delay).filter((delay): delay is number => typeof delay === 'number' && delay > 0);
            const delay = delays.length ? Math.max(...delays) : 0;
            const live = delay > 0;
            const delayedLeg = legs.find(leg => leg.Delay?.Delay === delay);
            const departureAt = effectiveDeparture(journey);
            const wait = minutesUntil(departureAt);
            const journeyKey = `${legs.map(leg => leg.Number).join('-')}-${journey.DepartureDateTime}`;
            const isExpanded = expandedJourney === journeyKey;
            return <article className={`departure-card ${index === 0 ? 'next-card' : ''}`} key={journeyKey}>
              <div className="departure-times"><strong>{time(departureAt)}</strong><span className="duration-line" /><strong>{time(journey.ArrivalDateTime)}</strong></div>
              <div className="journey-meta"><span className="train-number"><Icon name="train" size={13} /> Vlak {legs.map(leg => leg.Number).filter(Boolean).join(' → ') || '—'}</span><span className={`trip-status ${live ? 'late' : ''}`}><i />{live ? `Kasni ${delay} min` : 'Po rasporedu'}</span></div>
              {legs.length > 1 && <div className="transfer-legs">{legs.map((leg, legIndex) => <span key={`${leg.Number}-${legIndex}`}>{leg.Start?.Name} → {leg.Dest?.Name}</span>)}</div>}
              <div className="card-footer"><span><Icon name="clock" size={13} /> {wait === 0 ? 'Uskoro polazi' : `Za ${wait} min`}</span>{live && delayedLeg?.Delay?.Station && <span>Zadnja prijava: {delayedLeg.Delay.Station}</span>}</div>
              <button className="details-toggle" type="button" aria-expanded={isExpanded} onClick={() => void toggleJourney(journeyKey, legs)}>{isExpanded ? 'Sakrij stanice' : 'Prikaži stanice i vremena'}</button>
              {isExpanded && <div className="stop-details" aria-live="polite">
                {legs.map((leg, legIndex) => {
                  const detail = journeyDetails[`${journeyKey}:${legIndex}`];
                  return <section className="leg-stops" key={`${leg.Number}-${legIndex}`}>
                    {legs.length > 1 && <h3>Vlak {leg.Number}: {leg.Start?.Name} → {leg.Dest?.Name}</h3>}
                    {detail?.loading && <p>Učitavam stanice…</p>}
                    {detail?.error && <p role="status">{detail.error}</p>}
                    {detail?.stops?.map((stop, stopIndex) => <div className="stop-row" key={`${stop.name}-${stopIndex}`}><span className="stop-dot" /><strong>{stop.name}</strong><span>{stopIndex === 0 ? 'Polazak' : 'Dolazak'} <b>{stopIndex === 0 ? stop.departure || stop.arrival || '—' : stop.arrival || stop.departure || '—'}</b></span>{stopIndex > 0 && stopIndex < detail.stops!.length - 1 && stop.departure && stop.departure !== stop.arrival && <span>Polazak <b>{stop.departure}</b></span>}</div>)}
                  </section>;
                })}
                <small>Vremena su iz objavljenog voznog reda HŽPP-a.</small>
              </div>}
            </article>;
          })}
        </div>
        <div className="panel-footnote">Polasci i kašnjenja preuzeti su iz HŽPP-ovih podataka. HŽPP ne šalje GPS lokaciju vlaka; stanica uz kašnjenje označava zadnju prijavu, ne položaj uživo. <a href="/terms">Uvjeti korištenja</a></div>
      </aside>

      <section className="data-note" aria-live="polite"><span className="status-dot" />{search ? search.date === zagrebDate() ? <> Današnji polasci osvježavaju se svakih 30 sekundi <span>·</span> {new Intl.DateTimeFormat('hr-HR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zagreb' }).format(now)}</> : ' Raspored za odabrani datum' : ' Unesi relaciju i datum za prikaz polazaka'}</section>
    </div>
    {showAuth && <AuthModal onClose={() => setShowAuth(false)} loginEnabled={authStatus.loginEnabled} registrationEnabled={authStatus.registrationEnabled} />}
    <CookieNotice />
  </main>;
}
