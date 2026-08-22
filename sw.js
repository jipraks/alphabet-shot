/* ============================================================
   sw.js — service worker: cache-first untuk semua aset statis.
   Setelah kunjungan pertama, game jalan penuh offline.
   Semua path RELATIF supaya tetap benar di sub-folder GitHub Pages.
   ============================================================ */

const VERSI = 'tembak-huruf-v1';

const ASET = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/tokens.css',
  './styles/layout.css',
  './styles/weapon.css',
  './styles/screens.css',
  './scripts/main.js',
  './scripts/letters.js',
  './scripts/weapon.js',
  './scripts/balloons.js',
  './scripts/audio.js',
  './scripts/progress.js',
  './scripts/stats.js',
  './scripts/round.js',
  './scripts/ui.js',
  './scripts/parent.js',
  './scripts/modes/latihan.js',
  './scripts/modes/duel.js',
  './scripts/modes/serbuan.js',
  './scripts/modes/bos.js',
  './scripts/modes/duo.js',
  './fonts/Andika-Regular.woff2',
  './fonts/Andika-Bold.woff2',
  './fonts/Bungee-Regular.woff2',
  './fonts/Lexend-VariableFont.woff2',
  './assets/barrel-kayu.svg',
  './assets/barrel-pelangi.svg',
  './assets/barrel-dino.svg',
  './assets/barrel-eskrim.svg',
  './assets/barrel-roket.svg',
  './assets/barrel-emas.svg',
  './assets/beruang.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSI)
      // satu aset gagal jangan menggagalkan seluruh instalasi
      .then((c) => Promise.all(ASET.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((kunci) => Promise.all(kunci.filter((k) => k !== VERSI).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // nol request eksternal

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const salin = res.clone();
            caches.open(VERSI).then((c) => c.put(req, salin));
          }
          return res;
        })
        .catch(() => {
          // offline: navigasi apa pun dilayani index.html dari cache
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
    }),
  );
});
