// Targeted tests for the hidden-information and money-accounting fixes (AUDIT.md 5a and 5f, branch fix/info).
// Each check names the old wrong behaviour it rules out. Run: node tests/info.test.mjs (about 3 minutes).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import * as E from '../engine.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..'), rd = (f) => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
const lib = rd('library.json'); lib.timeline = rd('timeline.json'); for (const k of ['history', 'kits', 'names']) lib[k] = rd(k + '.json');
lib.leagueRates = rd('league_rates.json'); lib.rookieNames = rd('rookie_names.json'); lib.nflAge = rd('nfl_age.json');
const realism = JSON.parse(fs.readFileSync(path.join(root, 'configs/realism.json'), 'utf8'));
const world = (set = {}) => E.createWorld(lib, { ...realism, practiceGens: 0, seed: 31761, ...set });
let fails = 0; const ok = (cond, name, detail = '') => { console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`); if (!cond) fails++; };
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

// 1. The source no longer falls back to hidden value for a cost basis (sellLot, settleEstate) or a store ask
const src = fs.readFileSync(path.join(root, 'engine.mjs'), 'utf8');
ok(!src.includes('[c.F, 0]'), 'sellLot has no hidden-value cost fallback');
ok(!/lots\[u\]\?\.\[0\] \?\? W\.cards\[id\]\.F/.test(src), 'settleEstate has no hidden-value cost fallback');
ok(!/'store', p: c\.F/.test(src), 'Vault store asks are not priced at F');

// 2. Generated veterans open at comparable sales, not at hidden value (old: P0 = F for every one)
const W = world(), gen = W.players.filter((p) => !p.ref && p.on !== false), refP = new Set(W.players.filter((p) => p.ref).map((p) => p.P0));
ok(gen.length > 50, 'full league has generated veterans', `${gen.length}`);
ok(gen.filter((p) => close(p.P0, p.F)).length < 0.05 * gen.length, 'generated veterans do not open at F (a few match a comparable by chance)', `${gen.filter((p) => close(p.P0, p.F)).length} of ${gen.length} at F`);
ok(gen.every((p) => refP.has(p.P0)), 'each opens at a comparable save player\'s price');
ok(gen.every((p) => close(W.cards[p.id * 16 + 5].P, p.P0 * W.cards[p.id * 16 + 5].mult)), 'their card markets open at that price × premium');
{ const V = world({ openPrice: 'value' }), g2 = V.players.filter((p) => !p.ref && p.on !== false); ok(g2.every((p) => close(p.P0, p.F)), "openPrice 'value' reproduces the old opening"); }

// 3. Research pages carry no risk rating outside the OVR walk (old: riskRating under 'league' inverted to F)
const pid = W.players.find((p) => W.era?.[p.id]).id, page = E.libraryPage(W, pid);
ok(!('riskRating' in page) && !('weeklySwingPct' in page), "no riskRating or weeklySwingPct under valueModel 'league'");

// 4. Run 25 weeks with short lives (deaths and estates at week 20) and check every week
const L = world({ lifespan: [1, 1] }); let worstOther = 0, worstT = 0, treBad = 0, exoBad = 0, nan = 0, scoreSeen = 0, negSettle = 0;
const scan = (o) => { if (typeof o === 'number') { if (!Number.isFinite(o)) nan++; return; } if (o && typeof o === 'object') for (const k of Object.keys(o)) scan(o[k]); };
for (let t = 1; t <= 25; t++) {
  const before = new Map(L.bots.map((b) => [b, b.exo || 0]));
  E.step(L); scan(E.frame(L, { full: true }));
  const M = L.moneyWeek, rel = Math.abs(M.other) / Math.max(1, M.totalIn + M.totalOut); if (rel > worstOther) { worstOther = rel; worstT = t; }
  if (Math.abs(M.treasury.other) > 1e-6 * Math.max(1, Math.abs(L.treasury))) treBad++;
  if (t % L.cfg.weeksPerGeneration) { let s = 0; for (const b of new Set([...before.keys(), ...L.bots])) s += (b.exo || 0) - (before.get(b) || 0); if (!close(s, M.exo, 1e-9)) exoBad++; }
  for (const b of L.bots) for (const r of b.gameResults || []) if ('score' in r) scoreSeen++;
  negSettle += L.bots.filter((b) => b.cash < -1e-6).length;
}
ok(worstOther < 1e-9, 'every coin into or out of the bots is tagged (ledger "other" is zero)', `worst ${worstOther.toExponential(1)} at week ${worstT}`);
ok(treBad === 0, 'the treasury moves only by its ledger lines (incl. the weekly wipe)');
ok(exoBad === 0, 'b.exo moves exactly with the lump sums booked through transfer()');
ok(nan === 0, 'no NaN or Infinity in any frame');
ok(scoreSeen === 0, 'game results reach bots without the score (old: the valuation score revealed F)');
ok(negSettle === 0, 'no bot cash below zero');
{ let missing = 0, extra = 0; const listed = new Map(); for (const a of L.auctions) if (!a.uid && typeof a.seller === 'object') { const m = listed.get(a.seller) || new Map(); m.set(a.cardId, (m.get(a.cardId) || 0) + 1); listed.set(a.seller, m); }
  for (const b of L.bots) { const ids = new Set([...b.h.keys(), ...(b.lots?.keys() || [])]); for (const id of ids) { const n = (b.h.get(id) || 0) + (b.lentOut?.get(id) || 0) + (listed.get(b)?.get(id) || 0), l = b.lots?.get(id)?.length || 0; if (l < n) missing += n - l; if (l > n) extra += l - n; } }
  const heirs = L.bots.filter((b) => b.gen > 0).length; ok(heirs > 0, 'deaths happened at week 20', `${heirs} heirs`);
  ok(missing === 0, 'every copy held, lent or listed has its cost lot after estates (old: estate-sale leftovers had none, so sellLot used F)', `${missing} missing, ${extra} extra`); }

// 5. AI-bot view: other bots only from its own dealings, with no worth order, style or note counts
{ const b = L.bots.find((x) => x.friends.size || x.flags.size) || L.bots[0], o = E.observe(L, b), dealt = new Set([...b.friends, ...b.flags]);
  for (const x of L.loans || []) { if (x.borrower === b) dealt.add(x.lender.id); if (x.lender === b) dealt.add(x.borrower.id); } for (const x of L.cardLoans || []) { if (x.borrower === b) dealt.add(x.lender.id); if (x.lender === b) dealt.add(x.borrower.id); }
  const byName = new Map(L.bots.map((x) => [x.name, x]));
  ok(o.otherBots.every((x) => !('kind' in x) && !('notes' in x)), 'otherBots carry no style or note count');
  ok(o.otherBots.every((x) => dealt.has(byName.get(x.name).id) || byName.get(x.name).flags.has(b.id)), 'otherBots are bots it has dealt with', `${o.otherBots.length} listed`); }

// 6. A lender leaving: the borrower pays at most its cash, and nothing reaches the treasury (old: uncapped, to the treasury)
{ const Ln = (L.cardLoans || []).find((x) => L.bots.includes(x.lender) && L.bots.includes(x.borrower));
  if (!Ln) ok(true, 'lender-gone settlement (no card loan open: skipped)');
  else { const bw = Ln.borrower; bw.cash = 0; const coll = Ln.coll, tr = L.treasury; E.removeBot(L, Ln.lender, 'test');
    ok(bw.cash >= 0 && close(L.treasury, tr), 'lender-gone settlement is capped and never paid to the treasury', `borrower cash ${bw.cash.toFixed(2)} (collateral ${coll.toFixed(2)})`); } }

// 7. An AI bot's starting basket is booked at public prices, not hidden value
{ const a = E.addAiBot(L); let n = 0, atP = 0, atF = 0; for (const [id, ls] of a.lots || []) { const c = L.cards[id], p = L.players[c.pid]; for (const [cost] of ls) { n++; if (close(cost, p.P * c.mult)) atP++; if (close(cost, p.F * c.mult) && !close(p.F, p.P)) atF++; } }
  ok(n > 0 && atP === n && atF === 0, 'addAiBot cost basis is the public price', `${atP}/${n} at P`); }

// 8. fitnessExo: the owner's booking leaves lifestyle costs in the return; 'legacy' takes them out as before
for (const mode of ['lumpSums', 'legacy']) { const X = world({ fitnessExo: mode }); E.step(X); E.step(X); const m0 = { ...X.house.mint }, ex0 = X.bots.reduce((s, b) => s + (b.exo || 0), 0); E.step(X);
  const d = (k) => (X.house.mint[k] || 0) - (m0[k] || 0), want = mode === 'legacy' ? d('allowance') - d('living') - d('lifestyle') : d('allowance') + d('taxBack') - d('living') - d('shocks');
  ok(close(X.moneyWeek.exo, want), `fitnessExo '${mode}' books exactly its lump sums`, `exo ${X.moneyWeek.exo.toFixed(1)} vs ${want.toFixed(1)}`); }

// 9. The Vault store prices from public values: moving every hidden value 10× leaves its asks where the guide puts them
{ const S = world({ store: true }); for (let t = 0; t < 5; t++) E.step(S); const cs = S.cards.filter((c) => c.on !== false && c.pool > 0).slice(0, 50), before = cs.map((c) => E.storeAsk(S, c));
  for (const p of S.players) p.F *= 10; const after = cs.map((c) => E.storeAsk(S, c));
  ok(cs.length > 0 && before.every((x, i) => close(x, after[i])) && cs.every((c, i) => close(before[i], S.players[c.pid].guide * c.mult * (1 + S.cfg.storePremium))), 'Vault store asks follow the guide, not F', `${cs.length} cards`); }

console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
