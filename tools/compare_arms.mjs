// Compares government runs against the scripted arms (spec 12.2): end values, whole-run and second-half means of the
// public indicators plus the engine's own distress measures, and whether a run lies beyond the spread of the A0 seeds.
//   node tools/compare_arms.mjs <runDir>... [--json out.json]
// A run dir holds run.json from regulate.mjs. A0 runs are recognised by meta.government === 'A0'.
import fs from 'node:fs'; import path from 'node:path';
const argv = process.argv.slice(2), jI = argv.indexOf('--json'), jsonOut = jI >= 0 ? argv.splice(jI, 2)[1] : null;
// GOV_INDICATORS at the time govX.ind was first recorded; later engines may append fields, never reorder these.
const IND = ['week', 'bots', 'joined', 'left', 'vaultIndex', 'vaultIndex1w', 'vaultIndex4w', 'vaultIndex20w', 'marksIndex', 'trades', 'auctionSales', 'treasury', 'treasury20w', 'revenue', 'revenue4w', 'spending', 'spending4w', 'consumption', 'ownAccount', 'medianWorth', 'meanCash', 'gini', 'packPrice', 'creditRate', 'approval'];
const at = (k) => IND.indexOf(k);
// What each week contributes: [name, (frame) => number]
const SERIES = [
  ['bots', (f) => f.govX?.ind?.[at('bots')]],
  ['medianWorth', (f) => f.govX?.ind?.[at('medianWorth')]],
  ['meanCash', (f) => f.govX?.ind?.[at('meanCash')]],
  ['gini', (f) => f.h?.gini],
  ['brokeShare', (f) => (f.mkt?.broke != null && f.govX?.ind?.[at('bots')] ? f.mkt.broke / f.govX.ind[at('bots')] : null)],
  ['arrearsBots', (f) => f.arrears?.bots],
  ['cashTop10', (f) => f.mkt?.cashTop10],
  ['vaultIndex', (f) => f.govX?.ind?.[at('vaultIndex')]],
  ['marksIndex', (f) => f.govX?.ind?.[at('marksIndex')]],
  ['trades', (f) => f.govX?.ind?.[at('trades')]],
  ['treasury', (f) => f.gov?.T],
  ['ownAccount', (f) => f.gov?.acct],
  ['botCash', (f) => f.mkt?.cash],
  ['cardValue', (f) => f.mkt?.vcap],
  ['forcedSales', (f) => (f.forced ? Object.values(f.forced).reduce((s, x) => s + x, 0) : null)],
];
const mean = (a) => { const v = a.filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
function load(dir) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8')), F = r.frames, n = F.length - 1;
  const gov = r.meta?.government ?? r.meta?.args?.government ?? JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')).args?.government;
  const out = { dir: path.basename(dir), gov, weeks: n, end: {}, all: {}, half: {}, flows: { created: {}, removed: {} } };
  for (const [k, g] of SERIES) { const s = F.slice(1).map(g); out.end[k] = s[s.length - 1] ?? null; out.all[k] = mean(s); out.half[k] = mean(s.slice(s.length >> 1)); }
  for (const f of F.slice(1)) for (const side of ['created', 'removed']) for (const [k, v] of Object.entries(f.money?.[side] || {})) out.flows[side][k] = (out.flows[side][k] || 0) + v;
  out.turns = r.gov?.decisions?.filter((d) => d.type === 'turn').length ?? 0;
  return out;
}
const runs = argv.map(load), a0 = runs.filter((r) => r.gov === 'A0');
const fmt = (x) => (x == null ? '—' : Math.abs(x) >= 1e4 ? `${(x / 1e3).toFixed(0)}k` : Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(3));
for (const win of ['end', 'half']) {
  console.log(`\n${win === 'end' ? 'Last week' : 'Mean over the second half'}`);
  console.log(['metric', ...runs.map((r) => r.dir), a0.length > 1 ? 'A0 range' : ''].join('\t'));
  for (const [k] of SERIES) {
    const v = runs.map((r) => r[win][k]), av = a0.map((r) => r[win][k]).filter((x) => x != null), lo = Math.min(...av), hi = Math.max(...av);
    const cells = runs.map((r, i) => fmt(v[i]) + (a0.length > 1 && r.gov !== 'A0' && v[i] != null ? (v[i] < lo ? ' ▼' : v[i] > hi ? ' ▲' : '') : ''));
    console.log([k, ...cells, a0.length > 1 ? `${fmt(lo)}–${fmt(hi)}` : ''].join('\t'));
  }
}
console.log('\n▲/▼: beyond the range of the A0 seeds.');
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(runs, null, 1));
