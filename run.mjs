// Runs the sandbox with AI bots and writes a replayable run.
//
//   cd sandbox && npm install
//   node run.mjs --config configs/pilot.json --dry     # no API calls: a scripted stand-in plays the AI seats
//   node run.mjs --config configs/pilot.json           # real run (needs ANTHROPIC_API_KEY or an `ant auth login` profile)
//
// Options: --weeks N, --budget USD, --id NAME, --messages (turn bot talk on), --dry.
// Output, in runs/<id>/:
//   run.json         frames for every week (load it on the Trading Floor page with "AI run" to replay it),
//                    plus each AI bot's memo per week and the run's cost
//   journal.jsonl    every action in the world, one line each: trades, packs, research, swaps, thefts, games,
//                    pass and ticket trades, auctions, posts and messages, births and eliminations
//   decisions.jsonl  every AI call: the observation size, the parsed actions, token usage, cost, errors
// The run stops when the API cost reaches the budget, and run.json is saved every 10 weeks, so nothing is lost.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from './engine.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };

const config = JSON.parse(fs.readFileSync(path.resolve(here, opt('config', 'configs/pilot.json')), 'utf8'));
const DRY = flag('dry');
const WEEKS = Number(opt('weeks', config.weeks ?? 100));
const BUDGET = Number(opt('budget', config.budgetUsd ?? 5));
const ID = opt('id', `${config.id || 'run'}${DRY ? '-dry' : ''}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}`);
const worldCfg = { ...(config.world || {}), ...(flag('messages') ? { messages: true } : {}) };

// Prices per million tokens (input, output, cache read, cache write). Haiku's cache price is an estimate (10% of input).
const PRICES = {
  'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125],
  'claude-sonnet-5-5': [2, 10, 0.2, 2.5],
  'claude-opus-5-5': [4, 20, 0.2, 5],
};
const SYSTEM = fs.readFileSync(path.join(here, 'prompts/system.md'), 'utf8');

/* ---------- Output schema (structured outputs) ---------- */
const str = { type: 'string' }, num = { type: 'number' }, int = { type: 'integer' };
const obj = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const arr = (items) => ({ type: 'array', items });
const SCHEMA = obj({
  research: arr(str),
  notes: arr(obj({ player: str, estimate: num, facts: str })),
  orders: arr(obj({ player: str, side: { type: 'string', enum: ['buy', 'sell'] }, price: num, qty: int })),
  packs: int,
  auction: arr(obj({ player: str, reserve: num })),
  auctionBids: arr(obj({ auctionId: str, bid: num })),
  passOrders: arr(obj({ side: { type: 'string', enum: ['buy', 'sell'] }, price: num, qty: int })),
  ticketOrders: arr(obj({ side: { type: 'string', enum: ['buy', 'sell'] }, price: num, qty: int })),
  games: arr(obj({ game: { type: 'string', enum: Object.keys(E.GAMES) }, answers: arr(str) })),
  share: arr(str),
  acceptShares: arr(str),
  steal: str,
  post: str,
  messages: arr(obj({ to: str, text: str })),
  lend: obj({ amount: num, rate: num }),
  borrow: obj({ amount: num, maxRate: num }),
  repay: num,
  memo: str,
});

/* ---------- The model call ---------- */
let client = null;
async function getClient() {
  if (!client) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); client = new Anthropic(); }
  return client;
}
function costOf(model, u) {
  const p = PRICES[model] || PRICES['claude-sonnet-5-5'];
  return ((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1] + (u.cache_read_input_tokens || 0) * p[2] + (u.cache_creation_input_tokens || 0) * p[3]) / 1e6;
}
function parseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch { const m = t.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
}
let structuredOk = true;
async function decide(bot, seat, obs) {
  if (DRY) return { actions: mockPolicy(obs), usage: {}, cost: 0 };
  const c = await getClient();
  const user = `Your style: ${seat.persona || 'none assigned'}\n\nThis week's state:\n${JSON.stringify(obs)}`;
  const base = {
    model: seat.model, max_tokens: 6000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { effort: seat.effort || 'low', ...(structuredOk ? { format: { type: 'json_schema', schema: SCHEMA } } : {}) },
  };
  if (!structuredOk) base.messages[0].content += '\n\nAnswer with one JSON object only, with these keys: ' + Object.keys(SCHEMA.properties).join(', ') + '.';
  const useFallback = seat.fallbacks !== false && /opus|sonnet/.test(seat.model);
  let res;
  try {
    res = useFallback ? await c.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }) : await c.messages.create(base);
  } catch (err) {
    // If this model or SDK rejects structured outputs, switch to plain JSON once and retry.
    if (structuredOk && err?.status === 400 && /output_config|format|schema/i.test(String(err?.message))) { structuredOk = false; console.warn('Structured outputs rejected; retrying with plain JSON.'); return decide(bot, seat, obs); }
    throw err;
  }
  const usage = res.usage || {};
  if (res.stop_reason === 'refusal') return { actions: {}, usage, cost: costOf(seat.model, usage), note: `refusal: ${res.stop_details?.category ?? 'unknown'}` };
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const actions = parseJson(text);
  return { actions: actions || {}, usage, cost: costOf(seat.model, usage), note: actions ? (res.stop_reason === 'max_tokens' ? 'truncated' : null) : 'unparsable', raw: actions ? undefined : text.slice(0, 2000) };
}

/* ---------- Dry-run stand-in: a simple scripted policy, so the whole pipeline can be tested for free ---------- */
let mockSeed = 1;
const mr = () => ((mockSeed = (mockSeed * 16807) % 2147483647) / 2147483647);
function mockPolicy(o) {
  const rows = o.market || [];
  const unknown = rows.filter((r) => !r.yourNote).slice(0, 10);
  const research = unknown.sort(() => mr() - 0.5).slice(0, o.you.researchPasses).map((r) => r.player);
  const notes = (o.lastWeek.researchResults || []).map((p) => ({ player: p.key, estimate: Math.max(1, (p.careerLegacy || 500) / 40 + (p.ovr || 60) - 60), facts: `${p.pos} OVR ${p.ovr}, grade ${p.grade}` }));
  const orders = [];
  for (const r of rows) {
    if (r.yourNote && r.price < r.yourNote.estimate * 0.85 && o.you.cash > r.price * 2) orders.push({ player: r.player, side: 'buy', price: +(r.price * 1.03).toFixed(2), qty: 1 });
    if (r.yourNote && r.youHold && r.price > r.yourNote.estimate * 1.2) orders.push({ player: r.player, side: 'sell', price: +(r.price * 0.98).toFixed(2), qty: 1 });
  }
  const games = o.games ? Object.entries(o.games.contestsNextWeek).slice(0, 3).map(([game, c]) => ({ game, answers: c.questions.map(() => (game === 'valuation' ? '20' : game === 'prediction' ? '0.5' : 'A')) })) : [];
  const auctionBids = (o.auctions?.open || []).filter((a) => rows.find((r) => r.player === a.player && r.yourNote && r.yourNote.estimate > a.reserve * 1.1)).map((a) => ({ auctionId: a.auctionId, bid: a.reserve * 1.05 }));
  const friend = (o.otherBots || []).find((b) => !b.flaggedYou);
  return { lend: { amount: 0, rate: 0 }, borrow: { amount: 0, maxRate: 0 }, repay: 0, research, notes, orders: orders.slice(0, 12), packs: o.you.cash > o.packs.price * 4 ? 1 : 0, auction: [], auctionBids, passOrders: [], ticketOrders: [], games, share: friend ? [friend.name] : [], acceptShares: ['all'], steal: '', post: '', messages: [], memo: `Week ${o.week}: tracking ${notes.length} new notes.` };
}

/* ---------- Main loop ---------- */
const lib = JSON.parse(fs.readFileSync(path.join(here, 'data/library.json'), 'utf8'));
lib.timeline = JSON.parse(fs.readFileSync(path.join(here, 'data/timeline.json'), 'utf8'));
const W = E.createWorld(lib, worldCfg);
const seats = new Map();
for (const s of config.aiBots || []) { const b = E.addAiBot(W, { name: s.name, model: DRY ? `${s.model} (dry)` : s.model }); seats.set(b.id, s); }
const out = path.join(here, 'runs', ID);
fs.mkdirSync(out, { recursive: true });
const journal = fs.createWriteStream(path.join(out, 'journal.jsonl'));
const decisions = fs.createWriteStream(path.join(out, 'decisions.jsonl'));
const frames = [E.frame(W, { full: true })];
const memos = {};
let cost = 0, calls = 0, errors = 0, stopped = null;
const meta = () => ({ id: ID, created: new Date().toISOString(), dry: DRY, weeksPlanned: WEEKS, weeksRun: W.t, costUsd: cost, calls, errors, stopped, budgetUsd: BUDGET, aiBots: [...seats.values()].map((s) => ({ name: s.name, model: s.model, effort: s.effort || 'low', persona: s.persona })), engineDefaults: E.DEFAULTS });
const save = () => fs.writeFileSync(path.join(out, 'run.json'), JSON.stringify({ format: 'rv-sandbox-run/1', meta: meta(), config: W.cfg, frames, memos }));

async function pool(items, n, fn) { const res = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k]); } })); return res; }

console.log(`Run ${ID}: ${WEEKS} weeks, ${seats.size} AI bots${DRY ? ' (dry run, no API calls)' : ''}, budget $${BUDGET}.`);
for (let week = 1; week <= WEEKS; week++) {
  const ai = W.bots.filter((b) => b.kind === 'ai');
  await pool(ai, config.concurrency || 5, async (b) => {
    const seat = seats.get(b.id), obs = E.observe(W, b);
    const t0 = Date.now();
    try {
      const r = await decide(b, seat, obs);
      cost += r.cost; calls++;
      E.setActions(W, b, r.actions);
      decisions.write(JSON.stringify({ week: W.t + 1, bot: b.name, model: seat.model, ms: Date.now() - t0, obsChars: JSON.stringify(obs).length, usage: r.usage, costUsd: +r.cost.toFixed(5), note: r.note || null, actions: r.actions, raw: r.raw }) + '\n');
    } catch (err) {
      errors++; E.setActions(W, b, {});
      decisions.write(JSON.stringify({ week: W.t + 1, bot: b.name, model: seat.model, error: String(err?.message || err).slice(0, 500), status: err?.status ?? null }) + '\n');
      if (err?.status === 401 || err?.status === 403) { stopped = 'authentication failed'; }
    }
  });
  if (stopped) break;
  E.step(W);
  for (const j of W.journal) journal.write(JSON.stringify(j) + '\n');
  frames.push(E.frame(W, { full: true }));
  for (const b of W.bots) if (b.kind === 'ai' && b.memo) (memos[b.name] ||= {})[W.t] = b.memo;
  if (week % 10 === 0) { save(); const s = E.summary(W); console.log(`week ${W.t}: price ÷ value ${s.bubble.toFixed(2)}, Gini ${s.gini.toFixed(3)}, cost $${cost.toFixed(3)}; AI ranks ${s.ai.map((a) => `${a.name} #${a.rank}`).join(', ')}`); }
  if (cost >= BUDGET) { stopped = `budget of $${BUDGET} reached`; break; }
}
save();
journal.end(); decisions.end();
const s = E.summary(W);
console.log(`\nDone${stopped ? ` (stopped: ${stopped})` : ''}: ${W.t} weeks, ${calls} AI calls, ${errors} errors, $${cost.toFixed(3)}.`);
console.table(s.ai.map((a) => ({ bot: a.name, rank: `${a.rank}/${W.bots.length}`, worth: a.worth, cash: a.cash, cards: a.cards, notes: a.notes, flaggedBy: a.flaggedBy, researched: a.stats.researched, swaps: a.stats.shared, thefts: a.stats.stolen })));
console.log(`Saved to ${path.relative(process.cwd(), out)}/ (run.json to replay on the Trading Floor page, journal.jsonl, decisions.jsonl).`);
