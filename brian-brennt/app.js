/* Brian Brennt — interview-prep game engine. Plain JS, no framework. */
(() => {
'use strict';

// ---------------------------------------------------------------- constants
const PACK_FILES = [
  'content/tier1a-agentic-orchestration.json',
  'content/tier1b-agentic-rag-evals.json',
  'content/tier1c-aws-services.json',
  'content/tier1d-terraform-iam.json',
  'content/tier2a-react-python.json',
  'content/tier2b-security.json',
  'content/tier3-ediscovery.json',
  'content/cv-a-dotnet.json',
  'content/cv-b-data.json',
  'content/cv-c-distributed.json',
  'content/cv-d-angular.json',
  'content/cv-e-senior-ai.json',
];
const TIER_ORDER = ['cv', 'agentic', 'aws', 'react-python', 'security', 'ediscovery'];
// Interview priority overrides the packs' own levels: every CV line is a guaranteed question.
const TIER_LEVEL = { cv: 1, agentic: 1, aws: 2, 'react-python': 2, security: 2, ediscovery: 3 };
const TIER_WEIGHT = { 1: 6, 2: 3, 3: 1 };
const DAY = 86400000;
const CLEAN_HIT_MS = 8000;
const AGAIN = 0, HARD = 1, GOOD = 2, EASY = 3;
const GRADE_LABEL = ['Again', 'Hard', 'Good', 'Easy'];
const XP = { mock: 100, recall: 10, cleanHit: 5, scenarioBest: 25, scenarioOk: 10, explainGood: 30, explainHard: 15, story: 40, lesson: 15, dailyMin: 100, boss: 500, finalBoss: 1000 };
const BOSS_PASS = 0.7;
const RANKS = [[0, 'Intern'], [500, 'Paralegal'], [1500, 'Associate'], [3500, 'Senior Associate'], [6000, 'Counsel'], [10000, 'Partner'], [15000, 'Managing Partner']];
const MOCK_SIZE = { recall: 7, scenario: 2, explain: 1 };
const MOCK_SECONDS = { recall: 20, scenario: 60 };
const BOSS_LOCKOUT_MS = 24 * 3600000;
const BOSS_UNLOCK_STABLE = 0.6;
const FINAL_BOSS_DAY = 12;
const RECENT_WINDOW = 40;
const LS = { state: 'bb.state.v1', stories: 'bb.stories.v1', tele: 'bb.tele.v1.' };

// ---------------------------------------------------------------- utilities
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const pct = (n) => Math.round(n * 100);
const todayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fmtMs = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>').replace(/`([^`]+)`/g, '<code>$1</code>');
const paras = (s) => String(s || '').split(/\n\s*\n/).map(p => `<p>${inline(p.trim())}</p>`).join('');
const lsGet = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

// ---------------------------------------------------------------- state
const defaultState = () => ({
  v: 1, updatedAt: 0,
  cards: {},                   // id -> {ef, iv, due, reps, lapses, lg, days:[], hist:[]}
  xp: 0,
  days: {},                    // date -> {answered, correct, newSeen, reviews, scenario, story, cleanHits, ms, min, tiers:{tier:{a,c,ms}}}
  recent: {},                  // tier -> [0/1 ...] last RECENT_WINDOW outcomes
  rt: {},                      // tier -> [ms...] last 20 response times (correct answers)
  bosses: {},                  // tier -> {attempts:[{date,score,pass}], lockedUntil, beaten, beatenAt}
  final: { attempts: [], beaten: false },
  quests: {},                  // quest/portfolio id -> date done
  lessons: {},                 // nodeId -> first read date
  primers: {},                 // nodeId -> date the primer was first read
  settings: { interviewDate: '2026-11-02', startDate: '2026-10-20' },
  rank: 0,                     // highest rank index announced
  mocks: [],                   // [{date, score, n, ms, tiers:{tier:[got, of]}}]
});
const defaultStories = () => ({ updatedAt: 0, items: {} }); // storyId -> {situation, decision, result, hook, iv, due, ratings:[]}
const defaultTele = (date) => ({ date, opens: 0, sessions: [], skips: {}, hours: {}, tiersPicked: {}, lessonsRead: [], timeOnPage: 0, updatedAt: 0 });

let S = defaultState();
let ST = defaultStories();
let T = defaultTele(todayStr());
let C = null;                  // content index
let uid = null, db = null, userCap = null, dbReady = false, dbStatus = 'local';
let route = { screen: 'home' };
let session = null, lastSession = null;
let currentRec = null;
let activeTimer = null;
let toastTimer = null;
let pageShownAt = Date.now();

// ---------------------------------------------------------------- persistence
const saveQueue = {};
function persist(kind) {
  const now = Date.now();
  if (kind === 'state') { S.updatedAt = now; lsSet(LS.state, S); }
  if (kind === 'stories') { ST.updatedAt = now; lsSet(LS.stories, ST); }
  if (kind === 'tele') { T.updatedAt = now; lsSet(LS.tele + T.date, T); }
  if (!dbReady) return;
  clearTimeout(saveQueue[kind]?.timer);
  saveQueue[kind] = saveQueue[kind] || {};
  saveQueue[kind].timer = setTimeout(() => flush(kind), 1500);
}
async function flush(kind) {
  const q = saveQueue[kind]; if (!q || q.inflight) { if (q) q.again = true; return; }
  q.inflight = true;
  try {
    const ref = docRef(kind);
    const body = kind === 'state' ? S : kind === 'stories' ? ST : T;
    if (ref) await ref.set(JSON.parse(JSON.stringify(body)));
    dbStatus = 'synced';
  } catch (e) {
    dbStatus = 'local';
    if (e?.code === 'quota_exceeded') toast('Cloud storage full. Progress is saved in this browser only.');
  } finally {
    q.inflight = false;
    if (q.again) { q.again = false; flush(kind); }
  }
}
function docRef(kind) {
  if (!db || !uid) return null;
  if (kind === 'state') return db.doc('progress/' + uid);
  if (kind === 'stories') return db.doc('data/users/' + uid + '/profile');
  if (kind === 'tele') return db.doc('telemetry/' + uid).collection('days').doc(T.date);
  return null;
}
function loadLocal() {
  const s = lsGet(LS.state); if (s && s.v === 1) S = Object.assign(defaultState(), s);
  S.settings = Object.assign(defaultState().settings, S.settings || {});
  const st = lsGet(LS.stories); if (st) ST = Object.assign(defaultStories(), st);
  const t = lsGet(LS.tele + todayStr()); if (t) T = Object.assign(defaultTele(todayStr()), t);
}
async function connectDb() {
  try {
    const [d, u] = await Promise.all([window.claude?.use?.('db'), window.claude?.use?.('user')]);
    if (!d || !u) return;
    uid = await u.id(); if (!uid) return;
    db = d; userCap = u;
    const [ps, ss, ts] = await Promise.all([docRef('state').get(), docRef('stories').get(), docRef('tele').get()]);
    let changed = false;
    if (ps.exists) { const r = ps.data(); if ((r.updatedAt || 0) > (S.updatedAt || 0)) { S = Object.assign(defaultState(), r); S.settings = Object.assign(defaultState().settings, S.settings || {}); lsSet(LS.state, S); changed = true; } }
    if (ss.exists) { const r = ss.data(); if ((r.updatedAt || 0) > (ST.updatedAt || 0)) { ST = Object.assign(defaultStories(), r); lsSet(LS.stories, ST); changed = true; } }
    if (ts.exists) { const r = ts.data(); if ((r.updatedAt || 0) > (T.updatedAt || 0)) { T = Object.assign(defaultTele(todayStr()), r); } }
    dbReady = true; dbStatus = 'synced';
    // push anything newer locally
    if (ps.exists ? (S.updatedAt > (ps.data().updatedAt || 0)) : true) persist('state');
    if (ss.exists ? (ST.updatedAt > (ss.data().updatedAt || 0)) : Object.keys(ST.items).length) persist('stories');
    persist('tele');
    if (changed && !session) render();
    else renderTop();
  } catch { /* stay local */ }
}

// ---------------------------------------------------------------- content
async function loadContent() {
  const packs = [];
  for (const f of PACK_FILES) {
    try { const r = await fetch(f); if (r.ok) packs.push(await r.json()); } catch { /* missing pack */ }
  }
  const [stories, quests] = await Promise.all([
    fetch('content/stories.json').then(r => r.json()).catch(() => null),
    fetch('content/quests.json').then(r => r.json()).catch(() => null),
  ]);
  const tiers = {}; const nodes = []; const items = {}; const bossQ = {}; let finalQ = null;
  for (const p of packs) {
    const tid = p.tier.id;
    const lvl = TIER_LEVEL[tid] ?? p.tier.level;
    tiers[tid] = tiers[tid] || { id: tid, name: p.tier.name, level: lvl, tease: p.tier.tease, nodes: [] };
    for (const n of p.nodes) {
      const node = { id: n.id, tier: tid, level: lvl, title: n.title, tease: n.tease, primer: n.primer, lesson: n.lesson, cards: [], explain: [], scenarios: [] };
      for (const c of n.cards || []) { const it = { ...c, kind: 'recall', node: n.id, tier: tid, level: lvl }; items[c.id] = it; node.cards.push(c.id); }
      for (const e of n.explain || []) { const it = { ...e, kind: 'explain', node: n.id, tier: tid, level: lvl }; items[e.id] = it; node.explain.push(e.id); }
      for (const s of n.scenarios || []) { const it = { ...s, kind: 'scenario', node: n.id, tier: tid, level: lvl }; items[s.id] = it; node.scenarios.push(s.id); }
      nodes.push(node); tiers[tid].nodes.push(node.id);
    }
    for (const b of p.boss?.questions || []) {
      if (b.seconds >= 1800) { finalQ = { ...b, tier: tid }; continue; }
      (bossQ[tid] = bossQ[tid] || []).push({ ...b, tier: tid });
    }
  }
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));
  C = { tiers, tierList: TIER_ORDER.filter(t => tiers[t]).map(t => tiers[t]), nodes, nodeById, items, bossQ, finalQ, stories, quests };
  if (quests?.interviewDate && !lsGet(LS.state)) { S.settings.interviewDate = quests.interviewDate; S.settings.startDate = quests.startDate; }
}

// ---------------------------------------------------------------- derived
const rec = (id) => S.cards[id] || (S.cards[id] = { ef: 2.5, iv: 0, due: 0, reps: 0, lapses: 0, lg: -1, days: [], hist: [] });
const seen = (id) => (S.cards[id]?.reps || 0) > 0;
const stable = (id) => { const r = S.cards[id]; return !!r && r.lg >= GOOD && (r.days?.length || 0) >= 2; };
const isDue = (id) => { const r = S.cards[id]; return !!r && r.reps > 0 && r.due <= endOfToday(); };
const daysLeft = () => Math.max(0, Math.ceil((parseDate(S.settings.interviewDate).getTime() - Date.now()) / DAY));
const dayIndex = () => Math.floor((parseDate(todayStr()).getTime() - parseDate(S.settings.startDate).getTime()) / DAY) + 1;
const today = () => S.days[todayStr()] || (S.days[todayStr()] = { answered: 0, correct: 0, newSeen: 0, reviews: 0, scenario: 0, story: 0, cleanHits: 0, ms: 0, min: false, tiers: {} });
function newPerDay() { const d = dayIndex(); if (d >= 14) return 0; if (d >= 11) return 20; return 40; }

function nodeUnlocked(node) {
  const tier = C.tiers[node.tier]; const idx = tier.nodes.indexOf(node.id);
  if (idx === 0) return true;
  const prev = C.nodeById[tier.nodes[idx - 1]];
  const cards = prev.cards; const seenN = cards.filter(seen).length;
  return seenN >= Math.ceil(cards.length * 0.7);
}
function nodeProgress(node) {
  const all = [...node.cards, ...node.scenarios, ...node.explain];
  const sn = all.filter(seen).length, st = all.filter(stable).length;
  return { total: all.length, seen: sn, stable: st, seenF: all.length ? sn / all.length : 0, stableF: all.length ? st / all.length : 0 };
}
function tierStable(tid) {
  const cards = C.tiers[tid].nodes.flatMap(n => C.nodeById[n].cards);
  const st = cards.filter(stable).length;
  return { total: cards.length, stable: st, f: cards.length ? st / cards.length : 0 };
}
function recentAcc(tid) { const a = S.recent[tid] || []; return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function dueItems() { return Object.keys(C.items).filter(isDue); }
function dueStories() {
  return Object.values(C.stories?.stories || []).filter(s => { const st = ST.items[s.id]; return st && st.situation && (!st.due || st.due <= endOfToday()); });
}
function unseenScenarios() { return C.nodes.filter(nodeUnlocked).flatMap(n => n.scenarios).filter(id => !seen(id)); }
function nextLockedNode() {
  for (const t of C.tierList) for (const nid of t.nodes) { const n = C.nodeById[nid]; if (!nodeUnlocked(n)) return n; }
  return null;
}
// The matter to open when a tier is tapped: first unlocked node with an unread lesson or unseen items,
// else the weakest unlocked node (lowest stable share).
function nextNode(tid) {
  const open = C.tiers[tid].nodes.map(id => C.nodeById[id]).filter(nodeUnlocked);
  const fresh = open.find(n => { const p = nodeProgress(n); return !S.lessons[n.id] || p.seen < p.total; });
  return fresh || open.slice().sort((a, b) => nodeProgress(a).stableF - nodeProgress(b).stableF)[0] || null;
}
function openNext(tid) { const n = nextNode(tid); if (n) go('lesson', { node: n.id }); else go('tree'); }
// Case file: every recall card is a fact. Earned when last answered right; lost when it was earned once
// (a good day on record) and the last answer was wrong; it is re-earned by answering right again.
function factState(id) { const r = S.cards[id]; if (!r || !r.reps) return 'open'; if (r.lg >= GOOD) return 'earned'; return r.days?.length ? 'lost' : 'open'; }
function factText(it) {
  if (it.type === 'mc') return { q: it.prompt, a: it.options[it.answer] };
  if (it.type === 'tf') return { q: it.prompt, a: it.answer ? 'True' : 'False' };
  return { q: it.prompt.replace('___', '**' + it.answer + '**'), a: null };
}
function factCounts(ids) { const c = { earned: 0, lost: 0, open: 0 }; ids.forEach(id => c[factState(id)]++); return c; }
function factHtml(id) {
  const it = C.items[id]; const f = factText(it);
  return `<li class="fact"><div class="fq">${inline(f.q)}</div>${f.a ? `<div class="fa">${inline(f.a)}</div>` : ''}<div class="fw">${inline(it.why)}</div></li>`;
}
function allItemsCount() { return Object.keys(C.items).length; }
function seenCount() { return Object.keys(C.items).filter(seen).length; }
function pace() {
  const total = allItemsCount(), sn = seenCount(), left = daysLeft();
  const dates = Object.keys(S.days).sort().slice(-4, -1);
  const recentNew = dates.length ? dates.reduce((a, d) => a + (S.days[d].newSeen || 0), 0) / dates.length : null;
  const needPerDay = left > 0 ? Math.ceil((total - sn) / left) : total - sn;
  const projected = recentNew == null ? null : clamp(sn + recentNew * left, 0, total);
  return { total, seen: sn, left, recentNew, needPerDay, projected };
}
// Board: every item as one square, grouped by tier and sorted so each tier fills like a battery.
const MILESTONES = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
function firstSeenToday(id) { const r = S.cards[id]; return !!r && r.reps > 0 && r.reps === r.hist.length && r.hist[0]?.[0] === todayStr(); }
function stableToday(id) { const r = S.cards[id]; return stable(id) && r.days[1] === todayStr(); }
function itemState(id, unlocked) { return stable(id) ? 3 : seen(id) ? 2 : unlocked ? 1 : 0; } // 3 stable, 2 seen, 1 open, 0 locked
function stableFraction() { const ids = Object.keys(C.items); return ids.length ? ids.filter(stable).length / ids.length : 0; }
function board() {
  const tiers = C.tierList.map(t => {
    const sq = [];
    for (const nid of t.nodes) {
      const n = C.nodeById[nid]; const u = nodeUnlocked(n);
      for (const id of [...n.cards, ...n.explain, ...n.scenarios]) sq.push({ s: itemState(id, u), lit: stableToday(id) || firstSeenToday(id) });
    }
    sq.sort((a, b) => b.s - a.s || b.lit - a.lit);
    const c = [0, 0, 0, 0]; sq.forEach(x => c[x.s]++);
    return { t, sq, total: sq.length, stable: c[3], seen: c[3] + c[2], locked: c[0], lit: sq.filter(x => x.lit).length };
  });
  const total = tiers.reduce((a, x) => a + x.total, 0);
  const st = tiers.reduce((a, x) => a + x.stable, 0), sn = tiers.reduce((a, x) => a + x.seen, 0);
  const lit = tiers.reduce((a, x) => a + x.lit, 0);
  const span = Math.max(1, (parseDate(S.settings.interviewDate) - parseDate(S.settings.startDate)) / DAY);
  const target = clamp((dayIndex() - 1) / span, 0, 1);
  const f = total ? st / total : 0;
  const next = MILESTONES.find(m => m > f + 1e-9);
  return { tiers, total, stable: st, seen: sn, left: total - sn, lit, target, f, next, nextGap: next ? Math.ceil(next * total) - st : 0 };
}
function streak() {
  let n = 0; const d = new Date(); let t = todayStr(d);
  if (!S.days[t]?.min) d.setDate(d.getDate() - 1);
  for (;;) { t = todayStr(d); if (S.days[t]?.min) { n++; d.setDate(d.getDate() - 1); } else break; }
  return n;
}
function minimumStatus() {
  const d = today(); const due = dueItems().length;
  const scenarioPossible = unseenScenarios().length > 0 || Object.keys(C.items).some(id => C.items[id].kind === 'scenario' && isDue(id)) || d.scenario > 0;
  const storyDue = dueStories().length > 0 || d.story > 0;
  return {
    reviews: { done: due === 0 && d.answered > 0, count: due },
    scenario: { done: d.scenario > 0, needed: scenarioPossible },
    story: { done: d.story > 0, needed: storyDue },
    all: due === 0 && d.answered > 0 && (d.scenario > 0 || !scenarioPossible) && (d.story > 0 || !storyDue),
  };
}
function checkMinimum() {
  const d = today(); if (d.min) return;
  if (minimumStatus().all) { d.min = true; addXp(XP.dailyMin); toast(`Docket cleared. +${XP.dailyMin} XP. Streak ${streak()}.`); }
}
function addXp(n) { S.xp += n; renderTop(); }

// ---------------------------------------------------------------- scheduling (SM-2 variant, capped to the interview)
function schedule(id, grade, ms) {
  const r = rec(id); const now = Date.now(); const t = todayStr();
  const first = r.reps === 0;
  if (grade === AGAIN) { r.lapses++; r.iv = 0; r.ef = Math.max(1.3, r.ef - 0.2); r.due = now + 10 * 60000; }
  else {
    if (r.iv === 0) r.iv = grade === HARD ? 0.5 : grade === GOOD ? 1 : 3;
    else if (grade === HARD) r.iv = Math.max(1, r.iv * 1.2);
    else if (grade === GOOD) r.iv = r.iv * r.ef;
    else r.iv = r.iv * r.ef * 1.3;
    if (C.items[id]?.kind !== 'recall') r.iv = Math.max(r.iv, 2);
    r.ef = clamp(r.ef + (0.1 - (3 - grade) * (0.08 + (3 - grade) * 0.02)), 1.3, 2.8);
    const cap = clamp(daysLeft() - 1, 1, 7);
    r.iv = Math.min(r.iv, cap);
    r.due = now + r.iv * DAY;
    if (grade >= GOOD && !r.days.includes(t)) r.days.push(t);
  }
  r.reps++; r.lg = grade;
  r.hist.push([t, grade, Math.round(ms || 0)]); if (r.hist.length > 8) r.hist.shift();
  return first;
}
function recordOutcome(item, correct, ms, grade) {
  const d = today(); const tid = item.tier;
  d.answered++; if (correct) d.correct++; d.ms += ms;
  d.tiers[tid] = d.tiers[tid] || { a: 0, c: 0, ms: 0 }; d.tiers[tid].a++; if (correct) d.tiers[tid].c++; d.tiers[tid].ms += ms;
  const before = recentAcc(tid);
  const arr = S.recent[tid] = S.recent[tid] || []; arr.push(correct ? 1 : 0); if (arr.length > RECENT_WINDOW) arr.shift();
  const after = recentAcc(tid);
  const wasNew = !seen(item.id);
  if (wasNew) d.newSeen++; else d.reviews++;
  let clean = false;
  if (item.kind === 'recall' && correct && ms < CLEAN_HIT_MS) { clean = true; d.cleanHits++; }
  if (correct) { const rt = S.rt[tid] = S.rt[tid] || []; rt.push(ms); if (rt.length > 20) rt.shift(); }
  if (item.kind === 'scenario') d.scenario++;
  const factBefore = item.kind === 'recall' ? factState(item.id) : null;
  schedule(item.id, grade, ms);
  const factAfter = item.kind === 'recall' ? factState(item.id) : null;
  const fact = factBefore && factBefore !== 'earned' && factAfter === 'earned' ? (factBefore === 'lost' ? 'regained' : 'collected') : factBefore === 'earned' && factAfter === 'lost' ? 'lost' : null;
  let xp = 0;
  if (item.kind === 'recall') xp = correct ? XP.recall + (clean ? XP.cleanHit : 0) : 0;
  if (item.kind === 'scenario') xp = grade >= GOOD ? XP.scenarioBest : grade === HARD ? XP.scenarioOk : 0;
  if (item.kind === 'explain') xp = grade >= GOOD ? XP.explainGood : grade === HARD ? XP.explainHard : 0;
  if (xp) S.xp += xp;
  persist('state');
  return { before, after, clean, xp, wasNew, fact };
}

// ---------------------------------------------------------------- telemetry
function tele(fn) { fn(T); persist('tele'); }
function teleHour() { const h = new Date().getHours(); T.hours[h] = (T.hours[h] || 0) + 1; }

// ---------------------------------------------------------------- session queue
function buildQueue(mode, tierPick) {
  const d = today();
  let q = [];
  const due = shuffle(dueItems().filter(id => !tierPick || C.items[id].tier === tierPick));
  q.push(...due);
  if (!tierPick && d.scenario === 0 && !due.some(id => C.items[id].kind === 'scenario')) { const u = unseenScenarios(); if (u.length) q.push(pick(u)); }
  const storyQ = dueStories();
  if (!tierPick && d.story === 0 && storyQ.length) q.splice(Math.min(q.length, 3), 0, 'story:' + pick(storyQ).id);
  const budget = mode === 'deep' ? 15 : Math.max(0, newPerDay() - d.newSeen);
  q.push(...pickNew(budget, tierPick));
  if (mode === 'daily' && q.length === 0) return [];
  return q;
}
function pickNew(n, tierPick) {
  if (n <= 0) return [];
  const out = []; let explains = 0;
  const pools = C.tierList.filter(t => !tierPick || t.id === tierPick).map(t => ({
    w: TIER_WEIGHT[t.level], ids: t.nodes.map(id => C.nodeById[id]).filter(nodeUnlocked).flatMap(nd => [...nd.cards, ...nd.explain.slice(0, 1)]).filter(id => !seen(id)),
  })).filter(p => p.ids.length);
  let guard = 0;
  while (out.length < n && pools.some(p => p.ids.length) && guard++ < 500) {
    const total = pools.reduce((a, p) => a + (p.ids.length ? p.w : 0), 0);
    let r = Math.random() * total; let chosen = pools.find(p => p.ids.length);
    for (const p of pools) { if (!p.ids.length) continue; r -= p.w; if (r <= 0) { chosen = p; break; } }
    const id = chosen.ids.shift();
    if (C.items[id].kind === 'explain') { if (explains >= 2) continue; explains++; }
    out.push(id);
  }
  return out;
}
function startSession(mode, tierPick) {
  const queue = buildQueue(mode, tierPick).filter(id => id.startsWith('story:') || C.items[id]);
  if (!queue.length) { toast(mode === 'daily' ? 'Nothing due. Deep dive for new material.' : 'Everything in reach has been seen. Review what is due.'); return; }
  session = { mode, tier: tierPick || null, queue, idx: 0, started: Date.now(), answered: 0, correct: 0, clean: 0, xp: 0, combo: 0, bestCombo: 0, again: [], done: false, startedAt: Date.now(), stable0: stableFraction() };
  tele(t => { t.sessions.push({ start: Date.now(), mode, tier: tierPick || null, items: queue.length, completed: false, answered: 0 }); if (tierPick) t.tiersPicked[tierPick] = (t.tiersPicked[tierPick] || 0) + 1; });
  route = { screen: 'session' }; render();
}
function sessionTele(patch) { const s = T.sessions[T.sessions.length - 1]; if (s) Object.assign(s, patch); persist('tele'); }
function nextItem() {
  if (!session) return;
  session.idx++;
  if (session.idx >= session.queue.length) {
    if (session.again.length) { session.queue.push(...session.again); session.again = []; }
    else if (session.mode === 'deep') { const more = pickNew(15, session.tier); if (more.length) session.queue.push(...more); }
  }
  if (session.idx >= session.queue.length) { endSession(true); return; }
  render();
}
function finishSession(completed) {
  if (!session) return;
  session.done = true; session.ended = Date.now();
  sessionTele({ end: Date.now(), completed, answered: session.answered, quitAt: completed ? null : session.idx });
  checkMinimum(); persist('state');
  const f1 = stableFraction(); const hit = MILESTONES.filter(m => session.stable0 < m && f1 >= m).pop();
  if (hit) { session.milestone = hit; setTimeout(() => toast(`Milestone: ${pct(hit)}% of everything locked in.`), 600); }
  lastSession = session; session = null; stopRec(); stopTimer();
  route = { screen: 'summary' };
}
function endSession(completed) { finishSession(completed); render(); window.scrollTo({ top: 0 }); }
function stopRec() { try { if (currentRec && currentRec.state !== 'inactive') currentRec.stop(); } catch { /* ignore */ } currentRec = null; }
function skipItem(id) {
  const kind = id.startsWith('story:') ? 'story' : C.items[id].kind;
  tele(t => { t.skips[kind] = (t.skips[kind] || 0) + 1; });
  session.again.push(id); nextItem();
}

// ---------------------------------------------------------------- rendering helpers
function ring(f, stableF, size = 36) {
  const r = (size - 4) / 2, c = 2 * Math.PI * r;
  return `<svg class="ring-svg${stableF >= 1 ? ' stable' : ''}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle class="bg" cx="${size / 2}" cy="${size / 2}" r="${r}"/>
    <circle class="fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}"/>
    ${stableF > 0 ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r - 6}" fill="none" stroke="var(--good)" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(2 * Math.PI * (r - 6) * stableF).toFixed(1)} ${(2 * Math.PI * (r - 6)).toFixed(1)}"/>` : ''}
  </svg>`;
}
function toast(msg) {
  let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
function stopTimer() { if (activeTimer) { clearInterval(activeTimer); activeTimer = null; } }
function runTimer(seconds, onTick, onDone) {
  stopTimer(); const start = Date.now();
  const tick = () => { const el = Date.now() - start; onTick(el, seconds * 1000 - el); if (el >= seconds * 1000 && onDone) { onDone(); } };
  tick(); activeTimer = setInterval(tick, 500);
}
function tierPill(level) { return `<span class="pill t${level}">Tier ${level}</span>`; }

// ---------------------------------------------------------------- screens
const TABS = [
  { id: 'home', label: 'Docket', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/></svg>' },
  { id: 'tree', label: 'Case file', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7.5 7.5 11 16M16.5 7.5 13 16"/></svg>' },
  { id: 'stories', label: 'Stories', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a4 4 0 0 1 4 4v5a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>' },
  { id: 'quests', label: 'Build', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h10"/></svg>' },
  { id: 'stats', label: 'Trends', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19 10 12l4 4 6-8"/></svg>' },
];

function rankOf(xp) {
  let i = 0; while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
  const [lo, name] = RANKS[i]; const nx = RANKS[i + 1];
  return { i, name, next: nx ? nx[1] : null, toNext: nx ? nx[0] - xp : 0, f: nx ? (xp - lo) / (nx[0] - lo) : 1 };
}
function renderTop() {
  const n = streak(); const el = $('#top-streak'); el.classList.toggle('hot', n > 0);
  const r = rankOf(S.xp);
  $('#top-streak-n').textContent = n;
  $('#top-xp').innerHTML = `<span class="rank-name">${esc(r.name)}</span><span class="rank-bar"><i style="width:${pct(r.f)}%"></i></span>`;
  $('#top-xp').title = `${S.xp.toLocaleString()} XP${r.next ? ` · ${r.toNext.toLocaleString()} to ${r.next}` : ''}`;
  if (r.i > (S.rank || 0)) { S.rank = r.i; persist('state'); setTimeout(() => toast(`Promoted to ${r.name}.`), 900); }
}
function rankLine() { const r = rankOf(S.xp); return r.next ? `<b>${esc(r.name)}</b> · <span class="num">${r.toNext.toLocaleString()}</span> XP to ${esc(r.next)}` : `<b>${esc(r.name)}</b>. Top rank.`; }
function renderTabs() {
  const due = C ? dueItems().length : 0;
  $('#tabs').innerHTML = TABS.map(t => `<div class="tab-wrap"><button class="tab${route.screen === t.id ? ' active' : ''}" data-tab="${t.id}" aria-label="${t.label}">${t.icon}<span>${t.label}</span></button>${t.id === 'home' && due ? `<span class="tab-badge num">${due}</span>` : ''}</div>`).join('');
  $('#tabs').querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
}
function go(screen, extra = {}) {
  if (mock && !mock.done && screen !== 'mock') mock = null;
  if (session && !session.done && screen !== 'session') { sessionTele({ end: Date.now(), completed: false, answered: session.answered, quitAt: session.idx }); session = null; }
  stopTimer(); stopRec(); route = { screen, ...extra };
  if (TABS.some(t => t.id === screen)) { try { history.replaceState(null, '', '#' + screen); } catch { /* ignore */ } }
  render(); window.scrollTo({ top: 0 });
}
function render() {
  if (!C) return;
  renderTop(); renderTabs();
  const main = $('#main');
  const fn = { mock: renderMock, home: renderHome, tree: renderTree, lesson: renderLesson, session: renderSession, summary: renderSummary, boss: renderBoss, stories: renderStories, storyEdit: renderStoryEdit, storyDrill: renderStoryDrill, quests: renderQuests, stats: renderStats, settings: renderSettings }[route.screen] || renderHome;
  main.innerHTML = fn();
  bind(main);
}

// ---- Home
function renderHome() {
  const left = daysLeft(); const d = today(); const ms = minimumStatus(); const p = pace(); const sk = streak();
  const dayN = dayIndex(); const todayQuest = C.quests?.schedule.find(q => q.date === todayStr());
  const locked = nextLockedNode();
  const bossReady = C.tierList.map(t => ({ t, s: tierStable(t.id), b: S.bosses[t.id] })).filter(x => x.s.f >= BOSS_UNLOCK_STABLE && !x.b?.beaten && !(x.b?.lockedUntil > Date.now()));
  const nearBoss = C.tierList.map(t => ({ t, s: tierStable(t.id), b: S.bosses[t.id] })).filter(x => !x.b?.beaten && x.s.f < BOSS_UNLOCK_STABLE).sort((a, b) => b.s.f - a.s.f)[0];
  const tomorrowDue = Object.keys(C.items).filter(id => { const r = S.cards[id]; return r && r.reps > 0 && r.due > endOfToday() && r.due <= endOfToday() + DAY; }).length;
  const interviewDay = left === 0;
  const fewItems = allItemsCount() === 0;
  return `
  <section class="panel">
    <div class="hero">
      <div>
        <div class="eyebrow">${interviewDay ? 'Interview day' : 'Until the interview'}</div>
        <div class="days num">${interviewDay ? 'Today' : left}<small>${interviewDay ? '' : left === 1 ? 'day' : 'days'}</small></div>
        <div class="sub">${todayQuest ? `Day ${dayN} of 14 · ${esc(todayQuest.title)}` : dayN < 1 ? `Plan starts ${esc(S.settings.startDate)}` : 'Review only. Nothing new today.'} <button class="btn ghost small" data-go="settings" style="min-height:28px;padding:2px 8px">dates</button></div>
      </div>
      <div class="stack" style="align-items:flex-end">
        <div class="streak-pill ${sk ? 'hot' : ''}"><span aria-hidden="true">🔥</span> <b class="num">${sk}</b>&nbsp;day streak</div>
        <div class="small muted">${dbStatus === 'synced' ? 'Synced across devices' : 'Saved in this browser'}</div>
      </div>
    </div>
  </section>

  ${fewItems ? `<section class="panel empty">Content packs are still loading. If this persists, the packs failed to publish.</section>` : ''}

  <section class="panel">
    <div class="panel-head"><h2>Today's docket</h2><span class="small muted">${d.min ? 'Cleared' : 'Not yet cleared'}</span></div>
    <div class="docket">
      <div class="docket-item ${ms.reviews.done ? 'done' : ''}"><span class="check">${ms.reviews.done ? '✓' : ''}</span><span class="label">Clear due reviews</span><span class="count num">${ms.reviews.count} due</span></div>
      ${ms.scenario.needed ? `<div class="docket-item ${ms.scenario.done ? 'done' : ''}"><span class="check">${ms.scenario.done ? '✓' : ''}</span><span class="label">Decide one scenario</span><span class="count num">${Math.min(d.scenario, 1)}/1</span></div>` : ''}
      ${ms.story.needed ? `<div class="docket-item ${ms.story.done ? 'done' : ''}"><span class="check">${ms.story.done ? '✓' : ''}</span><span class="label">Drill one story</span><span class="count num">${Math.min(d.story, 1)}/1</span></div>` : ''}
      <div class="docket-item ${d.newSeen >= newPerDay() && newPerDay() > 0 ? 'done' : ''}"><span class="check">${d.newSeen >= newPerDay() && newPerDay() > 0 ? '✓' : ''}</span><span class="label">New material</span><span class="count num">${d.newSeen}/${newPerDay()}</span></div>
    </div>
    <div class="row" style="margin-top:14px">
      <button class="btn primary big" data-start="daily" style="flex:1">${d.min ? 'Keep going' : 'Start the docket'}</button>
      <button class="btn big" data-start="deep">Deep dive</button>
    </div>
    ${d.answered ? `<div class="hint" style="margin-top:8px">Today: ${d.answered} answered, ${d.answered ? pct(d.correct / d.answered) : 0}% right, ${d.cleanHits} clean hits, ${fmtMs(d.ms)} on task.</div>` : ''}
  </section>

  ${bossReady.length ? `<section class="panel"><div class="boss-card"><div><div class="eyebrow">Hearing unlocked</div><h3>${esc(bossReady[0].t.name)}</h3><div class="small muted">3 questions, 3 minutes each. Fail and it locks for 24 hours.</div></div><button class="btn primary" data-boss="${bossReady[0].t.id}">Enter the hearing</button></div></section>` : ''}

  ${renderBoard()}
  <p class="small muted" style="margin-top:-8px;padding:0 4px">
    ${p.left > 0 ? `To see everything before the interview you need <b class="num">${p.needPerDay}</b> new items a day.` : 'The interview is here. Review only.'}
    ${p.projected != null && p.left > 0 ? ` At your recent pace (<span class="num">${Math.round(p.recentNew)}</span>/day) you will have seen <b class="num">${pct(p.projected / p.total)}%</b> of the material by then.` : ''}
  </p>

  ${mockHomeCard()}

  <section class="panel">
    <div class="panel-head"><h2>Accuracy, last ${RECENT_WINDOW}</h2><span class="small muted">headshot ratio</span></div>
    <div class="meters">
      ${C.tierList.map(t => { const a = recentAcc(t.id); const s = tierStable(t.id); return `<div class="meter"><div class="val">${a == null ? '—' : pct(a) + '%'}</div><div class="name" title="${esc(t.name)}">${esc(t.name)}</div><div class="bar"><i style="width:${pct(s.f)}%;background:var(--tier${t.level})"></i></div><div class="hint num">${s.stable}/${s.total} stable</div></div>`; }).join('')}
    </div>
  </section>

  ${locked || nearBoss || tomorrowDue ? `<section class="tease">
    <div class="eyebrow">Next up</div>
    ${locked ? `<div class="q">${esc(locked.tease)}</div><div class="small muted" style="margin-top:4px">${esc(locked.title)} unlocks after ${esc(C.nodeById[C.tiers[locked.tier].nodes[C.tiers[locked.tier].nodes.indexOf(locked.id) - 1]].title)}.</div>` : ''}
    <div class="row small muted" style="margin-top:10px;gap:16px">
      ${tomorrowDue ? `<span><b class="num">${tomorrowDue}</b> reviews come due tomorrow</span>` : ''}
      ${nearBoss ? `<span><b class="num">${Math.max(0, Math.ceil(nearBoss.s.total * BOSS_UNLOCK_STABLE) - nearBoss.s.stable)}</b> stable cards from the ${esc(nearBoss.t.name)} hearing</span>` : ''}
    </div>
  </section>` : ''}
  `;
}

// ---- Mock interview: mixed questions across tiers, timed, no hints, no feedback until the end.
// Pure measurement: it does not touch the spaced-repetition schedule.
let mock = null;
function mockPick(kind, n) {
  const pools = C.tierList.map(t => ({ w: TIER_WEIGHT[t.level], ids: shuffle(t.nodes.flatMap(id => C.nodeById[id][kind === 'recall' ? 'cards' : kind === 'scenario' ? 'scenarios' : 'explain'])) })).filter(p => p.ids.length);
  const out = [];
  while (out.length < n && pools.some(p => p.ids.length)) {
    const live = pools.filter(p => p.ids.length); let r = Math.random() * live.reduce((a, p) => a + p.w, 0);
    const chosen = live.find(p => (r -= p.w) <= 0) || live[0]; out.push(chosen.ids.shift());
  }
  return out;
}
function startMock() {
  const rc = mockPick('recall', MOCK_SIZE.recall), sc = mockPick('scenario', MOCK_SIZE.scenario), ex = mockPick('explain', MOCK_SIZE.explain);
  const qs = [...rc]; sc.forEach((id, i) => qs.splice(2 + i * 3, 0, id)); qs.push(...ex);
  mock = { qs, idx: 0, res: [], started: Date.now(), qStart: Date.now(), stage: 'ask', done: false };
  go('mock');
}
function mockAnswer(score, extra = {}) {
  if (!mock || mock.done) return;
  stopTimer();
  mock.res.push({ id: mock.qs[mock.idx], score, ms: Date.now() - mock.qStart, ...extra });
  mock.idx++; mock.stage = 'ask'; mock.qStart = Date.now();
  if (mock.idx >= mock.qs.length) finishMock();
  render(); window.scrollTo({ top: 0 });
}
function finishMock() {
  const n = mock.res.length; const score = n ? mock.res.reduce((a, r) => a + r.score, 0) / n : 0;
  const tiers = {}; mock.res.forEach(r => { const t = C.items[r.id].tier; const x = tiers[t] = tiers[t] || [0, 0]; x[0] += r.score; x[1]++; });
  S.mocks = S.mocks || []; S.mocks.push({ date: todayStr(), score, n, ms: Date.now() - mock.started, tiers });
  S.xp += XP.mock; persist('state');
  mock.done = true; mock.score = score; mock.tiers = tiers;
}
function mockCardHtml(it) {
  if (it.kind === 'recall') {
    if (it.type === 'mc') return `<div class="prompt">${inline(it.prompt)}</div><div class="opts">${it.options.map((o, i) => `<button class="opt" data-mock-mc="${i}"><span class="key">${'ABCDE'[i]}</span><span class="txt">${inline(o)}</span></button>`).join('')}</div>`;
    if (it.type === 'tf') return `<div class="prompt">${inline(it.prompt)}</div><div class="opts"><button class="opt" data-mock-tf="true"><span class="key">T</span><span class="txt">True</span></button><button class="opt" data-mock-tf="false"><span class="key">F</span><span class="txt">False</span></button></div>`;
    const gap = mock.stage === 'reveal' ? `<span class="gap" style="color:var(--accent-2)">${esc(it.answer)}</span>` : '<span class="gap">&nbsp;</span>';
    return `<div class="prompt">${inline(it.prompt).replace('___', gap)}</div>` + (mock.stage === 'reveal'
      ? `<div class="hint" style="margin-top:14px">Did you have it before the reveal?</div><div class="row" style="margin-top:8px"><button class="btn bad" data-mock-score="0" style="flex:1">Missed</button><button class="btn good" data-mock-score="1" style="flex:1">Had it</button></div>`
      : `<div class="row" style="margin-top:16px"><button class="btn primary block" data-mock-reveal="1">Say it, then reveal</button></div>`);
  }
  if (it.kind === 'scenario') return `<div class="situation">${inline(it.situation)}</div><div class="prompt">${inline(it.question)}</div><div class="opts">${shuffleStable(it).map((o, k) => `<button class="opt" data-mock-sc="${o._i}"><span class="key">${'ABCDE'[k]}</span><span class="txt">${inline(o.text)}</span></button>`).join('')}</div>`;
  return `<div class="prompt">${inline(it.prompt)}</div>` + (mock.stage === 'reveal'
    ? `<div class="model-answer"><b>Model answer.</b> ${inline(it.modelAnswer)}</div><div class="hint" style="margin-top:12px">Tick what you actually said:</div><div class="rubric">${it.rubric.map((r, i) => `<label><input type="checkbox" data-mock-rub="${i}"> <span>${esc(r)}</span></label>`).join('')}</div><div class="row" style="margin-top:12px"><button class="btn primary block" data-mock-rubric="1">Score it</button></div>`
    : `<p class="small muted" style="margin-top:12px">Answer out loud, as you would to the interviewer. ${fmtMs(it.seconds * 1000)} on the clock.</p><div class="row" style="margin-top:16px"><button class="btn primary block" data-mock-reveal="1">Done speaking</button></div>`);
}
function mockHistoryHtml() {
  const h = (S.mocks || []).slice(-12); if (!h.length) return '';
  return `<div class="mock-hist" role="img" aria-label="Last ${h.length} mock scores">${h.map((m, i) => `<div class="mh${i === h.length - 1 ? ' last' : ''}" title="${esc(m.date)}: ${pct(m.score)}%"><i style="height:${Math.max(4, pct(m.score))}%"></i><span class="num">${pct(m.score)}</span></div>`).join('')}</div>`;
}
function mockHomeCard() {
  const h = S.mocks || []; const last = h[h.length - 1]; const best = h.reduce((a, m) => Math.max(a, m.score), 0);
  return `<section class="panel mock-card">
    <div class="panel-head"><h2>Mock interview</h2>${last ? `<span class="small muted num">last ${pct(last.score)}% · best ${pct(best)}%</span>` : '<span class="small muted">the real test</span>'}</div>
    <p class="small muted">${MOCK_SIZE.recall + MOCK_SIZE.scenario + MOCK_SIZE.explain} questions from every tier, including ones you have not studied. Timed, no hints, scored at the end. Run one every two or three days and watch the line climb.</p>
    ${mockHistoryHtml()}
    <button class="btn primary big block" data-mock-start="1" style="margin-top:12px">${last ? 'Run another mock' : 'Run your first mock'}</button>
  </section>`;
}
function renderMock() {
  if (!mock) return renderHome();
  if (mock.done) return renderMockResult();
  const it = C.items[mock.qs[mock.idx]]; const n = mock.qs.length;
  const secs = it.kind === 'explain' ? it.seconds : MOCK_SECONDS[it.kind];
  return `<section class="panel">
    <div class="session-top"><span class="eyebrow">Mock interview · ${mock.idx + 1} of ${n}</span><button class="btn ghost small" data-mock-quit="1" style="min-height:32px">Quit</button></div>
    <div class="progress" style="margin-top:10px"><i style="width:${pct(mock.idx / n)}%"></i></div>
  </section>
  <section class="card">
    <div class="kind"><span class="eyebrow">${it.kind === 'recall' ? 'Quick question' : it.kind === 'scenario' ? 'Scenario' : 'Explain it'} · ${esc(C.tiers[it.tier].name)}</span><span class="num mock-time" id="mock-time"></span></div>
    ${mock.stage === 'ask' ? `<div class="timer-bar" style="margin-bottom:14px"><i id="mock-bar"></i></div>` : ''}
    ${mockCardHtml(it)}
    ${mock.stage === 'ask' ? `<input type="hidden" data-mock-timer="${secs}">` : ''}
  </section>`;
}
function renderMockResult() {
  const h = S.mocks || []; const prev = h.length > 1 ? h[h.length - 2].score : null; const best = h.slice(0, -1).reduce((a, m) => Math.max(a, m.score), 0);
  const missed = mock.res.filter(r => r.score < 1);
  const missHtml = (r) => {
    const it = C.items[r.id];
    if (it.kind === 'recall') { const f = factText(it); return `<li class="fact lost"><div class="fq">${inline(f.q)}</div>${f.a ? `<div class="fa">${inline(f.a)}</div>` : ''}<div class="fw">${inline(it.why)}</div></li>`; }
    if (it.kind === 'scenario') { const b = it.options.find(o => o.verdict === 'best'); return `<li class="fact lost"><div class="fq">${inline(it.question)} <span class="muted">${inline(it.situation.split(/(?<=\.)\s/)[0])}</span></div><div class="fa">${inline(b.text)}</div><div class="fw">${inline(b.why)}</div></li>`; }
    return `<li class="fact lost"><div class="fq">${inline(it.prompt)}</div><div class="fw">Scored ${pct(r.score)}% on the rubric. ${inline(it.modelAnswer)}</div></li>`;
  };
  return `<section class="panel">
    <div class="eyebrow">Mock interview · ${fmtMs(Date.now() - mock.started)}</div>
    <div class="summary-big">${pct(mock.score)}%</div>
    <div class="small muted" style="margin-top:6px">${prev == null ? 'Your baseline. Every mock from here is measured against it.' : mock.score > prev ? `<span class="up">Up ${pct(mock.score - prev)} points</span> on the last mock.${mock.score > best ? ' New best.' : ''}` : mock.score < prev ? `<span class="down">Down ${pct(prev - mock.score)} points</span> on the last mock.` : 'Same as the last mock.'} +${XP.mock} XP.</div>
    ${mockHistoryHtml()}
    <div class="stack" style="margin-top:14px">${C.tierList.filter(t => mock.tiers[t.id]).map(t => { const [g, o] = mock.tiers[t.id]; return `<div class="stat-row"><span class="small">${esc(t.name)}</span><div class="progress"><i style="width:${pct(g / o)}%;background:var(--tier${t.level})"></i></div><span class="num small">${Math.round(g * 10) / 10}/${o}</span></div>`; }).join('')}</div>
    <div class="row" style="margin-top:14px"><button class="btn primary" data-mock-start="1">Another mock</button><button class="btn" data-go="home">Back to the docket</button></div>
  </section>
  ${missed.length ? `<section class="panel"><div class="panel-head"><h2>What you missed</h2><span class="small muted num">${missed.length}</span></div><ul class="facts">${missed.map(missHtml).join('')}</ul></section>` : ''}`;
}
function bindMock(root) {
  const it = mock && !mock.done ? C.items[mock.qs[mock.idx]] : null;
  root.querySelectorAll('[data-mock-start]').forEach(b => b.addEventListener('click', startMock));
  root.querySelectorAll('[data-mock-quit]').forEach(b => b.addEventListener('click', () => { mock = null; go('home'); }));
  if (!it) return;
  root.querySelectorAll('[data-mock-mc]').forEach(b => b.addEventListener('click', () => mockAnswer(+b.dataset.mockMc === it.answer ? 1 : 0)));
  root.querySelectorAll('[data-mock-tf]').forEach(b => b.addEventListener('click', () => mockAnswer((b.dataset.mockTf === 'true') === it.answer ? 1 : 0)));
  root.querySelectorAll('[data-mock-sc]').forEach(b => b.addEventListener('click', () => { const v = it.options[+b.dataset.mockSc].verdict; mockAnswer(v === 'best' ? 1 : v === 'ok' ? 0.5 : 0); }));
  root.querySelectorAll('[data-mock-reveal]').forEach(b => b.addEventListener('click', () => { stopTimer(); mock.stage = 'reveal'; render(); }));
  root.querySelectorAll('[data-mock-score]').forEach(b => b.addEventListener('click', () => mockAnswer(+b.dataset.mockScore)));
  root.querySelectorAll('[data-mock-rubric]').forEach(b => b.addEventListener('click', () => { const all = root.querySelectorAll('[data-mock-rub]'); const t = [...all].filter(x => x.checked).length; mockAnswer(all.length ? t / all.length : 0); }));
  const tm = root.querySelector('[data-mock-timer]');
  if (tm) {
    const secs = +tm.dataset.mockTimer;
    const rem = Math.max(0.5, secs - (Date.now() - mock.qStart) / 1000);
    runTimer(rem, (el, left) => {
      const t = $('#mock-time'); if (t) { t.textContent = fmtMs(Math.max(0, left)); t.classList.toggle('over', left <= 5000); }
      const bar = $('#mock-bar'); if (bar) bar.style.width = `${clamp(left / (secs * 1000), 0, 1) * 100}%`;
    }, () => { if (it.kind === 'explain' || (it.kind === 'recall' && it.type === 'cloze')) { stopTimer(); mock.stage = 'reveal'; render(); } else mockAnswer(0, { timeout: true }); });
  }
}

// ---- Board
function renderBoard(heading = 'The board') {
  const b = board(); if (!b.total) return '';
  const w = (n) => (b.total ? (n / b.total) * 100 : 0).toFixed(2);
  const behind = b.target > 0 && b.seen / b.total < b.target ? Math.ceil(b.target * b.total) - b.seen : 0;
  return `<section class="panel board">
    <div class="panel-head"><h2>${esc(heading)}</h2>${b.lit ? `<span class="chip hot num">+${b.lit} lit today</span>` : '<span class="small muted">every square is one card</span>'}</div>
    <div class="board-head">
      <div><div class="board-big num">${pct(b.f)}<small>%</small></div><div class="small muted">locked in</div></div>
      <div class="board-stats">
        <div><b class="num">${b.stable}</b><span>stable</span></div>
        <div><b class="num">${b.seen - b.stable}</b><span>seen</span></div>
        <div><b class="num">${b.left}</b><span>to go</span></div>
      </div>
    </div>
    <div class="board-bar" role="img" aria-label="${b.stable} stable, ${b.seen - b.stable} seen, ${b.left} not seen of ${b.total}">
      <i class="st" style="width:${w(b.stable)}%"></i><i class="sn" style="width:${w(b.seen - b.stable)}%"></i>
      ${b.target > 0 && b.target < 1 ? `<span class="target" style="left:${(b.target * 100).toFixed(1)}%" title="Where seen should be today"></span>` : ''}
    </div>
    <div class="small muted board-next">
      ${b.next ? `Next milestone <b>${pct(b.next)}% locked in</b>: <b class="num">${b.nextGap}</b> more stable cards.` : 'Everything is locked in.'}
      ${b.target > 0 && b.target < 1 ? (behind ? ` The marker is today's pace: <b class="num">${behind}</b> new cards behind it.` : ' You are ahead of today’s pace marker.') : ''}
    </div>
    <div class="board-tiers">
      ${b.tiers.map(x => `<button class="board-tier" data-next-tier="${x.t.id}" aria-label="Open the next matter in ${esc(x.t.name)}" style="--tc:var(--tier${x.t.level})">
        <div class="board-tier-head"><span class="name">${esc(x.t.name)} <span class="go">›</span></span><span class="num small muted">${x.stable}<span class="sep">/</span>${x.total}${x.lit ? ` <span class="lit-n">+${x.lit}</span>` : ''}</span></div>
        <div class="mosaic">${x.sq.map(q => `<i class="q${q.s}${q.lit ? ' lit' : ''}"></i>`).join('')}</div>
      </button>`).join('')}
    </div>
    <div class="row small muted board-legend"><span><i class="lg q3"></i>stable</span><span><i class="lg q2"></i>seen</span><span><i class="lg q1"></i>open</span><span><i class="lg q0"></i>locked</span><span><i class="lg q2 lit"></i>today</span></div>
  </section>`;
}

// ---- Tree
function renderTree() {
  return `
  <section class="panel">
    <div class="panel-head"><h2>Case file</h2>${(() => { const c = factCounts(Object.keys(C.items).filter(id => C.items[id].kind === 'recall')); return `<span class="num small muted">${c.earned}/${c.earned + c.lost + c.open} facts</span>`; })()}</div>
    <div class="small muted">Every quick-recall card you answer right becomes a fact here. Get one wrong later and it is lost until you win it back. Tap a matter to read what you have earned.</div>
  </section>
  ${C.tierList.map(t => {
    const s = tierStable(t.id); const b = S.bosses[t.id] || {}; const lockedOut = b.lockedUntil > Date.now();
    const canBoss = s.f >= BOSS_UNLOCK_STABLE && !lockedOut && !b.beaten && (C.bossQ[t.id] || []).length >= 1;
    return `<section class="tier" data-level="${t.level}">
      <div class="tier-head"><div><div class="eyebrow">Tier ${t.level}</div><h2>${esc(t.name)}</h2></div><div class="row" style="gap:8px">${nextNode(t.id) ? `<button class="btn small primary" data-next-tier="${t.id}" style="min-height:34px">Next matter</button>` : ''}<button class="btn small" data-start="deep" data-tier="${t.id}" style="min-height:34px">Deep dive</button></div></div>
      <div class="small muted" style="margin-bottom:10px">${esc(t.tease)}</div>
      <div class="nodes">
        ${t.nodes.map((nid, i) => { const n = C.nodeById[nid]; const u = nodeUnlocked(n); const p = nodeProgress(n); const fc = factCounts(n.cards);
          const firstLocked = t.nodes.findIndex(x => !nodeUnlocked(C.nodeById[x]));
          if (!u && i > firstLocked) { if (i !== firstLocked + 1) return ''; const rest = t.nodes.slice(i); return `<div class="locked-rest small muted">🔒 ${rest.length} more ${rest.length === 1 ? 'matter' : 'matters'} · ${rest.reduce((a, x) => a + C.nodeById[x].cards.length, 0)} facts to collect</div>`; }
          if (!u) return `<button class="node locked" data-node="${n.id}" aria-disabled="true"><div class="ring">${ring(p.seenF, p.stableF)}</div><div class="body"><div class="t">${esc(n.tease)}</div><div class="lock">🔒 ${esc(n.title)} · ${n.cards.length} facts to collect</div></div></button>`;
          return `<details class="node-file" data-facts="${n.id}">
            <summary class="node"><div class="ring">${ring(fc.earned / (n.cards.length || 1), p.stableF)}</div>
              <div class="body"><div class="t">${esc(n.title)}</div><div class="d num">${fc.earned}/${n.cards.length} facts${fc.lost ? ` · <span class="lost-n">${fc.lost} lost</span>` : ''}${S.lessons[n.id] ? '' : ' · lesson unread'}</div></div>
              <span class="chev" aria-hidden="true">▾</span></summary>
            <div class="facts-body"></div>
          </details>`; }).join('')}
      </div>
      <div class="boss-card${b.beaten ? ' beaten' : ''}${lockedOut ? ' locked-out' : ''}" style="margin-top:10px">
        <div><div class="eyebrow">Hearing</div><div class="small">${b.beaten ? `Beaten on ${esc(b.beatenAt)} with ${pct(b.attempts[b.attempts.length - 1].score)}%` : lockedOut ? `Locked until ${new Date(b.lockedUntil).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : `Unlocks at ${pct(BOSS_UNLOCK_STABLE)}% stable · now <span class="num">${pct(s.f)}%</span>`}</div></div>
        <button class="btn ${canBoss ? 'primary' : ''}" data-boss="${t.id}" ${canBoss ? '' : 'disabled'}>${b.beaten ? 'Beaten' : 'Enter'}</button>
      </div>
    </section>`; }).join('')}
  ${renderFinalBossCard()}`;
}
function nodeFactsHtml(n) {
  const by = { earned: [], lost: [], open: [] }; n.cards.forEach(id => by[factState(id)].push(id));
  return `<div class="row" style="gap:8px;margin:4px 0 12px"><button class="btn small" data-lesson="${n.id}">Read lesson</button><button class="btn small primary" data-drill="${n.id}">Drill</button></div>
    ${by.lost.length ? `<div class="facts-title bad">Lost · answer right in a drill to win back</div><ul class="facts">${by.lost.map(id => { const f = factText(C.items[id]); return `<li class="fact lost"><div class="fq">${inline(f.q.replace(/\*\*[^*]+\*\*/, '___'))}</div><div class="fa blur">${f.a ? inline(f.a) : 'hidden'}</div></li>`; }).join('')}</ul>` : ''}
    ${by.earned.length ? `<ul class="facts">${by.earned.map(factHtml).join('')}</ul>` : ''}
    ${by.open.length ? `<div class="facts-open">${by.open.map(() => '<i></i>').join('')}<span class="small muted">${by.open.length} still to collect</span></div>` : ''}`;
}
function renderFinalBossCard() {
  if (!C.finalQ) return '';
  const allBeaten = C.tierList.every(t => S.bosses[t.id]?.beaten);
  const unlocked = dayIndex() >= FINAL_BOSS_DAY || allBeaten;
  const f = S.final;
  return `<section class="panel"><div class="boss-card${f.beaten ? ' beaten' : ''}"><div><div class="eyebrow">Final hearing</div><h3>${esc(C.finalQ.prompt)}</h3><div class="small muted">${fmtMs(C.finalQ.seconds * 1000)} timed. ${unlocked ? 'Unlocked.' : `Unlocks on day ${FINAL_BOSS_DAY} or when every hearing is beaten.`}</div></div><button class="btn ${unlocked && !f.beaten ? 'primary' : ''}" data-boss="final" ${unlocked ? '' : 'disabled'}>${f.beaten ? 'Beaten' : 'Enter'}</button></div></section>`;
}

// ---- Lesson
function primerBlock(n) {
  const P = n.primer; if (!P) return '';
  return `<div class="primer">
    <div class="eyebrow">Primer</div>
    <div class="lesson">${paras(P.problem)}${paras(P.picture)}</div>
    ${P.sketch ? `<pre><code>${esc(P.sketch)}</code></pre>` : ''}
    <dl class="terms">${P.terms.map(t => `<div><dt>${inline(t.term)}</dt><dd>${inline(t.def)}</dd></div>`).join('')}</dl>
  </div>`;
}
function markPrimer(id) { if (!S.primers[id]) { S.primers[id] = todayStr(); persist('state'); } }
function renderLesson() {
  const n = C.nodeById[route.node]; if (!n) return renderTree();
  const p = nodeProgress(n); const L = n.lesson;
  markPrimer(n.id);
  if (!S.lessons[n.id]) { S.lessons[n.id] = todayStr(); S.xp += XP.lesson; persist('state'); tele(t => t.lessonsRead.push(n.id)); }
  const tier = C.tiers[n.tier]; const idx = tier.nodes.indexOf(n.id); const next = tier.nodes[idx + 1] ? C.nodeById[tier.nodes[idx + 1]] : null;
  return `
  <section class="panel">
    <div class="row" style="justify-content:space-between"><button class="btn ghost" data-go="tree">← Case file</button>${tierPill(n.level)}</div>
    <div class="eyebrow" style="margin-top:12px">${esc(tier.name)}</div>
    <h1>${esc(n.title)}</h1>
    <div class="small muted num" style="margin-top:4px">${p.seen}/${p.total} seen · ${p.stable} stable · ${n.cards.length} recall, ${n.scenarios.length} scenarios, ${n.explain.length} explain prompts</div>
    <hr>
    ${primerBlock(n)}
    ${n.primer ? '<div class="eyebrow" style="margin-top:18px">Lesson</div>' : ''}
    <div class="lesson">${paras(L.body)}</div>
    ${L.snippet ? `<pre><code>${esc(L.snippet)}</code></pre>` : ''}
    <p class="small" style="margin-top:12px">Source: <a href="${esc(L.source.url)}" target="_blank" rel="noopener">${esc(L.source.title)}</a></p>
    <hr>
    <div class="row"><button class="btn primary" data-drill="${n.id}">Drill this node</button>${next ? (nodeUnlocked(next) ? `<button class="btn" data-lesson="${next.id}">Next: ${esc(next.title)} →</button>` : `<span class="small muted">Next: 🔒 ${esc(next.tease)}</span>`) : ''}</div>
  </section>`;
}
function startNodeDrill(nodeId) {
  const n = C.nodeById[nodeId];
  const ids = shuffle([...n.cards, ...n.scenarios, ...n.explain]);
  const due = ids.filter(id => isDue(id) || !seen(id));
  const queue = (due.length ? due : ids).slice(0, 20);
  session = { mode: 'node', tier: n.tier, node: n.id, queue, idx: 0, started: Date.now(), answered: 0, correct: 0, clean: 0, xp: 0, combo: 0, bestCombo: 0, again: [], done: false };
  tele(t => t.sessions.push({ start: Date.now(), mode: 'node', tier: n.tier, items: queue.length, completed: false, answered: 0 }));
  route = { screen: 'session' }; render();
}

// ---- Session
function renderSession() {
  if (!session) return renderHome();
  while (session.idx < session.queue.length) { const x = session.queue[session.idx]; if (x.startsWith('story:') || C.items[x]) break; session.idx++; }
  if (session.idx >= session.queue.length) { finishSession(true); return renderSummary(); }
  const id = session.queue[session.idx]; const total = session.queue.length;
  const head = `<div class="session-top"><button class="btn ghost" data-quit="1" style="min-height:34px">Quit</button><div class="progress"><i style="width:${pct(session.idx / total)}%"></i></div><span class="combo${session.combo >= 3 ? ' hot' : ''}">${session.combo >= 2 ? `×${session.combo} combo · ` : ''}<span class="num">${session.idx + 1}/${total}</span></span></div>`;
  if (id.startsWith('story:')) return head + renderStoryDrillCard(id.slice(6), true);
  const it = C.items[id];
  const node = C.nodeById[it.node]; const first = !seen(id);
  if (first && node.primer && !S.primers[node.id]) return head + `<section class="card">
    <div class="kind"><span class="eyebrow">New matter · ${esc(node.title)}</span>${tierPill(it.level)}</div>
    ${primerBlock(node)}
    <div class="row" style="justify-content:space-between;margin-top:14px"><button class="btn ghost small" data-lesson="${node.id}" style="min-height:32px">Read the full lesson</button><button class="btn primary" data-primer-ok="${node.id}">Got it → first card</button></div>
  </section>`;
  const kindLabel = { recall: first ? 'New card' : 'Review', explain: 'Explain out loud', scenario: 'Scenario' }[it.kind];
  let body = '';
  if (it.kind === 'recall') {
    if (it.type === 'mc') body = `<div class="prompt">${inline(it.prompt)}</div><div class="opts">${it.options.map((o, i) => `<button class="opt" data-mc="${i}"><span class="key">${'ABCDE'[i]}</span><span class="txt">${inline(o)}</span></button>`).join('')}</div>`;
    if (it.type === 'tf') body = `<div class="prompt">${inline(it.prompt)}</div><div class="opts"><button class="opt" data-tf="true"><span class="key">T</span><span class="txt">True</span></button><button class="opt" data-tf="false"><span class="key">F</span><span class="txt">False</span></button></div>`;
    if (it.type === 'cloze') body = `<div class="prompt">${inline(it.prompt).replace('___', '<span class="gap">&nbsp;</span>')}</div><div class="row" style="margin-top:16px"><button class="btn primary block" data-reveal="1">Reveal</button></div>`;
  } else if (it.kind === 'scenario') {
    body = `<div class="situation">${inline(it.situation)}</div><div class="prompt">${inline(it.question)}</div><div class="opts">${shuffleStable(it).map((o, i) => `<button class="opt" data-sc="${o._i}"><span class="key">${'ABCD'[i]}</span><span class="txt">${inline(o.text)}</span></button>`).join('')}</div>`;
  } else if (it.kind === 'explain') {
    body = `<div class="prompt">${inline(it.prompt)}</div>
      <div class="timer num" id="timer">${fmtMs(it.seconds * 1000)}</div><div class="timer-bar"><i id="timer-bar"></i></div>
      <div class="hint" style="text-align:center;margin-top:6px">Speak as if the interviewer just asked. Timer starts when you press Start.</div>
      <div id="rec-area" class="row" style="justify-content:center;margin-top:12px"><button class="btn primary big" data-timer-start="${it.seconds}">Start speaking</button></div>
      <div style="margin-top:12px"><label for="keypoints">Key points you hit (optional)</label><textarea id="keypoints" rows="2" placeholder="Short notes while you talk"></textarea></div>
      <div class="row" style="margin-top:12px"><button class="btn block" data-reveal="1" id="done-speaking">Done speaking → show the model answer</button></div>`;
  }
  return head + `<section class="card" data-item="${id}">
    <div class="kind"><span class="eyebrow">${kindLabel} · ${esc(node.title)}</span>${tierPill(it.level)}</div>
    ${body}
    <div id="feedback"></div>
    <div class="row" style="justify-content:space-between;margin-top:14px"><button class="btn ghost small" data-skip="${id}" style="min-height:32px">Skip for now</button><button class="btn ghost small" data-lesson="${node.id}" style="min-height:32px">Read the lesson</button></div>
  </section>`;
}
function shuffleStable(it) {
  if (!it._order) it._order = shuffle(it.options.map((o, i) => ({ ...o, _i: i })));
  return it._order;
}
function feedbackHtml(verdictText, ok, why, res, extra = '') {
  const deltas = [];
  if (res.before != null && res.after != null && res.before !== res.after) deltas.push(`<span class="chip ${res.after > res.before ? 'up' : 'down'}">${C.tiers[res.tier].name} ${pct(res.before)}% → ${pct(res.after)}%</span>`);
  else if (res.after != null) deltas.push(`<span class="chip">${C.tiers[res.tier].name} ${pct(res.after)}%</span>`);
  if (res.fact === 'collected') deltas.push('<span class="chip fact-chip">+1 fact</span>');
  if (res.fact === 'regained') deltas.push('<span class="chip fact-chip">fact won back</span>');
  if (res.fact === 'lost') deltas.push('<span class="chip down">fact lost</span>');
  if (res.clean) deltas.push(`<span class="chip hot">clean hit · ${fmtMs(res.ms)}</span>`);
  if (res.xp) deltas.push(`<span class="chip up">+${res.xp} XP</span>`);
  if (session.combo >= 3) deltas.push(`<span class="chip hot">×${session.combo} combo</span>`);
  if (res.nextIn) deltas.push(`<span class="chip">next in ${res.nextIn}</span>`);
  return `<div class="feedback"><div class="verdict" style="color:${ok === true ? 'var(--good)' : ok === false ? 'var(--bad)' : 'var(--warn)'}">${verdictText}</div><div class="why">${inline(why)}</div>${extra}<div class="deltas">${deltas.join('')}</div><div class="row" style="margin-top:12px"><button class="btn primary block" data-next="1">Continue</button></div></div>`;
}
function nextInText(id) { const r = S.cards[id]; if (!r) return ''; if (r.due - Date.now() < 3600000) return 'this session'; const d = Math.round((r.due - Date.now()) / DAY); return d <= 1 ? 'tomorrow' : d + ' days'; }
function answerStatic(it, correct, grade, ms, verdictText, why, extra) {
  const res = recordOutcome(it, correct, ms, grade); res.tier = it.tier; res.ms = ms; res.nextIn = nextInText(it.id);
  session.answered++; if (correct) { session.correct++; session.combo++; session.bestCombo = Math.max(session.bestCombo, session.combo); } else { session.combo = 0; session.retries = session.retries || {}; if ((session.retries[it.id] = (session.retries[it.id] || 0) + 1) <= 2) session.again.push(it.id); }
  if (res.clean) session.clean++; session.xp += res.xp;
  if (res.fact) (session.facts = session.facts || []).push({ id: it.id, kind: res.fact });
  sessionTele({ answered: session.answered }); checkMinimum();
  $('#feedback').innerHTML = feedbackHtml(verdictText, correct ? true : grade === HARD ? null : false, why, res, extra);
  $('[data-next]').focus();
}

// ---- Summary
function sessionFactsHtml(s) {
  const fs = s.facts || []; if (!fs.length) return '';
  const last = {}; fs.forEach(f => { last[f.id] = f.kind; });
  const won = Object.keys(last).filter(id => last[id] !== 'lost' && factState(id) === 'earned');
  const lost = Object.keys(last).filter(id => last[id] === 'lost' && factState(id) === 'lost');
  return `<div class="facts-won">
    ${won.length ? `<div class="facts-title"><b class="num">${won.length}</b> ${won.length === 1 ? 'fact' : 'facts'} into your case file</div><ul class="facts">${won.map(factHtml).join('')}</ul>` : ''}
    ${lost.length ? `<div class="facts-title bad"><b class="num">${lost.length}</b> lost. Win ${lost.length === 1 ? 'it' : 'them'} back next drill.</div>` : ''}
  </div>`;
}
function renderSummary() {
  const s = lastSession; if (!s) return renderHome();
  const acc = s.answered ? pct(s.correct / s.answered) : 0; const dur = fmtMs((s.ended || Date.now()) - s.started);
  const locked = nextLockedNode(); const d = today(); const ms = minimumStatus();
  const tomorrowDue = Object.keys(C.items).filter(id => { const r = S.cards[id]; return r && r.reps > 0 && r.due > endOfToday() && r.due <= endOfToday() + DAY; }).length;
  const nextScenario = unseenScenarios()[0] ? C.items[unseenScenarios()[0]] : null;
  const bossNear = C.tierList.map(t => ({ t, s: tierStable(t.id), b: S.bosses[t.id] })).filter(x => !x.b?.beaten).sort((a, b) => b.s.f - a.s.f)[0];
  return `
  <section class="panel">
    <div class="eyebrow">Session over · ${dur}</div>
    <div class="summary-big">${acc}%</div>
    <div class="kpis" style="margin-top:14px">
      <div class="kpi"><div class="v num">${s.answered}</div><div class="k">answered</div></div>
      <div class="kpi"><div class="v num">${s.clean}</div><div class="k">clean hits</div></div>
      <div class="kpi"><div class="v num">×${s.bestCombo}</div><div class="k">best combo</div></div>
      <div class="kpi"><div class="v num">+${s.xp}</div><div class="k">XP</div></div>
    </div>
    <div class="small muted" style="margin-top:10px">${rankLine()}</div>
    ${sessionFactsHtml(s)}
    ${s.milestone ? `<div class="milestone">Milestone reached: <b>${pct(s.milestone)}% locked in</b></div>` : ''}
    <p class="small muted" style="margin-top:12px">${d.min ? `Docket cleared. Streak ${streak()}.` : ms.reviews.count ? `${ms.reviews.count} reviews still due today.` : !ms.scenario.done && ms.scenario.needed ? 'One scenario left to clear the docket.' : !ms.story.done && ms.story.needed ? 'One story drill left to clear the docket.' : 'Almost there.'}</p>
    <div class="row" style="margin-top:14px"><button class="btn primary" data-start="${d.min ? 'deep' : 'daily'}">${d.min ? 'One more run' : 'Finish the docket'}</button><button class="btn" data-go="home">Back to the docket</button></div>
  </section>
  ${renderBoard('Where you stand')}
  <section class="tease">
    <div class="eyebrow">Tomorrow</div>
    ${locked ? `<div class="q">${esc(locked.tease)}</div><div class="small muted" style="margin-top:4px">${esc(locked.title)} is the next locked node.</div><div class="lesson blur small" style="margin-top:8px;max-height:60px;overflow:hidden">${paras(locked.lesson.body.slice(0, 260))}</div>` : ''}
    <div class="stack small muted" style="margin-top:10px">
      ${tomorrowDue ? `<span><b class="num">${tomorrowDue}</b> reviews come due tomorrow.</span>` : ''}
      ${nextScenario ? `<span>Next scenario: “${esc(nextScenario.situation.split(/(?<=\.)\s/)[0])}”</span>` : ''}
      ${bossNear ? `<span>${esc(bossNear.t.name)} hearing: <b class="num">${pct(bossNear.s.f)}%</b> stable, unlocks at ${pct(BOSS_UNLOCK_STABLE)}%.</span>` : ''}
    </div>
  </section>`;
}

// ---- Boss
let boss = null;
function startBoss(tid) {
  if (tid === 'final') {
    if (!C.finalQ) { toast('The final hearing has no question loaded.'); return; }
    boss = { tier: 'final', qs: [C.finalQ], idx: 0, ticks: [], phase: 'intro' };
  } else {
    const pool = shuffle([...(C.bossQ[tid] || [])]);
    if (!pool.length) { toast('No hearing questions loaded for this tier.'); return; }
    boss = { tier: tid, qs: pool.slice(0, 3), idx: 0, ticks: [], phase: 'intro' };
  }
  route = { screen: 'boss' }; render();
}
function renderBoss() {
  if (!boss) return renderTree();
  const name = boss.tier === 'final' ? 'Final hearing' : C.tiers[boss.tier].name + ' hearing';
  if (boss.phase === 'intro') return `<section class="panel"><div class="eyebrow">Hearing</div><h1>${esc(name)}</h1><p class="muted" style="margin-top:8px">${boss.qs.length} question${boss.qs.length > 1 ? 's' : ''}, ${fmtMs(boss.qs[0].seconds * 1000)} each. Answer out loud as in the interview, then score yourself honestly against the rubric. Pass at ${pct(BOSS_PASS)}%. A fail locks this hearing for 24 hours.</p><div class="row" style="margin-top:16px"><button class="btn primary big" data-boss-begin="1">Begin</button><button class="btn" data-go="tree">Not yet</button></div></section>`;
  if (boss.phase === 'result') {
    const total = boss.ticks.reduce((a, t) => a + t.total, 0), hit = boss.ticks.reduce((a, t) => a + t.hit, 0); const score = total ? hit / total : 0; const pass = score >= BOSS_PASS;
    return `<section class="panel"><div class="eyebrow">${esc(name)}</div><div class="summary-big" style="color:${pass ? 'var(--good)' : 'var(--bad)'}">${pct(score)}%</div><h2 style="margin-top:8px">${pass ? 'Passed. Badge earned.' : 'Not this time.'}</h2><p class="muted" style="margin-top:6px">${pass ? `+${boss.tier === 'final' ? XP.finalBoss : XP.boss} XP.` : 'Locked for 24 hours. Drill the rubric points you missed and come back.'}</p>
      <div class="stack" style="margin-top:12px">${boss.ticks.map((t, i) => `<div class="small"><b>Q${i + 1}</b> ${esc(boss.qs[i].prompt)} <span class="num muted">${t.hit}/${t.total}</span>${t.missed.length ? `<div class="hint">Missed: ${t.missed.map(esc).join(' · ')}</div>` : ''}</div>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn primary" data-go="tree">Back to matters</button></div></section>`;
  }
  const q = boss.qs[boss.idx];
  return `<section class="card">
    <div class="kind"><span class="eyebrow">${esc(name)} · question ${boss.idx + 1}/${boss.qs.length}</span></div>
    <div class="prompt">${esc(q.prompt)}</div>
    <div class="timer num" id="timer">${fmtMs(q.seconds * 1000)}</div><div class="timer-bar"><i id="timer-bar"></i></div>
    <div id="rec-area" class="row" style="justify-content:center;margin-top:12px"><button class="btn primary big" data-timer-start="${q.seconds}">Start speaking</button></div>
    <div style="margin-top:12px"><label for="keypoints">Outline while you talk (optional)</label><textarea id="keypoints" rows="3"></textarea></div>
    <div class="row" style="margin-top:12px"><button class="btn block" data-boss-reveal="1" id="done-speaking">Done speaking → rubric</button></div>
    <div id="feedback"></div>
  </section>`;
}
function bossReveal() {
  stopTimer(); stopRec(); const q = boss.qs[boss.idx];
  $('#feedback').innerHTML = `<div class="model-answer"><b>Strong answer outline.</b> ${inline(q.modelOutline)}</div>
    <div class="rubric">${q.rubric.map((r, i) => `<label><input type="checkbox" data-rub="${i}"> <span>${esc(r)}</span></label>`).join('')}</div>
    <div class="row" style="margin-top:12px"><button class="btn primary block" data-boss-next="1">${boss.idx + 1 < boss.qs.length ? 'Next question' : 'See the verdict'}</button></div>`;
  $('#done-speaking').hidden = true;
}
function bossNext() {
  const q = boss.qs[boss.idx]; const boxes = [...document.querySelectorAll('[data-rub]')];
  const hit = boxes.filter(b => b.checked).length; const missed = boxes.filter(b => !b.checked).map(b => q.rubric[+b.dataset.rub]);
  boss.ticks.push({ hit, total: q.rubric.length, missed });
  boss.idx++;
  if (boss.idx >= boss.qs.length) {
    const total = boss.ticks.reduce((a, t) => a + t.total, 0), h = boss.ticks.reduce((a, t) => a + t.hit, 0); const score = total ? h / total : 0; const pass = score >= BOSS_PASS;
    if (boss.tier === 'final') { S.final.attempts.push({ date: todayStr(), score, pass }); if (pass) { S.final.beaten = true; S.xp += XP.finalBoss; } }
    else { const b = S.bosses[boss.tier] = S.bosses[boss.tier] || { attempts: [] }; b.attempts.push({ date: todayStr(), score, pass }); if (pass) { b.beaten = true; b.beatenAt = todayStr(); S.xp += XP.boss; } else b.lockedUntil = Date.now() + BOSS_LOCKOUT_MS; }
    persist('state'); boss.phase = 'result';
  }
  render(); window.scrollTo({ top: 0 });
}

// ---- Stories
function storyStatus(id) { const st = ST.items[id]; if (!st || !st.situation) return { cls: '', label: 'Not written' }; const last = st.ratings?.[st.ratings.length - 1]; if (last == null) return { cls: 'mid', label: 'Written, not drilled' }; return last >= GOOD ? { cls: 'ok', label: 'Solid' } : { cls: 'low', label: 'Needs work' }; }
function renderStories() {
  const stories = C.stories?.stories || [];
  return `
  <section class="panel">
    <div class="panel-head"><h2>Your stories</h2><span class="small muted">${stories.filter(s => ST.items[s.id]?.situation).length}/${stories.length} written</span></div>
    <p class="small muted">${esc(C.stories?.format || '')}</p>
    <p class="hint" style="margin-top:6px">Stories are stored in your private area of the page's database. Nobody else, Claude included, can read them.</p>
  </section>
  <section class="panel"><div class="stack">
    ${stories.map(s => { const st = storyStatus(s.id); const d = ST.items[s.id]; const due = d?.situation && (!d.due || d.due <= endOfToday());
      return `<div class="story"><div class="st"><div class="row" style="gap:8px"><i class="dot ${st.cls}"></i><b>${esc(s.title)}</b>${due ? '<span class="pill">due</span>' : ''}</div><div class="b">${esc(s.brief)}</div><div class="hint">${st.label}${d?.ratings?.length ? ` · drilled ${d.ratings.length}×` : ''}</div></div>
        <div class="row" style="gap:6px"><button class="btn small" data-story-edit="${s.id}" style="min-height:34px">${d?.situation ? 'Edit' : 'Write'}</button>${d?.situation ? `<button class="btn primary small" data-story-drill="${s.id}" style="min-height:34px">Drill</button>` : ''}</div></div>`; }).join('')}
  </div></section>
  ${C.stories?.extra ? `<section class="panel"><div class="eyebrow">Also ready</div><h3>${esc(C.stories.extra.title)}</h3><p class="small muted" style="margin-top:4px">${esc(C.stories.extra.note)}</p></section>` : ''}`;
}
function renderStoryEdit() {
  const s = (C.stories?.stories || []).find(x => x.id === route.story); if (!s) return renderStories();
  const d = ST.items[s.id] || {};
  return `<section class="panel">
    <button class="btn ghost" data-go="stories">← Stories</button>
    <h1 style="margin-top:12px">${esc(s.title)}</h1>
    <p class="muted small" style="margin-top:4px">${esc(s.brief)}</p>
    <p class="small" style="margin-top:6px">Answers: ${esc(s.answers)}</p>
    <div class="stack" style="margin-top:14px">
      <div><label for="st-sit">Situation (under 20 seconds: scale, stakes, your role)</label><textarea id="st-sit" rows="3">${esc(d.situation || '')}</textarea></div>
      <div><label for="st-dec">What you decided, and what you rejected</label><textarea id="st-dec" rows="3">${esc(d.decision || '')}</textarea></div>
      <div><label for="st-res">Result with a number</label><textarea id="st-res" rows="2">${esc(d.result || '')}</textarea></div>
      <div><label for="st-hook">One line on why it matters for this role</label><input type="text" id="st-hook" value="${esc(d.hook || '')}"></div>
    </div>
    <div class="panel" style="margin-top:14px;background:var(--bg-2)"><div class="eyebrow">Prompts to mine</div><ul class="small muted" style="margin:6px 0 0;padding-left:18px">${s.prompts.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
    <div class="row" style="margin-top:14px"><button class="btn primary" data-story-save="${s.id}">Save</button>${d.situation ? `<button class="btn" data-story-drill="${s.id}">Drill it</button>` : ''}</div>
  </section>`;
}
function renderStoryDrill() { return renderStoryDrillCard(route.story, false); }
function renderStoryDrillCard(id, inSession) {
  const s = (C.stories?.stories || []).find(x => x.id === id); if (!s) return renderStories();
  const d = ST.items[id] || {};
  return `<section class="card" data-story="${id}">
    <div class="kind"><span class="eyebrow">Story drill</span><span class="pill">2:00</span></div>
    <div class="prompt">“Tell me about ${esc(s.title.charAt(0).toLowerCase() + s.title.slice(1))}.”</div>
    ${d.hook ? `<p class="small muted" style="margin-top:6px">Land on: ${esc(d.hook)}</p>` : ''}
    <div class="timer num" id="timer">2:00</div><div class="timer-bar"><i id="timer-bar"></i></div>
    <div id="rec-area" class="row" style="justify-content:center;margin-top:12px"><button class="btn primary big" data-timer-start="120">Start speaking</button></div>
    <div class="row" style="margin-top:12px"><button class="btn block" data-story-reveal="${id}" id="done-speaking">Done speaking → compare</button></div>
    <div id="feedback"></div>
    ${inSession ? `<div class="row" style="justify-content:space-between;margin-top:14px"><button class="btn ghost small" data-skip="story:${id}" style="min-height:32px">Skip for now</button></div>` : `<div class="row" style="margin-top:14px"><button class="btn ghost" data-go="stories">Cancel</button></div>`}
  </section>`;
}
function storyReveal(id) {
  stopTimer(); stopRec(); const d = ST.items[id] || {}; const rub = C.stories?.rubric || [];
  const elapsed = window.__lastElapsed || 0;
  $('#feedback').innerHTML = `<div class="model-answer"><b>Your written version.</b><br>${esc(d.situation || '')}<br><br>${esc(d.decision || '')}<br><br>${esc(d.result || '')}</div>
    <div class="rubric">${rub.map((r, i) => `<label><input type="checkbox" data-rub="${i}" ${i === 4 && elapsed > 0 && elapsed <= 125000 ? 'checked' : ''}> <span>${esc(r)}</span></label>`).join('')}</div>
    <div class="hint" style="margin-top:8px">You spoke for ${fmtMs(elapsed)}. Rate the whole thing:</div>
    <div class="rate">${GRADE_LABEL.map((g, i) => `<button class="btn ${['bad', 'warn', 'good', 'info'][i]}" data-story-rate="${i}">${g}<small>${['again tomorrow', '2 days', '3 days', 'before the interview'][i]}</small></button>`).join('')}</div>`;
  $('#done-speaking').hidden = true;
}
function storyRate(id, grade) {
  const d = ST.items[id] = ST.items[id] || {}; d.ratings = d.ratings || []; d.ratings.push(grade);
  const iv = [1, 2, 3, Math.max(3, Math.min(6, daysLeft() - 1))][grade]; d.due = Date.now() + iv * DAY; d.lastDrill = todayStr();
  persist('stories');
  const t = today(); t.story++; S.xp += XP.story; checkMinimum(); persist('state');
  if (session) { session.answered++; session.xp += XP.story; if (grade >= GOOD) { session.correct++; session.combo++; } else session.combo = 0; nextItem(); }
  else { toast(`Story drilled. +${XP.story} XP. Next in ${iv} day${iv > 1 ? 's' : ''}.`); go('stories'); }
}

// ---- Quests
function renderQuests() {
  const Q = C.quests; if (!Q) return '<section class="panel empty">No schedule loaded.</section>';
  const t = todayStr();
  const earned = Object.keys(S.quests).length;
  return `
  <section class="panel">
    <div class="panel-head"><h2>Two-week build</h2><span class="small muted num">${earned} done</span></div>
    <p class="small muted">Day 1 is ${esc(Q.startDate)}. Tick a day when its work is done; the portfolio steps below are worth the most.</p>
  </section>
  <section class="panel"><div class="stack">
    ${Q.schedule.map(q => { const done = !!S.quests['day' + q.day]; const cls = q.date === t ? 'today' : q.date < t ? 'past' : '';
      return `<label class="quest ${cls}${done ? ' done' : ''}"><input type="checkbox" data-quest="day${q.day}" ${done ? 'checked' : ''}><div class="qt"><div class="qd">Day ${q.day} · ${esc(q.date)}${q.date === t ? ' · today' : ''}</div><div>${esc(q.title)}</div></div><span class="xp">+${q.xp}</span></label>`; }).join('')}
  </div></section>
  <section class="panel">
    <div class="panel-head"><h2>${esc(Q.portfolio.title)}</h2><span class="small muted num">${Q.portfolio.steps.filter(s => S.quests[s.id]).length}/${Q.portfolio.steps.length}</span></div>
    <p class="small muted" style="margin-bottom:12px">${esc(Q.portfolio.what)}</p>
    <div class="stack">${Q.portfolio.steps.map(s => { const done = !!S.quests[s.id]; return `<label class="quest${done ? ' done' : ''}"><input type="checkbox" data-quest="${s.id}" ${done ? 'checked' : ''}><div class="qt">${esc(s.title)}</div><span class="xp">+${s.xp}</span></label>`; }).join('')}</div>
    <p class="hint" style="margin-top:10px">${esc(Q.portfolio.cut)}</p>
  </section>
  <section class="panel"><div class="eyebrow">Questions for them</div><ul class="small" style="margin:8px 0 0;padding-left:18px">${Q.questionsForThem.map(q => `<li>${esc(q)}</li>`).join('')}</ul></section>`;
}
function toggleQuest(id, on) {
  const Q = C.quests; const sched = Q.schedule.find(q => 'day' + q.day === id); const step = Q.portfolio.steps.find(s => s.id === id);
  const xp = sched ? sched.xp : step ? step.xp : 0;
  if (on && !S.quests[id]) { S.quests[id] = todayStr(); S.xp += xp; toast(`+${xp} XP`); }
  else if (!on && S.quests[id]) { delete S.quests[id]; S.xp = Math.max(0, S.xp - xp); }
  persist('state'); renderTop();
}

// ---- Stats
function renderStats() {
  const dates = []; const d = new Date(); for (let i = 13; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); dates.push(todayStr(x)); }
  const totalMs = Object.values(S.days).reduce((a, x) => a + (x.ms || 0), 0);
  const totalAns = Object.values(S.days).reduce((a, x) => a + (x.answered || 0), 0);
  const totalClean = Object.values(S.days).reduce((a, x) => a + (x.cleanHits || 0), 0);
  const activeDays = Object.values(S.days).filter(x => x.answered > 0).length;
  const hours = T.hours || {};
  return `
  <section class="panel">
    <div class="panel-head"><h2>Trends</h2><span class="small muted">last 14 days</span></div>
    <div class="kpis">
      <div class="kpi"><div class="v num">${totalAns}</div><div class="k">answers</div></div>
      <div class="kpi"><div class="v num">${totalClean}</div><div class="k">clean hits</div></div>
      <div class="kpi"><div class="v num">${fmtMs(totalMs)}</div><div class="k">on task</div></div>
      <div class="kpi"><div class="v num">${activeDays}</div><div class="k">active days</div></div>
    </div>
  </section>
  <section class="panel">
    <div class="eyebrow" style="margin-bottom:10px">Daily accuracy by tier</div>
    <div class="stack">${C.tierList.map(t => { const a = recentAcc(t.id); return `<div class="stat-row"><div class="small" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</div><canvas class="spark" data-spark="${t.id}" width="400" height="56"></canvas><div class="num small" style="text-align:right">${a == null ? '—' : pct(a) + '%'}</div></div>`; }).join('')}</div>
    <p class="hint" style="margin-top:8px">Each point is one day's accuracy in that tier. The endpoint is today.</p>
  </section>
  <section class="panel">
    <div class="eyebrow" style="margin-bottom:10px">Speed on correct recall</div>
    <div class="stack">${C.tierList.map(t => { const rt = S.rt[t.id] || []; const med = rt.length ? [...rt].sort((a, b) => a - b)[Math.floor(rt.length / 2)] : null; return `<div class="stat-row"><div class="small" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</div><canvas class="spark" data-spark-rt="${t.id}" width="400" height="56"></canvas><div class="num small" style="text-align:right">${med == null ? '—' : (med / 1000).toFixed(1) + 's'}</div></div>`; }).join('')}</div>
    <p class="hint" style="margin-top:8px">Last 20 correct answers per tier. Under ${CLEAN_HIT_MS / 1000}s is a clean hit.</p>
  </section>
  <section class="panel">
    <div class="eyebrow" style="margin-bottom:10px">When you played today</div>
    <div class="row" style="gap:3px;align-items:flex-end;height:50px">${Array.from({ length: 24 }, (_, h) => { const v = hours[h] || 0; const max = Math.max(1, ...Object.values(hours)); return `<div title="${h}:00 · ${v}" style="flex:1;height:${Math.max(3, v / max * 48)}px;background:${v ? 'var(--accent)' : 'var(--surface-2)'};border-radius:2px"></div>`; }).join('')}</div>
    <div class="row small muted" style="justify-content:space-between"><span>0h</span><span>12h</span><span>23h</span></div>
  </section>`;
}
function drawSparks() {
  const dates = []; const d = new Date(); for (let i = 13; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); dates.push(todayStr(x)); }
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim(), line = css.getPropertyValue('--line').trim(), good = css.getPropertyValue('--good').trim();
  document.querySelectorAll('[data-spark]').forEach(cv => {
    const tid = cv.dataset.spark; const pts = dates.map(dt => { const x = S.days[dt]?.tiers?.[tid]; return x && x.a ? x.c / x.a : null; });
    spark(cv, pts, 0, 1, accent, line);
  });
  document.querySelectorAll('[data-spark-rt]').forEach(cv => {
    const rt = (S.rt[cv.dataset.sparkRt] || []).map(x => x / 1000); const max = Math.max(10, ...rt);
    spark(cv, rt.length ? rt : [], 0, max, good, line, true);
  });
}
function spark(cv, pts, min, max, color, gridColor, invert) {
  const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = gridColor; ctx.lineWidth = 1; [0.25, 0.5, 0.75].forEach(f => { ctx.beginPath(); ctx.moveTo(0, H * f); ctx.lineTo(W, H * f); ctx.stroke(); });
  const valid = pts.map((v, i) => [i, v]).filter(p => p[1] != null); if (!valid.length) return;
  const n = Math.max(2, pts.length); const x = (i) => 6 + i / (n - 1) * (W - 12); const y = (v) => 6 + (1 - (v - min) / (max - min || 1)) * (H - 12);
  ctx.beginPath(); valid.forEach(([i, v], k) => { k ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)); });
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.lineTo(x(valid[valid.length - 1][0]), H); ctx.lineTo(x(valid[0][0]), H); ctx.closePath(); ctx.fillStyle = color + '22'; ctx.fill();
  const last = valid[valid.length - 1]; ctx.beginPath(); ctx.arc(x(last[0]), y(last[1]), 3.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}

// ---- Settings
function renderSettings() {
  return `<section class="panel"><button class="btn ghost" data-go="home">← Docket</button><h2 style="margin-top:12px">Dates</h2>
    <div class="grid-2" style="margin-top:12px"><div><label for="set-int">Interview date</label><input type="date" id="set-int" value="${esc(S.settings.interviewDate)}"></div><div><label for="set-start">Day 1 of the plan</label><input type="date" id="set-start" value="${esc(S.settings.startDate)}"></div></div>
    <p class="hint" style="margin-top:8px">Review intervals are capped so every card resurfaces before the interview date. The schedule on the Build tab keeps its own dates.</p>
    <div class="row" style="margin-top:14px"><button class="btn primary" data-save-settings="1">Save</button></div>
    <hr><div class="small muted">Storage: ${dbStatus === 'synced' ? 'synced to the page database and this browser' : 'this browser only'}. XP ${S.xp}. ${Object.keys(S.cards).length} cards touched.</div></section>`;
}

// ---------------------------------------------------------------- recording
async function startRecording(area) {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream); const chunks = [];
    mr.ondataavailable = e => chunks.push(e.data);
    mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); const url = URL.createObjectURL(new Blob(chunks, { type: mr.mimeType })); const a = document.createElement('audio'); a.controls = true; a.src = url; a.style.width = '100%'; area.appendChild(a); };
    mr.start(); return mr;
  } catch { return null; }
}

// ---------------------------------------------------------------- event binding
function bind(root) {
  root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  bindMock(root);
  root.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => startSession(b.dataset.start, b.dataset.tier)));
  root.querySelectorAll('[data-node]').forEach(b => b.addEventListener('click', () => { const n = C.nodeById[b.dataset.node]; if (nodeUnlocked(n)) go('lesson', { node: n.id }); else toast(`Locked. Finish ${C.nodeById[C.tiers[n.tier].nodes[C.tiers[n.tier].nodes.indexOf(n.id) - 1]].title} first.`); }));
  root.querySelectorAll('[data-drill]').forEach(b => b.addEventListener('click', () => startNodeDrill(b.dataset.drill)));
  root.querySelectorAll('[data-primer-ok]').forEach(b => b.addEventListener('click', () => { markPrimer(b.dataset.primerOk); render(); window.scrollTo({ top: 0 }); }));
  root.querySelectorAll('details[data-facts]').forEach(d => d.addEventListener('toggle', () => { if (d.open && !d.dataset.filled) { d.dataset.filled = '1'; const body = d.querySelector('.facts-body'); body.innerHTML = nodeFactsHtml(C.nodeById[d.dataset.facts]); bind(body); } }));
  root.querySelectorAll('[data-next-tier]').forEach(b => b.addEventListener('click', () => openNext(b.dataset.nextTier)));
  root.querySelectorAll('[data-lesson]').forEach(b => b.addEventListener('click', () => { if (session) { sessionTele({ end: Date.now(), completed: false, answered: session.answered, quitAt: session.idx, toLesson: true }); session = null; } go('lesson', { node: b.dataset.lesson }); }));
  root.querySelectorAll('[data-boss]').forEach(b => b.addEventListener('click', () => startBoss(b.dataset.boss)));
  root.querySelectorAll('[data-boss-begin]').forEach(b => b.addEventListener('click', () => { boss.phase = 'q'; render(); }));
  root.querySelectorAll('[data-boss-reveal]').forEach(b => b.addEventListener('click', bossReveal));
  root.querySelectorAll('[data-quit]').forEach(b => b.addEventListener('click', () => endSession(false)));
  root.querySelectorAll('[data-skip]').forEach(b => b.addEventListener('click', () => skipItem(b.dataset.skip)));
  root.querySelectorAll('[data-story-edit]').forEach(b => b.addEventListener('click', () => go('storyEdit', { story: b.dataset.storyEdit })));
  root.querySelectorAll('[data-story-drill]').forEach(b => b.addEventListener('click', () => go('storyDrill', { story: b.dataset.storyDrill })));
  root.querySelectorAll('[data-story-save]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.storySave; const d = ST.items[id] = ST.items[id] || {};
    d.situation = $('#st-sit').value.trim(); d.decision = $('#st-dec').value.trim(); d.result = $('#st-res').value.trim(); d.hook = $('#st-hook').value.trim();
    if (!d.due && d.situation) d.due = Date.now();
    persist('stories'); toast('Saved.'); go('stories');
  }));
  root.querySelectorAll('[data-story-reveal]').forEach(b => b.addEventListener('click', () => storyReveal(b.dataset.storyReveal)));
  root.querySelectorAll('[data-quest]').forEach(b => b.addEventListener('change', () => { toggleQuest(b.dataset.quest, b.checked); b.closest('.quest').classList.toggle('done', b.checked); }));
  root.querySelectorAll('[data-save-settings]').forEach(b => b.addEventListener('click', () => { S.settings.interviewDate = $('#set-int').value || S.settings.interviewDate; S.settings.startDate = $('#set-start').value || S.settings.startDate; persist('state'); toast('Dates saved.'); go('home'); }));
  root.querySelectorAll('[data-timer-start]').forEach(b => b.addEventListener('click', async () => {
    const secs = +b.dataset.timerStart; const area = $('#rec-area');
    b.disabled = true; b.textContent = 'Speaking…';
    currentRec = await startRecording(area);
    if (!currentRec) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = 'Microphone is not available in this viewer. Use your phone\'s voice memo app if you want playback.'; area.appendChild(h); }
    window.__lastElapsed = 0;
    runTimer(secs, (el, left) => { window.__lastElapsed = el; const t = $('#timer'); if (!t) { stopTimer(); return; } t.textContent = fmtMs(Math.abs(left)); t.classList.toggle('over', left < 0); const bar = $('#timer-bar'); if (bar) bar.style.width = clamp(left / (secs * 1000), 0, 1) * 100 + '%'; });
  }));
  // in-session answers
  const card = root.querySelector('.card[data-item]');
  if (card) {
    const it = C.items[card.dataset.item]; const t0 = Date.now();
    card.querySelectorAll('[data-mc]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.mc; const ok = i === it.answer; const ms = Date.now() - t0;
      card.querySelectorAll('[data-mc]').forEach(x => { x.disabled = true; if (+x.dataset.mc === it.answer) x.classList.add('correct'); else if (+x.dataset.mc === i) x.classList.add('wrong'); });
      answerStatic(it, ok, ok ? (ms < CLEAN_HIT_MS ? EASY : GOOD) : AGAIN, ms, ok ? 'Correct' : 'Not quite', it.why);
    }));
    card.querySelectorAll('[data-tf]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.tf === 'true'; const ok = v === it.answer; const ms = Date.now() - t0;
      card.querySelectorAll('[data-tf]').forEach(x => { x.disabled = true; if ((x.dataset.tf === 'true') === it.answer) x.classList.add('correct'); else if (x.dataset.tf === b.dataset.tf) x.classList.add('wrong'); });
      answerStatic(it, ok, ok ? (ms < CLEAN_HIT_MS ? EASY : GOOD) : AGAIN, ms, ok ? 'Correct' : 'Not quite', it.why);
    }));
    card.querySelectorAll('[data-sc]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.sc; const o = it.options[i]; const ms = Date.now() - t0;
      card.querySelectorAll('[data-sc]').forEach(x => { x.disabled = true; const v = it.options[+x.dataset.sc].verdict; if (v === 'best') x.classList.add('correct'); else if (+x.dataset.sc === i) x.classList.add(v === 'ok' ? 'ok' : 'wrong'); });
      const grade = o.verdict === 'best' ? (ms < 20000 ? EASY : GOOD) : o.verdict === 'ok' ? HARD : AGAIN;
      const others = it.options.map((x, k) => k === i ? '' : `<div class="small" style="margin-top:6px"><b style="color:${x.verdict === 'best' ? 'var(--good)' : x.verdict === 'ok' ? 'var(--warn)' : 'var(--bad)'}">${x.verdict}</b> · ${inline(x.why)}</div>`).join('');
      answerStatic(it, o.verdict === 'best', grade, ms, o.verdict === 'best' ? 'Best call' : o.verdict === 'ok' ? 'Defensible, not best' : 'That would hurt', o.why, `<div style="margin-top:8px">${others}</div>`);
    }));
    card.querySelectorAll('[data-reveal]').forEach(b => b.addEventListener('click', () => {
      stopTimer(); stopRec(); const ms = Date.now() - t0; b.closest('.row').hidden = true;
      if (it.kind === 'recall') {
        const gap = card.querySelector('.gap'); if (gap) { gap.textContent = it.answer; gap.style.color = 'var(--accent-2)'; }
        $('#feedback').innerHTML = `<div class="feedback"><div class="why">${inline(it.why)}</div><div class="hint" style="margin-top:8px">Did you have it?</div><div class="rate">${GRADE_LABEL.map((g, i) => `<button class="btn ${['bad', 'warn', 'good', 'info'][i]}" data-rate="${i}">${g}</button>`).join('')}</div></div>`;
      } else {
        $('#feedback').innerHTML = `<div class="model-answer"><b>Model answer.</b> ${inline(it.modelAnswer)}</div><div class="rubric">${it.rubric.map((r, i) => `<label><input type="checkbox" data-rub="${i}"> <span>${esc(r)}</span></label>`).join('')}</div><div class="hint" style="margin-top:8px">Spoke for ${fmtMs(window.__lastElapsed || 0)}. Rate it:</div><div class="rate">${GRADE_LABEL.map((g, i) => `<button class="btn ${['bad', 'warn', 'good', 'info'][i]}" data-rate="${i}">${g}<small>${['again soon', 'in a day', 'a few days', 'before the interview'][i]}</small></button>`).join('')}</div>`;
      }
      $('#feedback').querySelectorAll('[data-rate]').forEach(rb => rb.addEventListener('click', () => {
        const g = +rb.dataset.rate; const ticked = [...$('#feedback').querySelectorAll('[data-rub]')].filter(x => x.checked).length;
        const label = g === AGAIN ? 'Again' : g === HARD ? 'Hard' : g === GOOD ? 'Good' : 'Easy';
        const why = it.kind === 'recall' ? it.why : `${ticked}/${it.rubric.length} rubric points. ${g >= GOOD ? 'Keep the structure; tighten the example.' : 'Reread the lesson, then try the prompt again tomorrow.'}`;
        $('#feedback').innerHTML = ''; answerStatic(it, g >= GOOD, g, ms, label, why);
      }));
    }));
  }
  if (route.screen === 'stats') requestAnimationFrame(drawSparks);
}
// Delegated handlers for controls inserted after render (feedback panels). Bound once.
function bindDelegated(main) {
  main.addEventListener('click', (e) => {
    if (e.target.closest('[data-next]')) { nextItem(); return; }
    if (e.target.closest('[data-boss-next]')) { bossNext(); return; }
    const sr = e.target.closest('[data-story-rate]'); if (sr) { storyRate(sr.closest('[data-story]').dataset.story, +sr.dataset.storyRate); }
  });
}

// ---------------------------------------------------------------- boot
async function boot(hot) {
  loadLocal();
  if (T.date !== todayStr()) T = defaultTele(todayStr());
  T.opens++; teleHour(); persist('tele');
  await loadContent();
  const h = (location.hash || '').replace('#', ''); if (TABS.some(t => t.id === h)) route = { screen: h };
  if (hot?.route && !hot.session) route = hot.route;
  bindDelegated($('#main'));
  render();
  connectDb();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { T.timeOnPage += Date.now() - pageShownAt; if (session && !session.done) sessionTele({ hiddenAt: session.idx }); persist('tele'); }
    else { pageShownAt = Date.now(); teleHour(); if (T.date !== todayStr()) { T = defaultTele(todayStr()); T.opens++; persist('tele'); render(); } }
  });
  window.addEventListener('hashchange', () => { const x = (location.hash || '').replace('#', ''); if (TABS.some(t => t.id === x) && x !== route.screen) go(x); });
  if (window.claude?.hot?.snapshot) window.claude.hot.snapshot(() => ({ route: TABS.some(t => t.id === route.screen) ? route : { screen: 'home' } }));
}
const start = (data) => boot(data || {});
if (window.claude?.hot?.ready) window.claude.hot.ready(start); else start(window.claude?.hot?.data ?? {});
})();
