// Builds sandbox/data/timeline.json from the site's real market history (data/y80/market_history.json): one entry per
// real season (the last snapshot of each), with every player's real value, OVR, skill, grade, Career Legacy and
// career totals as of that season. The sandbox replays these as its news. Run: npx tsx sandbox/timeline.ts
import fs from 'node:fs';
import { expandMarket } from '../src/utils/marketHistory';

const snaps = expandMarket(JSON.parse(fs.readFileSync('data/y80/market_history.json', 'utf8'))) as { season: string; label: string; players: Record<string, { ovr: number | null; skill: number | null; legacy: number; value: number; grade: string | null; s?: Record<string, number> }> }[];
const bySeason = new Map<string, (typeof snaps)[number]>();
for (const s of snaps) bySeason.set(s.season, s); // the last snapshot of each season wins
const seasons = [...bySeason.values()].map((s) => ({
  season: s.season,
  players: Object.fromEntries(Object.entries(s.players).map(([k, p]) => [k, [p.value, p.ovr, p.skill, p.grade, p.legacy, p.s || {}]])),
}));
// The site's full price history: every market snapshot, each player's card value (null before he had a card)
const keys = Object.keys(snaps[snaps.length - 1].players);
fs.writeFileSync('sandbox/data/history.json', JSON.stringify({ source: 'data/y80/market_history.json (every snapshot)', snapshots: snaps.map((s) => ({ id: (s as { id?: string }).id, season: s.season, label: s.label })), values: Object.fromEntries(keys.map((k) => [k, snaps.map((s) => s.players[k]?.value ?? null)])) }));
fs.writeFileSync('sandbox/data/timeline.json', JSON.stringify({ source: 'data/y80/market_history.json (last snapshot per season)', fields: ['value', 'ovr', 'skill', 'grade', 'careerLegacy', 'careerTotals'], seasons }));
console.log(seasons.map((s) => `${s.season}: ${Object.keys(s.players).length} players`).join(', '));
