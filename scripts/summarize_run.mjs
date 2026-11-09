// Turns one saved Trading Floor page run (30–150 MB, kept out of git) into a small per-generation summary, so the
// figures that docs/PARALLELS.md cites for engine 2.0 runs can be checked without the save.
//
//   node --max-old-space-size=8192 scripts/summarize_run.mjs results/runs/<name>.json runs/saves/<save>.json
//
// For every generation (every 20 weeks) it records the price indexes, inequality, the auction premium, the order
// book, credit, evolution measures (return carry-over, the largest family, exits, entries, heirs, the median quitting
// tendency of new bots) and the tactic list. Bot counts come from full frames only, which a save keeps for its last
// ~104 weeks; earlier generations use the population the generation record reports.
import fs from 'node:fs';
import path from 'node:path';

const [outFile, file] = process.argv.slice(2);
if (!outFile || !file) { console.error('usage: summarize_run.mjs <out.json> <save.json>'); process.exit(1); }

const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const F = d.frames, m = d.meta;

const generations = [];
const seen = new Set();
for (const f of F) {
  const g = f.gen;
  if (!g || seen.has(g.gen)) continue;
  seen.add(g.gen);
  const h = f.h || {}, mk = f.mkt || {}, ord = f.ord || {}, book = f.bookD || {}, cr = f.credit || {};
  generations.push({
    gen: g.gen,
    week: f.t,
    population: g.population ?? null,
    indexes: { vault: r3(h.p), marks: r3(h.pMark), value: r3(h.f), priceOverValue: r3(h.bub) },
    gini: r3(h.gini),
    worthShare: (h.share || []).map(r3),
    cashShare: (mk.cashShare || []).map(r3),
    auctionOverMark: r3(ord.aucVsMark),
    book: { noOrders: r3(book.neither), bids: book.bids ?? null, asks: book.asks ?? null, bidDistLog: r3(book.bidDist) },
    credit: { offered: cr.offered ?? null, asked: cr.asked ?? null, lent: cr.lent ?? null, debt: mk.debt ?? null },
    returnCarryOver: r3(g.persistBid),
    largestFamily: r3(g.lineTop),
    exits: g.exitCause || {},
    entries: g.entries ?? null,
    heirs: g.heirs ?? null,
    quitNewMedian: r3((g.quitNew || [])[0]),
    tactics: (g.tactics?.list || []).map((t) => ({
      id: t.id, share: r3(t.share), ret: r3((t.ret || [])[0]), name: t.name, cannibalizedBy: t.cannibalizedBy ?? null,
    })),
    tacticsDied: (g.tactics?.died || []).map((t) => ({ id: t.id, name: t.name, lastShare: r3(t.lastShare), into: t.into })),
  });
}

const last = F[F.length - 1];
const out = {
  source: path.basename(file),
  seed: m.seed,
  preset: m.preset,
  weeks: m.weeks,
  savedAt: m.savedAt,
  presetRules: m.presetRules,
  startingRules: m.startingRules,
  end: {
    week: last.t,
    bots: last.bots ? last.bots.length : null,
    lineages: last.lineages || null,
    indexes: { vault: r3(last.h?.p), marks: r3(last.h?.pMark), value: r3(last.h?.f), priceOverValue: r3(last.h?.bub) },
    gini: r3(last.h?.gini),
    cashShare: (last.mkt?.cashShare || []).map(r3),
    auctionOverMark: r3(last.ord?.aucVsMark),
    topCards: (last.top || []).slice(0, 3).map((c) => ({ label: c.label, mark: Math.round(c.P), value: Math.round(c.F) })),
  },
  generations,
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n');
console.log(`${outFile}: ${generations.length} generations, ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`);
