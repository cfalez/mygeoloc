// Service worker de l'appli Porte à porte : permet de l'ouvrir et de l'utiliser sans réseau.
// - l'appli (index.html) : réseau d'abord (pour recevoir les mises à jour), sinon la copie en cache
// - Leaflet (cdnjs) et les tuiles de carte OpenStreetMap : cache d'abord, sinon réseau
const APP = 'pap-app-v1';
const TILES = 'pap-tiles-v1';
const LEAFLET = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(['./', ...LEAFLET])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== APP && k !== TILES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(APP);
  try {
    // réseau faible : on n'attend pas plus de 4 s avant de prendre la copie locale
    const res = await withTimeout(fetch(req), 4000);
    if (res.ok) cache.put(req.mode === 'navigate' ? './' : req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req.mode === 'navigate' ? './' : req, {ignoreSearch: true});
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'tile.openstreetmap.org') return e.respondWith(cacheFirst(req, TILES));
  if (url.hostname === 'cdnjs.cloudflare.com') return e.respondWith(cacheFirst(req, APP));
  if (url.origin === self.location.origin) return e.respondWith(networkFirst(req));
  // le reste (services d'adresses, OpenStreetMap Overpass) passe directement par le réseau
});
