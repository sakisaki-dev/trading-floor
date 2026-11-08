// Does an engine change keep every result? Runs the same worlds on two engines and compares every week's full frame
// (tests/frame_hash.mjs, one process per run, `--jobs` at a time). Use it for speed work: every hash must match.
//   git show <commit>:engine.mjs > /tmp/engine.base.mjs
//   node tests/same_results.mjs --base /tmp/engine.base.mjs [--engine engine.mjs] [--only realism40,laws30] [--jobs 3] [--out DIR]
// The worlds cover the Realism and default presets, practice, the single random stream, the Vault store, heavy shorting and
// credit, short lives (deaths and estates), the attention budget, offspring entrants with fitness sharing, and fashion,
// limits, league updates, fixed pack prices and value openings. Exit code 0 when every run matches.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
export const WORLDS = [
  ['realism40', 'realism', 40, { practiceGens: 0 }],
  ['realismPractice20', 'realism', 20, {}],
  ['laws30', 'laws', 30, {}],
  ['single20', 'realism', 20, { practiceGens: 0, rngStreams: 'single' }],
  ['store15', 'realism', 15, { practiceGens: 0, store: true }],
  ['shortCredit20', 'realism', 20, { practiceGens: 0, maxShorts: 100, maxLTV: 0.9, marginCall: 0.95, loanWeeks: 3, cardLendFee: 0.0005, shortMargin: 0.3 }],
  ['deaths30', 'realism', 30, { practiceGens: 0, weeksPerGeneration: 5, lifespan: [1, 2], heirs: 1, estateSale: 0.8 }],
  ['attention15', 'realism', 15, { practiceGens: 0, attention: 150, attentionSample: 'volume' }],
  ['offspring30', 'realism', 30, { practiceGens: 0, weeksPerGeneration: 6, entrants: 'offspring', fitnessSharing: 1 }],
  ['lawsVariety20', 'laws', 20, { fashion: true, priceLimit: 0.2, positionLimit: 5, leagueUpdates: true, packSale: 'fixed', openPrice: 'value' }],
];
const base = opt('base'), eng = path.resolve(opt('engine', path.join(here, '..', 'engine.mjs'))), only = opt('only'), jobs = +opt('jobs', 3);
const out = opt('out', fs.mkdtempSync(path.join(os.tmpdir(), 'same-results-')));
if (!base) { console.log('usage: node tests/same_results.mjs --base OLD_ENGINE [--engine NEW] [--only a,b] [--jobs N] [--out DIR]'); process.exit(2); }
const list = WORLDS.filter((w) => !only || only.split(',').includes(w[0])), runs = [];
for (const [tag, e] of [['base', path.resolve(base)], ['new', eng]]) for (const w of list) runs.push([tag, e, ...w]);
fs.mkdirSync(path.join(out, 'base'), { recursive: true }); fs.mkdirSync(path.join(out, 'new'), { recursive: true });
let next = 0; const worker = async () => { while (next < runs.length) { const [tag, e, name, preset, weeks, set] = runs[next++];
  await new Promise((res) => { const o = fs.openSync(path.join(out, tag, name + '.json'), 'w');
    const p = spawn(process.execPath, [path.join(here, 'frame_hash.mjs'), '--engine', e, '--preset', preset, '--weeks', String(weeks), '--set', JSON.stringify(set)], { stdio: ['ignore', o, 'inherit'] });
    p.on('exit', (code) => { fs.closeSync(o); if (code) console.log(`${tag} ${name}: exit ${code}`); res(); }); }); } };
await Promise.all(Array.from({ length: jobs }, worker));
let bad = 0;
for (const [name] of list) { const rd = (t) => { try { return JSON.parse(fs.readFileSync(path.join(out, t, name + '.json'), 'utf8')); } catch { return null; } }, a = rd('base'), b = rd('new');
  if (!a || !b) { bad++; console.log(`${name.padEnd(20)} MISSING`); continue; }
  let first = -1; for (let t = 0; t < Math.max(a.frames.length, b.frames.length); t++) if (a.frames[t] !== b.frames[t]) { first = t; break; }
  const same = first < 0 && a.hash === b.hash; if (!same) bad++;
  console.log(`${name.padEnd(20)} ${same ? 'same' : 'DIFFERENT from frame ' + first}  ${a.frames.length} frames  hash ${a.hash.slice(0, 12)} / ${b.hash.slice(0, 12)}`); }
console.log(bad ? `${bad} of ${list.length} differ (runs in ${out})` : `all ${list.length} match (runs in ${out})`); process.exit(bad ? 1 : 0);
