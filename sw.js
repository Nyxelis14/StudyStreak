/**
 * StudyStreak Service Worker v4
 * ─────────────────────────────
 * Features:
 *  1. Offline caching (cache-first for assets, network-first for pages)
 *  2. Hourly study reminder push notifications
 *  3. Background periodic sync (where supported)
 *  4. Install/update lifecycle management
 */

const CACHE = 'studystreak-v4';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
];

/* ─── INSTALL: Pre-cache all static assets ─── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).catch(() => {})) // graceful if icons missing
      .then(() => self.skipWaiting()) // activate immediately
  );
});

/* ─── ACTIVATE: Remove old caches ─── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // take control immediately
  );
});

/* ─── FETCH: Cache-first for assets, network-first for navigation ─── */
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Google Fonts — network first, cache fallback
  if (url.includes('fonts.g')) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const clone = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Everything else — cache first, network fallback, then offline page
  e.respondWith(
    caches.match(e.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(e.request)
          .then(r => {
            // Only cache same-origin GET requests
            if (e.request.method === 'GET' && url.startsWith(self.location.origin)) {
              const clone = r.clone();
              caches.open(CACHE).then(c => c.put(e.request, clone));
            }
            return r;
          })
          .catch(() => caches.match('./index.html')); // offline fallback
      })
  );
});

/* ─── PUSH NOTIFICATIONS: Hourly reminders ─── */
// Fired when a push message arrives from the server (or via showNotification)
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'StudyStreak 📚';
  const body  = data.body  || "Time to study! Keep your streak alive 🔥";

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  './icons/icon-192x192.png',
      badge: './icons/icon-192x192.png',
      tag:   'studystreak-reminder',   // replaces previous notification (no spam)
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: self.location.origin + '/index.html' },
      actions: [
        { action: 'open',   title: '📖 Study Now' },
        { action: 'snooze', title: '⏰ Remind in 30 min' },
      ],
    })
  );
});

/* ─── NOTIFICATION CLICK: Open or focus the app ─── */
self.addEventListener('notificationclick', e => {
  e.notification.close();

  if (e.action === 'snooze') {
    // Schedule a one-off reminder in 30 minutes via alarm (client side handles this)
    // Post message back to clients so the app knows to schedule a snooze
    self.clients.matchAll({ type: 'window' }).then(clients => {
      clients.forEach(c => c.postMessage({ type: 'snooze', minutes: 30 }));
    });
    return;
  }

  // open or focus the app window
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        const appClient = clients.find(c => c.url.includes('index.html') || c.url.endsWith('/'));
        if (appClient) return appClient.focus();
        return self.clients.openWindow('./index.html');
      })
  );
});

/* ─── PERIODIC BACKGROUND SYNC: Hourly reminders (Chrome Android) ─── */
// This fires periodically when registered with tag 'hourly-reminder'
self.addEventListener('periodicsync', e => {
  if (e.tag === 'hourly-reminder') {
    e.waitUntil(
      self.registration.showNotification('StudyStreak ⏰', {
        body: "An hour has passed — time for a study session! 🔥",
        icon: './icons/icon-192x192.png',
        badge: './icons/icon-192x192.png',
        tag:  'studystreak-reminder',
        renotify: true,
        vibrate: [200, 100, 200],
        data: { url: self.location.origin + '/index.html' },
      })
    );
  }
});

/* ─── MESSAGE: Handle messages from main thread ─── */
self.addEventListener('message', e => {
  // Allow the app to trigger a test notification
  if (e.data && e.data.type === 'SHOW_REMINDER') {
    const msg = e.data.message || "Time to study! Keep your streak alive 🔥";
    self.registration.showNotification('StudyStreak 📚', {
      body: msg,
      icon:  './icons/icon-192x192.png',
      badge: './icons/icon-192x192.png',
      tag:   'studystreak-reminder',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: self.location.origin + '/index.html' },
    });
  }

  // Skip waiting (for update flow)
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
