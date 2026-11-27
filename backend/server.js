import { hasStrongAdminPassword, isDev } from './config/env.js';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fetchFeed, extractFeed } from './services/gtfsArchive.js';
import { listCroatianBikeStations } from './services/bikeShare.js';
import { estimateNextStop, vehicleHasPassedStop } from './services/vehiclePosition.js';
import { parse } from 'csv-parse/sync';
import { parse as parseStream } from 'csv-parse';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import { zetVehicleId } from './services/zetFleet.js';
import { getBusRegistration } from './services/busRegistrations.js';
import { readVehicleNotices, recordVehicleReport, validateVehicleReport } from './services/vehicleReports.js';
import User from './models/User.js';
import { auditDashboard, cleanText, dashboardCollection, feedbackCollection, listBulletins, markRareVehicles, readDashboardSettings } from './services/dashboard.js';
import { alertRareVehicleFollowers } from './services/rareVehicleAlerts.js';
import { readAnnouncement } from './services/siteAnnouncement.js';
import secondLookRoutes from './routes/secondlook.js';
import { apiLimiter, asyncRoute, heavyLimiter, vehiclesLimiter } from './middleware/security.js';
import { redirectAdminHome, requireAdminAccess } from './middleware/adminAccess.js';
import { attachUser, requireAuth } from './middleware/auth.js';
import { activateAuthentication, getAuthenticationSessionMiddleware } from './services/authRuntime.js';
import { getRuntimeSettings, isAuthenticationEnabled, loadRuntimeSettings, missingAuthenticationEnvironment } from './config/runtimeSettings.js';
import { getAllowedOrigins, requireTrustedOrigin } from './config/origins.js';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const publicUrl = process.env.RENDER_EXTERNAL_URL || (!isDev ? 'https://transit-atlas.onrender.com' : `http://localhost:${PORT}`);

if (isDev && (process.env.RENDER || process.env.RENDER_EXTERNAL_URL)) {
  throw new Error('NODE_ENV=development nije dopušten na produkcijskom hostingu');
}
await loadRuntimeSettings();
if (!hasStrongAdminPassword()) {
  throw new Error('ADMIN_PANEL_PASSWORD mora biti jedinstvena nasumična lozinka od 24 do 256 znakova');
}
if (isAuthenticationEnabled()) {
  const missing = missingAuthenticationEnvironment();
  if (missing.length) throw new Error(`Autentifikacija je uključena, ali nedostaju postavke: ${missing.join(', ')}`);
  await activateAuthentication();
}

// Render terminates TLS in front of the app and forwards the client's IP.
if (!isDev) {
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  if (!Number.isSafeInteger(proxyHops) || proxyHops < 0) throw new Error('Invalid TRUST_PROXY_HOPS');
  app.set('trust proxy', proxyHops);
}

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'sha256-HGd77+R4X9wA1al+gI4oP7Q6i0LwiO+DgUCFkEmQxcM='", 'challenges.cloudflare.com', 'accounts.google.com'],
  styleSrc: ["'self'", 'https://accounts.google.com/gsi/style'],
  styleSrcAttr: ["'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
  connectSrc: ["'self'", 'accounts.google.com', 'challenges.cloudflare.com'],
  frameSrc: ["'self'", 'challenges.cloudflare.com', 'accounts.google.com'],
  fontSrc: ["'self'", 'data:'],
};

app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: { directives: cspDirectives },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use((req, res, next) => {
  res.set('Permissions-Policy', 'camera=(), microphone=(), payment=(), geolocation=(self)');
  next();
});

const allowedOrigins = getAllowedOrigins();
app.use(['/api', '/hzpp-api'], (req, res, next) => {
  res.vary('Origin');
  next();
}, cors((req, callback) => {
  const origin = req.get('origin');
  const isApi = req.baseUrl.toLowerCase() === '/api';
  const allow = allowedOrigins.has(origin) && !(isApi && /^\/admin(?:\/|$)/i.test(req.path));
  callback(null, { origin: allow ? origin : false, credentials: allow && isApi && /^\/auth(?:\/|$)/i.test(req.path) });
}));

app.use('/api/admin', adminRoutes);

// Body parsing s ograničenjima
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

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
let hzppSearchLastSuccess = null;
let hzppSearchError = null;
let hzppSearchRequestStarted = 0;
let hzppLoadPromise = null;
const beogradData = { routes: [], stops: [], trips: [], stopTimes: [], stopTimesByStop: new Map(), stopTimeCount: 0, calendar: [], calendarDates: [], shapes: [], agency: [] };
let beogradLoaded = false;
let beogradLastUpdate = null;

let lastGtfsUpdate = null;
let gtfsLoaded = false;
let gtfsLoadError = null;
let gtfsLoadInProgress = false;
let gtfsRetryDelay = 60 * 1000;
let gtfsRetryTimer = null;
let rtFeedStatus = 'unknown';
let rtFeedError = null;
let staleVehiclesDropped = 0;
let realtimeCache = null;
let realtimeCacheTime = 0;
let realtimeFetchPromise = null;
let realtimeRetryAfter = 0;

const zetStaticHeaders = {
  'User-Agent': 'Transitly/1.0 (+https://transitly.eu)',
  Referer: 'https://www.zet.hr/gtfs2',
  Accept: 'application/zip, application/octet-stream, */*'
};
const zetRealtimeHeaders = {
  'User-Agent': 'Transitly/1.0 (+https://transitly.eu)',
  Referer: 'https://www.zet.hr/gtfs2',
  Accept: 'application/x-protobuf, application/octet-stream, */*'
};

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

function gtfsTimeSeconds(value) {
  if (!value) return 0;
  const [hour, minute, second] = String(value).split(':').map(Number);
  return [hour, minute, second].every(Number.isFinite) ? hour * 3600 + minute * 60 + second : 0;
}

async function indexGtfsStopTimes(filePath, trips, stops, includeTripTimes = false) {
  const tripIndexes = new Map(trips.map((trip, index) => [String(trip.trip_id), index]));
  const stopIndexes = new Map(stops.map((stop, index) => [String(stop.stop_id), index]));
  const grouped = new Map();
  const groupedByTrip = new Map();
  let count = 0;
  const parser = createReadStream(filePath).pipe(parseStream({
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true
  }));

  for await (const row of parser) {
    const tripIndex = tripIndexes.get(String(row.trip_id));
    if (tripIndex === undefined || !row.stop_id) continue;
    const stopIndex = stopIndexes.get(String(row.stop_id));
    const sequence = Number(row.stop_sequence);
    if (stopIndex !== undefined && row.stop_sequence !== '' && Number.isInteger(sequence) && sequence >= 0) {
      let entries = groupedByTrip.get(tripIndex);
      if (!entries) groupedByTrip.set(tripIndex, entries = []);
      if (includeTripTimes) {
        entries.push(stopIndex, sequence, gtfsTimeSeconds(row.arrival_time), gtfsTimeSeconds(row.departure_time));
      } else entries.push(stopIndex, sequence);
    }
    if (!row.departure_time) continue;
    const [hour, minute, second] = String(row.departure_time).split(':').map(Number);
    if (![hour, minute, second].every(Number.isFinite)) continue;
    let entries = grouped.get(String(row.stop_id));
    if (!entries) grouped.set(String(row.stop_id), entries = []);
    entries.push(tripIndex, hour * 3600 + minute * 60 + second, Number(row.stop_sequence) || 0);
    count++;
    if (count % 250000 === 0) console.log(`[GTFS Static] stop_times: indeksirano ${count} redaka`);
  }

  return {
    byStop: new Map([...grouped].map(([stopId, entries]) => [stopId, Uint32Array.from(entries)])),
    byTrip: new Map([...groupedByTrip].map(([index, entries]) => [
      String(trips[index].trip_id), Uint32Array.from(entries)
    ])),
    count
  };
}

function* stopTimesForStop(data, stopId) {
  if (data.stopTimesByStop instanceof Map) {
    const entries = data.stopTimesByStop.get(stopId) || [];
    for (let index = 0; index < entries.length; index += 3) {
      const seconds = entries[index + 1];
      const hour = Math.floor(seconds / 3600);
      const minute = Math.floor((seconds % 3600) / 60);
      const second = seconds % 60;
      yield {
        trip_id: data.trips[entries[index]]?.trip_id,
        departure_time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
        stop_sequence: entries[index + 2]
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

const zagrebDateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
const zagrebClockFormat = new Intl.DateTimeFormat('hr-HR', {
  timeZone: 'Europe/Zagreb', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function zagrebDateParts(date) {
  return Object.fromEntries(zagrebDateTimeFormat.formatToParts(date).map(({ type, value }) => [type, Number(value)]));
}

function zagrebTimeToEpoch({ year, month, day, hour, minute, second }) {
  const wallTime = Date.UTC(year, month - 1, day, hour, minute, second);
  let timestamp = wallTime;
  for (let attempt = 0; attempt < 3; attempt++) {
    const local = zagrebDateParts(new Date(timestamp));
    const displayedWallTime = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const adjusted = timestamp + wallTime - displayedWallTime;
    if (adjusted === timestamp) break;
    timestamp = adjusted;
  }
  return timestamp;
}

function addCalendarDays({ year, month, day }, amount) {
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function metersBetween(lat1, lon1, lat2, lon2) {
  const radians = degrees => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function dayNumber(date) {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function dayString(number) {
  return new Date(number * 86400000).toISOString().slice(0, 10);
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

// Preuzmi i parsiraj GTFS Static podatke
const gtfsFiles = {
  'routes.txt': 'routes',
  'stops.txt': 'stops',
  'trips.txt': 'trips',
  'stop_times.txt': 'stopTimes',
  'calendar.txt': 'calendar',
  'calendar_dates.txt': 'calendarDates',
  'shapes.txt': 'shapes',
  'agency.txt': 'agency'
};
const archiveLimit = 64 * 1024 * 1024;

async function readStaticFeed(response, publishMetadata, includeTripTimes = false) {
  if (!response.ok) {
    response.body?.destroy();
    throw new Error(`HTTP ${response.status}`);
  }
  const directory = await mkdtemp(join(tmpdir(), 'transitly-gtfs-'));
  try {
    await extractFeed(response, directory, Object.keys(gtfsFiles));
    const data = {};
    for (const [file, key] of Object.entries(gtfsFiles)) {
      if (key === 'stopTimes' || key === 'shapes') continue;
      const path = join(directory, file);
      data[key] = existsSync(path) ? parseGtfsCsv(readFileSync(path, 'utf8')) : [];
    }
    if (!data.routes.length || !data.stops.length || !data.trips.length) {
      throw new Error('GTFS feed is missing required transit records');
    }
    data.tripsById = new Map(data.trips.map(trip => [String(trip.trip_id), trip]));
    data.routesById = new Map(data.routes.map(route => [String(route.route_id), route]));
    data.stopsById = new Map(data.stops.map(stop => [String(stop.stop_id), stop]));
    publishMetadata?.(data);

    const indexed = await indexGtfsStopTimes(join(directory, 'stop_times.txt'), data.trips, data.stops, includeTripTimes);
    if (!indexed.count) throw new Error('GTFS feed has no indexed departures');
    data.stopTimesByStop = indexed.byStop;
    data.stopTimesByTrip = indexed.byTrip;
    data.stopTimesByTripStride = includeTripTimes ? 4 : 2;
    data.stopTimeCount = indexed.count;
    data.shapeResponse = await buildShapeResponse(data, join(directory, 'shapes.txt'));
    return data;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function loadGtfsData() {
  if (gtfsLoadInProgress) return;
  gtfsLoadInProgress = true;
  const allowedOrigin = 'https://www.zet.hr';
  const options = { allowedOrigin, maxBytes: archiveLimit, headers: zetStaticHeaders };

  try {
    let response = await fetchFeed(`${allowedOrigin}/gtfs-scheduled/latest`, options);
    if (!response.ok) {
      response.body?.destroy();
      const listing = await fetchFeed(`${allowedOrigin}/gtfs2`, { ...options, maxBytes: 2 * 1024 * 1024, timeout: 15_000 });
      if (listing.ok) {
        const html = await listing.text();
        const latestZip = html.match(/href=["']([^"']*scheduled-\d{3}-\d{6}\.zip)["']/i)?.[1];
        if (latestZip) response = await fetchFeed(new URL(latestZip, allowedOrigin), options);
      } else {
        listing.body?.destroy();
      }
    }

    gtfsData = await readStaticFeed(response, metadata => {
      if (!gtfsLoaded) {
        gtfsData = { ...gtfsData, ...metadata };
        realtimeCache = null;
      }
    });
    realtimeCache = null;
    lastGtfsUpdate = new Date();
    gtfsLoaded = true;
    gtfsLoadError = null;
    gtfsRetryDelay = 60 * 1000;
    if (gtfsRetryTimer) clearTimeout(gtfsRetryTimer);
    gtfsRetryTimer = null;
    console.log(`[GTFS Static] ✓ Podaci uspješno učitani: ${gtfsData.routes.length} linija, ${gtfsData.stops.length} stanica`);

  } catch (error) {
    console.error(`[GTFS Static] ✗ Greška: ${error.message}`);
    gtfsLoadError = 'GTFS_REFRESH_FAILED';
    if (!gtfsRetryTimer) {
      const delay = gtfsRetryDelay;
      gtfsRetryDelay = Math.min(gtfsRetryDelay * 2, 30 * 60 * 1000);
      gtfsRetryTimer = setTimeout(() => {
        gtfsRetryTimer = null;
        void loadGtfsData();
      }, delay);
      gtfsRetryTimer.unref?.();
    }
  } finally {
    gtfsLoadInProgress = false;
  }
  return gtfsLoadError === null;
}

async function loadHzppData() {
  if (hzppLoaded) return true;
  if (hzppLoadPromise) return hzppLoadPromise;
  const url = new URL(process.env.HZPP_GTFS_URL || 'https://www.hzpp.hr/GTFS_files.zip');
  hzppLoadPromise = (async () => {
    try {
      const response = await fetchFeed(url, { allowedOrigin: url.origin, maxBytes: archiveLimit, timeout: 60_000 });
      Object.assign(hzppData, await readStaticFeed(response, undefined, true));
      hzppLoaded = true;
      hzppLastUpdate = new Date();
      return true;
    } catch (error) {
      console.error('[HŽPP GTFS] Refresh failed:', error.name);
      return false;
    } finally {
      hzppLoadPromise = null;
    }
  })();
  return hzppLoadPromise;
}

async function loadBeogradData() {
  const url = 'https://data.gov.rs/sr/datasets/r/729be9a1-7ed9-453d-9a3d-68fa30f07529';
  try {
    const response = await fetchFeed(url, { allowedOrigin: new URL(url).origin, maxBytes: archiveLimit, timeout: 60_000 });
    Object.assign(beogradData, await readStaticFeed(response));
    beogradLoaded = true;
    beogradLastUpdate = new Date();
  } catch (error) {
    console.error('[Beograd GTFS] Refresh failed:', error.name);
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
  const now = Date.now();
  if (realtimeCache && now - realtimeCacheTime < 15_000) return realtimeCache;
  if (realtimeFetchPromise) return realtimeFetchPromise;
  if (now < realtimeRetryAfter) return null;

  realtimeFetchPromise = fetchRealtimeVehiclesFromZet();
  try {
    const result = await realtimeFetchPromise;
    if (result) {
      realtimeCache = result;
      realtimeCacheTime = Date.now();
      realtimeRetryAfter = 0;
    } else {
      realtimeRetryAfter = Date.now() + 10_000;
    }
    return result;
  } finally {
    realtimeFetchPromise = null;
  }
}

let watchingRareVehicles = false;
setInterval(async () => {
  if (!process.env.MONGODB_URI || watchingRareVehicles) return;
  watchingRareVehicles = true;
  try {
    const catalog = await dashboardCollection('dashboard_rare_vehicles');
    const currentEntries = await catalog.find({ rare: true }, { projection: { type: 1, model: 1 }, maxTimeMS: 2000 }).toArray();
    if (!currentEntries.length) return;
    const realtime = Date.now() - realtimeCacheTime < 55_000 ? realtimeCache : await fetchRealtimeVehicles();
    if (realtime && getRuntimeSettings().loginEnabled && !(await readDashboardSettings()).hideLiveVehicles) {
      const byId = new Map(currentEntries.map(entry => [entry._id, entry]));
      const sightings = realtime.vehicles.flatMap(vehicle => {
        const entry = byId.get(vehicle.zetId);
        return entry?.type === vehicle.type ? [{ ...vehicle, rare: true, model: entry.model }] : [];
      });
      await alertRareVehicleFollowers(sightings);
    }
  } catch (error) {
    console.error('[Rare vehicles monitor]', error.name);
  } finally {
    watchingRareVehicles = false;
  }
}, 60_000).unref();

async function fetchRealtimeVehiclesFromZet() {
  const rtUrl = 'https://www.zet.hr/gtfs-rt-protobuf';
  staleVehiclesDropped = 0;

  try {
    const response = await fetchFeed(rtUrl, { allowedOrigin: new URL(rtUrl).origin, headers: zetRealtimeHeaders, timeout: 10_000, maxBytes: 8 * 1024 * 1024 });
    if (!response.ok) {
      rtFeedStatus = `HTTP ${response.status}`;
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );

    rtFeedStatus = 'active';
    rtFeedError = null;
    const vehicles = [];
    const tripUpdatesByStop = new Map();
    const cancelledTrips = new Set();
    let staleCount = 0;
    const feedTimestamp = feed.header?.timestamp ? Number(feed.header.timestamp) * 1000 : Date.now();
    const { routesById, tripsById } = gtfsData;

    for (const entity of feed.entity) {
      const tripUpdate = entity.tripUpdate;
      const updatedTripId = String(tripUpdate?.trip?.tripId || '').trim();
      if (updatedTripId) {
        if (Number(tripUpdate.trip.scheduleRelationship) === 3) cancelledTrips.add(updatedTripId);
        for (const update of tripUpdate.stopTimeUpdate || []) {
          const stopId = String(update.stopId || '').trim();
          if (!stopId) continue;
          const time = update.departure?.time ?? update.arrival?.time;
          tripUpdatesByStop.set(`${updatedTripId}:${stopId}`, {
            timestamp: time == null ? null : Number(time) * 1000,
            delay: update.departure?.delay ?? update.arrival?.delay ?? null,
            scheduleRelationship: Number(update.scheduleRelationship ?? 0)
          });
        }
      }

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

        const trip = tripsById?.get(String(vehicle.trip?.tripId || '').trim());
        const route = routesById?.get(String(vehicle.trip?.routeId || '').trim()) ??
          routesById?.get(String(trip?.route_id || '').trim());
        const routeType = Number(route?.route_type);

        const lastUpdate = vehicle.timestamp ? Number(vehicle.timestamp) * 1000 : feedTimestamp;
        if (Date.now() - lastUpdate > 10 * 60 * 1000) {
          staleCount++;
          continue;
        }

        const fleetId = zetVehicleId(entity.id || '', vehicle.vehicle);
        vehicles.push({
          id: vehicleId,
          zetId: fleetId,
          type: routeType === 0 ? 'tram' : routeType === 3 ? 'bus' : 'unknown',
          line: route?.route_short_name || vehicle.trip?.routeId || 'N/A',
          direction: trip?.trip_headsign || route?.route_long_name || 'Nepoznato',
          lat: pos.latitude,
          lon: pos.longitude,
          lastUpdate,
          garageNumber: vehicle.vehicle?.label || null,
          registrationNumber: routeType === 3 ? vehicle.vehicle?.licensePlate || null : null,
          currentStopSequence: Object.hasOwn(vehicle, 'currentStopSequence') ? vehicle.currentStopSequence : null,
          currentStatus: Object.hasOwn(vehicle, 'currentStatus') ? vehicle.currentStatus : null,
          currentStopId: vehicle.stopId || null,
          speed: pos.speed == null ? null : Number(pos.speed),
          tripId: vehicle.trip?.tripId || null,
          routeId: vehicle.trip?.routeId || null,
          source: 'realtime'
        });
      }
    }

    await markRareVehicles(vehicles).catch(error => console.error('[Rare vehicles]', error.name));
    staleVehiclesDropped = staleCount;
    console.log(`[GTFS-RT] ✓ Učitano ${vehicles.length} vozila`);
    const vehiclesByTrip = new Map(vehicles.filter(vehicle => vehicle.tripId).map(vehicle => [String(vehicle.tripId), vehicle]));
    return { vehicles, vehiclesByTrip, tripUpdatesByStop, cancelledTrips, staleVehiclesDropped: staleCount };
  } catch (error) {
    rtFeedStatus = 'unavailable';
    rtFeedError = error.message;
    console.error(`[GTFS-RT] ✗ ${error.message}`);
    return null;
  }
}

app.get(['/api/health', '/api/system/status'], (req, res) => res.set('Cache-Control', 'no-store').json({ status: 'ok' }));

app.get('/api/vehicles/:cityId', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, vehiclesLimiter, asyncRoute(async (req, res) => {
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

  if ((await readDashboardSettings()).hideLiveVehicles) {
    return res.json({ status: 'unavailable', maintenance: true, vehicles: [], lastUpdate: Date.now() });
  }
  const realtime = await fetchRealtimeVehicles();

  if (realtime === null) {
    return res.json({
      status: 'unavailable',
      message: 'GTFS-Realtime feed nije dostupan',
      vehicles: [],
      lastUpdate: Date.now()
    });
  }

  res.set({
    'Cache-Control': 'public, max-age=0, s-maxage=10',
    'Cloudflare-CDN-Cache-Control': 'public, max-age=10'
  }).json({
    status: 'live',
    message: `Prikazano ${realtime.vehicles.length} vozila uživo`,
    vehicles: realtime.vehicles,
    staleVehiclesDropped: realtime.staleVehiclesDropped,
    lastUpdate: realtimeCacheTime,
    source: 'gtfs-realtime'
  });
}));

app.use('/api', apiLimiter);
function useAuthSession(req, res, next) {
  const middleware = getAuthenticationSessionMiddleware();
  return middleware ? middleware(req, res, next) : next();
}

const reportLimit = {
  windowMs: 10 * 60 * 1000,
  message: { error: 'Previše prijava. Pokušajte kasnije.' },
  standardHeaders: true,
  legacyHeaders: false
};
app.post('/api/auth/vehicle-reports', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, requireTrustedOrigin, rateLimit({ ...reportLimit, limit: 30 }), useAuthSession, requireAuth,
rateLimit({ ...reportLimit, limit: 6, keyGenerator: req => req.session.userId }), asyncRoute(async (req, res) => {
  const report = req.is('application/json') && validateVehicleReport(req.body);
  if (!report) return res.status(400).json({ error: 'Odaberite vozilo i razlog prijave.' });
  if (!isAuthenticationEnabled() || (await readDashboardSettings()).hideLiveVehicles) return res.status(403).json({ error: 'Ova značajka trenutačno nije dostupna.' });
  if (await User.exists({ _id: req.session.userId, vehicleReportsBlockedUntil: { $gt: new Date() } })) {
    return res.status(403).json({ error: 'Slanje dojava privremeno je ograničeno za ovaj račun.' });
  }
  const realtime = await fetchRealtimeVehicles();
  if (!realtime) return res.status(503).json({ error: 'Podaci uživo trenutačno nisu dostupni.' });
  const vehicle = realtime.vehicles.find(item => item.id === report.vehicleId && item.tripId === report.tripId);
  if (!vehicle || !['bus', 'tram'].includes(vehicle.type) || !/^[A-Za-z0-9-]{1,16}$/.test(vehicle.line)) {
    return res.status(404).json({ error: 'Vozilo više nije u podacima uživo.' });
  }
  if (!await recordVehicleReport(vehicle, req.session.userId, report.reason)) {
    return res.status(409).json({ error: 'Već ste prijavili ovu vožnju.' });
  }
  res.status(201).json({ message: 'Prijava je zaprimljena.' });
}));

app.use('/api/auth', useAuthSession, attachUser, authRoutes);
app.use('/api', secondLookRoutes);

app.get('/api/announcement', asyncRoute(async (req, res) => {
  const audience = req.query.audience === 'hzpp' ? 'hzpp' : 'zet';
  const options = await readDashboardSettings();
  const [announcement, vehicleNotices, bulletins] = await Promise.all([
    audience === 'zet' ? readAnnouncement() : null,
    audience === 'zet' && !options.pauseReports ? readVehicleNotices().catch(() => []) : [],
    listBulletins(audience).catch(() => [])
  ]);
  res.set('Cache-Control', 'no-store').json({ announcement, vehicleNotices, bulletins });
}));

const feedbackLimit = { windowMs: 60 * 60 * 1000, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Previše prijava. Pokušajte kasnije.' } };
app.post('/api/feedback', requireTrustedOrigin, rateLimit({ ...feedbackLimit, limit: 3 }),
  rateLimit({ ...feedbackLimit, limit: 100, keyGenerator: () => 'feedback' }), asyncRoute(async (req, res) => {
    const { category, area } = req.body ?? {};
    const text = cleanText(req.body?.text, 600);
    if (!req.is('application/json') || !['map', 'search', 'data', 'other'].includes(category) ||
      !['zet', 'hzpp', 'other'].includes(area) || !text || text.length < 10) {
      return res.status(400).json({ error: 'Opišite problem u 10 do 600 znakova.' });
    }
    const now = new Date();
    await (await feedbackCollection()).insertOne({ category, area, text, state: 'open', createdAt: now, expiresAt: new Date(+now + 30 * 86400_000) });
    res.set('Cache-Control', 'no-store').status(201).json({ message: 'Prijava je zaprimljena.' });
  }));

function publicStatus(options) {
  return {
    message: options.statusMessage,
    services: {
      zetLive: { state: options.hideLiveVehicles ? 'maintenance' : rtFeedStatus === 'unknown' ? 'unknown' : rtFeedStatus === 'active' ? 'available' : 'unavailable', updatedAt: realtimeCacheTime || null },
      zetTimetable: { state: gtfsLoaded ? (gtfsLoadError ? 'degraded' : 'available') : gtfsLoadError ? 'unavailable' : 'unknown', updatedAt: lastGtfsUpdate },
      hzppSearch: { state: hzppSearchError ? 'unavailable' : hzppSearchLastSuccess ? 'available' : 'unknown', updatedAt: hzppSearchLastSuccess }
    }
  };
}
app.get('/api/transit-status', asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'no-store').json(publicStatus(await readDashboardSettings()));
}));

// Javni bicikli (nextbike / Bajs) u svim hrvatskim gradovima.
app.get('/api/bikes/hr', asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=0, s-maxage=60');
  res.json(await listCroatianBikeStations());
}));

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

const servedStopsCache = new WeakMap();
// Stops that have at least one scheduled departure on a service that is still valid today or later.
function servedStopIds(data) {
  const today = zagrebDateParts(new Date());
  const todayKey = `${today.year}${String(today.month).padStart(2, '0')}${String(today.day).padStart(2, '0')}`;
  const cached = servedStopsCache.get(data.stops);
  if (cached?.todayKey === todayKey && cached.trips === data.trips) return cached.ids;
  const liveServices = new Set(data.calendar.filter(row => String(row.end_date) >= todayKey).map(row => String(row.service_id)));
  for (const row of data.calendarDates) {
    if (String(row.exception_type) === '1' && String(row.date) >= todayKey) liveServices.add(String(row.service_id));
  }
  const ids = new Set();
  if (data.stopTimesByStop instanceof Map) {
    for (const [stopId, entries] of data.stopTimesByStop) {
      for (let index = 0; index < entries.length; index += 3) {
        const trip = data.trips[entries[index]];
        if (trip && liveServices.has(String(trip.service_id))) { ids.add(String(stopId)); break; }
      }
    }
  } else {
    const tripsById = new Map(data.trips.map(trip => [String(trip.trip_id), trip]));
    for (const row of data.stopTimes) {
      const trip = tripsById.get(String(row.trip_id));
      if (trip && liveServices.has(String(trip.service_id))) ids.add(String(row.stop_id));
    }
  }
  servedStopsCache.set(data.stops, { todayKey, trips: data.trips, ids });
  return ids;
}

// Stanice
app.get('/api/stops/:cityId', (req, res) => {
  const { cityId } = req.params;

  const data = cityId === 'hzpp' ? hzppData : cityId === 'beograd' ? beogradData : gtfsData;
  if (!['zagreb', 'hzpp', 'beograd'].includes(cityId) || !data.stops.length) {
    return res.json({ stops: [], status: 'unavailable' });
  }

  const served = servedStopIds(data);
  const stops = served.size ? data.stops.filter(stop => served.has(String(stop.stop_id))) : data.stops;
  res.json({
    stops: stops.map(stop => ({
      id: stop.stop_id,
      name: stop.stop_name,
      lat: parseFloat(stop.stop_lat),
      lon: parseFloat(stop.stop_lon),
      code: stop.stop_code == null ? null : String(stop.stop_code),
      wheelchairAccessible: stop.wheelchair_boarding === '1'
    })),
    status: 'loaded',
    count: stops.length
  });
});

// Linije
app.get('/api/routes/:cityId', (req, res) => {
  const { cityId } = req.params;

  const data = cityId === 'hzpp' ? hzppData : cityId === 'beograd' ? beogradData : gtfsData;
  if (!['zagreb', 'hzpp', 'beograd'].includes(cityId) || !data.routes.length) {
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

  res.json(data.shapeResponse);
});

async function buildShapeResponse(data, filePath) {
  const routeByShape = new Map();
  for (const trip of data.trips) {
    if (trip.shape_id && !routeByShape.has(String(trip.shape_id))) routeByShape.set(String(trip.shape_id), String(trip.route_id));
  }
  const grouped = new Map();
  if (existsSync(filePath)) {
    const parser = parseStream({ columns: true, skip_empty_lines: true, trim: true, relax_quotes: true });
    const input = createReadStream(filePath);
    input.on('error', error => parser.destroy(error));
    input.pipe(parser);
    for await (const point of parser) {
      const lat = Number(point.shape_pt_lat);
      const lon = Number(point.shape_pt_lon);
      if (!point.shape_id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      let coordinates = grouped.get(point.shape_id);
      if (!coordinates) grouped.set(point.shape_id, coordinates = []);
      coordinates.push([lat, lon, Number(point.shape_pt_sequence)]);
    }
  }
  const shapes = [...grouped].map(([id, points]) => {
    points.sort((a, b) => a[2] - b[2]);
    for (const point of points) point.pop();
    const routeId = routeByShape.get(id) || '';
    return {
      id,
      routeId,
      color: data.routesById.get(routeId)?.route_color || null,
      coordinates: points
    };
  });
  return { shapes, status: 'loaded', count: shapes.length };
}

function tripStopsFor(data, tripId) {
  const entries = data.stopTimesByTrip?.get(String(tripId).trim()) ?? [];
  const stride = data.stopTimesByTripStride || 2;
  const stops = [];
  for (let index = 0; index + stride <= entries.length; index += stride) {
    const stop = data.stops[entries[index]];
    if (stop) stops.push({ id: String(stop.stop_id), sequence: entries[index + 1], lat: Number(stop.stop_lat), lon: Number(stop.stop_lon) });
  }
  return stops.sort((a, b) => a.sequence - b.sequence);
}

app.get('/api/vehicle/:vehicleId/registration', asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { vehicleId } = req.params;
  if (!/^[\w.-]{1,100}$/.test(vehicleId)) return res.sendStatus(400);
  const empty = { registrationNumber: null, source: null };
  if ((await readDashboardSettings()).hideLiveVehicles) return res.json(empty);
  const realtime = await fetchRealtimeVehicles();
  const vehicle = realtime?.vehicles.find(item => item.id === vehicleId);
  if (!vehicle || vehicle.type !== 'bus') return res.json(empty);
  if (vehicle.registrationNumber) return res.json({ registrationNumber: vehicle.registrationNumber, source: 'zet' });
  const registrationNumber = vehicle.zetId ? await getBusRegistration(vehicle.zetId) : null;
  res.json(registrationNumber ? { registrationNumber, source: 'autobusi.org' } : empty);
}));

app.get('/api/vehicle/:vehicleId', asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if ((await readDashboardSettings()).hideLiveVehicles) return res.status(503).json({ error: 'Lokacije vozila privremeno su skrivene.' });
  const realtime = await fetchRealtimeVehicles();
  if (!realtime) return res.status(503).json({ error: 'Podaci uživo trenutačno nisu dostupni.' });
  const vehicle = realtime.vehicles.find(item => item.id === req.params.vehicleId);
  if (!vehicle) return res.status(404).json({ error: 'Vozilo više nije u podacima uživo.' });

  const entries = gtfsData.stopTimesByTrip?.get(String(vehicle.tripId ?? '').trim()) ?? [];
  const stops = [];
  for (let index = 0; index < entries.length; index += 2) {
    const stop = gtfsData.stops[entries[index]];
    stops.push({ id: String(stop.stop_id), name: stop.stop_name, sequence: entries[index + 1], lat: Number(stop.stop_lat), lon: Number(stop.stop_lon) });
  }
  stops.sort((a, b) => a.sequence - b.sequence);

  let currentSequence = stops.some(stop => stop.sequence === vehicle.currentStopSequence)
    ? vehicle.currentStopSequence : null;
  if (currentSequence === null && vehicle.currentStopId) {
    const matchingStops = stops.filter(stop => stop.id === vehicle.currentStopId);
    if (matchingStops.length === 1) currentSequence = matchingStops[0].sequence;
  }
  const reportedSequence = currentSequence;
  currentSequence ??= estimateNextStop(stops, vehicle);
  const atStop = reportedSequence !== null &&
    vehicle.currentStatus === GtfsRealtimeBindings.transit_realtime.VehiclePosition.VehicleStopStatus.STOPPED_AT;
  res.json({
    ...vehicle,
    progressSource: reportedSequence !== null ? 'live' : currentSequence !== null ? 'estimated' : 'unavailable',
    stops: stops.map(({ id, name, sequence }) => ({
      id, name, sequence,
      status: currentSequence === null ? 'unknown' :
        sequence < currentSequence ? 'passed' :
          atStop && sequence === currentSequence ? 'current' : 'upcoming'
    }))
  });
}));

// Stanice na kojima staje putovanje
app.get('/api/:cityId/trip/:tripId/stops', (req, res) => {
  const { cityId, tripId } = req.params;
  if (!['zagreb', 'hzpp', 'beograd'].includes(cityId)) return res.status(404).json({ error: 'Mreža nije pronađena' });
  const data = cityId === 'hzpp' ? hzppData : cityId === 'beograd' ? beogradData : gtfsData;
  const stops = tripStopsFor(data, tripId).map(entry => {
    const stop = data.stopsById.get(entry.id);
    return {
      id: entry.id,
      name: stop?.stop_name ?? '',
      lat: entry.lat,
      lon: entry.lon,
      code: stop?.stop_code == null ? null : String(stop.stop_code),
      wheelchairAccessible: stop?.wheelchair_boarding === '1',
      sequence: entry.sequence
    };
  }).filter(stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lon));
  res.json({ stops, status: stops.length ? 'loaded' : 'unavailable' });
});

const activeServiceCache = new WeakMap();
function activeServicesFor(data, date) {
  const ymd = `${date.year}${String(date.month).padStart(2, '0')}${String(date.day).padStart(2, '0')}`;
  let byDate = activeServiceCache.get(data.calendar);
  if (!byDate) activeServiceCache.set(data.calendar, byDate = new Map());
  const cached = byDate.get(ymd);
  if (cached) return cached;
  const weekday = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()];
  const active = new Set(data.calendar.filter(x => ymd >= String(x.start_date) && ymd <= String(x.end_date) && String(x[weekday]) === '1').map(x => String(x.service_id)));
  for (const row of data.calendarDates.filter(x => String(x.date) === ymd)) {
    if (String(row.exception_type) === '1') active.add(String(row.service_id));
    else active.delete(String(row.service_id));
  }
  if (byDate.size >= 8) byDate.delete(byDate.keys().next().value);
  byDate.set(ymd, active);
  return active;
}

// Polasci sa stanice
app.get('/api/:cityId/stop/:stopId/departures', asyncRoute(async (req, res) => {
  const { cityId, stopId } = req.params;
  const data = cityId === 'hzpp' ? hzppData : cityId === 'beograd' ? beogradData : gtfsData;
  const loaded = cityId === 'hzpp' ? hzppLoaded : cityId === 'beograd' ? beogradLoaded : gtfsLoaded;

  if (!['zagreb', 'hzpp', 'beograd'].includes(cityId)) return res.status(404).json({ error: 'Mreža nije pronađena' });
  if (!loaded) {
    return res.status(503).json({ error: 'GTFS podaci nisu učitani' });
  }

  const stop = data.stopsById.get(stopId);
  if (!stop) {
    return res.status(404).json({ error: 'Stanica nije pronađena' });
  }

  const now = Date.now();
  const dateKey = date => `${date.year}${String(date.month).padStart(2, '0')}${String(date.day).padStart(2, '0')}`;
  const activeServicesOn = date => activeServicesFor(data, date);
  const today = zagrebDateParts(new Date(now));
  const serviceDays = [today, addCalendarDays(today, -1)].map(date => ({ date, active: activeServicesOn(date) }));
  const { tripsById, routesById } = data;
  const realtime = cityId === 'zagreb' && !(await readDashboardSettings()).hideLiveVehicles ? await fetchRealtimeVehicles() : null;
  const stopLat = Number(stop.stop_lat);
  const stopLon = Number(stop.stop_lon);
  const departures = [];
  for (const st of stopTimesForStop(data, stopId)) {
    if (!st.departure_time) continue;
    const trip = tripsById.get(String(st.trip_id));
    if (!trip) continue;
    const [rawHour, minute, second] = String(st.departure_time).split(':').map(Number);
    if (![rawHour, minute, second].every(Number.isFinite)) continue;
    for (const serviceDay of serviceDays) {
      if (!serviceDay.active.has(String(trip.service_id))) continue;
      const wallTime = new Date(Date.UTC(serviceDay.date.year, serviceDay.date.month - 1, serviceDay.date.day) + (rawHour * 3600 + minute * 60 + second) * 1000);
      const scheduledAt = zagrebTimeToEpoch({
        year: wallTime.getUTCFullYear(), month: wallTime.getUTCMonth() + 1, day: wallTime.getUTCDate(),
        hour: wallTime.getUTCHours(), minute: wallTime.getUTCMinutes(), second: wallTime.getUTCSeconds()
      });
      if (scheduledAt > now + 24 * 60 * 60 * 1000) continue;
      const tripId = String(st.trip_id);
      if (realtime?.cancelledTrips.has(tripId)) continue;
      const route = routesById.get(String(trip.route_id));
      const routeType = Number(route?.route_type);
      const type = routeType === 0 ? 'tram' : routeType === 3 ? 'bus' : 'unknown';
      const stopUpdate = realtime?.tripUpdatesByStop.get(`${tripId}:${stopId}`);
      if (stopUpdate?.scheduleRelationship === 6) continue;

      let timestamp = scheduledAt;
      let source = 'scheduled';
      if (stopUpdate && stopUpdate.scheduleRelationship !== 7) {
        if (stopUpdate.timestamp !== null && Number.isFinite(stopUpdate.timestamp)) {
          timestamp = stopUpdate.timestamp;
          source = 'live';
        } else if (stopUpdate.delay !== null && Number.isFinite(Number(stopUpdate.delay))) {
          timestamp = scheduledAt + Number(stopUpdate.delay) * 1000;
          source = 'live';
        }
      }

      const vehicle = source === 'scheduled' ? realtime?.vehiclesByTrip.get(tripId) : null;
      const stopSequence = Number(st.stop_sequence);
      if (vehicle && stopSequence > 0 && scheduledAt >= now - 3 * 60 * 1000 && scheduledAt <= now + 12 * 60 * 1000 &&
          Date.now() - vehicle.lastUpdate <= 2 * 60 * 1000 &&
          !vehicleHasPassedStop(vehicle, stopSequence, () => tripStopsFor(data, tripId))) {
        const distance = metersBetween(vehicle.lat, vehicle.lon, stopLat, stopLon);
        if (distance <= 12000) {
          const measuredSpeed = Number(vehicle.speed);
          const speed = measuredSpeed > 2 ? measuredSpeed : type === 'tram' ? 5.5 : 4.2;
          const estimate = now + Math.max(45, distance * 1.35 / speed) * 1000;
          if (estimate <= now + 60 * 60 * 1000) {
            timestamp = estimate;
            source = 'estimated';
          }
        }
      }

      if (timestamp <= now) continue;
      departures.push({
        time: zagrebClockFormat.format(new Date(timestamp)),
        timestamp,
        source,
        type,
        route: route?.route_short_name || 'N/A',
        direction: trip.trip_headsign || 'Nepoznato',
        tripId
      });
    }
  }
  departures.sort((a, b) => a.timestamp - b.timestamp);
  const ymd = dateKey(today);
  res.json({
    stop: {
      id: stop.stop_id,
      name: stop.stop_name,
      lat: parseFloat(stop.stop_lat),
      lon: parseFloat(stop.stop_lon)
    },
    departures: departures.slice(0, 50),
    serviceDate: ymd,
    realtime: realtime?.tripUpdatesByStop.size ? 'trip_updates' : realtime ? 'vehicle_positions' : 'unavailable',
    message: realtime?.tripUpdatesByStop.size
      ? 'Polasci s oznakom Uživo koriste ZET-ove GTFS-Realtime podatke; Procjena uživo koristi lokaciju vozila.'
      : realtime
        ? 'ZET ne šalje predviđanje za svako stajalište; Procjena uživo koristi lokaciju vozila, ostalo je po rasporedu.'
        : 'Prikazan je službeni vozni red.'
  });
}));

const journeyStopsCache = new Map();
app.get('/hzpp-api/journey-stops', heavyLimiter, asyncRoute(async (req, res) => {
  const { number, start, end, date, departure } = req.query;
  if (typeof number !== 'string' || typeof start !== 'string' || typeof end !== 'string' || typeof date !== 'string' ||
      [number, start, end].some(value => !value || value.length > 200) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || (departure !== undefined && (typeof departure !== 'string' || departure.length > 10))) {
    return res.status(400).json({ error: 'Neispravan zahtjev za detalje vlaka.' });
  }
  if (!hzppLoaded && !await loadHzppData()) return res.status(502).json({ error: 'Vozni red HŽPP-a trenutačno nije dostupan.' });
  const key = JSON.stringify([number, start, end, date, departure]);
  const cached = journeyStopsCache.get(key);
  if (cached?.expiresAt > Date.now()) return res.json(cached.result);
  journeyStopsCache.delete(key);
  const norm = value => String(value || '').toLocaleLowerCase('hr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\bkol\.?(?=\s|$)/g, 'kolodvor').replace(/\s+/g, ' ').trim();
  const [year, month, day] = date.split('-').map(Number);
  const weekday = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const ymd = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  const services = new Set(hzppData.calendar.filter(row => ymd >= String(row.start_date) && ymd <= String(row.end_date) && String(row[weekday]) === '1').map(row => String(row.service_id)));
  for (const row of hzppData.calendarDates.filter(item => String(item.date) === ymd)) {
    if (String(row.exception_type) === '1') services.add(String(row.service_id)); else services.delete(String(row.service_id));
  }
  const stops = hzppData.stops;
  const stopName = stop => norm(stop.stop_name);
  const matches = [];
  for (let tripIndex = 0; tripIndex < hzppData.trips.length; tripIndex++) {
    const trip = hzppData.trips[tripIndex];
    if (String(trip.trip_short_name || trip.trip_id) !== number || !services.has(String(trip.service_id))) continue;
    const values = hzppData.stopTimesByTrip?.get(String(trip.trip_id));
    if (!values) continue;
    const stride = hzppData.stopTimesByTripStride || 2;
    const stopsOnTrip = [];
    for (let i = 0; i + stride <= values.length; i += stride) {
      const stop = stops[values[i]];
      if (!stop) continue;
      stopsOnTrip.push({ name: stop.stop_name, sequence: values[i + 1], arrival: stride === 4 ? values[i + 2] : 0, departure: stride === 4 ? values[i + 3] : 0 });
    }
    stopsOnTrip.sort((a, b) => a.sequence - b.sequence);
    const fromIndex = stopsOnTrip.findIndex(stop => stopName({ stop_name: stop.name }) === norm(start));
    const toIndex = stopsOnTrip.findIndex((stop, index) => index > fromIndex && stopName({ stop_name: stop.name }) === norm(end));
    if (fromIndex < 0 || toIndex < 0) continue;
    const routeStops = stopsOnTrip.slice(fromIndex, toIndex + 1).map(stop => ({
      name: stop.name,
      arrival: stop.arrival ? `${String(Math.floor(stop.arrival / 3600)).padStart(2, '0')}:${String(Math.floor(stop.arrival % 3600 / 60)).padStart(2, '0')}` : null,
      departure: stop.departure ? `${String(Math.floor(stop.departure / 3600)).padStart(2, '0')}:${String(Math.floor(stop.departure % 3600 / 60)).padStart(2, '0')}` : null
    }));
    const startDeparture = stopsOnTrip[fromIndex].departure;
    const expected = typeof departure === 'string' && /^\d{2}:\d{2}$/.test(departure)
      ? Number(departure.slice(0, 2)) * 3600 + Number(departure.slice(3)) * 60
      : null;
    const route = { from: stopsOnTrip[0].name, to: stopsOnTrip.at(-1).name };
    matches.push({ stops: routeStops, route, distance: expected === null ? 0 : Math.abs(startDeparture - expected) });
  }
  matches.sort((a, b) => a.distance - b.distance);
  const result = { source: 'GTFS raspored', journeys: matches.slice(0, 1).map(({ stops, route }) => ({ stops, route })) };
  if (journeyStopsCache.size >= 256) journeyStopsCache.delete(journeyStopsCache.keys().next().value);
  journeyStopsCache.set(key, { result, expiresAt: Date.now() + 60_000 });
  res.json(result);
}));

let lastManualTimetableRefresh = 0;
adminRoutes.post('/system/refresh-timetable', asyncRoute(async (req, res) => {
  if (gtfsLoadInProgress) return res.status(409).json({ error: 'Vozni red se već učitava.' });
  if (Date.now() - lastManualTimetableRefresh < 5 * 60_000) {
    return res.status(429).json({ error: 'Pričekajte pet minuta između ručnih osvježavanja.' });
  }
  lastManualTimetableRefresh = Date.now();
  if (!await loadGtfsData()) return res.status(502).json({ error: 'Osvježavanje voznog reda nije uspjelo.' });
  await auditDashboard('timetable.refresh');
  res.json({ lastGtfsUpdate });
}));

adminRoutes.post('/system/refresh-live', asyncRoute(async (req, res) => {
  const result = await fetchRealtimeVehicles();
  if (!result) return res.status(502).json({ error: 'ZET podatke nije moguće osvježiti.' });
  await auditDashboard('realtime.refresh');
  res.json({ count: result.vehicles.length });
}));

adminRoutes.get('/system/status', asyncRoute(async (req, res) => {
  res.json({
    ...publicStatus(await readDashboardSettings()),
    vehicles: realtimeCache?.vehicles.length ?? 0,
    hzppSearchError,
    rtFeedError,
    gtfsLoaded,
    gtfsLoadError,
    hzppLoaded,
    hzppLastUpdate,
    beogradLoaded,
    beogradLastUpdate,
    lastGtfsUpdate,
    rtFeedStatus,
    staleVehiclesDropped,
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
}));

// Frontend - statički serviranje
const frontendDist = join(process.cwd(), 'dist');
const hzppDist = join(frontendDist, 'hzpp');
const hzppApiBase = 'https://prodaja.hzpp.hr/hzpp-sales-middleware-web';
const hzppQueryKeys = ['lang', 'deviceType', 'clientUICOperatorCode', 'from', 'to', 'startTime', 'trainClass', 'benefit', 'countForBenefit', 'transportChanges'];
async function proxyHzpp(req, res) {
  const endpoint = req.path.endsWith('/stations') ? '/stations' : '/journeys-with-details/busInfo';
  const query = new URLSearchParams();
  for (const key of hzppQueryKeys) {
    const value = req.query[key];
    if (typeof value === 'string') query.set(key, value);
  }
  if (endpoint.includes('busInfo') && (!/^\d+$/.test(query.get('from') || '') || !/^\d+$/.test(query.get('to') || '') || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(query.get('startTime') || ''))) {
    return res.status(400).json({ error: 'Neispravan zahtjev za polaske.' });
  }
  const searchStarted = endpoint.includes('busInfo') ? Date.now() : 0;
  function recordSearch(error) {
    if (!searchStarted || searchStarted < hzppSearchRequestStarted) return;
    hzppSearchRequestStarted = searchStarted;
    hzppSearchError = error;
    if (!error) hzppSearchLastSuccess = new Date();
  }
  try {
    const upstream = await fetch(`${hzppApiBase}${endpoint}?${query}`, {
      headers: { 'X-device-type': 'PORTAL', deviceType: 'WEB', Language: query.get('lang') || 'hr' },
      signal: AbortSignal.timeout(12000)
    });
    const contents = await upstream.text();
    if (upstream.ok && upstream.headers.get('content-type')?.includes('json')) recordSearch(null);
    else if (upstream.ok) recordSearch('HŽPP je vratio neispravan odgovor.');
    else if (upstream.status >= 500) recordSearch(`HTTP ${upstream.status}`);
    res.status(upstream.status).set('content-type', upstream.headers.get('content-type') || 'application/json').send(contents);
  } catch {
    recordSearch('HŽPP nije odgovorio.');
    res.status(502).json({ error: 'HŽPP trenutačno nije dostupan.' });
  }
}
app.get('/hzpp-api/stations', apiLimiter, proxyHzpp);
app.get('/hzpp-api/journeys-with-details/busInfo', apiLimiter, proxyHzpp);
app.use('/hzpp', express.static(hzppDist));
app.get('/hzpp/*', (req, res) => {
  const indexPath = join(hzppDist, 'index.html');
  if (!existsSync(indexPath)) return res.status(503).send('HŽPP prikaz nije izgrađen. Pokrenite npm run build.');
  res.sendFile(indexPath);
});
app.get('/admin', requireAdminAccess, (req, res) => {
  const indexPath = join(frontendDist, 'index.html');
  if (!existsSync(indexPath)) return res.status(503).send('Frontend nije izgrađen. Pokrenite npm run build.');
  res.sendFile(indexPath);
});
app.get('/auth/turnstile', helmet.contentSecurityPolicy({
  directives: { ...cspDirectives, frameAncestors: ['https://localhost', 'capacitor://localhost'] }
}), (req, res) => {
  const indexPath = join(frontendDist, 'index.html');
  if (!existsSync(indexPath)) return res.status(503).send('Frontend nije izgrađen. Pokrenite npm run build.');
  res.removeHeader('X-Frame-Options');
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
  res.sendFile(indexPath);
});
app.get(['/', '/index.html'], redirectAdminHome);
app.use(express.static(frontendDist));
app.get('/', (req, res) => {
  const indexPath = join(frontendDist, 'index.html');
  if (!existsSync(indexPath)) {
    return res.status(503).send('Frontend nije izgrađen. Pokrenite npm run build.');
  }
  res.sendFile(indexPath);
});
app.get(['/verify-email', '/reset-password', '/confirm-parent', '/privacy', '/terms', '/cookies', '/delete-account', '/status', '/feedback'], (req, res) => {
  const indexPath = join(frontendDist, 'index.html');
  if (!existsSync(indexPath)) return res.status(503).send('Frontend nije izgrađen. Pokrenite npm run build.');
  if (['/verify-email', '/reset-password', '/confirm-parent'].includes(req.path.replace(/\/$/, '').toLowerCase())) {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  }
  res.sendFile(indexPath);
});
// Error handler
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Neispravan format zahtjeva.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Zahtjev je prevelik.' });
  console.error('Request failed:', err.name);
  res.status(500).json({ error: 'Interna greška servera' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Transitly Backend');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Server: ${publicUrl}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'unset (restricted)'}`);
  console.log('');
  console.log('  GTFS Izvori:');
  console.log('  • Static:   https://www.zet.hr/gtfs-scheduled/latest');
  console.log('  • Realtime: https://www.zet.hr/gtfs-rt-protobuf');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
});
