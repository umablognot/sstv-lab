/*
 * SSTV Lab — offline service worker.
 * Precaches the whole app (including every .mo catalog) so first load is the
 * only one that needs the network. Cache-first for hashed-static assets with
 * background refresh; navigations fall back to index.html when offline.
 */

const VERSION = 'sstv-lab-v2.0.0';
const LANGUAGES = ['tr', 'en', 'de', 'es', 'fr', 'ar', 'zh-CN'];

const CORE_ASSETS = [
  './', './index.html', './about.html', './style.css', './app.js', './about-i18n.js',
  './i18n.js', './encoder.js', './receiver.js', './resampler.js', './capture-worklet.js',
  './decode-worker.js', './counter.js', './manifest.webmanifest',
  './vendor/fm-demodulator.js', './vendor/sync-detector.js', './vendor/jsQR.js',
  './features/qr.js', './features/qr-transfer.js', './features/bluetooth.js',
  './features/nfc.js', './features/audioio.js',
  './icons/favicon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'
];

const LANGUAGE_ASSETS = LANGUAGES.map(
  lang => `./locales/${lang}/LC_MESSAGES/messages.mo`
);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.allSettled([...CORE_ASSETS, ...LANGUAGE_ASSETS].map(
      url => cache.add(new Request(url, { cache: 'reload' }))
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name !== VERSION).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // counter API passes through untouched

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match('./index.html');
        return cached ?? Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(request, { ignoreSearch: true });
    const network = fetch(request).then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }).catch(() => undefined);
    return cached ?? (await network ?? Response.error());
  })());
});
