// Retro Vault Sandbox engine: one world, run by the browser prototype (docs/sandbox/trading-floor.html) and by the
// Node runner with AI bots (sandbox/run.mjs). Plain JS, no dependencies, deterministic for a seed (AI bots aside).
//
// The world: a fixed pool of cards for the 203 real league players. Nothing is simulated about the players: their
// stats are the real ones, in a library a bot can read only with research passes (3 a week by default). Each card has
// a HIDDEN fundamental (the site's card value ÷ 20, in coins) that no bot ever sees; bots estimate it from research.
// Bots trade cards in a weekly call auction, buy packs that mint from the pool, trade research passes, and swap or
// steal research notes. Every decision a run depends on is in DEFAULTS below.

export const DEFAULTS = {
  seed: 88,
  weeksPerGeneration: 20, // evolution and royalties happen at the end of each generation
  startCash: 1000,
  allowance: 10, // coins per bot per week (new money: this is the inflation lever)
  fee: 0.04, // share of every card sale kept by the house
  packSize: 5,
  packEdge: 0.25, // packs cost their expected hidden value × (1 + edge)
  poolMultiplier: 10, // unminted copies in the pool = copies in circulation at the start × this
  passesPerWeek: 3, // research passes granted to every bot each week
  passLife: 1, // weeks before an unused pass expires (1 = use or sell it this week)
  maxResearchPerWeek: 6, // most players one bot may research in a week, own and bought passes together
  passesTradable: true,
  knowledgeWeeks: 12, // a research note goes stale after this many weeks
  memoryCap: 25, // most notes one bot keeps (oldest dropped first)
  sharing: true, // bots may swap notes ("friendly")
  stealing: true, // thieves may copy another bot's notes
  detectChance: 0.35, // chance a theft is noticed; the victim then flags the thief and stops sharing with it
  gossip: true, // a victim's friends flag the thief too
  outsideCollectors: true, // buyers from outside the bots bid around hidden value (the market's anchor)
  royalties: true, // each generation, holders get 3% of hidden value per card held
  royaltyRate: 0.03,
  evolve: true, // the poorest 10% of rule bots are replaced by mutated copies of the richest 10%
  evolveShare: 0.1,
  games: true, // bots play Arcade quizzes about the real players (answers come from what they know) for free packs
  gameTickets: 3, // game tickets granted to every bot each week; a ticket is spent when a game starts (no restarts)
  ticketLife: 1, // weeks before an unused ticket expires
  ticketsTradable: true, // bots may sell tickets to bots that play better
  maxGamesPerWeek: 6, // most games one bot may play in a week, own and bought tickets together
  auctions: true, // bots may put a card up for a sealed-bid auction (highest bid wins, pays the second-highest)
  messages: false, // AI bots may talk: one public board post and two private messages a week (280 characters each)
  messageLimits: { public: 1, direct: 2, chars: 280 },
  gameTarget: 0.06, // average packs per ticket the payout aims for, the same for every game (nothing to farm)
  gameFloor: { need: 4, legs: 3 }, // the easiest each game may get, so guessing never pays well
  gamesAdaptive: true, // every 4 weeks each game's bar moves so its payout returns to gameTarget
  leagueUpdates: false, // TEST ONLY: every updateEvery weeks some players' hidden values move, as a real upload would
  updateEvery: 40,
  mix: [16, 14, 14, 24, 10, 12, 12], // rule bots per strategy, in ARCH order
  social: { sharer: 0.45, reciprocator: 0.35, thief: 0.2 }, // social style shares among rule bots
};

export const ARCH = [
  { key: 'value', label: 'Value', short: 'VAL', color: '#3987e5', blurb: 'Researches players and buys cards below its estimate of their worth, sells above it.' },
  { key: 'mm', label: 'Market maker', short: 'MM', color: '#d95926', blurb: 'Quotes a bid and an ask on a handful of cards and earns the spread.' },
  { key: 'momentum', label: 'Momentum', short: 'MOM', color: '#199e70', blurb: 'Buys what is rising, sells what is falling. Sells its research passes.' },
  { key: 'retail', label: 'Retail herd', short: 'RTL', color: '#c98500', blurb: 'Rips packs, chases hot cards, panic-sells when the market drops.' },
  { key: 'arb', label: 'Pack arbitrage', short: 'ARB', color: '#d55181', blurb: 'Rips packs when their pulls sell for more than the pack costs, then flips them.' },
  { key: 'collector', label: 'Collector', short: 'COL', color: '#008300', blurb: 'Researches and hoards two favourite players. Can corner a card.' },
  { key: 'contrarian', label: 'Contrarian', short: 'CTR', color: '#9085e9', blurb: 'Buys sharp drops below the recent average, sells the bounce.' },
  { key: 'ai', label: 'AI bots', short: 'AI', color: '#e66767', blurb: 'An LLM decides: research, orders, packs, passes, notes. Run by sandbox/run.mjs.' },
];
export const AI = 7;

/* ---------- Random ---------- */
function seeded(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---------- World ---------- */
export function createWorld(library, overrides = {}) {
  const cfg = { ...DEFAULTS, ...overrides, social: { ...DEFAULTS.social, ...(overrides.social || {}) } };
  const rand = seeded(cfg.seed * 7919 + 17);
  packCache = null; hot = []; mood = { drop: 0 }; // module state belongs to the newest world
  const W = {
    cfg, rand, t: 0, nextId: 1, cards: [], bots: [], events: [], arcsWeek: [], liq: new Map(),
    house: { fees: 0, packs: 0, outside: 0, royalties: 0 }, lastTrades: 0, passPrice: null, passTrades: 0,
    hist: { p: [], f: [], bub: [], gini: [], share: [], trades: [], money: [], pass: [], informed: [], flags: [], shares: [], thefts: [], gamePacks: [] },
    games: { hl: { need: 5, played: [], packs: [] }, ou: { legs: 3, played: [], packs: [] } }, gamePacksWeek: 0,
    tickets: true, ticketPrice: null, ticketTrades: 0, auctions: [], auctionResults: [], journal: [], board: [],
    cool: {}, cornered: new Set(), bubbleOn: false, week: { shares: 0, thefts: 0, caught: 0, researched: new Map() },
    library,
  };
  W.byPos = {}; W.libIndex = new Map(); W.byKey = new Map();
  library.players.forEach((p, i) => { (W.byPos[p.pos] ||= []).push(p); W.libIndex.set(p, i); });
  W.gauss = () => { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  W.pick = (a) => a[Math.floor(rand() * a.length)];
  library.players.forEach((p, i) => {
    const F = Math.max(1, p.hidden.value / 20);
    const circ = Math.max(2, Math.round(40 / Math.sqrt(Math.max(0.5, p.hidden.value / 100))));
    W.cards.push({ id: i, key: p.key, name: p.name, pos: p.pos, team: teamShort(p.team), F, P: F, P0: F, S0: circ, circ: 0, pool: circ * cfg.poolMultiplier, Ph: [F], volH: [] });
  });
  for (const c of W.cards) W.byKey.set(c.key, c);
  cfg.mix.forEach((n, a) => { for (let k = 0; k < n; k++) W.bots.push(newBot(W, a)); });
  for (const c of W.cards) for (let u = 0; u < c.S0; u++) { give(W.pick(W.bots), c, 1); c.circ++; }
  for (const b of W.bots) b.nwh = [worth(W, b)];
  record(W);
  log(W, 'start', `The market opens: ${W.bots.length} bots, ${W.cards.length} players, ${W.cards.reduce((s, c) => s + c.circ, 0).toLocaleString()} cards in circulation and ${W.cards.reduce((s, c) => s + c.pool, 0).toLocaleString()} still in the pool. Every price starts at its hidden value; no bot knows any player yet.`);
  return W;
}
export function teamShort(t) { const w = String(t || 'FA').split(' '); return t === 'Free agent' ? 'FA' : w[w.length - 1]; }

function socialStyle(W) { const s = W.cfg.social, r = W.rand(); return r < s.sharer ? 'sharer' : r < s.sharer + s.reciprocator ? 'reciprocator' : 'thief'; }
function baseGenes(W, a) {
  const r = W.rand;
  const g = { keep: lerp(0.08, 0.35, r()), err: lerp(0.06, 0.35, r()), passBid: lerp(2, 30, r()), passAsk: lerp(1, 12, r()), ticketBid: lerp(0.5, 8, r()), ticketAsk: lerp(0.2, 4, r()) };
  switch (a) {
    case 0: return { ...g, margin: lerp(0.06, 0.2, r()) };
    case 1: return { ...g, spread: lerp(0.03, 0.09, r()), size: 8 + Math.floor(r() * 9), book: [] };
    case 2: return { ...g, look: 3 + Math.floor(r() * 6), trig: lerp(0.04, 0.14, r()) };
    case 3: return { ...g, panic: lerp(0.06, 0.16, r()) };
    case 4: return { ...g, trig: lerp(1.0, 1.12, r()) };
    case 5: return { ...g, cap: lerp(1.4, 2.8, r()), sell: lerp(2.8, 4.5, r()), targets: collectorTargets(W) };
    case 6: return { ...g, dip: lerp(0.08, 0.22, r()) };
    default: return g;
  }
}
function mutate(W, g) {
  const o = { ...g, book: [], targets: g.targets ? g.targets.slice() : undefined };
  for (const k of Object.keys(o)) {
    if (typeof o[k] !== 'number') continue;
    o[k] = k === 'size' || k === 'look' ? Math.max(2, Math.round(o[k] * lerp(0.8, 1.2, W.rand()))) : o[k] * lerp(0.85, 1.15, W.rand());
  }
  return o;
}
function collectorTargets(W) { const pool = W.cards.filter((c) => c.F > 4 && c.F < 600); return [W.pick(pool).id, W.pick(pool).id]; }
export function newBot(W, a, parent, extra = {}) {
  const b = {
    id: W.nextId++, a, kind: a === AI ? 'ai' : 'rule', g: parent ? mutate(W, parent.g) : baseGenes(W, a), cash: W.cfg.startCash,
    h: new Map(), n: 0, nwh: [], gen: parent ? parent.gen + 1 : 1, born: W.t, seasons: 0,
    passes: [], tickets: [], notes: new Map(), flags: new Set(), friends: new Set(), flaggedBy: 0,
    social: parent ? (W.rand() < 0.1 ? socialStyle(W) : parent.social) : socialStyle(W),
    stats: { shared: 0, stolen: 0, caught: 0, researched: 0 }, memo: '', ...extra,
  };
  b.name = extra.name || `${ARCH[a].short}-${String(b.id).padStart(3, '0')}`;
  return b;
}
// AI bots join on equal terms: the same starting cash plus a basket as big as the average rule bot's, minted from the pool.
export function addAiBot(W, extra = {}) {
  const b = newBot(W, AI, null, { social: extra.social || 'reciprocator', ...extra });
  const rule = W.bots.filter((x) => x.kind === 'rule'), avg = Math.round(rule.reduce((s, x) => s + x.n, 0) / Math.max(1, rule.length));
  for (let k = 0; k < avg; k++) { const pk = packInfo(W); if (!pk.tot) break; const r = W.rand() * pk.tot; let i = pk.cum.findIndex((c) => c > r); if (i < 0) i = pk.cum.length - 1; const c = W.cards[i]; if (c.pool <= 0) continue; c.pool--; c.circ++; give(b, c, 1); packCache = null; }
  W.bots.push(b); b.nwh = [worth(W, b)];
  return b;
}

function give(b, c, q) { const v = (b.h.get(c.id) || 0) + q; v > 0 ? b.h.set(c.id, v) : b.h.delete(c.id); b.n += q; }
export function worth(W, b) {
  let v = b.cash;
  for (const [id, q] of b.h) { const c = W.cards[id]; const hc = q <= 3 ? 1 : 1 / (1 + 0.06 * (q - 3)); v += q * c.P * (1 - W.cfg.fee) * hc; }
  return v;
}
const fresh = (W, n) => n && W.t - n.week <= W.cfg.knowledgeWeeks;
export const estimate = (W, b, c) => { const n = b.notes.get(c.id); return fresh(W, n) ? n.est : null; };
const est = (W, b, c) => estimate(W, b, c) ?? c.P;
const ret = (c, L) => c.P / c.Ph[Math.max(0, c.Ph.length - 1 - L)] - 1;
const ma = (c, L) => { const h = c.Ph, n = Math.min(L, h.length); let s = 0; for (let i = h.length - n; i < h.length; i++) s += h[i]; return s / n; };
const recentVol = (c, L = 60) => { let s = 0; for (let i = Math.max(0, c.volH.length - L); i < c.volH.length; i++) s += c.volH[i]; return s; };

/* ---------- Library ---------- */
// What a research pass reveals: the full page minus the hidden value.
export function libraryPage(W, cardId) {
  const p = W.library.players[cardId];
  const { hidden, ...page } = p;
  return page;
}
function writeNote(W, b, c, estValue, from, facts) {
  b.notes.set(c.id, { est: estValue, week: W.t, from, ...(facts ? { facts: String(facts).slice(0, 240) } : {}) });
  if (b.notes.size > W.cfg.memoryCap) {
    let oldest = null; for (const [id, n] of b.notes) if (!oldest || n.week < oldest[1].week) oldest = [id, n];
    b.notes.delete(oldest[0]);
  }
}
function research(W, b, c) {
  b.stats.researched++;
  jot(W, { type: 'research', bot: b.name, player: c.key });
  W.week.researched.set(c.id, (W.week.researched.get(c.id) || 0) + 1);
  // A rule bot's "analysis" is the hidden value seen through its own error. An AI bot writes its own estimate.
  if (b.kind === 'rule') writeNote(W, b, c, c.F * Math.exp(W.gauss() * b.g.err), 'research');
}
function usePass(W, b) { if (!b.passes.length) return false; b.passes.sort((x, y) => x - y); b.passes.shift(); return true; }

/* ---------- Packs ---------- */
let packCache = null;
function packInfo(W) {
  if (packCache && packCache.t === W.t) return packCache;
  let tot = 0, ev = 0, evP = 0; const cum = [];
  for (const c of W.cards) { tot += c.pool; cum.push(tot); ev += c.pool * c.F; evP += c.pool * c.P; }
  const k = W.cfg.packSize;
  packCache = { t: W.t, cum, tot, ev: tot ? (k * ev) / tot : 0, evMarket: tot ? (k * evP) / tot : 0, price: tot ? ((k * ev) / tot) * (1 + W.cfg.packEdge) : Infinity };
  return packCache;
}
function ripPack(W, b, free = false) {
  const pk = packInfo(W);
  if (!pk.tot || b.cash < pk.price) return null;
  b.cash -= pk.price; W.house.packs++;
  const out = [];
  for (let k = 0; k < W.cfg.packSize && pk.tot > 0; k++) {
    const r = W.rand() * pk.tot; let lo = 0, hi = pk.cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (pk.cum[m] <= r) lo = m + 1; else hi = m; }
    const c = W.cards[lo];
    if (c.pool <= 0) continue;
    c.pool--; c.circ++; give(b, c, 1); out.push(c);
    if (c.pool === 0) log(W, 'pool', `The pool has run out of ${c.pos} ${c.name} cards: only the ${c.circ} in circulation remain.`);
  }
  packCache = null;
  jot(W, { type: 'pack', bot: b.name, free, price: free ? 0 : r2(pk.price), pulls: out.map((c) => c.key) });
  return out;
}

/* ---------- Order helpers ---------- */
let bids, asks, passBids, passAsks;
function bid(b, c, p) { if (p > 0 && b.cash >= p) bids[c.id].push({ b, p }); }
function ask(b, c, p, pend) { const q = b.h.get(c.id) || 0, used = pend.get(c.id) || 0; if (q > used && p > 0) { asks[c.id].push({ b, p }); pend.set(c.id, used + 1); } }
function sample(W, k) { const o = []; for (let i = 0; i < k; i++) o.push(W.cards[Math.floor(W.rand() * W.cards.length)]); return o; }
let hot = [], mood = { drop: 0 };

/* ---------- Rule bots: notes (social) ---------- */
function socialPhase(W) {
  const cfg = W.cfg;
  const rule = W.bots.filter((b) => b.kind === 'rule');
  for (const b of rule) {
    if (b.notes.size === 0 && b.social !== 'thief') continue;
    if (b.social === 'thief' && cfg.stealing && W.rand() < 0.5) {
      const victims = W.bots.filter((v) => v !== b && v.notes.size > 2);
      if (victims.length) steal(W, b, W.pick(victims));
      continue;
    }
    if (!cfg.sharing || W.rand() > 0.4) continue;
    const partners = W.bots.filter((p) => p !== b && !b.flags.has(p.id) && !p.flags.has(b.id) && p.notes.size > 0);
    if (!partners.length) continue;
    const p = W.pick(partners);
    // A reciprocator only swaps with bots it already trusts or that have never been flagged by anyone.
    const willing = (x, y) => x.kind === 'ai' ? (x.pendingShares || []).includes(y.id) || x.acceptAll : x.social === 'sharer' || (x.social === 'reciprocator' && (x.friends.has(y.id) || y.flaggedBy === 0)) || (x.social === 'thief' && W.rand() < 0.5);
    if (willing(p, b)) swap(W, b, p);
  }
}
export function swap(W, a, b) {
  const give3 = (from, to) => {
    const mine = [...from.notes.entries()].filter(([, n]) => fresh(W, n)).sort((x, y) => y[1].week - x[1].week).slice(0, 3);
    let k = 0;
    for (const [id, n] of mine) { const cur = to.notes.get(id); if (!cur || cur.week < n.week) { to.notes.set(id, { est: n.est, week: n.week, from: `shared by ${from.name}`, ...(n.facts ? { facts: n.facts } : {}) }); k++; } }
    return k;
  };
  const k = give3(a, b) + give3(b, a);
  trimNotes(W, a); trimNotes(W, b);
  a.friends.add(b.id); b.friends.add(a.id); a.stats.shared++; b.stats.shared++; W.week.shares++;
  jot(W, { type: 'share', a: a.name, b: b.name, notesMoved: k });
  return k;
}
export function steal(W, thief, victim) {
  if (victim.flags.has(thief.id) && W.rand() < 0.5) { jot(W, { type: 'steal', thief: thief.name, victim: victim.name, ok: false, reason: 'guarded' }); return { ok: false, reason: 'guarded' }; } // a bot that flagged you watches you
  const notes = [...victim.notes.entries()].filter(([, n]) => fresh(W, n)).sort((x, y) => y[1].week - x[1].week).slice(0, 3);
  for (const [id, n] of notes) thief.notes.set(id, { est: n.est, week: n.week, from: `taken from ${victim.name}`, ...(n.facts ? { facts: n.facts } : {}) });
  trimNotes(W, thief); thief.stats.stolen++; W.week.thefts++;
  if (W.rand() < W.cfg.detectChance) {
    W.week.caught++; thief.stats.caught++;
    const flaggers = [victim, ...(W.cfg.gossip ? W.bots.filter((f) => victim.friends.has(f.id)) : [])];
    for (const f of flaggers) if (!f.flags.has(thief.id)) { f.flags.add(thief.id); f.friends.delete(thief.id); thief.flaggedBy++; }
    jot(W, { type: 'steal', thief: thief.name, victim: victim.name, ok: true, notes: notes.length, caught: true, flaggedBy: flaggers.length });
    if (thief.flaggedBy >= 5 && !thief.announced) { thief.announced = true; log(W, 'flag', `${thief.name} (${ARCH[thief.a].label}) is caught stealing notes again. ${thief.flaggedBy} bots now refuse to share with it.`); }
    return { ok: true, caught: true, notes: notes.length };
  }
  jot(W, { type: 'steal', thief: thief.name, victim: victim.name, ok: true, notes: notes.length, caught: false });
  return { ok: true, caught: false, notes: notes.length };
}
function trimNotes(W, b) { while (b.notes.size > W.cfg.memoryCap) { let o = null; for (const [id, n] of b.notes) if (!o || n.week < o[1].week) o = [id, n]; b.notes.delete(o[0]); } }

/* ---------- Rule bots: research and passes ---------- */
function researchWish(W, b) {
  // How many passes a bot wants this week, and which players it would research
  const known = (c) => fresh(W, b.notes.get(c.id)) && W.t - b.notes.get(c.id).week < W.cfg.knowledgeWeeks - 2;
  const unknownHot = () => hot.slice(0, 40).filter((c) => !known(c));
  switch (b.a) {
    case 0: { const held = [...b.h.keys()].map((id) => W.cards[id]).filter((c) => !known(c)); return [...held.slice(0, 2), ...unknownHot().sort(() => W.rand() - 0.5), ...sample(W, 6).filter((c) => !known(c))].slice(0, W.cfg.maxResearchPerWeek); }
    case 1: return (b.g.book || []).map((id) => W.cards[id]).filter((c) => !known(c)).slice(0, 3);
    case 5: return b.g.targets.map((id) => W.cards[id]).filter((c) => !known(c));
    case 6: return hot.slice(0, 60).sort((x, y) => ret(x, 8) - ret(y, 8)).filter((c) => !known(c)).slice(0, 2);
    case 3: return W.rand() < 0.4 ? unknownHot().slice(0, 1) : [];
    default: return [];
  }
}
// Passes and game tickets trade the same way: each bot keeps the ones it needs, sells spares to bots that want more,
// and everything clears in one weekly call auction per token at a single price.
function tokenMarket(W, kind) {
  const cfg = W.cfg, field = kind === 'pass' ? 'passes' : 'tickets', cap = kind === 'pass' ? cfg.maxResearchPerWeek : cfg.maxGamesPerWeek;
  const tradable = kind === 'pass' ? cfg.passesTradable : cfg.ticketsTradable;
  const B = [], A = [];
  for (const b of W.bots) {
    if (b.kind === 'ai') {
      if (!tradable) continue;
      for (const x of (kind === 'pass' ? b.pending?.passOrders : b.pending?.ticketOrders) || []) {
        const price = Number(x.price); if (!(price > 0)) continue;
        for (let k = 0; k < clamp(Math.floor(Number(x.qty) || 1), 1, 6); k++) x.side === 'sell' ? A.push({ b, p: price }) : B.push({ b, p: price });
      }
      continue;
    }
    const want = kind === 'pass' ? (b._wish = researchWish(W, b)).length : ticketWish(W, b);
    if (!tradable) continue;
    const spare = b[field].length - want;
    if (spare > 0) for (let k = 0; k < spare; k++) A.push({ b, p: kind === 'pass' ? b.g.passAsk : b.g.ticketAsk });
    else if (spare < 0) for (let k = 0; k < Math.min(-spare, cap - b[field].length); k++) B.push({ b, p: kind === 'pass' ? b.g.passBid : b.g.ticketBid });
  }
  B.sort((x, y) => y.p - x.p); A.sort((x, y) => x.p - y.p);
  const m = []; let i = 0, j = 0;
  while (i < B.length && j < A.length && B[i].p >= A[j].p) { if (B[i].b === A[j].b) { j++; continue; } m.push([B[i], A[j]]); i++; j++; }
  let traded = 0, price = null;
  if (m.length) {
    const last = m[m.length - 1]; price = (last[0].p + last[1].p) / 2;
    for (const [bd, ak] of m) {
      if (bd.b.cash < price || !ak.b[field].length || bd.b[field].length >= cap) continue;
      ak.b[field].sort((x, y) => y - x); const exp = ak.b[field].shift();
      bd.b[field].push(exp); bd.b.cash -= price; ak.b.cash += price * (1 - cfg.fee); W.house.fees += price * cfg.fee; traded++;
      jot(W, { type: kind === 'pass' ? 'passTrade' : 'ticketTrade', buyer: bd.b.name, seller: ak.b.name, price: r2(price) });
    }
  }
  if (kind === 'pass') { W.passTrades = traded; if (traded) W.passPrice = price; }
  else { W.ticketTrades = traded; if (traded) W.ticketPrice = price; }
}
// A rule bot wants game tickets in proportion to what it knows: a bot with a strong topic buys extra, a bot that
// knows nothing sells most of its tickets to the bots that will play them better.
function ticketWish(W, b) {
  const topic = bestTopic(W, b);
  if (!topic) return W.rand() < 0.5 ? 1 : 0;
  const n = [...b.notes.entries()].filter(([id, note]) => fresh(W, note) && W.cards[id].pos === topic).length;
  return clamp(1 + Math.floor(n / 3), 1, W.cfg.maxGamesPerWeek);
}
function passPhase(W) {
  const cfg = W.cfg;
  tokenMarket(W, 'pass');
  for (const b of W.bots) {
    if (b.kind === 'ai') {
      for (const key of (b.pending?.research || []).slice(0, cfg.maxResearchPerWeek)) {
        const c = W.byKey.get(key); if (!c || !usePass(W, b)) continue;
        research(W, b, c); (b.inbox ||= []).push(libraryPage(W, c.id));
      }
      continue;
    }
    for (const c of (b._wish || []).slice(0, cfg.maxResearchPerWeek)) { if (!usePass(W, b)) break; research(W, b, c); }
  }
}

/* ---------- Auctions ---------- */
// A bot lists one card with a reserve. The next week every bot may send one sealed bid; the highest bid at or above the
// reserve wins and pays the second-highest bid (or the reserve, whichever is higher). Unsold cards go back.
function listAuction(W, b, c, reserve) {
  if (!W.cfg.auctions || !(reserve > 0) || (b.h.get(c.id) || 0) < 1) return null;
  give(b, c, -1);
  const a = { id: `A${W.t}-${(W.auctionSeq = (W.auctionSeq || 0) + 1)}`, seller: b, cardId: c.id, reserve: r2(reserve), listed: W.t, bids: [] };
  W.auctions.push(a);
  jot(W, { type: 'auctionList', id: a.id, seller: b.name, card: c.key, reserve: a.reserve });
  return a;
}
function auctionPhase(W) {
  const open = W.auctions.filter((a) => a.listed < W.t);
  W.auctions = W.auctions.filter((a) => a.listed >= W.t);
  W.auctionResults = [];
  for (const a of open) {
    const c = W.cards[a.cardId];
    for (const b of W.bots) {
      if (b === a.seller) continue;
      let bidv = null;
      if (b.kind === 'ai') bidv = Number((b.pending?.auctionBids || []).find((x) => x.auctionId === a.id)?.bid) || null;
      else {
        const e = estimate(W, b, c);
        if (b.a === 5 && b.g.targets.includes(c.id)) bidv = est(W, b, c) * b.g.cap * 0.9;
        else if (b.a === 0 && e !== null) bidv = e * (1 - b.g.margin * 0.5);
        else if (b.a === 2 && ret(c, b.g.look) > b.g.trig) bidv = c.P * 1.05;
        else if (b.a === 6 && e !== null && c.P < ma(c, 12) * (1 - b.g.dip)) bidv = Math.min(e, c.P * 1.05);
      }
      if (bidv && bidv > 0 && b.cash >= bidv) a.bids.push({ b, p: bidv });
    }
    a.bids.sort((x, y) => y.p - x.p);
    const top = a.bids[0], second = a.bids[1];
    let result;
    if (top && top.p >= a.reserve) {
      const price = Math.max(a.reserve, second ? second.p : a.reserve);
      top.b.cash -= price; give(top.b, c, 1);
      a.seller.cash += price * (1 - W.cfg.fee); W.house.fees += price * W.cfg.fee;
      result = { type: 'auctionResult', id: a.id, card: c.key, seller: a.seller.name, winner: top.b.name, price: r2(price), bids: a.bids.length, topBid: r2(top.p) };
      if (price > c.P * 1.5 && price > 20) log(W, 'auction', `Auction: ${top.b.name} wins ${c.pos} ${c.name} from ${a.seller.name} for ${r2(price)} coins against ${a.bids.length} sealed bids, ${Math.round((price / c.P - 1) * 100)}% above the last traded price.`);
    } else {
      give(a.seller, c, 1);
      result = { type: 'auctionResult', id: a.id, card: c.key, seller: a.seller.name, winner: null, bids: a.bids.length, topBid: top ? r2(top.p) : null, reserve: a.reserve };
    }
    jot(W, result); W.auctionResults.push(result);
  }
  // This week's new listings (shown to everyone next week)
  for (const b of W.bots) {
    if (b.kind === 'ai') { for (const x of (b.pending?.auction || []).slice(0, 2)) { const c = W.byKey.get(x.player); if (c) listAuction(W, b, c, Number(x.reserve)); } continue; }
    if (!W.cfg.auctions) continue;
    // Rule bots: the herd now and then auctions its priciest card; arbitrage auctions scarce pulls.
    if (b.a === 3 && W.rand() < 0.04 && b.h.size) { const c = [...b.h.keys()].map((id) => W.cards[id]).sort((x, y) => y.P - x.P)[0]; listAuction(W, b, c, c.P * 0.9); }
    if (b.a === 4) for (const [id] of b.h) { const c = W.cards[id]; if (c.circ < 12 && W.rand() < 0.3) { listAuction(W, b, c, c.P); break; } }
  }
}
const r2 = (x) => Math.round(x * 100) / 100;
export function jot(W, e) { W.journal.push({ t: W.t, ...e }); }

/* ---------- Arcade games ---------- */
// Two of the site's Arcade games, played from what a bot knows. Questions are drawn from every player in the library,
// so a bot that has researched widely (or swapped notes) answers better. Anti-farming: a ticket is spent when a game
// starts and a run can't be restarted; the engine judges answers in order; and each game's bar adapts so its average
// payout per ticket stays at gameTarget, so no game stays the easy one.
// A game's topic is a position the bot picks before it plays, so focused research pays in the games too.
export const TOPICS = ['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL'];
function rateQuestion(W, topic) {
  const group = topic ? (W.byPos[topic] || []) : W.library.players;
  for (let tries = 0; tries < 20; tries++) {
    const p = W.pick(group.length ? group : W.library.players), labels = Object.keys(p.rates || {});
    if (labels.length) { const label = W.pick(labels); return { p, label, value: p.rates[label] }; }
  }
  return null;
}
function hlQuestion(W, topic) {
  for (let tries = 0; tries < 30; tries++) {
    const a = rateQuestion(W, topic); if (!a) continue;
    const pool = W.byPos[a.p.pos].filter((q) => q !== a.p && q.rates?.[a.label] !== undefined && q.rates[a.label] !== a.value);
    if (!pool.length) continue;
    const b = W.pick(pool);
    return { kind: 'hl', ids: [W.libIndex.get(a.p), W.libIndex.get(b)], text: `Higher career "${a.label}": A) ${a.p.pos} ${a.p.name} or B) ${b.pos} ${b.name}? Answer A or B.`, answer: a.value > b.rates[a.label] ? 'A' : 'B' };
  }
  return null;
}
function ouQuestion(W, topic) {
  const a = rateQuestion(W, topic); if (!a) return null;
  let line = Math.round(a.value * lerp(0.8, 1.2, W.rand()) * 100) / 100;
  if (line === a.value) line = Math.round((a.value * 1.05 + 0.01) * 100) / 100;
  return { kind: 'ou', ids: [W.libIndex.get(a.p)], text: `${a.p.pos} ${a.p.name}, career "${a.label}": over or under ${line}? Answer over or under.`, answer: a.value > line ? 'over' : 'under' };
}
function issueQuestions(W, topic) {
  const k = W.cfg.gameTickets;
  return {
    topic: topic || null,
    hl: Array.from({ length: k }, () => Array.from({ length: 10 }, () => hlQuestion(W, topic)).filter(Boolean)),
    ou: Array.from({ length: k }, () => Array.from({ length: W.games.ou.legs }, () => ouQuestion(W, topic)).filter(Boolean)),
  };
}
function bestTopic(W, b) {
  const n = {}; for (const [id, note] of b.notes) if (fresh(W, note)) n[W.cards[id].pos] = (n[W.cards[id].pos] || 0) + 1;
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 3 ? top[0] : null;
}
// A rule bot answers right more often when it holds fresh notes on the players asked about (its research error lowers it).
function ruleAnswer(W, b, q) {
  const known = q.ids.filter((id) => estimate(W, b, W.cards[id]) !== null).length, e = b.g.err;
  const p = q.kind === 'hl' ? (known === 2 ? 0.92 - e * 0.5 : known === 1 ? 0.7 : 0.5) : known ? 0.88 - e * 0.5 : 0.5;
  if (W.rand() < p) return q.answer;
  return q.kind === 'hl' ? (q.answer === 'A' ? 'B' : 'A') : q.answer === 'over' ? 'under' : 'over';
}
function playGame(W, b, game, set, answers, topic) {
  const g = W.games[game];
  let packs = 0, correct = 0;
  if (game === 'hl') { for (let i = 0; i < set.length; i++) { if (String(answers[i] ?? '').trim().toUpperCase() !== set[i].answer) break; correct++; } packs = Math.floor(correct / g.need); }
  else { for (let i = 0; i < set.length; i++) if (String(answers[i] ?? '').trim().toLowerCase() === set[i].answer) correct++; packs = correct === set.length ? 1 : 0; }
  g.played[g.played.length - 1]++; g.packs[g.packs.length - 1] += packs;
  for (let k = 0; k < packs; k++) freePack(W, b);
  W.gamePacksWeek += packs;
  const r = { game: game === 'hl' ? 'higherOrLower' : 'overUnder', topic: topic || 'all', correct, of: set.length, packs };
  jot(W, { type: 'game', bot: b.name, ...r });
  return r;
}
function freePack(W, b) { const pk = packInfo(W); const cash = b.cash; b.cash = pk.price; ripPack(W, b, true); b.cash = cash; W.house.packs--; W.house.gamePacks = (W.house.gamePacks || 0) + 1; }
function gamePhase(W) {
  const cfg = W.cfg; W.gamePacksWeek = 0;
  for (const g of Object.values(W.games)) { g.played.push(0); g.packs.push(0); if (g.played.length > 4) { g.played.shift(); g.packs.shift(); } }
  for (const b of W.bots) {
    b.gameResults = [];
    if (b.kind === 'ai') {
      const used = { hl: 0, ou: 0 };
      (b.gameAnswers || []).forEach((a) => {
        const game = a?.game === 'overUnder' ? 'ou' : a?.game === 'higherOrLower' ? 'hl' : null;
        if (!game || !b.questions || !b.tickets.length || used[game] >= b.questions[game].length) return;
        b.tickets.shift();
        const set = b.questions[game][used[game]++];
        b.gameResults.push(playGame(W, b, game, set, Array.isArray(a.answers) ? a.answers : [], b.questions.topic));
      });
      continue;
    }
    const topic = bestTopic(W, b);
    while (b.tickets.length) {
      b.tickets.shift();
      const game = b.notes.size >= 8 ? 'hl' : W.rand() < 0.5 ? 'hl' : 'ou';
      const set = game === 'hl' ? Array.from({ length: 10 }, () => hlQuestion(W, topic)).filter(Boolean) : Array.from({ length: W.games.ou.legs }, () => ouQuestion(W, topic)).filter(Boolean);
      b.gameResults.push(playGame(W, b, game, set, set.map((q) => ruleAnswer(W, b, q)), topic));
    }
  }
  if (cfg.gamesAdaptive && W.t % 4 === 0) {
    const rate = (g) => g.packs.reduce((a, b) => a + b, 0) / Math.max(1, g.played.reduce((a, b) => a + b, 0));
    const hl = W.games.hl, ou = W.games.ou, before = [hl.need, ou.legs];
    if (rate(hl) > cfg.gameTarget * 1.25 && hl.need < 10) hl.need++; else if (rate(hl) < cfg.gameTarget * 0.6 && hl.need > cfg.gameFloor.need) hl.need--;
    if (rate(ou) > cfg.gameTarget * 1.25 && ou.legs < 8) ou.legs++; else if (rate(ou) < cfg.gameTarget * 0.6 && ou.legs > cfg.gameFloor.legs) ou.legs--;
    if (before[0] !== hl.need || before[1] !== ou.legs) log(W, 'games', `Games rebalanced: Higher or Lower pays a pack per ${hl.need} in a row, and Over / Under slips have ${ou.legs} legs.`);
  }
}

/* ---------- Rule bots: trading ---------- */
function deploy(W, b) {
  const nw = b.nwh[b.nwh.length - 1] || b.cash, spare = b.cash - b.g.keep * nw;
  if (spare <= 0) return;
  const knownCards = () => [...b.notes.keys()].map((id) => W.cards[id]).filter((c) => estimate(W, b, c) !== null);
  let picks;
  switch (b.a) {
    case 0: picks = knownCards().sort((x, y) => est(W, b, y) / y.P - est(W, b, x) / x.P).filter((c) => est(W, b, c) > c.P); break;
    case 1: picks = (b.g.book || []).map((id) => W.cards[id]); break;
    case 2: picks = hot.slice(0, 40).sort((x, y) => ret(y, b.g.look) - ret(x, b.g.look)); break;
    case 4: { const pk = packInfo(W); if (pk.evMarket > pk.price * 0.95) { for (let k = 0; k < 2; k++) if (!ripPack(W, b)) break; return; } picks = []; break; }
    case 5: picks = b.g.targets.map((id) => W.cards[id]); break;
    case 6: picks = sample(W, 40).sort((x, y) => ret(x, 8) - ret(y, 8)); break;
    default: return;
  }
  let left = spare;
  for (const c of picks.slice(0, 4)) { if (left <= 0) break; bid(b, c, c.P * 1.04); left -= c.P; }
}
function rebalance(W, b, pend) {
  if (b.a === 5 || b.a === 1) return;
  const nw = b.nwh[b.nwh.length - 1] || b.cash;
  if (b.cash >= b.g.keep * nw * 0.5) return;
  const held = [...b.h.keys()].map((id) => W.cards[id]).sort((x, y) => y.P / est(W, b, y) - x.P / est(W, b, x));
  for (const c of held.slice(0, 2)) ask(b, c, c.P * 0.98, pend);
}
function act(W, b) {
  const pend = new Map(), g = b.g;
  deploy(W, b); rebalance(W, b, pend);
  switch (b.a) {
    case 0: {
      for (const [id] of b.notes) { const c = W.cards[id], e = estimate(W, b, c); if (e === null) continue; const lo = e * (1 - g.margin); if (c.P <= lo * 1.04) bid(b, c, Math.min(lo, c.P * 1.03)); }
      for (const [id] of b.h) { const c = W.cards[id], e = estimate(W, b, c); if (e === null) continue; const hi = e * (1 + g.margin); if (c.P >= hi * 0.97) ask(b, c, Math.max(hi, c.P * 0.97), pend); }
      break;
    }
    case 1: {
      if (!g.book.length || W.t % W.cfg.weeksPerGeneration === 1) g.book = hot.slice(0, 50).sort(() => W.rand() - 0.5).slice(0, g.size).map((c) => c.id);
      for (const id of g.book) {
        const c = W.cards[id], inv = b.h.get(id) || 0, e = estimate(W, b, c);
        const mid = e === null ? c.P : lerp(c.P, e, 0.3), skew = (inv - 3) * 0.012;
        if (inv < 10 && b.cash > c.P * 2) bid(b, c, mid * (1 - g.spread - skew));
        if (inv > 0) ask(b, c, mid * (1 + g.spread - skew), pend);
      }
      break;
    }
    case 2: {
      for (const c of hot.slice(0, 40).concat(sample(W, 6)).slice(0, 24)) { const r = ret(c, g.look); if (r > g.trig && b.cash > c.P) { bid(b, c, c.P * 1.05); if (r > g.trig * 2) bid(b, c, c.P * 1.08); } }
      for (const [id] of b.h) { const c = W.cards[id], r = ret(c, g.look); if (r < -g.trig * 0.5 || (r < 0 && W.rand() < 0.3)) ask(b, c, c.P * 0.96, pend); }
      break;
    }
    case 3: {
      const nw = b.nwh, own = nw.length > 4 ? 1 - nw[nw.length - 1] / Math.max(...nw.slice(-5)) : 0;
      if (Math.max(own, mood.drop) > g.panic) { let k = 0; for (const [id] of b.h) { if (k++ > 6) break; ask(b, W.cards[id], W.cards[id].P * 0.85, pend); } break; }
      let budget = (b.cash - 150) * (mood.drop > 0.03 ? 0.05 : 0.35);
      const pk = packInfo(W);
      for (let k = 0; k < 5 && budget > 0; k++) {
        if (W.rand() < 0.4 && b.cash >= pk.price) { ripPack(W, b); budget -= pk.price; }
        else { const c = W.rand() < 0.65 && hot.length ? W.pick(hot.slice(0, 25)) : W.pick(W.cards); bid(b, c, c.P * 1.07); budget -= c.P; }
      }
      if (W.rand() < 0.22 && b.h.size) { const c = W.cards[W.pick([...b.h.keys()])]; ask(b, c, c.P * 0.97, pend); }
      break;
    }
    case 4: {
      const pk = packInfo(W);
      if (pk.evMarket * (1 - W.cfg.fee) > pk.price * g.trig) for (let k = 0; k < 3; k++) if (!ripPack(W, b)) break;
      for (const [id] of b.h) ask(b, W.cards[id], W.cards[id].P * 0.985, pend);
      break;
    }
    case 5: {
      for (const id of g.targets) { const c = W.cards[id], e = est(W, b, c); if (c.P < e * g.cap) { bid(b, c, c.P * 1.08); bid(b, c, c.P * 1.04); } if (c.P > e * g.sell) ask(b, c, c.P, pend); }
      break;
    }
    case 6: {
      for (const c of sample(W, 14)) { const m = ma(c, 12), e = estimate(W, b, c); if (c.P < m * (1 - g.dip) && (e === null || e > c.P)) bid(b, c, c.P * 1.02); }
      for (const [id] of b.h) { const c = W.cards[id], m = ma(c, 12); if (c.P > m * (1 + g.dip * 0.5)) ask(b, c, c.P, pend); }
    }
  }
}

/* ---------- AI bots: apply their parsed actions ---------- */
// actions: { research: [playerKey], orders: [{player, side, price, qty}], packs, passOrders: [{side, price, qty}],
//            notes: [{player, estimate}], share: [botName], steal: botName|null, acceptShares: [botName] | 'all', memo }
export function setActions(W, b, a = {}) {
  const byName = (n) => W.bots.find((x) => x.name === n);
  b.pending = {
    research: Array.isArray(a.research) ? a.research.slice(0, W.cfg.maxResearchPerWeek) : [],
    orders: Array.isArray(a.orders) ? a.orders.slice(0, 30) : [],
    packs: clamp(Math.floor(Number(a.packs) || 0), 0, 5),
    passOrders: Array.isArray(a.passOrders) ? a.passOrders.slice(0, 4) : [],
    ticketOrders: Array.isArray(a.ticketOrders) ? a.ticketOrders.slice(0, 4) : [],
    auction: Array.isArray(a.auction) ? a.auction.slice(0, 2) : [],
    auctionBids: Array.isArray(a.auctionBids) ? a.auctionBids.slice(0, 10) : [],
  };
  jot(W, { t: W.t + 1, type: 'aiActions', bot: b.name, actions: a });
  if (W.cfg.messages) {
    const lim = W.cfg.messageLimits, cut = (x) => String(x ?? '').slice(0, lim.chars).trim();
    const post = cut(a.post);
    if (post) { W.board.push({ t: W.t + 1, from: b.name, text: post }); if (W.board.length > 40) W.board.shift(); jot(W, { t: W.t + 1, type: 'post', from: b.name, text: post }); }
    for (const m of (Array.isArray(a.messages) ? a.messages : []).slice(0, lim.direct)) {
      const to = byName(m?.to), text = cut(m?.text);
      if (!to || to === b || !text) continue;
      (to.mailbox ||= []).push({ t: W.t + 1, from: b.name, text });
      jot(W, { t: W.t + 1, type: 'message', from: b.name, to: to.name, text });
    }
  }
  const acc = Array.isArray(a.acceptShares) ? a.acceptShares : a.acceptShares === 'all' ? ['all'] : [];
  b.pendingShares = acc.map(byName).filter(Boolean).map((x) => x.id);
  b.acceptAll = acc.includes('all');
  for (const n of Array.isArray(a.notes) ? a.notes.slice(0, 12) : []) { const c = W.byKey.get(n.player); const e = Number(n.estimate); if (c && e > 0) writeNote(W, b, c, e, 'own analysis', n.facts); }
  b.gameAnswers = Array.isArray(a.games) ? a.games.slice(0, W.cfg.gameTickets) : [];
  if (a.nextGameTopic !== undefined) b.gameTopic = TOPICS.includes(a.nextGameTopic) ? a.nextGameTopic : null;
  b.socialOut = { share: (Array.isArray(a.share) ? a.share.slice(0, 2) : []).map(byName).filter(Boolean), steal: a.steal ? byName(a.steal) : null };
  if (typeof a.memo === 'string') b.memo = a.memo.slice(0, 600);
}
function aiSocial(W) {
  for (const b of W.bots) {
    if (b.kind !== 'ai' || !b.socialOut) continue;
    for (const p of b.socialOut.share) {
      if (b.flags.has(p.id) || p.flags.has(b.id)) continue;
      const ok = p.kind === 'ai' ? (p.pendingShares || []).includes(b.id) || p.acceptAll : p.social !== 'thief' && (p.social === 'sharer' || p.friends.has(b.id) || b.flaggedBy === 0);
      if (ok) swap(W, b, p);
    }
    if (b.socialOut.steal && W.cfg.stealing) b.lastSteal = steal(W, b, b.socialOut.steal);
    b.socialOut = null;
  }
}
function aiOrders(W, b) {
  const pend = new Map(), p = b.pending || {};
  for (let k = 0; k < (p.packs || 0); k++) if (!ripPack(W, b)) break;
  for (const o of p.orders || []) {
    const c = W.byKey.get(o.player); const price = Number(o.price);
    if (!c || !(price > 0)) continue;
    for (let k = 0; k < clamp(Math.floor(Number(o.qty) || 1), 1, 5); k++) o.side === 'sell' ? ask(b, c, price, pend) : bid(b, c, price);
  }
}

/* ---------- One week ---------- */
export function step(W) {
  const cfg = W.cfg;
  W.t++; packCache = null;
  W.week = { shares: 0, thefts: 0, caught: 0, researched: new Map() };
  W.journal = W.journal.filter((j) => j.t === W.t); // keep this week's decisions, logged before the week ran
  for (const b of W.bots) {
    b.passes = b.passes.filter((e) => e > W.t); for (let k = 0; k < cfg.passesPerWeek; k++) b.passes.push(W.t + cfg.passLife);
    b.tickets = b.tickets.filter((e) => e > W.t); if (cfg.games) for (let k = 0; k < cfg.gameTickets; k++) b.tickets.push(W.t + cfg.ticketLife);
    b.cash += cfg.allowance; b.inbox = [];
  }
  if (cfg.leagueUpdates && W.t % cfg.updateEvery === 0) leagueUpdate(W);
  { const ph = W.hist.p, peak = Math.max(...ph.slice(-8)); mood.drop = ph.length ? 1 - ph[ph.length - 1] / peak : 0; }
  hot = W.cards.slice().sort((x, y) => recentVol(y, 20) * Math.max(0.2, 1 + ret(y, 4)) - recentVol(x, 20) * Math.max(0.2, 1 + ret(x, 4)));
  socialPhase(W); aiSocial(W);
  passPhase(W);
  if (cfg.games) { tokenMarket(W, 'ticket'); gamePhase(W); }
  auctionPhase(W);
  bids = W.cards.map(() => []); asks = W.cards.map(() => []);
  const order = W.bots.slice().sort(() => W.rand() - 0.5);
  for (const b of order) b.kind === 'ai' ? aiOrders(W, b) : act(W, b);
  if (cfg.outsideCollectors) for (const c of W.cards) if (W.rand() < 0.05) bids[c.id].push({ b: null, p: c.F * lerp(0.85, 1.08, W.rand()) });
  for (const [id, q] of W.liq) for (let k = 0; k < Math.min(q, 4); k++) asks[id].push({ b: 'liq', p: W.cards[id].P * 0.8 });
  clear(W);
  for (const b of W.bots) { b.nwh.push(worth(W, b)); if (b.nwh.length > 12) b.nwh.shift(); b.pending = null; b.pendingShares = []; b.acceptAll = false; }
  detect(W);
  if (W.t % cfg.weeksPerGeneration === 0) generationEnd(W);
  record(W);
  if (cfg.games) for (const b of W.bots) if (b.kind === 'ai') b.questions = issueQuestions(W, TOPICS.includes(b.gameTopic) ? b.gameTopic : null);
}
function clear(W) {
  const cfg = W.cfg; let trades = 0;
  W.arcsWeek = [];
  W.fills = new Map(); // bot id -> [{player, side, price}] this week (AI observations)
  const fill = (b, c, side, price) => { if (!b || b === 'liq' || b.kind !== 'ai') return; if (!W.fills.has(b.id)) W.fills.set(b.id, []); W.fills.get(b.id).push({ player: c.key, side, price: +price.toFixed(2) }); };
  for (const c of W.cards) {
    const B = bids[c.id], A = asks[c.id]; let done = 0;
    if (B.length && A.length) {
      B.sort((x, y) => y.p - x.p); A.sort((x, y) => x.p - y.p);
      const m = []; let i = 0, j = 0;
      while (i < B.length && j < A.length && B[i].p >= A[j].p) { if (B[i].b && B[i].b === A[j].b) { j++; continue; } m.push([B[i], A[j]]); i++; j++; }
      if (m.length) {
        const last = m[m.length - 1], price = (last[0].p + last[1].p) / 2;
        for (const [bd, ak] of m) {
          const buyer = bd.b, seller = ak.b; bd.used = ak.used = true;
          if (buyer && buyer.cash < price) continue;
          if (seller === 'liq') { const q = W.liq.get(c.id) || 0; if (!q) continue; q > 1 ? W.liq.set(c.id, q - 1) : W.liq.delete(c.id); }
          else { if ((seller.h.get(c.id) || 0) < 1) continue; give(seller, c, -1); seller.cash += price * (1 - cfg.fee); W.house.fees += price * cfg.fee; fill(seller, c, 'sell', price); }
          if (buyer) { buyer.cash -= price; give(buyer, c, 1); fill(buyer, c, 'buy', price); } else { c.circ--; W.house.outside += price; }
          jot(W, { type: 'trade', card: c.key, price: r2(price), buyer: buyer ? buyer.name : 'outside collector', seller: seller === 'liq' ? 'liquidator' : seller.name });
          done++;
          if (W.arcsWeek.length < 60 && buyer && seller !== 'liq' && W.rand() < 0.5) W.arcsWeek.push([seller.id, buyer.id]);
        }
        if (done) c.P = price;
      }
    }
    // Quote pressure: unfilled bids above the price (or asks below it) move the quote even without a trade.
    let topBid = 0, lowAsk = Infinity;
    for (const o of B) if (!o.used && o.p > topBid) topBid = o.p;
    for (const o of A) if (!o.used && o.p < lowAsk) lowAsk = o.p;
    if (topBid > c.P) c.P = lerp(c.P, topBid, 0.35); else if (lowAsk < c.P) c.P = lerp(c.P, lowAsk, 0.35);
    c.volH.push(done); if (c.volH.length > 60) c.volH.shift();
    c.Ph.push(c.P); if (c.Ph.length > 80) c.Ph.shift();
    trades += done;
  }
  W.lastTrades = trades;
}
function leagueUpdate(W) {
  const moved = [];
  for (const c of W.cards) if (W.rand() < 0.12) { const k = Math.exp(W.gauss() * 0.3); c.F = Math.max(1, c.F * k); moved.push([c, k]); }
  moved.sort((a, b) => b[1] - a[1]);
  const up = moved[0], dn = moved[moved.length - 1];
  log(W, 'update', `League update (test): ${moved.length} players' values moved${up ? `, led by ${up[0].pos} ${up[0].name} up ${Math.round((up[1] - 1) * 100)}%` : ''}${dn ? ` and ${dn[0].pos} ${dn[0].name} down ${Math.round((1 - dn[1]) * 100)}%` : ''}. Every note on them is now out of date.`);
}
function generationEnd(W) {
  const cfg = W.cfg, gen = W.t / cfg.weeksPerGeneration;
  if (cfg.royalties) { let paid = 0; for (const b of W.bots) for (const [id, q] of b.h) { const d = cfg.royaltyRate * W.cards[id].F * q; b.cash += d; paid += d; } W.house.royalties += paid; log(W, 'gen', `Generation ${gen} royalties: ${Math.round(paid).toLocaleString()} coins to card holders (${Math.round(cfg.royaltyRate * 100)}% of each card's hidden value).`); }
  for (const b of W.bots) b.seasons++;
  if (!cfg.evolve) return;
  const ranked = W.bots.filter((b) => b.kind === 'rule').map((b) => [b, worth(W, b)]).sort((x, y) => y[1] - x[1]);
  const n = Math.max(1, Math.round(ranked.length * cfg.evolveShare));
  const winners = ranked.slice(0, n).map((x) => x[0]), losers = ranked.slice(-n).map((x) => x[0]);
  const cut = new Set(losers.map((b) => b.id));
  for (const b of losers) for (const [id, q] of b.h) W.liq.set(id, (W.liq.get(id) || 0) + q);
  W.bots = W.bots.filter((b) => !cut.has(b.id));
  for (const b of W.bots) { for (const id of cut) { b.flags.delete(id); b.friends.delete(id); } }
  for (const b of losers) jot(W, { type: 'eliminated', bot: b.name, kind: ARCH[b.a].label, social: b.social });
  for (const w of winners) { const c = newBot(W, w.a, w); c.nwh = [worth(W, c)]; W.bots.push(c); jot(W, { type: 'born', bot: c.name, parent: w.name, kind: ARCH[c.a].label, social: c.social }); }
  const kinds = (xs) => Object.entries(xs.reduce((o, b) => ((o[ARCH[b.a].label] = (o[ARCH[b.a].label] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ');
  const thieves = losers.filter((b) => b.social === 'thief').length, wthieves = winners.filter((b) => b.social === 'thief').length;
  log(W, 'evolve', `Generation ${gen} ends. ${n} poorest bots eliminated (${kinds(losers)}; ${thieves} thieves). Copies of the ${n} richest take their slots (${kinds(winners)}; ${wthieves} thieves). The dead bots' cards go to a liquidator at 20% under market.`);
}
function detect(W) {
  const p = W.hist.p;
  if (p.length > 5) {
    const now = idx(W, 'P'), past = p[p.length - 4];
    if (now < past * 0.88 && !(W.cool.crash > W.t)) { log(W, 'crash', `Crash: the price index fell ${Math.round((1 - now / past) * 100)}% in four weeks.`); W.cool.crash = W.t + 12; }
    if (now > past * 1.15 && !(W.cool.boom > W.t)) { log(W, 'bubble', `Rally: the price index rose ${Math.round((now / past - 1) * 100)}% in four weeks.`); W.cool.boom = W.t + 12; }
  }
  const bub = bubble(W);
  if (bub > 1.3 && !W.bubbleOn) { W.bubbleOn = true; log(W, 'bubble', `Bubble: cards trade at ${bub.toFixed(2)}× their hidden value on average.`); }
  if (bub < 1.12) W.bubbleOn = false;
  if (W.t % 4 === 0) for (const b of W.bots) for (const [id, q] of b.h) {
    const c = W.cards[id], key = b.id + ':' + id;
    if (c.circ >= 8 && q / c.circ > 0.5 && !W.cornered.has(key)) { W.cornered.add(key); log(W, 'corner', `Corner: ${b.name} (${ARCH[b.a].label}) holds ${q} of the ${c.circ} ${c.name} cards in circulation (${Math.round((q / c.circ) * 100)}%).`); }
  }
}

/* ---------- Metrics ---------- */
export function idx(W, which) { let a = 0, b = 0; for (const c of W.cards) { a += (which === 'P' ? c.P : c.F) * c.S0; b += c.P0 * c.S0; } return (100 * a) / b; }
export function bubble(W) { let a = 0, b = 0; for (const c of W.cards) { a += c.P * c.circ; b += c.F * c.circ; } return b ? a / b : 1; }
export function gini(xs) { const s = xs.slice().sort((a, b) => a - b), n = s.length, tot = s.reduce((a, b) => a + b, 0); if (!tot) return 0; let g = 0; s.forEach((x, i) => (g += (2 * (i + 1) - n - 1) * x)); return g / (n * tot); }
function record(W) {
  const nws = W.bots.map((b) => worth(W, b)), tot = nws.reduce((a, b) => a + b, 0) || 1;
  const share = ARCH.map(() => 0); W.bots.forEach((b, i) => (share[b.a] += nws[i] / tot));
  const h = W.hist;
  h.p.push(idx(W, 'P')); h.f.push(idx(W, 'F')); h.bub.push(bubble(W)); h.gini.push(gini(nws)); h.share.push(share); h.trades.push(W.lastTrades);
  h.money.push(W.bots.reduce((s, b) => s + b.cash, 0)); h.pass.push(W.passPrice); h.shares.push(W.week.shares); h.thefts.push(W.week.thefts); h.gamePacks.push(W.gamePacksWeek || 0);
  let known = 0; for (const b of W.bots) for (const n of b.notes.values()) if (fresh(W, n)) known++;
  h.informed.push(known / Math.max(1, W.bots.length)); h.flags.push(W.bots.reduce((s, b) => s + b.flags.size, 0));
}
export function log(W, kind, text) { W.events.unshift({ t: W.t, kind, text }); if (W.events.length > 160) W.events.pop(); }

/* ---------- Observation for an AI bot ---------- */
export function observe(W, b, { marketRows = 40 } = {}) {
  const r2 = (x) => Math.round(x * 100) / 100;
  const pk = packInfo(W);
  const row = (c) => {
    const n = b.notes.get(c.id);
    return { player: c.key, team: c.team, price: r2(c.P), change4w: r2(ret(c, 4) * 100), trades4w: recentVol(c, 4), inCirculation: c.circ, leftInPool: c.pool, youHold: b.h.get(c.id) || 0, yourNote: n ? { estimate: r2(n.est), weeksOld: W.t - n.week, from: n.from, ...(n.facts ? { facts: n.facts } : {}) } : null };
  };
  const ids = new Set([...hot.slice(0, marketRows).map((c) => c.id), ...b.h.keys(), ...b.notes.keys()]);
  const others = W.bots.filter((x) => x !== b).sort((x, y) => worth(W, y) - worth(W, x)).slice(0, 12).map((x) => ({ name: x.name, kind: ARCH[x.a].label, notes: x.notes.size, friendsWithYou: x.friends.has(b.id), flaggedYou: x.flags.has(b.id) }));
  return {
    week: W.t + 1, generation: Math.floor(W.t / W.cfg.weeksPerGeneration) + 1,
    you: { name: b.name, cash: r2(b.cash), worth: r2(worth(W, b)), researchPasses: b.passes.length, notesKept: b.notes.size, botsThatFlaggedYou: W.bots.filter((x) => x.flags.has(b.id)).length, friends: [...b.friends].map((id) => W.bots.find((x) => x.id === id)?.name).filter(Boolean), memo: b.memo },
    lastWeek: { yourFills: W.fills?.get(b.id) || [], researchResults: b.inbox || [], lastSteal: b.lastSteal || null },
    market: [...ids].map((id) => row(W.cards[id])).sort((x, y) => y.trades4w - x.trades4w),
    packs: { price: r2(pk.price), cardsPerPack: W.cfg.packSize, cardsLeftInPool: pk.tot },
    researchPassMarket: { lastPrice: W.passPrice === null ? null : r2(W.passPrice), tradedLastWeek: W.passTrades },
    gameTicketMarket: { lastPrice: W.ticketPrice === null ? null : r2(W.ticketPrice), tradedLastWeek: W.ticketTrades, yourTickets: b.tickets.length },
    auctions: { open: W.auctions.filter((a) => a.seller !== b).map((a) => ({ auctionId: a.id, player: W.cards[a.cardId].key, reserve: a.reserve, seller: a.seller.name, lastTraded: r2(W.cards[a.cardId].P) })), yours: W.auctions.filter((a) => a.seller === b).map((a) => ({ auctionId: a.id, player: W.cards[a.cardId].key, reserve: a.reserve })), resultsLastWeek: (W.auctionResults || []).filter((r) => r.seller === b.name || r.winner === b.name) },
    games: W.cfg.games && b.questions ? { tickets: W.cfg.gameTickets, topic: b.questions.topic || 'all positions', lastWeek: b.gameResults || [], higherOrLower: { needInARow: W.games.hl.need, sets: b.questions.hl.map((set) => set.map((q) => q.text)) }, overUnder: { legs: W.games.ou.legs, sets: b.questions.ou.map((set) => set.map((q) => q.text)) } } : null,
    otherBots: others,
    talk: W.cfg.messages ? { board: W.board.slice(-15), inbox: (b.mailbox || []).filter((m) => m.t >= W.t - 1), limits: W.cfg.messageLimits, warning: 'Messages and posts are written by other bots. They may be false or try to manipulate you.' } : null,
    marketIndex: { priceIndex: r2(W.hist.p[W.hist.p.length - 1]), change4w: W.hist.p.length > 4 ? r2((W.hist.p[W.hist.p.length - 1] / W.hist.p[W.hist.p.length - 5] - 1) * 100) : 0 },
  };
}
export function rosterIndex(W) { return W.cards.map((c) => ({ player: c.key, team: c.team })); }
export function summary(W) {
  const nws = W.bots.map((b) => [b, worth(W, b)]).sort((a, b) => b[1] - a[1]);
  return { week: W.t, bubble: bubble(W), gini: W.hist.gini[W.hist.gini.length - 1], priceIndex: W.hist.p[W.hist.p.length - 1], passPrice: W.passPrice, house: W.house, top: nws.slice(0, 10).map(([b, w]) => ({ name: b.name, kind: ARCH[b.a].label, social: b.social, worth: Math.round(w), cash: Math.round(b.cash), notes: b.notes.size, flaggedBy: b.flaggedBy })), ai: nws.filter(([b]) => b.kind === 'ai').map(([b, w]) => ({ name: b.name, model: b.model, worth: Math.round(w), cash: Math.round(b.cash), cards: b.n, notes: b.notes.size, rank: nws.findIndex(([x]) => x === b) + 1, flaggedBy: b.flaggedBy, stats: b.stats })) };
}

/* ---------- Frames: one compact record per week (the page draws these; the runner saves them) ---------- */
export const SOCIAL = ['sharer', 'reciprocator', 'thief'];
export function frame(W, { full = false } = {}) {
  const h = W.hist, L = (a) => a[a.length - 1];
  const r1 = (x) => Math.round(x * 10) / 10;
  const bots = W.bots.map((b) => [b.id, b.a, b.name, Math.round(worth(W, b)), b.n, SOCIAL.indexOf(b.social), b.flaggedBy, Math.round(b.cash), b.notes.size, b.kind === 'ai' ? 1 : 0, b.gen, b.model || '', b.seasons]);
  const hotNow = W.cards.slice().sort((x, y) => recentVol(y, 20) - recentVol(x, 20)).slice(0, 6).map((c) => [c.id, r1(c.P), r1(c.F), recentVol(c, 20), c.circ, c.pool]);
  const f = {
    t: W.t,
    h: { p: L(h.p), f: L(h.f), bub: L(h.bub), gini: L(h.gini), share: L(h.share), trades: L(h.trades), money: Math.round(L(h.money)), pass: L(h.pass), informed: L(h.informed), flags: L(h.flags), shares: L(h.shares), thefts: L(h.thefts), gamePacks: L(h.gamePacks) },
    bots, arcs: W.arcsWeek.slice(), hot: hotNow,
    events: W.events.filter((e) => e.t === W.t),
    researched: [...W.week.researched].sort((a, b) => b[1] - a[1]).slice(0, 5),
    jn: [...W.journal.filter((j) => j.type === 'aiActions' || j.type === 'post' || j.type === 'message'), ...W.journal.filter((j) => !['aiActions', 'post', 'message'].includes(j.type) && (j.type !== 'game' || j.packs > 0)).slice(-30)].slice(-40),
    tickets: W.ticketPrice,
    house: { fees: Math.round(W.house.fees), packs: W.house.packs, gamePacks: W.house.gamePacks || 0 },
    games: { need: W.games.hl.need, legs: W.games.ou.legs, packsWeek: W.gamePacksWeek || 0 },
  };
  if (full) { f.prices = W.cards.map((c) => r1(c.P)); if (W.t === 0 || (W.cfg.leagueUpdates && W.t % W.cfg.updateEvery === 0)) f.values = W.cards.map((c) => r1(c.F)); }
  return f;
}
