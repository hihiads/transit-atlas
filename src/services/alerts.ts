import { LocalNotifications } from '@capacitor/local-notifications';
import { isNativeApp } from './platform';
import { requestDepartureNotificationPermission } from './localDepartureNotifications';

// Alerts for tracked departures and trains, on every platform.
// Web (Windows, Mac, Linux, Android browsers): shown through the service worker, because
// new Notification() throws on Android Chrome. Native app: local notification, shown at once.

export function registerAlertWorker() {
  if (isNativeApp() || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

export function alertsAllowed(): boolean {
  if (isNativeApp()) return true; // the native permission is requested when tracking starts
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

export async function requestAlertPermission(): Promise<boolean> {
  if (isNativeApp()) return requestDepartureNotificationPermission();
  if (typeof Notification === 'undefined') return false;
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  return permission === 'granted';
}

function notificationId(key: string) {
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 2_000_000_000) + 1;
}

export function showAlert(title: string, body: string, tag: string): void {
  if (isNativeApp()) {
    void LocalNotifications.schedule({
      notifications: [{
        id: notificationId(tag),
        title,
        body,
        schedule: { at: new Date(Date.now() + 500), allowWhileIdle: true },
        channelId: 'transitly-departures'
      }]
    }).catch(() => {});
    return;
  }
  if (!alertsAllowed()) return;
  const options: NotificationOptions = { body, tag, icon: '/favicon.png' };
  const fallback = () => {
    try { new Notification(title, options); } catch { /* the browser does not allow page notifications */ }
  };
  if (!('serviceWorker' in navigator)) return fallback();
  void navigator.serviceWorker.getRegistration()
    .then(registration => (registration ? registration.showNotification(title, options) : fallback()))
    .catch(fallback);
}
