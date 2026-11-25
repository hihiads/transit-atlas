import { locale, t } from './i18n';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

function notificationIds(key: string) {
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const first = ((hash >>> 0) % 1_000_000) * 2 + 1;
  return [first, first + 1];
}

export async function requestDepartureNotificationPermission() {
  if (!Capacitor.isNativePlatform()) {
    if (!('Notification' in window)) return false;
    return (await Notification.requestPermission()) === 'granted';
  }
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
  if (permission.display === 'granted' && Capacitor.getPlatform() === 'android') {
    await LocalNotifications.createChannel({
      id: 'transitly-departures',
      name: t("Podsjetnici za polaske"),
      description: t("Podsjetnici za polaske koje pratite"),
      importance: 4,
      visibility: 1
    });
  }
  return permission.display === 'granted';
}

export async function scheduleDepartureReminders(key: string, timestamp: number, route: string, direction: string) {
  if (!Capacitor.isNativePlatform()) return;
  const now = Date.now();
  const [tenMinuteId, departureId] = notificationIds(key);
  const notifications = [];
  const label = [route, direction].filter(Boolean).join(' · ');

  if (timestamp - 10 * 60_000 > now) {
    notifications.push({
      id: tenMinuteId,
      title: t("Polazak za 10 minuta"),
      body: t("{0} polazi u {1}.", label, new Date(timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })),
      schedule: { at: new Date(timestamp - 10 * 60_000), allowWhileIdle: true, isExactNotification: false },
      channelId: 'transitly-departures'
    });
  }
  if (timestamp > now) {
    notifications.push({
      id: departureId,
      title: t("Vrijeme polaska"),
      body: t("{0} polazi sada.", label),
      schedule: { at: new Date(timestamp), allowWhileIdle: true, isExactNotification: false },
      channelId: 'transitly-departures'
    });
  }

  if (notifications.length) await LocalNotifications.schedule({ notifications });
}

export async function cancelDepartureReminders(key: string) {
  if (!Capacitor.isNativePlatform()) return;
  const [first, second] = notificationIds(key);
  await LocalNotifications.cancel({ notifications: [{ id: first }, { id: second }] });
}
