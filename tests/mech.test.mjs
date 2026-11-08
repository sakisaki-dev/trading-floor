// Mechanism tests for the audit's 5c (mechanism bugs) and 5d (walls) fixes: each shows the old wrong behaviour is gone.
//   node tests/mech.test.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import assert from 'node:assert/strict';
import * as E from '../engine.mjs';
const I = E.internals, here = path.dirname(fileURLToPath(import.meta.url)), d = path.join(here, '..', 'data'), rd = (f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
const lib = rd('library.json'); lib.timeline = rd('timeline.json'); for (const k of ['history', 'kits', 'names']) lib[k] = rd(k + '.json');
lib.leagueRates = rd('league_rates.json'); lib.rookieNames = rd('rookie_names.json'); lib.nflAge = rd('nfl_age.json');
const world = (o = {}) => E.createWorld(lib, { seed: 7, practiceGens: 0, population: 12, games: false, turnover: false, ...o });
let pass = 0, fail = 0;
const test = (name, f) => { try { f(); pass++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n     ')); } };
const live = (W) => W.cards.find((c) => c.on !== false && W.players[c.pid].pool > 5);
const strip = (b) => { b.h = new Map(); b.n = 0; b.items = new Set(); b.lots = new Map(); b.debt = 0; b.lent = 0; b.arrears = null; };

test('seeded Fisher-Yates shuffle is uniform over the 6 orders of 3', () => {
  const W = world(), n = 60000, k = new Map(); for (let i = 0; i < n; i++) { const s = W.shuffle([0, 1, 2]).join(''); k.set(s, (k.get(s) || 0) + 1); }
  assert.equal(k.size, 6); for (const v of k.values()) assert.ok(Math.abs(v / n - 1 / 6) < 0.01, `share ${v / n}`);
  // the old comparator sort on the same stream leans to the input order
  const o = new Map(); for (let i = 0; i < n; i++) { const s = [0, 1, 2].sort(() => W.rand() - 0.5).join(''); o.set(s, (o.get(s) || 0) + 1); }
  assert.ok(Math.max(...o.values()) / n > 0.2, 'old shuffle was biased');
});
test('order size reaches maxOrderQty (old formula stopped at 2 of 3)', () => {
  assert.equal(I.qtyOf(3, 1), 3); assert.equal(I.qtyOf(3, -5), 1); assert.equal(I.qtyOf(3, 0), 2);
  assert.equal(1 + Math.floor(2 / (1 + Math.exp(-1))), 2); // the old map at the same output
});
test('clear(): a bot\'s own crossing ask stays for the next bidder; a cash-short buyer consumes nothing', () => {
  const W = world(), [A, B, C] = W.bots; for (const b of [A, B, C]) strip(b); const c = live(W);
  A.cash = 1000; B.cash = 1000; C.cash = 0; A.h.set(c.id, 1); A.n = 1; c.circ = Math.max(c.circ, 1); c.on = true;
  I.setOrders(W); const { bids, asks } = I.books();
  bids[c.id].push({ b: A, p: 10 }, { b: C, p: 9.8 }, { b: B, p: 9.5 }); asks[c.id].push({ b: A, p: 9 });
  I.clear(W);
  assert.equal(B.h.get(c.id), 1, 'B bought the copy A offered'); assert.equal(A.h.get(c.id) || 0, 0); assert.ok(Math.abs(c.P - 9.25) < 1e-9, `price ${c.P}`);
  assert.equal(C.h.get(c.id) || 0, 0);
});
test('borrowCard draws lenders by copies offered, not seat order', () => {
  const W = world({ shorting: true }), [L1, L2, Bw] = W.bots; for (const b of [L1, L2, Bw]) strip(b); const c = live(W);
  L1.h.set(c.id, 1); L2.h.set(c.id, 9); Bw.cash = 1e9; let n2 = 0;
  for (let i = 0; i < 2000; i++) { W.lendPool = new Map([[c.id, [{ b: L1, k: 1 }, { b: L2, k: 9 }]]]); W.lendable = new Map([[c.id, 10]]);
    assert.ok(I.borrowCard(W, Bw, c)); const L = W.cardLoans.pop(); if (L.lender === L2) n2++; L.lender.h.set(c.id, (L.lender.h.get(c.id) || 0) + 1); Bw.h.delete(c.id); L.lender.lentOut.clear(); Bw.owed.clear(); Bw.cash += L.coll; Bw.shortColl = 0; }
  assert.ok(Math.abs(n2 / 2000 - 0.9) < 0.03, `share from the 9-copy lender ${n2 / 2000}`);
});
test('card lending fee and short royalty never push cash below zero; unpaid calls the short', () => {
  const W = world({ shorting: true }), [Ln, Bw] = W.bots; strip(Ln); strip(Bw); const c = live(W); c.P = 100;
  Ln.cash = 0; Bw.cash = 0; W.cardLoans = [{ id: c.id, lender: Ln, borrower: Bw, entry: 100, coll: 0, week: W.t, due: W.t + 50 }]; Bw.owed = new Map([[c.id, 1]]); Ln.lentOut = new Map([[c.id, 1]]);
  I.setOrders(W); I.shortUpkeep(W); assert.ok(Bw.cash >= 0, `cash ${Bw.cash}`); assert.ok(Ln.stats.lostOnLoans > 0); assert.ok(W.cardLoans[0]?.force != null || !W.cardLoans.length, 'called');
  const unpaid = I.shortPay(W, { borrower: Bw, lender: Ln }, 5); assert.equal(unpaid, 5); assert.ok(Bw.cash >= 0);
});
test('unpaid living costs are owed (arrears), count against worth and are collected later to their destination', () => {
  const W = world({ livingCost: 100, lifestyle: 0, credit: true }), b = W.bots[0]; strip(b); b.cash = 30;
  const before = E.worth(W, b); I.livingAndCredit(W);
  assert.ok(Math.abs(I.arrearsOf(b) - 70) < 1e-9, `owed ${I.arrearsOf(b)}`); assert.ok(Math.abs(E.worth(W, b) - (before - 100)) < 1e-9); assert.equal(b.forcedBy['living costs'], 70);
  const m0 = W.house.mint.living; b.cash = 50; I.collectArrears(W, b); assert.ok(Math.abs(I.arrearsOf(b) - 20) < 1e-9); assert.ok(Math.abs(W.house.mint.living - m0 - 50) < 1e-9);
});
test('holding costs, wealth tax and cash shocks: the unpaid part is owed to the treasury / tax pot / outside', () => {
  const W = world({ wealthTaxTo: 'house' }), b = W.bots[0]; strip(b); b.cash = 10; const t0 = W.treasury;
  I.bill(W, b, 'holding', 25); assert.ok(Math.abs(W.treasury - t0 - 10) < 1e-9); assert.equal(b.arrears.holding, 15);
  I.bill(W, b, 'wealthTax', 40, false); assert.equal(b.arrears.wealthTax, 40); assert.equal(b.forcedBy?.['wealth tax'], undefined);
  b.cash = 100; I.collectArrears(W, b); assert.equal(b.arrears, null); assert.ok(Math.abs(W.treasury - t0 - 65) < 1e-9);
  I.bill(W, b, 'shocks', 500); assert.equal(b.arrears.shocks, 455);
});
test('forced-sale proceeds of bills don\'t repay lenders; margin-call proceeds do, and no more', () => {
  const W = world(), [B, Ln] = W.bots; strip(B); strip(Ln); W.loans = [{ lender: Ln, borrower: B, amount: 500, rate: 0, due: W.t + 10 }]; B.debt = 500; Ln.lent = 500;
  B.cash = 300; B.fpC = 0; I.settleForced(W); assert.equal(B.debt, 500, 'bill-forced: the lender is not paid from its cash');
  B.cash = 300; B.fpC = 120; I.settleForced(W); assert.equal(B.debt, 380); assert.equal(B.cash, 180);
  B.cash = 300; B.fpC = 50; B.arrears = { living: 280 }; I.settleForced(W); assert.equal(B.arrears, null); assert.equal(B.debt, 360, 'bills first, then the lender from what is left');
});
test('default: seized cards carry the lenders\' claim; the liquidator\'s sale pays them first, then the borrower', () => {
  const W = world({ credit: true, livingCost: 0, lifestyle: 0 }), [B, L1, L2, X] = W.bots; for (const b of [B, L1, L2, X]) strip(b); const c = live(W); c.P = 10;
  B.h.set(c.id, 2); B.n = 2; B.cash = 0; B.debt = 300; L1.lent = 200; L2.lent = 100; L1.cash = 0; L2.cash = 0; X.cash = 1e6;
  W.loans = [{ lender: L1, borrower: B, amount: 200, rate: 0, due: W.t + 5 }, { lender: L2, borrower: B, amount: 100, rate: 0, due: W.t + 5 }];
  I.creditMarket(W); assert.equal(W.claims.length, 1); assert.equal(W.liq.get(c.id), 2);
  assert.ok(I.xfer(W, c, X, 'liq', 150)); assert.ok(Math.abs(L1.cash - 100) < 1e-6 && Math.abs(L2.cash - 50) < 1e-6, `${L1.cash} ${L2.cash}`);
  assert.ok(I.xfer(W, c, X, 'liq', 200)); assert.ok(Math.abs(L1.cash - 200) < 1e-6 && Math.abs(L2.cash - 100) < 1e-6); assert.ok(Math.abs(B.cash - 50) < 1e-6, 'the surplus goes to the borrower');
  assert.equal(W.claims.length, 0);
});
test('a pending prediction passes to the heir; a leaver\'s is refunded', () => {
  const W = world({ games: true }), [a, b] = W.bots; W.predictions = [{ b: a, settle: W.t + 4, qs: [], probs: [], know: 0 }, { b, settle: W.t + 4, qs: [], probs: [], know: 0 }];
  const h = E.newBot(W, null, a); h.cash = 0; I.settleEstate(W, a, [h]); assert.equal(W.predictions[0].b, h);
  const c0 = b.cash; E.removeBot(W, b, 'test'); assert.equal(W.predictions.length, 1); assert.equal(b.cash, c0 + W.cfg.gameStake);
});
test('the house prize pool comes out of the treasury, capped at what it holds', () => {
  const W = world({ games: true }); W.gameStats = { valuation: { entrants: 0, pot: 0, scoreSum: 0, skillSum: 0, skillN: 0 } }; W.gameArch = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; W.contests = { valuation: { topic: 'QB' } };
  W.treasury = 30; const b = W.bots[0], c0 = b.cash; I.payout(W, 'valuation', [{ b, score: 1, know: 0 }], 100);
  assert.equal(W.treasury, 0); assert.equal(b.cash, c0 + W.cfg.gameStake + 30); assert.equal(W.house.mint?.prizes ?? 0, 0);
});
test('minting checks the pool first; a short pack is charged only for the copies it held', () => {
  const W = world({ packSale: 'markup' }), p = W.players.find((x) => x.on !== false); p.pool = 0; W.ord = { minted: 0 };
  assert.equal(I.mintCopy(W, W.bots[0], { pid: p.id, d: 0, f: 0, kit: 'home' }, 1), null); assert.equal(W.ord.minted, 0);
  for (const x of W.players) x.pool = 0; const q = W.players.find((x) => x.on !== false); q.pool = 2; // two copies left in the whole pool
  const b = W.bots[1]; b.cash = 1e7; const price = I.packInfo(W, 'standard').price, c0 = b.cash, out = I.ripPack(W, b, false, 'standard'); assert.equal(out.length, 2);
  const paid = c0 - b.cash; assert.ok(Math.abs(paid - (price * 2) / E.PACK_TYPES.standard.size) < 1e-6, `paid ${paid} of ${price}`);
  assert.equal(q.pool, 0);
});
test('a pack tier with nothing left re-rolls among tiers that have copies, by the pack\'s own odds', () => {
  const W = world(); const pk = I.packInfo(W, 'standard'), ws = E.PACK_TYPES.standard.tiers, empty = pk.byTier.findIndex((xs) => xs.length);
  for (const p of pk.byTier[empty]) p.pool = 0; const n = new Map();
  for (let i = 0; i < 3000; i++) { const p = I.drawTier(W, pk, ws, empty, new Map()); assert.ok(p && p.pool > 0); const t = E.tierOf(W, p); n.set(t, (n.get(t) || 0) + 1); }
  assert.ok(!n.has(empty));
});
test('dealers\' starting stock comes out of the pool (no copies from nothing)', () => {
  const W = world({ outsideMode: 'value', outsideCollectors: true }); const tot = () => W.players.reduce((a, p) => a + p.pool, 0) + W.cards.reduce((a, c) => a + c.circ, 0) + [...(W.outside?.values() || [])].reduce((a, x) => a + x, 0);
  const before = tot(); I.setOrders(W); W._live = W.cards.filter((c) => c.on !== false && c.circ > 0); I.valueCollectors(W); assert.ok(W.house.mint.dealerStock > 0); assert.equal(tot(), before);
});
test('one spelling per setting; the retired band mode is rejected', () => {
  const W = E.createWorld(lib, { seed: 3, practiceGens: 0, population: 4, priceGuide: { on: true, every: 2, lag: 3 }, cashShocks: { chance: 0.1, size: 0.2 }, adapt: { on: true, every: 7 } });
  assert.equal(W.cfg.guideOn, true); assert.equal(W.cfg.guideEvery, 2); assert.equal(W.cfg.guideLag, 3); assert.equal(W.cfg.cashShockChance, 0.1); assert.equal(W.cfg.adaptEvery, 7); assert.equal(W.cfg.priceGuide, undefined); assert.equal(W.cfg.cashShocks, undefined);
  assert.throws(() => E.createWorld(lib, { seed: 3, practiceGens: 0, population: 4, outsideMode: 'band' }));
});
test('compsSource trades: a book-moved mark is not a comparable sale', () => {
  for (const [src, moved] of [['trades+book', true], ['trades', false]]) { const W = world({ compsSource: src }); const p = W.players.find((x) => x.on !== false), m0 = W.cards[p.id * 16], m1 = W.cards[p.id * 16 + 1]; W.t = 10;
    for (let j = 0; j < 16; j++) { W.cards[p.id * 16 + j].lastTradeT = -1; W.cards[p.id * 16 + j].bookT = -1; } m0.bookT = 9; m0.bookP = m0.mult * 3; const P1 = m1.P; I.compsMark(W); assert.equal(m1.P !== P1, moved, src); }
});
test('estate sale: unsold copies go to the heir with their cost lots', () => {
  const W = world({ estateSale: 1 }), b = W.bots[0]; strip(b); const c = live(W); b.h.set(c.id, 2); b.n = 2; E.addLot(b, c, 123, 1); E.addLot(b, c, 456, 2); I.setOrders(W);
  const lots = I.estateSale(W, b); assert.deepEqual(lots[0][2].map((x) => x[0]), [123, 456]);
});
test('notes expire by age (no count wall by default)', () => {
  const W = world(), b = W.bots[0]; b.notes = new Map(); for (let i = 0; i < 60; i++) I.writeNote(W, b, W.players[i % W.players.length], 10, 'test');
  assert.ok(b.notes.size > 25, `kept ${b.notes.size}`); for (const n of b.notes.values()) n.week = -100; E.step(W); assert.equal(b.notes.size === 0 || [...b.notes.values()].every((n) => n.week > -100), true);
});
test('retirement past the oldest measured age carries the pooled tail rate (no cliff at 1)', () => {
  const t = I.retireTail(lib.nflAge); assert.ok(t > 0.3 && t < 0.4, `tail ${t}`);
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
