// Draws the README overview figure from a saved run: three stacked panels over weeks.
//   (a) the Vault index and the marks index
//   (b) the bot population, with cumulative entries and exits
//   (c) tactic shares by generation (frame.gen.tactics), when the run has them
// Reads only the run file; writes a self-contained SVG (no external fonts or scripts).
//
//   node scripts/figure.mjs [runs/fig-31761/run.json] [docs/figures/overview.svg]
import fs from 'node:fs';
import path from 'node:path';

const [inFile = 'runs/fig-31761/run.json', outFile = 'docs/figures/overview.svg'] = process.argv.slice(2);
const run = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const F = run.frames || [];
if (!F.length) { console.error(`no frames in ${inFile}`); process.exit(1); }
const meta = run.meta || {};

// Colours: the reference categorical palette (light mode), in fixed order; text and grid in neutral inks
const C = { surface: '#fcfcfb', ink: '#0b0b0b', ink2: '#52514e', muted: '#8a8984', grid: '#e7e6e2', axis: '#c9c8c3' };
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const W = 800, PADL = 56, PADR = 150, PW = W - PADL - PADR;
const weeks = F.map((f) => f.t), t0 = Math.min(...weeks), t1 = Math.max(...weeks);
const X = (t) => PADL + ((t - t0) / Math.max(1, t1 - t0)) * PW;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 10) / 10));
const niceTicks = (lo, hi, n = 4) => {
  const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw);
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6)); return out;
};
const out = [];
let y = 0;

// Title
out.push(`<text x="${PADL}" y="22" font-size="15" font-weight="600" fill="${C.ink}">Trading Floor, Realism preset, seed ${esc(meta.seed ?? '?')}, ${t1} weeks</text>`);
y = 36;

// One panel: a frame with gridlines, a y axis and a title
function panel(title, h, lo, hi, opts = {}) {
  const top = y + 22, bot = top + h, Y = (v) => bot - ((v - lo) / (hi - lo || 1)) * h;
  out.push(`<text x="${PADL}" y="${y + 14}" font-size="12.5" font-weight="600" fill="${C.ink}">${esc(title)}</text>`);
  for (const v of opts.ticks || niceTicks(lo, hi)) {
    out.push(`<line x1="${PADL}" x2="${PADL + PW}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${C.grid}" stroke-width="1"/>`);
    out.push(`<text x="${PADL - 8}" y="${(Y(v) + 4).toFixed(1)}" font-size="11" fill="${C.ink2}" text-anchor="end">${opts.fmt ? opts.fmt(v) : fmt(v)}</text>`);
  }
  out.push(`<line x1="${PADL}" x2="${PADL + PW}" y1="${bot}" y2="${bot}" stroke="${C.axis}" stroke-width="1"/>`);
  y = bot + 26;
  return { top, bot, Y };
}
function xAxis(bot) {
  for (const t of niceTicks(t0, t1, 8)) out.push(`<text x="${X(t).toFixed(1)}" y="${bot + 15}" font-size="11" fill="${C.ink2}" text-anchor="middle">${t}</text>`);
}
const line = (pts, color, width = 2) => `<polyline fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(([t, v]) => `${X(t).toFixed(1)},${v.toFixed(1)}`).join(' ')}"/>`;
// Direct labels at the right end, nudged apart so they never overlap
function endLabels(items) {
  items.sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 14) items[i].y = items[i - 1].y + 14;
  for (const it of items) out.push(`<text x="${PADL + PW + 8}" y="${(it.y + 4).toFixed(1)}" font-size="11.5" fill="${C.ink}"><tspan fill="${it.color}">●</tspan> ${esc(it.label)}</text>`);
}

// (a) Vault index and marks index
{
  const p = F.map((f) => [f.t, f.h?.p]).filter(([, v]) => Number.isFinite(v)), m = F.map((f) => [f.t, f.h?.pMark]).filter(([, v]) => Number.isFinite(v));
  const all = [...p, ...m].map(([, v]) => v), lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.08 || 5;
  const ticks = niceTicks(lo - pad, hi + pad), P = panel('(a) Price indexes (start = 100)', 150, Math.min(ticks[0], lo - pad), Math.max(ticks.at(-1), hi + pad), { ticks });
  out.push(line(m.map(([t, v]) => [t, P.Y(v)]), SERIES[1]), line(p.map(([t, v]) => [t, P.Y(v)]), SERIES[0]));
  endLabels([{ y: P.Y(p.at(-1)[1]), color: SERIES[0], label: `Vault index ${Math.round(p.at(-1)[1])}` }, { y: P.Y(m.at(-1)[1]), color: SERIES[1], label: `Marks index ${Math.round(m.at(-1)[1])}` }]);
  xAxis(P.bot);
}

// (b) Population, cumulative entries and exits
{
  let cj = 0, cl = 0; const pop = [], ent = [], ext = [];
  for (const f of F) { cj += f.people?.joined || 0; cl += f.people?.left || 0; pop.push([f.t, f.bots?.length ?? 0]); ent.push([f.t, cj]); ext.push([f.t, cl]); }
  const hi = Math.max(...pop.map((x) => x[1]), cj, cl), ticks = niceTicks(0, hi * 1.05), P = panel('(b) Bots in the market, and cumulative arrivals and departures', 130, 0, Math.max(ticks.at(-1), hi), { ticks });
  out.push(line(ext.map(([t, v]) => [t, P.Y(v)]), SERIES[1]), line(ent.map(([t, v]) => [t, P.Y(v)]), SERIES[2]), line(pop.map(([t, v]) => [t, P.Y(v)]), SERIES[0]));
  endLabels([{ y: P.Y(pop.at(-1)[1]), color: SERIES[0], label: `Bots ${pop.at(-1)[1]}` }, { y: P.Y(cj), color: SERIES[2], label: `Arrived ${cj}` }, { y: P.Y(cl), color: SERIES[1], label: `Left ${cl}` }]);
  xAxis(P.bot);
}

// (c) Tactic shares by generation: stacked bars, one per generation, ending at the generation's last week
const gens = new Map(); for (const f of F) { const g = f.gen; if (g?.tactics && g.gen != null) gens.set(g.gen, g); }
const G = [...gens.values()].sort((a, b) => a.gen - b.gen);
const legendRows = [];
if (G.length) {
  const ids = [...new Set(G.flatMap((g) => g.tactics.list.map((t) => t.id)))].sort((a, b) => a - b), color = new Map(ids.map((id, i) => [id, i < SERIES.length ? SERIES[i] : C.muted]));
  const P = panel('(c) Tactics: share of profiled bots, by generation (20 weeks each)', 120, 0, 1, { ticks: [0, 0.25, 0.5, 0.75, 1], fmt: (v) => `${Math.round(v * 100)}%` });
  const wpg = run.config?.weeksPerGeneration || 20;
  for (const g of G) {
    const xr = X(g.t) - 1, xl = X(Math.max(t0, g.t - wpg)) + 1; let acc = 0;
    for (const t of g.tactics.list.slice().sort((a, b) => a.id - b.id)) {
      const y0 = P.Y(acc), y1 = P.Y(acc + t.share); acc += t.share;
      out.push(`<rect x="${xl.toFixed(1)}" y="${(y1 + 1).toFixed(1)}" width="${(xr - xl).toFixed(1)}" height="${Math.max(0, y0 - y1 - 2).toFixed(1)}" fill="${color.get(t.id)}"/>`);
    }
    out.push(`<text x="${((xl + xr) / 2).toFixed(1)}" y="${P.bot + 15}" font-size="10.5" fill="${C.ink2}" text-anchor="middle">g${g.gen}</text>`);
  }
  const last = G.at(-1), nameOf = new Map(); for (const g of G) for (const t of g.tactics.list) nameOf.set(t.id, t.name);
  let acc = 0; const labs = [];
  for (const t of last.tactics.list.slice().sort((a, b) => a.id - b.id)) { labs.push({ y: P.Y(acc + t.share / 2), color: color.get(t.id), label: `T${t.id} ${Math.round(t.share * 100)}%` }); acc += t.share; }
  endLabels(labs);
  for (const id of ids) legendRows.push([color.get(id), `T${id}`, nameOf.get(id)]);
  y = P.bot + 30;
  for (const [c, id, name] of legendRows) {
    const txt = name.length > 100 ? name.slice(0, 97) + '…' : name;
    out.push(`<text x="${PADL}" y="${y}" font-size="11" fill="${C.ink2}"><tspan fill="${c}">■</tspan> <tspan fill="${C.ink}" font-weight="600">${id}</tspan> ${esc(txt)}</text>`); y += 16;
  }
  y += 4;
} else {
  out.push(`<text x="${PADL}" y="${y + 14}" font-size="12" fill="${C.ink2}">(c) No tactic records in this run.</text>`); y += 30;
}

// Footer: the command and the run's pace
out.push(`<text x="${PADL}" y="${y + 6}" font-size="10.5" fill="${C.muted}">Weeks on the x-axis. node sim.mjs --preset ${esc(meta.preset ?? 'realism')} --seed ${esc(meta.seed ?? '?')} --weeks ${esc(meta.weeks ?? t1)}${meta.secsPerWeek ? ` · ${meta.secsPerWeek.toFixed(2)} s/week` : ''}</text>`);
const H = Math.ceil(y + 18);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}" role="img" aria-label="Trading Floor overview: price indexes, bot population and tactic shares over ${t1} weeks">
<rect width="${W}" height="${H}" fill="${C.surface}"/>
${out.join('\n')}
</svg>
`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, svg);
console.log(`wrote ${outFile} (${W}×${H}, ${F.length} frames, ${G.length} generations)`);
