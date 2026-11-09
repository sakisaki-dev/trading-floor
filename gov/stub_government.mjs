// A scripted stand-in for the Claude session, for testing the harness end to end with no model: it runs as its own
// process exactly as a session turn does, reads state/ and writes controls.json, board.md and notebook.md in the session
// folder. Its choices are a fixed function of what it reads (deterministic; gov/stub_core.mjs, which the page also runs),
// and it exercises every kind of control: dials, an illegal value, transfers, a rule, payOrder, wake rules with
// triggers, predictions, board posts and the notebook.
//   node gov/stub_government.mjs --session DIR [--think-ms 0]
import fs from 'node:fs'; import path from 'node:path'; import { stubTurn } from './stub_core.mjs';
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const dir = opt('session'), think = +opt('think-ms', 0), rd = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const now = rd('state/now.json'), nbFile = path.join(dir, 'notebook.md');
const nb = fs.existsSync(nbFile) ? fs.readFileSync(nbFile, 'utf8') : '';
const league = fs.existsSync(path.join(dir, 'state/league.json')) ? rd('state/league.json') : { players: [] };
const out = stubTurn({ now, notebook: nb, league });
const wait = Date.now() + think; while (Date.now() < wait) { /* thinking */ }
fs.writeFileSync(path.join(dir, 'controls.json'), JSON.stringify(out.controls, null, 1));
fs.writeFileSync(path.join(dir, 'board.md'), out.board);
fs.writeFileSync(nbFile, out.notebook);
