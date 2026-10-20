/* Stand-in for the artifact runtime's `db` and `user` capabilities when served by server.js
   (Railway). Implements only what app.js uses: claude.use('db'|'user'), db.doc(path).get/set,
   .collection(name).doc(id), user.id(). Not loaded in the Claude artifact. */
(() => {
'use strict';
const TOKEN_KEY = 'bb.sync.token';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

let token = lsGet(TOKEN_KEY);
const call = async (url, opts = {}) => {
  const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error || r.statusText), { code: body.error === 'quota_exceeded' ? 'quota_exceeded' : r.status });
  return body;
};

const docRef = (p) => ({
  async get() {
    const r = await call('/api/doc?path=' + encodeURIComponent(p));
    return { exists: !!r.exists, data: () => r.data };
  },
  async set(data) { await call('/api/doc?path=' + encodeURIComponent(p), { method: 'PUT', body: JSON.stringify(data) }); },
  collection: (name) => ({ doc: (id) => docRef(p + '/' + name + '/' + id) }),
});
const db = { doc: docRef };

// Passphrase prompt, shown over the app (which renders from browser storage meanwhile).
function askPassphrase() {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.55)';
    wrap.innerHTML = `
      <form style="width:100%;max-width:360px;background:var(--surface,#202026);color:var(--fg,#f1ece4);border:1px solid var(--line,#34343c);border-radius:var(--radius,10px);padding:20px;box-shadow:var(--shadow);font-family:var(--font-body,system-ui)">
        <div style="font-family:var(--font-display,inherit);font-weight:700;font-size:20px;margin-bottom:6px">Sync your progress</div>
        <div style="color:var(--fg-2,#b5afa6);font-size:14px;margin-bottom:14px">Enter the passphrase to sync across devices. Skip to keep progress in this browser only for this visit.</div>
        <input type="password" autocomplete="current-password" aria-label="Passphrase" placeholder="Passphrase" required
          style="width:100%;box-sizing:border-box;padding:10px 12px;font:inherit;background:var(--bg-2,#1a1a1e);color:inherit;border:1px solid var(--line,#34343c);border-radius:8px">
        <div data-err style="color:var(--bad,#ee6a5a);font-size:13px;min-height:18px;margin:6px 0"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="btn" data-skip>Skip</button>
          <button type="submit" class="btn primary">Unlock</button>
        </div>
      </form>`;
    const form = wrap.querySelector('form'), input = wrap.querySelector('input'), err = wrap.querySelector('[data-err]');
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.querySelector('[data-skip]').addEventListener('click', () => { done(false); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = '';
      try {
        const r = await call('/api/login', { method: 'POST', body: JSON.stringify({ passphrase: input.value }) });
        token = r.token; lsSet(TOKEN_KEY, token); done(true);
      } catch (e2) { err.textContent = e2.code === 401 ? 'Wrong passphrase.' : 'Could not reach the server.'; }
    });
    const mount = () => { document.body.appendChild(wrap); input.focus(); };
    document.body ? mount() : document.addEventListener('DOMContentLoaded', mount);
  });
}

let signedIn = null;
async function ensureSignedIn() {
  if (token) {
    try { await call('/api/me'); return true; }
    catch (e) { if (e.code !== 401) return false; token = null; lsSet(TOKEN_KEY, null); }
  }
  return askPassphrase();
}
const user = { id: async () => (await (signedIn ||= ensureSignedIn())) ? 'owner' : null };

window.claude = Object.assign(window.claude || {}, {
  use: async (name) => name === 'db' ? db : name === 'user' ? user : null,
  sync: { signOut() { token = null; lsSet(TOKEN_KEY, null); location.reload(); } },
});
})();
