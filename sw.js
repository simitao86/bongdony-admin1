const CACHE_NAME = 'bongdony-v4';
const ASSETS = ['./index.html', './style.css', './app.js', './manifest.json', './LOGO1.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).catch(() => caches.match('./index.html'))
    )
  );
});

self.addEventListener('push', event => {
  const data = event.data?.json() || { title: 'Bongdony', body: 'New notification.' };
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: './LOGO1.png',
    badge: './LOGO1.png',
    vibrate: [200, 100, 200]
  }));
});
