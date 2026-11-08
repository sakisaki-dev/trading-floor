// Hash every week's full frame of one run, for checking that an engine change keeps every result (a speed change must
// give the same hashes as the engine before it). One engine per process: the engine keeps module-level buffers.
//   node tests/frame_hash.mjs --engine engine.mjs --preset realism --seed 31761 --weeks 40 --set '{"practiceGens":0}'
//   node tests/frame_hash.mjs --compare A.json B.json      # two outputs: same hashes week by week?
// Prints JSON: {engine, preset, seed, weeks, set, secsSetup, secsPerWeek, hash (of all weeks), frames: [sha1 per frame]}.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
if (argv.includes('--compare')) {
  const i = argv.indexOf('--compare'), [a, b] = [argv[i + 1], argv[i + 2]].map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const n = Math.max(a.frames.length, b.frames.length); let first = -1; for (let t = 0; t < n; t++) if (a.frames[t] !== b.frames[t]) { first = t; break; }
  console.log(first < 0 && a.hash === b.hash ? `same: ${n} frames, hash ${a.hash.slice(0, 12)}` : `DIFFERENT from frame ${first}`); process.exit(first < 0 ? 0 : 1);
}
const E = await import(pathToFileURL(path.resolve(opt('engine', path.join(here, '..', 'engine.mjs')))).href);
const d = path.join(here, '..', 'data'), rd = (f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
const lib = rd('library.json'); lib.timeline = rd('timeline.json'); for (const k of ['history', 'kits', 'names']) lib[k] = rd(k + '.json');
lib.leagueRates = rd('league_rates.json'); lib.rookieNames = rd('rookie_names.json'); lib.nflAge = rd('nfl_age.json');
const preset = opt('preset', 'realism'), base = preset === 'laws' ? {} : JSON.parse(fs.readFileSync(path.join(here, '..', 'configs', preset + '.json'), 'utf8'));
const set = JSON.parse(opt('set', '{}')), seed = +opt('seed', 31761), weeks = +opt('weeks', 20);
const h = (f) => crypto.createHash('sha1').update(JSON.stringify(f)).digest('hex');
const t0 = process.hrtime.bigint(), W = E.createWorld(lib, { ...base, ...set, seed }), out = [h(E.frame(W, { full: true }))], t1 = process.hrtime.bigint();
for (let t = 1; t <= weeks; t++) { E.step(W); out.push(h(E.frame(W, { full: true }))); }
const t2 = process.hrtime.bigint();
console.log(JSON.stringify({ engine: opt('engine', 'engine.mjs'), preset, seed, weeks, set, secsSetup: Number(t1 - t0) / 1e9, secsPerWeek: Number(t2 - t1) / 1e9 / Math.max(1, weeks), hash: crypto.createHash("sha1").update(out.join()).digest("hex"), frames: out }));
