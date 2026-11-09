// A scripted stand-in for the Claude session, for testing the harness end to end with no model: it runs as its own
// process exactly as a session turn does, reads state/ and writes controls.json, board.md and notebook.md in the session
// folder. Its choices are a fixed function of what it reads (deterministic), and it exercises every kind of control:
// dials, an illegal value, transfers, a rule, payOrder, wake rules with triggers, predictions, board posts and the notebook.
//   node gov/stub_government.mjs --session DIR [--think-ms 0]
import fs from 'node:fs'; import path from 'node:path';
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const dir = opt('session'), think = +opt('think-ms', 0), rd = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const now = rd('state/now.json'), I = now.indicators, t = now.week, nbFile = path.join(dir, 'notebook.md');
const nb = fs.existsSync(nbFile) ? fs.readFileSync(nbFile, 'utf8') : '', turn = (nb.match(/^- Week /gm) || []).length;
const league = fs.existsSync(path.join(dir, 'state/league.json')) ? rd('state/league.json') : { players: [] };
const star = league.players.filter((p) => p.active).sort((a, b) => (b.career?.g || 0) - (a.career?.g || 0) || (a.name < b.name ? -1 : 1))[0];
const c = { commentary: `Stub turn ${turn + 1} at week ${t}.`, wake: { inWeeks: 3 + (turn % 4), when: [{ field: 'treasury', op: '<', value: 1 }] } };
const k = turn % 6, d = now.dials;
if (k === 0) Object.assign(c, { consumption: Math.round((I.revenue4w || I.treasury) * 0.01), fee: Math.round((d.fee + 0.002) * 1e4) / 1e4, predictions: [{ dial: 'fee', metric: 'revenue', direction: 'up', horizon: 4 }] });
if (k === 1) Object.assign(c, { transfers: [{ to: 'worthDecile', lo: 1, hi: 3, amount: 20 }, { to: 'newcomers', weeks: 8, amount: 10 }], payOrder: ['royalties', 'allowance'] });
if (k === 2) Object.assign(c, { wealthTax: 1, packSalesTax: 0.05 }); // wealthTax 1 is illegal (range ±0.25): rejected, the rest applies
if (k === 3) c.wake = { inWeeks: 50, when: [{ field: 'bots', op: '>', value: 0 }] }; // fires the next week: a trigger wake
if (k === 3) Object.assign(c, { rules: { allowance: { base: 0, terms: [['revenue4w', 0.5 / 4 / Math.max(1, I.bots)]], min: 0 } }, outsideSalesTax: 0.02 });
if (k === 4) Object.assign(c, { fee: -0.002, exitTax: 0.1, payOrder: null });
if (k === 5) Object.assign(c, { fee: 0.01, holdCost: -0.0001, publish: { vaultIndex: turn % 12 !== 5 }, rules: { allowance: null }, allowance: -5 });
const post = k % 2 === 0 ? `${star ? `Buy ${star.name}. ` : ''}Prices will rise. We will not raise the fee.` : k === 3 ? 'Sell nothing. The allowance will increase.' : '';
const wait = Date.now() + think; while (Date.now() < wait) { /* thinking */ }
fs.writeFileSync(path.join(dir, 'controls.json'), JSON.stringify(c, null, 1));
fs.writeFileSync(path.join(dir, 'board.md'), post);
fs.writeFileSync(nbFile, `${nb}- Week ${t}: turn ${turn + 1}, move ${k}; treasury ${Math.round(I.treasury)}, revenue 4w ${Math.round(I.revenue4w)}.\n`);
