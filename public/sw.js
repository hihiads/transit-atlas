// Transitly notification worker: shows departure and delay alerts, opens the app on tap and makes
// the site installable. It does not cache anything: the fetch handler lets every request go to the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(client => 'focus' in client);
    if (open) return open.focus();
    return self.clients.openWindow('/');
  })());
});
