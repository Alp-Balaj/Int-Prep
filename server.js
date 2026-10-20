// Server for brian-brennt on Railway. No dependencies.
// - Serves brian-brennt/. index.html is authored as an artifact body (no doctype/head), so it is
//   wrapped in a document skeleton here; the artifact copy stays unchanged.
// - When APP_PASSPHRASE is set, injects sync.js (a stand-in for the artifact's `db` and `user`
//   capabilities) and serves a small document store under /api, kept as JSON files in DATA_DIR.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, 'brian-brennt');
const PORT = process.env.PORT || 8080;
const PASSPHRASE = process.env.APP_PASSPHRASE || '';
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const MAX_DOC_BYTES = 1024 * 1024;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const BLOCKED = new Set(['test-local.html', 'content/validate.js', 'content/SCHEMA.md']);
// Well-known paths browsers probe without reading the page head (iOS asks for /apple-touch-icon*.png).
const ALIASES = { '/favicon.ico': '/icons/favicon-32.png', '/apple-touch-icon.png': '/icons/apple-touch-icon.png', '/apple-touch-icon-precomposed.png': '/icons/apple-touch-icon.png' };

const wrap = (body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="theme-color" content="#121214" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f6f3ee" media="(prefers-color-scheme: light)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Brennt">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<script>if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));</script>
${PASSPHRASE ? '<script src="sync.js"></script>' : ''}
</head>
<body>
${body}
</body>
</html>`;

const index = wrap(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
if (PASSPHRASE) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------- auth
// The token is derived from the passphrase, so changing APP_PASSPHRASE signs every device out.
const TOKEN = PASSPHRASE ? crypto.createHmac('sha256', PASSPHRASE).update('brian-brennt-sync').digest('hex') : '';
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const authed = (req) => !!TOKEN && same((req.headers.authorization || '').replace(/^Bearer /, ''), TOKEN);

// ---------------------------------------------------------------- store
// Doc paths look like "progress/owner" or "telemetry/owner/days/2026-10-20"; one file per doc.
const docFile = (p) => {
  const segs = String(p || '').split('/');
  if (segs.length < 2 || segs.length > 8 || !segs.every(s => /^[A-Za-z0-9_.-]{1,80}$/.test(s) && s !== '.' && s !== '..')) return null;
  return path.join(DATA_DIR, segs.join('__') + '.json');
};
const json = (res, code, body) => res.writeHead(code, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = []; let size = 0;
  req.on('data', c => { size += c.length; if (size <= MAX_DOC_BYTES) chunks.push(c); });
  req.on('end', () => size > MAX_DOC_BYTES ? reject(Object.assign(new Error('too large'), { code: 413 })) : resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});

async function api(req, res, url) {
  if (!PASSPHRASE) return json(res, 404, { error: 'sync disabled' });
  if (url.pathname === '/api/login' && req.method === 'POST') {
    let pass = '';
    try { pass = JSON.parse(await readBody(req)).passphrase; } catch { /* bad body */ }
    if (!same(pass || '', PASSPHRASE)) { await new Promise(r => setTimeout(r, 800)); return json(res, 401, { error: 'wrong passphrase' }); }
    return json(res, 200, { token: TOKEN, uid: 'owner' });
  }
  if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
  if (url.pathname === '/api/me') return json(res, 200, { uid: 'owner' });
  if (url.pathname === '/api/doc') {
    const file = docFile(url.searchParams.get('path'));
    if (!file) return json(res, 400, { error: 'bad path' });
    if (req.method === 'GET') {
      try { return json(res, 200, { exists: true, data: JSON.parse(await fs.promises.readFile(file, 'utf8')) }); }
      catch (e) { return e.code === 'ENOENT' ? json(res, 200, { exists: false }) : json(res, 500, { error: 'read failed' }); }
    }
    if (req.method === 'PUT') {
      let data;
      try { data = JSON.parse(await readBody(req)); }
      catch (e) { return e.code === 413 ? json(res, 413, { error: 'quota_exceeded' }) : json(res, 400, { error: 'bad json' }); }
      const tmp = file + '.' + process.pid + '.tmp';
      await fs.promises.writeFile(tmp, JSON.stringify(data));
      await fs.promises.rename(tmp, file);
      return json(res, 200, { ok: true });
    }
  }
  return json(res, 404, { error: 'not found' });
}

// ---------------------------------------------------------------- http
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) { api(req, res, url).catch(() => json(res, 500, { error: 'server error' })); return; }
  const pathname = ALIASES[url.pathname] || decodeURIComponent(url.pathname);
  if (pathname === '/healthz') { res.writeHead(200).end('ok'); return; }
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' }).end(index);
    return;
  }
  const rel = path.normalize(pathname).replace(/^[/\\]+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || BLOCKED.has(rel.split(path.sep).join('/'))) {
    res.writeHead(404).end('Not found');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(data);
  });
}).listen(PORT, () => console.log(`brian-brennt on :${PORT}, sync ${PASSPHRASE ? 'on, data in ' + DATA_DIR : 'off'}`));
