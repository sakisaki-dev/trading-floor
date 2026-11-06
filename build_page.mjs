// Builds docs/sandbox/trading-floor.html: page/style.css + page/body.html + engine.mjs (inlined) + data/library.json
// + page/ui.js. The output is an artifact page (no <html>/<head>; the artifact host wraps it) that also opens fine
// from disk. Run: node sandbox/build_page.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), 'utf8');
const engine = read('engine.mjs').replace(/^export /gm, '');
const library = JSON.stringify({ ...JSON.parse(read('data/library.json')), timeline: JSON.parse(read('data/timeline.json')), history: JSON.parse(read('data/history.json')), kits: JSON.parse(read('data/kits.json')), names: JSON.parse(read('data/names.json')) });
const head = `<title>Vault Trading Floor</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,800;1,800&family=Barlow:wght@400;500;600&family=JetBrains+Mono:wght@400;600&family=Silkscreen&display=swap">
`;
// The live world runs in a background worker built from the same engine source (page/worker.js), so the page stays
// smooth while the bots think. The sources are embedded as strings ("</" escaped so they can't close the script tag).
const asStr = (x) => JSON.stringify(x).replace(/<\//g, '<\\/');
const html = head + read('page/style.css') + '\n' + read('page/body.html') + '\n<script>\nconst LIBRARY = ' + library + ';\nconst ENGINE_SRC = ' + asStr(engine) + ';\nconst WORKER_SRC = ' + asStr(read('page/worker.js')) + ';\n' + engine + '\n' + read('page/ui.js') + '\n</script>\n';
const out = path.join(here, '..', 'docs', 'sandbox', 'trading-floor.html');
fs.writeFileSync(out, html);
console.log(`page: ${path.relative(path.join(here, '..'), out)} (${html.length.toLocaleString()} bytes)`);
