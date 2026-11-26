import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { API_ROOT } from './platform';

const tokenKey = 'transit-push-device-token';
const pendingKey = 'transit-push-pending-watches';

function readPending(): string[] {
  try { return JSON.parse(localStorage.getItem(pendingKey) || '[]'); } catch { return []; }
}

// iPhone (APNs) push for delay, early and arriving alerts and admin feedback reports.
export function iphonePushAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

async function postJson(method: 'POST' | 'DELETE', path: string, body: unknown) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Push request failed: ${response.status}`);
}

async function listenForToken() {
  await PushNotifications.removeAllListeners();
  await PushNotifications.addListener('registration', ({ value }) => {
    localStorage.setItem(tokenKey, value);
    postJson('POST', '/push/devices', { token: value })
      .then(() => flushPendingWatches())
      .catch(() => {});
  });
  await PushNotifications.addListener('registrationError', () => {});
  await PushNotifications.register();
}

// Silent: registers the device again only if notification permission is already granted.
export async function ensureIphonePushRegistered(): Promise<boolean> {
  if (!iphonePushAvailable()) return false;
  const permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') return false;
  await listenForToken();
  return true;
}

// Asks for permission (the same prompt as local reminders), then registers the device.
export async function enableIphonePush(): Promise<boolean> {
  if (!iphonePushAvailable()) return false;
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return false;
  await listenForToken();
  return true;
}

// key format: cityId:stopId:tripId:HH:MM:timestamp (see SchedulePanel tracked keys).
function parseDepartureKey(key: string) {
  const parts = key.split(':');
  const departureAt = Number(parts[parts.length - 1]);
  return { cityId: parts[0], stopId: parts[1], tripId: parts[2], departureAt };
}

export async function addDepartureWatch(key: string) {
  const token = localStorage.getItem(tokenKey);
  const { cityId, stopId, tripId, departureAt } = parseDepartureKey(key);
  if (!Number.isFinite(departureAt)) return;
  if (!token) {
    // Token not issued yet: remember the watch and send it once the device is registered.
    localStorage.setItem(pendingKey, JSON.stringify([...new Set([...readPending(), key])]));
    return;
  }
  await postJson('POST', '/push/watches', { token, cityId, stopId, tripId, departureAt });
}

async function flushPendingWatches() {
  const pending = readPending();
  localStorage.removeItem(pendingKey);
  for (const key of pending) await addDepartureWatch(key).catch(() => {});
}

export async function removeDepartureWatch(key: string) {
  const token = localStorage.getItem(tokenKey);
  const { stopId, tripId, departureAt } = parseDepartureKey(key);
  if (!token || !Number.isFinite(departureAt)) return;
  await postJson('DELETE', '/push/watches', { token, stopId, tripId, departureAt });
}
