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
  outsideCollectors: false, // buyers from outside the bots bid around hidden value (the market's anchor)
  royalties: true, // each generation, holders get 3% of hidden value per card held
  royaltyRate: 0.03,
  evolve: true, // each generation the worst 10% by return on capital adopt a mutated genome from the best 10% (keeping their wealth)
  evolveShare: 0.1,
  mortality: true, // bots live 6–14 generations; on death the estate is split between heirs that carry a mutated copy of the genome
  lifespan: [6, 14],
  heirs: 2,
  populationCap: 1.15, // heirs beyond this × the starting population push the poorest bots out of the market
  // Intrinsic value: 'ovrWalk' (default) starts every card at its player's OVR in coins and moves it one coin a week,
  // up with probability 0.5 + (OVR − 80) / 50 (between walkMin and walkMax), else down; never below 1. The real
  // seasons update each player's OVR, which shifts his odds. 'formula' uses the site's card-value formula instead.
  valueModel: 'ovrWalk',
  walkStep: 1, walkMin: 0.15, walkMax: 0.85,
  priceOnly: false, // a card is worth only what someone pays: no hidden value anywhere in the world (no royalties, packs priced
                    // from market prices, no valuation contest, research shows what a card has traded for). Real seasons still
                    // update the library's stats and the game questions, and bring rookies. Off by default: with nothing to
                    // anchor them (holding earns nothing, cards have no use), prices ratchet down to about zero.
  history: true, // replay the save's real seasons as news (sandbox/data/timeline.json), then real-change draws after
  seasonWeeks: 20, // weeks per season
  turnover: false, // bots join (faster after rallies, mostly speculators) and leave (after heavy losses, or retiring)
  entryRate: 0.25, // newcomers per week in a flat market
  lenderCycle: false, // (retired: credit is now between bots, so rates and limits come from their own decisions)
  fashion: false, // collectors' taste for each player family drifts, jumps on hype and feeds on price gains
  gameStake: 2, // coins each entrant stakes into a game's pot (plus a ticket); the best scores share the pot
  prizeShare: 0.5, // share of the house's weekly takings (trade fees, pack sales, living costs) paid back out as contest prizes
  aiLifespanWeeks: [40, 80], // an AI bot's life; when it ends its estate and memo pass to one heir, who carries on
  games: true, // weekly Arcade contests (see GAMES)
  gameTickets: 3, // game tickets granted to every bot each week; a ticket is spent when a game starts (no restarts)
  ticketLife: 1, // weeks before an unused ticket expires
  ticketsTradable: true, // bots may sell tickets to bots that play better
  maxGamesPerWeek: 6, // most games one bot may play in a week, own and bought tickets together
  auctions: true, // bots may put a card up for a sealed-bid auction (highest bid wins, pays the second-highest)
  // Real-world forces (on by default): bots must pay to live, and can borrow against their cards
  livingCost: 4, // coins a bot must spend each week just to stay in the market (leaves the economy)
  lifestyle: 0.0015, // plus this share of its worth: richer bots spend more, as people do
  credit: true, // bots may lend to and borrow from each other, secured by the borrower's cards (no bank, no new coins)
  maxLTV: 0.6, // most a bot can borrow, as a share of its cards' value
  marginCall: 0.75, // past this share of its cards' value, a borrower must sell at a discount until it is back under maxLTV
  loanWeeks: 8, // loans fall due after this many weeks; a borrower that can't repay must sell, and after 3 late weeks defaults
  interest: 0.002, // (unused without a bank) the rate is whatever lenders and borrowers agree
  // Artificial safeguards (policy experiments, all off by default)
  store: false, // the Vault store sells unminted copies at hidden value × (1 + storePremium): a ceiling while the pool lasts
  storePremium: 0.6,
  priceLimit: 0, // a card's price can move at most this much in a week (0 = off)
  centralBank: false, // the allowance follows prices: more coins when cards trade below hidden value, none when above (inflation targeting)
  bankTarget: 1, // the price ÷ hidden value the bank aims for
  bankGain: 4, // how hard it reacts: allowance × (1 + gain × (target − price ÷ value)), between 0 and 4× the base
  closedEconomy: false, // instead: allowances and royalties paid only from what the house collects (no printed money)
  wealthTax: 0, // weekly tax on worth above 2× the median bot, paid into the house treasury (0 = off)
  positionLimit: 0, // no bot may hold more than this share of a card's circulation (at least 3 copies allowed; 0 = off)
  quotePull: 0.25, // how far unfilled orders pull the quoted price toward them each week
  deployOrders: 10, // most buy orders a bot places a week to put spare cash to work
  messages: false, // AI bots may talk: one public board post and two private messages a week (280 characters each)
  messageLimits: { public: 1, direct: 2, chars: 280 },
  gameTarget: 0.06, // average packs per ticket the payout aims for, the same for every game (nothing to farm)
  gameFloor: { need: 4, legs: 3 }, // the easiest each game may get, so guessing never pays well
  gamesAdaptive: true, // every 4 weeks each game's bar moves so its payout returns to gameTarget
  leagueUpdates: false, // TEST ONLY: every updateEvery weeks some players' hidden values move, as a real upload would
  updateEvery: 40,
  population: 100, // rule bots at the start; each gets a random strategy genome (no assigned strategies)
  social: { sharer: 0.45, reciprocator: 0.35, thief: 0.2 }, // social style shares among rule bots
};

export const ARCH = [
  { key: 'value', label: 'Value', short: 'VAL', color: '#3987e5', blurb: 'Strongest gene: the gap between its notes and the price.' },
  { key: 'mm', label: 'Market maker', short: 'MM', color: '#d95926', blurb: 'Quotes a bid and an ask on a handful of cards and earns the spread.' },
  { key: 'momentum', label: 'Momentum', short: 'MOM', color: '#199e70', blurb: 'Buys what is rising, sells what is falling. Sells its research passes.' },
  { key: 'retail', label: 'Herd', short: 'HRD', color: '#c98500', blurb: 'Rips packs, chases hot cards, panic-sells when the market drops.' },
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
    contests: null, predictions: [], gameStats: null, gameArch: null, gamePacksWeek: 0,
    tickets: true, ticketPrice: null, ticketTrades: 0, auctions: [], auctionResults: [], journal: [], board: [],
    treasury: 0, flow: null, botLog: new Map(),
    cool: {}, cornered: new Set(), bubbleOn: false, week: { shares: 0, thefts: 0, caught: 0, researched: new Map() },
    library,
  };
  W.byPos = {}; W.libIndex = new Map(); W.byKey = new Map();
  library.players.forEach((p, i) => { (W.byPos[p.pos] ||= []).push(p); W.libIndex.set(p, i); });
  W.gauss = () => { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  W.pick = (a) => a[Math.floor(rand() * a.length)];
  library.players.forEach((p, i) => {
    const F = cfg.valueModel === 'ovrWalk' ? Math.max(1, p.ovr || 60) : Math.max(1, p.hidden.value / 20);
    const circ = Math.max(2, Math.round(40 / Math.sqrt(Math.max(0.5, p.hidden.value / 100))));
    W.cards.push({ id: i, key: p.key, name: p.name, pos: p.pos, team: teamShort(p.team), F, P: F, P0: F, S0: circ, circ: 0, pool: circ * cfg.poolMultiplier, Ph: [F], volH: [] });
  });
  for (const c of W.cards) W.byKey.set(c.key, c);
  W.families = familyList(library);
  library.players.forEach((p, i) => (W.cards[i].fam = familyIndex(W.families, p)));
  startTimeline(W);
  for (let k = 0; k < cfg.population; k++) W.bots.push(newBot(W, null));
  if (W.bots.length) endow(W, W.bots);
  for (const b of W.bots) { b.nwh = [worth(W, b)]; b.genStart = b.nwh[0]; b.exo = 0; }
  if (cfg.games) { publishContests(W); publishContests(W); } // this week's contests and the ones two weeks out
  record(W);
  log(W, 'start', `The market opens: ${W.bots.length} bots, ${W.cards.length} players, ${W.cards.reduce((s, c) => s + c.circ, 0).toLocaleString()} cards in circulation and ${W.cards.reduce((s, c) => s + c.pool, 0).toLocaleString()} still in the pool. Every price starts at its hidden value; no bot knows any player yet.`);
  return W;
}
export function teamShort(t) { const w = String(t || 'FA').split(' '); return t === 'Free agent' ? 'FA' : w[w.length - 1]; }

// AI bots join on equal terms: the same starting cash plus a basket as big as the average rule bot's, minted from the pool.
export function addAiBot(W, extra = {}) {
  const b = newBot(W, AI, null, { social: extra.social || 'reciprocator', ...extra });
  const lw = W.cfg.aiLifespanWeeks; if (lw) { b.lifespanW = lw[0] + Math.floor(W.rand() * (lw[1] - lw[0] + 1)); }
  b.line = extra.line || 1;
  const rule = W.bots.filter((x) => x.kind === 'rule'), avg = rule.length ? Math.round(rule.reduce((s, x) => s + x.n, 0) / rule.length) : 0;
  for (let k = 0; k < avg; k++) { const pk = packInfo(W); if (!pk.tot) break; const r = W.rand() * pk.tot; let i = pk.cum.findIndex((c) => c > r); if (i < 0) i = pk.cum.length - 1; const c = W.cards[i]; if (c.pool <= 0) continue; c.pool--; c.circ++; give(b, c, 1); addLot(b, c, c.F, W.t); packCache = null; }
  W.bots.push(b); b.nwh = [worth(W, b)];
  return b;
}

function give(b, c, q) { const v = (b.h.get(c.id) || 0) + q; v > 0 ? b.h.set(c.id, v) : b.h.delete(c.id); b.n += q; }
export function worth(W, b) {
  let v = b.cash - (b.debt || 0) + (b.lent || 0);
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
  const { hidden, hallOfFame, stats, rates, ...page } = p;
  const e = W.era?.[cardId];
  if (!e) return { ...page, stats, rates };
  return { ...page, asOf: W.seasonLabel || W.timeline.seasons[0].season, ovr: e.ovr, skill: e.skill, grade: e.grade, careerLegacy: e.legacy, careerTotals: e.totals, perGame: e.perGame };
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
  if (b.kind === 'rule') writeNote(W, b, c, (W.cfg.priceOnly ? ma(c, 20) : c.F) * Math.exp(W.gauss() * b.g.err), 'research');
}
function usePass(W, b) { if (!b.passes.length) return false; b.passes.sort((x, y) => x - y); b.passes.shift(); return true; }

/* ---------- Packs ---------- */
let packCache = null;
function packInfo(W) {
  if (packCache && packCache.t === W.t) return packCache;
  let tot = 0, ev = 0, evP = 0; const cum = [];
  for (const c of W.cards) { tot += c.pool; cum.push(tot); ev += c.pool * c.F; evP += c.pool * c.P; }
  const k = W.cfg.packSize;
  packCache = { t: W.t, cum, tot, ev: tot ? (k * ev) / tot : 0, evMarket: tot ? (k * evP) / tot : 0, price: tot ? ((k * (W.cfg.priceOnly ? evP : ev)) / tot) * (1 + W.cfg.packEdge) : Infinity };
  return packCache;
}
function ripPack(W, b, free = false) {
  const pk = packInfo(W);
  if (!pk.tot || b.cash < pk.price) return null;
  b.cash -= pk.price; W.house.packs++; if (!free) { flowOut(W, b, pk.price); W.treasury += pk.price; W.house.packRevenue = (W.house.packRevenue || 0) + pk.price; }
  const out = [];
  for (let k = 0; k < W.cfg.packSize && pk.tot > 0; k++) {
    const r = W.rand() * pk.tot; let lo = 0, hi = pk.cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (pk.cum[m] <= r) lo = m + 1; else hi = m; }
    const c = W.cards[lo];
    if (c.pool <= 0) continue;
    c.pool--; c.circ++; give(b, c, 1); addLot(b, c, free ? 0 : pk.price / W.cfg.packSize, W.t); out.push(c);
    if (c.pool === 0) log(W, 'pool', `The pool has run out of ${c.pos} ${c.name} cards: only the ${c.circ} in circulation remain.`);
  }
  packCache = null;
  jot(W, { type: 'pack', bot: b.name, free, price: free ? 0 : r2(pk.price), pulls: out.map((c) => c.key) });
  return out;
}

/* ---------- Order helpers ---------- */
let bids, asks, passBids, passAsks;
function bid(b, c, p) {
  if (!(p > 0) || b.cash < p) return;
  const lim = W_.cfg.positionLimit;
  if (lim > 0 && (b.h.get(c.id) || 0) >= Math.max(3, Math.floor(lim * c.circ))) return;
  bids[c.id].push({ b, p });
}
let W_ = null; // the world the module-level order helpers act on
function ask(b, c, p, pend) { const q = b.h.get(c.id) || 0, used = pend.get(c.id) || 0; if (q > used && p > 0) { asks[c.id].push({ b, p }); pend.set(c.id, used + 1); } }
function sample(W, k) { const o = []; for (let i = 0; i < k * 3 && o.length < k; i++) { const c = W.cards[Math.floor(W.rand() * W.cards.length)]; if (c.on !== false) o.push(c); } return o; }
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
      bd.b[field].push(exp); bd.b.cash -= price; ak.b.cash += price * (1 - cfg.fee); W.house.fees += price * cfg.fee; W.treasury += price * cfg.fee; traded++;
      flowOut(W, bd.b, price); flowIn(W, ak.b, price * (1 - cfg.fee));
      jot(W, { type: kind === 'pass' ? 'passTrade' : 'ticketTrade', buyer: bd.b.name, seller: ak.b.name, price: r2(price) });
    }
  }
  if (kind === 'pass') { W.passTrades = traded; if (traded) W.passPrice = price; }
  else { W.ticketTrades = traded; if (traded) W.ticketPrice = price; }
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
      else bidv = ruleAuctionBid(W, b, c);
      if (bidv && bidv > 0 && b.cash >= bidv) a.bids.push({ b, p: bidv });
    }
    a.bids.sort((x, y) => y.p - x.p);
    const top = a.bids[0], second = a.bids[1];
    let result;
    if (top && top.p >= a.reserve) {
      const price = Math.max(a.reserve, second ? second.p : a.reserve);
      top.b.cash -= price; give(top.b, c, 1); addLot(top.b, c, price, W.t); flowOut(W, top.b, price);
      a.seller.cash += price * (1 - W.cfg.fee); W.house.fees += price * W.cfg.fee; W.treasury += price * W.cfg.fee; flowIn(W, a.seller, price * (1 - W.cfg.fee)); sellLot(W, a.seller, c, price * (1 - W.cfg.fee));
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
    ruleAuctionList(W, b);
  }
}
const r2 = (x) => Math.round(x * 100) / 100;
const WHO = ['bot', 'buyer', 'seller', 'a', 'b', 'thief', 'victim', 'winner', 'from', 'to'];
export function jot(W, e) {
  const entry = { t: W.t, ...e }; W.journal.push(entry);
  for (const k of WHO) { const n = entry[k]; if (typeof n !== 'string') continue; let l = W.botLog.get(n); if (!l) W.botLog.set(n, (l = [])); l.push(entry); if (l.length > 80) l.shift(); }
  const ck = entry.card || entry.player; if (typeof ck === 'string') { let l = (W.cardLog ||= new Map()).get(ck); if (!l) W.cardLog.set(ck, (l = [])); l.push(entry); if (l.length > 60) l.shift(); }
}
// Cost basis: every copy a bot holds remembers what it paid (FIFO), so sales realize a profit or loss
export function addLot(b, c, price, t) { let l = (b.lots ||= new Map()).get(c.id); if (!l) b.lots.set(c.id, (l = [])); l.push([price, t]); }
function sellLot(W, b, c, net) {
  const l = b.lots?.get(c.id); const lot = l && l.length ? l.shift() : [c.F, 0];
  const pnl = net - lot[0]; b.stats.realized = (b.stats.realized || 0) + pnl;
  if (W.flow) { W.flow.realized[b.a] += pnl; if (W.t - lot[1] <= 12 && lot[1] > 0) W.flow.trips[b.a]++; }
  return pnl;
}
function flowIn(W, b, x) { if (W.flow && b && b.a !== undefined) W.flow.net[b.a] += x; }
function flowOut(W, b, x) { if (W.flow && b && b.a !== undefined) W.flow.net[b.a] -= x; }
export function avgCost(b, id) { const l = b.lots?.get(id); return l && l.length ? l.reduce((s, x) => s + x[0], 0) / l.length : null; }

/* ---------- Arcade games (weekly contests) ---------- */
// Every game runs one contest a week. Each entrant spends a ticket and stakes coins into the game's pot, every entrant
// answers the SAME questions (published a week ahead, with the topic), and the best scores share the pot. Nothing is
// printed: games move coins from worse players to better ones. Each game's metrics include a skill index: the rank
// correlation between how much an entrant knew about the players asked (fresh notes) and how well it scored.
export const TOPICS = ['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL'];
export const GAMES = {
  valuation: { label: 'Valuation contest', skill: 'Estimate each card\'s hidden value', answer: 'a number of coins per card', paid: 0.2 },
  prediction: { label: 'Price prediction league', skill: 'Will each card be higher in 4 weeks?', answer: 'a probability 0 to 1 per card (scored by Brier, settled in 4 weeks)', paid: 0.1 },
  blindRank: { label: 'Blind Rank', skill: 'Rank 5 players on a stat, highest first', answer: 'the five letters in order, e.g. "C,A,E,B,D"', paid: 0.25 },
  closest: { label: 'Closest guess', skill: 'Guess career stats', answer: 'a number per question', paid: 0.25 },
  keepCut: { label: 'Keep 3 / Cut 3', skill: 'Keep the 3 of 6 with the highest Career Legacy', answer: 'three letters, e.g. "A,D,F"', paid: 0.25 },
  imposter: { label: 'Imposter', skill: 'Which of 4 players is not the same play-style family?', answer: 'a letter per question', paid: 0.25 },
  grid: { label: 'League Grid', skill: 'Name a player who fits position × award × club', answer: 'a player key per square; rarer correct answers score more', paid: 0.25 },
  higherLower: { label: 'Higher or Lower', skill: 'Which of two players has the higher career rate?', answer: 'A or B per question', paid: 0.25 },
  overUnder: { label: 'Over / Under', skill: 'Is a career rate over or under the line?', answer: 'over or under per question', paid: 0.25 },
  duel: { label: 'Head-to-head duel', skill: 'Beat one paired opponent on 5 Higher or Lower questions', answer: 'A or B per question; the winner takes both stakes', paid: 0 },
};
const GKEYS = Object.keys(GAMES);
const L5 = ['A', 'B', 'C', 'D', 'E', 'F'];

// What a bot can know about a player in this era (the timeline's season, or the latest library)
export function eraOf(W, id) {
  const e = W.era?.[id]; if (e) return e;
  const p = W.library.players[id];
  return { on: true, ovr: p.ovr, skill: p.skill, grade: p.grade, legacy: p.careerLegacy, totals: p.stats, perGame: p.rates };
}
const onCards = (W) => W.cards.filter((c) => c.on !== false);
const pickOn = (W, pos) => { const xs = onCards(W).filter((c) => !pos || c.pos === pos); return xs.length ? W.pick(xs) : null; };
function rateOf(W, id) { const e = eraOf(W, id); const ks = Object.keys(e.perGame || {}); return ks.length ? ks : null; }
function sharedRate(W, ids) { const sets = ids.map((id) => new Set(rateOf(W, id) || [])); const first = [...sets[0]]; const both = first.filter((k) => sets.every((s) => s.has(k))); return both.length ? W.pick(both) : null; }

function makeContest(W, game) {
  const topic = W.pick(TOPICS.filter((t) => onCards(W).filter((c) => c.pos === t).length >= 6)) || 'WR';
  const group = onCards(W).filter((c) => c.pos === topic);
  const draw = (k) => { const out = new Set(); let tries = 0; while (out.size < Math.min(k, group.length) && tries++ < 200) out.add(W.pick(group).id); return [...out]; };
  const q = [];
  switch (game) {
    case 'valuation': case 'prediction': { if (game === 'valuation' && W.cfg.priceOnly) break; const ids = draw(5); for (const id of ids) q.push({ ids: [id], text: `${W.cards[id].key}${game === 'prediction' ? `: higher than ${r2(W.cards[id].P)} in 4 weeks?` : ': hidden value in coins?'}` }); break; }
    case 'blindRank': { for (let t = 0; t < 10 && !q.length; t++) { const ids = draw(5), stat = sharedRate(W, ids); if (!stat) continue; const order = ids.slice().sort((a, b) => eraOf(W, b).perGame[stat] - eraOf(W, a).perGame[stat]); q.push({ ids, stat, truth: order.map((id) => L5[ids.indexOf(id)]), text: `Rank by career "${stat}", highest first: ${ids.map((id, i) => `${L5[i]}) ${W.cards[id].key}`).join(' ')}` }); } break; }
    case 'closest': { for (const id of draw(3)) { const e = eraOf(W, id), ks = Object.keys(e.totals || {}).filter((k) => typeof e.totals[k] === 'number' && e.totals[k] > 0 && !/rings|mvp|opoy|dpoy|roty|sbmvp/i.test(k)); if (!ks.length) continue; const k = W.pick(ks); const vals = group.map((c) => eraOf(W, c.id).totals?.[k]).filter((v) => typeof v === 'number'); const mu = vals.reduce((a, b) => a + b, 0) / vals.length; const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mu) ** 2, 0) / vals.length) || 1; q.push({ ids: [id], stat: k, truth: e.totals[k], sd, med: vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)], text: `${W.cards[id].key}: career "${k}"?` }); } break; }
    case 'keepCut': { const ids = draw(6); const best = ids.slice().sort((a, b) => eraOf(W, b).legacy - eraOf(W, a).legacy).slice(0, 3); q.push({ ids, truth: best.map((id) => L5[ids.indexOf(id)]), text: `Keep the 3 with the highest Career Legacy: ${ids.map((id, i) => `${L5[i]}) ${W.cards[id].key}`).join(' ')}` }); break; }
    case 'imposter': { const byFam = {}; for (const c of group) (byFam[c.fam] ||= []).push(c.id); const fams = Object.values(byFam).filter((x) => x.length >= 3); for (let t = 0; t < 4 && fams.length; t++) { const fam = W.pick(fams), others = group.filter((c) => !fam.includes(c.id)); if (!others.length) break; const three = []; while (three.length < 3) { const x = W.pick(fam); if (!three.includes(x)) three.push(x); } const odd = W.pick(others).id; const ids = [...three, odd].sort(() => W.rand() - 0.5); q.push({ ids, truth: L5[ids.indexOf(odd)], text: `Which plays a different style? ${ids.map((id, i) => `${L5[i]}) ${W.cards[id].key}`).join(' ')}` }); } break; }
    case 'grid': { const AW = ['rings', 'mvp', 'sbmvp', 'opoy']; for (let t = 0; t < 30 && q.length < 3; t++) { const c0 = W.pick(group), team = c0.team, aw = W.pick(AW); const valid = group.filter((c) => c.team === team && (eraOf(W, c.id).totals?.[aw] || 0) > 0).map((c) => c.key); if (!valid.length) continue; q.push({ ids: group.filter((c) => c.team === team).map((c) => c.id), valid, text: `A ${topic} for the ${team} with at least one ${aw.toUpperCase()}` }); } break; }
    case 'higherLower': case 'duel': { for (let t = 0; t < 40 && q.length < (game === 'duel' ? 5 : 8); t++) { const ids = draw(2); if (ids.length < 2) break; const stat = sharedRate(W, ids); if (!stat) continue; const a = eraOf(W, ids[0]).perGame[stat], b = eraOf(W, ids[1]).perGame[stat]; if (a === b) continue; q.push({ ids, stat, truth: a > b ? 'A' : 'B', text: `Higher career "${stat}": A) ${W.cards[ids[0]].key} or B) ${W.cards[ids[1]].key}?` }); } break; }
    case 'overUnder': { for (const id of draw(5)) { const ks = rateOf(W, id); if (!ks) continue; const stat = W.pick(ks), v = eraOf(W, id).perGame[stat]; let line = Math.round(v * lerp(0.8, 1.2, W.rand()) * 100) / 100; if (line === v) line = Math.round((v * 1.05 + 0.01) * 100) / 100; q.push({ ids: [id], stat, truth: v > line ? 'over' : 'under', text: `${W.cards[id].key}, career "${stat}": over or under ${line}?` }); } break; }
  }
  return { game, topic, week: W.t + 1, questions: q };
}
// Contests are published two weeks ahead: what a bot sees as "in two weeks" this week is what it answers next week, so
// research it orders now arrives in time
export function publishContests(W) { W.contests = W.contestsAhead || null; W.contestsAhead = Object.fromEntries(GKEYS.map((g) => [g, makeContest(W, g)])); if (!W.contests) W.contests = Object.fromEntries(GKEYS.map((g) => [g, makeContest(W, g)])); }

// Scores: higher is better for every game
const num = (x) => { const v = Number(String(x).replace(/[^0-9.\-e]/gi, '')); return isFinite(v) ? v : null; };
function scoreOf(W, game, con, ans) {
  const qs = con.questions; if (!qs.length) return 0;
  switch (game) {
    case 'valuation': return -qs.reduce((s, q, i) => { const v = num(ans[i]); const F = W.cards[q.ids[0]].F; return s + (v && v > 0 ? Math.min(3, Math.abs(Math.log(v / F))) : 3); }, 0) / qs.length;
    case 'prediction': return null; // settled in 4 weeks
    case 'blindRank': { const q = qs[0], got = String(ans[0] ?? ans.join(',')).toUpperCase().split(/[^A-F]+/).filter(Boolean); let d = 0; q.truth.forEach((l, i) => { const j = got.indexOf(l); d += j < 0 ? 4 : Math.abs(j - i); }); return 1 - d / 12; }
    case 'closest': return -qs.reduce((s, q, i) => { const v = num(ans[i]); return s + (v == null ? 3 : Math.min(3, Math.abs(v - q.truth) / q.sd)); }, 0) / qs.length;
    case 'keepCut': { const got = new Set(String(ans[0] ?? ans.join(',')).toUpperCase().split(/[^A-F]+/).filter(Boolean).slice(0, 3)); return qs[0].truth.filter((l) => got.has(l)).length / 3; }
    case 'imposter': return qs.reduce((s, q, i) => s + (String(ans[i] ?? '').trim().toUpperCase().startsWith(q.truth) ? 1 : 0), 0) / qs.length;
    case 'grid': return qs.reduce((s, q, i) => { const a = String(ans[i] ?? '').trim(); return s + (q.valid.includes(a) ? 1 + 1 / q.valid.length : 0); }, 0) / qs.length;
    case 'higherLower': case 'duel': return qs.reduce((s, q, i) => s + (String(ans[i] ?? '').trim().toUpperCase().startsWith(q.truth) ? 1 : 0), 0) / qs.length;
    case 'overUnder': return qs.reduce((s, q, i) => s + (String(ans[i] ?? '').trim().toLowerCase() === q.truth ? 1 : 0), 0) / qs.length;
  }
  return 0;
}
// How a rule bot answers: from its fresh notes when it has them (its research error blurs them), else a guess
function knows(W, b, id) { return estimate(W, b, W.cards[id]) !== null; }
function ruleAnswers(W, b, game, con) {
  const e = b.g.err, noisy = (v) => v * Math.exp(W.gauss() * e), coin = (p) => W.rand() < p;
  const flip = (t) => ({ A: 'B', B: 'A', over: 'under', under: 'over' }[t] ?? t);
  return con.questions.map((q) => {
    const k = q.ids.filter((id) => knows(W, b, id)).length / q.ids.length;
    switch (game) {
      case 'valuation': return String(r2(knows(W, b, q.ids[0]) ? estimate(W, b, W.cards[q.ids[0]]) : W.cards[q.ids[0]].P));
      case 'prediction': { const c = W.cards[q.ids[0]], est0 = estimate(W, b, c); const tilt = b.g.w.momentum > 0.3 ? clamp(ret(c, 4) * 3, -0.3, 0.3) : est0 !== null ? (est0 > c.P ? 0.18 : -0.18) : 0; return String(r2(clamp(0.5 + tilt + W.gauss() * 0.05, 0.02, 0.98))); }
      case 'blindRank': return q.ids.map((id, i) => [L5[i], knows(W, b, id) ? noisy(eraOf(W, id).perGame[q.stat]) : W.rand() * eraOf(W, q.ids[0]).perGame[q.stat] * 2]).sort((x, y) => y[1] - x[1]).map((x) => x[0]).join(',');
      case 'closest': return String(Math.round(knows(W, b, q.ids[0]) ? noisy(q.truth) : q.med));
      case 'keepCut': return q.ids.map((id, i) => [L5[i], knows(W, b, id) ? noisy(eraOf(W, id).legacy) : W.cards[id].P * 30]).sort((x, y) => y[1] - x[1]).slice(0, 3).map((x) => x[0]).join(',');
      case 'imposter': return coin(0.25 + 0.6 * k * (1 - e)) ? q.truth : W.pick(L5.slice(0, 4));
      case 'grid': { const mine = q.valid.filter((key) => knows(W, b, W.byKey.get(key).id)); if (mine.length && coin(0.9)) return W.pick(mine); const pool = q.ids.map((id) => W.cards[id].key); return coin(0.5) ? W.pick(pool) : ''; }
      default: return coin(0.5 + 0.42 * k * (1 - e)) ? q.truth : flip(q.truth);
    }
  });
}
function bestTopic(W, b) {
  const n = {}; for (const [id, note] of b.notes) if (fresh(W, note)) n[W.cards[id].pos] = (n[W.cards[id].pos] || 0) + 1;
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 3 ? top[0] : null;
}
// A rule bot enters the contests whose topic it knows best (or a couple at random), one ticket each
function ruleEntries(W, b) {
  const known = {}; for (const [id, note] of b.notes) if (fresh(W, note)) known[W.cards[id].pos] = (known[W.cards[id].pos] || 0) + 1;
  const ranked = GKEYS.map((g) => [g, (known[W.contests[g].topic] || 0) + W.rand()]).sort((a, b) => b[1] - a[1]);
  return ranked.slice(0, b.tickets.length).filter(([, s]) => s >= 1 || W.rand() < 0.35).map(([g]) => g);
}
function rankCorr(xs, ys) {
  const n = xs.length; if (n < 4) return null;
  const rk = (a) => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = Array(n); o.forEach(([, i], k) => (r[i] = k)); return r; };
  const rx = rk(xs), ry = rk(ys), mx = (n - 1) / 2; let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - mx); dx += (rx[i] - mx) ** 2; dy += (ry[i] - mx) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}
function payout(W, game, entries, prize = 0) {
  // entries: [{b, score, know}] — the top share of scorers split the pot (stakes + the house's prize; ties at the cut included)
  const pot = entries.length * W.cfg.gameStake + (entries.length ? prize : 0), st = W.gameStats[game];
  if (entries.length) { st.prize = (st.prize || 0) + prize; W.prizePaid = (W.prizePaid || 0) + prize; }
  st.entrants += entries.length; st.pot += pot;
  if (!entries.length) return;
  const sorted = entries.slice().sort((a, b) => b.score - a.score);
  const k = Math.max(1, Math.round(entries.length * GAMES[game].paid)), cut = sorted[k - 1].score, winners = sorted.filter((e) => e.score >= cut);
  for (const w of winners) { w.b.cash += pot / winners.length; flowIn(W, w.b, pot / winners.length); }
  for (const e of entries) { const won = winners.includes(e), net = (won ? pot / winners.length : 0) - W.cfg.gameStake; const a = W.gameArch[e.b.a]; a[0]++; if (won) a[1]++; a[2] += net; e.b.stats.gameNet = (e.b.stats.gameNet || 0) + net; jot(W, { type: 'game', bot: e.b.name, game, topic: W.contests[game]?.topic, score: r2(e.score), won, net: r2(net) }); }
  st.scoreSum += entries.reduce((s, e) => s + e.score, 0); st.top = Math.max(st.top ?? -Infinity, sorted[0].score);
  const r = rankCorr(entries.map((e) => e.know), entries.map((e) => e.score)); if (r !== null) { st.skillSum += r; st.skillN++; }
}
function gamePhase(W) {
  const cfg = W.cfg, con = W.contests; if (!con) { publishContests(W); return; }
  W.gameStats = Object.fromEntries(GKEYS.map((g) => [g, { entrants: 0, pot: 0, scoreSum: 0, top: null, skillSum: 0, skillN: 0 }]));
  W.gameArch = ARCH.map(() => [0, 0, 0]);
  const entries = Object.fromEntries(GKEYS.map((g) => [g, []]));
  for (const b of W.bots) {
    b.gameResults = [];
    const picks = b.kind === 'ai' ? (b.gameAnswers || []).filter((x) => GAMES[x?.game]).map((x) => x.game) : ruleEntries(W, b);
    const seen = new Set();
    for (const g of picks) {
      if (seen.has(g) || !b.tickets.length || b.cash < cfg.gameStake || !con[g]?.questions.length) continue;
      seen.add(g); b.tickets.shift(); b.cash -= cfg.gameStake; flowOut(W, b, cfg.gameStake);
      const ans = b.kind === 'ai' ? (b.gameAnswers.find((x) => x.game === g)?.answers || []) : ruleAnswers(W, b, g, con[g]);
      const know = con[g].questions.reduce((s, q) => s + q.ids.filter((id) => knows(W, b, id)).length / q.ids.length, 0) / con[g].questions.length;
      if (g === 'prediction') { (W.predictions ||= []).push({ b, settle: W.t + 4, qs: con[g].questions.map((q) => [q.ids[0], W.cards[q.ids[0]].P]), probs: con[g].questions.map((q, i) => clamp(Number(ans[i]) || 0.5, 0, 1)), know }); continue; }
      entries[g].push({ b, score: scoreOf(W, g, con[g], ans), know, ans });
    }
  }
  // Duels: entrants are paired at random; the better score takes both stakes (a tie splits them back)
  const duel = entries.duel.sort(() => W.rand() - 0.5); W.gameStats.duel.entrants += duel.length; W.gameStats.duel.pot += duel.length * cfg.gameStake;
  for (let i = 0; i + 1 < duel.length; i += 2) {
    const [x, y] = [duel[i], duel[i + 1]], pot = 2 * cfg.gameStake;
    const shares = x.score === y.score ? [pot / 2, pot / 2] : x.score > y.score ? [pot, 0] : [0, pot];
    [[x, shares[0]], [y, shares[1]]].forEach(([e, got]) => { e.b.cash += got; flowIn(W, e.b, got); const a = W.gameArch[e.b.a]; a[0]++; if (got > cfg.gameStake) a[1]++; a[2] += got - cfg.gameStake; e.b.stats.gameNet = (e.b.stats.gameNet || 0) + got - cfg.gameStake; jot(W, { type: 'game', bot: e.b.name, game: 'duel', opponent: (e === x ? y : x).b.name, score: r2(e.score), won: got > cfg.gameStake, net: r2(got - cfg.gameStake) }); });
  }
  if (duel.length % 2) { const e = duel[duel.length - 1]; e.b.cash += cfg.gameStake; } // an unpaired duelist gets its stake back
  { const r = rankCorr(duel.map((e) => e.know), duel.map((e) => e.score)); if (r !== null) { W.gameStats.duel.skillSum += r; W.gameStats.duel.skillN++; } W.gameStats.duel.scoreSum += duel.reduce((s, e) => s + e.score, 0); }
  // The house's prize pool: half of last week's takings, shared between games by how many entered each
  const takings = (W.house.fees - (W.prevFees ?? W.house.fees)) + ((W.house.packRevenue || 0) - (W.prevPackRev ?? (W.house.packRevenue || 0))) + (W.living?.spent || 0);
  W.prevFees = W.house.fees; W.prevPackRev = W.house.packRevenue || 0; W.prizePaid = 0;
  const pool = Math.max(0, takings) * cfg.prizeShare, dueN = (W.predictions || []).filter((p) => p.settle <= W.t).length;
  const counts = Object.fromEntries(GKEYS.filter((g) => g !== 'duel').map((g) => [g, g === 'prediction' ? dueN : entries[g].length])), totN = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  W.prizePool = pool;
  for (const g of GKEYS) if (g !== 'duel' && g !== 'prediction') payout(W, g, entries[g], (pool * counts[g]) / totN);
  // Prediction league: settle the predictions made 4 weeks ago (Brier score: lower is better, so score = −Brier)
  const due = (W.predictions || []).filter((p) => p.settle <= W.t); W.predictions = (W.predictions || []).filter((p) => p.settle > W.t);
  if (due.length) payout(W, 'prediction', due.map((p) => ({ b: p.b, know: p.know, score: -p.qs.reduce((s, [id, P0], i) => s + (p.probs[i] - (W.cards[id].P > P0 ? 1 : 0)) ** 2, 0) / p.qs.length })), (pool * counts.prediction) / totN);
  for (const b of W.bots) b.gameResults = W.journal.filter((j) => j.type === 'game' && j.bot === b.name && j.t === W.t).map(({ game, score, won, net }) => ({ game, score, won, net }));
  publishContests(W);
}
// A rule bot wants game tickets in proportion to what it knows
function ticketWish(W, b) {
  const topic = bestTopic(W, b);
  if (!topic) return W.rand() < 0.5 ? 1 : 0;
  const n = [...b.notes.entries()].filter(([id, note]) => fresh(W, note) && W.cards[id].pos === topic).length;
  return clamp(1 + Math.floor(n / 3), 1, W.cfg.maxGamesPerWeek);
}

/* ---------- Strategy genome (no assigned strategies) ---------- */
// Every rule bot runs the same policy. What differs is its genome: how much weight it puts on each signal it can see,
// plus how aggressive, patient, leveraged, generous and sociable it is. Strategies are not assigned; a bot's "style"
// is just a label for its dominant weight, recomputed as its genome mutates down the generations. Whatever pays,
// spreads (if evolution is on); whatever doesn't, dies out.
//   value    the gap between its notes' estimate and the price
//   make     posting quotes on both sides (market making)
//   momentum the card's recent trend
//   herd     what the crowd is doing (recent volume and the market's mood)
//   pack     the gap between what a pack's pulls sell for and the pack's price
//   hoard    accumulating a few favourite players
//   revert   distance below the card's recent average (buying dips)
export const SIGNALS = ['value', 'make', 'momentum', 'herd', 'pack', 'hoard', 'revert'];
function socialStyle(W) { const s = W.cfg.social, r = W.rand(); return r < s.sharer ? 'sharer' : r < s.sharer + s.reciprocator ? 'reciprocator' : 'thief'; }
function gammaish(W, k) { let x = 0; for (let i = 0; i < 3; i++) x -= Math.log(W.rand() || 1e-9); return Math.pow(x / 3, 1 / k); } // skewed draw: most weights small, a few large
function norm(w) { const s = SIGNALS.reduce((a, k) => a + w[k], 0) || 1; for (const k of SIGNALS) w[k] /= s; return w; }
const styleOf = (w) => SIGNALS.reduce((best, k, i) => (w[k] > w[SIGNALS[best]] ? i : best), 0);
function collectorTargets(W) { const pool = W.cards.filter((c) => c.on !== false && c.F > 4 && c.F < 600); return pool.length ? [W.pick(pool).id, W.pick(pool).id] : []; }
function randomGenome(W) {
  const r = W.rand, w = {}; for (const k of SIGNALS) w[k] = gammaish(W, 0.45);
  return {
    w: norm(w), horizon: 2 + Math.floor(r() * 11), aggr: lerp(0.01, 0.08, r()), margin: lerp(0.04, 0.25, r()), keep: lerp(0.08, 0.4, r()),
    err: lerp(0.06, 0.35, r()), panic: lerp(0.06, 0.3, r()), spread: lerp(0.02, 0.1, r()), size: 5 + Math.floor(r() * 11),
    lev: r() < 0.5 ? 0 : -Math.log(r() || 1e-9) * 0.4, lendShare: r() < 0.5 ? 0 : r() * 0.6, lendRate: lerp(0.001, 0.008, r()), maxRate: lerp(0.002, 0.012, r()),
    passBid: lerp(2, 30, r()), passAsk: lerp(1, 12, r()), ticketBid: lerp(0.5, 8, r()), ticketAsk: lerp(0.2, 4, r()),
    targets: collectorTargets(W), book: [],
  };
}
function mutate(W, g) {
  const o = { ...g, w: { ...g.w }, book: [], targets: g.targets.slice() };
  for (const k of SIGNALS) o.w[k] *= Math.exp(W.gauss() * 0.3);
  if (W.rand() < 0.1) o.w[W.pick(SIGNALS)] *= 3; // now and then a bigger jump: innovation
  norm(o.w);
  for (const k of ['aggr', 'margin', 'keep', 'err', 'panic', 'spread', 'lev', 'lendShare', 'lendRate', 'maxRate', 'passBid', 'passAsk', 'ticketBid', 'ticketAsk']) o[k] = Math.max(0, o[k] * lerp(0.85, 1.15, W.rand()) + (o[k] === 0 && W.rand() < 0.05 ? 0.05 : 0));
  o.horizon = clamp(Math.round(o.horizon * lerp(0.8, 1.25, W.rand())), 2, 16); o.size = clamp(Math.round(o.size * lerp(0.8, 1.25, W.rand())), 3, 20);
  if (W.rand() < 0.2) o.targets = collectorTargets(W);
  return o;
}
export function newBot(W, a, parent, extra = {}) {
  const ai = a === AI, g = ai ? randomGenome(W) : parent ? mutate(W, parent.g) : randomGenome(W);
  const b = {
    id: W.nextId++, a: ai ? AI : styleOf(g.w), kind: ai ? 'ai' : 'rule', g, cash: W.cfg.startCash,
    h: new Map(), n: 0, nwh: [], gen: parent ? parent.gen + 1 : 1, born: W.t, seasons: 0,
    passes: [], tickets: [], notes: new Map(), debt: 0, lent: 0, flags: new Set(), friends: new Set(), flaggedBy: 0,
    social: parent ? (W.rand() < 0.1 ? socialStyle(W) : parent.social) : socialStyle(W),
    stats: { shared: 0, stolen: 0, caught: 0, researched: 0 }, memo: '', ...extra,
  };
  b.name = extra.name || `BOT-${String(b.id).padStart(3, '0')}`;
  b.lineage = parent ? parent.lineage ?? parent.id : b.id;
  return b;
}

// The signals one bot reads for one card (all roughly in −1…1)
function signals(W, b, c) {
  const e = estimate(W, b, c), g = b.g;
  return {
    value: e === null ? 0 : clamp((e - c.P) / c.P, -1, 1),
    momentum: clamp(ret(c, g.horizon), -0.5, 0.5),
    revert: clamp(1 - c.P / ma(c, 12), -0.5, 0.5),
    herd: (recentVol(c, 4) > 2 ? clamp(ret(c, 2), -0.3, 0.3) + 0.05 : 0) - mood.drop * 2,
  };
}
const scoreCard = (b, s) => 3 * (b.g.w.value * s.value + b.g.w.momentum * s.momentum + b.g.w.revert * s.revert + b.g.w.herd * s.herd);

// Which players a bot wants to research this week: bots that weigh value, hoarding or dips read the library; pure
// momentum, herd and pack bots mostly sell their passes
function researchWish(W, b) {
  const w = b.g.w, want = clamp(Math.round(W.cfg.passesPerWeek * 1.6 * (w.value + w.hoard + 0.5 * w.revert + 0.5 * w.make)), 0, W.cfg.maxResearchPerWeek);
  if (!want) return [];
  const known = (c) => fresh(W, b.notes.get(c.id)) && W.t - b.notes.get(c.id).week < W.cfg.knowledgeWeeks - 2;
  const held = [...b.h.keys()].map((id) => W.cards[id]), tg = (b.g.targets || []).map((id) => W.cards[id]);
  return [...tg, ...held, ...hot.slice(0, 40), ...sample(W, 8)].filter((c, i, a) => c && c.on !== false && !known(c) && a.indexOf(c) === i).slice(0, want);
}

function act(W, b) {
  const pend = new Map(), g = b.g, w = g.w, nw = b.nwh[b.nwh.length - 1] || b.cash, pk = packInfo(W);
  const held = [...b.h.keys()].map((id) => W.cards[id]);
  const cand = [...held, ...[...b.notes.keys()].map((id) => W.cards[id]), ...hot.slice(0, 30), ...sample(W, 10)].filter((c, i, a) => c && c.on !== false && a.indexOf(c) === i);
  const scored = cand.map((c) => [c, scoreCard(b, signals(W, b, c))]);
  // Panic: a bot that weighs the crowd dumps cards after a drawdown
  const dd = b.nwh.length > 4 ? 1 - b.nwh[b.nwh.length - 1] / Math.max(...b.nwh.slice(-5)) : 0;
  if (w.herd > 0.2 && Math.max(dd, mood.drop) > g.panic) { let k = 0; for (const c of held) { if (k++ > 6) break; ask(b, c, c.P * 0.85, pend); } return; }
  // Buy what scores well, sell what scores badly (one copy each; two on a strong signal)
  let spare = b.cash - g.keep * nw, orders = 0;
  for (const [c, s] of scored.sort((x, y) => y[1] - x[1])) {
    const q = b.h.get(c.id) || 0;
    if (s > 0.03 && spare > c.P && orders < W.cfg.deployOrders) { bid(b, c, c.P * (1 + Math.min(g.aggr, s))); spare -= c.P; orders++; if (s > 0.15 && spare > c.P) { bid(b, c, c.P * (1 + g.aggr)); spare -= c.P; } }
    else if (q && s < -0.03) ask(b, c, c.P * (1 - Math.min(g.aggr, -s) / 2), pend);
  }
  // Value exit: sell above the notes' estimate by the bot's margin
  if (w.value > 0.15) for (const c of held) { const e = estimate(W, b, c); if (e !== null && c.P > e * (1 + g.margin)) ask(b, c, Math.max(e * (1 + g.margin), c.P * 0.98), pend); }
  // Hoarding: keep buying two favourite players, rarely sell
  if (w.hoard > 0.15) for (const id of g.targets) { const c = W.cards[id]; if (!c || c.on === false) continue; const e = est(W, b, c); if (c.P < e * (1 + 2 * w.hoard) && b.cash > c.P) bid(b, c, c.P * 1.05); if ((b.h.get(id) || 0) && c.P > e * 3) ask(b, c, c.P, pend); }
  // Market making: quote both sides on a book of liquid cards, skewed by inventory
  if (w.make > 0.15) {
    if (!g.book.length || W.t % W.cfg.weeksPerGeneration === 1) g.book = hot.slice(0, 50).sort(() => W.rand() - 0.5).slice(0, g.size).map((c) => c.id);
    for (const id of g.book) { const c = W.cards[id], inv = b.h.get(id) || 0, e = estimate(W, b, c), mid = e === null ? c.P : lerp(c.P, e, 0.3), skew = (inv - 3) * 0.012; if (inv < 10 && b.cash > c.P * 2) bid(b, c, mid * (1 - g.spread - skew)); if (inv > 0) ask(b, c, mid * (1 + g.spread - skew), pend); }
  }
  // Packs: rip when the pulls sell for more than the pack, then flip them; the crowd-minded rip for the thrill
  if (w.pack > 0.1 && pk.evMarket * (1 - W.cfg.fee) > pk.price * 1.02) for (let k = 0; k < 1 + Math.floor(w.pack * 4); k++) if (!ripPack(W, b)) break;
  if (w.pack > 0.2) for (const c of held) if (W.rand() < w.pack) ask(b, c, c.P * 0.985, pend);
  if (w.herd > 0.25 && W.rand() < w.herd * 0.3 && b.cash > pk.price * 1.5) ripPack(W, b);
  // Raise cash when below half the cash target: sell what scores worst
  if (b.cash < g.keep * nw * 0.5) for (const [c] of scored.filter(([c]) => b.h.get(c.id)).sort((x, y) => x[1] - y[1]).slice(0, 2)) ask(b, c, c.P * 0.98, pend);
}
// A rule bot's sealed bid for an auctioned card: what its signals say the card is worth to it
function ruleAuctionBid(W, b, c) {
  const s = scoreCard(b, signals(W, b, c)), e = estimate(W, b, c);
  if (b.g.w.hoard > 0.15 && b.g.targets.includes(c.id)) return est(W, b, c) * (1 + 2 * b.g.w.hoard) * 0.9;
  if (e !== null && b.g.w.value > 0.2) return e * (1 - b.g.margin * 0.5);
  return s > 0.05 ? c.P * (1 + Math.min(0.2, s)) : null;
}
function ruleAuctionList(W, b) {
  if (b.g.w.pack > 0.25) for (const [id] of b.h) { const c = W.cards[id]; if (c.circ < 12 && W.rand() < 0.3) { listAuction(W, b, c, c.P); return; } }
  if (b.g.w.herd > 0.3 && W.rand() < 0.04 && b.h.size) { const c = [...b.h.keys()].map((id) => W.cards[id]).sort((x, y) => y.P - x.P)[0]; listAuction(W, b, c, c.P * 0.9); }
}

/* ---------- Credit between bots ---------- */
// There is no bank. Bots with idle cash offer loans at the rate they ask; bots with an appetite for leverage request
// them up to the most they will pay. Offers and requests clear once a week at one rate. Loans are secured by the
// borrower's cards: past the margin line the borrower must sell; at maturity it must repay or sell; an insolvent
// borrower defaults and its lenders lose what can't be recovered. No coins are created: credit only moves them.
function holdingsValue(W, b) { let v = 0; for (const [id, q] of b.h) v += q * W.cards[id].P; return v; }
function repayLoan(W, L, amt) { const x = Math.min(amt, L.amount); L.amount -= x; L.borrower.debt -= x; L.borrower.cash -= x; L.lender.cash += x; L.lender.lent -= x; return x; }
function creditMarket(W) {
  const cfg = W.cfg, C = (W.credit ||= {}); Object.assign(C, { lent: 0, repaid: 0, calls: 0, defaults: 0, writtenOff: 0, rate: C.rate ?? null });
  if (!cfg.credit) return;
  const bot = new Set(W.bots); W.loans = (W.loans || []).filter((L) => L.amount > 0.01 && bot.has(L.borrower) && bot.has(L.lender));
  // Interest, maturity
  for (const L of W.loans) {
    const i = L.amount * L.rate, b = L.borrower;
    if (b.cash >= i) { b.cash -= i; L.lender.cash += i; } else { L.amount += i - b.cash; b.debt += i - b.cash; L.lender.lent += i - b.cash; L.lender.cash += b.cash; b.cash = 0; }
    if (L.due <= W.t) { const paid = repayLoan(W, L, b.cash); C.repaid += paid; if (L.amount > 0.01) { b.forced = (b.forced || 0) + L.amount / 0.88; L.due = W.t + 1; L.late = (L.late || 0) + 1; } }
  }
  // Margin calls and defaults
  for (const b of W.bots) {
    if (!(b.debt > 0)) continue;
    const hv = holdingsValue(W, b);
    if (b.debt > b.cash + hv || W.loans.some((L) => L.borrower === b && L.late >= 3)) { // default: lenders recover the cash, lose the rest
      const mine = W.loans.filter((L) => L.borrower === b), tot = mine.reduce((s, L) => s + L.amount, 0);
      for (const L of mine) { const rec = tot ? (b.cash * L.amount) / tot : 0; L.lender.cash += rec; L.lender.lent -= L.amount; C.writtenOff += L.amount - rec; L.amount = 0; }
      for (const [id, q] of b.h) W.liq.set(id, (W.liq.get(id) || 0) + q);
      b.h.clear(); b.n = 0; b.lots = new Map(); b.cash = 0; b.debt = 0; C.defaults++; jot(W, { type: 'default', bot: b.name, debt: r2(tot) }); continue;
    }
    if (b.debt > cfg.marginCall * hv) { b.forced = (b.forced || 0) + (b.debt - cfg.maxLTV * hv) / 0.88; C.calls++; if (!b.calledAt || W.t - b.calledAt > 8) { b.calledAt = W.t; jot(W, { type: 'marginCall', bot: b.name, debt: r2(b.debt), cards: r2(hv) }); } }
  }
  // New loans: one weekly call auction for credit
  const offers = [], asks2 = [];
  for (const b of W.bots) {
    const hv = holdingsValue(W, b), eq = b.cash + hv + (b.lent || 0) - b.debt;
    if (b.kind === 'ai') {
      const o = b.pending?.lend; if (o && Number(o.amount) > 0) offers.push({ b, amt: Math.min(Number(o.amount), b.cash), rate: Math.max(0, Number(o.rate) || 0) });
      const q = b.pending?.borrowReq; if (q && Number(q.amount) > 0) asks2.push({ b, amt: Math.min(Number(q.amount), Math.max(0, cfg.maxLTV * hv - b.debt)), rate: Math.max(0, Number(q.maxRate) || 0) });
      continue;
    }
    const idle = b.cash - b.g.keep * Math.max(0, eq); if (b.g.lendShare > 0 && idle > 10) offers.push({ b, amt: idle * b.g.lendShare, rate: b.g.lendRate });
    const want = Math.min(b.g.lev * Math.max(0, eq), cfg.maxLTV * hv) - b.debt; if (b.g.lev > 0 && want > 5) asks2.push({ b, amt: want, rate: b.g.maxRate });
  }
  asks2.sort((x, y) => y.rate - x.rate); offers.sort((x, y) => x.rate - y.rate);
  const fills = []; let i = 0, j = 0;
  while (i < asks2.length && j < offers.length && asks2[i].rate >= offers[j].rate) {
    if (asks2[i].b === offers[j].b) { j++; continue; }
    const x = Math.min(asks2[i].amt, offers[j].amt); if (x > 0.5) fills.push([asks2[i], offers[j], x]);
    asks2[i].amt -= x; offers[j].amt -= x; if (asks2[i].amt <= 0.5) i++; if (offers[j].amt <= 0.5) j++;
  }
  if (fills.length) {
    const [lb, lo] = fills[fills.length - 1], rate = (lb.rate + lo.rate) / 2; C.rate = rate;
    for (const [rq, of, x] of fills) { const amt = Math.min(x, of.b.cash); if (amt <= 0.5) continue; of.b.cash -= amt; of.b.lent = (of.b.lent || 0) + amt; rq.b.cash += amt; rq.b.debt += amt; W.loans.push({ lender: of.b, borrower: rq.b, amount: amt, rate, due: W.t + cfg.loanWeeks }); C.lent += amt; jot(W, { type: 'loan', lender: of.b.name, borrower: rq.b.name, amount: r2(amt), rate: Math.round(rate * 10000) / 10000 }); }
  }
  if (C.defaults >= 2) log(W, 'margin', `${C.defaults} bots default: their lenders lose ${Math.round(C.writtenOff).toLocaleString()} coins and the cards are dumped.`);
  if (C.calls >= 5) log(W, 'margin', `Margin calls: ${C.calls} borrowers are forced to sell cards at a discount.`);
}
// Living costs are a law of the world: every bot pays to stay in the market, richer bots more
function livingAndCredit(W) {
  const cfg = W.cfg; W.living = { spent: 0, broke: 0 };
  for (const b of W.bots) {
    b.forced = 0;
    const eq = b.cash + holdingsValue(W, b) + (b.lent || 0) - b.debt, cost = cfg.livingCost + cfg.lifestyle * Math.max(0, eq);
    const paidC = Math.min(cost, Math.max(0, b.cash)); b.exo = (b.exo || 0) - paidC;
    if (b.cash >= cost) { b.cash -= cost; W.living.spent += cost; } else { W.living.spent += Math.max(0, b.cash); b.forced += cost - Math.max(0, b.cash); b.cash = 0; W.living.broke++; }
  }
  creditMarket(W);
  // AI repayments
  for (const b of W.bots) { const r = Number(b.pending?.repay) || 0; if (b.kind === 'ai' && r > 0) for (const L of W.loans.filter((L) => L.borrower === b)) repayLoan(W, L, Math.min(r, b.cash)); }
}
export function totalDebt(W) { return W.bots.reduce((s, b) => s + (b.debt || 0), 0); }
// The population's genome, one vote per bot: what selection and inheritance are spreading
function genomeMix(W) {
  const rule = W.bots.filter((b) => b.kind === 'rule'), ws = rule.map(() => 1), tot = ws.length || 1; // every bot counts once: genes spread by being copied, not by wealth
  const out = SIGNALS.map((k) => rule.reduce((s, b, i) => s + b.g.w[k] * ws[i], 0) / tot);
  out.push(rule.reduce((s, b, i) => s + Math.min(2, b.g.lev) * ws[i], 0) / tot, rule.reduce((s, b, i) => s + b.g.lendShare * ws[i], 0) / tot);
  return out.map((x) => Math.round(x * 1000) / 1000);
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
  // Credit between bots: offer a loan, request one, or repay
  b.pending.lend = a.lend && typeof a.lend === 'object' ? a.lend : null;
  b.pending.borrowReq = a.borrow && typeof a.borrow === 'object' ? a.borrow : null;
  b.pending.repay = Number(a.repay) || 0;
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
  b.gameAnswers = Array.isArray(a.games) ? a.games.slice(0, W.cfg.maxGamesPerWeek) : [];
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
  W.t++; packCache = null; W_ = W;
  if (W.timeline && W.t % cfg.seasonWeeks === 0) nextSeason(W);
  if (cfg.valueModel === 'ovrWalk') ovrWalk(W);
  W.flow = { net: ARCH.map(() => 0), realized: ARCH.map(() => 0), trips: ARCH.map(() => 0), tax: 0, paidOut: 0 };
  W.week = { shares: 0, thefts: 0, caught: 0, researched: new Map() };
  W.journal = W.journal.filter((j) => j.t === W.t); // keep this week's decisions, logged before the week ran
  for (const b of W.bots) {
    b.passes = b.passes.filter((e) => e > W.t); for (let k = 0; k < cfg.passesPerWeek; k++) b.passes.push(W.t + cfg.passLife);
    b.tickets = b.tickets.filter((e) => e > W.t); if (cfg.games) for (let k = 0; k < cfg.gameTickets; k++) b.tickets.push(W.t + cfg.ticketLife);
    b.inbox = [];
  }
  // Allowance: printed each week, or (closed economy) paid out of the treasury, at most half of it a week
  const lastBub = W.hist.bub[W.hist.bub.length - 1] ?? 1;
  W.bankRate = cfg.centralBank ? clamp(1 + cfg.bankGain * (cfg.bankTarget - lastBub), 0, 4) : 1;
  const want = cfg.allowance * W.bots.length * W.bankRate, pay = cfg.closedEconomy ? Math.min(want, W.treasury) : want;
  if (cfg.closedEconomy) W.treasury -= pay; else W.treasury = 0; // without a closed economy, the house's takings leave circulation
  for (const b of W.bots) { b.cash += pay / W.bots.length; b.exo = (b.exo || 0) + pay / W.bots.length; }
  W.flow.paidOut = pay;
  if (cfg.wealthTax > 0 && W.t % 4 === 0) {
    const ws = W.bots.map((b) => [b, worth(W, b)]), med = ws.map((x) => x[1]).sort((a, b) => a - b)[Math.floor(ws.length / 2)] || 0;
    for (const [b, w] of ws) { if (w <= med * 2) continue; const t = Math.min(b.cash, (w - med * 2) * cfg.wealthTax * 4); b.cash -= t; W.treasury += t; W.flow.tax += t; flowOut(W, b, t); }
  }
  if (cfg.leagueUpdates && W.t % cfg.updateEvery === 0) leagueUpdate(W);
  { const ph = W.hist.p, peak = Math.max(...ph.slice(-8)); mood.drop = ph.length ? 1 - ph[ph.length - 1] / peak : 0; }
  hot = W.cards.filter((c) => c.on !== false).sort((x, y) => recentVol(y, 20) * Math.max(0.2, 1 + ret(y, 4)) - recentVol(x, 20) * Math.max(0.2, 1 + ret(x, 4)));
  for (const b of W.bots) if (b.kind === 'rule') b.a = styleOf(b.g.w); // a style is just the dominant weight, which mutation can change
  livingAndCredit(W); peopleChange(W); fashionStep(W);
  socialPhase(W); aiSocial(W);
  passPhase(W);
  if (cfg.games) { tokenMarket(W, 'ticket'); gamePhase(W); }
  auctionPhase(W);
  bids = W.cards.map(() => []); asks = W.cards.map(() => []);
  const order = W.bots.slice().sort(() => W.rand() - 0.5);
  for (const b of order) b.kind === 'ai' ? aiOrders(W, b) : act(W, b);
  if (cfg.outsideCollectors) for (const c of W.cards) { if (c.on === false) continue; const fx = W.fashion ? W.fashion[c.fam] || 0 : 0; if (W.rand() < 0.05 * Math.exp(fx)) bids[c.id].push({ b: null, p: c.F * lerp(0.85, 1.08, W.rand()) * Math.exp(0.5 * fx) }); }
  for (const [id, q] of W.liq) for (let k = 0; k < Math.min(q, 4); k++) asks[id].push({ b: 'liq', p: W.cards[id].P * 0.8 });
  // Forced sellers (margin calls, bills they can't pay) dump cards at a discount
  for (const b of W.bots) if (b.forced > 0) { const pend = new Map(); let need = b.forced; for (const id of [...b.h.keys()].sort((x, y) => W.cards[y].P - W.cards[x].P)) { if (need <= 0) break; const c = W.cards[id]; const q = b.h.get(id); for (let k = 0; k < q && need > 0; k++) { ask(b, c, c.P * 0.88, pend); need -= c.P * 0.88; } } }
  clear(W);
  // Sale proceeds of a bot under a margin call go to its lender first
  for (const b of W.bots) if (b.forced > 0 && b.debt > 0) { for (const L of (W.loans || []).filter((L) => L.borrower === b)) { if (b.cash <= 0) break; W.credit.repaid += repayLoan(W, L, b.cash); } b.forced = 0; }
  for (const b of W.bots) { b.nwh.push(worth(W, b)); if (b.nwh.length > 12) b.nwh.shift(); b.pending = null; b.pendingShares = []; b.acceptAll = false; }
  detect(W);
  if (W.t % cfg.weeksPerGeneration === 0) generationEnd(W);
  for (const b of W.bots.slice()) if (b.kind === 'ai' && b.lifespanW && W.t - b.born >= b.lifespanW) aiSuccession(W, b);
  record(W);
}
function clear(W) {
  const cfg = W.cfg; let trades = 0;
  W.arcsWeek = [];
  W.fills = new Map(); // bot id -> [{player, side, price}] this week (AI observations)
  const fill = (b, c, side, price) => { if (!b || b === 'liq' || b.kind !== 'ai') return; if (!W.fills.has(b.id)) W.fills.set(b.id, []); W.fills.get(b.id).push({ player: c.key, side, price: +price.toFixed(2) }); };
  for (const c of W.cards) {
    const B = bids[c.id], A = asks[c.id]; let done = 0;
    const P0 = c.P, lim = cfg.priceLimit > 0 ? [P0 * (1 - cfg.priceLimit), P0 * (1 + cfg.priceLimit)] : [0, Infinity];
    if (cfg.store && c.pool > 0) for (let k = 0; k < Math.min(3, c.pool); k++) A.push({ b: 'store', p: c.F * (1 + cfg.storePremium) });
    c.wk = { o: P0, h: P0, l: P0, v: 0 };
    B.sort((x, y) => y.p - x.p); A.sort((x, y) => x.p - y.p);
    c.book = { bids: B.slice(0, 6).map((o) => [r2(o.p), o.b ? (o.b === 'liq' ? 'liquidator' : o.b.name) : 'outside']), asks: A.slice(0, 6).map((o) => [r2(o.p), o.b === 'store' ? 'Vault store' : o.b === 'liq' ? 'liquidator' : o.b.name]) };
    if (B.length && A.length) {
      const m = []; let i = 0, j = 0;
      while (i < B.length && j < A.length && B[i].p >= A[j].p) { if (B[i].b && B[i].b === A[j].b) { j++; continue; } m.push([B[i], A[j]]); i++; j++; }
      if (m.length) {
        const last = m[m.length - 1], price = clamp((last[0].p + last[1].p) / 2, lim[0], lim[1]);
        for (const [bd, ak] of m) {
          if (bd.p < price || ak.p > price) continue; // the price limit kept this pair from crossing
          const buyer = bd.b, seller = ak.b; bd.used = ak.used = true;
          if (buyer && buyer.cash < price) continue;
          if (seller === 'liq') { const q = W.liq.get(c.id) || 0; if (!q) continue; q > 1 ? W.liq.set(c.id, q - 1) : W.liq.delete(c.id); }
          else if (seller === 'store') { if (c.pool < 1) continue; c.pool--; c.circ++; W.house.store = (W.house.store || 0) + price; W.treasury += price; packCache = null; }
          else { if ((seller.h.get(c.id) || 0) < 1) continue; give(seller, c, -1); seller.cash += price * (1 - cfg.fee); W.house.fees += price * cfg.fee; W.treasury += price * cfg.fee; fill(seller, c, 'sell', price); flowIn(W, seller, price * (1 - cfg.fee)); sellLot(W, seller, c, price * (1 - cfg.fee)); }
          if (buyer) { buyer.cash -= price; give(buyer, c, 1); fill(buyer, c, 'buy', price); flowOut(W, buyer, price); addLot(buyer, c, price, W.t); } else { c.circ--; W.house.outside += price; }
          c.wk.h = Math.max(c.wk.h, price); c.wk.l = Math.min(c.wk.l, price); c.wk.v++;
          jot(W, { type: 'trade', card: c.key, price: r2(price), buyer: buyer ? buyer.name : 'outside collector', seller: seller === 'liq' ? 'liquidator' : seller === 'store' ? 'Vault store' : seller.name });
          done++;
          if (W.arcsWeek.length < 60 && buyer && seller !== 'liq' && seller !== 'store' && W.rand() < 0.5) W.arcsWeek.push([seller.id, buyer.id]);
        }
        if (done) c.P = price;
      }
    }
    // Quote pressure: unfilled bids above the price (or asks below it) move the quote even without a trade.
    let topBid = 0, lowAsk = Infinity;
    for (const o of B) if (!o.used && o.p > topBid) topBid = o.p;
    for (const o of A) if (!o.used && o.p < lowAsk) lowAsk = o.p;
    if (topBid > c.P) c.P = lerp(c.P, topBid, cfg.quotePull); else if (lowAsk < c.P) c.P = lerp(c.P, lowAsk, cfg.quotePull);
    c.P = clamp(c.P, lim[0], lim[1]);
    (c.ohlc ||= []).push([r2(c.wk.o), r2(Math.max(c.wk.h, c.P)), r2(Math.min(c.wk.l, c.P)), r2(c.P), c.wk.v]); if (c.ohlc.length > 120) c.ohlc.shift();
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
  if (cfg.royalties && !cfg.priceOnly) { let owed = 0; for (const b of W.bots) for (const [id, q] of b.h) owed += cfg.royaltyRate * W.cards[id].F * q;
    const scaleR = cfg.closedEconomy ? Math.min(1, (W.treasury * 0.5) / Math.max(1, owed)) : 1; let paid = 0;
    for (const b of W.bots) for (const [id, q] of b.h) { const d = cfg.royaltyRate * W.cards[id].F * q * scaleR; b.cash += d; b.exo = (b.exo || 0) + d; paid += d; }
    if (cfg.closedEconomy) W.treasury -= paid; W.house.royalties += paid; log(W, 'gen', `Generation ${gen} royalties: ${Math.round(paid).toLocaleString()} coins to card holders (${Math.round(cfg.royaltyRate * 100)}% of each card's hidden value).`); }
  for (const b of W.bots) b.seasons++;
  // Fitness: return on the capital the bot started the generation with, from its own decisions only (allowance,
  // royalties and living costs are removed, since no bot chose them)
  const rule = W.bots.filter((b) => b.kind === 'rule');
  for (const b of rule) { const start = Math.max(50, b.genStart ?? worth(W, b)); b.roc = (worth(W, b) - (b.exo || 0)) / start - 1; b.rocHist = [...(b.rocHist || []), b.roc].slice(-10); }
  if (cfg.evolve && rule.length > 4) {
    const ranked = rule.slice().sort((x, y) => y.roc - x.roc), n = Math.max(1, Math.round(ranked.length * cfg.evolveShare));
    const best = ranked.slice(0, n), worst = ranked.slice(-n);
    for (const b of worst) { const m = W.pick(best); const before = ARCH[b.a].label; b.g = mutate(W, m.g); b.a = styleOf(b.g.w); b.gen = m.gen + 1; b.lineage = m.lineage ?? m.id; b.adopted = (b.adopted || 0) + 1; jot(W, { type: 'adopted', bot: b.name, from: m.name, before, after: ARCH[b.a].label, roc: r2(b.roc), mentorRoc: r2(m.roc) }); }
    const kinds = (xs) => Object.entries(xs.reduce((o, b) => ((o[ARCH[b.a].label] = (o[ARCH[b.a].label] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ');
    log(W, 'evolve', `Generation ${gen}: best returns ${best.slice(0, 3).map((b) => `${b.name} ${b.roc >= 0 ? '+' : ''}${Math.round(b.roc * 100)}%`).join(', ')}. The ${n} worst-returning bots adopt their strategies and keep their own capital (now ${kinds(worst)}).`);
  }
  if (cfg.mortality) {
    let died = 0, born = 0;
    for (const b of rule) {
      if (b.lifespan == null) b.lifespan = cfg.lifespan[0] + Math.floor(W.rand() * (cfg.lifespan[1] - cfg.lifespan[0] + 1));
      if (b.seasons < b.lifespan) continue;
      const heirs = Array.from({ length: cfg.heirs }, () => { const h = newBot(W, null, b); h.cash = 0; h.lineage = b.lineage ?? b.id; h.lifespan = cfg.lifespan[0] + Math.floor(W.rand() * (cfg.lifespan[1] - cfg.lifespan[0] + 1)); return h; });
      settleEstate(W, b, heirs); died++; born += heirs.length;
    }
    // Too many heirs: the poorest leave the market (their cards are sold, their loans settled)
    const cap = Math.round(cfg.population * cfg.populationCap);
    const poorest = W.bots.filter((b) => b.kind === 'rule').map((b) => [b, worth(W, b)]).sort((x, y) => x[1] - y[1]);
    let out = 0; while (W.bots.filter((b) => b.kind === 'rule').length > cap && poorest.length) { removeBot(W, poorest.shift()[0], 'priced out'); out++; }
    if (died) log(W, 'evolve', `Generation ${gen}: ${died} bots die of old age; their estates pass to ${born} heirs carrying their strategies${out ? `, and ${out} of the poorest bots leave the market` : ''}.`);
  }
  for (const b of W.bots) { b.genStart = worth(W, b); b.exo = 0; }
}
// An estate passes to heirs in equal shares: cash, every card copy (with its cost), loans in both directions, notes
function settleEstate(W, b, heirs) {
  const k = heirs.length;
  for (const h of heirs) { h.cash = b.cash / k; h.notes = new Map(b.notes); h.friends = new Set(b.friends); h.flags = new Set(b.flags); h.social = b.social; h.gen = b.gen + 1; W.bots.push(h); }
  let i = 0;
  for (const [id, q] of b.h) { const lots = b.lots?.get(id) || []; for (let u = 0; u < q; u++) { const h = heirs[i++ % k]; give(h, W.cards[id], 1); addLot(h, W.cards[id], lots[u]?.[0] ?? W.cards[id].F, lots[u]?.[1] ?? W.t); } }
  for (const L of W.loans || []) {
    if (L.lender === b) { const h = heirs[i++ % k]; L.lender = h; h.lent = (h.lent || 0) + L.amount; }
    if (L.borrower === b) { const h = heirs[i++ % k]; L.borrower = h; h.debt = (h.debt || 0) + L.amount; }
  }
  for (const h of heirs) { h.nwh = [worth(W, h)]; h.genStart = h.nwh[0]; }
  W.bots = W.bots.filter((x) => x !== b);
  for (const x of W.bots) { if (x.flags.delete(b.id)) for (const h of heirs) x.flags.add(h.id); if (x.friends.delete(b.id)) for (const h of heirs) x.friends.add(h.id); }
  jot(W, { type: 'died', bot: b.name, age: b.seasons, estate: r2(heirs.reduce((s, h) => s + worth(W, h), 0)), heirs: heirs.map((h) => h.name) });
}
// A bot leaving the market: its cards go to the liquidator; loans it made are forgiven, loans it owes default
export function removeBot(W, b, reason) {
  const w = worth(W, b);
  for (const [id, q] of b.h) W.liq.set(id, (W.liq.get(id) || 0) + q);
  for (const L of W.loans || []) {
    if (L.lender === b && L.amount > 0) { L.borrower.debt -= L.amount; L.amount = 0; }
    if (L.borrower === b && L.amount > 0) { L.lender.lent -= L.amount; L.amount = 0; }
  }
  W.bots = W.bots.filter((x) => x !== b);
  for (const x of W.bots) { x.flags.delete(b.id); x.friends.delete(b.id); }
  jot(W, { type: 'exited', bot: b.name, kind: ARCH[b.a].label, worth: r2(w), reason });
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
  const ids = new Set([...hot.slice(0, marketRows).map((c) => c.id), ...b.h.keys(), ...b.notes.keys()].filter((id) => W.cards[id].on !== false));
  const others = W.bots.filter((x) => x !== b).sort((x, y) => worth(W, y) - worth(W, x)).slice(0, 12).map((x) => ({ name: x.name, kind: ARCH[x.a].label, notes: x.notes.size, friendsWithYou: x.friends.has(b.id), flaggedYou: x.flags.has(b.id) }));
  return {
    week: W.t + 1, generation: Math.floor(W.t / W.cfg.weeksPerGeneration) + 1, season: W.seasonLabel || W.timeline?.seasons[0].season || null,
    you: { name: b.name, ...(b.kind === 'ai' && b.lifespanW ? { ageWeeks: W.t - b.born, lifespanWeeksRange: W.cfg.aiLifespanWeeks, generationOfYourLine: b.line || 1 } : {}), cash: r2(b.cash), worth: r2(worth(W, b)), debt: r2(b.debt || 0), lentOut: r2(b.lent || 0), borrowLimit: r2(W.cfg.credit ? Math.max(0, W.cfg.maxLTV * holdingsValue(W, b) - (b.debt || 0)) : 0), creditMarketRate: W.credit?.rate ?? null, yourLoans: (W.loans || []).filter((L) => L.borrower === b || L.lender === b).slice(0, 12).map((L) => ({ role: L.borrower === b ? 'borrowed' : 'lent', with: (L.borrower === b ? L.lender : L.borrower).name, amount: r2(L.amount), weeklyRate: L.rate, dueWeek: L.due })), livingCostNextWeek: r2(W.cfg.livingCost + W.cfg.lifestyle * Math.max(0, worth(W, b))), researchPasses: b.passes.filter((e) => e > W.t + 1).length + W.cfg.passesPerWeek, notesKept: b.notes.size, botsThatFlaggedYou: W.bots.filter((x) => x.flags.has(b.id)).length, friends: [...b.friends].map((id) => W.bots.find((x) => x.id === id)?.name).filter(Boolean), memo: b.memo },
    lastWeek: { yourFills: W.fills?.get(b.id) || [], researchResults: b.inbox || [], lastSteal: b.lastSteal || null },
    market: [...ids].map((id) => row(W.cards[id])).sort((x, y) => y.trades4w - x.trades4w),
    packs: { price: r2(pk.price), cardsPerPack: W.cfg.packSize, cardsLeftInPool: pk.tot },
    researchPassMarket: { lastPrice: W.passPrice === null ? null : r2(W.passPrice), tradedLastWeek: W.passTrades },
    gameTicketMarket: { lastPrice: W.ticketPrice === null ? null : r2(W.ticketPrice), tradedLastWeek: W.ticketTrades, yourTickets: b.tickets.length },
    auctions: { open: W.auctions.filter((a) => a.seller !== b).map((a) => ({ auctionId: a.id, player: W.cards[a.cardId].key, reserve: a.reserve, seller: a.seller.name, lastTraded: r2(W.cards[a.cardId].P) })), yours: W.auctions.filter((a) => a.seller === b).map((a) => ({ auctionId: a.id, player: W.cards[a.cardId].key, reserve: a.reserve })), resultsLastWeek: (W.auctionResults || []).filter((r) => r.seller === b.name || r.winner === b.name) },
    games: W.cfg.games && W.contests ? (() => { const fmtC = (cs) => Object.fromEntries(Object.entries(cs || {}).filter(([, c]) => c.questions.length).map(([g, c]) => [g, { name: GAMES[g].label, skill: GAMES[g].skill, answerFormat: GAMES[g].answer, topic: c.topic, questions: c.questions.map((q) => q.text) }])); return { stakeCoins: W.cfg.gameStake, prizePoolLastWeek: r2(W.prizePool || 0), ticketsHeld: b.tickets.filter((e) => e > W.t + 1).length + W.cfg.gameTickets, lastWeek: b.gameResults || [], answerThisWeek: fmtC(W.contests), comingInTwoWeeks: fmtC(W.contestsAhead) }; })() : null,
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
  const bots = W.bots.map((b) => [b.id, b.a, b.name, Math.round(worth(W, b)), b.n, SOCIAL.indexOf(b.social), b.flaggedBy, Math.round(b.cash), b.notes.size, b.kind === 'ai' ? 1 : 0, b.gen, b.model || '', b.seasons, b.roc == null ? null : Math.round(b.roc * 1000) / 1000, b.lineage ?? b.id]);
  const hotNow = W.cards.slice().sort((x, y) => recentVol(y, 20) - recentVol(x, 20)).slice(0, 6).map((c) => [c.id, r1(c.P), r1(c.F), recentVol(c, 20), c.circ, c.pool]);
  const f = {
    t: W.t,
    h: { p: L(h.p), f: L(h.f), bub: L(h.bub), gini: L(h.gini), share: L(h.share), trades: L(h.trades), money: Math.round(L(h.money)), pass: L(h.pass), informed: L(h.informed), flags: L(h.flags), shares: L(h.shares), thefts: L(h.thefts), gamePacks: L(h.gamePacks) },
    bots, arcs: W.arcsWeek.slice(), hot: hotNow,
    events: W.events.filter((e) => e.t === W.t),
    researched: [...W.week.researched].sort((a, b) => b[1] - a[1]).slice(0, 5),
    jn: [...W.journal.filter((j) => j.type === 'aiActions' || j.type === 'post' || j.type === 'message'), ...W.journal.filter((j) => !['aiActions', 'post', 'message'].includes(j.type) && (j.type !== 'game' || j.packs > 0)).slice(-30)].slice(-40),
    tickets: W.ticketPrice,
    gs: W.gameStats ? Object.fromEntries(Object.entries(W.gameStats).map(([g, x]) => [g, [x.entrants, x.pot, x.entrants ? r2(x.scoreSum / x.entrants) : null, x.skillN ? r2(x.skillSum / x.skillN) : null]])) : null,
    garch: W.gameArch ? W.gameArch.map(([e, w, net]) => [e, w, Math.round(net)]) : null,
    topics: W.contests ? Object.fromEntries(Object.entries(W.contests).map(([g, c]) => [g, c.topic])) : null,
    season: W.seasonLabel || W.timeline?.seasons[0].season || null,
    lender: W.lender ? { ltv: r2(W.lender.ltv), rate: Math.round(W.lender.rate * 10000) / 10000 } : null,
    fashion: W.fashion ? W.fashion.map((x) => r2(x)) : null,
    genome: genomeMix(W),
    lineages: lineageStats(W),
    people: W.turnover || null,
    mkt: marketStats(W),
    flow: W.flow ? { net: W.flow.net.map(Math.round), realized: W.flow.realized.map(Math.round), trips: W.flow.trips, tax: Math.round(W.flow.tax), paidOut: Math.round(W.flow.paidOut) } : null,
    movers: movers(W),
    fam: famBubble(W),
    hold: holdings(W),
    house: { fees: Math.round(W.house.fees), packs: W.house.packs, gamePacks: W.house.gamePacks || 0 },
  };
  if (full) {
    f.vol = W.cards.map((c) => c.wk?.v || 0);
    f.aiDetail = Object.fromEntries(W.bots.filter((b) => b.kind === 'ai').map((b) => [b.name, { cash: Math.round(b.cash), debt: Math.round(b.debt || 0), realized: Math.round(b.stats.realized || 0), positions: [...b.h].map(([id, q]) => [id, q, r1(avgCost(b, id) ?? 0)]), notes: [...b.notes].map(([id, n]) => [id, r1(n.est), n.week]) }]));
    f.aiLog = W.journal.filter((j) => WHO.some((k) => typeof j[k] === 'string' && W.bots.find((b) => b.kind === 'ai' && b.name === j[k])));
    f.prices = W.cards.map((c) => r1(c.P)); if (W.t === 0 || (W.cfg.leagueUpdates && W.t % W.cfg.updateEvery === 0)) f.values = W.cards.map((c) => r1(c.F)); }
  return f;
}

// Price ÷ hidden value per family (by circulating supply), and the value each strategy holds in each family.
function famBubble(W) {
  const a = W.families.map(() => 0), b = W.families.map(() => 0);
  for (const c of W.cards) { a[c.fam] += c.P * c.circ; b[c.fam] += c.F * c.circ; }
  return a.map((x, i) => (b[i] ? Math.round((x / b[i]) * 1000) / 1000 : null));
}
function holdings(W) {
  const m = ARCH.map(() => W.families.map(() => 0));
  for (const b of W.bots) for (const [id, q] of b.h) { const c = W.cards[id]; m[b.a][c.fam] += q * c.P; }
  return m.map((row) => row.map((v) => Math.round(v)));
}

// Families (the site's play-style clusters), ordered by position then size. The page uses the same list.
export function familyList(library) {
  const ORDER = ['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL'], key = (p) => `${p.family || p.pos}|${p.pos}`;
  const n = {}; library.players.forEach((p) => (n[key(p)] = (n[key(p)] || 0) + 1));
  return Object.keys(n).sort((a, b) => { const [, pa] = a.split('|'), [, pb] = b.split('|'); return ORDER.indexOf(pa) - ORDER.indexOf(pb) || n[b] - n[a] || a.localeCompare(b); }).map((k) => { const [name, pos] = k.split('|'); return { name, pos, n: n[k] }; });
}
export const familyIndex = (fams, p) => fams.findIndex((f) => f.name === (p.family || p.pos) && f.pos === p.pos);

function marketStats(W) {
  let mcap = 0, vcap = 0, cards = 0; for (const c of W.cards) { mcap += c.P * c.circ; vcap += c.F * c.circ; cards += c.circ; }
  const cash = W.bots.map((b) => b.cash).sort((a, b) => b - a), tot = cash.reduce((a, b) => a + b, 0) || 1, k = Math.max(1, Math.round(cash.length * 0.1));
  return { rate: W.credit?.rate ?? null, defaults: W.credit?.defaults || 0, debt: Math.round(totalDebt(W)), calls: W.credit?.calls || 0, broke: W.living?.broke || 0, spent: Math.round(W.living?.spent || 0), mcap: Math.round(mcap), vcap: Math.round(vcap), cards, cash: Math.round(tot), cashTop10: Math.round((cash.slice(0, k).reduce((a, b) => a + b, 0) / tot) * 1000) / 1000, treasury: Math.round(W.treasury), bank: Math.round((W.bankRate ?? 1) * 100) / 100 };
}
function movers(W) {
  const rows = W.cards.filter((c) => recentVol(c, 4) >= 2 && c.Ph.length > 4).map((c) => [c.id, Math.round(c.P * 100) / 100, Math.round(ret(c, 4) * 1000) / 1000, recentVol(c, 4)]);
  rows.sort((a, b) => b[2] - a[2]);
  return { up: rows.slice(0, 8), down: rows.slice(-6).reverse() };
}

/* ---------- The forces that keep a real market from settling ---------- */
// 1. News: the save's REAL history. The world starts at the first real season; every seasonWeeks the next real season
//    arrives with the real hidden values, OVR, grades, Career Legacy and career totals, and real rookies enter the
//    pool. Library pages and game questions only ever show the current era. After the last real season, each player's
//    value moves by a ratio drawn from the real season-to-season changes of players at his position.
function eraFrom(row) {
  const [value, ovr, skill, grade, legacy, totals] = row, g = totals.g || 0;
  const perGame = {}; if (g) for (const [k, v] of Object.entries(totals)) if (k !== 'g' && typeof v === 'number' && !/rings|mvp|opoy|dpoy|roty|sbmvp/i.test(k)) perGame[`${k} per game`] = Math.round((v / g) * 1000) / 1000;
  return { on: true, value, ovr, skill, grade, legacy, totals, perGame };
}
function realRatios(T) {
  const out = {};
  for (let i = 1; i < T.seasons.length; i++) for (const [k, row] of Object.entries(T.seasons[i].players)) { const prev = T.seasons[i - 1].players[k]; if (prev && prev[0] > 0 && row[0] > 0) (out[k.slice(0, 2)] ||= []).push(Math.log(row[0] / prev[0])); }
  // Centred on zero: keep the real spread of winners and losers (log changes), drop the upward drift of careers still
  // being built. sd is each position's spread, for the drawn seasons' pull back (nextSeason).
  for (const pos of Object.keys(out)) { const m = out[pos].reduce((a, b) => a + b, 0) / out[pos].length; out[pos] = out[pos].map((x) => x - m); }
  out.sd = Object.fromEntries(Object.entries(out).map(([pos, xs]) => [pos, Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length)]));
  return out;
}
// How far a drawn season pulls each value back toward its last real one. Without it the draws compound: a log change
// averaging zero still grows the average value by exp(sd²/2) a season (16% for linemen, about 400× in 40 seasons).
const PULL = 0.25;
export function startTimeline(W) {
  const T = W.library.timeline; if (!T || !W.cfg.history) return false;
  W.timeline = T; W.seasonIx = 0; W.ratios = realRatios(T); W.era = {};
  const first = T.seasons[0].players;
  for (const c of W.cards) {
    const row = first[c.key];
    if (!row) { c.on = false; c.circ = 0; c.pool = 0; c.S0 = 0; W.era[c.id] = { on: false }; continue; }
    W.era[c.id] = eraFrom(row); c.F = W.cfg.valueModel === 'ovrWalk' ? Math.max(1, row[1] || 60) : Math.max(1, row[0] / 20); c.P = c.F; c.P0 = c.F; c.Ph = [c.F];
    c.S0 = Math.max(2, Math.round(40 / Math.sqrt(Math.max(0.5, row[0] / 100)))); c.circ = 0; c.pool = c.S0 * W.cfg.poolMultiplier; c.on = true;
  }
  return true;
}
function nextSeason(W) {
  const T = W.timeline; W.seasonIx++;
  const real = W.seasonIx < T.seasons.length, label = real ? T.seasons[W.seasonIx].season : `Y${88 + W.seasonIx - T.seasons.length + 1}`;
  const moves = [], rookies = [];
  for (const c of W.cards) {
    const walk = W.cfg.valueModel === 'ovrWalk', before = walk ? (W.era[c.id]?.ovr || 60) : c.F;
    if (real) {
      const row = T.seasons[W.seasonIx].players[c.key]; if (!row) continue;
      W.era[c.id] = eraFrom(row);
      if (walk) { if (c.on === false) c.F = Math.max(1, row[1] || 60); } // the walk keeps going; only OVR (the odds) changes
      else c.F = Math.max(1, row[0] / 20);
      if (c.on === false) { c.on = true; c.P = W.cfg.priceOnly ? openingPrice(W, c) : c.F; c.Ph = [c.P]; c.pool = Math.max(2, Math.round(40 / Math.sqrt(Math.max(0.5, row[0] / 100)))) * W.cfg.poolMultiplier; rookies.push(c); continue; }
    } else {
      if (c.on === false) continue;
      if (W.cfg.priceOnly || walk) continue; // nothing to draw: price-only has no value, the OVR walk moves weekly
      // Mean-reverting in log terms around the last real value, aimed sd²/2 low so the average value stays put
      const anchor = ((W.anchorF ||= {})[c.id] ??= c.F), sd = W.ratios.sd[c.pos] || 0, v = (sd * sd) / (2 * PULL - PULL * PULL);
      const target = Math.log(anchor) - v / 2, lf = Math.log(c.F);
      c.F = Math.max(1, Math.exp(lf + PULL * (target - lf) + W.pick(W.ratios[c.pos] || [0])));
    }
    moves.push([c, walk ? (W.era[c.id]?.ovr || 60) / before : c.F / before]);
  }
  moves.sort((a, b) => b[1] - a[1]); packCache = null;
  const fmtM = ([c, k]) => `${c.pos} ${c.name} ${k >= 1 ? '+' : '−'}${Math.round(Math.abs(k - 1) * 100)}%`;
  log(W, 'season', `${label} ${real ? 'arrives (real results)' : 'arrives (drawn from real season-to-season changes)'}: ${moves.length ? `${W.cfg.valueModel === 'ovrWalk' ? 'biggest OVR risers' : 'biggest risers'} ${moves.slice(0, 3).map(fmtM).join(', ')}; fallers ${moves.slice(-2).map(fmtM).join(', ')}.` : ''}${rookies.length ? ` ${rookies.length} rookies enter the packs: ${rookies.slice(0, 5).map((c) => `${c.pos} ${c.name}`).join(', ')}${rookies.length > 5 ? '…' : ''}.` : ''} Every note on these players is now out of date.`);
  W.seasonLabel = label;
}

// 2. People change: newcomers arrive faster after rallies (and are mostly speculators, as in real hype cycles), each
//    bringing outside money; bots that lose most of their peak worth give up, and a few retire, selling everything.
function poisson(W, lam) { let k = 0, p = Math.exp(-lam), s = p, u = W.rand(); while (u > s && k < 20) { k++; p *= lam / k; s += p; } return k; }
function peopleChange(W) {
  const cfg = W.cfg; if (!cfg.turnover) return;
  // Neutral turnover: newcomers with random genomes arrive at a steady rate; bots that lose 70% of their peak quit
  const n = poisson(W, cfg.entryRate); let joined = 0, left = 0;
  for (let k = 0; k < n; k++) { const b = newBot(W, null); b.cash = cfg.startCash * Math.exp(W.gauss() * 0.5); b.nwh = [b.cash]; b.joined = W.t; W.bots.push(b); joined++; jot(W, { type: 'entered', bot: b.name, kind: ARCH[b.a].label, cash: r2(b.cash) }); }
  for (const b of W.bots.slice()) {
    if (b.kind !== 'rule') continue;
    const w = worth(W, b); b.peak = Math.max(b.peak || 0, w);
    if (!(w < 0.3 * b.peak && W.t - (b.joined ?? 0) > 20 && W.rand() < 0.25) && !(W.rand() < 0.002)) continue;
    removeBot(W, b, w < 0.3 * b.peak ? 'gave up after heavy losses' : 'retired'); left++;
  }
  W.turnover = { joined, left };
}

// 3. Credit cycles: lenders tighten after margin calls and defaults (lower limits, higher rates) and loosen in calm,
//    rising markets. An insolvent bot defaults: its loan is written off (those coins vanish) and its cards are sold.
function lenderCycle(W) {
  const cfg = W.cfg, L = (W.lender ||= { ltv: cfg.maxLTV, rate: cfg.interest, stress: [] });
  const c = W.credit || {}; L.stress.push((c.calls || 0) + 3 * (c.defaults || 0)); if (L.stress.length > 4) L.stress.shift();
  if (!cfg.lenderCycle) { L.ltv = cfg.maxLTV; L.rate = cfg.interest; return; }
  const s = L.stress.reduce((a, b) => a + b, 0), ph = W.hist.p, r8 = ph.length > 8 ? ph[ph.length - 1] / ph[ph.length - 9] - 1 : 0;
  const before = L.ltv;
  if (s > 3) { L.ltv = Math.max(0.15, L.ltv * 0.9); L.rate = Math.min(0.012, L.rate * 1.2); }
  else if (s === 0 && r8 > 0) { L.ltv = Math.min(cfg.maxLTV * 1.35, L.ltv * 1.02); L.rate = Math.max(cfg.interest * 0.4, L.rate * 0.97); }
  if (before - L.ltv > 0.04 && !(W.cool.tight > W.t)) { log(W, 'credit', `Lenders tighten after ${s} margin calls and defaults: borrowing limit down to ${Math.round(L.ltv * 100)}% of card value, interest up to ${(L.rate * 100).toFixed(2)}% a week.`); W.cool.tight = W.t + 8; }
  if (L.ltv - before > 0 && L.ltv > cfg.maxLTV * 1.2 && !(W.cool.loose > W.t)) { log(W, 'credit', `Easy credit: lenders now lend up to ${Math.round(L.ltv * 100)}% of card value at ${(L.rate * 100).toFixed(2)}% a week.`); W.cool.loose = W.t + 20; }
}

// 4. Fashion: each family's popularity with outside collectors drifts, sometimes jumps on hype or slumps, and feeds
//    on its own recent price gains. Collectors bid more often, and higher, for what is in fashion.
function fashionStep(W) {
  const cfg = W.cfg; if (!cfg.fashion) return;
  const F = (W.fashion ||= W.families.map(() => 0));
  const fb = famBubble(W), prev = W.famPrev || fb; W.famPrev = fb;
  for (let i = 0; i < F.length; i++) {
    const mom = prev[i] && fb[i] ? clamp(fb[i] / prev[i] - 1, -0.2, 0.2) : 0;
    F[i] = 0.96 * F[i] + W.gauss() * 0.05 + 1.5 * mom;
    if (W.rand() < 0.003) { F[i] += 0.6; log(W, 'fashion', `Fashion: collectors suddenly want ${W.families[i].pos} ${W.families[i].name} cards.`); }
    else if (W.rand() < 0.002) { F[i] -= 0.5; log(W, 'fashion', `Fashion: collectors lose interest in ${W.families[i].pos} ${W.families[i].name} cards.`); }
    F[i] = clamp(F[i], -1.2, 1.5);
  }
}

// Lineages: families of bots descended from one founder. How many survive, how deep they go, how much the largest holds
function lineageStats(W) {
  const by = new Map(); for (const b of W.bots) { if (b.kind !== 'rule') continue; const k = b.lineage ?? b.id; const x = by.get(k) || { n: 0, w: 0, depth: 0 }; x.n++; x.w += worth(W, b); x.depth = Math.max(x.depth, b.gen); by.set(k, x); }
  const xs = [...by.values()], tot = xs.reduce((s, x) => s + x.w, 0) || 1, top = xs.sort((a, b) => b.w - a.w)[0];
  return { count: xs.length, depth: Math.max(0, ...xs.map((x) => x.depth)), topShare: top ? Math.round((top.w / tot) * 1000) / 1000 : 0, topSize: top?.n || 0 };
}

// A rookie's first quote in a price-only world: the median price of cards at his position (no value to start from)
function openingPrice(W, c) { const xs = W.cards.filter((x) => x.on !== false && x.pos === c.pos && x.circ > 0).map((x) => x.P).sort((a, b) => a - b); return xs.length ? xs[Math.floor(xs.length / 2)] : 5; }

// Deal the starting cards: every printed copy goes to a random bot (used at creation, or by the runner once the AI
// bots of an all-AI world are seated)
export function endow(W, bots = W.bots) {
  for (const c of W.cards) for (let u = 0; u < c.S0; u++) { const b = W.pick(bots); give(b, c, 1); addLot(b, c, c.F, 0); c.circ++; }
  for (const b of bots) { b.nwh = [worth(W, b)]; b.genStart = b.nwh[0]; }
  packCache = null;
}
// An AI bot's life ends: one heir takes the whole estate (cash, cards, loans, notes, reputation) and the memo, and
// carries on under the same seat (same model), as the next generation of its line
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
function aiSuccession(W, b) {
  const line = (b.line || 1) + 1, base = b.name.replace(/ [IVX]+$/, '');
  const heir = newBot(W, AI, null, { name: `${base} ${ROMAN[line] || line}`, model: b.model, seat: b.seat, social: b.social });
  heir.line = line; heir.born = W.t; const lw = W.cfg.aiLifespanWeeks; heir.lifespanW = lw[0] + Math.floor(W.rand() * (lw[1] - lw[0] + 1));
  heir.memo = `Inherited from ${b.name} (your predecessor, ${W.t - b.born} weeks): ${b.memo || '(no memo)'}`.slice(0, 600);
  heir.lineage = b.lineage ?? b.id;
  settleEstate(W, b, [heir]);
  log(W, 'evolve', `${b.name} reaches the end of its life after ${W.t - b.born} weeks; ${heir.name} inherits ${Math.round(worth(W, heir)).toLocaleString()} coins of estate and its memo.`);
}

// The OVR walk: one tick a week per card in circulation or the pool. Higher OVR, better odds of going up; never certain.
export const ovrOdds = (W, ovr) => clamp(0.5 + ((ovr || 60) - 80) / 50, W.cfg.walkMin, W.cfg.walkMax);
function ovrWalk(W) {
  for (const c of W.cards) {
    if (c.on === false) continue;
    const ovr = W.era?.[c.id]?.ovr ?? W.library.players[c.id].ovr ?? 60;
    c.F = Math.max(1, c.F + (W.rand() < ovrOdds(W, ovr) ? W.cfg.walkStep : -W.cfg.walkStep));
  }
  packCache = null;
}
