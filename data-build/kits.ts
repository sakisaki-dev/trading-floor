// Which clubs have modern alternate and era (throwback) kits, from the site's uniform tables, plus the autographs' mean value
// multiplier. Writes sandbox/data/kits.json. Run: npx tsx sandbox/kits.ts
import { allAlternates, allEraKits } from '../src/components/collection/art/sprite/uniforms';
import { findNFLTeam } from '../src/utils/nflTeams';
import { AUTOGRAPH_MEAN_MULT } from '../src/config/autographs';
import fs from 'node:fs';
const alts: Record<string, number> = {}; allAlternates().forEach(({ team }) => (alts[team] = (alts[team] ?? 0) + 1));
const era = [...new Set(allEraKits().map(({ team }) => team))];
const lib = JSON.parse(fs.readFileSync('sandbox/data/library.json', 'utf8'));
const clubKits: Record<string, [number, number]> = {};
for (const p of lib.players) { const id = findNFLTeam(p.team)?.id ?? ''; clubKits[p.key] = [alts[id] ? 1 : 0, era.includes(id) ? 1 : 0]; }
fs.writeFileSync('sandbox/data/kits.json', JSON.stringify({ source: 'src/components/collection/art/sprite/uniforms.ts (alternates and era kits per club)', autographMeanMult: AUTOGRAPH_MEAN_MULT, kits: clubKits }));
console.log('clubs with alternates', Object.keys(alts).length, 'with era kits', era.length, 'autograph mean mult', AUTOGRAPH_MEAN_MULT, 'players', Object.keys(clubKits).length);
