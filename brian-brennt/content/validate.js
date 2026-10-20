#!/usr/bin/env node
// Validates a Brian Brennt content pack. Usage: node validate.js <file.json> [--min-cards N --min-explain N --min-scenarios N --min-boss N]
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) { console.error('usage: validate.js <file.json>'); process.exit(2); }
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : def; };
const min = { cards: opt('--min-cards', 0), explain: opt('--min-explain', 0), scenarios: opt('--min-scenarios', 0), boss: opt('--min-boss', 0) };

const errors = [];
const err = (m) => errors.push(m);
let pack;
try { pack = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('JSON parse error: ' + e.message); process.exit(1); }

const TIERS = ['agentic', 'aws', 'react-python', 'security', 'ediscovery', 'cv'];
const words = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length;

if (!pack.tier || !TIERS.includes(pack.tier.id)) err('tier.id must be one of ' + TIERS.join('|'));
if (!pack.tier?.name) err('tier.name missing');
if (![1, 2, 3].includes(pack.tier?.level)) err('tier.level must be 1, 2 or 3');
if (!pack.tier?.tease || pack.tier.tease.length > 100) err('tier.tease missing or > 100 chars');
if (!Array.isArray(pack.nodes) || pack.nodes.length === 0) err('nodes must be a non-empty array');

const ids = new Set();
const uniq = (id, where) => { if (!id) return err(where + ': missing id'); if (ids.has(id)) err('duplicate id ' + id); ids.add(id); };
let counts = { cards: 0, explain: 0, scenarios: 0, boss: 0 };
const types = { mc: 0, tf: 0, cloze: 0 };

for (const n of pack.nodes || []) {
  const w = 'node ' + (n.id || '?');
  uniq(n.id, w);
  if (n.id && !n.id.startsWith(pack.tier.id + '.')) err(w + ': id must start with ' + pack.tier.id + '.');
  if (!n.title || n.title.length > 40) err(w + ': title missing or > 40 chars');
  if (!n.tease || n.tease.length > 100) err(w + ': tease missing or > 100 chars');
  const P = n.primer;
  if (!P) err(w + ': primer missing');
  else {
    const pw = words(P.problem), cw = words(P.picture);
    if (pw < 20 || pw > 70) err(w + ': primer.problem is ' + pw + ' words (want 25-60)');
    if (cw < 30 || cw > 110) err(w + ': primer.picture is ' + cw + ' words (want 40-90)');
    if (P.sketch && P.sketch.split('\n').length > 12) err(w + ': primer.sketch > 12 lines');
    if (!Array.isArray(P.terms) || P.terms.length < 3 || P.terms.length > 7) err(w + ': primer.terms needs 3-7 entries');
    for (const t of P.terms || []) {
      if (!t.term || t.term.length > 40) err(w + ': primer term missing or > 40 chars');
      const dw = words(t.def);
      if (dw < 5 || dw > 30) err(w + ': primer term "' + t.term + '" def is ' + dw + ' words (want 8-25)');
    }
  }
  const L = n.lesson || {};
  const wc = words(L.body);
  if (wc < 120 || wc > 340) err(w + ': lesson.body is ' + wc + ' words (want 150-300)');
  if (L.snippet && L.snippet.split('\n').length > 26) err(w + ': snippet > 24 lines');
  if (L.snippet && !['python', 'hcl', 'tsx', 'json', 'bash', 'text', 'csharp', 'sql', 'typescript'].includes(L.snippetLang)) err(w + ': snippetLang invalid');
  if (!L.source?.url?.startsWith('http') || !L.source?.title) err(w + ': lesson.source needs title and http url');
  if (!Array.isArray(n.cards) || n.cards.length < 3) err(w + ': needs >= 3 cards');
  for (const c of n.cards || []) {
    const cw = w + ' card ' + (c.id || '?');
    uniq(c.id, cw);
    if (c.id && !c.id.startsWith(n.id + '.')) err(cw + ': id must start with ' + n.id + '.');
    if (!c.prompt) err(cw + ': prompt missing');
    if (!c.why || words(c.why) < 5) err(cw + ': why missing or too short');
    if (c.type === 'mc') {
      if (!Array.isArray(c.options) || c.options.length < 3 || c.options.length > 5) err(cw + ': mc needs 3-5 options');
      if (!Number.isInteger(c.answer) || c.answer < 0 || c.answer >= (c.options || []).length) err(cw + ': mc answer index out of range');
    } else if (c.type === 'tf') {
      if (typeof c.answer !== 'boolean') err(cw + ': tf answer must be boolean');
    } else if (c.type === 'cloze') {
      if ((c.prompt.match(/___/g) || []).length !== 1) err(cw + ': cloze prompt needs exactly one ___');
      if (typeof c.answer !== 'string' || !c.answer) err(cw + ': cloze answer must be a string');
    } else err(cw + ': unknown type ' + c.type);
    if (types[c.type] !== undefined) types[c.type]++;
    counts.cards++;
  }
  for (const e of n.explain || []) {
    const ew = w + ' explain ' + (e.id || '?');
    uniq(e.id, ew);
    if (e.id && !e.id.startsWith(n.id + '.')) err(ew + ': id must start with ' + n.id + '.');
    if (!e.prompt) err(ew + ': prompt missing');
    if (!Number.isInteger(e.seconds) || e.seconds < 60 || e.seconds > 240) err(ew + ': seconds 60-240');
    const mw = words(e.modelAnswer);
    if (mw < 90 || mw > 240) err(ew + ': modelAnswer is ' + mw + ' words (want 120-200)');
    if (!Array.isArray(e.rubric) || e.rubric.length < 4 || e.rubric.length > 6) err(ew + ': rubric needs 4-6 items');
    counts.explain++;
  }
  for (const s of n.scenarios || []) {
    const sw = w + ' scenario ' + (s.id || '?');
    uniq(s.id, sw);
    if (s.id && !s.id.startsWith(n.id + '.')) err(sw + ': id must start with ' + n.id + '.');
    if (!s.situation || words(s.situation) < 15) err(sw + ': situation missing or too short');
    if (!s.question) err(sw + ': question missing');
    if (!Array.isArray(s.options) || s.options.length < 3 || s.options.length > 4) err(sw + ': needs 3-4 options');
    const best = (s.options || []).filter(o => o.verdict === 'best').length;
    if (best !== 1) err(sw + ': exactly one option must be best (found ' + best + ')');
    for (const o of s.options || []) {
      if (!['best', 'ok', 'bad'].includes(o.verdict)) err(sw + ': bad verdict ' + o.verdict);
      if (!o.text || !o.why) err(sw + ': option needs text and why');
    }
    counts.scenarios++;
  }
}
for (const b of pack.boss?.questions || []) {
  const bw = 'boss ' + (b.id || '?');
  uniq(b.id, bw);
  if (b.id && !b.id.startsWith(pack.tier.id + '.boss.')) err(bw + ': id must start with ' + pack.tier.id + '.boss.');
  if (!b.prompt) err(bw + ': prompt missing');
  if (!Number.isInteger(b.seconds) || b.seconds < 120 || b.seconds > 2700) err(bw + ': seconds 120-2700');
  const ow = words(b.modelOutline);
  if (ow < 60 || ow > 200) err(bw + ': modelOutline is ' + ow + ' words (want 80-150)');
  if (!Array.isArray(b.rubric) || b.rubric.length < 6 || b.rubric.length > 8) err(bw + ': rubric needs 6-8 items');
  counts.boss++;
}

if (counts.cards < min.cards) err('only ' + counts.cards + ' cards, need >= ' + min.cards);
if (counts.explain < min.explain) err('only ' + counts.explain + ' explain prompts, need >= ' + min.explain);
if (counts.scenarios < min.scenarios) err('only ' + counts.scenarios + ' scenarios, need >= ' + min.scenarios);
if (counts.boss < min.boss) err('only ' + counts.boss + ' boss questions, need >= ' + min.boss);
const mcShare = counts.cards ? types.mc / counts.cards : 0;
if (counts.cards >= 10 && (mcShare < 0.3 || mcShare > 0.7)) err('card type mix off: mc=' + types.mc + ' tf=' + types.tf + ' cloze=' + types.cloze + ' (want roughly 50/25/25)');

console.log(JSON.stringify({ file: path.basename(file), nodes: (pack.nodes || []).length, ...counts, types }));
if (errors.length) { console.log(errors.length + ' error(s):'); errors.forEach(e => console.log(' - ' + e)); process.exit(1); }
console.log('OK');
