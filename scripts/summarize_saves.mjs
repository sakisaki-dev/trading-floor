// Turns the Trading Floor page's saved runs (150 MB each, kept out of git) into one small summary per run that anyone
// can check the README's long-run findings against. Give every save of one run, in any order: the longest supplies the
// week-by-week series, and each save's last frame supplies what only the latest frames carry (lineages, bot count,
// credit outputs, skill carry-over).
//
//   node --max-old-space-size=8192 scripts/summarize_saves.mjs results/long-runs/<name>.json runs/page-seed11906-*.json
//
// Series (every 20 weeks): trades and auction sales per week (20-week means), the cash share of the 10% of bots with the
// most cash, broke bots, the median lending share (the share of idle cash bots offer to lend), and three
// price-versus-value measures across players: the median price ÷ hidden value, the rank correlation of price with
// value, and the correlation of 20-week log changes in price with 20-week log changes in value.
// Population: exact bot counts, which only the last ~104 frames of each save carry (`population`, every 4 weeks). The
// weekly joins and exits leave out heirs, so the population is not rebuilt from them.
import fs from 'node:fs';
import path from 'node:path';

const [outFile, ...files] = process.argv.slice(2);
if (!outFile || !files.length) { console.error('usage: summarize_saves.mjs <out.json> <save.json>...'); process.exit(1); }

const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const corr = (a, b) => { if (a.length < 3) return null; const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return saa && sbb ? sab / Math.sqrt(saa * sbb) : null; };
const ranks = (a) => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length); o.forEach(([, i], k) => (r[i] = k)); return r; };
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);

const saves = files.map((f) => { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return { file: path.basename(f), d }; }).sort((a, b) => a.d.frames.length - b.d.frames.length);
const longest = saves[saves.length - 1].d, F = longest.frames;

// Population: exact counts from every save's full frames
const popAt = new Map(); for (const { d } of saves) for (const f of d.frames) if (f.bots && f.t % 4 === 0) popAt.set(f.t, f.bots.length);
const population = [...popAt.entries()].sort((a, b) => a[0] - b[0]);

const series = [];
for (let t = 20; t < F.length; t += 20) {
  const f = F[t], seg = F.slice(t - 19, t + 1), P = f.prices || [], V = f.values || [], P0 = F[t - 20].prices || [], V0 = F[t - 20].values || [];
  const ok = (i) => P[i] > 0 && V[i] > 0, idx = P.map((_, i) => i).filter(ok);
  const both = idx.filter((i) => P0[i] > 0 && V0[i] > 0);
  series.push({
    week: t,
    tradesPerWeek: Math.round(mean(seg.map((x) => x.h?.trades || 0))),
    auctionSalesPerWeek: Math.round(mean(seg.map((x) => x.ord?.aucSold || 0))),
    cashTop10: r3(f.mkt?.cashTop10), broke: f.mkt?.broke ?? null, lendShareMedian: r3(f.credit?.all?.lendShare?.[2]),
    medianValue: r3(median(idx.map((i) => V[i]))), priceOverValue: r3(median(idx.map((i) => P[i] / V[i]))),
    priceValueRank: r3(corr(ranks(idx.map((i) => P[i])), ranks(idx.map((i) => V[i])))),
    changeCorr20: r3(corr(both.map((i) => Math.log(P[i] / P0[i])), both.map((i) => Math.log(V[i] / V0[i])))),
  });
}

// What only the latest frames carry, at each save's end
const atSaves = saves.map(({ file, d }) => {
  const f = d.frames[d.frames.length - 1], same = F[f.t];
  const fam = new Map(); for (const b of f.bots || []) fam.set(b[14], (fam.get(b[14]) || 0) + 1);
  const top = [...fam.entries()].sort((a, b) => b[1] - a[1]);
  return {
    file, week: f.t, bots: (f.bots || []).length,
    families: top.slice(0, 5).map(([id, n]) => ({ id, bots: n, share: r3(n / f.bots.length) })),
    familyDepth: f.lineages?.depth ?? null,
    lendShareMedian: f.credit?.all?.lendShare?.[2] ?? null,
    skillCarryOver: f.persist ?? null,
    sameRunAsLongest: !!same && JSON.stringify(same.h) === JSON.stringify(f.h),
  };
});

const out = {
  about: 'Summary of one Trading Floor page run, built by scripts/summarize_saves.mjs from the saves listed. Engine 1.x (before the 2.0 audit).',
  seed: longest.meta.seed, preset: longest.meta.preset, weeks: F.length - 1, savedAt: longest.meta.savedAt,
  settingChanges: longest.meta.changes || [], saves: saves.map((s) => s.file),
  atSaves, population, series,
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n');
console.log(`${outFile}: ${series.length} points, ${atSaves.length} saves, ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`);
