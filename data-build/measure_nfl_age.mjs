// Real NFL injury risk by age, and the age players enter the league, for the league simulation (the save has no ages
// and only 16 injured seasons, too few to see how risk changes with age). Reads nflverse weekly rosters
// (https://github.com/nflverse/nflverse-data, release "weekly_rosters", roster_weekly_<year>.csv; download them to a
// folder and pass it) and writes sandbox/data/nfl_age.json. Only the ratios by age are used: the league's overall
// injury rate stays the save's own.
// Run: node sandbox/measure_nfl_age.mjs <folder with roster_weekly_*.csv>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), dir = process.argv[2];
if (!dir) { console.error('usage: node sandbox/measure_nfl_age.mjs <folder with roster_weekly_*.csv>'); process.exit(1); }
const parse = (line) => { const c = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { c.push(cur); cur = ''; } else cur += ch; } c.push(cur); return c; };
const files = fs.readdirSync(dir).filter((f) => /^roster(_weekly)?_\d{4}\.csv$/.test(f)).sort();
const act = {}, res = {}, entry = [], seen = new Set(); const years = [];
for (const f of files) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n'), H = parse(lines[0]), ix = (k) => H.indexOf(k);
  const [iS, iSt, iB, iG, iId, iE, iT] = ['season', 'status', 'birth_date', 'game_type', 'gsis_id', 'entry_year', 'week'].map(ix);
  years.push(f.match(/\d{4}/)[0]);
  for (const l of lines.slice(1)) {
    const x = parse(l); if (x[iG] !== 'REG' || !x[iB]) continue;
    const season = +x[iS], born = new Date(x[iB]), age = Math.floor(season - born.getUTCFullYear() - (born.getUTCMonth() >= 8 ? 1 : 0)); // age on 1 September
    if (!(age >= 20 && age <= 45)) continue;
    if (x[iSt] === 'ACT') act[age] = (act[age] || 0) + 1; else if (x[iSt] === 'RES') res[age] = (res[age] || 0) + 1; else continue;
    if (+x[iE] === season && !seen.has(x[iId])) { seen.add(x[iId]); entry.push(age); }
  }
}
// Career ends by age: nflverse players.csv (birth_date, rookie_season, last_season). A player is at risk in every season from
// his rookie season to his last; his career ends at his last season's age. Careers still running (last season = the newest
// season in the file) are not counted as ending.
const ends = {}, atRisk = {}; const pf = path.join(dir, 'players.csv');
if (fs.existsSync(pf)) {
  const lines = fs.readFileSync(pf, 'utf8').trim().split('\n'), H = parse(lines[0]), iB = H.indexOf('birth_date'), iR = H.indexOf('rookie_season'), iL = H.indexOf('last_season');
  const rows = lines.slice(1).map(parse).filter((x) => x[iB] && +x[iR] >= 1990 && +x[iL] >= +x[iR]), newest = Math.max(...rows.map((x) => +x[iL]));
  for (const x of rows) { const born = new Date(x[iB]), by = born.getUTCFullYear() + (born.getUTCMonth() >= 8 ? 1 : 0);
    for (let y = +x[iR]; y <= +x[iL]; y++) { const a = y - by; if (a < 20 || a > 45) continue; atRisk[a] = (atRisk[a] || 0) + 1; if (y === +x[iL] && y < newest) ends[a] = (ends[a] || 0) + 1; } }
}
const endByAge = Object.fromEntries(Object.keys(atRisk).map(Number).sort((a, b) => a - b).filter((a) => atRisk[a] >= 30).map((a) => [a, Math.round(((ends[a] || 0) / atRisk[a]) * 1000) / 1000]));
const ages = Object.keys({ ...act, ...res }).map(Number).sort((a, b) => a - b);
const share = {}; let tot = 0, totN = 0;
for (const a of ages) { const n = (act[a] || 0) + (res[a] || 0); if (n < 200) continue; share[a] = Math.round(((res[a] || 0) / n) * 10000) / 10000; tot += res[a] || 0; totN += n; }
const mean = tot / totN, rr = Object.fromEntries(Object.entries(share).map(([a, s]) => [a, Math.round((s / mean) * 1000) / 1000]));
entry.sort((a, b) => a - b);
const out = { source: `nflverse weekly rosters ${years.join(', ')}, regular-season weeks; injured = status RES (reserve, mostly injured reserve) among ACT + RES`, injuredShareByAge: share, relativeRiskByAge: rr, careerEndByAge: endByAge, careerEndN: Object.fromEntries(Object.entries(atRisk).filter(([, n]) => n >= 30)), rookieAge: { n: entry.length, p10: entry[Math.floor(entry.length * 0.1)], p50: entry[entry.length >> 1], p90: entry[Math.floor(entry.length * 0.9)], draws: entry.filter((_, i) => i % 7 === 0) } };
fs.writeFileSync(path.join(here, 'data/nfl_age.json'), JSON.stringify(out));
console.log(out.source);
console.log('relative injury risk by age:', Object.entries(rr).map(([a, r]) => `${a} ${r}`).join(', '));
console.log('chance a career ends at each age:', Object.entries(endByAge).map(([a, r]) => `${a} ${(r * 100).toFixed(0)}%`).join(', '));
console.log(`rookie age: p10 ${out.rookieAge.p10}, p50 ${out.rookieAge.p50}, p90 ${out.rookieAge.p90} (n${out.rookieAge.n})`);
