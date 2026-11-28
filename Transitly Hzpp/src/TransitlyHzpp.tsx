import { Search } from 'lucide-react';
import { locale, t } from '../../src/services/i18n';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import AuthModal from '../../src/components/Auth/AuthModal';
import CookieNotice from '../../src/components/CookieNotice';
import SiteAnnouncement from '../../src/components/SiteAnnouncement';
import LanguageSelect from '../../src/components/LanguageSelect';
import { api, AuthStatus } from '../../src/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { applyTheme, readTheme } from '../../src/services/theme';
import { API_ORIGIN } from '../../src/services/platform';
import { getDevicePosition } from '../../src/services/deviceLocation';
import { alertsAllowed, requestAlertPermission, showAlert } from '../../src/services/alerts';
import InstallAppButton from '../../src/components/InstallAppButton';
import InstallAppPrompt from '../../src/components/InstallAppPrompt';
import TransitLoadingAnimation from '../../src/components/TransitLoadingAnimation';

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
type JourneyDetails = { loading?: boolean; stops?: StopDetail[]; route?: { from: string; to: string }; error?: string };
type Journey = {
  DepartureDateTime: string;
  ArrivalDateTime: string;
  TransportationsWithDelay?: { TransportationWithDelay?: TrainLeg[] };
};

const HZPP = `${API_ORIGIN}/hzpp-api`;
const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const email = 'info@transitly.eu';

type JourneySearch = { from: Station; to: Station; date: string; time: string; directOnly: boolean };

function zagrebDate() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function displayDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(parsed);
}

function normalize(value: string) {
  return value.toLocaleLowerCase('hr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\bkol\.?(?=\s|$)/g, 'kolodvor').replace(/\s+/g, ' ').trim();
}

function time(value?: string | number) {
  if (!value) return '--:--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--:--' : new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Zagreb', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

function delayMinutes(leg?: TrainLeg) {
  const delay = leg?.Delay?.Delay;
  return typeof delay === 'number' && Number.isFinite(delay) && delay > 0 ? delay : 0;
}

function effectiveDeparture(journey: Journey) {
  return Date.parse(journey.DepartureDateTime) + delayMinutes(journey.TransportationsWithDelay?.TransportationWithDelay?.[0]) * 60000;
}

function journeyKeyOf(journey: Journey) {
  const legs = journey.TransportationsWithDelay?.TransportationWithDelay ?? [];
  return `${legs.map(leg => leg.Number).join('-')}-${journey.DepartureDateTime}`;
}

// Tracked trains are kept in this browser only; notifications are shown while the page is open.
type TrackedTrain = { key: string; numbers: string; destination: string; scheduledArrival: string; lastNotifiedDelay: number };
const trackedTrainsKey = 'transit-hzpp-tracked';

function readTrackedTrains(): TrackedTrain[] {
  try { return JSON.parse(localStorage.getItem(trackedTrainsKey) || '[]'); } catch { return []; }
}

function writeTrackedTrains(items: TrackedTrain[]) {
  localStorage.setItem(trackedTrainsKey, JSON.stringify(items));
}

export default function TransitlyHzpp() {
  const { user, logout } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [fromName, setFromName] = useState('');
  const [toName, setToName] = useState('');
  const [travelDate, setTravelDate] = useState(zagrebDate);
  const [travelTime, setTravelTime] = useState('00:00');
  const [directOnly, setDirectOnly] = useState(true);
  const [search, setSearch] = useState<JourneySearch | null>(null);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loadingStations, setLoadingStations] = useState(true);
  const [loadingJourneys, setLoadingJourneys] = useState(false);
  const [message, setMessage] = useState('');
  const [nearby, setNearby] = useState<Station | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showAuth, setShowAuth] = useState(false);
  const [showTrainSearch, setShowTrainSearch] = useState(false);
  const [trainNumber, setTrainNumber] = useState('');
  const [showSiteMenu, setShowSiteMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(() => readTheme() === 'dark');
  const [expandedJourney, setExpandedJourney] = useState<string | null>(null);
  const [journeyDetails, setJourneyDetails] = useState<Record<string, JourneyDetails>>({});
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ loginEnabled: true, registrationEnabled: true, authenticationActive: true });
  const requestId = useRef(0);
  const requestedDetails = useRef(new Set<string>());

  const [trackedTrains, setTrackedTrains] = useState<TrackedTrain[]>(readTrackedTrains);

  useEffect(() => { api.getAuthStatus().then(setAuthStatus).catch(() => {}); }, []);
  useEffect(() => { applyTheme(darkMode ? 'dark' : 'light'); }, [darkMode]);

  // Runs on every journey refresh (every 30 s for today): notify on any delay of 1 minute or more, once per new delay value.
  useEffect(() => {
    if (!trackedTrains.length) return;
    const fresh = trackedTrains.filter(entry => Date.parse(entry.scheduledArrival) > Date.now() - 2 * 3600_000);
    let changed = fresh.length !== trackedTrains.length;
    const next = fresh.map(entry => {
      const journey = journeys.find(item => journeyKeyOf(item) === entry.key);
      if (!journey || !alertsAllowed()) return entry;
      const legs = journey.TransportationsWithDelay?.TransportationWithDelay ?? [];
      const delay = Math.max(0, ...legs.map(delayMinutes));
      // Back on time: forget the last delay so the next delay notifies again, even if it has the same length.
      if (delay < 1) {
        if (!entry.lastNotifiedDelay) return entry;
        changed = true;
        return { ...entry, lastNotifiedDelay: 0 };
      }
      if (delay === entry.lastNotifiedDelay) return entry;
      const estimatedArrival = Date.parse(journey.ArrivalDateTime) + delayMinutes(legs[legs.length - 1]) * 60000;
      showAlert(
        t("Vlak {0} kasni {1} min", entry.numbers, delay),
        t("Procijenjeni dolazak u {0}: {1} (planirano {2}).", entry.destination, time(estimatedArrival), time(entry.scheduledArrival)),
        entry.key
      );
      changed = true;
      return { ...entry, lastNotifiedDelay: delay };
    });
    if (changed) {
      writeTrackedTrains(next);
      setTrackedTrains(next);
    }
  }, [journeys, trackedTrains]);

  // Prefetch each upcoming train's line so the card shows it without expanding; already requested legs are skipped.
  useEffect(() => {
    if (!search || !journeys.length) return;
    let active = true;
    void (async () => {
      for (const journey of journeys) {
        if (!active) return;
        await loadJourneyLegs(journeyKeyOf(journey), journey.TransportationsWithDelay?.TransportationWithDelay ?? []);
      }
    })();
    return () => { active = false; };
  }, [journeys]);

  async function toggleTrackTrain(journey: Journey) {
    const key = journeyKeyOf(journey);
    const current = readTrackedTrains();
    if (current.some(item => item.key === key)) {
      const next = current.filter(item => item.key !== key);
      writeTrackedTrains(next);
      setTrackedTrains(next);
      return;
    }
    if (!(await requestAlertPermission())) {
      setMessage(t("Dozvola za obavijesti nije odobrena."));
      return;
    }
    const legs = journey.TransportationsWithDelay?.TransportationWithDelay ?? [];
    const entry: TrackedTrain = {
      key,
      numbers: legs.map(leg => leg.Number).filter(Boolean).join(' → '),
      destination: legs[legs.length - 1]?.Dest?.Name || search?.to.name || '',
      scheduledArrival: journey.ArrivalDateTime,
      lastNotifiedDelay: 0
    };
    const next = [...current, entry];
    writeTrackedTrains(next);
    setTrackedTrains(next);
  }

  const from = stations.find(station => normalize(station.name) === normalize(fromName)) ?? null;
  const to = stations.find(station => normalize(station.name) === normalize(toName)) ?? null;

  const loadJourneys = useCallback(async (query: JourneySearch, quiet = false) => {
    const currentRequest = ++requestId.current;
    if (!quiet) setLoadingJourneys(true);
    try {
      const params = new URLSearchParams({
        lang: 'hr', deviceType: 'WEB', clientUICOperatorCode: '1178', from: String(query.from.id), to: String(query.to.id),
        startTime: `${query.date}T${query.time}:00`, trainClass: '2', benefit: '1', countForBenefit: '1'
      });
      // Samo direktni vlakovi šalju parametar; bez njega HŽPP može vratiti i veze s presjedanjem.
      if (query.directOnly) params.set('transportChanges', 'DIRECT');
      const response = await fetch(`${HZPP}/journeys-with-details/busInfo?${params}`);
      if (currentRequest !== requestId.current) return;
      if (!response.ok) throw new Error(t("HŽPP trenutačno ne vraća podatke. Pokušaj ponovno."));
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
      setMessage(upcoming.length ? '' : t("Za odabranu relaciju i datum nema dostupnih vlakova."));
    } catch (error) {
      if (currentRequest === requestId.current) setMessage(error instanceof Error ? error.message : t("Ne mogu učitati polaske."));
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
    }).catch(() => { if (active) { setLoadingStations(false); setMessage(t("Ne mogu učitati stanice. Provjeri vezu i osvježi stranicu.")); } });
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
    if (!from || !to) { setMessage(t("Odaberi polaznu i odredišnu stanicu s popisa.")); return; }
    setJourneys([]);
    setMessage('');
    setSearch({ from, to, date: travelDate, time: travelTime, directOnly });
  }

  function useNearestStation() {
    setLocationBusy(true);
    getDevicePosition(({ coords }) => {
      const nearest = stations.filter((station): station is Station & { lat: number; lon: number } => Number.isFinite(station.lat) && Number.isFinite(station.lon)).reduce<Station | null>((best, station) => {
        const distance = (station.lat - coords.latitude) ** 2 + (station.lon - coords.longitude) ** 2;
        if (!best) return station;
        return distance < (best.lat - coords.latitude) ** 2 + (best.lon - coords.longitude) ** 2 ? station : best;
      }, null);
      if (nearest) { setFromName(nearest.name); setNearby(nearest); }
      else setMessage(t("Nisam pronašao stanicu u blizini."));
      setLocationBusy(false);
    }, () => { setMessage(t("Lokacija nije dostupna. Dopusti pristup lokaciji pa pokušaj ponovno.")); setLocationBusy(false); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  function swapStations() { setFromName(toName); setToName(fromName); }

  // Loads stops and the train's line (route) for each leg once; used on expand and to show the line on every card.
  async function loadJourneyLegs(key: string, legs: TrainLeg[]) {
    const date = search?.date;
    if (!date) return;
    for (const [index, leg] of legs.entries()) {
      const detailKey = `${key}:${index}`;
      if (requestedDetails.current.has(detailKey)) continue;
      requestedDetails.current.add(detailKey);
      setJourneyDetails(current => ({ ...current, [detailKey]: { loading: true } }));
      try {
        const params = new URLSearchParams({ number: String(leg.Number || ''), start: String(leg.Start?.Name || ''), end: String(leg.Dest?.Name || ''), date, departure: time(leg.DepartureDateTime) });
        const response = await fetch(`${HZPP}/journey-stops?${params}`);
        if (!response.ok) throw new Error(t("Vozni red stanica trenutačno nije dostupan."));
        const data = await response.json();
        const detail: JourneyDetails | undefined = data.journeys?.[0];
        setJourneyDetails(current => ({ ...current, [detailKey]: detail?.stops?.length ? detail : { error: t("Popis stanica nije dostupan za ovaj vlak i datum.") } }));
      } catch (error) {
        setJourneyDetails(current => ({ ...current, [detailKey]: { error: error instanceof Error ? error.message : t("Ne mogu učitati stanice.") } }));
      }
    }
  }

  async function toggleJourney(key: string, legs: TrainLeg[]) {
    if (expandedJourney === key) { setExpandedJourney(null); return; }
    setExpandedJourney(key);
    await loadJourneyLegs(key, legs);
  }

  const trainQuery = trainNumber.trim().toUpperCase();
  const isToday = search?.date === zagrebDate();
  const shownJourneys = trainQuery ? journeys.filter(journey => journey.TransportationsWithDelay?.TransportationWithDelay
    ?.some(leg => String(leg.Number ?? '').toUpperCase().startsWith(trainQuery))) : journeys;

  if (loadingStations) return <div className="transit-loader-page"><TransitLoadingAnimation mode="train" label={t("Učitavamo HŽPP stanice…")} /></div>;

  return <main className="app-shell">
    <SiteAnnouncement audience="hzpp" />
    <header className="topbar">
      <div className="brand-group"><a className="brand" href="/" aria-label={t("Transitly početna stranica")}><span className="brand-icon"><Icon name="train" size={21} /></span></a><label className="sr-only" htmlFor="hzpp-provider">{t("Odaberi prijevoznika")}</label><select id="hzpp-provider" aria-label={t("Odaberi prijevoznika")} value="hzpp" onChange={event => { if (event.target.value === 'zet') window.location.assign('/'); }}><option value="zet">ZET</option><option value="hzpp">HŽPP</option></select>
        <div className="site-menu-wrap">
          <button className="top-action menu-button" type="button" aria-expanded={showSiteMenu} aria-controls="hzpp-site-menu" onClick={() => { setShowSiteMenu(open => !open); setShowTrainSearch(false); setTrainNumber(''); }}>{t("Izbornik") + " "}<span aria-hidden="true">☰</span></button>
          {showSiteMenu && <nav id="hzpp-site-menu" className="site-menu" aria-label={t("Informacije o Transitlyju")}>
            <LanguageSelect />
            <button type="button" aria-pressed={darkMode} onClick={() => setDarkMode(enabled => !enabled)}>{darkMode ? t("☀️ Svijetli način rada") : t("🌙 Tamni način rada")}</button>
            <button type="button" aria-pressed={directOnly} onClick={() => {
              const next = !directOnly;
              setDirectOnly(next);
              if (search) setSearch({ ...search, directOnly: next });
            }}>{directOnly ? t("✓ Samo direktni vlakovi") : t("Samo direktni vlakovi")}</button>
            <InstallAppButton />
            <a href="/status?area=hzpp">{t("Stanje usluga")}</a><a href="/feedback?area=hzpp">{t("Prijavi grešku")}</a>
            <a href="/privacy">{t("Politika privatnosti")}</a><a href="/terms">{t("Uvjeti korištenja")}</a><a href="/cookies">{t("Politika kolačića")}</a><a href={`mailto:${email}`}>{t("Kontakt")}</a>
          </nav>}
        </div>
      </div>
      <div className="network-status"><span className="status-dot" />{" " + t("HŽPP podaci") + " "}<span className="status-divider">·</span>{" " + t("Zagreb i Hrvatska")}</div>
      <div className="top-actions">
        <button type="button" className="top-action" aria-label={t("Pretraži vlakove po broju")} aria-expanded={showTrainSearch} aria-controls="train-search"
          onClick={() => { setShowTrainSearch(!showTrainSearch); setShowSiteMenu(false); setTrainNumber(''); }}><Search size={17} aria-hidden="true" /></button>
        {user ? <><span className="user-email">{user.email}</span><button className="top-action account-button" onClick={() => void logout().catch(() => setMessage(t("Odjava trenutačno nije uspjela.")))} aria-label={t("Odjavi se")}><span>{t("Odjava")}</span><Icon name="logout" size={15} /></button></> : authStatus.loginEnabled && <button className="top-action account-button" onClick={() => setShowAuth(true)}><span>{t("Prijava")}</span><Icon name="login" size={15} /></button>}
        <button className="top-action refresh-button" onClick={() => search && void loadJourneys(search)} aria-label={t("Osvježi polaske")}><span>{t("Osvježi")}</span><Icon name="wifi" size={16} /></button>
      </div>
    </header>

    <div className="workspace">
      {showTrainSearch && <label id="train-search" className="train-search">
        <Search size={17} aria-hidden="true" />
        <input type="search" autoFocus maxLength={24} value={trainNumber} aria-label={t("Broj vlaka u rezultatima")}
          placeholder={t("Broj vlaka u rezultatima")} onChange={event => setTrainNumber(event.target.value)}
          onKeyDown={event => { if (event.key === 'Escape') { setShowTrainSearch(false); setTrainNumber(''); } }} />
      </label>}
      <aside className="side-panel">
        <div className="panel-heading"><div><span className="eyebrow">{t("PLANER PUTOVANJA VLAKOM")}</span><h1>{t("Gdje i kada putuješ?")}</h1></div><div className="round-icon"><Icon name="train" size={19} /></div></div>
        <form onSubmit={submitSearch}>
          <div className="route-form">
            <label className="station-field"><span className="field-dot origin" /><span className="field-copy"><span>{t("Polazna stanica")}</span><input list="hzpp-stations" aria-label={t("Polazna stanica")} placeholder={loadingStations ? t("Učitavanje stanica…") : t("Pretraži stanice")} value={fromName} disabled={loadingStations} onChange={event => { setFromName(event.target.value); setNearby(null); }} /></span></label>
            <button className="swap-button" type="button" onClick={swapStations} aria-label={t("Zamijeni stanice")}><Icon name="swap" size={16} /></button>
            <label className="station-field"><span className="field-dot destination" /><span className="field-copy"><span>{t("Odredišna stanica")}</span><input list="hzpp-stations" aria-label={t("Odredišna stanica")} placeholder={loadingStations ? t("Učitavanje stanica…") : t("Pretraži stanice")} value={toName} disabled={loadingStations} onChange={event => setToName(event.target.value)} /></span></label>
            <datalist id="hzpp-stations">{stations.map(station => <option key={station.id} value={station.name} />)}</datalist>
          </div>
          <div className="journey-filters">
            <label><span>{t("Datum putovanja")}</span><input type="date" value={travelDate} onChange={event => setTravelDate(event.target.value)} required /></label>
            <label><span>{t("Polazak nakon")}</span><input type="time" value={travelTime} onChange={event => setTravelTime(event.target.value)} required /></label>
          </div>
          <div className="search-actions">
            <button className="nearest-button" type="button" onClick={useNearestStation} disabled={locationBusy || loadingStations}><Icon name="locate" size={17} />{locationBusy ? t("Tražim stanicu…") : t("Najbliža stanica")}</button>
            <button className="search-button" type="submit" disabled={loadingStations || loadingJourneys}>{loadingJourneys ? t("Tražim vlakove…") : t("Pronađi vlakove")}</button>
          </div>
        </form>
        {nearby && <div className="nearest-note"><Icon name="pin" size={14} />{" " + t("Najbliža stanica:") + " "}<strong>{nearby.name}</strong></div>}

        <div className="departures-head"><div><span className="eyebrow">{t("POLASCI ZA ODABRANI DAN")}</span><h2>{search?.from.name ?? t("Odaberi relaciju")}</h2></div><span className="count-pill">{shownJourneys.length}</span></div>
        <div className="route-summary"><span>{search?.from.name || t("Polazak")}</span><i /><span>{search?.to.name || t("Dolazak")}</span><span>{search ? t("{0} · nakon {1}", displayDate(search.date), search.time) : ''}</span></div>
        <div className="departure-list" aria-live="polite">
          {loadingJourneys && <TransitLoadingAnimation mode="train" label={t("Vlak vozi dok tražimo polaske…")} compact />}
          {!loadingJourneys && !journeys.length && !message && <div className="empty-state">{t("Odaberi polaznu stanicu, odredište i datum pa potraži vlakove.")}</div>}
          {message && !journeys.length && <div className="empty-state error-state">{message}</div>}
          {trainQuery && journeys.length > 0 && shownJourneys.length === 0 && <div className="empty-state">{t("U rezultatima nema vlaka s tim brojem.")}</div>}
          {shownJourneys.map((journey, index) => {
            const legs = journey.TransportationsWithDelay?.TransportationWithDelay ?? [];
            const departureDelay = delayMinutes(legs[0]);
            const arrivalDelay = delayMinutes(legs[legs.length - 1]);
            const delay = Math.max(0, ...legs.map(delayMinutes));
            const live = delay > 0;
            const delayedLeg = legs.find(leg => leg.Delay?.Delay === delay);
            const departureAt = effectiveDeparture(journey);
            const arrivalAt = Date.parse(journey.ArrivalDateTime) + arrivalDelay * 60000;
            const duration = Math.round((arrivalAt - departureAt) / 60000);
            const wait = Math.max(0, Math.ceil((departureAt - now) / 60000));
            const durationLabel = duration >= 60
              ? `${Math.floor(duration / 60)} h ${duration % 60} min`
              : `${duration} min`;
            const journeyKey = `${legs.map(leg => leg.Number).join('-')}-${journey.DepartureDateTime}`;
            const isExpanded = expandedJourney === journeyKey;
            const isTracked = trackedTrains.some(item => item.key === journeyKey);
            return <article className={`departure-card ${index === 0 && journey === journeys[0] ? 'next-card' : ''}`} key={journeyKey}>
              <div className="departure-times">
                <span><small>{departureDelay ? t("Procijenjeni polazak") : t("Polazak")}</small><strong>{time(departureAt)}</strong></span>
                <span className="duration-line" aria-hidden="true" />
                <span><small>{arrivalDelay ? t("Procijenjeni dolazak") : t("Dolazak")}</small><strong>{time(arrivalAt)}</strong></span>
              </div>
              {departureDelay > 0 && <p className="scheduled-arrival-note">{t("Vlak je trebao doći u") + " "}{time(journey.DepartureDateTime)}</p>}
              {Number.isFinite(duration) && duration >= 0 && <p className="scheduled-arrival-note">{t("Trajanje vožnje:") + " "}{durationLabel}</p>}
              <div className="journey-meta"><span className={`trip-status ${live ? 'late' : ''}`}><i />{live ? t("Kasni {0} min", delay) : t("Po rasporedu")}</span></div>
              {legs.length > 0 && <div className="route-legs" aria-label={t("Relacija vlaka")}>{legs.map((leg, legIndex) => {
                const line = journeyDetails[`${journeyKey}:${legIndex}`]?.route;
                return <span key={`${leg.Number}-${legIndex}`}>
                  <strong>{t("Vlak") + " "}{leg.Number}</strong>
                  <b>{line ? `${line.from} – ${line.to}` : `${leg.Start?.Name || '—'} → ${leg.Dest?.Name || '—'}`}</b>
                </span>;
              })}</div>}
              {(isToday || (live && delayedLeg?.Delay?.Station)) && <div className="card-footer">
                {isToday && <span><Icon name="clock" size={13} /> {wait === 0 ? t("Uskoro polazi") : t("Za {0} min", wait)}</span>}
                {live && delayedLeg?.Delay?.Station && <span>{t("Zadnja prijava:") + " "}{delayedLeg.Delay.Station}</span>}
              </div>}
              <button className="details-toggle" type="button" aria-expanded={isExpanded} onClick={() => void toggleJourney(journeyKey, legs)}>{isExpanded ? t("Sakrij stanice") : t("Prikaži stanice i vremena")}</button>
              <button className="details-toggle track-toggle" type="button" aria-pressed={isTracked} onClick={() => void toggleTrackTrain(journey)}>{isTracked ? t("Prestani pratiti vlak") : t("Prati vlak")}</button>
              {isExpanded && <div className="stop-details" aria-live="polite">
                {legs.map((leg, legIndex) => {
                  const detail = journeyDetails[`${journeyKey}:${legIndex}`];
                  return <section className="leg-stops" key={`${leg.Number}-${legIndex}`}>
                    {detail?.loading && <TransitLoadingAnimation mode="train" label={t("Učitavam stanice vlaka…")} compact />}
                    {detail?.error && <p role="status">{detail.error}</p>}
                    {detail?.stops?.map((stop, stopIndex) => <div className="stop-row" key={`${stop.name}-${stopIndex}`}><span className="stop-dot" /><strong>{stop.name}</strong><span>{stopIndex === 0 ? t("Polazak") : t("Dolazak")} <b>{stopIndex === 0 ? stop.departure || stop.arrival || '—' : stop.arrival || stop.departure || '—'}</b></span>{stopIndex > 0 && stopIndex < detail.stops!.length - 1 && stop.departure && stop.departure !== stop.arrival && <span>{t("Polazak") + " "}<b>{stop.departure}</b></span>}</div>)}
                  </section>;
                })}
                <small>{t("Vremena su iz objavljenog voznog reda HŽPP-a.")}</small>
              </div>}
            </article>;
          })}
        </div>
        <div className="panel-footnote">{t("Polasci i kašnjenja preuzeti su iz HŽPP-ovih podataka. HŽPP ne šalje GPS lokaciju vlaka; stanica uz kašnjenje označava zadnju prijavu, ne položaj uživo.") + " "}<a href="/about/">{t("O Transitlyju")}</a> · <a href="/terms">{t("Uvjeti korištenja")}</a></div>
      </aside>

      <section className="data-note" aria-live="polite"><span className="status-dot" />{search ? isToday ? <>{" " + t("Današnji polasci osvježavaju se svakih 30 sekundi") + " "}<span>·</span> {time(now)}</> : " " + t("Raspored za odabrani datum") : " " + t("Unesi relaciju i datum za prikaz polazaka")}</section>
    </div>
    {showAuth && <AuthModal onClose={() => setShowAuth(false)} loginEnabled={authStatus.loginEnabled} registrationEnabled={authStatus.registrationEnabled} />}
    <InstallAppPrompt />
    <CookieNotice />
  </main>;
}
