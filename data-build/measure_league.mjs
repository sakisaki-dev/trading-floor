// Phase 0 of the league simulation (docs/league-sim-spec.md): measure every rate from the save's real seasons.
// Reads sandbox/data/timeline.json (10 season snapshots, Y79–Y88, career totals per player), writes
// sandbox/data/league_rates.json and prints a summary. Nothing here is chosen: each number is counted from the data.
// Run: node sandbox/measure_league.mjs
//
// How season lines are read: a player's season = the change in his career totals between two snapshots. A player first
// seen after Y79 with no more than a full season of career games is a rookie (his first line is his totals). There is
// no age, so a player's career stage is his seasons played, estimated as career games before the season ÷ a full season.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const T = JSON.parse(fs.readFileSync(path.join(here, 'data/timeline.json'), 'utf8'));
const F = Object.fromEntries(T.fields.map((k, i) => [k, i]));
const POS = ['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL'];
const AWARDS = ['mvp', 'opoy', 'dpoy', 'roty', 'sbmvp', 'rings'];
const THIN = 20;

// Production (the League Score without award points), exactly as data/y80/formula/ovr.py
const g = (t, k) => t?.[k] || 0;
function production(pos, t) {
  if (pos === 'QB') return g(t, 'yds') / 80 + 0.9 * g(t, 'td') + 0.9 * g(t, 'rtd') - 0.6 * g(t, 'int');
  if (pos === 'RB') return g(t, 'ryds') / 18 + 2.2 * g(t, 'rtd') + g(t, 'recyds') / 30 + 2.2 * g(t, 'rectd') - 0.8 * g(t, 'fum');
  if (pos === 'WR' || pos === 'TE') { const td = t?.td != null ? t.td : g(t, 'yds') / 95; return g(t, 'yds') / (pos === 'WR' ? 14 : 8) + (pos === 'WR' ? 2.5 : 3) * td - g(t, 'fum'); }
  if (pos === 'OL') return 5 * g(t, 'blk') + 2 * g(t, 'g');
  return 0.7 * g(t, 'tkl') + 12 * g(t, 'int') + 14 * g(t, 'sck') + 14 * g(t, 'ff');
}
const diff = (a, b) => { const out = {}; for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) out[k] = g(b, k) - g(a, k); return out; };
const q = (xs, p) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo); };
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const summary = (xs) => ({ n: xs.length, mean: r3(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)), p10: r3(q(xs, 0.1)), p50: r3(q(xs, 0.5)), p90: r3(q(xs, 0.9)) });

// ---------- season lines ----------
const S = T.seasons, names = new Set(); for (const s of S) for (const k of Object.keys(s.players)) names.add(k);
const lines = []; // { key, pos, season index, g, prod, ppg, gBefore, rookie, totals }
for (const key of names) {
  const pos = key.split(':')[0]; let prev = null, first = true;
  for (let i = 0; i < S.length; i++) {
    const row = S[i].players[key]; if (!row) { prev = null; continue; }
    const tot = row[F.careerTotals];
    if (prev) { const d = diff(prev, tot); lines.push({ key, pos, i, g: d.g || 0, prod: production(pos, d), gBefore: g(prev, 'g'), rookie: false, d }); }
    else if (first && i > 0) lines.push({ key, pos, i, g: g(tot, 'g'), prod: production(pos, tot), gBefore: 0, rookie: true, d: tot, maybeRookie: true });
    first = false; prev = tot;
  }
}
// Gaps that are not one season: Y79→Y80 spans about 5 games (part of a season), and a few gaps hold two seasons
// (34+ games). Both are left out of every rate.
const PARTIAL = new Set([1]), MAXG = 25;
const bad = (l) => PARTIAL.has(l.i) || l.g > MAXG;
for (let k = lines.length - 1; k >= 0; k--) if (bad(lines[k])) lines.splice(k, 1);
// Full season: the most common games count in a season line, overall and by position
const mode = (xs) => { const c = new Map(); for (const x of xs) c.set(x, (c.get(x) || 0) + 1); return [...c].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null; };
const played = lines.filter((l) => l.g > 0 && !l.rookie);
const fullAll = mode(played.map((l) => l.g)), fullBy = Object.fromEntries(POS.map((p) => [p, mode(played.filter((l) => l.pos === p).map((l) => l.g))]));
// Rookies: first seen after Y79 with at most a full season of career games
for (const l of lines) if (l.maybeRookie) l.rookie = l.g > 0 && l.g <= fullAll;
const rookieLines = lines.filter((l) => l.rookie);
for (const l of lines) { l.ppg = l.g > 0 ? l.prod / l.g : null; l.stage = Math.round(l.gBefore / fullAll); }
const STAGES = [['1-2', 0, 1], ['3-5', 2, 4], ['6-8', 5, 7], ['9+', 8, 99]]; // seasons already played before this one
const stageOf = (s) => STAGES.find(([, a, b]) => s >= a && s <= b)[0];

// ---------- retirement: the last season with games, if every later snapshot shows none ----------
const byKey = new Map(); for (const l of lines) { if (!byKey.has(l.key)) byKey.set(l.key, []); byKey.get(l.key).push(l); }
const retireObs = []; // { pos, stage, rankT, retired }
for (const [, ls] of byKey) {
  ls.sort((a, b) => a.i - b.i);
  for (let j = 0; j < ls.length; j++) {
    const l = ls[j]; if (!(l.g > 0) || l.i >= S.length - 1) continue; // the last snapshot has no "after" to look at
    const later = ls.slice(j + 1); if (!later.length) continue;
    retireObs.push({ l, retired: later.every((x) => x.g === 0) });
  }
}
// production rank within position that season (0 = worst, 1 = best), by per-game production among players who played
const rankMap = new Map();
for (let i = 0; i < S.length; i++) for (const p of POS) { const xs = lines.filter((l) => l.i === i && l.pos === p && l.g > 0).sort((a, b) => a.ppg - b.ppg); xs.forEach((l, k) => rankMap.set(l, xs.length > 1 ? k / (xs.length - 1) : 1)); }
const tercile = (r) => (r < 1 / 3 ? 'bottom third' : r < 2 / 3 ? 'middle third' : 'top third');

// ---------- missed games (active seasons: not after retirement), form swings ----------
const retiredAfter = new Map(); for (const o of retireObs) if (o.retired) retiredAfter.set(o.l.key, o.l.i);
// active seasons: from a player's first season with games to his last (before = not yet in the league or already retired before Y79; after = retired)
const span = new Map(); for (const [k, ls] of byKey) { const gi = ls.filter((l) => l.g > 0).map((l) => l.i); if (gi.length) span.set(k, [Math.min(...gi), Math.max(...gi)]); }
const active = lines.filter((l) => !l.rookie && span.has(l.key) && l.i >= span.get(l.key)[0] && l.i <= span.get(l.key)[1]);
const missedBy = {}, swingsBy = {};
for (const l of active) { const full = fullBy[l.pos] ?? fullAll, k = `${l.pos}|${stageOf(l.stage)}`; (missedBy[k] ||= []).push(Math.max(0, full - l.g)); }
for (const [, ls] of byKey) { ls.sort((a, b) => a.i - b.i); for (let j = 1; j < ls.length; j++) { const a = ls[j - 1], b = ls[j]; if (b.i !== a.i + 1 || !(a.g >= 4 && b.g >= 4) || !(a.ppg > 0 && b.ppg > 0)) continue; (swingsBy[`${b.pos}|${stageOf(b.stage)}`] ||= []).push(Math.log(b.ppg / a.ppg)); } }
// Thin cells: merge career stages within a position, then positions within a group, until each cell has 20+
const GROUP = { QB: 'offense skill', RB: 'offense skill', WR: 'offense skill', TE: 'offense skill', OL: 'line', LB: 'defense', DB: 'defense', DL: 'defense' };
function merged(byCell) {
  const out = {}, notes = [];
  for (const p of POS) for (const [st] of STAGES) {
    let xs = byCell[`${p}|${st}`] || [], used = `${p} ${st}`;
    if (xs.length < THIN) { xs = STAGES.flatMap(([s2]) => byCell[`${p}|${s2}`] || []); used = `${p}, all stages`; }
    if (xs.length < THIN) { xs = POS.filter((p2) => GROUP[p2] === GROUP[p]).flatMap((p2) => STAGES.flatMap(([s2]) => byCell[`${p2}|${s2}`] || [])); used = `${GROUP[p]}, all stages`; }
    if (xs.length < THIN) { xs = Object.values(byCell).flat(); used = 'everyone'; }
    out[`${p}|${st}`] = { from: used, draws: xs.map(r3), ...summary(xs) };
    if (used !== `${p} ${st}`) notes.push(`${p} ${st}: ${(byCell[`${p}|${st}`] || []).length} observations, used ${used} (${xs.length})`);
  }
  return { cells: out, notes };
}
const missed = merged(missedBy), swings = merged(swingsBy);

// ---------- rookies ----------
// Arrivals: players first seen after Y79 who already have more than a full season of games (veterans newly added to the card set)
const arrivals = lines.filter((l) => l.maybeRookie && !l.rookie);
const arrivalsPerSeason = S.slice(2).map((s, k) => ({ season: s.season, n: arrivals.filter((l) => l.i === k + 2).length }));
const arrivalMix = Object.fromEntries(POS.map((p) => [p, arrivals.filter((l) => l.pos === p).length]));
const arrivalSeasons = summary(arrivals.map((l) => l.g / fullAll));
const rookiesPerSeason = S.slice(2).map((s, k) => ({ season: s.season, n: rookieLines.filter((l) => l.i === k + 2).length }));
const rookieMix = Object.fromEntries(POS.map((p) => [p, rookieLines.filter((l) => l.pos === p).length]));
const rookieFirst = Object.fromEntries(POS.map((p) => { const xs = rookieLines.filter((l) => l.pos === p && l.ppg != null); return [p, { games: summary(xs.map((l) => l.g)), ppg: summary(xs.map((l) => l.ppg)), draws: xs.map((l) => [l.g, r3(l.ppg)]) }]; }));

// ---------- retirement rates ----------
const retireBy = {};
for (const o of retireObs) { const k = `${stageOf(o.l.stage)}|${tercile(rankMap.get(o.l) ?? 0.5)}`; const c = (retireBy[k] ||= [0, 0]); c[0]++; if (o.retired) c[1]++; }
const retireRates = Object.fromEntries(STAGES.flatMap(([st]) => ['bottom third', 'middle third', 'top third'].map((t) => { const [n, r] = retireBy[`${st}|${t}`] || [0, 0]; return [`${st}|${t}`, { n, retired: r, rate: n ? r3(r / n) : null, thin: n < THIN }]; })));

// ---------- awards: counts per season and the winners' production rank ----------
const awardCounts = {}, awardRanks = {};
for (const l of lines) for (const a of AWARDS) { const k = l.d?.[a] || 0; if (k > 0 && !l.rookie) { (awardCounts[a] ||= {})[S[l.i].season] = ((awardCounts[a] ||= {})[S[l.i].season] || 0) + k; (awardRanks[a] ||= []).push(rankMap.get(l) ?? null); } }
const awards = Object.fromEntries(AWARDS.map((a) => { const per = S.slice(2).map((s) => awardCounts[a]?.[s.season] || 0); const rk = (awardRanks[a] || []).filter((x) => x != null); return [a, { perSeason: per, meanPerSeason: r3(per.reduce((x, y) => x + y, 0) / per.length), winnerRankWithinPosition: summary(rk), positions: Object.fromEntries(POS.map((p) => [p, lines.filter((l) => !l.rookie && (l.d?.[a] || 0) > 0 && l.pos === p).length]).filter(([, n]) => n)) }]; }));

// ---------- Career Legacy growth: per position, season legacy change = perScore × League Score change + perGame × games ----------
// (Career Legacy is built from the game's own "true talent", which no stat formula gives; this fit is how it grew in the save)
const scoreAll = (pos, t) => { const def = ['LB', 'DB', 'DL'].includes(pos); return production(pos, t) + 40 * g(t, 'rings') + 90 * g(t, 'mvp') + (def ? 90 : 45) * (g(t, 'opoy') + g(t, 'dpoy')) + 40 * g(t, 'sbmvp') + 10 * g(t, 'roty'); };
const legacyObs = {};
for (let i = 2; i < S.length; i++) for (const [k, row] of Object.entries(S[i].players)) { const prev = S[i - 1].players[k]; if (!prev) continue; const pos = k.split(':')[0], a = prev[F.careerTotals], b = row[F.careerTotals], dg = g(b, 'g') - g(a, 'g'); if (dg <= 0 || dg > MAXG) continue; (legacyObs[pos] ||= []).push([scoreAll(pos, b) - scoreAll(pos, a), dg, row[F.careerLegacy] - prev[F.careerLegacy]]); }
const legacyFit = Object.fromEntries(POS.map((p) => { const xs = legacyObs[p] || []; let sxx = 0, sxy = 0, sgx = 0, sgg = 0, sgy = 0; for (const [x, gg, y] of xs) { sxx += x * x; sxy += x * y; sgx += x * gg; sgg += gg * gg; sgy += gg * y; } const det = sxx * sgg - sgx * sgx; const a = (sxy * sgg - sgy * sgx) / det, b = (sgy * sxx - sxy * sgx) / det; const m = xs.reduce((q, x) => q + x[2], 0) / xs.length; let res = 0, tot = 0; for (const [x, gg, y] of xs) { res += (y - a * x - b * gg) ** 2; tot += (y - m) ** 2; } return [p, { n: xs.length, perScore: r3(a), perGame: r3(b), r2: r3(1 - res / tot) }]; }));
// ---------- the real NFL players in the game's OVR pool (fixed): their League Scores, as the site computes them ----------
const legendsPath = path.join(here, '..', 'public/data/legends.json'), exclPath = path.join(here, '..', 'public/data/game-exclusions.json');
const excl = new Set((fs.existsSync(exclPath) ? JSON.parse(fs.readFileSync(exclPath, 'utf8')).excludeFromGames : []) || []);
const pyRound = (x) => { const f = Math.floor(x), d = x - f; return d === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(x); };
const legendScores = (fs.existsSync(legendsPath) ? JSON.parse(fs.readFileSync(legendsPath, 'utf8')) : []).filter((p) => POS.includes(p.position) && !excl.has(`${p.position}:${p.name}`) && !S[S.length - 1].players[`${p.position}:${p.name}`]).map((p) => {
  const n = (k) => p[k] || 0, def = ['LB', 'DB', 'DL'].includes(p.position), aw = 40 * n('rings') + 90 * n('mvp') + (def ? 90 : 45) * n('opoy') + 40 * n('sbmvp') + 10 * n('roty'); let pr;
  switch (p.position) { case 'QB': pr = n('passYds') / 80 + 0.9 * n('passTD') + 0.9 * n('rushTD') - 0.6 * n('interceptions'); break; case 'RB': pr = n('rushYds') / 18 + 2.2 * n('rushTD') + n('recYds') / 30 + 2.2 * n('recTD') - 0.8 * n('fumbles'); break;
    case 'WR': case 'TE': { const yds = n('recYds'), td = p.recTD ?? yds / 95; pr = p.position === 'WR' ? yds / 14 + 2.5 * td - n('fumbles') : yds / 8 + 3 * td - n('fumbles'); break; } case 'OL': pr = 5 * n('blocks') + 2 * n('games'); break; default: pr = 0.7 * n('tackles') + 12 * n('interceptions') + 14 * n('sacks') + 14 * n('forcedFumbles'); }
  return [p.position, pyRound(pr + aw), n('games')]; });
// ---------- Pressure: next season's form change by how much his card value moved this season (bottom / middle / top third) ----------
// Value is the site's card value from his stats (the save's market snapshots), not a traded price.
const hypeRows = [];
for (const [k0, ls] of byKey) { ls.sort((a, b) => a.i - b.i); for (let j = 1; j < ls.length - 1; j++) { const a = ls[j - 1], b = ls[j], c = ls[j + 1]; if (b.i !== a.i + 1 || c.i !== b.i + 1 || !(a.g >= 4 && b.g >= 4 && c.g >= 4) || !(a.ppg > 0 && b.ppg > 0 && c.ppg > 0)) continue;
  const v0 = S[b.i - 1].players[k0]?.[F.value], v1 = S[b.i].players[k0]?.[F.value]; if (!(v0 > 0 && v1 > 0)) continue; hypeRows.push([Math.log(v1 / v0), Math.log(c.ppg / b.ppg)]); } }
hypeRows.sort((a, b) => a[0] - b[0]);
const h3 = Math.floor(hypeRows.length / 3), hThirds = [hypeRows.slice(0, h3), hypeRows.slice(h3, 2 * h3), hypeRows.slice(2 * h3)];
const meanOf = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length), allNext = meanOf(hypeRows.map((r) => r[1]));
const pressure = { n: hypeRows.length, cuts: [r3(hypeRows[h3]?.[0]), r3(hypeRows[2 * h3]?.[0])], shift: hThirds.map((t) => r3(meanOf(t.map((r) => r[1])) - allNext)), meanNext: hThirds.map((t) => r3(meanOf(t.map((r) => r[1])))), note: 'log value change over a season → the mean of next season\'s log form change in that third, minus the overall mean (added to the position draw)' };

const out = {
  source: 'sandbox/data/timeline.json (' + S.map((s) => s.season).join(', ') + '); Y79→Y80 (about 5 games) and two-season gaps (over ' + MAXG + ' games) left out', thinCellMinimum: THIN,
  fullSeason: { all: fullAll, byPosition: fullBy },
  stages: STAGES.map(([s]) => s), stageNote: 'seasons already played, estimated as career games before the season ÷ the full season',
  missedGames: missed, formSwings: { ...swings, note: 'log(per-game production this season ÷ last season), both seasons with 4+ games' },
  rookies: { perSeason: rookiesPerSeason, positionMix: rookieMix, firstSeason: rookieFirst },
  arrivals: { perSeason: arrivalsPerSeason, positionMix: arrivalMix, seasonsOfCareerAtArrival: arrivalSeasons, note: 'players first seen after Y79 with more than a full season of career games: veterans added to the card set, not rookies' },
  retirement: { rates: retireRates, observations: retireObs.length, note: 'retired = played this season and no games in any later snapshot; the last real season (Y88) has no later snapshot, so it is not counted' },
  awards,
  legacyGrowth: legacyFit, legendScores, pressure,
  activeMissedAll: active.map((l) => [l.pos, stageOf(l.stage), Math.max(0, (fullBy[l.pos] ?? fullAll) - l.g)]),
  earlySeasons: lines.filter((l) => l.g >= 4 && l.stage <= 1 && !l.rookie).map((l) => ({ key: l.key, pos: l.pos, season: S[l.i].season, g: l.g, d: l.d })),
};
fs.writeFileSync(path.join(here, 'data/league_rates.json'), JSON.stringify(out));
// ---------- printed report ----------
const pr = (...a) => console.log(...a);
pr(`Season lines: ${lines.length} (${played.length} veteran lines with games, ${rookieLines.length} rookie seasons)`);
pr(`Full season: ${fullAll} games (by position: ${POS.map((p) => `${p} ${fullBy[p]}`).join(', ')})`);
pr('\nMissed games per season (active players) by position | stage: n, mean, p50, p90');
for (const p of POS) pr(`  ${p}: ` + STAGES.map(([st]) => { const c = missed.cells[`${p}|${st}`]; return `${st} n${c.n} mean ${c.mean} p50 ${c.p50} p90 ${c.p90}${c.from !== `${p} ${st}` ? '*' : ''}`; }).join(' | '));
pr('\nForm swings, log ratio of per-game production: n, p10, p50, p90');
for (const p of POS) pr(`  ${p}: ` + STAGES.map(([st]) => { const c = swings.cells[`${p}|${st}`]; return `${st} n${c.n} ${c.p10}/${c.p50}/${c.p90}${c.from !== `${p} ${st}` ? '*' : ''}`; }).join(' | '));
pr('\nRookies per season: ' + rookiesPerSeason.map((r) => `${r.season} ${r.n}`).join(', ') + ` | mix ${POS.map((p) => `${p} ${rookieMix[p]}`).join(', ')}`);
pr('Arrivals (veterans newly added to the card set) per season: ' + arrivalsPerSeason.map((r) => `${r.season} ${r.n}`).join(', ') + ` | mix ${POS.map((p) => `${p} ${arrivalMix[p]}`).join(', ')} | career seasons at arrival p10/p50/p90 ${arrivalSeasons.p10}/${arrivalSeasons.p50}/${arrivalSeasons.p90}`);
pr('Rookie first season, games p50 / per-game production p10-p50-p90: ' + POS.map((p) => `${p} ${rookieFirst[p].games.p50} / ${rookieFirst[p].ppg.p10}-${rookieFirst[p].ppg.p50}-${rookieFirst[p].ppg.p90} (n${rookieFirst[p].ppg.n})`).join('; '));
pr('\nRetirement after a season, by stage | production third: retired/n');
for (const [st] of STAGES) pr(`  ${st}: ` + ['bottom third', 'middle third', 'top third'].map((t) => { const c = retireRates[`${st}|${t}`]; return `${t} ${c.retired}/${c.n}${c.thin ? ' (thin)' : ''}`; }).join(' | '));
pr('\nAwards per season (Y81–Y88) and winners\' production rank within position (p50):');
for (const a of AWARDS) pr(`  ${a}: ${awards[a].perSeason.join(' ')} | rank p50 ${awards[a].winnerRankWithinPosition.p50} (n${awards[a].winnerRankWithinPosition.n}) | ${JSON.stringify(awards[a].positions)}`);
pr('\nCareer Legacy growth per season (legacy = perScore × League Score + perGame × games): ' + POS.map((p) => `${p} ${legacyFit[p].perScore}/${legacyFit[p].perGame} r²${legacyFit[p].r2}`).join(', '));
pr(`Real NFL players in the OVR pool: ${legendScores.length}`);
pr(`Pressure (n${pressure.n}): value-change cuts ${pressure.cuts.join(' / ')}; next-season form shift by third (fell / middle / rose most): ${pressure.shift.join(' / ')}`);
pr('\nThin cells merged (fewer than ' + THIN + ' observations):');
for (const n of [...missed.notes.map((x) => 'missed ' + x), ...swings.notes.map((x) => 'swings ' + x)]) pr('  ' + n);
