// Tactic timeline: reads a run's frames and prints the tactic tracker's history (engine tacticTrack, frame.gen.tactics)
// as a readable timeline: which tactics the bots' actual behaviour fell into each generation, how each spread (bots that
// stayed, switched in, copied a member's networks, inherited, arrived new), which were born, which died, and the
// crowding and cannibalization flags. Measurement only: it reads, it never runs the world.
//
//   node sandbox/tactics_report.mjs <run.json> [--grid] [--json]
//
// <run.json>: a run saved by sandbox/run.mjs or by the page's Save run ({frames: [...]}), or any JSON with `frames`
// (each a frame or {t, gen}) or `gens` (a list of frame.gen records). --grid adds a share-by-generation table,
// --json prints the parsed history as JSON instead.
import fs from 'node:fs';

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error('usage: node sandbox/tactics_report.mjs <run.json> [--grid] [--json]'); process.exit(1); }
const run = JSON.parse(fs.readFileSync(file, 'utf8'));
const recs = new Map(); // one record per generation (frames between generation ends repeat the last)
for (const g of [...(run.gens || []), ...(run.frames || []).map((f) => f?.gen)]) if (g?.tactics && g.gen != null) recs.set(g.gen, g);
const gens = [...recs.values()].sort((a, b) => a.gen - b.gen);
if (!gens.length) { console.log('No tactic records in this run (the tracker needs `tactics` on and at least one generation end).'); process.exit(0); }
if (flags.includes('--json')) { console.log(JSON.stringify(gens.map((g) => ({ gen: g.gen, t: g.t, ...g.tactics })), null, 1)); process.exit(0); }

const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`), ret = (x) => (x == null ? '–' : `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`), pad = (s, n) => String(s).padEnd(n), lpad = (s, n) => String(s).padStart(n);
const FROM = [['stay', 'stayed'], ['switch', 'switched in'], ['copy', 'copied networks'], ['heir', 'heirs'], ['new', 'new']];
const life = new Map(); // id -> {born, parent, last, peak, peakGen, name, died}
const meta = run.meta || {}, cfg = run.config || {};
console.log(`Tactic timeline${meta.id ? ` · ${meta.id}` : ''}${meta.seed != null ? ` · seed ${meta.seed}` : ''} · ${gens.length} generation${gens.length > 1 ? 's' : ''}${cfg.tacticMatch != null ? ` · same tactic within ${cfg.tacticMatch} sd, trends over ${cfg.tacticWindow} gens` : ''}`);
console.log('Returns: median over the tactic\'s bots, at selling value (what fitness uses) / at marks.\n');
for (const g of gens) {
  const T = g.tactics;
  console.log(`Generation ${g.gen} (week ${g.t}) · ${T.k} tactics, silhouette ${T.sil} · ${T.bots} bots profiled${T.unprofiled ? `, ${T.unprofiled} too new` : ''}`);
  for (const t of T.list) {
    const L = life.get(t.id) || { born: t.born, parent: t.parent, peak: 0 }; L.last = g.gen; L.name = t.name; if (t.share > L.peak) { L.peak = t.share; L.peakGen = g.gen; L.peakName = t.name; } life.set(t.id, L);
    const fr = FROM.filter(([k]) => t.from?.[k]).map(([k, l]) => `${t.from[k]} ${l}`).join(', '), src = t.src?.length ? ` (from ${t.src.map(([id, n]) => `T${id}×${n}`).join(', ')})` : '';
    const mark = t.age === 0 ? (t.parent != null ? `+ NEW, branched from T${t.parent}${t.parentDist != null ? ` (distance ${t.parentDist})` : ''}` : '+ NEW') : `  age ${t.age}${t.dist != null ? `, moved ${t.dist}` : ''}`;
    console.log(`  ${pad('T' + t.id, 5)}${lpad(pct(t.share), 4)} ${lpad('(' + t.n + ')', 5)}  ${lpad(ret(t.ret?.[1]), 6)} / ${pad(ret(t.retMark?.[1]), 6)} ${t.name}`);
    console.log(`  ${' '.repeat(22)}${mark} · ${fr}${src}`);
    if (t.crowding) console.log(`  ${' '.repeat(22)}! CROWDING: its share rose and its return fell, generation after generation`);
    if (t.cannibalizedBy != null) console.log(`  ${' '.repeat(22)}! CANNIBALIZED by T${t.cannibalizedBy}: its share and return fell while T${t.cannibalizedBy}, the tactic nearest it, rose`);
  }
  for (const d of T.died) { const L = life.get(d.id); if (L) L.died = g.gen; console.log(`  x T${d.id} gone after ${d.age} gen${d.age === 1 ? '' : 's'} (last share ${pct(d.lastShare)}${d.into != null ? `, nearest now T${d.into}` : ''}): ${d.name}`); }
  console.log('');
}
console.log('Every tactic, by when it appeared');
console.log(`  ${pad('id', 5)}${pad('born', 6)}${pad('gone', 6)}${pad('peak', 11)}from  what its bots did at its peak`);
for (const [id, L] of [...life].sort((a, b) => a[0] - b[0])) console.log(`  ${pad('T' + id, 5)}${pad('g' + L.born, 6)}${pad(L.died != null ? 'g' + L.died : 'alive', 6)}${pad(`${pct(L.peak)} g${L.peakGen}`, 11)}${pad(L.parent != null ? 'T' + L.parent : '–', 6)}${L.peakName}`);
if (flags.includes('--grid')) {
  const ids = [...life.keys()].sort((a, b) => a - b);
  console.log('\nShare of bots by generation');
  console.log(`  ${pad('gen', 5)}${ids.map((id) => lpad('T' + id, 6)).join('')}`);
  for (const g of gens) { const m = new Map(g.tactics.list.map((t) => [t.id, t.share])); console.log(`  ${pad(g.gen, 5)}${ids.map((id) => lpad(m.has(id) ? pct(m.get(id)) : '·', 6)).join('')}`); }
}
