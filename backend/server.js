import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fetch from 'node-fetch';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import AdmZip from 'adm-zip';
import { createReadStream, existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import { parse as parseStream } from 'csv-parse';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import { apiLimiter, authLimiter, heavyLimiter } from './middleware/security.js';
import { attachUser } from './middleware/auth.js';
import { activateAuthentication, getAuthenticationSessionMiddleware } from './services/authRuntime.js';
import { isAuthenticationEnabled, loadRuntimeSettings, missingAuthenticationEnvironment } from './config/runtimeSettings.js';
import { getAllowedOrigins, isAllowedOrigin } from './config/origins.js';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === 'production';
const publicUrl = process.env.RENDER_EXTERNAL_URL || (isProduction ? 'https://transit-atlas.onrender.com' : `http://localhost:${PORT}`);

await loadRuntimeSettings();
if (!process.env.ADMIN_PANEL_PASSWORD || process.env.ADMIN_PANEL_PASSWORD.length < 16) {
  throw new Error('Nedostaje ADMIN_PANEL_PASSWORD ili je kraći od 16 znakova');
}
if (isAuthenticationEnabled()) {
  const missing = missingAuthenticationEnvironment();
  if (missing.length) throw new Error(`Autentifikacija je uključena, ali nedostaju postavke: ${missing.join(', ')}`);
  await activateAuthentication();
}

// Render terminates TLS in front of the app and forwards the client's IP.
if (isProduction) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
}

// Sigurnosni headeri
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'challenges.cloudflare.com', 'accounts.google.com', 'appleid.cdn-apple.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'", 'accounts.google.com', 'appleid.cdn-apple.com'],
      frameSrc: ["'self'", 'challenges.cloudflare.com', 'accounts.google.com', 'appleid.cdn-apple.com'],
      fontSrc: ["'self'", 'data:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CORS - samo dozvoljene domene
const allowedOrigins = getAllowedOrigins();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || (allowedOrigins.has(origin) && isAllowedOrigin(origin))) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true
}));

// Body parsing s ograničenjima
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Admin prijava ne ovisi o MongoDB-u; auth sesije se dodaju tek kada je auth uključen.
app.use((req, res, next) => {
  const middleware = getAuthenticationSessionMiddleware();
  return middleware ? middleware(req, res, next) : next();
});

// Dodaj korisnika u request ako postoji sesija
app.use(attachUser);

app.use('/api/admin', adminRoutes);

// GTFS podatkovni skladište
let gtfsData = {
  routes: [],
  stops: [],
  trips: [],
  stopTimes: [],
  stopTimesByStop: new Map(),
  stopTimeCount: 0,
  calendar: [],
  calendarDates: [],
  shapes: [],
  agency: []
};
const hzppData = { routes: [], stops: [], trips: [], stopTimes: [], stopTimesByStop: new Map(), stopTimeCount: 0, calendar: [], calendarDates: [] };
let hzppLoaded = false;
let hzppLastUpdate = null;
const beogradData = { routes: [], stops: [], trips: [], stopTimes: [], stopTimesByStop: new Map(), stopTimeCount: 0, calendar: [], calendarDates: [], shapes: [], agency: [] };
let beogradLoaded = false;
let beogradLastUpdate = null;

let lastGtfsUpdate = null;
let gtfsLoaded = false;
let gtfsLoadError = null;
let gtfsLoadInProgress = false;
let rtFeedStatus = 'unknown';

// Helper funkcija za parsiranje GTFS CSV
function parseGtfsCsv(csvText) {
  try {
    return parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      cast: (value, context) => {
        if (context.header) return value;
        if (value === '') return null;
        return value;
      }
    });
  } catch (err) {
    console.error('CSV parse error:', err.message);
    return [];
  }
}

async function indexGtfsStopTimes(filePath, trips) {
  const tripIndexes = new Map(trips.map((trip, index) => [String(trip.trip_id), index]));
  const grouped = new Map();
  let count = 0;
  const parser = createReadStream(filePath).pipe(parseStream({
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true
  }));

  for await (const row of parser) {
    const tripIndex = tripIndexes.get(String(row.trip_id));
    if (tripIndex === undefined || !row.stop_id || !row.departure_time) continue;
    const [hour, minute, second] = String(row.departure_time).split(':').map(Number);
    if (![hour, minute, second].every(Number.isFinite)) continue;
    let entries = grouped.get(String(row.stop_id));
    if (!entries) grouped.set(String(row.stop_id), entries = []);
    entries.push(tripIndex, hour * 3600 + minute * 60 + second);
    count++;
    if (count % 250000 === 0) console.log(`[GTFS Static] stop_times: indeksirano ${count} redaka`);
  }

  return {
    byStop: new Map([...grouped].map(([stopId, entries]) => [stopId, Uint32Array.from(entries)])),
    count
  };
}

function* stopTimesForStop(data, stopId) {
  if (data.stopTimesByStop instanceof Map) {
    const entries = data.stopTimesByStop.get(stopId) || [];
    for (let index = 0; index < entries.length; index += 2) {
      const seconds = entries[index + 1];
      const hour = Math.floor(seconds / 3600);
      const minute = Math.floor((seconds % 3600) / 60);
      const second = seconds % 60;
      yield {
        trip_id: data.trips[entries[index]]?.trip_id,
        departure_time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
      };
    }
    return;
  }
  for (const row of data.stopTimes) {
    if (String(row.stop_id) === stopId) yield row;
  }
}

function stopTimeCount(data) {
  return data.stopTimesByStop instanceof Map ? data.stopTimeCount : data.stopTimes.length;
}

function dayNumber(date) {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function dayString(number) {
  return new Date(number * 86400000).toISOString().slice(0, 10);
}

function localMinute(value) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const day = dayNumber(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (hour > 23 || minute > 59) return null;
  return day * 1440 + hour * 60 + minute;
}

function zagrebNowMinute() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return dayNumber(`${values.year}-${values.month}-${values.day}`) * 1440 + Number(values.hour) * 60 + Number(values.minute);
}

function formatLocalMinute(value) {
  const date = dayString(Math.floor(value / 1440));
  const minuteOfDay = ((value % 1440) + 1440) % 1440;
  return `${date}T${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

function activeServicesOn(day) {
  const date = dayString(day);
  const dateKey = date.replaceAll('-', '');
  const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(day * 86400000).getUTCDay()];
  const active = new Set(gtfsData.calendar
    .filter(service => dateKey >= String(service.start_date) && dateKey <= String(service.end_date) && String(service[weekday]) === '1')
    .map(service => String(service.service_id)));
  for (const exception of gtfsData.calendarDates) {
    if (String(exception.date) !== dateKey) continue;
    if (String(exception.exception_type) === '1') active.add(String(exception.service_id));
    else active.delete(String(exception.service_id));
  }
  return active;
}

function distanceMeters(a, b) {
  const radians = value => value * Math.PI / 180;
  const lat = radians(b.lat - a.lat);
  const lon = radians(b.lon - a.lon);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function closestStops(point, radius = 1200, limit = 12) {
  return gtfsData.stops.map(stop => {
    const candidate = { lat: Number(stop.stop_lat), lon: Number(stop.stop_lon) };
    return { stop, distance: distanceMeters(point, candidate) };
  }).filter(item => Number.isFinite(item.distance) && item.distance <= radius)
    .sort((a, b) => a.distance - b.distance).slice(0, limit);
}

function tripPatternsFor(tripIndexes) {
  const patterns = new Map();
  if (!tripIndexes.size) return patterns;
  for (const [stopId, entries] of gtfsData.stopTimesByStop) {
    for (let index = 0; index < entries.length; index += 2) {
      const tripIndex = entries[index];
      if (!tripIndexes.has(tripIndex)) continue;
      let pattern = patterns.get(tripIndex);
      if (!pattern) patterns.set(tripIndex, pattern = []);
      pattern.push({ stopId, seconds: entries[index + 1] });
    }
  }
  for (const pattern of patterns.values()) pattern.sort((a, b) => a.seconds - b.seconds);
  return patterns;
}

const schoolGeocodeCache = new Map();
let lastSchoolGeocodeAt = 0;

app.get('/api/schoolroute/search', heavyLimiter, async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 160);
  if (query.length < 3) return res.status(400).json({ error: 'Unesite barem 3 znaka.' });
  const cacheKey = query.toLowerCase();
  if (schoolGeocodeCache.has(cacheKey)) return res.json(schoolGeocodeCache.get(cacheKey));
  try {
    const wait = Math.max(0, 1000 - (Date.now() - lastSchoolGeocodeAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastSchoolGeocodeAt = Date.now();
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', `${query}, Zagreb, Croatia`);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '5');
    url.searchParams.set('countrycodes', 'hr');
    const response = await fetch(url, { headers: { 'User-Agent': 'TransitAtlas/1.0 (school route planner)' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);
    const raw = await response.json();
    const results = raw.map(item => ({ id: String(item.place_id), name: String(item.display_name), lat: Number(item.lat), lon: Number(item.lon) }));
    schoolGeocodeCache.set(cacheKey, results);
    if (schoolGeocodeCache.size > 200) schoolGeocodeCache.delete(schoolGeocodeCache.keys().next().value);
    res.json(results);
  } catch (error) {
    res.status(502).json({ error: 'Pretraga adrese trenutačno nije dostupna.' });
  }
});

app.post('/api/schoolroute/plan', heavyLimiter, (req, res) => {
  if (!gtfsLoaded) return res.status(503).json({ error: 'ZET vozni red trenutačno nije učitan.' });
  const { origin, destination, arriveBy, mode } = req.body || {};
  const validPoint = point => point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon)) && Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lon)) <= 180;
  const deadline = localMinute(arriveBy);
  if (!validPoint(origin) || !validPoint(destination) || deadline === null || !['arrive', 'fastest'].includes(mode)) return res.status(400).json({ error: 'Podaci za planiranje nisu valjani.' });
  const now = zagrebNowMinute();
  const day = Math.floor(now / 1440);
  const services = new Map([day, day + 1].map(value => [value, activeServicesOn(value)]));
  const originStops = closestStops({ lat: Number(origin.lat), lon: Number(origin.lon) }, 1800, 18);
  const destinationStops = closestStops({ lat: Number(destination.lat), lon: Number(destination.lon) }, 1800, 18);
  const tripByIndex = gtfsData.trips;
  const tripIndexes = new Set();
  for (const { stop } of originStops) {
    const entries = gtfsData.stopTimesByStop.get(String(stop.stop_id));
    if (!entries) continue;
    for (let i = 0; i < entries.length; i += 2) tripIndexes.add(entries[i]);
  }
  const patterns = tripPatternsFor(tripIndexes);
  const stopById = new Map(gtfsData.stops.map(stop => [String(stop.stop_id), stop]));
  const routeById = new Map(gtfsData.routes.map(route => [String(route.route_id), route]));
  const destinationIds = new Set(destinationStops.map(item => String(item.stop.stop_id)));
  const walkingMinutes = meters => Math.ceil(meters / 75);
  const options = [];
  for (const [index, pattern] of patterns) {
    const trip = tripByIndex[index];
    if (!trip) continue;
    const route = routeById.get(String(trip.route_id));
    const patternStops = pattern.map(item => ({ ...item, stop: stopById.get(item.stopId) })).filter(item => item.stop);
    for (let i = 0; i < patternStops.length; i++) {
      const from = patternStops[i];
      const originCandidate = originStops.find(item => String(item.stop.stop_id) === from.stopId);
      if (!originCandidate) continue;
      for (let j = i + 1; j < patternStops.length; j++) {
        const to = patternStops[j];
        if (!destinationIds.has(to.stopId)) continue;
        const destinationCandidate = destinationStops.find(item => String(item.stop.stop_id) === to.stopId);
        if (!destinationCandidate) continue;
        const serviceDay = Math.floor((day * 1440 + Math.floor(from.seconds / 60)) / 1440);
        if (!services.get(serviceDay)?.has(String(trip.service_id))) continue;
        const adjustedStart = serviceDay * 1440 + Math.floor(from.seconds / 60) - walkingMinutes(originCandidate.distance);
        const adjustedEnd = serviceDay * 1440 + Math.floor(to.seconds / 60) + walkingMinutes(destinationCandidate.distance);
        if (adjustedStart < now || adjustedEnd > deadline || adjustedEnd - adjustedStart > 150) continue;
        options.push({
          leaveAt: formatLocalMinute(adjustedStart), arriveAt: formatLocalMinute(adjustedEnd),
          from: from.stop, to: to.stop, route: route?.route_short_name || 'Linija',
          headsign: trip.trip_headsign || '', shapeId: trip.shape_id ? String(trip.shape_id) : null,
          walkTo: walkingMinutes(originCandidate.distance), walkFrom: walkingMinutes(destinationCandidate.distance),
          walkToMeters: Math.round(originCandidate.distance), walkFromMeters: Math.round(destinationCandidate.distance)
        });
      }
    }
  }
  options.sort((a, b) => mode === 'fastest' ? a.arriveAt.localeCompare(b.arriveAt) : b.leaveAt.localeCompare(a.leaveAt));
  const plan = options[0];
  if (!plan) return res.json({ plan: null, message: 'Nema pronađene direktne vožnje u rasporedu za odabrano vrijeme i obližnje stanice.' });
  res.json({ plan, source: 'ZET GTFS raspored', mode, note: 'Polasci su iz rasporeda. Pješačko vrijeme je procjena; kašnjenja uživo nisu uključena.' });
});

// Preuzmi i parsiraj GTFS Static podatke
async function loadGtfsData() {
  if (gtfsLoadInProgress) return;
  gtfsLoadInProgress = true;
  const gtfsUrl = 'https://www.zet.hr/gtfs-scheduled/latest';
  const dataDir = join(process.cwd(), 'gtfs_data');

  try {
    console.log(`[GTFS Static] Preuzimanje sa ${gtfsUrl}...`);

    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const response = await fetch(gtfsUrl, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const zipPath = join(dataDir, 'gtfs.zip');
    writeFileSync(zipPath, buffer);

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(dataDir, true);

    console.log('[GTFS Static] ZIP ekstraktovan, parsiranje podataka...');

    const files = {
      'routes.txt': 'routes',
      'stops.txt': 'stops',
      'trips.txt': 'trips',
      'stop_times.txt': 'stopTimes',
      'calendar.txt': 'calendar',
      'calendar_dates.txt': 'calendarDates',
      'shapes.txt': 'shapes',
      'agency.txt': 'agency'
    };

    for (const [filename, key] of Object.entries(files)) {
      const filePath = join(dataDir, filename);
      if (existsSync(filePath)) {
        if (key === 'stopTimes') {
          console.log(`[GTFS Static] Streaming ${filename} (${gtfsData.trips.length} putovanja u indeksu)...`);
          const indexed = await indexGtfsStopTimes(filePath, gtfsData.trips);
          gtfsData.stopTimesByStop = indexed.byStop;
          gtfsData.stopTimeCount = indexed.count;
          console.log(`[GTFS Static] ✓ ${filename}: ${indexed.count} zapisa indeksirana po stanicama`);
        } else {
          const content = readFileSync(filePath, 'utf-8');
          gtfsData[key] = parseGtfsCsv(content);
          console.log(`[GTFS Static] ✓ ${filename}: ${gtfsData[key].length} zapisa`);
        }
      } else {
        console.warn(`[GTFS Static] ⚠ ${filename} ne postoji`);
      }
    }

    lastGtfsUpdate = new Date();
    gtfsLoaded = true;
    gtfsLoadError = null;
    console.log(`[GTFS Static] ✓ Podaci uspješno učitani: ${gtfsData.routes.length} linija, ${gtfsData.stops.length} stanica`);

  } catch (error) {
    console.error(`[GTFS Static] ✗ Greška: ${error.message}`);
    gtfsLoadError = error.message;
    gtfsLoaded = false;
  } finally {
    gtfsLoadInProgress = false;
  }
}

async function loadHzppData() {
  const url = process.env.HZPP_GTFS_URL || 'https://www.hzpp.hr/GTFS_files.zip';
  const dir = join(process.cwd(), 'gtfs_data', 'hzpp');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    mkdirSync(dir, { recursive: true });
    const zipPath = join(dir, 'gtfs.zip');
    writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
    new AdmZip(zipPath).extractAllTo(dir, true);
    for (const [file, key] of Object.entries({ 'routes.txt':'routes', 'stops.txt':'stops', 'trips.txt':'trips', 'stop_times.txt':'stopTimes', 'calendar.txt':'calendar', 'calendar_dates.txt':'calendarDates' })) {
      const path = join(dir, file);
      if (!existsSync(path)) continue;
      if (key === 'stopTimes') {
        const indexed = await indexGtfsStopTimes(path, hzppData.trips);
        hzppData.stopTimesByStop = indexed.byStop;
        hzppData.stopTimeCount = indexed.count;
      } else {
        hzppData[key] = parseGtfsCsv(readFileSync(path, 'utf8'));
      }
    }
    hzppLoaded = hzppData.stops.length > 0 && hzppData.trips.length > 0;
    hzppLastUpdate = new Date();
    console.log(`[HŽPP GTFS] ${hzppLoaded ? `učitano ${hzppData.stops.length} stanica` : 'nedostaju GTFS datoteke'}`);
  } catch (error) {
    console.error(`[HŽPP GTFS] ${error.message}`);
    hzppLoaded = false;
  }
}

async function loadBeogradData() {
  const url = 'https://data.gov.rs/sr/datasets/r/729be9a1-7ed9-453d-9a3d-68fa30f07529';
  const dir = join(process.cwd(), 'gtfs_data', 'beograd');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    mkdirSync(dir, { recursive: true });
    const zipPath = join(dir, 'gtfs.zip');
    writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
    new AdmZip(zipPath).extractAllTo(dir, true);
    for (const [file, key] of Object.entries({ 'routes.txt':'routes', 'stops.txt':'stops', 'trips.txt':'trips', 'stop_times.txt':'stopTimes', 'calendar.txt':'calendar', 'calendar_dates.txt':'calendarDates', 'shapes.txt':'shapes', 'agency.txt':'agency' })) {
      const path = join(dir, file);
      if (!existsSync(path)) continue;
      if (key === 'stopTimes') {
        const indexed = await indexGtfsStopTimes(path, beogradData.trips);
        beogradData.stopTimesByStop = indexed.byStop;
        beogradData.stopTimeCount = indexed.count;
      } else {
        beogradData[key] = parseGtfsCsv(readFileSync(path, 'utf8'));
      }
    }
    beogradLoaded = beogradData.routes.length > 0 && beogradData.stops.length > 0 && beogradData.trips.length > 0;
    beogradLastUpdate = new Date();
    console.log(`[Beograd GTFS] ${beogradLoaded ? `učitano ${beogradData.routes.length} linija, ${beogradData.stops.length} stanica, ${beogradData.trips.length} polazaka` : 'nedostaju osnovne GTFS datoteke'}`);
  } catch (error) {
    console.error(`[Beograd GTFS] ${error.message}`);
    beogradLoaded = false;
  }
}

// Učitavaj feedove jedan po jedan kako se veliki stop_times CSV-ovi ne bi parsirali istodobno.
async function loadZagrebData() {
  await loadGtfsData();
}
loadZagrebData();

// Osvježi GTFS podatke svakih 24h
setInterval(loadGtfsData, 24 * 60 * 60 * 1000);

// Dohvati GTFS-Realtime vozila
async function fetchRealtimeVehicles() {
  const rtUrl = 'https://www.zet.hr/gtfs-rt-protobuf';

  try {
    const response = await fetch(rtUrl, { timeout: 10000 });
    if (!response.ok) {
      rtFeedStatus = `HTTP ${response.status}`;
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );

    rtFeedStatus = 'active';
    const vehicles = [];

    for (const entity of feed.entity) {
      if (entity.vehicle && entity.vehicle.position) {
        const vehicle = entity.vehicle;
        const pos = vehicle.position;

        if (pos.latitude == null || pos.longitude == null ||
            pos.latitude < -90 || pos.latitude > 90 ||
            pos.longitude < -180 || pos.longitude > 180) {
          continue;
        }

        let vehicleId = entity.id;
        if (!vehicleId || vehicleId === '') {
          if (vehicle.trip?.tripId) {
            vehicleId = `rt_trip_${vehicle.trip.tripId}`;
          } else if (vehicle.trip?.routeId) {
            vehicleId = `rt_route_${vehicle.trip.routeId}_${vehicle.currentStopSequence ?? Math.round(pos.latitude * 10000) + '_' + Math.round(pos.longitude * 10000)}`;
          } else {
            vehicleId = `rt_vehicle_${Math.round(pos.latitude * 10000)}_${Math.round(pos.longitude * 10000)}`;
          }
        }

        let route = null;
        let trip = null;
        if (vehicle.trip?.routeId && gtfsData.routes.length && gtfsData.trips.length) {
          route = gtfsData.routes.find(r => r.route_id === vehicle.trip.routeId);
          trip = gtfsData.trips.find(t => t.trip_id === vehicle.trip?.tripId);
        }

        vehicles.push({
          id: vehicleId,
          type: route?.route_type === '0' ? 'tram' : 'bus',
          line: route?.route_short_name || vehicle.trip?.routeId || 'N/A',
          direction: trip?.trip_headsign || route?.route_long_name || 'Nepoznato',
          lat: pos.latitude,
          lon: pos.longitude,
          lastUpdate: vehicle.timestamp ? vehicle.timestamp * 1000 : Date.now(),
          garageNumber: vehicle.vehicle?.label || null,
          registrationNumber: vehicle.vehicle?.licensePlate || null,
          currentStopSequence: vehicle.currentStopSequence || null,
          currentStatus: vehicle.currentStatus || null,
          tripId: vehicle.trip?.tripId || null,
          routeId: vehicle.trip?.routeId || null,
          source: 'realtime'
        });
      }
    }

    console.log(`[GTFS-RT] ✓ Učitano ${vehicles.length} vozila`);
    return vehicles;
  } catch (error) {
    rtFeedStatus = `greška: ${error.message}`;
    console.error(`[GTFS-RT] ✗ ${error.message}`);
    return null;
  }
}

// API Routes

// Autentifikacija
app.use('/api/auth', authLimiter, authRoutes);

// Opći API rate limiter
app.use('/api', apiLimiter);

// Gradovi
app.get('/api/cities', (req, res) => {
  res.json([{
    id: 'zagreb',
    name: 'Zagreb',
    operator: 'ZET',
    center: [45.8150, 15.9819],
    zoom: 12,
    status: 'active',
    hasRealtime: true,
    supportedTypes: ['bus', 'tram']
  }]);
});

// Stanice
app.get('/api/stops/:cityId', (req, res) => {
  const { cityId } = req.params;

  const data = cityId === 'hzpp' ? hzppData : cityId === 'beograd' ? beogradData : gtfsData;
  const loaded = cityId === 'hzpp' ? hzppLoaded : cityId === 'beograd' ? beogradLoaded : gtfsLoaded;
  if (!['zagreb', 'hzpp', 'beograd'].includes(cityId) || !loaded) {
    return res.json({ stops: [], status: 'unavailable' });
  }

  res.json({
    stops: data.stops.map(stop => ({
      id: stop.stop_id,
      name: stop.stop_name,
      lat: parseFloat(stop.stop_lat),
      lon: parseFloat(stop.stop_lon),
      code: stop.stop_code == null ? null : String(stop.stop_code),
      wheelchairAccessible: stop.wheelchair_boarding === '1'
    })),
    status: 'loaded',
    count: data.stops.length
  });
});

// Linije
app.get('/api/routes/:cityId', (req, res) => {
  const { cityId } = req.params;

  const data = cityId === 'hzpp' ? hzppData : cityId === 'beograd' ? beogradData : gtfsData;
  const loaded = cityId === 'hzpp' ? hzppLoaded : cityId === 'beograd' ? beogradLoaded : gtfsLoaded;
  if (!['zagreb', 'hzpp', 'beograd'].includes(cityId) || !loaded) {
    return res.json({ routes: [], status: 'unavailable' });
  }

  res.json({
    routes: data.routes.map(route => ({
      id: String(route.route_id),
      shortName: String(route.route_short_name ?? ''),
      longName: String(route.route_long_name ?? ''),
      type: cityId === 'hzpp' ? 'train' : Number(route.route_type) === 0 ? 'tram' : 'bus',
      color: route.route_color || null,
      textColor: route.route_text_color || null
    })),
    status: 'loaded',
    count: data.routes.length
  });
});

// GTFS trase - heavy limiter
app.get('/api/shapes/:cityId', heavyLimiter, (req, res) => {
  const { cityId } = req.params;
  const data = cityId === 'hzpp' ? hzppData : cityId === 'beograd' ? beogradData : gtfsData;
  const loaded = cityId === 'hzpp' ? hzppLoaded : cityId === 'beograd' ? beogradLoaded : gtfsLoaded;
  if (!['zagreb', 'hzpp', 'beograd'].includes(cityId) || !loaded) {
    return res.json({ shapes: [], status: 'unavailable' });
  }

  const routeById = new Map(data.routes.map(route => [String(route.route_id), route]));
  const routeByShape = new Map();
  for (const trip of data.trips) {
    if (trip.shape_id && !routeByShape.has(String(trip.shape_id))) routeByShape.set(String(trip.shape_id), String(trip.route_id));
  }
  const grouped = new Map();
  for (const point of data.shapes || []) {
    if (!point.shape_id || !Number.isFinite(Number(point.shape_pt_lat)) || !Number.isFinite(Number(point.shape_pt_lon))) continue;
    const id = String(point.shape_id);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(point);
  }
  const shapes = [...grouped].map(([id, points]) => {
    points.sort((a, b) => Number(a.shape_pt_sequence) - Number(b.shape_pt_sequence));
    const routeId = routeByShape.get(id) || '';
    return {
      id,
      routeId,
      color: routeById.get(routeId)?.route_color || null,
      coordinates: points.map(point => [Number(point.shape_pt_lat), Number(point.shape_pt_lon)])
    };
  });
  res.json({ shapes, status: 'loaded', count: shapes.length });
});

// Vozila uživo
app.get('/api/vehicles/:cityId', async (req, res) => {
  const { cityId } = req.params;

  if (cityId === 'hzpp') return res.json({ status: 'unavailable', message: 'HŽPP objavljuje statički vozni red; live lokacije nisu dostupne.', vehicles: [], lastUpdate: Date.now(), source: 'HŽPP GTFS' });
  if (cityId === 'beograd') return res.json({ status: 'unavailable', message: 'Dostupan je službeni statički GTFS vozni red Beograda. Javni GTFS-Realtime feed vozila nije pronađen.', vehicles: [], lastUpdate: beogradLastUpdate?.getTime() ?? Date.now(), source: 'Beograd GTFS Static' });
  if (cityId !== 'zagreb') {
    return res.json({
      status: 'unavailable',
      message: 'Podaci za ovaj grad nisu dostupni',
      vehicles: []
    });
  }

  const realtimeVehicles = await fetchRealtimeVehicles();

  if (realtimeVehicles === null) {
    return res.json({
      status: 'unavailable',
      message: `GTFS-Realtime feed nije dostupan (${rtFeedStatus})`,
      vehicles: [],
      lastUpdate: Date.now()
    });
  }

  res.json({
    status: 'live',
    message: `Prikazano ${realtimeVehicles.length} vozila uživo`,
    vehicles: realtimeVehicles,
    lastUpdate: Date.now(),
    source: 'gtfs-realtime'
  });
});

// Polasci sa stanice
app.get('/api/:cityId/stop/:stopId/departures', (req, res) => {
  const { cityId, stopId } = req.params;
  const data = cityId === 'hzpp' ? hzppData : cityId === 'beograd' ? beogradData : gtfsData;
  const loaded = cityId === 'hzpp' ? hzppLoaded : cityId === 'beograd' ? beogradLoaded : gtfsLoaded;

  if (!loaded) {
    return res.status(503).json({ error: 'GTFS podaci nisu učitani' });
  }

  const stop = data.stops.find(s => String(s.stop_id) === stopId);
  if (!stop) {
    return res.status(404).json({ error: 'Stanica nije pronađena' });
  }

  if (!['zagreb', 'hzpp', 'beograd'].includes(cityId)) return res.status(404).json({ error: 'Mreža nije pronađena' });
  const now = new Date();
  const dateKey = date => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const activeServicesOn = date => {
    const ymd = dateKey(date);
    const weekday = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][date.getDay()];
    const active = new Set(data.calendar.filter(x => ymd >= String(x.start_date) && ymd <= String(x.end_date) && String(x[weekday]) === '1').map(x => String(x.service_id)));
    for (const row of data.calendarDates.filter(x => String(x.date) === ymd)) {
      if (String(row.exception_type) === '1') active.add(String(row.service_id));
      else active.delete(String(row.service_id));
    }
    return active;
  };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const serviceDays = [today, new Date(today.getTime() - 86400000)].map(date => ({ date, active: activeServicesOn(date) }));
  const tripsById = new Map(data.trips.map(t => [String(t.trip_id), t]));
  const routesById = new Map(data.routes.map(r => [String(r.route_id), r]));
  const departures = [];
  for (const st of stopTimesForStop(data, stopId)) {
    if (!st.departure_time) continue;
    const trip = tripsById.get(String(st.trip_id));
    if (!trip) continue;
    const [rawHour, minute, second] = String(st.departure_time).split(':').map(Number);
    if (![rawHour, minute, second].every(Number.isFinite)) continue;
    for (const serviceDay of serviceDays) {
      if (!serviceDay.active.has(String(trip.service_id))) continue;
      const actual = new Date(serviceDay.date);
      actual.setDate(actual.getDate() + Math.floor(rawHour / 24));
      actual.setHours(rawHour % 24, minute, second, 0);
      if (actual < now || actual > new Date(now.getTime() + 24 * 60 * 60 * 1000)) continue;
      const route = routesById.get(String(trip.route_id));
      departures.push({
        time: `${String(actual.getHours()).padStart(2, '0')}:${String(actual.getMinutes()).padStart(2, '0')}:${String(actual.getSeconds()).padStart(2, '0')}`,
        route: route?.route_short_name || 'N/A',
        direction: trip.trip_headsign || 'Nepoznato',
        tripId: String(st.trip_id),
        timestamp: actual.getTime()
      });
    }
  }
  departures.sort((a, b) => a.timestamp - b.timestamp);
  for (const departure of departures) delete departure.timestamp;
  const ymd = dateKey(today);
  res.json({
    stop: {
      id: stop.stop_id,
      name: stop.stop_name,
      lat: parseFloat(stop.stop_lat),
      lon: parseFloat(stop.stop_lon)
    },
    departures: departures.slice(0, 50),
    serviceDate: ymd, realtime: cityId === 'zagreb' ? 'vehicle_positions_only' : 'unavailable',
    message: cityId === 'beograd' ? 'Polasci su iz službenog GTFS rasporeda; live predviđanja nisu dostupna.' : cityId === 'hzpp' ? 'HŽPP GTFS sadrži vozni red; live kašnjenja trenutno nisu dostupna.' : 'ZET live vozila dostupna su, ali feed ne potvrđuje kašnjenje polaska.'
  });
});

// Status sistema
app.get('/api/system/status', (req, res) => {
  res.json({
    gtfsLoaded,
    gtfsLoadError,
    hzppLoaded,
    hzppLastUpdate,
    beogradLoaded,
    beogradLastUpdate,
    lastGtfsUpdate,
    rtFeedStatus,
    stats: {
      routes: gtfsData.routes.length,
      stops: gtfsData.stops.length,
      trips: gtfsData.trips.length,
      stopTimes: stopTimeCount(gtfsData)
    },
    statsBeograd: { routes: beogradData.routes.length, stops: beogradData.stops.length, trips: beogradData.trips.length, stopTimes: stopTimeCount(beogradData) },
    sources: {
      static: 'https://www.zet.hr/gtfs-scheduled/latest',
      realtime: 'https://www.zet.hr/gtfs-rt-protobuf',
      beogradStatic: 'https://data.gov.rs/sr/datasets/r/729be9a1-7ed9-453d-9a3d-68fa30f07529'
    }
  });
});

// Frontend - statički serviranje
const frontendDist = join(process.cwd(), 'dist');
app.use(express.static(frontendDist));
app.get('/', (req, res) => {
  const indexPath = join(frontendDist, 'index.html');
  if (!existsSync(indexPath)) {
    return res.status(503).send('Frontend nije izgrađen. Pokrenite npm run build.');
  }
  res.sendFile(indexPath);
});
app.get(['/verify-email', '/reset-password'], (req, res) => {
  const indexPath = join(frontendDist, 'index.html');
  if (!existsSync(indexPath)) return res.status(503).send('Frontend nije izgrađen. Pokrenite npm run build.');
  res.sendFile(indexPath);
});
app.get('/admin', (req, res) => {
  const indexPath = join(frontendDist, 'index.html');
  if (!existsSync(indexPath)) return res.status(503).send('Frontend nije izgrađen. Pokrenite npm run build.');
  res.sendFile(indexPath);
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Interna greška servera' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Transit Atlas Backend');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Server: ${publicUrl}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
  console.log('  GTFS Izvori:');
  console.log('  • Static:   https://www.zet.hr/gtfs-scheduled/latest');
  console.log('  • Realtime: https://www.zet.hr/gtfs-rt-protobuf');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
});
