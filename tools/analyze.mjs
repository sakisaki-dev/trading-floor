// Summarizes a run saved from the Trading Floor page (Save run) or written by run.mjs.
//   node sandbox/analyze.mjs sandbox/runs/<file>.json
// Prints: the rules and every change made while it ran (with the market before and after), the market's path, the
// richest bots, the biggest trades and auctions, the most valuable card over time, packs, credit, theft and flags.
import fs from 'node:fs';
const file = process.argv[2];
if (!file) { console.error('usage: node sandbox/analyze.mjs <run.json>'); process.exit(1); }
const run = JSON.parse(fs.readFileSync(file, 'utf8'));
const F = run.frames || [], log = run.log || [], meta = run.meta || {};
const fmt = (x) => (x == null || !isFinite(x) ? '–' : Math.abs(x) >= 1000 ? Math.round(x).toLocaleString() : (+x).toFixed(1));
const pct = (x) => (x == null || !isFinite(x) ? '–' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`);
const at = (t) => F.find((f) => f.t >= t) || F[F.length - 1];
const pf = (f) => (f?.mkt?.vcap ? f.mkt.mcap / f.mkt.vcap : null);
const line = (s = '') => console.log(s);
// Card keys ("QB:Name|Prizm|Base") read as the page writes them ("QB Name · Base Prizm")
const cardName = (k) => { const m = /^([A-Z]+):(.+?)\|(\w+)\|(\w+)$/.exec(k || ''); return m ? `${m[1]} ${m[2]} · ${m[4]} ${m[3]}` : k; };

line(`Run ${meta.id || file}: ${F.length ? F[F.length - 1].t : 0} weeks · seed ${meta.seed ?? '?'} · preset ${meta.preset ?? '?'} · ${log.length.toLocaleString()} logged events`);
if (meta.presetRules && Object.keys(meta.presetRules).length) line(`Preset rules: ${JSON.stringify(meta.presetRules)}`);

line('\nMarket path (index = fixed basket, start 100; price ÷ hidden value; coins held; cards out)');
for (let i = 0; i < F.length; i += Math.max(1, Math.round(F.length / 12))) { const f = F[i]; line(`  W${String(f.t).padStart(3)}  index ${fmt(f.h.p).padStart(6)}  P/F ${pf(f)?.toFixed(2) ?? '–'}  coins ${fmt(f.mkt?.cash)}  cards ${fmt(f.mkt?.cards)}  trades/wk ${f.h.trades}  gini ${f.h.gini?.toFixed(2)}`); }

const ch = meta.changes || [];
if (ch.length) {
  line('\nRule changes while it ran (market 8 weeks before → 8 weeks after)');
  for (const c of ch) { const b = at(c.week - 8), a = at(c.week + 8); line(`  W${c.week}: ${c.rule} = ${JSON.stringify(c.value)}  ·  index ${fmt(b?.h.p)} → ${fmt(a?.h.p)}  ·  P/F ${pf(b)?.toFixed(2)} → ${pf(a)?.toFixed(2)}  ·  coins ${fmt(b?.mkt?.cash)} → ${fmt(a?.mkt?.cash)}`); }
}

const last = F[F.length - 1];
if (last) {
  const kind = (b) => (b[9] ? 'AI' : b[18] ? 'neural' : 'genome');
  line('\nRichest bots at the end (worth · cash · cards · 4-wk return · generation)');
  for (const b of last.bots.slice().sort((x, y) => y[3] - x[3]).slice(0, 10)) line(`  ${b[2].padEnd(22)} ${fmt(b[3]).padStart(10)}  cash ${fmt(b[7])}  cards ${b[4]}  ${pct(b[16])}  gen ${b[10]}  ${kind(b)}${b[6] >= 5 ? '  flagged' : ''}`);
}

const trades = log.filter((j) => j.type === 'trade'), sales = log.filter((j) => j.type === 'auctionResult' && j.winner);
line(`\nTrades: ${trades.length.toLocaleString()} in the card market · ${sales.length.toLocaleString()} auction sales`);
for (const j of [...trades, ...sales.map((s) => ({ ...s, buyer: s.winner, auction: true }))].sort((a, b) => b.price - a.price).slice(0, 8)) line(`  W${j.t} ${j.auction ? 'auction' : 'trade  '} ${fmt(j.price).padStart(10)}  ${cardName(j.card)}  ${j.seller} → ${j.buyer}`);

const tops = F.filter((f) => f.top?.length);
if (tops.length) {
  line('\nMost valuable card over time');
  let prev = null; for (const f of tops) { const x = f.top[0]; if (x.label !== prev) { line(`  W${String(f.t).padStart(3)}  ${x.label} · ${fmt(x.P)} coins · ${x.owner || '–'}`); prev = x.label; } }
}

const count = (t) => log.filter((j) => j.type === t);
const packs = count('pack'), loans = count('loan'), defaults = count('default'), steals = count('steal'), lifts = count('flagLift');
line(`\nPacks: ${packs.length.toLocaleString()} bought for ${fmt(packs.reduce((s, j) => s + (j.price || 0), 0))} coins`);
line(`Credit: ${loans.length.toLocaleString()} loans for ${fmt(loans.reduce((s, j) => s + (j.amount || 0), 0))} coins · ${defaults.length} defaults · ${count('marginCall').length} margin calls`);
line(`Theft: ${steals.filter((j) => j.ok).length} thefts, ${steals.filter((j) => j.caught).length} caught · ${lifts.length} flags lifted · ${count('share').length} note swaps`);
line(`Evolution: ${count('adopted').length} adoptions · ${count('died').length} deaths`);
