// Builds docs/trading-floor.html: page/style.css + page/body.html + engine.mjs (inlined) + data/library.json
// + page/ui.js. The output is an artifact page (no <html>/<head>; the artifact host wraps it) that also opens fine
// from disk. Run: node tools/build_page.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'); // the repository root
const read = (p) => fs.readFileSync(path.join(here, p), 'utf8');
const engine = read('engine.mjs').replace(/^export /gm, '');
const library = JSON.stringify({ ...JSON.parse(read('data/library.json')), timeline: JSON.parse(read('data/timeline.json')), history: JSON.parse(read('data/history.json')), kits: JSON.parse(read('data/kits.json')), names: JSON.parse(read('data/names.json')), leagueRates: JSON.parse(read('data/league_rates.json')), rookieNames: JSON.parse(read('data/rookie_names.json')), nflAge: JSON.parse(read('data/nfl_age.json')) });
const icon = 'data:image/svg+xml,' + encodeURIComponent(read('page/icon.svg').trim());
const head = `<title>Vault Trading Floor</title>
<link rel="icon" type="image/svg+xml" href="${icon}">
<meta name="claude:viewport-fit-sides" content="cover">
`;
// The live world runs in a background worker built from the same engine source (page/worker.js), so the page stays
// smooth while the bots think. The sources are embedded as strings ("</" escaped so they can't close the script tag).
const asStr = (x) => JSON.stringify(x).replace(/<\//g, '<\\/');
// The page's scripted governments (gov/arms.mjs, gov/stub_core.mjs, gov/page_gov.mjs) run in the worker, after the engine
// in the same scope: their imports are dropped and their engine namespace (E.x) becomes an object of the engine's names
const govMods = ['gov/arms.mjs', 'gov/stub_core.mjs', 'gov/page_gov.mjs'].map(read), usesE = [...new Set(govMods.join('\n').match(/\bE\.(\w+)/g).map((x) => x.slice(2)))].sort();
const govSrc = `const { pageGovernment, PAGE_GOVS } = (() => { // gov/arms.mjs, gov/stub_core.mjs, gov/page_gov.mjs in their own scope\nconst E = { ${usesE.join(', ')} };\n` + govMods.map((m) => m.replace(/^import .*$/gm, '').replace(/^export /gm, '')).join('\n') + '\nreturn { pageGovernment, PAGE_GOVS };\n})();';
// What the page shows about the government's view (spec 8.3): the excluded fields, from the state writer itself
const excluded = JSON.parse(read('gov/state.mjs').match(/export const EXCLUDED_KEYS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
const html = head + read('page/style.css') + '\n' + read('page/body.html') + '\n<script>\nconst LIBRARY = ' + library + ';\nconst ENGINE_SRC = ' + asStr(engine) + ';\nconst WORKER_SRC = ' + asStr(govSrc + '\n' + read('page/worker.js')) + ';\nconst REGULATED = ' + read('configs/regulated.json').trim() + ';\nconst GOV_EXCLUDED = ' + JSON.stringify(excluded) + ';\n' + engine + '\n' + read('page/ui.js') + '\n</script>\n';
// The page's script must parse as one script (the engine and ui.js share one scope: a name declared twice breaks it)
{ const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>')); try { new Function(script); } catch (e) { console.error('page script does not parse:', e.message); process.exit(1); } }
try { new Function(engine + '\n' + govSrc + '\n' + read('page/worker.js')); } catch (e) { console.error('worker script does not parse:', e.message); process.exit(1); } // the worker: the engine, then the governments, then worker.js
const out = path.join(here, 'docs', 'trading-floor.html');
fs.writeFileSync(out, html);
console.log(`page: ${path.relative(here, out)} (${html.length.toLocaleString()} bytes)`);
