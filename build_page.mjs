// Builds docs/sandbox/trading-floor.html: page/style.css + page/body.html + engine.mjs (inlined) + data/library.json
// + page/ui.js. The output is an artifact page (no <html>/<head>; the artifact host wraps it) that also opens fine
// from disk. Run: node sandbox/build_page.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), 'utf8');
const engine = read('engine.mjs').replace(/^export /gm, '');
const library = read('data/library.json');
const head = `<title>Vault Trading Floor</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,800;1,800&family=Barlow:wght@400;500;600&family=JetBrains+Mono:wght@400;600&family=Silkscreen&display=swap">
`;
const html = head + read('page/style.css') + '\n' + read('page/body.html') + '\n<script>\nconst LIBRARY = ' + library + ';\n' + engine + '\n' + read('page/ui.js') + '\n</script>\n';
const out = path.join(here, '..', 'docs', 'sandbox', 'trading-floor.html');
fs.writeFileSync(out, html);
console.log(`page: ${path.relative(path.join(here, '..'), out)} (${html.length.toLocaleString()} bytes)`);
