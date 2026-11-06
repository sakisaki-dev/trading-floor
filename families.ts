// Labels every player with the site's own play-style family (src/config/families.ts), so the sandbox heatmaps group
// players the same way the Stats page does. Writes sandbox/data/families.json. Run: npx tsx sandbox/families.ts
import fs from 'node:fs';
import { parseCSV } from '../src/utils/csvParser';
import { familiesFor, familyOfPlayer } from '../src/config/families';

const data = parseCSV(fs.readFileSync('public/data/initial-data.csv', 'utf8'));
const groups: [string, unknown[]][] = [['QB', data.quarterbacks], ['RB', data.runningbacks], ['WR', data.widereceivers], ['TE', data.tightends], ['OL', data.offensiveline], ['LB', data.linebackers], ['DB', data.defensivebacks], ['DL', data.defensiveline]];
const out: Record<string, string> = {};
for (const [pos, players] of groups) {
  const fams = familiesFor(players as never, pos as never);
  for (const p of players as { name: string; position: string }[]) {
    const f = fams ? familyOfPlayer(fams, { ...p, position: pos } as never) : null;
    out[`${pos}:${p.name}`] = f?.name || `${pos} (no family)`;
  }
}
fs.writeFileSync('sandbox/data/families.json', JSON.stringify(out, null, 0));
const counts: Record<string, number> = {}; Object.values(out).forEach((f) => (counts[f] = (counts[f] || 0) + 1));
console.log(Object.keys(out).length, 'players,', Object.keys(counts).length, 'families'); console.log(counts);
