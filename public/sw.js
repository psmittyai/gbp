// Pal service worker — getbotpacks.com
const CACHE = 'pal-gbp-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', e => { /* pass-through */ });
