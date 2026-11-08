// Split random streams (audit methods 1, code finding "Single shared random stream"). Each check runs worlds and compares:
//   node tests/rng.test.mjs league [--weeks 100] [--seed 31761]   the league is identical under different market settings
//   node tests/rng.test.mjs single [--weeks 45] --base FILE        rngStreams 'single' repeats the pre-change engine's frames
//   node tests/rng.test.mjs one --set '{json}' [--weeks N]         one Realism run's league fingerprint (for running in parallel)
// league: Realism with practiceGens 0; each week the league's state (every player's F, injury spell, active flag, career
// totals with awards and rings, the champions) is hashed. Runs that differ only in a market setting (fee 0.01 vs 0.05,
// allowance 200 vs 400) must give the same hash every week with 'split', and (the old wrong behaviour) differ with 'single'.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath, pathToFileURL } from 'node:url'; import { execFile } from 'node:child_process';
const here = path.dirname(fileURLToPath(import.meta.url)), argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const d = path.join(here, '..', 'data'), rd = (f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
const lib = () => { const l = rd('library.json'); l.timeline = rd('timeline.json'); for (const k of ['history', 'kits', 'names']) l[k] = rd(k + '.json'); l.leagueRates = rd('league_rates.json'); l.rookieNames = rd('rookie_names.json'); l.nflAge = rd('nfl_age.json'); return l; };
const realism = JSON.parse(fs.readFileSync(path.join(here, '..', 'configs', 'realism.json'), 'utf8')), sha = (x) => crypto.createHash('sha1').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const mode = argv[0], seed = +opt('seed', 31761);
// The league's state this week: what a market setting must never change
const leagueState = (W) => ({ F: W.players.map((p) => [p.key, p.F]), lg: W.players.map((p) => p.lg ? [p.lg.out, p.lg.active, p.lg.tot, p.lg.age0] : null), champs: W.L?.champions || [] });
if (mode === 'one') {
  const E = await import(pathToFileURL(path.join(here, '..', 'engine.mjs')).href), set = JSON.parse(opt('set', '{}')), weeks = +opt('weeks', 100);
  const W = E.createWorld(lib(), { ...realism, practiceGens: 0, seed, ...set }), hs = [sha(leagueState(W))], ev = { injuries: 0, retired: 0, rookies: 0, awards: [] };
  for (let t = 1; t <= weeks; t++) { E.step(W); hs.push(sha(leagueState(W))); for (const j of W.journal) { if (j.type === 'injury') ev.injuries++; if (j.type === 'retired') ev.retired++; if (j.type === 'rookie') ev.rookies++; }
    for (const e of W.events) if (e.t === W.t && e.kind === 'award') ev.awards.push(`${e.t}: ${e.text}`); }
  const tr = W.hist.trades.slice(-10);
  console.log(JSON.stringify({ set, weeks, hashes: hs, champions: W.L?.champions || [], ...ev, final: sha(hs.join()), market: { bots: W.bots.filter((b) => b.kind === 'rule').length, tradesLast10: tr.reduce((a, b) => a + b, 0) / tr.length, vault: W.hist.p.at(-1) } }));
} else if (mode === 'league') {
  const weeks = opt('weeks', '100'), arms = [['split', { fee: 0.01 }], ['split', { fee: 0.05 }], ['split', { allowance: 400 }], ['single', { rngStreams: 'single', fee: 0.01 }], ['single', { rngStreams: 'single', fee: 0.05 }], ['single', { rngStreams: 'single', allowance: 400 }]];
  // the six runs in parallel, one process each
  const outs = await Promise.all(arms.map(([, set]) => new Promise((ok, no) => execFile(process.execPath, [fileURLToPath(import.meta.url), 'one', '--set', JSON.stringify(set), '--weeks', weeks, '--seed', String(seed)], { maxBuffer: 1 << 28 }, (e, so) => (e ? no(e) : ok(JSON.parse(so)))))));
  let fail = 0; const show = (o) => `${JSON.stringify(o.set)}: champions ${o.champions.map((c) => c.join(' ')).join(', ')}; ${o.injuries} injuries, ${o.retired} retirements, ${o.rookies} rookies, ${o.awards.length} awards; league hash ${o.final.slice(0, 12)}; market: ${o.market.bots} bots, ${o.market.tradesLast10.toFixed(0)} trades/wk, Vault ${o.market.vault.toFixed(1)}`;
  for (const o of outs) console.log(show(o));
  const firstDiff = (a, b) => a.hashes.findIndex((h, i) => h !== b.hashes[i]);
  for (const [i, j] of [[0, 1], [0, 2]]) { const k = firstDiff(outs[i], outs[j]); console.log(`split ${JSON.stringify(outs[i].set)} vs ${JSON.stringify(outs[j].set)}: ${k < 0 ? `league identical all ${weeks} weeks` : `league differs from week ${k}`}`); if (k >= 0) fail++;
    if (JSON.stringify(outs[i].market) === JSON.stringify(outs[j].market)) { console.log('  but the market did not differ either: not a test'); fail++; } }
  for (const [i, j] of [[3, 4], [3, 5]]) { const k = firstDiff(outs[i], outs[j]); console.log(`single ${JSON.stringify(outs[i].set)} vs ${JSON.stringify(outs[j].set)}: ${k < 0 ? 'league identical (old behaviour not shown)' : `league differs from week ${k} (the old wrong behaviour)`}`); }
  console.log(fail ? `FAIL ${fail}` : 'ok: the league is held constant across market settings with split streams'); process.exit(fail ? 1 : 0);
} else if (mode === 'single') {
  // rngStreams 'single' against the pre-change engine (git show <merge>:engine.mjs > FILE), engine defaults, every frame hashed
  const weeks = +opt('weeks', 45), set = JSON.parse(opt('set', '{}')), E = await import(pathToFileURL(path.join(here, '..', 'engine.mjs')).href), B = await import(pathToFileURL(path.resolve(opt('base'))).href);
  const run = (M, o) => { const W = M.createWorld(lib(), { seed, ...set, ...o }), hs = [sha(M.frame(W, { full: true }))]; for (let t = 1; t <= weeks; t++) { M.step(W); hs.push(sha(M.frame(W, { full: true }))); } return hs; };
  const a = run(B, {}), b = run(E, { rngStreams: 'single' }), k = a.findIndex((h, i) => h !== b[i]);
  console.log(k < 0 ? `ok: 'single' repeats the pre-change engine's ${weeks + 1} frames exactly (settings ${JSON.stringify(set)}, seed ${seed}; last hash ${a.at(-1).slice(0, 12)})` : `FAIL: frames differ from week ${k}`); process.exit(k < 0 ? 0 : 1);
} else { console.log('usage: node tests/rng.test.mjs league|single|one ...'); process.exit(2); }
