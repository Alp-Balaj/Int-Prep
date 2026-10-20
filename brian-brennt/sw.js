/* Service worker for the installed app (Railway only). Network first, so a deploy shows up on the
   next open; falls back to the cache offline. /api is never cached: sync.js treats a failed call
   as "stay local", and app.js keeps progress in the browser until it can sync again. */
const CACHE = 'bb-v2';
const SHELL = ['/', 'app.js', 'sync.js', 'manifest.webmanifest', 'icons/icon-192.png',
  'content/tier1a-agentic-orchestration.json', 'content/tier1b-agentic-rag-evals.json', 'content/tier1c-aws-services.json',
  'content/tier1d-terraform-iam.json', 'content/tier2a-react-python.json', 'content/tier2b-security.json',
  'content/tier3-ediscovery.json', 'content/cv-a-dotnet.json', 'content/cv-b-data.json',
  'content/cv-c-distributed.json', 'content/cv-d-angular.json', 'content/cv-e-senior-ai.json', 'content/stories.json', 'content/quests.json'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/api/')) return;
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('/') : Response.error()))));
  } else if (FONT_HOSTS.includes(url.hostname)) {
    // Fonts never change at a given URL: cache first.
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
  }
});
