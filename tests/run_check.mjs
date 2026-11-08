// Run gates for an engine change: a Realism run (practice off), every week's frame hashed (determinism: two runs must
// match) and scanned for NaN or Infinity, and the headline metrics at the end.
//   node tests/run_check.mjs --seed 31761 --weeks 60 [--engine ../engine.mjs] > out.json
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const E = await import(pathToFileURL(path.resolve(opt('engine', path.join(here, '..', 'engine.mjs')))).href);
const d = path.join(here, '..', 'data'), rd = (f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
const lib = rd('library.json'); lib.timeline = rd('timeline.json'); for (const k of ['history', 'kits', 'names']) lib[k] = rd(k + '.json');
lib.leagueRates = rd('league_rates.json'); lib.rookieNames = rd('rookie_names.json'); lib.nflAge = rd('nfl_age.json');
const cfg = JSON.parse(fs.readFileSync(path.join(here, '..', 'configs', 'realism.json'), 'utf8')), seed = +opt('seed', 31761), weeks = +opt('weeks', 60);
const W = E.createWorld(lib, { ...cfg, practiceGens: 0, seed }), hashes = [], bad = [];
const scan = (x, p, t) => { if (typeof x === 'number') { if (!Number.isFinite(x)) bad.push([t, p]); } else if (x && typeof x === 'object') for (const k of Object.keys(x)) { if (bad.length > 50) return; scan(x[k], p + '.' + k, t); } };
const fr0 = E.frame(W, { full: true }); scan(fr0, 'f', 0); hashes.push(crypto.createHash('sha1').update(JSON.stringify(fr0)).digest('hex'));
let trades = [];
for (let t = 1; t <= weeks; t++) { E.step(W); const f = E.frame(W, { full: true }); scan(f, 'f', t); hashes.push(crypto.createHash('sha1').update(JSON.stringify(f)).digest('hex')); trades.push(f.h.trades); }
for (const b of W.bots) for (const k of ['cash', 'debt', 'lent', 'shortColl']) if (b[k] != null && !Number.isFinite(b[k])) bad.push([weeks, `bot ${b.name}.${k}`]);
const L = (a) => a[a.length - 1], h = W.hist, last10 = trades.slice(-10);
console.log(JSON.stringify({ seed, weeks, bad: bad.slice(0, 20), nBad: bad.length, hash: crypto.createHash('sha1').update(hashes.join()).digest('hex'), metrics: { bots: W.bots.filter((b) => b.kind === 'rule').length, tradesWeek60: L(h.trades), tradesPerWeekLast10: last10.reduce((a, b) => a + b, 0) / last10.length, vault: L(h.p), marks: L(h.pMark), gini: L(h.gini) } }));
