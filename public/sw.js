// Minimal Service Worker — ermöglicht PWA-Installation
const CACHE = 'bkw-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network first — immer aktuelle Daten von Supabase
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
