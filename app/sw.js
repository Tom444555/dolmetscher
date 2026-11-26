// Offline-Speicher der App. Grundgerüst wird beim Installieren geladen,
// die großen Rechen-Bausteine (lib/) und Stimmen beim ersten Gebrauch.
const VERSION = 'dolmetscher-v1.1';
const MODELLE = 'dolmetscher-modelle';
const LIB = 'dolmetscher-lib'; // Rechenkerne – bleiben bei App-Updates erhalten
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-180.png',
  'js/main.js', 'js/langs.js', 'js/store.js', 'js/engine.js', 'js/engine-worker.js', 'js/llm.js', 'js/tts.js', 'js/ocr.js', 'js/rec.js', 'js/phrases.js', 'js/offline.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('dolmetscher-v') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Stimmen (Piper) zusätzlich hier sichern, falls der Gerätespeicher des Browsers nicht mitspielt
  if (url.hostname === 'huggingface.co' && url.pathname.includes('/piper-voices/')) {
    e.respondWith(cacheFirst(e, MODELLE));
    return;
  }
  if (url.origin !== location.origin) return; // Modelle von Hugging Face verwaltet Transformers.js selbst
  if (url.pathname.includes('/lib/')) { e.respondWith(cacheFirst(e, LIB)); return; }
  // App-Dateien: erst Netz (für Updates), bei Funkstille aus dem Speicher
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(VERSION).then(c => c.put(req, copy))); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

// Erst Speicher, sonst Netz. Das Ablegen läuft über waitUntil, damit der Browser den
// Service Worker bei großen Dateien (Rechenkerne > 10 MB) nicht mittendrin beendet.
async function cacheFirst(e, name) {
  const req = e.request;
  const c = await caches.open(name);
  const hit = await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) e.waitUntil(c.put(req, res.clone()).catch(() => {}));
  return res;
}
