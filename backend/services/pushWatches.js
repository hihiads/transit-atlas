// Departure watches for iPhone push: late, early ("uranio") and arriving-at-stop alerts.
import { dashboardCollection } from './dashboard.js';
import { pushConfigured, sendAlerts } from './apns.js';

const LATE_SECONDS = 5 * 60;
const EARLY_SECONDS = -2 * 60;
const OPEN_BEFORE_MS = 60 * 60 * 1000;
const FRESH_VEHICLE_MS = 2 * 60 * 1000;
const WATCH_AFTER_DEPARTURE_MS = 2 * 60 * 60 * 1000;

const minutes = seconds => Math.max(1, Math.round(Math.abs(seconds) / 60));

// Pure decision: what to tell the user now, and which one-time flags to set.
// watch: stored doc. state: { now, delaySeconds (NaN if unknown), cancelled, vehicleFresh, vehicleSequence (null if unknown) }.
export function evaluateWatch(watch, state) {
  const result = { notifications: [], updates: {} };
  const { now, delaySeconds, cancelled, vehicleFresh, vehicleSequence } = state;
  if (cancelled || now > watch.expiresAt || now < watch.departureAt - OPEN_BEFORE_MS) return result;
  const { line, stopName, stopSequence } = watch;

  if (Number.isFinite(delaySeconds)) {
    if (delaySeconds >= LATE_SECONDS && !watch.delayNotifiedAt) {
      result.notifications.push({ type: 'delay', title: `${line} kasni`,
        body: `${line} na stajalište ${stopName} kasni ${minutes(delaySeconds)} min.` });
      result.updates.delayNotifiedAt = now;
    } else if (delaySeconds <= EARLY_SECONDS && !watch.earlyNotifiedAt) {
      result.notifications.push({ type: 'early', title: `${line} je uranio`,
        body: `${line} je na stajalište ${stopName} došao ${minutes(delaySeconds)} min ranije.` });
      result.updates.earlyNotifiedAt = now;
    }
  }

  if (vehicleFresh && vehicleSequence !== null && !watch.arrivalNotifiedAt) {
    if (vehicleSequence > stopSequence) {
      result.updates.arrivalNotifiedAt = now; // already past this stop: stop watching silently
    } else if (vehicleSequence >= stopSequence - 1) {
      const at = vehicleSequence === stopSequence;
      result.notifications.push({ type: 'arrival', title: `${line} ${at ? 'je stigao' : 'stiže'}`,
        body: `${line} ${at ? 'je na' : 'je blizu'} stajališta ${stopName}.` });
      result.updates.arrivalNotifiedAt = now;
    }
  }
  return result;
}

async function devices() {
  const collection = await dashboardCollection('push_devices');
  return collection;
}

export async function registerDevice(token, platform) {
  const collection = await devices();
  await collection.updateOne({ token }, { $set: { token, platform, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
}

async function removeDeviceAndWatches(token) {
  await (await devices()).deleteOne({ token });
  await (await dashboardCollection('push_watches')).deleteMany({ token });
}

export async function addWatch(doc) {
  const collection = await dashboardCollection('push_watches');
  await collection.updateOne({ key: doc.key }, { $set: doc }, { upsert: true });
}

export async function removeWatch(token, key) {
  await (await dashboardCollection('push_watches')).deleteOne({ token, key });
}

export async function ensureWatchIndexes() {
  const watches = await dashboardCollection('push_watches');
  await watches.createIndex({ key: 1 }, { unique: true });
  await watches.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const deviceCollection = await devices();
  await deviceCollection.createIndex({ token: 1 }, { unique: true });
}

// Called once a minute by server.js. realtime: fetchRealtimeVehicles() result.
// resolveSequence(vehicle) returns the vehicle's current stop sequence or null.
export async function checkWatches({ realtime, now, resolveSequence }) {
  if (!pushConfigured || !realtime) return { sent: 0 };
  const watches = await (await dashboardCollection('push_watches')).find({ expiresAt: { $gt: new Date(now) }, arrivalNotifiedAt: null }).toArray();
  let sent = 0;
  for (const watch of watches) {
    const stopUpdate = realtime.tripUpdatesByStop.get(`${watch.tripId}:${watch.stopId}`);
    const vehicle = realtime.vehiclesByTrip.get(watch.tripId);
    const vehicleFresh = Boolean(vehicle) && now - vehicle.lastUpdate <= FRESH_VEHICLE_MS;
    const result = evaluateWatch(watch, {
      now,
      delaySeconds: stopUpdate?.delay == null ? NaN : Number(stopUpdate.delay),
      cancelled: realtime.cancelledTrips.has(watch.tripId),
      vehicleFresh,
      vehicleSequence: vehicleFresh ? resolveSequence(vehicle) : null
    });
    if (Object.keys(result.updates).length) {
      await (await dashboardCollection('push_watches')).updateOne({ key: watch.key }, { $set: result.updates });
    }
    for (const note of result.notifications) {
      const [outcome] = await sendAlerts([watch.token], { title: note.title, body: note.body, data: { type: note.type, tripId: watch.tripId, stopId: watch.stopId } });
      if (outcome && (outcome.status === 410 || ['BadDeviceToken', 'Unregistered'].includes(outcome.reason))) {
        await removeDeviceAndWatches(watch.token);
        break;
      }
      if (outcome?.ok) sent++;
    }
  }
  await (await dashboardCollection('push_watches')).deleteMany({ expiresAt: { $lte: new Date(now) } });
  return { sent };
}

export const watchLifetimeMs = WATCH_AFTER_DEPARTURE_MS;

// Notify every admin device token (env APNS_ADMIN_TOKENS, comma separated) about a new feedback report.
export async function notifyAdminDevices(alert) {
  const tokens = (process.env.APNS_ADMIN_TOKENS || '').split(',').map(token => token.trim()).filter(Boolean);
  if (!pushConfigured || tokens.length === 0) return [];
  return sendAlerts(tokens, alert);
}
