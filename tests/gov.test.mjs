// The government build (docs/regulator-spec.md, Gate A in 17.3): dial legality, the treasury's ledger to the coin, its
// own account, pro rata payments and payOrder, fitnessExo booking (22.1), the board as bot inputs, the placebo, wake
// triggers, the football held constant across governments, the state whitelist (no leaks), the driver end to end with a
// scripted stub government (elections and notebook handover, replay from the decision log, resume).
//   node tests/gov.test.mjs [--quick]     (--quick skips the driver runs)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto'; import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import assert from 'node:assert/strict';
import * as E from '../engine.mjs'; import { StateWriter, EXCLUDED_KEYS } from '../gov/state.mjs'; import { rulesMarkdown } from '../gov/rules.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..'), d = path.join(root, 'data'), rd = (f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
const lib = rd('library.json'); lib.timeline = rd('timeline.json'); for (const k of ['history', 'kits', 'names']) lib[k] = rd(k + '.json');
lib.leagueRates = rd('league_rates.json'); lib.rookieNames = rd('rookie_names.json'); lib.nflAge = rd('nfl_age.json');
const REG = JSON.parse(fs.readFileSync(path.join(root, 'configs', 'regulated.json'), 'utf8'));
const SMALL = { practiceGens: 0, leagueFill: 'save', botScale: 1, population: 60 };
const world = (o = {}, seed = 11) => E.createWorld(lib, { ...REG, ...SMALL, seed, ...o });
const quick = process.argv.includes('--quick');
let pass = 0, fail = 0;
const test = async (name, f) => { try { await f(); pass++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n     ')); } };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
// The treasury's and the bots' ledgers: this week's change per tag
function deltas(W, prev) { const T = { ...(W.house.tre || {}) }, M = { ...(W.house.mint || {}) }, dT = {}, dM = {}; for (const k of new Set([...Object.keys(T), ...Object.keys(prev.T)])) dT[k] = (T[k] || 0) - (prev.T[k] || 0); for (const k of new Set([...Object.keys(M), ...Object.keys(prev.M)])) dM[k] = (M[k] || 0) - (prev.M[k] || 0); prev.T = T; prev.M = M; return { dT, dM }; }
const near = (a, b, msg, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b)), `${msg}: ${a} vs ${b}`);

await test('without a government nothing changes shape: no gov frame field, the base input lists', () => {
  const W = E.createWorld(lib, { practiceGens: 0, leagueFill: 'save', population: 20, seed: 3 }); E.step(W);
  assert.equal(E.frame(W).gov, undefined); const s = E.TEST.shapes(); assert.equal(s.bot[0], E.BOT_IN_BASE.length); assert.equal(s.cardIn.includes(E.BOARD_CARD_IN[0]), false);
});
await test('a government world refuses unpinned settings (closedEconomy, prizeShare, populationFloor, brain, wealthTaxTo)', () => {
  for (const [k, v] of [['closedEconomy', false], ['prizeShare', 0.1], ['populationFloor', 0.5], ['brain', 'genome'], ['wealthTaxTo', 'equal'], ['centralBank', true]]) assert.throws(() => world({ [k]: v }), new RegExp(k));
});
await test('dial legality: in range accepted, both ends accepted, out of range, NaN, Infinity and wrong types rejected (old value kept), non-dials rejected', () => {
  const W = world();
  for (const [k, D] of Object.entries(E.GOV_DIALS)) {
    if (D.bool) { assert.equal(E.applyControls(W, { [k]: false }).errors.length, 0); assert.equal(E.applyControls(W, { [k]: 1 }).errors.length, 1); continue; }
    for (const v of [D.lo, D.hi].filter(Number.isFinite)) { const r = E.applyControls(W, { [k]: v }); assert.equal(r.errors.length, 0, `${k}=${v}: ${JSON.stringify(r.errors)}`); }
    const before = JSON.stringify(E.frame(W).gov.dials[k]);
    for (const v of [NaN, Infinity, -Infinity, '0.1', null, [1], ...(Number.isFinite(D.lo) ? [D.lo - 1e-9] : []), ...(Number.isFinite(D.hi) ? [D.hi + 1e-9] : []), ...(D.int ? [D.lo + 0.5] : [])]) {
      const r = E.applyControls(W, { [k]: v }); assert.equal(r.errors.length, 1, `${k}=${v} should be rejected`); assert.equal(r.changes.length, 0); }
    assert.equal(JSON.stringify(E.frame(W).gov.dials[k]), before, `${k}: a rejected value must leave the old one`);
  }
  for (const k of ['entryRate', 'entryHype', 'startCash', 'packsPerWeek', 'packEdge', 'collectors', 'outsideMode', 'closedEconomy', 'centralBank', 'prizeShare', 'populationFloor', 'livingCost', 'lifestyle', 'brain', 'valueModel', 'walkUp', 'leagueUpdates', 'weekSeconds', 'attention', 'rngStreams', 'seed', 'interest', 'nnMutation', 'evolve', 'injuries', 'pressure'])
    assert.deepEqual(E.applyControls(W, { [k]: 1 }).errors.map((e) => e.error), ['not a dial'], k);
  // structured controls
  const bad = [{ transfers: [{ to: 'everyone', amount: 1 }] }, { transfers: [{ to: 'worthDecile', lo: 0, amount: 1 }] }, { transfers: [{ to: 'holders', player: 'Nobody Atall', amount: 1 }] }, { transfers: [{ to: 'all', amount: NaN }] }, { transfers: Array(21).fill({ to: 'all', amount: 1 }) },
    { payOrder: ['allowance', 'allowance'] }, { payOrder: ['bribes'] }, { publish: { seed: true } }, { publish: { treasury: 1 } }, { rules: { fee: { base: 'x' } } }, { rules: { shorting: { base: 1 } } }, { rules: { fee: { base: 0, terms: [['hiddenValue', 1]] } } }];
  for (const c of bad) assert.equal(E.applyControls(W, c).errors.length, 1, JSON.stringify(c));
  const good = { transfers: [{ to: 'all', amount: -3 }, { to: 'cashDecile', lo: 1, hi: 2, amount: 9 }, { to: 'newcomers', weeks: 4, amount: 5 }, { to: 'noCash', amount: 1 }, { to: 'holders', player: W.players[0].name, amount: 2 }], payOrder: ['consumption'], publish: { vaultIndex: false }, rules: { fee: { base: 0.01, terms: [['vaultIndex4w', 0.1]], min: 0 } } };
  assert.deepEqual(E.applyControls(W, good).errors, []);
});
await test('the dial fuzzer: random legal values and extremes for 30 weeks: no NaN or Infinity, the treasury never below zero, both ledgers close every week', () => {
  const W = world({ population: 50 }, 5), r = ((a) => () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; })(99), prev = { T: { ...W.house.tre }, M: { ...W.house.mint } };
  const pick = (k, D) => { if (D.bool) return r() < 0.5; const ends = [D.lo, D.hi].filter(Number.isFinite), lo = Number.isFinite(D.lo) ? D.lo : -500, hi = Number.isFinite(D.hi) ? D.hi : Math.max(lo + 1, 5) * 3; let v = r() < 0.25 && ends.length ? ends[Math.floor(r() * ends.length)] : lo + (hi - lo) * r(); if (k === 'consumption' || k === 'allowance') v = (r() - (k === 'allowance' ? 0.3 : 0)) * 3000; if (k === 'guideEvery' || k === 'guideLag' || k === 'loanWeeks') v = 1 + Math.floor(r() * 30); if (D.int) v = Math.round(v); return Math.min(D.hi, Math.max(D.lo, v)); };
  for (let t = 1; t <= 30; t++) {
    const c = {}; for (const [k, D] of Object.entries(E.GOV_DIALS)) if (r() < 0.35) c[k] = pick(k, D);
    if (r() < 0.3) c.transfers = [{ to: ['all', 'worthDecile', 'cashDecile', 'noCash'][Math.floor(r() * 4)], lo: 1, hi: 5, amount: (r() - 0.4) * 200 }]; if (r() < 0.2) c.payOrder = r() < 0.5 ? null : ['consumption', 'royalties']; if (r() < 0.2) c.rules = { holdCost: r() < 0.5 ? null : { base: 0.001, terms: [['vaultIndex1w', 0.01]] } };
    const res = E.applyControls(W, c); assert.deepEqual(res.errors, [], JSON.stringify(res.errors));
    E.step(W); const f = E.frame(W, { full: true }), s = JSON.stringify(f); assert.ok(!/NaN|Infinity/.test(s), `week ${t}: NaN or Infinity in the frame`);
    assert.ok(W.treasury >= -1e-6, `week ${t}: treasury ${W.treasury}`); assert.ok(Math.abs(W.moneyWeek.treasury.other) < 1e-6, `week ${t}: treasury residual ${W.moneyWeek.treasury.other}`); assert.ok(Math.abs(W.moneyWeek.other) < 1e-6, `week ${t}: bots' money residual ${W.moneyWeek.other}`); // to a millionth of a coin (float rounding)
    const { dT, dM } = deltas(W, prev); for (const [tk, mk, sg] of [['fees', 'fees', 1], ['holding', 'holding', 1], ['wealthTax', 'wealthTax', 1], ['packTax', 'packTax', 1], ['outsideTax', 'outsideTax', 1], ['exitTax', 'exitTax', 1], ['pollTax', 'pollTax', 1], ['levy', 'levy', 1], ['allowance', 'allowance', -1], ['transfers', 'transfer', -1], ['royalties', 'royalties', -1]]) near(dT[tk] || 0, sg * (dM[mk] || 0), `week ${t}: treasury ${tk} against the bots' ${mk}`);
    near(['feeSubsidy', 'packSubsidy', 'outsideSubsidy', 'exitSubsidy', 'wealthSubsidy', 'holdSubsidy'].reduce((s, k) => s + (dT[k] || 0), 0), -(dM.subsidy || 0), `week ${t}: subsidies`);
  }
});
await test('the treasury moves only by its lines, to the coin; the own account moves only by consumption paid; money is conserved across bots, treasury and account', () => {
  const W = world({}, 21), prev = { T: { ...W.house.tre }, M: { ...W.house.mint } }; let acct = 0, cons = 0;
  E.applyControls(W, { consumption: 1500, fee: 0.03, packSalesTax: 0.2, outsideSalesTax: 0.05, exitTax: 0.3, transfers: [{ to: 'worthDecile', lo: 1, hi: 4, amount: 40 }, { to: 'all', amount: -2 }] });
  const money = () => W.bots.reduce((s, b) => s + b.cash + (b.shortColl || 0), 0); let m0 = money(), T0 = W.treasury;
  for (let t = 1; t <= 25; t++) { E.step(W); const { dT, dM } = deltas(W, prev), lineSum = Object.values(dT).reduce((a, b) => a + b, 0);
    near(W.treasury - T0, lineSum, `week ${t}: ΔT = Σ lines`, 1e-12); cons += -(dT.consumption || 0); near(W.gov.account, cons, `week ${t}: own account = Σ consumption`, 1e-12);
    // all money: Δ(bots) + ΔT + Δaccount = the flows from and to the outside (everything the bots' ledger books that the treasury doesn't)
    const IN = ['allowance', 'royalties', 'outsideIn', 'dealerIn', 'prizes', 'stakesBack', 'newcomers', 'taxBack', 'liqClaims', 'transfer', 'subsidy'], OUT = ['living', 'lifestyle', 'fees', 'packs', 'liqOut', 'storeOut', 'outsideOut', 'dealerOut', 'holding', 'wealthTax', 'shocks', 'stakes', 'leavers', 'loanLeavers', 'packTax', 'outsideTax', 'exitTax', 'pollTax', 'levy'];
    const treasuryLinked = new Set(['allowance', 'royalties', 'transfer', 'subsidy', 'fees', 'holding', 'wealthTax', 'packTax', 'outsideTax', 'exitTax', 'pollTax', 'levy']);
    const outside = IN.filter((k) => !treasuryLinked.has(k)).reduce((s, k) => s + (dM[k] || 0), 0) - OUT.filter((k) => !treasuryLinked.has(k)).reduce((s, k) => s + (dM[k] || 0), 0);
    const m1 = money(); near((m1 - m0) + (W.treasury - T0) + -(dT.consumption || 0) - (W.moneyWeek.other), outside, `week ${t}: all money against the outside flows`, 1e-9); m0 = m1; T0 = W.treasury; }
  assert.ok(cons > 0, 'consumption was paid');
});
await test('pro rata when short: every weekly line is paid the same fraction, balance ÷ total owed; payOrder pays its lines first', () => {
  const W = world({}, 8); E.applyControls(W, { allowance: 500, consumption: 2e5, transfers: [{ to: 'all', amount: 100 }] }); const T0 = W.treasury; E.step(W);
  const G = W.gov, owed = Object.values(G.owed).reduce((a, b) => a + b, 0); const fr = Object.values(G.frac); assert.ok(fr[0] < 1, 'the treasury was short');
  for (const f of fr) near(f, fr[0], 'same fraction on every line', 1e-12); near(fr[0], T0 / owed, 'the fraction is balance ÷ total owed', 1e-12);
  const paid = -['allowance', 'transfers', 'royalties', 'consumption'].reduce((s, k) => s + (W.moneyWeek.treasury.lines[k] || 0), 0);
  near(paid, T0, 'the whole balance was paid out', 1e-9); near(fr[0] * owed, paid, 'fraction × owed = paid', 1e-9);
  E.applyControls(W, { payOrder: ['consumption'] }); E.step(W); const F = W.gov.frac; assert.ok(F.consumption > F.allowance || F.consumption === 1, `consumption first: ${JSON.stringify(F)}`); for (const k of ['allowance', 'transfers', 'royalties']) near(F[k], F.allowance, 'the rest pro rata', 1e-12);
  const W2 = world({}, 8); E.applyControls(W2, { consumption: 1 }); E.step(W2); assert.deepEqual(new Set(Object.values(W2.gov.frac)).size, 1);
});
await test('fitnessExo (22.1): allowance, transfers, poll tax and levies are taken out of fitness; taxes and fees tied to holdings or activity are not', () => {
  const base = { livingCost: 0, lifestyle: 0, cashShockChance: 0 };
  const exoWeek = (c) => { const W = world(base, 13); E.applyControls(W, c); E.step(W); const L = W.moneyWeek.treasury.lines; return { exo: W.exoWk, L }; };
  const a = exoWeek({ allowance: 50, transfers: [{ to: 'all', amount: 7 }] }); near(a.exo, -(a.L.allowance || 0) - (a.L.transfers || 0), 'allowance + transfers booked');
  { const W = world(base, 13), n = W.bots.length; E.applyControls(W, { allowance: -5, transfers: [{ to: 'all', amount: -3 }] }); E.step(W); near(W.exoWk, -8 * n, 'poll tax + levy booked in full (what was billed)', 1e-12); }
  const W = world(base, 13); E.applyControls(W, { allowance: 0, fee: 0.2, holdCost: 0.01, wealthTax: 0.05, packSalesTax: 0.5, outsideSalesTax: 0.2, exitTax: 0.5 }); E.step(W); E.step(W); E.step(W); E.step(W);
  assert.equal(W.exoWk, 0, 'taxes and fees are not lump sums'); assert.ok((W.house.tre.fees || 0) > 0 && (W.house.tre.holding || 0) > 0, 'they were collected');
});
await test('the board: parsing (negation, capitalised unique surnames only, shared surnames need full names, dial promises)', () => {
  const P = [{ id: 0, name: 'Ty Lock' }, { id: 1, name: 'Sam Strong' }, { id: 2, name: 'Al Reed' }, { id: 3, name: 'Bo Reed' }, { id: 4, name: 'Cy Vance' }];
  let r = E.parseBoard("Don't sell Lock. Buy Vance!", P); assert.deepEqual(r.mentions.map((m) => [m.pid, m.dir]), [[0, 1], [4, 1]]); assert.equal(r.tone, 1);
  r = E.parseBoard('Prices are strong. Reed will fall. Bo Reed will rise.', P); assert.deepEqual(r.mentions.map((m) => [m.pid, m.dir, m.by]), [[3, 1, 'full name']], 'shared surname alone: none; full name: him');
  r = E.parseBoard('the market looks strong and lock in gains', P); assert.deepEqual(r.mentions, [], 'lower-case surnames and board words are not names');
  r = E.parseBoard('Strong buying ahead.', P); assert.deepEqual(r.mentions, [], 'a surname that is a board word never matches alone'); r = E.parseBoard('sam strong will rise', P); assert.deepEqual(r.mentions.map((m) => m.pid), [1], 'full name in any case');
  r = E.parseBoard('We will raise the fee. We will not cut the allowance. The wealth tax goes down.', P); assert.deepEqual(r.dials, { fee: 1, allowance: 1, wealthTax: -1 });
  r = E.parseBoard('', P); assert.deepEqual([r.sentences, r.tone, r.mentions.length], [0, 0, 0]);
});
await test('the board reaches the bots as inputs: the card inputs of a mentioned player and the global inputs, from the next week; fading after', () => {
  const W = world({}, 4); E.step(W); const p = W.players.find((x) => x.on !== false && x.circ > 0 && W.players.filter((y) => y.name.split(' ').pop() === x.name.split(' ').pop()).length === 1) || W.players[0], c = W.cards[p.id * 16], b = W.bots[0];
  const S = E.TEST.shapes(), bi = S.botIn.indexOf('board tone'); assert.ok(S.B0 > 0 && S.cardIn[S.B0] === E.BOARD_CARD_IN[0] && bi > 0);
  const before = E.TEST.cardIn(W, b, c); assert.equal(before[S.B0], 0); E.noteBoard(W, `Buy ${p.name}. Prices will rise.`);
  assert.equal(E.TEST.cardIn(W, b, c)[S.B0], 0, 'not before the next week'); E.step(W);
  const x = E.TEST.cardIn(W, b, c); assert.ok(x[S.B0] > 0.5 && x[S.B0 + 1] > 0.5, `mention ${x[S.B0]}, direction ${x[S.B0 + 1]}`);
  const other = W.cards.find((q) => q.pid !== p.id && q.on !== false); assert.equal(E.TEST.cardIn(W, b, other)[S.B0], 0, 'other players read nothing');
  const y = E.TEST.botIn(W, b); assert.ok(y[bi] > 0 && y[bi + 1] > 0, `tone ${y[bi]}, activity ${y[bi + 1]}`); E.step(W); assert.ok(E.TEST.cardIn(W, b, c)[S.B0] < x[S.B0], 'it fades');
  const A0b = world({ government: { board: false } }, 4); const s2 = E.TEST.shapes(); assert.equal(s2.cardIn.includes(E.BOARD_CARD_IN[0]), false); assert.equal(s2.botIn.includes('board tone'), false); assert.ok(s2.botIn.includes('placebo')); E.step(A0b);
});
await test('every dial is a policy input: constant at the opening dials, moved by a change; the allowance input is what was paid; a withheld statistic reads 0', () => {
  const W = world({}, 6); E.step(W); const b = W.bots[0], S = E.TEST.shapes(), i = (n) => S.botIn.indexOf(n);
  const x0 = E.TEST.botIn(W, b); for (const k of ['policy: holdCost', 'policy: exitTax', 'policy: consumption']) assert.equal(x0[i(k)], 0, k);
  E.applyControls(W, { exitTax: 0.5, holdCost: 0.002, consumption: 100 }); E.step(W); const x1 = E.TEST.botIn(W, b); for (const k of ['policy: holdCost', 'policy: exitTax', 'policy: consumption']) assert.ok(x1[i(k)] > 0, k);
  E.applyControls(W, { publish: { dials: false } }); E.step(W); const x2 = E.TEST.botIn(W, b); for (const k of ['policy: holdCost', 'policy: exitTax']) assert.equal(x2[i(k)], 0, `${k} withheld`);
  assert.ok(Math.abs(x1[25]) <= 3);
});
await test('the placebo is the same whatever the government does', () => {
  const run = (c, post) => { const W = world({}, 9), o = []; E.applyControls(W, c); if (post) E.noteBoard(W, post); for (let t = 0; t < 12; t++) { E.step(W); o.push(E.frame(W).gov.board.placebo); } return o; };
  assert.deepEqual(run({}, null), run({ fee: 0.2, consumption: 5000 }, 'Crash everything. Sell!'));
});
// the league's own state (as tests/rng.test.mjs): hidden value, injury spells, careers, champions. On the regulated preset's
// full league (with leagueFill 'save' the player list itself follows market settings, on main too)
await test('the football is upstream of every lever: the league is identical under A0, a greedy and a generous government on one seed', () => {
  const lg = (c) => { const W = world({ population: 40, leagueFill: 'full' }, 17), o = []; E.applyControls(W, c); for (let t = 0; t < 60; t++) { E.step(W); const f = E.frame(W, { full: true }); o.push(JSON.stringify([W.players.map((p) => [p.key, p.F, p.lg ? [p.lg.out, p.lg.active, p.lg.tot, p.lg.age0] : null]), W.L?.champions || [], f.season])); } return crypto.createHash('sha1').update(o.join()).digest('hex'); };
  const a0 = lg({}), a2 = lg({ fee: 0.2, allowance: 0, royaltyCap: 0, consumption: 1e6 }), a3 = lg({ allowance: 2000, royaltyCap: 1, fee: 0 }); assert.equal(a2, a0); assert.equal(a3, a0);
});
await test('wake triggers fire on public indicators only', () => {
  const W = world({}, 2); E.step(W); const ind = E.govIndicators(W);
  assert.deepEqual(Object.keys(ind).sort(), [...E.GOV_INDICATORS].sort());
  assert.equal(E.checkTriggers(W, [{ field: 'bots', op: '>', value: 0 }]).length, 1); assert.equal(E.checkTriggers(W, [{ field: 'bots', op: '<', value: 0 }]).length, 0);
  assert.equal(E.checkTriggers(W, [{ field: 'F', op: '>', value: 0 }, { field: 'treasury', op: '!=', value: 0 }]).length, 0, 'unknown fields and operators never fire');
});
await test('elections: approval counts bots present the whole term whose worth grew; leavers count against; handover keeps the outgoing account', () => {
  const W = world({}, 12); E.govTermStart(W); E.applyControls(W, { consumption: 300 }); for (let t = 0; t < 6; t++) E.step(W);
  const a = E.govApproval(W); assert.ok(a.eligible > 0 && a.approve <= a.stayed && a.share >= 0 && a.share <= 1); assert.equal(a.eligible, a.stayed + a.left);
  const b = W.bots[0]; E.removeBot(W, b, 'chose to leave'); const a2 = E.govApproval(W); assert.equal(a2.left, a.left + 1);
  const acct = W.gov.account; assert.ok(acct > 0); assert.equal(E.govHandover(W), acct); assert.equal(W.gov.account, 0); const T = W.treasury; E.step(W); assert.ok(W.gov.account > 0 && W.gov.account <= 300 + 1e-9);
  assert.ok(T >= 0);
});
await test('the state whitelist: no hidden-value or network field, no hidden value, no seed in state/; the rules file documents every dial and indicator', () => {
  const seed = 918277, W = world({}, seed), dir = tmp('gov-state-'), SW = new StateWriter(dir); SW.rules(rulesMarkdown({ elections: { term: 80, threshold: 0.5 } }));
  E.applyControls(W, { consumption: 200 }); E.noteBoard(W, 'Buy everything.');
  for (let t = 0; t < 8; t++) { E.step(W); SW.week(W, { lastErrors: [] }); SW.post(W.t, 'Buy everything.', E.parseBoard('Buy everything.', W.players)); }
  const files = fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).isFile()), all = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const keys = new Set(); const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); } };
  for (const f of files) { const t = fs.readFileSync(f, 'utf8'); if (f.endsWith('.json')) walk(JSON.parse(t)); if (f.endsWith('.jsonl')) t.split('\n').filter(Boolean).forEach((l) => walk(JSON.parse(l))); if (f.endsWith('.csv')) t.split('\n')[0].split(',').forEach((k) => keys.add(k)); }
  for (const k of EXCLUDED_KEYS) assert.ok(!keys.has(k), `excluded field ${k} in state/`);
  assert.ok(!all.includes(String(seed)), 'the seed appears in state/');
  // F, the F index, price ÷ value and vcap, at full precision
  const hidden = [...W.players.map((p) => p.F), W.hist.f.at(-1), W.hist.bub.at(-1), E.bubble(W), W.cards.reduce((a, c) => a + c.F * c.circ, 0)].filter((x) => x > 0 && !Number.isInteger(x)).map((x) => String(x)).filter((s) => s.length > 8);
  for (const h of hidden) assert.ok(!all.includes(h), `hidden value ${h} appears in state/`);
  const md = fs.readFileSync(path.join(dir, 'rules.md'), 'utf8'); for (const k of [...Object.keys(E.GOV_DIALS), ...E.GOV_INDICATORS, ...E.BOARD_WORDS.up, ...E.BOARD_WORDS.negation]) assert.ok(md.includes(k), `rules.md lacks ${k}`);
});

// ---------- The driver, end to end, with the scripted stub government (a process per turn, the session's file protocol) ----------
const drive = (args) => execFileSync(process.execPath, [path.join(root, 'regulate.mjs'), '--allow-dirty', '--overwrite', ...args], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
const readLog = (dir) => fs.readFileSync(path.join(dir, 'decisions.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const SET = JSON.stringify({ leagueFill: 'save', botScale: 1, population: 80 });
if (!quick) {
  const base = tmp('gov-drive-');
  await test('driver (lockstep 2): budget day, turns on their wake schedule, a trigger wake, errors returned, board posts parsed, the same run twice', () => {
    const a = path.join(base, 'a'), b = path.join(base, 'b'), args = ['--government', 'stub', '--seed', '5', '--weeks', '40', '--pace', '0', '--lockstep', '2', '--practice', '0', '--set', SET];
    drive([...args, '--out', a]); drive([...args, '--out', b]);
    assert.equal(fs.readFileSync(path.join(a, 'hashes.txt'), 'utf8'), fs.readFileSync(path.join(b, 'hashes.txt'), 'utf8'), 'same seed, same stub, same hashes');
    const L = readLog(a), T = L.filter((e) => e.type === 'turn'); assert.ok(T[0].budgetDay && T[0].weekRead === 0 && T[0].weekEffective === 1);
    for (const e of T.slice(1)) assert.equal(e.lagWeeks, 2);
    for (let i = 1; i < T.length; i++) { const w = T[i - 1].wake?.inWeeks; if (L.some((e) => e.type === 'wake' && e.week === T[i].weekRead)) continue; assert.equal(T[i].weekRead, T[i - 1].weekEffective - 1 + w, `turn ${i + 1} on its wake schedule`); }
    assert.ok(L.some((e) => e.type === 'wake' && e.triggers.length), 'a trigger woke it'); assert.ok(T.some((e) => e.errors.some((x) => x.dial === 'wealthTax')), 'the illegal value came back as an error');
    assert.ok(T.some((e) => e.board?.parsed?.dials?.fee === -1)); assert.ok(L.some((e) => e.type === 'prediction' && typeof e.hit === 'boolean'));
    const st = JSON.parse(fs.readFileSync(path.join(a, 'session/state/now.json'), 'utf8')); assert.ok(st.treasury && st.indicators && !('seed' in st));
    const run = JSON.parse(fs.readFileSync(path.join(a, 'run.json'), 'utf8')); assert.equal(run.frames.length, 41); assert.ok(run.frames.at(-1).gov && run.gov.decisions.length === T.length);
  });
  await test('replay from the decision log reproduces every week (live clock, real lags: the stub thinks while the world runs)', () => {
    const live = path.join(base, 'live'), rep = path.join(base, 'replay');
    drive(['--government', 'stub', '--seed', '6', '--weeks', '30', '--pace', '0.25', '--think-ms', '600', '--practice', '0', '--set', SET, '--out', live]);
    const L = readLog(live).filter((e) => e.type === 'turn'); assert.ok(L.length >= 3, `${L.length} turns`); assert.ok(L.slice(1).some((e) => e.lagWeeks >= 2), `the world kept moving while it thought (lags ${L.map((e) => e.lagWeeks)})`);
    drive(['--replay', live, '--out', rep]); assert.equal(fs.readFileSync(path.join(rep, 'hashes.txt'), 'utf8'), fs.readFileSync(path.join(live, 'hashes.txt'), 'utf8'));
  });
  await test('elections (run 2): handovers pass the treasury and notebooks on, the outgoing government keeps its account; a threshold of 0 keeps it in office', () => {
    const e = path.join(base, 'elect'), k = path.join(base, 'keep');
    drive(['--government', 'stub', '--seed', '4', '--weeks', '30', '--pace', '0', '--lockstep', '1', '--practice', '0', '--set', SET, '--elections', '10:1.01', '--out', e]);
    const L = readLog(e), H = L.filter((x) => x.type === 'handover'), El = L.filter((x) => x.type === 'election'); assert.equal(El.length, 3); assert.equal(H.length, 3);
    for (const h of H) assert.ok(h.outgoingAccount >= 0);
    const nb1 = fs.readFileSync(path.join(e, 'session/state/notebooks/G1.md'), 'utf8'); assert.ok(nb1.includes('Week 0: turn 1'), 'G1 notebook handed on');
    const rec = JSON.parse(fs.readFileSync(path.join(e, 'session/state/record.json'), 'utf8')); assert.equal(rec.length, 4); assert.equal(rec[0].to, 10); assert.ok(rec[0].account > 0);
    const T = L.filter((x) => x.type === 'turn'); assert.ok(T.some((x) => x.gov === 'G2'), 'the successor governs'); assert.ok(T.find((x) => x.gov === 'G2').notebook.chars < nb1.length, 'its own notebook starts fresh');
    drive(['--government', 'stub', '--seed', '4', '--weeks', '20', '--pace', '0', '--lockstep', '1', '--practice', '0', '--set', SET, '--elections', '10:0', '--out', k]);
    const K = readLog(k); assert.equal(K.filter((x) => x.type === 'handover').length, 0); assert.ok(K.filter((x) => x.type === 'election').every((x) => x.retained));
  });
  await test('resume: a cut-short run continues from its decision log and gives the uninterrupted run\'s weeks', () => {
    const full = path.join(base, 'full'), cut = path.join(base, 'cut'), args = ['--government', 'stub', '--seed', '3', '--pace', '0', '--lockstep', '2', '--practice', '0', '--set', SET];
    drive([...args, '--weeks', '30', '--out', full]); const F = readLog(full), reads = new Set(F.filter((e) => e.type === 'turn' || e.type === 'wake').map((e) => e.weekRead ?? e.week));
    let w = 16; while (w < 26 && (reads.has(w) || reads.has(w - 1))) w++; // a cut with no turn in flight (a lost turn can't be rerun exactly)
    drive([...args, '--weeks', String(w), '--out', cut]);
    const m = JSON.parse(fs.readFileSync(path.join(cut, 'meta.json'), 'utf8')); m.args.weeks = 30; fs.writeFileSync(path.join(cut, 'meta.json'), JSON.stringify(m));
    execFileSync(process.execPath, [path.join(root, 'regulate.mjs'), '--resume', cut], { stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(fs.readFileSync(path.join(cut, 'hashes.txt'), 'utf8'), fs.readFileSync(path.join(full, 'hashes.txt'), 'utf8'));
  });
  await test('scripted arms A0-A4 run headless and log their decisions', () => {
    for (const g of ['A0', 'A1', 'A2', 'A3', 'A4']) { const o = path.join(base, g); drive(['--government', g, '--seed', '2', '--weeks', '12', '--pace', '0', '--practice', '0', '--set', SET, '--out', o]); const L = readLog(o); if (g !== 'A0') assert.ok(L.length > 0, g); assert.ok(L.every((x) => x.errors.length === 0), `${g}: ${JSON.stringify(L.find((x) => x.errors.length))}`); }
  });
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
