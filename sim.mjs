// Headless run of the neural-bot world (no AI seats). Writes a summary per week and the full frames, so a run can be
// replayed on the page (Load run) and analysed with tactics_report.mjs.
//
//   node sim.mjs --preset realism --seed 31761 --weeks 300 --out runs/realism-31761
//   node sim.mjs --config my.json --seed 7 --weeks 100            # any engine settings as JSON
//
// Options: --preset realism | laws (the engine defaults); --config FILE (merged over the preset); --set '{"fee":0.02}'
// (merged last); --seed N; --weeks N; --out DIR (default runs/<preset>-<seed>). Every run is deterministic: the same
// code, settings and seed give the same frames.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import * as E from './engine.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const d = path.join(here, 'data'), rd = (f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
const lib = rd('library.json'); lib.timeline = rd('timeline.json'); for (const k of ['history', 'kits', 'names']) lib[k] = rd(k + '.json');
lib.leagueRates = rd('league_rates.json'); lib.rookieNames = rd('rookie_names.json'); lib.nflAge = rd('nfl_age.json');
const preset = opt('preset', 'realism'), base = preset === 'laws' ? {} : JSON.parse(fs.readFileSync(path.join(here, 'configs', preset + '.json'), 'utf8'));
const cfg = { ...base, ...(opt('config') ? JSON.parse(fs.readFileSync(opt('config'), 'utf8')) : {}), ...JSON.parse(opt('set', '{}')) };
const seed = +opt('seed', 31761), weeks = +opt('weeks', 100), out = opt('out', path.join(here, 'runs', `${preset}-${seed}`));
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now(), W = E.createWorld(lib, { ...cfg, seed }), frames = [E.frame(W, { full: true })];
console.log(`world ready in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${W.bots.length} bots, ${W.players.length} players`);
const t1 = Date.now();
for (let i = 1; i <= weeks; i++) { E.step(W); frames.push(E.frame(W, { full: true }));
  if (i % 10 === 0 || i === weeks) { const s = (Date.now() - t1) / 1000 / i; console.log(`week ${i}/${weeks} · ${s.toFixed(2)} s/week · Vault ${W.hist.p.at(-1).toFixed(1)} · ${W.bots.filter((b) => b.kind === 'rule').length} bots`); }
  if (i % 50 === 0 || i === weeks) fs.writeFileSync(path.join(out, 'run.json'), JSON.stringify({ format: 'rv-sandbox-run/1', meta: { id: path.basename(out), seed, preset, weeks: i, engine: 'engine.mjs', rng: W.rngLayout, secsPerWeek: (Date.now() - t1) / 1000 / i }, config: W.cfg, frames })); }
console.log(`saved ${path.join(out, 'run.json')}`);
