/* MDgen service worker — offline-first for the app shell + vendored engine */
'use strict';
const VERSION = 'mdgen-v1.0.0';
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-runtime';

const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './vendor/tesseract/tesseract.min.js',
  './vendor/tesseract/worker.min.js',
  './vendor/tesseract/core/tesseract-core.wasm.js',
  './vendor/tesseract/core/tesseract-core-simd.wasm.js',
  './vendor/tesseract/core/tesseract-core-lstm.wasm.js',
  './vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js',
  './vendor/tesseract/core/tesseract-core-relaxedsimd.wasm.js',
  './vendor/tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js',
  './vendor/tesseract/tessdata/eng.traineddata.gz',
  './vendor/pdfjs/pdf.min.mjs',
  './vendor/pdfjs/pdf.worker.min.mjs',
  './vendor/mammoth/mammoth.browser.min.js',
  './vendor/jszip/jszip.min.js',
  './vendor/marked/marked.umd.js',
  './vendor/dompurify/purify.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => Promise.allSettled(PRECACHE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // extra OCR language packs: runtime stale-while-revalidate
  if (url.hostname === 'tessdata.projectnaptha.com') {
    e.respondWith(
      caches.open(RUNTIME).then(async cache => {
        const hit = await cache.match(e.request);
        const net = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // never cache AI provider calls — fail closed (explicit user action only)
  if (url.hostname === 'generativelanguage.googleapis.com' || url.hostname === 'api.openai.com') return;

  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request, { ignoreSearch: url.pathname.endsWith('/index.html') || url.pathname.endsWith('/') })
        .then(hit => hit || fetch(e.request).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then(c => c.put(e.request, copy));
          }
          return res;
        }))
    );
  }
});
