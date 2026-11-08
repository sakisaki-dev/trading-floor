// Draws the README's long-run figure from a summary written by scripts/summarize_saves.mjs (no 150 MB save needed):
//   (a) bots in the market (exact counts where a save holds them) and the largest family's share at each save
//   (b) trades and auction sales per week (20-week means)
//   (c) prices against hidden value: rank correlation, and the correlation of 20-week changes
// A dashed line marks each setting change after week 0.
//
//   node scripts/long_run_figure.mjs [results/long-runs/seed11906-realism.json] [docs/figures/long-run.svg]
import fs from 'node:fs';
import path from 'node:path';

const [inFile = 'results/long-runs/seed11906-realism.json', outFile = 'docs/figures/long-run.svg'] = process.argv.slice(2);
const S = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const C = { surface: '#0d1117', ink: '#f0f3f6', ink2: '#9ea7b3', muted: '#6e7681', grid: '#21262d', axis: '#30363d' };
const SERIES = ['#58a6ff', '#ff8a4c', '#3fd49a', '#f2c94c'];
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const W = 800, PADL = 56, PADR = 150, PW = W - PADL - PADR, t0 = 0, t1 = S.weeks;
const X = (t) => PADL + ((t - t0) / (t1 - t0)) * PW;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 100) / 100));
const niceTicks = (lo, hi, n = 4) => { const raw = (hi - lo || 1) / n, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw); const o = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) o.push(+v.toFixed(6)); return o; };
const out = []; let y = 0;
const changes = (S.settingChanges || []).filter((c) => c.week > 0);

out.push(`<text x="${PADL}" y="22" font-size="15" font-weight="600" fill="${C.ink}">Trading Floor, ${esc(S.preset)} preset, seed ${S.seed}, ${t1.toLocaleString('en-US')} weeks (engine 1.x)</text>`);
y = 36;
function panel(title, h, lo, hi, opts = {}) {
  const top = y + 22, bot = top + h, Y = (v) => bot - ((v - lo) / (hi - lo || 1)) * h;
  out.push(`<text x="${PADL}" y="${y + 14}" font-size="12.5" font-weight="600" fill="${C.ink}">${esc(title)}</text>`);
  for (const v of opts.ticks || niceTicks(lo, hi)) {
    out.push(`<line x1="${PADL}" x2="${PADL + PW}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${C.grid}"/>`);
    out.push(`<text x="${PADL - 8}" y="${(Y(v) + 4).toFixed(1)}" font-size="11" fill="${C.ink2}" text-anchor="end">${opts.fmt ? opts.fmt(v) : fmt(v)}</text>`);
  }
  out.push(`<line x1="${PADL}" x2="${PADL + PW}" y1="${bot}" y2="${bot}" stroke="${C.axis}"/>`);
  for (const c of changes) out.push(`<line x1="${X(c.week).toFixed(1)}" x2="${X(c.week).toFixed(1)}" y1="${top}" y2="${bot}" stroke="${C.muted}" stroke-dasharray="3 3"/>`);
  y = bot + 26; return { top, bot, Y };
}
const xAxis = (bot) => { for (const t of niceTicks(t0, t1, 8)) out.push(`<text x="${X(t).toFixed(1)}" y="${bot + 15}" font-size="11" fill="${C.ink2}" text-anchor="middle">${t.toLocaleString('en-US')}</text>`); };
const line = (pts, color, width = 2) => `<polyline fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(([x, v]) => `${X(x).toFixed(1)},${v.toFixed(1)}`).join(' ')}"/>`;
// split a series into runs of consecutive points (gaps where no save holds the data)
const runs = (pts, gap) => { const r = []; let cur = []; for (const p of pts) { if (cur.length && p[0] - cur.at(-1)[0] > gap) { r.push(cur); cur = []; } cur.push(p); } if (cur.length) r.push(cur); return r; };
function endLabels(items) { items.sort((a, b) => a.y - b.y); for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 14) items[i].y = items[i - 1].y + 14; for (const it of items) out.push(`<text x="${PADL + PW + 8}" y="${(it.y + 4).toFixed(1)}" font-size="11.5" fill="${C.ink}"><tspan fill="${it.color}">●</tspan> ${esc(it.label)}</text>`); }

// (a) population and the largest family
{
  const pop = S.population, hi = Math.max(...pop.map((p) => p[1])), ticks = niceTicks(0, hi * 1.08), P = panel('(a) Bots in the market, and the largest family\'s share (dots: share of all bots)', 140, 0, ticks.at(-1), { ticks });
  for (const r of runs(pop, 8)) out.push(r.length > 1 ? line(r.map(([t, v]) => [t, P.Y(v)]), SERIES[0]) : `<circle cx="${X(r[0][0]).toFixed(1)}" cy="${P.Y(r[0][1]).toFixed(1)}" r="2" fill="${SERIES[0]}"/>`);
  const Ys = (s) => P.bot - s * (P.bot - P.top);
  let best = -1; // label each new high, so a crowded run of saves doesn't stack labels
  for (const a of S.atSaves) { const f = a.families?.[0]; if (!f) continue; const x = X(a.week), lab = f.share > best; best = Math.max(best, f.share);
    out.push(`<circle cx="${x.toFixed(1)}" cy="${Ys(f.share).toFixed(1)}" r="4.5" fill="${SERIES[1]}"/>`);
    if (lab) out.push(`<text x="${x.toFixed(1)}" y="${(Ys(f.share) - 8).toFixed(1)}" font-size="10.5" fill="${C.ink2}" text-anchor="middle">${Math.round(f.share * 100)}%</text>`); }
  const lastA = S.atSaves.at(-1);
  endLabels([{ y: P.Y(pop.at(-1)[1]) + 22, color: SERIES[0], label: `Bots ${pop.at(-1)[1]}` }, { y: Ys(lastA.families[0].share) + 18, color: SERIES[1], label: `Top family ${Math.round(lastA.families[0].share * 100)}%` }]);
  xAxis(P.bot);
}
// (b) activity
{
  const tr = S.series.map((s) => [s.week, s.tradesPerWeek]), au = S.series.map((s) => [s.week, s.auctionSalesPerWeek]);
  const hi = Math.max(...tr.map((x) => x[1]), ...au.map((x) => x[1])), ticks = niceTicks(0, hi * 1.05), P = panel('(b) Sales per week: order-book trades and card auctions (20-week means)', 120, 0, ticks.at(-1), { ticks });
  out.push(line(au.map(([t, v]) => [t, P.Y(v)]), SERIES[1], 1.6), line(tr.map(([t, v]) => [t, P.Y(v)]), SERIES[0], 1.6));
  endLabels([{ y: P.Y(tr.at(-1)[1]), color: SERIES[0], label: `Trades ${tr.at(-1)[1]}` }, { y: P.Y(au.at(-1)[1]), color: SERIES[1], label: `Auctions ${au.at(-1)[1]}` }]);
  xAxis(P.bot);
}
// (c) prices against value
{
  const rk = S.series.filter((s) => s.priceValueRank != null).map((s) => [s.week, s.priceValueRank]), ch = S.series.filter((s) => s.changeCorr20 != null).map((s) => [s.week, s.changeCorr20]);
  const lo = Math.min(0, ...ch.map((x) => x[1])), P = panel('(c) Do prices follow the football? Correlations of price with hidden value, across players', 120, lo, 1, { ticks: niceTicks(lo, 1, 4) });
  out.push(line(ch.map(([t, v]) => [t, P.Y(v)]), SERIES[2], 1.4), line(rk.map(([t, v]) => [t, P.Y(v)]), SERIES[0], 1.8));
  endLabels([{ y: P.Y(rk.at(-1)[1]), color: SERIES[0], label: `Rank ${rk.at(-1)[1].toFixed(2)}` }, { y: P.Y(ch.at(-1)[1]), color: SERIES[2], label: `Changes ${ch.at(-1)[1].toFixed(2)}` }]);
  xAxis(P.bot);
}
const note = changes.length ? `Dashed: ${changes.map((c) => `${c.rule} ${JSON.stringify(c.value)} at week ${c.week.toLocaleString('en-US')}`).join('; ')}. ` : '';
out.push(`<text x="${PADL}" y="${y + 4}" font-size="10.5" fill="${C.muted}">Weeks on the x-axis. ${esc(note)}Data: ${esc(path.basename(inFile))}.</text>`);
const H = Math.ceil(y + 18);
fs.writeFileSync(outFile, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}" role="img" aria-label="Long run, seed ${S.seed}: bot population and the largest family's share, sales per week, and how closely prices follow hidden value over ${t1} weeks">
<rect width="${W}" height="${H}" fill="${C.surface}"/>
${out.join('\n')}
</svg>
`);
console.log(`wrote ${outFile} (${W}×${H})`);
