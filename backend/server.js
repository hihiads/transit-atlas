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
const hzppData = { routes: [], stops: [], trips: [], stopTimes: [], calendar: [], calendarDates: [] };
let hzppLoaded = false;
let hzppLastUpdate = null;
const beogradData = { routes: [], stops: [], trips: [], stopTimes: [], calendar: [], calendarDates: [], shapes: [], agency: [] };
let beogradLoaded = false;
let beogradLastUpdate = null;

let lastGtfsUpdate = null;
let gtfsLoaded = false;
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

// Preuzmi i parsiraj GTFS Static podatke
async function loadGtfsData() {
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
    console.log(`[GTFS Static] ✓ Podaci uspješno učitani: ${gtfsData.routes.length} linija, ${gtfsData.stops.length} stanica`);

  } catch (error) {
    console.error(`[GTFS Static] ✗ Greška: ${error.message}`);
    gtfsLoaded = false;
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
      if (existsSync(path)) hzppData[key] = parseGtfsCsv(readFileSync(path, 'utf8'));
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
      if (existsSync(path)) beogradData[key] = parseGtfsCsv(readFileSync(path, 'utf8'));
    }
    beogradLoaded = beogradData.routes.length > 0 && beogradData.stops.length > 0 && beogradData.trips.length > 0;
    beogradLastUpdate = new Date();
    console.log(`[Beograd GTFS] ${beogradLoaded ? `učitano ${beogradData.routes.length} linija, ${beogradData.stops.length} stanica, ${beogradData.trips.length} polazaka` : 'nedostaju osnovne GTFS datoteke'}`);
  } catch (error) {
    console.error(`[Beograd GTFS] ${error.message}`);
    beogradLoaded = false;
  }
}

// Inicijalno učitavanje GTFS podataka
loadGtfsData();
loadHzppData();
loadBeogradData();

// Osvježi GTFS podatke svakih 24h
setInterval(loadGtfsData, 24 * 60 * 60 * 1000);
setInterval(loadHzppData, 24 * 60 * 60 * 1000);
setInterval(loadBeogradData, 24 * 60 * 60 * 1000);

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
        if (vehicle.trip?.routeId && gtfsLoaded) {
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
  }, {
    id: 'hzpp', name: 'Hrvatska', operator: 'HŽPP', center: [45.2, 16.2], zoom: 7,
    status: 'active', hasRealtime: false, supportedTypes: ['train']
  }, {
    id: 'beograd', name: 'Beograd', operator: 'Sekretarijat za javni prevoz', center: [44.8125, 20.4612], zoom: 12,
    status: 'active', hasRealtime: false, supportedTypes: ['bus', 'tram']
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
