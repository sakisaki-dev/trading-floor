// Targeted tests for the AUDIT.md 5b fixes (decisions scripted by code moved to the bots' own decision-makers).
//   node tests/nets.test.mjs
// Each test builds a small world, sets up one situation and checks that the old scripted behaviour is gone.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import assert from 'node:assert/strict';
import * as E from '../engine.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), d = path.join(here, '..', 'data'), rd = (f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
const lib = rd('library.json'); lib.timeline = rd('timeline.json'); for (const k of ['history', 'kits', 'names']) lib[k] = rd(k + '.json');
lib.leagueRates = rd('league_rates.json'); lib.rookieNames = rd('rookie_names.json'); lib.nflAge = rd('nfl_age.json');
const realism = JSON.parse(fs.readFileSync(path.join(here, '..', 'configs', 'realism.json'), 'utf8'));
const T = E.TEST, world = (o = {}) => E.createWorld(lib, { practiceGens: 0, population: 40, leagueFill: 'save', ...o });
let pass = 0; const test = (name, f) => { f(); pass++; console.log('ok', name); };

test('social: a neural bot steals and shares exactly when its outputs say so, with no 0.5 / 0.4 draws', () => {
  const W = world({ seed: 11 }); E.step(W);
  const nn = W.bots.filter((b) => b.g?.nn);
  for (const b of nn) { b._nnSteal = true; b._nnShare = false; b._nnStealW = [0, 0, 0]; b.flags.clear(); }
  W.journal = []; W.week = { shares: 0, thefts: 0, caught: 0, researched: new Map() }; T.socialPhase(W);
  assert.equal(W.journal.filter((j) => j.type === 'steal').length, nn.length, 'every bot whose steal output is on tries once (the old code: about half)');
  for (const b of nn) { b._nnSteal = false; b._nnShare = false; }
  W.journal = []; T.socialPhase(W); assert.equal(W.journal.filter((j) => j.type === 'steal' || j.type === 'share').length, 0, 'outputs off: nothing happens');
  // the victim is the network's pick: a weight on 'a friend of mine' picks the one friend every time
  const [a, f] = nn; a._nnSteal = true; a._nnStealW = [5, 0, 0]; a.friends = new Set([f.id]); W.journal = []; T.socialPhase(W);
  assert.equal(W.journal.find((j) => j.type === 'steal').victim, f.name);
});

test('social: an AI swap offer to a neural bot goes through its own accept output', () => {
  const W = world({ seed: 12 }); E.step(W); const ai = E.addAiBot(W, { name: 'AI test' }), p = W.bots.find((b) => b.g?.nn);
  p.social = 'sharer'; p._nnAccept = false; p.flags.clear(); ai.flags.clear(); ai.notes.set(W.players[0].id, { est: 10, week: W.t });
  ai.socialOut = { share: [p], steal: null }; W.journal = []; T.aiSocial(W);
  assert.equal(W.journal.filter((j) => j.type === 'share').length, 0, 'a sharer-labelled bot whose accept output is off refuses (the old code accepted)');
  p._nnAccept = true; ai.socialOut = { share: [p], steal: null }; T.aiSocial(W);
  assert.equal(W.journal.filter((j) => j.type === 'share').length, 1);
});

test('contests: answers come from the bot\'s notes, not coin flips', () => {
  const W = world({ seed: 13 }); E.step(W); const b = W.bots.find((x) => x.g?.nn); b.g = { ...b.g, err: 0 };
  const ids = W.players.filter((p) => p.on !== false && W.era?.[p.id]?.perGame && Object.keys(W.era[p.id].perGame).length).map((p) => p.id);
  const qs = [], byStat = {}; for (const id of ids) for (const k of Object.keys(W.era[id].perGame)) (byStat[k] ||= []).push(id);
  for (const [k, xs] of Object.entries(byStat)) for (let i = 0; i + 1 < xs.length && qs.length < 40; i += 2) { const a = W.era[xs[i]].perGame[k], c = W.era[xs[i + 1]].perGame[k]; if (a !== c) qs.push({ ids: [xs[i], xs[i + 1]], stat: k, truth: a > c ? 'A' : 'B' }); }
  assert.ok(qs.length >= 20);
  // a bot with exact notes on every player asked (its error 0) answers every one right; the old curve was right 92% of the time at best
  const r0 = W.rand; for (const q of qs) for (const id of q.ids) { const z = 0; b.notes.set(id, { est: 1, week: W.t, z, lib: { pg: { ...W.era[id].perGame }, tot: { ...(W.era[id].totals || {}) }, leg: W.era[id].legacy, fam: W.players[id].fam } }); }
  const ans = T.nnAnswers(W, b, 'higherLower', { questions: qs }); assert.deepEqual(ans, qs.map((q) => q.truth));
  // answering draws nothing from the world's generator when everything asked is noted
  let draws = 0; W.rand = () => { draws++; return r0(); }; T.nnAnswers(W, b, 'higherLower', { questions: qs }); W.rand = r0; assert.equal(draws, 0);
  // a bot with no notes ranks by the public price, the same answer every time
  b.notes.clear(); const a1 = T.nnAnswers(W, b, 'higherLower', { questions: qs }), a2 = T.nnAnswers(W, b, 'higherLower', { questions: qs });
  assert.deepEqual(a1, a2); assert.deepEqual(a1, qs.map((q) => (W.players[q.ids[0]].P >= W.players[q.ids[1]].P ? 'A' : 'B')));
});

test('packs: an AI pack order can name its price', () => {
  const W = world({ seed: 14, packSale: 'auction' }); E.step(W); const ai = E.addAiBot(W, { name: 'AI packs' }); ai.cash = 1e9;
  E.setActions(W, ai, { packs: [{ type: 'standard', count: 1, price: 12345 }] }); W.packBids = []; T.aiOrders(W, ai);
  assert.ok(Math.abs(W.packBids[0].p - 12345) < 1e-6, 'the bid is its own price, not the last clearing price');
});

test('packs: a neural bot\'s pack bids and card bids share one spare-cash budget', () => {
  const W = world({ seed: 15, ...realism, population: 40, botScale: 1, leagueFill: 'save', maxPacks: 50 }); for (let i = 0; i < 3; i++) E.step(W);
  for (const b of W.bots.filter((x) => x.g?.nn)) { b._nnPacks = Object.keys(E.PACK_TYPES).map((t) => [t, 2]); W.packBids = []; T.setBooks(W); T.nnAct(W, b);
    const { bids } = T.books(); let card = 0; for (const xs of bids) for (const o of xs) if (o.b === b) card += o.p; const pk = W.packBids.filter((x) => x.b === b).reduce((s, x) => s + x.p, 0);
    const nw = Math.max(50 * W.cfg.coinScale, E.worth(W, b)), spare = b.cash - b.g.keep * nw; assert.ok(card + pk <= Math.max(0, spare) + 1e-6, `${b.name}: ${card} + ${pk} > ${spare}`); }
});

test('passes: the call auction drops a pair that cannot settle, and prices from one that does', () => {
  const W = world({ seed: 16 }); E.step(W); const mk = (n, cash, passes) => { const b = E.addAiBot(W, { name: n }); b.cash = cash; b.passes = Array(passes).fill(W.t + 5); return b; };
  W.bots = []; const b1 = mk('B1', 1000, 0), b2 = mk('B2', 5, 0), s1 = mk('S1', 0, 3), s2 = mk('S2', 0, 3);
  b1.pending = { passOrders: [{ side: 'buy', price: 100, qty: 1 }] }; b2.pending = { passOrders: [{ side: 'buy', price: 80, qty: 1 }] };
  s1.pending = { passOrders: [{ side: 'sell', price: 20, qty: 1 }] }; s2.pending = { passOrders: [{ side: 'sell', price: 70, qty: 1 }] };
  T.tokenMarket(W, 'pass'); assert.equal(W.passTrades, 1); assert.equal(W.passPrice, 60, 'the old code priced at 75 from the pair B2 (5 coins) could not pay');
});

test('passes and tickets: under priceMap log the bids have no 30 / 15 / 10 / 5 coin wall', () => {
  const W = world({ seed: 17, priceMap: 'log' }); E.step(W); W.passPrice = 1000 * W.cfg.coinScale; W.ticketPrice = 500 * W.cfg.coinScale;
  const med = 1; let over = 0; for (const b of W.bots.filter((x) => x.g?.nn)) { T.nnThink(W, b, med); if (b.g.passBid > 30 * W.cfg.coinScale || b.g.ticketBid > 10 * W.cfg.coinScale) over++; }
  assert.ok(over > 0);
});

test('margin: forced sales for living costs do not sweep cash to the lender', () => {
  const W = world({ seed: 18 }); E.step(W); const [a, l] = W.bots; a.cash = 1000; a.debt = 500; l.lent = 500; W.loans = [{ lender: l, borrower: a, amount: 500, rate: 0.01, due: W.t + 5 }];
  // (merged with fix/mech: settleForced repays from b.fpC, the credit-forced share of the proceeds, traced per sale)
  a.arrears = null; a.fpC = 0; T.settleForced(W); assert.equal(a.debt, 500, 'the old code repaid 500 out of its cash');
  a.fpC = 150; T.settleForced(W); assert.equal(a.debt, 350, 'only the margin share (150) of what the sales raised goes to the lender');
});

test('forced sales: the no-minimum auction stage lists in the network\'s own order', () => {
  const W = world({ seed: 19 }); for (let i = 0; i < 2; i++) E.step(W); T.setBooks(W);
  const b = W.bots.filter((x) => x.g?.nn).sort((x, y) => y.h.size - x.h.size)[0]; assert.ok(b.h.size >= 3);
  const rank = new Map([...b.h.keys()].map((id) => { const o = T.cardNet(W, b, W.cards[id]); return [id, o[1] - o[0]]; })), want = [...b.h.keys()].sort((x, y) => rank.get(y) - rank.get(x));
  b.forced = 1e12; b.forcedBy = { 'living costs': 1e12 }; W.auctions = []; T.forcedSales(W);
  const listed = W.auctions.filter((a) => a.seller === b && !a.uid).map((a) => a.cardId), seen = [...new Set(listed)];
  assert.deepEqual(seen, want.filter((id) => seen.includes(id)), 'the old stage listed in Map insertion order');
});

test('shorts: a called neural borrower bids its network\'s price; the grace weeks and settlement are settings', () => {
  const W = world({ seed: 20, shorting: true, coverGraceWeeks: 5, coverSettle: 1.3 }); for (let i = 0; i < 2; i++) E.step(W); T.setBooks(W);
  const [b, ln] = W.bots.filter((x) => x.g?.nn), c = W.cards.find((x) => x.on !== false && x.P > 0); b.cash = 1e9;
  W.cardLoans = [{ id: c.id, lender: ln, borrower: b, entry: c.P, coll: 0, week: W.t - 1, due: W.t, force: W.t - 4 }];
  T.shortUpkeep(W); const mine = T.books().bids[c.id].filter((o) => o.b === b); assert.equal(mine.length, 1);
  assert.ok(Math.abs(mine[0].p - T.nnPrice(W, b, c, T.cardNet(W, b, c))) < 1e-9 * mine[0].p, 'the old bid was 1.15 × the mark');
  W.cardLoans[0].force = W.t - 5; ln.cash = 0; T.setBooks(W); T.shortUpkeep(W); assert.equal(W.cardLoans.length, 0); assert.ok(Math.abs(ln.cash - c.P * 1.3 - W.cfg.cardLendFee * c.P) < 1e-6 * c.P);
});

test('most-traded list: ranked by plain trade count by default; an AI bot can page it', () => {
  const W = world({ seed: 21 }); for (let i = 0; i < 5; i++) E.step(W);
  const v0 = new Map(W.cards.map((c) => { let s = 0; for (let i = Math.max(0, c.volH.length - 20); i < c.volH.length; i++) s += c.volH[i]; return [c, s]; })); // the list is ranked before the week's first trade
  E.step(W); const h = T.hot(); for (let i = 1; i < h.length; i++) assert.ok(v0.get(h[i - 1]) >= v0.get(h[i]), 'no momentum tilt');
  const ai = E.addAiBot(W, { name: 'AI pager' }), p0 = E.observe(W, ai).market, p1 = E.observe(W, ai, { marketPage: 1 }).market;
  const k0 = new Set(p0.rows.map((r) => r[0])); assert.ok(p0.pages > 1 && p1.page === 1 && p1.rows.some((r) => !k0.has(r[0])), 'page 1 shows cards page 0 does not');
});

test('networks: a bot network from before the partner outputs still loads and runs', () => {
  const W = world({ seed: 22 }); E.step(W); const b = W.bots.find((x) => x.g?.nn), n = T.netSize(T.BOT_SHAPE), h = T.BOT_SHAPE[1] + 1;
  b.g.bot = b.g.bot.slice(0, n - 6 * h); T.nnThink(W, b, 1); assert.equal(b.g.bot.length, n); assert.ok(Array.isArray(b._nnShareW) && b._nnShareW.every(Number.isFinite));
});

console.log(`${pass} tests passed`);
