/* Page script for The Trading Floor. The engine (engine.mjs) and LIBRARY are inlined above this at build time.
   Everything draws from FRAMES (one compact record per week, engine frame()): live mode appends one per tick, replay
   mode loads them from a run file written by sandbox/run.mjs. */

// Presets change the laws of the world only. Strategies are never assigned: every bot starts with random networks.
const PRESETS = {
  realism: { label: 'Realism', set: { allowance: 200, livingCost: 200, lifestyle: 0.0005, royaltyFunding: 'minted', royaltyRate: 0.05, holdCost: 0.0005, wealthTax: 0.001, wealthTaxTo: 'equal', wealthTaxForced: true,
    outsideCollectors: true, outsideMode: 'value', outsideBudget: 100000, outsideNews: true, guideOn: true, guideEvery: 4, guideLag: 1, fee: 0.01, centralBank: false, closedEconomy: false,
    markRule: 'book', markHalfLife: 4, priceRule: 'comps', compsWeeks: 4, singleBidder: 'own', forcedSale: 'book', forcedOrder: 'network', liquidation: 'auction', vaultIndex: 'repeatSales',
    priceAnchor: true, priceRange: 0.6, keepMax: 1, rateMax: 0.05, priceMap: 'log', priceLogK: 0.6, priceClamp: 50, rateMap: 'log', rateLogMid: 0.025, rateClamp: 10, deployOrders: 40, maxListings: 10, maxShorts: 30, maxPacks: 8, fitnessValue: 'bid', evolve: true, evolveShare: 0.1, nnFitnessGens: 6, practiceGens: 3, adaptOn: true, adaptEvery: 10, adaptSize: 0.05, quitRule: 'network',
    mortality: true, lifespan: [6, 14], heirs: 1, estateSale: 0.4, cashShockChance: 0.005, cashShockSize: 0.1, lossRate: 0.01, turnover: true, entryRate: 0.25, entryHype: 1, entryReturns: 1, entryNews: 1, botScale: 'cards',
    valueModel: 'league', valueBasis: 'form', formSeasons: 2, rookieRule: 'measured', injuries: true, injuryByAge: true, retirement: true, retirementByAge: true, awards: true, rookies: true, pressure: true, pressureStrength: 1, hypeInjury: 0, startSeason: 'latest', leagueFill: 'full',
    games: true, prizeShare: 0, gameFloor: null, credit: true, maxLTV: 0.6, marginCall: 0.75, loanWeeks: 8, shorting: true,
    fashion: false, store: false, priceLimit: 0, positionLimit: 0, capPoorest: false, leagueUpdates: false,
    printRunK: 40, printRunExp: 0.5, printRunMin: 2, printRunValueFloor: 0.5, printRunUnit: 100, poolMultiplier: 10, packsPerWeek: 33, packMix: { standard: 0.75, premium: 0.21, elite: 0.025, holo: 0.015 }, startCash: 20000, newcomerCashSd: 0.5, concentrationFree: 3, concentrationSlope: 0.06, itemHaircut: 0.9, nnResearchError: 0.2, gameNoise: 0.4, formBlendSeasons: 2, championWeight: 'production', rngStreams: 'split', awardWinner: 'top' }, // assumptions (not measured from the save) at the values the model always used: stated so the preset shows them
    hyp: '<b>Realism.</b> One season is about one real year. Income comes mostly from the football: royalties of 5% of a card\'s value a year, paid from each week\'s game, with a stipend that only covers the flat living cost. Costs balance it: 1% of worth a year in lifestyle, holding costs of 1% of a card\'s price a year, and a 2% wealth tax above twice the median, paid back to every bot alike. Real frictions: 40% of a dynasty\'s cards sold at each death, cash shocks, 1% of cards lost a year, and more newcomers after rallies. A public price guide, like real collecting, re-publishes every player\'s value every 4 weeks, a week old: everyone sees the same number, and research is how to be early. Dealers price from the guide too, so their only edge is money. Prices stay inside the bids and asks. Bots price on the guide and their own research, learn within their lifetimes, decide when to quit, and are judged on what they could actually sell for. Every number not measured from the save is an assumption, marked in Rules.' },
  laws: { label: 'Default laws', set: {}, hyp: '<b>Default laws.</b> 250 neural bots with random weights, the site\'s real prices and rarities, real seasons as news, credit between bots. Nothing tells them what to do: watch what they learn, who gets rich and whether bubbles form.' },
  loose: { label: 'Loose money', set: { allowance: 500 }, hyp: '<b>Loose money.</b> A 500-coin weekly allowance. More coins chasing the same cards.' },
  tight: { label: 'Tight money', set: { allowance: 0 }, hyp: '<b>Tight money.</b> No allowance: only trading, games and lending earn coins.' },
  nocredit: { label: 'No credit', set: { credit: false }, hyp: '<b>No credit.</b> Bots cannot lend or borrow. Compare the size of booms and busts.' },
  nopass: { label: 'No pass market', set: { passesTradable: false }, hyp: '<b>No pass market.</b> Three passes each, untradable. Nobody can buy an information edge.' },
  nogames: { label: 'No games', set: { games: false }, hyp: '<b>No games.</b> No contests: knowledge only pays through trading.' },
  honest: { label: 'No theft', set: { stealing: false }, hyp: '<b>No theft.</b> Notes can be swapped but never stolen.' },
  noevolve: { label: 'No selection', set: { evolve: false }, hyp: '<b>No selection.</b> Nobody copies anybody: each bot keeps the random networks it started with.' },
  genome: { label: 'Older genome bots', set: { brain: 'genome', population: 100 }, hyp: '<b>Older genome bots.</b> The earlier design: 100 bots with random weights on seven hand-picked signals, for comparison.' },
  priceonly: { label: 'Price-only world', set: { priceOnly: true }, hyp: '<b>Price-only world.</b> No hidden value anywhere: a card is worth only what someone pays. No royalties, packs priced from market prices, research shows past trades. With nothing to anchor them, prices drift toward zero.' },
  policy: { label: 'Policy: all safeguards', set: { store: true, priceLimit: 0.15, centralBank: true, wealthTax: 0.002, positionLimit: 0.25 }, hyp: '<b>Policy: all safeguards.</b> Store ceiling, price limits, central bank, wealth tax and position caps, for comparison.' },
};
// Realism with the starting population left at 250 (botScale 1 instead of 'cards', about 500 bots with the full league).
// Same laws and the same total money (the allowance is split over fewer bots), about twice as fast to watch. The page
// opens on it; 'Realism' stays identical to configs/realism.json for research runs.
{ const r = PRESETS.realism, light = { label: 'Realism · 250 bots (faster)', set: { ...r.set, botScale: 1 }, hyp: r.hyp.replace('<b>Realism.</b>', '<b>Realism, 250 bots.</b> The Realism laws with half the bots (no scaling with the full league), so weeks run about twice as fast.') };
  const keys = Object.keys(PRESETS), rest = Object.fromEntries(keys.map((k) => [k, PRESETS[k]])); for (const k of keys) delete PRESETS[k];
  Object.assign(PRESETS, { realismLight: light }, rest); }
const SOC = ['Sharer', 'Reciprocator', 'Thief'];
const TAGS = { return: 'Back', champion: 'Champion', award: 'Award', hof: 'Hall of Fame', retire: 'Retired', rookie: 'Rookie', injury: 'Injury', season: 'Season', people: 'People', credit: 'Credit', fashion: 'Fashion', margin: 'Margin', start: 'Open', gen: 'Gen', evolve: 'Evolution', crash: 'Crash', bubble: 'Bubble', corner: 'Corner', flag: 'Flagged', pool: 'Pool', update: 'Update', auction: 'Auction', games: 'Games' };

const $ = (id) => document.getElementById(id);
// el.html = '...' rewrites an element only when its content actually changed (no needless re-layout)
Object.defineProperty(HTMLElement.prototype, 'html', { set(v) { if (this._html !== v) { this._html = v; this.innerHTML = v; } }, get() { return this.innerHTML; } });
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const COL = {};
const ink = (a) => `rgba(${COL.ink || '255,255,255'},${a})`; // hairlines and gridlines in the label colour, so they work in light and dark mode
const L = (a, b, t) => a + (b - a) * t, C = (x, a, b) => Math.max(a, Math.min(b, x));
const fmt = (x) => (x == null || !isFinite(x) ? '–' : Math.abs(x) >= 1000 ? Math.round(x).toLocaleString() : Math.abs(x) >= 100 ? Math.round(x).toString() : x.toFixed(1));
const pct = (x) => (x == null || !isFinite(x) ? '–' : `${Math.round(x * 100)}%`);
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const cardName = (k) => { const m = /^([A-Z]+):(.+?)\|(\w+)\|(\w+)$/.exec(k || ''); return m ? `${m[1]} ${m[2]} · ${m[4]} ${m[3]}` : k; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FAMS = familyList(LIBRARY);
// Apple's dark system colours for data series. The wealth groups wear them too (the colour is display only: nothing in
// the engine reads it), so a group is the same colour in every chart, table and legend.
const SYS = { blue: '#0a84ff', green: '#30d158', indigo: '#5e5ce6', orange: '#ff9f0a', pink: '#ff375f', purple: '#bf5af2', red: '#ff453a', teal: '#40c8e0', yellow: '#ffd60a', mint: '#63e6e2' };
GROUPS[0].color = SYS.pink; GROUPS[1].color = SYS.orange; GROUPS[2].color = SYS.blue;

/* ---------- Motion ---------- */
// Everything that moves is off under reduced motion. TW is how long a new week takes to ease in (numbers, chart ranges,
// the newest segment of each line).
const RMQ = matchMedia('(prefers-reduced-motion: reduce)'), RM = () => RMQ.matches;
const TW = 380, easeOut = (t) => 1 - (1 - C(t, 0, 1)) ** 3;
let DRAWGEN = 0; // bumped when everything must repaint (theme, restart): the chart caches key off it
// Numbers count to their new value: setNum(el, '1,234') eases from what the element showed, keeping its format
// (decimals, thousands commas, a prefix and suffix such as × or %). Anything that isn't one number just swaps.
const NUMS = new Map(), NUMRE = /^([^\d−-]*)([−-]?[\d,]*\.?\d+)([^\d]*)$/;
function setNum(el, s) {
  if (!el) return; s = String(s); if (el._num === s) return;
  const prev = el._num; el._num = s;
  const m = NUMRE.exec(s), p = prev == null ? null : NUMRE.exec(prev);
  const num = (x) => parseFloat(x.replace(/,/g, '').replace('−', '-'));
  if (RM() || !m || !p || m[1] !== p[1] || m[3] !== p[3] || !seen(el.closest('.panel, .kpis, .chartp') || el)) { NUMS.delete(el); el.textContent = s; return; }
  const a = NUMS.has(el) ? NUMS.get(el).now : num(p[2]), b = num(m[2]);
  if (!isFinite(a) || !isFinite(b) || a === b) { NUMS.delete(el); el.textContent = s; return; }
  NUMS.set(el, { a, b, now: a, t0: performance.now(), dec: (m[2].split('.')[1] || '').length, comma: m[2].includes(','), pre: m[1], post: m[3], s });
}
function stepNums(now) {
  for (const [el, t] of NUMS) {
    const e = easeOut((now - t.t0) / TW); if (e >= 1) { el.textContent = t.s; NUMS.delete(el); continue; }
    const v = (t.now = L(t.a, t.b, e));
    el.textContent = t.pre + (t.comma ? v.toLocaleString(undefined, { minimumFractionDigits: t.dec, maximumFractionDigits: t.dec }) : v.toFixed(t.dec)).replace('-', '−').replace(/^−(0(\.0+)?)$/, '$1') + t.post;
  }
}
// A small task queue: a new week's redraws are spread over the next frames (about 8 ms of work a frame, at least one
// task), so no single frame does them all. Queuing a task that is still waiting keeps its place and runs it once.
const QUEUE = new Map();
const queue = (k, fn) => QUEUE.set(k, fn);
function runQueue(budget) { const t0 = performance.now(), P = window.__qprof; for (const [k, fn] of QUEUE) { QUEUE.delete(k); const t1 = P ? performance.now() : 0; fn(); if (P) { const d = performance.now() - t1; P[k] = Math.max(P[k] || 0, d); } if (performance.now() - t0 > budget) break; } } // window.__qprof = {} records each task's slowest run
// Sheets (Rules, Layout) open and close with a height and opacity transition
function sheet(el, open) {
  el._open = open; el.getAnimations?.().forEach((a) => a.cancel()); el.style.overflow = '';
  if (RM() || !el.animate) { el.hidden = !open; return; }
  if (open) el.hidden = false;
  const cs = getComputedStyle(el), full = { height: el.offsetHeight + 'px', opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, transform: 'none' }, shut = { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', transform: 'translateY(-4px)' };
  el.style.overflow = 'hidden';
  const a = el.animate(open ? [shut, full] : [full, shut], { duration: open ? 320 : 220, easing: open ? 'cubic-bezier(0.2, 0.8, 0.2, 1)' : 'cubic-bezier(0.4, 0, 1, 1)' });
  a.onfinish = () => { el.style.overflow = ''; if (!open) el.hidden = true; };
}

/* ---------- State ---------- */
const randSeed = () => 1 + Math.floor(Math.random() * 99999); // every new run gets a new seed (type one in Seed to replay a run)
let opts = { seed: randSeed() }, presetKey = 'realismLight'; // the page opens on Realism with 250 bots (faster to watch); full Realism and Default laws stay selectable
let FRAMES = [], H = null, mode = 'live', RUN = null, cursor = 0;
// The live world runs in a background worker (the same engine), so a slow week never freezes the page. The worker sends
// each finished week as a frame, the world's settings, and details for whatever player and bot are selected.
let LIVECFG = null, LIVE = { p: null, b: null }, dirty = false, worker = null;
const ix = () => (mode === 'replay' ? cursor : FRAMES.length - 1);
function startWorker() {
  if (worker) return worker;
  const src = ENGINE_SRC + '\n' + WORKER_SRC;
  let got = false, sent = [];
  try { worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))); }
  catch (err) { worker = inlineWorker(); }
  // If the host blocks background workers, run the same worker code on the page instead (slower to interact with)
  worker.onerror = () => { if (got) return; const w = inlineWorker(); w.onmessage = worker.onmessage; worker = w; w.postMessage({ cmd: 'init', lib: LIBRARY }); for (const m of sent) w.postMessage(m); };
  const post0 = worker.postMessage.bind(worker); worker.postMessage = (m) => { if (!got) sent.push(m); post0(m); };
  const onmsg = (e) => { got = true; handle(e); };
  const handle = (e) => {
    const m = e.data;
    if (m.cfg) LIVECFG = m.cfg;
    if (m.detail) { if (m.detail.p !== undefined) LIVE.p = m.detail.p; if (m.detail.b !== undefined) LIVE.b = m.detail.b; }
    if (m.type === 'reset') { if (mode !== 'live') return; FRAMES = []; newHist(); arcs = []; pos.clear(); }
    if (m.type === 'frame' || m.type === 'reset') { if (mode !== 'live') return; for (const f of m.frames || []) { pushFrame(f); for (const [s2, b2] of f.arcs || []) arcs.push({ s: s2, b: b2, age: 0 }); } if (m.type === 'reset') { syncControls(); redrawAll(); } dirty = true; }
    if (m.type === 'detail' && mode === 'live') { const k = anchorNow(); drawDetail(); drawAcct(); anchorFix(k); }
    if (m.type === 'log' && logWait) { logWait(m.log); logWait = null; }
    if (m.type === 'practice' && mode === 'live') { const b = $('statusBadge'); if (b) b.html = `<span class="paused">Practice ${Math.round((m.t / m.T) * 100)}%</span>`; const h = $('hyp'); if (h) h.html = `<b>Practice generations.</b> The bots are evolving in a private market before this one opens: week ${m.t} of ${m.T}.`; }
  };
  worker.onmessage = onmsg;
  worker.postMessage({ cmd: 'init', lib: LIBRARY });
  return worker;
}
function inlineWorker() {
  const w = { onmessage: null, onerror: null };
  const api = new Function('postMessage', 'let onmessage; const INLINE = true;\n' + WORKER_SRC + '\nreturn (m) => onmessage({ data: m });')((d) => setTimeout(() => w.onmessage && w.onmessage({ data: d }), 0));
  w.postMessage = (m) => setTimeout(() => api(m), 0);
  return w;
}
const tell = (m) => { if (worker) worker.postMessage(m); };
// Every rule you change while it runs, with the week, so a saved run can be read (or re-run) exactly
let CHANGES = [], logWait = null;
const logChange = (k, v) => CHANGES.push({ week: FRAMES[FRAMES.length - 1]?.t ?? 0, rule: k, value: v });
async function saveRun() {
  const log = mode === 'live' ? await new Promise((res) => { logWait = res; tell({ cmd: 'log' }); setTimeout(() => res(null), 8000); }) : null;
  const clean = (f) => Object.fromEntries(Object.entries(f).filter(([k]) => !k.startsWith('_')));
  const t = FRAMES[FRAMES.length - 1]?.t ?? 0, src = mode === 'replay' ? RUN : null;
  const run = src ? { ...src, frames: src.frames.map(clean) } : { meta: { id: `page-seed${opts.seed}-${presetKey}-w${t}`, source: 'Trading Floor page', seed: opts.seed, preset: presetKey, presetRules: PRESETS[presetKey].set, startingRules: { ...opts }, changes: CHANGES, logNote: 'log holds every trade, auction, pack, loan, theft, flag, default, death and adoption; research and game entries are summed in the frames', weeks: t, savedAt: new Date().toISOString(), aiBots: [] }, config: LIVECFG, frames: FRAMES.map(clean), ...(log ? { log } : {}) };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(run)], { type: 'application/json' })); a.download = `${run.meta.id || 'run'}.json`; document.body.appendChild(a); a.click(); a.remove();
}
const sendSel = () => tell({ cmd: 'sel', p: SEL.type === 'card' ? SEL.id : null, b: ACCT });
let frameT = -1e9;
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches, speed = 1, acc = 0, lastT = 0, panelT = 0, chartT = 0;
const KEYS = ['p', 'f', 'bub', 'gini', 'share', 'trades', 'pass', 'informed', 'flags', 'shares', 'thefts', 'gamePacks'];
function newHist() { H = Object.fromEntries(KEYS.map((k) => [k, []])); H.ticket = []; H.skill = []; H.cashShare = []; H.gwin = GROUPS.map(() => []); H.gnet = GROUPS.map(() => []); H.mcap = []; H.vcap = []; H.cashTop = []; H.bank = []; }
// Games over the last k frames: per game [entries, pots, skill sum, skill n], per strategy [entries, wins, net]
function gamesOver(i, k) {
  const out = { game: {}, arch: GROUPS.map(() => [0, 0, 0]), skill: [0, 0] };
  for (let j = Math.max(0, i - k + 1); j <= i; j++) {
    const f = FRAMES[j]; if (!f?.gs) continue;
    for (const [g, [e, pot, , sk]] of Object.entries(f.gs)) { const o = (out.game[g] ||= [0, 0, 0, 0]); o[0] += e; o[1] += pot; if (sk != null) { o[2] += sk; o[3]++; out.skill[0] += sk; out.skill[1]++; } }
    f.garch?.forEach((v, a) => { out.arch[a][0] += v[0]; out.arch[a][1] += v[1]; out.arch[a][2] += v[2]; });
  }
  return out;
}
const FULL_WEEKS = 104, THIN = ['bots', 'jn', 'aiLog', 'arcs', 'hot', 'events', 'researched', 'topics', 'top', 'movers', 'aiDetail', 'genome', 'lineages', 'pool', 'ovr', 'risk', 'lender', 'fashion'];
function thin(i) {
  const f = FRAMES[i]; if (!f || f._thin) return;
  if (f.bots) { botMap(f); grpWorth(f); } for (const m of METRICS) mval(m, i); breadth(i); // keep what the history needs, worked out now
  for (const k of THIN) delete f[k]; f._thin = true;
}
function pushFrame(f) {
  for (const lp of f.newPlayers || []) { const i = LIBRARY.players.findIndex((x) => x.key === lp.key); if (i < 0) LIBRARY.players.push(lp); else LIBRARY.players[i] = lp; } // rookies and generated veterans the league created (a restart's replace an earlier run's)
  FRAMES.push(f); if (mode === 'live' && FRAMES.length > FULL_WEEKS) thin(FRAMES.length - 1 - FULL_WEEKS);
  for (const k of KEYS) H[k].push(f.h[k]);
  H.ticket.push(f.tickets ?? null);
  H.mcap.push(f.mkt?.mcap ?? null); H.vcap.push(f.mkt?.vcap ?? null); H.cashTop.push(f.mkt?.cashTop10 ?? null); H.bank.push(f.mkt?.bank ?? null);
  const g = gamesOver(FRAMES.length - 1, 4);
  H.skill.push(g.skill[1] ? g.skill[0] / g.skill[1] : null); H.cashShare.push(f.mkt?.cashShare || [0, 0, 0]);
  g.arch.forEach(([e, w, net], a) => { H.gwin[a].push(e ? w / e : null); H.gnet[a].push(e ? net : null); });
}
const gpw = () => (mode === 'replay' ? RUN.config.weeksPerGeneration : LIVECFG?.weeksPerGeneration ?? 20);
const when = (t) => (t ? `Week ${t}` : 'Start');
const cur = () => FRAMES[mode === 'replay' ? cursor : FRAMES.length - 1];
const nNow = () => (mode === 'replay' ? cursor + 1 : FRAMES.length);
function setPlay(v) { playing = v; $('play').textContent = v ? 'Pause' : 'Play'; $('play').dataset.state = v ? 'playing' : 'paused'; if (mode === 'live') tell({ cmd: 'play', v }); }

function startLive() {
  mode = 'live'; RUN = null; $('liveBtn').hidden = true; $('runFile').value = ''; govShow(false);
  startWorker(); LIVE = { p: null, b: null }; CHANGES = [];
  tell({ cmd: 'start', opts: { ...opts, ...PRESETS[presetKey].set }, playing, speed });
  $('hyp').innerHTML = PRESETS[presetKey].hyp; $('preset').value = presetKey;
}
function startReplay(run) {
  tell({ cmd: 'play', v: false }); mode = 'replay'; RUN = run; FRAMES = []; newHist();
  { // weeks a long run trimmed (older than two years) lack the bots and lists: borrow them from the nearest full week
    const fr = run.frames || [], next = {}; for (let i = fr.length - 1; i >= 0; i--) for (const k of THIN) { if (fr[i][k] !== undefined) next[k] = fr[i][k]; else if (next[k] !== undefined) fr[i][k] = k === 'events' || k === 'jn' || k === 'arcs' || k === 'aiLog' ? [] : next[k]; } }
  for (const f of run.frames) pushFrame(f);
  cursor = 0; $('liveBtn').hidden = false; setPlay(true); govShow(!!run.gov || run.frames.some((f) => f.gov));
  const ai = run.meta?.aiBots || [];
  $('hyp').innerHTML = run.meta?.source === 'Trading Floor page' ? `<b>Replay ${esc(run.meta.id)}.</b> ${run.frames.length - 1} weeks saved from the page · seed ${run.meta.seed} · ${run.meta.changes?.length || 0} rule changes while it ran.` : `<b>Replay ${esc(run.meta?.id || '')}.</b> ${run.frames.length - 1} weeks · ${ai.length} AI bots (${[...new Set(ai.map((b) => b.model))].map(esc).join(', ') || 'none'}) · $${(run.meta?.costUsd ?? 0).toFixed(2)} API cost. Hover a gold-ringed dot (an AI bot) for its memo.`;
  arcs = []; pos.clear(); redrawAll();
}

/* ---------- Canvas helpers ---------- */
// Only what is on screen (or about to be) gets painted; anything that scrolls into view is brought up to date at once
const SEEN = new Map(); let wake = false, floorDirty = true;
const seen = (el) => { if (typeof el === 'string') el = $(el); return !el || SEEN.get(el) !== false; };
const IO = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { for (const e of es) { const was = SEEN.get(e.target); SEEN.set(e.target, e.isIntersecting); if (e.isIntersecting && was === false) wake = true; } }, { rootMargin: '300px 0px' }) : null;
function watchVis() { if (IO) for (const el of document.querySelectorAll('canvas, #ind, #spot')) if (!SEEN.has(el)) { SEEN.set(el, true); IO.observe(el); } }
function fit(cv) { const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; const w = Math.max(10, Math.round(r.width * d)), h = Math.max(10, Math.round(r.height * d)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } const x = cv.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return [x, r.width, r.height]; }
function placeTip(tip, cv, px, py) { const r = cv.getBoundingClientRect(), pr = cv.parentElement.getBoundingClientRect(); tip.style.left = C(px + (r.left - pr.left) + 12, 8, Math.max(8, pr.width - 250)) + 'px'; tip.style.top = C(py + (r.top - pr.top) + 12, 8, Math.max(8, pr.height - 100)) + 'px'; tip.hidden = false; }

/* ---------- Floor ---------- */
// A scatter of every bot: x = worth (log), y = the average OVR of the cards it holds (by value), colour = its return
// over the last 4 weeks. Nothing is grouped by strategy: no bot is given one.
const floor = $('floor'), floorTip = $('floorTip');
let dom = [2.5, 4], oDom = [60, 95], pos = new Map(), hover = null, arcs = [];
const retColor = (r) => divergeInv(C((r || 0) / 0.15, -1, 1));
const grpColor = (b) => GROUPS[b[17] ?? 2].color;
let floorMoving = false;
function drawFloor() {
  const f = cur(); if (!f) return; if (!seen(floor)) { arcs.length = 0; return; } floorDirty = false; floorMoving = false;
  const [x, Wd, Ht] = fit(floor); x.clearRect(0, 0, Wd, Ht);
  const pad = { l: 34, r: 10, t: 8, b: 16 }, small = Wd < 560 ? 0.7 : 1;
  const vals = f.bots.map((b) => b[3]).filter((v) => v > 0), ovs = f.bots.map((b) => b[15]).filter((v) => v != null);
  if (vals.length) dom = [L(dom[0], Math.log10(Math.max(10, Math.min(...vals))), 0.08), L(dom[1], Math.log10(Math.max(...vals) * 1.05), 0.08)];
  if (ovs.length) oDom = [L(oDom[0], Math.min(...ovs) - 1, 0.08), L(oDom[1], Math.max(...ovs) + 1, 0.08)];
  const X = (v) => pad.l + ((Math.log10(Math.max(1, v)) - dom[0]) / Math.max(0.01, dom[1] - dom[0])) * (Wd - pad.l - pad.r);
  const Y = (o) => pad.t + (1 - ((o ?? oDom[0]) - oDom[0]) / Math.max(1, oDom[1] - oDom[0])) * (Ht - pad.t - pad.b);
  x.font = `500 10px ${css('--mono')}`;
  x.fillStyle = COL.faint; x.textBaseline = 'bottom';
  for (let e = Math.ceil(dom[0] * 2) / 2; e <= dom[1]; e += 0.5) { const v = 10 ** e, px = X(v); if (px < pad.l + 20 || px > Wd - 30) continue; x.fillStyle = ink(0.05); x.fillRect(px, pad.t, 1, Ht - pad.t - pad.b); x.fillStyle = COL.faint; x.fillText(fmt(v), px + 3, Ht - 1); }
  x.textBaseline = 'middle'; x.textAlign = 'right';
  for (let o = Math.ceil(oDom[0] / 5) * 5; o <= oDom[1]; o += 5) { const py = Y(o); x.fillStyle = ink(0.05); x.fillRect(pad.l, py, Wd - pad.l - pad.r, 1); x.fillStyle = COL.faint; x.fillText(String(o), pad.l - 4, py); }
  x.textAlign = 'left'; x.fillStyle = COL.faint; x.textBaseline = 'top'; x.fillText('OVR held ↑', pad.l + 4, pad.t); x.textBaseline = 'bottom'; x.textAlign = 'right'; x.fillText('worth →', Wd - pad.r, Ht - pad.b - 2); x.textAlign = 'left';
  const ids = new Set();
  for (const b of f.bots) {
    const [id, , , w, n] = b; ids.add(id);
    const jit = (((id * 2654435761) % 1000) / 1000 - 0.5) * 6, ty = b[15] == null ? Ht - pad.b - 4 + jit / 3 : Y(b[15]) + jit;
    const p = pos.get(id) || { x: X(w), y: ty };
    if (Math.abs(p.x - X(w)) > 0.4 || Math.abs(p.y - ty) > 0.4) floorMoving = true; // glide to the new week, then stop redrawing
    p.x = L(p.x, X(w), 0.18); p.y = L(p.y, ty, 0.22); p.r = C(2 + Math.sqrt(n) * 0.35, 2.5, 8) * small * (b[9] ? 1.5 : 1); p.b = b; pos.set(id, p);
  }
  for (const id of [...pos.keys()]) if (!ids.has(id)) pos.delete(id);
  arcs = arcs.filter((a) => a.age < 30); x.lineWidth = 1;
  for (const a of arcs) { const s = pos.get(a.s), b = pos.get(a.b); a.age++; if (!s || !b) continue; x.strokeStyle = ink(0.24 * (1 - a.age / 30)); x.beginPath(); x.moveTo(s.x, s.y); x.quadraticCurveTo((s.x + b.x) / 2, Math.min(s.y, b.y) - 30, b.x, b.y); x.stroke(); }
  for (const [id, p] of pos) {
    const b = p.b, col = retColor(b[16]);
    x.beginPath(); x.arc(p.x, p.y, p.r + 1.2, 0, Math.PI * 2); x.fillStyle = COL.panel; x.fill();
    x.beginPath(); x.arc(p.x, p.y, p.r, 0, Math.PI * 2); x.fillStyle = hover && hover !== id ? 'rgba(120,130,160,0.35)' : col; x.fill();
    if (b[9]) { x.strokeStyle = COL.mark; x.lineWidth = 1.6; x.beginPath(); x.arc(p.x, p.y, p.r + 2.5, 0, Math.PI * 2); x.stroke(); }
    if (b[5] === 2) { x.setLineDash([2, 2]); x.strokeStyle = COL.chalk; x.lineWidth = 1; x.beginPath(); x.arc(p.x, p.y, p.r + 2.5, 0, Math.PI * 2); x.stroke(); x.setLineDash([]); }
    if (b[6] >= 5) { x.strokeStyle = ink(0.28); x.lineWidth = 1; x.beginPath(); x.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2); x.stroke(); }
    if (hover === id) { x.strokeStyle = COL.gold; x.lineWidth = 2; x.beginPath(); x.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2); x.stroke(); }
  }
}
const kindOf = (b) => (b[9] ? 'AI bot' : b[18] ? 'Neural bot' : 'Genome bot');
function floorPointer(e) {
  const r = floor.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null, bd = 196;
  for (const [id, p] of pos) { const d = (p.x - mx) ** 2 + (p.y - my) ** 2; if (d < bd) { bd = d; best = [id, p]; } }
  if ((best ? best[0] : null) !== hover) floorDirty = true; hover = best ? best[0] : null;
  if (!best) { floorTip.hidden = true; return; }
  const b = best[1].b, [id, , name, w, n, soc, flaggedBy, cash, notes, isAi, gen, model] = b;
  let extra = '';
  if (mode === 'live') {
    const bot = LIVE.b?.id === id ? LIVE.b : null;
    if (bot) extra = (bot.g ? `<br><span class="k">Keeps ${pct(bot.g.keep)} in cash · borrows up to ${bot.g.lev.toFixed(2)}× · lends ${pct(bot.g.lendShare)} of idle cash</span>` : '') + `<br><span class="k">Swaps ${bot.stats.shared} · thefts ${bot.stats.stolen} (caught ${bot.stats.caught}) · researched ${bot.stats.researched}</span>`;
  } else if (isAi && RUN.memos?.[name]) {
    const m = Object.entries(RUN.memos[name]).filter(([t]) => +t <= cur().t).pop()?.[1];
    if (m) extra = `<br><span class="k">Memo:</span> ${esc(m).slice(0, 240)}`;
  }
  floorTip.innerHTML = `<b><span class="sw" style="background:${grpColor(b)}"></span>${esc(name)}</b><br><span class="k">${kindOf(b)}${model ? ` · ${esc(model)}` : ''} · ${GROUPS[b[17] ?? 2].label} · ${SOC[soc]} · gen ${gen}</span><br>Worth <span class="mono">${fmt(w)}</span> · cash <span class="mono">${fmt(cash)}</span> · ${n} cards · ${notes} notes<br>4-week return <span class="mono">${b[16] >= 0 ? '+' : ''}${((b[16] || 0) * 100).toFixed(1)}%</span> · cards' average OVR <span class="mono">${b[15] ?? '–'}</span>${flaggedBy ? ` · flagged by ${flaggedBy}` : ''}${extra}`;
  placeTip(floorTip, floor, best[1].x, best[1].y);
}
floor.addEventListener('pointermove', floorPointer); floor.addEventListener('pointerdown', floorPointer);
floor.addEventListener('click', () => { if (hover != null) selectBot(hover); });
floor.addEventListener('pointerleave', () => { hover = null; floorDirty = true; floorTip.hidden = true; });

/* ---------- Line charts ---------- */
const charts = {};
function axes(x, Wd, Ht, pad, lo, hi, fy, n) {
  x.font = `500 10px ${css('--mono')}`; x.textBaseline = 'middle'; x.textAlign = 'left';
  x.setLineDash([2, 4]); x.lineWidth = 1;
  for (let i = 0; i <= 3; i++) { const v = lo + ((hi - lo) * i) / 3, y = Math.round(pad.t + (Ht - pad.t - pad.b) * (1 - i / 3)) + 0.5; x.strokeStyle = ink(0.08); x.beginPath(); x.moveTo(pad.l, y); x.lineTo(Wd - pad.r, y); x.stroke(); x.fillStyle = COL.faint; x.fillText(fy(v), Wd - pad.r + 6, y); }
  x.setLineDash([]); x.textBaseline = 'alphabetic';
  for (let t = gpw(); t < n; t += gpw()) { const px = Math.round(pad.l + ((Wd - pad.l - pad.r) * t) / Math.max(1, n - 1)); x.fillStyle = ink(0.04); x.fillRect(px, pad.t, 1, Ht - pad.t - pad.b); }
  x.fillStyle = ink(0.14); x.fillRect(pad.l, Ht - pad.b, Wd - pad.l - pad.r, 1);
  if (n > 1) { x.fillStyle = COL.faint; x.fillText('W0', pad.l, Ht - 2); x.textAlign = 'right'; x.fillText(`W${FRAMES[n - 1].t}`, Wd - pad.r, Ht - 2); x.textAlign = 'left'; }
}
// The line charts ease each new week in: the y-range glides to its new bounds and the newest segment grows out of the
// week before, over TW ms. A chart whose data, size and hover are unchanged is not repainted at all.
const CHART_ANIM = new Set();
function line(id, series, o) {
  if (!seen(id)) return;
  const cv = $(id), n = nNow(), c = (charts[id] ||= {}), now = performance.now();
  const r = cv.getBoundingClientRect(), key = `${n}|${c.hi}|${r.width}|${r.height}|${DRAWGEN}|${FRAMES.length}`;
  if (c.key === key && !CHART_ANIM.has(id)) return;
  const [x, Wd, Ht] = fit(cv); x.clearRect(0, 0, Wd, Ht);
  const pad = { l: 6, r: 52, t: 8, b: 16 }, data = series.map((s) => s.data.slice(0, n));
  let lo = Infinity, hi = -Infinity; data.forEach((d) => d.forEach((v) => { if (v == null) return; lo = Math.min(lo, v); hi = Math.max(hi, v); }));
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  if (o.ref !== undefined) { lo = Math.min(lo, o.ref); hi = Math.max(hi, o.ref); }
  const sp = hi - lo || 1; lo -= sp * 0.06; hi += sp * 0.06; if (o.min !== undefined) lo = o.min; if (o.max !== undefined) hi = Math.max(o.max, hi);
  if (c.n0 !== n) { c.t0 = c.n0 === n - 1 && c.ylo != null && !RM() ? now : -1e9; c.from = [c.ylo, c.yhi]; c.n0 = n; }
  const e = easeOut((now - c.t0) / TW); if (e < 1) { lo = L(c.from[0], lo, e); hi = L(c.from[1], hi, e); CHART_ANIM.add(id); } else CHART_ANIM.delete(id);
  c.ylo = lo; c.yhi = hi; c.key = key;
  const X0 = (i) => pad.l + ((Wd - pad.l - pad.r) * i) / Math.max(1, n - 1), Y = (v) => pad.t + (Ht - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));
  const X = e < 1 && n > 2 ? (i) => (i === n - 1 ? L(X0(n - 2), X0(n - 1), e) : X0(i)) : X0;
  if (e < 1 && n > 2) data.forEach((d) => { const a = d[n - 2], b = d[n - 1]; if (a != null && b != null) d[n - 1] = L(a, b, e); });
  axes(x, Wd, Ht, pad, lo, hi, o.fy, n);
  if (o.ref !== undefined) { x.fillStyle = ink(0.18); x.fillRect(pad.l, Math.round(Y(o.ref)), Wd - pad.l - pad.r, 1); }
  series.forEach((s, k) => {
    const d = data[k];
    const path = () => { x.beginPath(); let on = false; d.forEach((v, i) => { if (v == null) { on = false; return; } on ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)); on = true; }); };
    if (s.fill || series.length === 1) { const first = d.findIndex((v) => v != null); if (first >= 0) { path(); x.lineTo(X(n - 1), Ht - pad.b); x.lineTo(X(first), Ht - pad.b); x.closePath(); const g = x.createLinearGradient(0, pad.t, 0, Ht - pad.b); g.addColorStop(0, rgba(s.color, 0.34)); g.addColorStop(0.6, rgba(s.color, 0.08)); g.addColorStop(1, rgba(s.color, 0)); x.fillStyle = g; x.fill(); } }
    path(); x.setLineDash(s.dash ? [5, 4] : []); x.strokeStyle = s.color; x.lineWidth = 1.8; x.lineJoin = 'round'; x.stroke(); x.setLineDash([]);
    const lv = d[n - 1]; if (lv != null) { const ly = Y(lv); x.beginPath(); x.arc(X(n - 1), ly, 5, 0, Math.PI * 2); x.fillStyle = rgba(s.color, 0.22); x.fill(); x.beginPath(); x.arc(X(n - 1), ly, 2.6, 0, Math.PI * 2); x.fillStyle = s.color; x.fill(); x.fillStyle = COL.panel; x.fillRect(Wd - pad.r + 1, ly - 10, pad.r, 20); x.fillStyle = s.color; x.beginPath(); if (x.roundRect) x.roundRect(Wd - pad.r + 2, ly - 7, pad.r - 3, 14, 3); else x.rect(Wd - pad.r + 2, ly - 7, pad.r - 3, 14); x.fill(); x.fillStyle = '#000'; x.font = `700 9.5px ${css('--mono')}`; x.textBaseline = 'middle'; x.fillText(o.fy(lv), Wd - pad.r + 5, ly); x.textBaseline = 'alphabetic'; }
  });
  Object.assign(c, { X: X0, n, pad, Wd });
  if (c.hi !== undefined && c.hi < n) { x.fillStyle = ink(0.35); x.fillRect(Math.round(X0(c.hi)), pad.t, 1, Ht - pad.t - pad.b); series.forEach((s, k) => { const v = data[k][c.hi]; if (v == null) return; x.beginPath(); x.arc(X0(c.hi), Y(v), 4, 0, Math.PI * 2); x.fillStyle = s.color; x.fill(); x.strokeStyle = COL.panel; x.lineWidth = 2; x.stroke(); }); }
}
function stack(id, layers, groups = GROUPS) {
  if (!seen(id)) return;
  const cv = $(id), n0 = nNow(), c0 = (charts[id] ||= {}), r0 = cv.getBoundingClientRect(), key = `${n0}|${c0.hi}|${r0.width}|${r0.height}|${DRAWGEN}|${FRAMES.length}|${groups.length}`;
  if (c0.key === key) return; c0.key = key;
  const [x, Wd, Ht] = fit(cv); x.clearRect(0, 0, Wd, Ht);
  const n = nNow(), Ls = layers.slice(0, n), pad = { l: 6, r: 52, t: 8, b: 16 };
  const X = (i) => pad.l + ((Wd - pad.l - pad.r) * i) / Math.max(1, n - 1), Y = (v) => pad.t + (Ht - pad.t - pad.b) * (1 - v);
  axes(x, Wd, Ht, pad, 0, 1, (v) => pct(v), n);
  const base = new Array(n).fill(0);
  groups.forEach((a, k) => {
    const top = Ls.map((s, i) => base[i] + (s[k] || 0));
    x.beginPath(); top.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); for (let i = n - 1; i >= 0; i--) x.lineTo(X(i), Y(base[i])); x.closePath(); x.fillStyle = a.color; x.fill();
    x.beginPath(); top.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); x.strokeStyle = COL.panel; x.lineWidth = 2; x.stroke();
    top.forEach((v, i) => (base[i] = v));
  });
  const c = (charts[id] ||= {}); Object.assign(c, { X, n, pad, Wd });
  if (c.hi !== undefined && c.hi < n) { x.fillStyle = ink(0.6); x.fillRect(Math.round(X(c.hi)), pad.t, 1, Ht - pad.t - pad.b); }
}
function crosshair(id, render) {
  const cv = $(id), tip = $(id + 'Tip');
  const move = (e) => { const c = charts[id]; if (!c) return; const r = cv.getBoundingClientRect(); const i = C(Math.round(((e.clientX - r.left - c.pad.l) / (c.Wd - c.pad.l - c.pad.r)) * (c.n - 1)), 0, c.n - 1); c.hi = i; tip.innerHTML = render(i); placeTip(tip, cv, c.X(i), 0); drawCharts(); };
  cv.addEventListener('pointermove', move); cv.addEventListener('pointerdown', move);
  cv.addEventListener('pointerleave', () => { if (charts[id]) charts[id].hi = undefined; tip.hidden = true; drawCharts(); });
}
crosshair('wins', (i) => `<b>${when(FRAMES[i].t)}</b><br>Skill index <span class="mono">${H.skill[i] == null ? '–' : H.skill[i].toFixed(2)}</span><br><span class="k">Rank correlation between what entrants knew and how they scored, all games, 4-week average</span>`);
crosshair('gWinC', (i) => `<b>${when(FRAMES[i].t)}</b> · last 4 weeks<br>` + GROUPS.map((g, k) => `<span style="color:${g.color}">${g.label}</span> <span class="mono">${H.gwin[k][i] == null ? '–' : pct(H.gwin[k][i])}</span>`).join('<br>'));
crosshair('gNetC', (i) => `<b>${when(FRAMES[i].t)}</b> · last 4 weeks<br>` + GROUPS.map((g, k) => `<span style="color:${g.color}">${g.label}</span> <span class="mono">${H.gnet[k][i] == null ? '–' : fmt(H.gnet[k][i])}</span>`).join('<br>'));
crosshair('notes', (i) => `<b>${when(FRAMES[i].t)}</b><br>Swaps <span class="mono">${H.shares[i]}</span> · thefts <span class="mono">${H.thefts[i]}</span><br><span class="k">${H.flags[i]} flags in force</span>`);
crosshair('strat', (i) => `<b>${when(FRAMES[i].t)}</b><br>` + GROUPS.map((a, k) => [a, H.share[i][k] || 0]).map(([a, v]) => `<span class="sw" style="background:${a.color}"></span>${a.label} hold <span class="mono">${pct(v)}</span>`).join('<br>'));
function drawCharts() {
  if (!H || !FRAMES.length) return;
  line('gWinC', GROUPS.map((g, a) => ({ data: H.gwin[a], color: g.color })), { fy: (v) => pct(v), min: 0 });
  line('gNetC', GROUPS.map((g, a) => ({ data: H.gnet[a], color: g.color })), { fy: (v) => fmt(v), ref: 0 });
  line('wins', [{ data: H.skill, color: SYS.green, fill: true }], { fy: (v) => v.toFixed(2), ref: 0 });
  line('notes', [{ data: H.shares, color: SYS.teal, fill: true }, { data: H.thefts, color: SYS.pink, fill: true }], { fy: (v) => Math.round(v), min: 0 });
  stack('strat', H.share); if ($('cashStrat')) stack('cashStrat', H.cashShare);
  if ($('tacC') && seen('tacC')) { const T = tacSeries(); stack('tacC', T.layers, T.ids.map((id) => ({ color: tacColor(id) }))); }
  drawFeatures();
}
/* ---------- Tactics (engine tacticTrack: what bots actually did, clustered each generation and followed by id) ---------- */
const TAC_COL = ['#0a84ff', '#ff9f0a', '#30d158', '#ffd60a', '#ff375f', '#bf5af2', '#40c8e0', '#5e5ce6', '#63e6e2', '#ff453a']; // the system colours: a tactic keeps its colour everywhere
const tacColor = (id) => TAC_COL[(id - 1) % TAC_COL.length];
let tacCache = null;
function tacSeries() { // each frame's tactic shares, one layer slot per tactic id ever seen (frames between generation ends repeat the last)
  const n = nNow(); if (tacCache && tacCache.n === n && tacCache.F === FRAMES) return tacCache;
  const ids = [], at = new Map(), rows = [];
  for (let i = 0; i < n; i++) for (const t of FRAMES[i].gen?.tactics?.list || []) if (!at.has(t.id)) { at.set(t.id, ids.length); ids.push(t.id); }
  for (let i = 0; i < n; i++) { const r = new Array(ids.length).fill(0); for (const t of FRAMES[i].gen?.tactics?.list || []) r[at.get(t.id)] = t.share; rows.push(r); }
  return (tacCache = { n, F: FRAMES, ids, layers: rows });
}
const tacRet = (v) => (v == null ? '–' : `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${Math.round(v * 100)}%</span>`);
const tacFrom = (t) => { const fr = t.from || {}, part = [['stay', 'stayed'], ['switch', 'switched in'], ['copy', 'copied'], ['heir', 'heirs'], ['new', 'new']].filter(([k]) => fr[k]).map(([k, l]) => `${fr[k]} ${l}`); return part.join(' · ') + (t.src?.length ? ` <span class="k">from ${t.src.map(([id, k]) => `T${id} (${k})`).join(', ')}</span>` : ''); };
function drawTactics() {
  const host = $('tacT'); if (!host) return; const f = cur(), T = f?.gen?.tactics;
  $('tacLegend').html = T ? T.list.map((t) => `<span><i style="background:${tacColor(t.id)}"></i>T${t.id}</span>`).join('') : '';
  host.tBodies[0].html = T ? T.list.map((t) => `<tr><td><span class="sw" style="background:${tacColor(t.id)}"></span>T${t.id}${t.age === 0 ? ' <span class="pill pill--fair">new</span>' : ''}</td><td title="${esc(t.top.map(([k, z]) => `${k} ${z >= 0 ? '+' : ''}${z} sd`).join(', '))}">${esc(t.name)}</td><td class="num">${t.n}</td><td class="num">${pct(t.share)}</td><td class="num">${tacRet(t.ret?.[1])}</td><td class="num">${tacRet(t.retMark?.[1])}</td><td class="num">${t.age} gen</td><td>${tacFrom(t)}</td><td>${t.crowding ? '<span class="pill pill--hot">crowding</span> ' : ''}${t.cannibalizedBy != null ? `<span class="pill pill--hot">cannibalized by T${t.cannibalizedBy}</span>` : ''}${t.age === 0 && t.parent != null ? `<span class="k">branched from T${t.parent}</span>` : ''}</td></tr>`).join('')
    : `<tr><td colspan="9" class="k">${cfgNow()?.tactics === false ? 'The tactic tracker is off (Rules ▸ Population and learning).' : 'Tactics appear at the first generation end.'}</td></tr>`;
  $('tacNote').html = T ? `Generation ${f.gen.gen}: ${T.k} tactics (silhouette ${T.sil}) among ${T.bots} bots${T.unprofiled ? `, ${T.unprofiled} too new to profile` : ''}.${T.died.length ? ' Gone: ' + T.died.map((d) => `T${d.id} after ${d.age} gen${d.into != null ? ` (nearest now T${d.into})` : ''}`).join(', ') + '.' : ''} Returns are medians: at selling value (what fitness uses) and at marks.` : '';
}
crosshair('tacC', (i) => { const T = FRAMES[i]?.gen?.tactics; return `<b>${when(FRAMES[i].t)}</b>${T ? ` · generation ${FRAMES[i].gen.gen}<br>` + T.list.map((t) => `<span class="sw" style="background:${tacColor(t.id)}"></span>T${t.id} <span class="mono">${pct(t.share)}</span> · ${tacRet(t.ret?.[1])} <span class="k">${esc(t.name)}</span>`).join('<br>') : '<br><span class="k">No generation has ended yet</span>'}`; });

/* ---------- Heatmaps ---------- */
// Diverging blue ↔ grey ↔ red (the validated pair), sequential blue for shares.
const NEUTRAL = [34, 34, 38], BLUE = [10, 132, 255], RED = [255, 69, 58], BLUE_HI = [156, 199, 255];
const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(L(v, b[i], t))).join(',')})`;
const diverge = (t) => (t >= 0 ? mix(NEUTRAL, RED, Math.min(1, t)) : mix(NEUTRAL, BLUE, Math.min(1, -t)));
const divergeInv = (t) => diverge(-t);
const seq = (t) => (t < 0.5 ? mix(NEUTRAL, BLUE, t * 2) : mix(BLUE, BLUE_HI, Math.min(1, (t - 0.5) * 2)));
function scale(id, left, right, fn) { $(id).innerHTML = `${left}<i style="background:linear-gradient(90deg,${[0, 0.25, 0.5, 0.75, 1].map((t) => fn(t)).join(',')})"></i>${right}`; }
const hm = {};
function heatmap(id, rows, cols, cell, color, tip, colLabel) {
  if (!seen(id)) return;
  const cv = $(id), [x, Wd, Ht] = fit(cv); x.clearRect(0, 0, Wd, Ht);
  const LW = Wd < 480 ? 92 : 128, top = 2, bot = colLabel ? 14 : 2, cw = (Wd - LW - 4) / cols, rh = (Ht - top - bot) / rows.length;
  const max = LW < 100 ? 14 : 20;
  x.font = `500 ${rh < 13 ? 9.5 : 11}px ${css('--body')}`; x.textBaseline = 'middle';
  rows.forEach((r, i) => {
    x.fillStyle = r.color || COL.muted; x.fillText(r.label.length > max ? r.label.slice(0, max - 1) + '…' : r.label, 2, top + i * rh + rh / 2);
    for (let j = 0; j < cols; j++) { const v = cell(i, j); x.fillStyle = v == null ? ink(0.03) : color(v); x.fillRect(LW + j * cw + 0.5, top + i * rh + 0.5, Math.max(1, cw - 1), Math.max(1, rh - 1)); }
  });
  if (colLabel) {
    x.fillStyle = COL.faint; x.font = `500 10px ${css('--mono')}`; x.textBaseline = 'bottom';
    if (colLabel.groups) { let prev = null; for (let j = 0; j < cols; j++) { const g = colLabel(j); if (g !== prev) { x.fillText(g, LW + j * cw + 2, Ht); x.fillRect(LW + j * cw, top, 1, Ht - top - bot); prev = g; } } }
    else { x.fillText(colLabel(0), LW, Ht); x.textAlign = 'right'; x.fillText(colLabel(cols - 1), Wd - 2, Ht); x.textAlign = 'left'; }
  }
  hm[id] = { LW, top, cw, rh, rows, cols, tip };
}
function hmHover(id) {
  const cv = $(id), t = $(id + 'Tip');
  const move = (e) => { const h = hm[id]; if (!h) return; const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top; const i = Math.floor((my - h.top) / h.rh), j = Math.floor((mx - h.LW) / h.cw); if (i < 0 || i >= h.rows.length || j < 0 || j >= h.cols) { t.hidden = true; return; } t.innerHTML = h.tip(i, j); placeTip(t, cv, mx, my); };
  cv.addEventListener('pointermove', move); cv.addEventListener('pointerdown', move); cv.addEventListener('pointerleave', () => (t.hidden = true));
}
['hmGene', 'hmFam', 'hmHold', 'hmRet', 'hmBots', 'hmSec'].forEach(hmHover);
function buckets(n, width) { const cols = Math.max(1, Math.min(n, Math.floor(width / 7))); return { cols, range: (j) => { const a = Math.floor((j * n) / cols); return [a, Math.max(a, Math.floor(((j + 1) * n) / cols) - 1)]; } }; }
const avg = (xs) => { const v = xs.filter((y) => y != null && isFinite(y)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
// Average worth of each wealth group in a frame (groups as the engine placed them that week)
function grpWorth(f) { if (f._gw) return f._gw; const s = GROUPS.map(() => [0, 0]); for (const b of f.bots) { const g = s[b[17] ?? 2]; g[0] += b[3]; g[1]++; } return (f._gw = s.map(([w, k]) => (k ? w / k : null))); }
function botMap(f) { if (f._bm) return f._bm; const ws = f.bots.map((b) => b[3]).sort((a, b) => a - b); f._med = ws[Math.floor(ws.length / 2)] || 1; return (f._bm = new Map(f.bots.map((b) => [b[0], b[3]]))); }
const hmWidth = (id) => $(id).getBoundingClientRect().width - 132;
const SENS_ALL = [...CARD_IN_BASE, ...GUIDE_IN].map((k, i) => [k, i]).filter(([, i]) => i > 0); let SENS_ROWS = SENS_ALL; // the guide's inputs only in runs with the price guide
function drawHeatmaps() {
  const n = nNow(), f = cur();
  { // What the networks learned: how much each input pushes the richest 10% toward buying (red) or selling (blue)
    SENS_ROWS = SENS_ALL.filter(([, i]) => i < CARD_IN_BASE.length || FRAMES[n - 1]?.guideT !== undefined);
    const { cols, range } = buckets(n, hmWidth('hmGene')), rows = SENS_ROWS.map(([k]) => ({ label: k }));
    // measured every 4 weeks: each column uses the latest measurement at or before its last week
    const sensAt = (k) => { if (FRAMES[k]._sens !== undefined) return FRAMES[k]._sens; let s = null; for (let i = k; i >= 0 && i > k - 8; i--) if (FRAMES[i].sens) { s = FRAMES[i].sens; break; } return (FRAMES[k]._sens = s); };
    const at = (i, j, who) => { const s = sensAt(range(j)[1]); return s ? s[who][SENS_ROWS[i][1]] : null; };
    heatmap('hmGene', rows, cols, (i, j) => at(i, j, 'top'), (v) => divergeInv(-v / 0.3), (i, j) => { const [a, b] = range(j), t = at(i, j, 'top'), al = at(i, j, 'all'); return `<b>${esc(rows[i].label)}</b><br>Weeks ${FRAMES[a].t}–${FRAMES[b].t}<br>Richest 10% <span class="mono">${t == null ? '–' : (t > 0 ? '+' : '') + t.toFixed(2)}</span> · everyone <span class="mono">${al == null ? '–' : (al > 0 ? '+' : '') + al.toFixed(2)}</span><br><span class="k">How much raising this input moves the card network toward buying (+) or selling (−)</span>`; }, (j) => `W${FRAMES[range(j)[0]].t}`);
  }
  { // OVR bands: price ÷ hidden value over time
    const { cols, range } = buckets(n, hmWidth('hmFam')), rows = OVR_BANDS.map((b) => ({ label: `OVR ${b.label}` }));
    const val = (i, j) => { const [a, b] = range(j); const xs = []; for (let k = a; k <= b; k++) xs.push(FRAMES[k].bands?.[i]); return avg(xs); };
    heatmap('hmFam', rows, cols, val, (v) => diverge(Math.log(v) / Math.log(1.6)), (i, j) => { const [a, b] = range(j); const v = val(i, j); return `<b>${esc(rows[i].label)}</b><br>Weeks ${FRAMES[a].t}–${FRAMES[b].t}<br>Price ÷ value <span class="mono">${v == null ? '–' : v.toFixed(2) + '×'}</span><br><span class="k">Cards in circulation, every design and finish</span>`; }, (j) => `W${FRAMES[range(j)[0]].t}`);
  }
  { // Who holds which OVR bands: each wealth group's share of a band's held value, now
    const held = f.bandHold || [], tot = OVR_BANDS.map((_, j) => GROUPS.reduce((s, _g, a) => s + (held[a]?.[j] || 0), 0));
    const rows = GROUPS.map((g) => ({ label: g.label, color: g.color }));
    const val = (i, j) => (tot[j] ? (held[i]?.[j] || 0) / tot[j] : null);
    heatmap('hmHold', rows, OVR_BANDS.length, val, (v) => seq(Math.min(1, v / 0.7)), (i, j) => `<b>${GROUPS[i].label}</b> · OVR ${esc(OVR_BANDS[j].label)}<br>${pct(val(i, j))} of the band's held value<br><span class="k">${fmt(held[i]?.[j] || 0)} coins</span>`, Object.assign((j) => OVR_BANDS[j].label, { groups: true }));
  }
  { // Wealth groups: average 4-week return over time
    const { cols, range } = buckets(n, hmWidth('hmRet')), rows = GROUPS.map((g) => ({ label: g.label, color: g.color }));
    const r4 = (k, a) => { if (k < 4) return null; const now = grpWorth(FRAMES[k])[a], then = grpWorth(FRAMES[k - 4])[a]; return now && then ? now / then - 1 : null; };
    const val = (i, j) => { const [a, b] = range(j); const xs = []; for (let k = a; k <= b; k++) xs.push(r4(k, i)); return avg(xs); };
    heatmap('hmRet', rows, cols, val, (v) => divergeInv(v / 0.12), (i, j) => { const [a, b] = range(j); const v = val(i, j); return `<b>${GROUPS[i].label}</b><br>Weeks ${FRAMES[a].t}–${FRAMES[b].t}<br>4-week return of the group's average worth <span class="mono">${v == null ? '–' : (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%'}</span>`; }, (j) => `W${FRAMES[range(j)[0]].t}`);
  }
  { // Top 20 bots now: worth vs the median bot, over time
    const top = f.bots.slice().sort((a, b) => b[3] - a[3]).slice(0, 20), { cols, range } = buckets(n, hmWidth('hmBots'));
    const rows = top.map((b) => ({ label: b[2], color: b[9] ? COL.mark : COL.muted }));
    const val = (i, j) => { const fr = FRAMES[range(j)[1]], m = botMap(fr).get(top[i][0]); return m == null ? null : m / fr._med; };
    heatmap('hmBots', rows, cols, val, (v) => divergeInv(Math.log(v) / Math.log(4)), (i, j) => { const fr = FRAMES[range(j)[1]], v = val(i, j); return `<b>${esc(top[i][2])}</b> · ${kindOf(top[i])}<br>Week ${fr.t}<br>${v == null ? 'not born yet' : `Worth <span class="mono">${fmt(botMap(fr).get(top[i][0]))}</span> · ${v.toFixed(2)}× median`}`; }, (j) => `W${FRAMES[range(j)[0]].t}`);
  }
}
function drawScales() {
scale('scaleFam', 'cheap', 'rich', (t) => diverge(t * 2 - 1));
scale('scaleGene', 'sell', 'buy', (t) => divergeInv(1 - t * 2));
scale('scaleHold', '0%', '70%+', (t) => seq(t));
scale('scaleRet', '−12%', '+12%', (t) => divergeInv(t * 2 - 1));
scale('scaleSec', '−15%', '+15%', (t) => { const u = t * 2 - 1; return u >= 0 ? mix(NEUTRAL, [29, 156, 92], u) : mix(NEUTRAL, [196, 58, 58], -u); });
scale('scaleBots', '¼×', '4× median', (t) => divergeInv(t * 2 - 1));
}
readTheme(); drawScales(); // the theme first: the scales use its neutral and deep blue

/* ---------- Panels ---------- */
// Lists update in place: each row is kept by its key and only rewritten when its content changes; a row whose number
// changed is rewritten. Nothing is rebuilt, so nothing jumps.
function patchRows(host, rows) {
  const have = new Map([...host.children].map((el) => [el.dataset.k, el]));
  // FLIP: a row that moves rank glides from where it was; a new row fades in. Only for a list on screen.
  let before = null;
  if (!RM() && host.children.length && host.animate) { const r = host.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight && r.height) before = new Map([...host.children].map((el) => [el, el.getBoundingClientRect().top])); }
  rows.forEach(({ key, html, val }, i) => {
    let el = have.get(String(key));
    if (!el) { const t = document.createElement('template'); t.innerHTML = html.trim(); el = t.content.firstElementChild; el.dataset.k = key; el._h = html; el._v = val; }
    else { have.delete(String(key)); if (el._h !== html) { const t = document.createElement('template'); t.innerHTML = html.trim(); const n = t.content.firstElementChild; for (const a of [...el.attributes]) if (a.name !== 'data-k' && a.name !== 'class') el.removeAttribute(a.name); for (const a of [...n.attributes]) if (a.name !== 'class') el.setAttribute(a.name, a.value); el.innerHTML = n.innerHTML; el._h = html; }
      el._v = val; }
    if (host.children[i] !== el) host.insertBefore(el, host.children[i] || null);
  });
  for (const el of have.values()) el.remove();
  if (before) for (const el of host.children) {
    const t0 = before.get(el); if (t0 == null) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' }); continue; }
    const d = t0 - el.getBoundingClientRect().top; if (Math.abs(d) > 1) el.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }
}
const pill = (r) => (r > 1.2 ? '<span class="pill pill--hot">▲ rich</span>' : r < 0.85 ? '<span class="pill pill--cool">▼ cheap</span>' : '<span class="pill pill--fair">fair</span>');
let libId = 0;
function series(id) {
  const at = ix(), from = Math.max(0, at - 59), P = [], F = []; let v = null;
  for (let i = 0; i <= at; i++) { if (FRAMES[i].values) v = FRAMES[i].values; if (i >= from) { P.push(FRAMES[i].prices?.[id]); F.push(v?.[id]); } }
  return [P, F];
}
function gameRows(tableId, rows) {
  const used = rows.filter((r) => r[1][0]), max = Math.max(0.01, ...used.map((r) => r[1][1] / r[1][0]));
  $(tableId).tBodies[0].innerHTML = used.map(([label, [p, w, k], color]) => `<tr><td>${color ? `<span class="sw" style="background:${color}"></span>` : ''}${esc(label)}</td><td class="num">${p.toLocaleString()}</td><td class="num">${pct(w / p)}</td><td class="bar"><span style="width:${((w / p) / max) * 100}%;${color ? `background:${color}` : ''}"></span></td><td class="num">${(k / p).toFixed(3)}</td></tr>`).join('') || '<tr><td colspan="5" class="k">No games played.</td></tr>';
}
// Fast: what changes every week and is cheap to update in place (tiles, lists, quote tables). Slow: the rest.
function drawFast(split) {
  const f = cur(), n = nNow(); if (!f) return;
  const g4 = gamesOver(n - 1, 4), games = Object.values(g4.game).reduce((s, x) => s + x[0], 0), pots = Object.values(g4.game).reduce((s, x) => s + x[1], 0);
  setNum($('kWeek'), String(f.t)); $('kWeekS').textContent = `${f.season ? `season ${f.season} · ` : ''}gen ${Math.floor(Math.max(0, f.t - 1) / gpw()) + 1}${mode === 'replay' ? ` · replay ${cursor + 1}/${FRAMES.length}` : ''}`;
  setNum($('kBub'), f.h.bub.toFixed(2) + '×'); $('kBubS').html = pill(f.h.bub);
  setNum($('kGini'), f.h.gini.toFixed(3)); $('kGiniS').textContent = `${f.h.gini >= H.gini[0] ? '▲' : '▼'} from ${H.gini[0].toFixed(3)}`;
  setNum($('kTrades'), f.h.trades.toLocaleString()); $('kTradesS').textContent = `${f.house.packs.toLocaleString()} packs bought`;
  { const pk = f.pk, L = { standard: 'Std', premium: 'Prem', elite: 'Elite', holo: 'Holo' }; setNum($('kPack'), pk?.standard?.[0] ? fmt(pk.standard[0]) : '–');
    $('kPackS').textContent = pk ? `${Object.entries(pk).filter(([t]) => t !== 'standard').map(([t, [p]]) => `${L[t] || t} ${fmt(p)}`).join(' · ')} · ${Object.values(pk).reduce((a, [, n]) => a + n, 0).toLocaleString()} sold` : 'not in this save'; $('kPack').parentElement.title = pk ? 'Standard pack price now; the other types after it, and packs sold this week' : ''; }
  setNum($('kPass'), f.h.pass == null ? '–' : f.h.pass.toFixed(2)); $('kPassS').textContent = `coins · ${f.h.informed.toFixed(1)} notes/bot`;
  setNum($('kTicket'), f.tickets == null ? '–' : f.tickets.toFixed(2)); $('kTicketS').textContent = f.gs ? `${Object.values(f.gs).reduce((x, g) => x + g[0], 0).toLocaleString()} game entries this wk` : 'games off';
  setNum($('kWin'), g4.skill[1] ? (g4.skill[0] / g4.skill[1]).toFixed(2) : '–'); $('kWinS').textContent = games ? `${games.toLocaleString()} entries · ${fmt(pots)} coins in pots` : 'no games';
  const ranked = f.bots.slice().sort((a, b) => b[3] - a[3]);
  setNum($('kBank'), f.mkt?.rate == null ? '–' : (f.mkt.rate * 100).toFixed(2) + '%'); $('kBankS').textContent = `per week · loans ${f.mkt?.mcap ? pct(f.mkt.debt / f.mkt.mcap) : '–'} of market · ${f.mkt?.defaults ?? 0} defaults`;
  { // a slight tint on the tiles where higher or lower is better (not prices): green inside the health board's healthy band, red past its alarm line, amber between
    const lv = (key, v) => { const L = HEALTH.lights.find((x) => x.key === key), A = L?.alarm || {}; if (v == null || !L) return null; if ((A.above != null && v > A.above) || (A.below != null && v < A.below)) return 'bad'; return L.healthy ? (v >= L.healthy[0] && v <= L.healthy[1] ? 'good' : 'fair') : null; };
    const tone = (id, t, why) => { const el = $(id).parentElement; if (t) el.dataset.tone = t; else delete el.dataset.tone; el.title = t ? `${{ good: 'Healthy', fair: 'Watch', bad: 'Alarm' }[t]}: ${why}` : ''; };
    tone('kGini', lv('gini', f.h.gini), 'healthy up to 0.35, alarm above 0.55 (the health board’s Inequality)');
    { let s = 0, k = 0; for (let i = Math.max(0, n - 53); i < n - 1; i++) { s += FRAMES[i].h.trades; k++; } const r = k >= 8 && s > 0 ? f.h.trades / (s / k) : null;
      tone('kTrades', r == null ? null : r < 0.25 ? 'bad' : r >= 0.75 ? 'good' : 'fair', `trades against the average of the last year: healthy from 75%, alarm under 25% (now ${r == null ? '–' : pct(r)})`); }
    { const sk = g4.skill[1] ? g4.skill[0] / g4.skill[1] : null; tone('kWin', sk == null ? null : sk <= 0 ? 'bad' : sk >= 0.3 ? 'good' : 'fair', 'rank correlation of what entrants know with their scores: healthy from 0.30 (skill decides), alarm at 0 or below (luck)'); }
  }
  const pctS = (v) => (v == null ? '–' : `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${Math.round(v * 100)}%</span>`);
  patchRows($('lb').tBodies[0], (lbAll ? ranked : ranked.slice(0, 20)).map((b) => ({ key: b[0], val: b[3], html: `<tr data-bot="${b[0]}" title="${esc(b[2])} · ${kindOf(b)} · gen ${b[10]}${b[6] >= 5 ? ' · flagged' : ''}"><td><span class="sw" style="background:${grpColor(b)}"></span>${esc(b[2])}${b[9] ? ' <span class="pill pill--fair">AI</span>' : ''}${b[6] >= 5 ? ' <span class="pill pill--hot">flagged</span>' : ''}</td><td class="num">${fmt(b[3])}</td><td class="num">${pctS(b[16])}</td><td class="num">${pctS(b[13])}</td></tr>` })));
  if (!split) { drawWatch(); drawStatus(); drawIndicators(); drawGroups(); drawMvc(f); }
  $('lbMore').textContent = lbAll ? 'Show top 20' : `Show all ${f.bots.length} bots`;
}
function drawPanels() { if (!cur()) return; drawFast(); drawGov(); drawPanelsCore(); drawTape(); drawAcct(); drawCons(); drawDetail(); drawLeagueNews(); drawHealth(); drawTactics(); drawSectors(); drawMap(); drawCalendar(); drawHeatmaps(); }
// The tables of the games, notes and wealth row
function drawPanelsCore() {
  const f = cur(), n = nNow(); if (!f) return;
  const g4 = gamesOver(n - 1, 4);
  { const rows = Object.entries(GAMES).map(([g, d]) => [g, d, g4.game[g] || [0, 0, 0, 0]]).sort((a, b) => (b[2][3] ? b[2][2] / b[2][3] : -1) - (a[2][3] ? a[2][2] / a[2][3] : -1));
    $('gTopic').tBodies[0].html = rows.map(([g, d, [e, pot, sk, kn]]) => { const r = kn ? sk / kn : null; return `<tr title="${esc(d.skill)}"><td>${esc(d.label)}</td><td class="k">${esc(f.topics?.[g] || '')}</td><td class="num">${e.toLocaleString()}</td><td class="num">${fmt(pot)}</td><td class="num">${r == null ? '–' : r.toFixed(2)}</td><td class="bar"><span class="${r != null && r < 0 ? 'neg' : ''}" style="width:${r == null ? 0 : Math.min(100, Math.abs(r) * 100)}%"></span></td></tr>`; }).join(''); }
  { const rows = GROUPS.map((g, a) => [a, g4.arch[a]]), max = Math.max(0.01, ...rows.map(([, x]) => (x[0] ? x[1] / x[0] : 0)));
    $('gArch').tBodies[0].html = rows.filter(([, x]) => x[0]).map(([a, [e, w, net]]) => `<tr><td><span class="sw" style="background:${GROUPS[a].color}"></span>${GROUPS[a].label}</td><td class="num">${e.toLocaleString()}</td><td class="num">${pct(w / e)}</td><td class="bar"><span style="width:${((w / e) / max) * 100}%;background:${GROUPS[a].color}"></span></td><td class="num ${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : ''}${fmt(net)}</td></tr>`).join('') || '<tr><td colspan="5" class="k">No games played.</td></tr>'; }
  const soc = [0, 1, 2].map((s) => { const xs = f.bots.filter((b) => b[5] === s); return [s, xs.length, avg(xs.map((b) => b[3])), avg(xs.map((b) => b[6]))]; });
  $('social').tBodies[0].html = soc.map(([s, k, w, fl]) => `<tr><td>${SOC[s]}</td><td class="num">${k}</td><td class="num">${fmt(w)}</td><td class="num">${fl == null ? '–' : fl.toFixed(1)}</td></tr>`).join('');
  $('researched').textContent = f.researched.length ? 'Most researched: ' + f.researched.map(([id, k]) => `${LIBRARY.players[id].name} (${k})`).join(', ') : '';
}
const LEAGUE_KINDS = new Set(['injury', 'return', 'champion', 'award', 'hof', 'retire', 'rookie']);
function drawLeagueNews() {
  const host = $('lnews'); if (!host) return; const rows = [];
  for (let i = nNow() - 1; i >= 0 && rows.length < 14; i--) for (const e of FRAMES[i].events || []) { if (!LEAGUE_KINDS.has(e.kind)) continue; rows.push(`<div class="ln"><time>W${e.t}</time><span class="tag k-${NEWSKIND[e.kind]}">${TAGS[e.kind]}</span><div title="${esc(e.text)}">${esc(e.text)}</div></div>`); if (rows.length >= 14) break; }
  host.html = rows.join('') || `<p class="note">${cfgNow()?.valueModel === 'league' ? 'The simulated league starts after the last real season; its news appears here as it happens.' : 'League news comes with the simulated league (Rules ▸ Hidden value).'}</p>`;
}
function drawMvc(f) {
  { // The most valuable card in circulation this week, and the next two
    const tops = f.top || [];
    $('mvc').html = tops.map((x, i) => `<button type="button" class="${i ? '' : 'first'}" data-card="${x.pid}" data-lib="${x.pid}"><span>${i ? `No. ${i + 1}` : 'Most valuable card'}</span><b>${esc(x.label)}</b><small><span class="mono" style="font-size:inherit;color:var(--chalk);text-transform:none;letter-spacing:0">${fmt(x.P)}</span> coins · value ${fmt(x.F)}${x.G != null ? ` · guide ${fmt(x.G)}` : ''} · ${x.owner ? (x.owner.startsWith('up for') ? esc(x.owner) : `held by ${esc(x.owner)}`) : 'no holder found'}${x.n > 1 ? ` · ${x.n} copies` : ''}</small></button>`).join('');
  }
}
document.addEventListener('keydown', (e) => { const q = e.target.closest?.('.qt[data-metric]'); if (q && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); q.click(); } });
document.addEventListener('click', (e) => {
  
  const c = e.target.closest('[data-card]'); if (c) select({ type: 'card', id: +c.dataset.card });
  const b = e.target.closest('[data-bot]'); if (b) selectBot(+b.dataset.bot);
  const mt = e.target.closest('[data-metric]'); if (mt) { { const r = $('chart').getBoundingClientRect(); if (r.top > innerHeight || r.bottom < 0) $('ch-name').scrollIntoView({ behavior: 'auto', block: 'start' }); } } if (mt) select(SEL.type === 'metric' && SEL.key === mt.dataset.metric ? { type: 'market' } : { type: 'metric', key: mt.dataset.metric });
});

/* ---------- Feed ---------- */
let feedF = 'news';
const ACT = {
  trade: (j) => ['Trade', `<b>${esc(j.buyer)}</b> bought ${esc(cardName(j.card))} from ${esc(j.seller)} · ${j.price}${j.buyerWhy || j.sellerWhy ? ` <span class="k">· why: ${[j.buyerWhy && 'bought on ' + esc(j.buyerWhy), j.sellerWhy && 'sold on ' + esc(j.sellerWhy)].filter(Boolean).join(', ')}</span>` : ''}`],
  passTrade: (j) => ['Pass', `<b>${esc(j.buyer)}</b> bought a pass from ${esc(j.seller)} · ${j.price}`],
  ticketTrade: (j) => ['Ticket', `<b>${esc(j.buyer)}</b> bought a ticket from ${esc(j.seller)} · ${j.price}`],
  auctionList: (j) => ['Auction', `<b>${esc(j.seller)}</b> listed ${esc(j.card)} · reserve ${j.reserve}`],
  auctionResult: (j) => ['Auction', j.winner ? `<b>${esc(j.winner)}</b> won ${esc(j.card)} · ${j.price} (${j.bids} bids)` : `${esc(j.card)} unsold · ${j.bids} bids, reserve ${j.reserve}`],
  research: (j) => ['Research', `<b>${esc(j.bot)}</b> researched ${esc(j.player)}`],
  share: (j) => ['Swap', `<b>${esc(j.a)}</b> ⇄ <b>${esc(j.b)}</b> · ${j.notesMoved} notes`],
  steal: (j) => ['Theft', j.ok ? `<b>${esc(j.thief)}</b> took ${j.notes} notes from ${esc(j.victim)}${j.caught ? ` · caught, ${j.flaggedBy} flag it` : ''}` : `<b>${esc(j.thief)}</b> blocked by ${esc(j.victim)}`],
  game: (j) => ['Game', `<b>${esc(j.bot)}</b> ${esc(GAMES[j.game]?.label || j.game)}${j.topic ? ` (${esc(j.topic)})` : ''}${j.opponent ? ` vs ${esc(j.opponent)}` : ''} · score ${j.score} · ${j.won ? `<span class="up">won ${j.net >= 0 ? '+' : ''}${j.net}</span>` : `<span class="down">lost ${-j.net}</span>`}`],
  entered: (j) => ['Joined', `<b>${esc(j.bot)}</b> (${esc(j.kind)}) joined with ${fmt(j.cash)} coins`],
  exited: (j) => ['Left', `<b>${esc(j.bot)}</b> (${esc(j.kind)}) ${esc(j.reason)} at ${fmt(j.worth)}`],
  default: (j) => ['Default', `<b>${esc(j.bot)}</b> defaulted on ${fmt(j.debt)} of loans`],
  pack: (j) => ['Pack', `<b>${esc(j.bot)}</b> ${j.free ? 'free pack' : `pack · ${j.price}`}: ${j.pulls.map(esc).join(', ')}`],
  post: (j) => ['Board', `<b>${esc(j.from)}</b>: ${esc(j.text)}`],
  message: (j) => ['DM', `<b>${esc(j.from)}</b> → ${esc(j.to)}: ${esc(j.text)}`],
  aiActions: (j) => ['AI', `<b>${esc(j.bot)}</b> ${esc(Object.entries(j.actions || {}).filter(([, v]) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Number(v.amount) > 0 : v)).map(([k, v]) => `${k}${Array.isArray(v) ? ` ×${v.length}` : v && typeof v === 'object' ? ` ${v.amount}` : ''}`).join(', ') || 'did nothing')}`],
  flagLift: (j) => ['Flagged', `<b>${esc(j.bot)}</b>'s flags lift: ${j.by} bots trade with it again`],
  short: (j) => ['Short', `<b>${esc(j.bot)}</b> sold ${esc(cardName(j.card))} short at ${fmt(j.price)}, borrowed from ${esc(j.lender)}`],
  cover: (j) => ['Buy-back', `<b>${esc(j.bot)}</b> bought back ${esc(cardName(j.card))} at ${fmt(j.price)} after ${j.weeks} wk · sold at ${fmt(j.entry)} <span class="${j.entry >= j.price ? 'up' : 'down'}">${j.entry >= j.price ? '+' : ''}${fmt(j.entry - j.price)}</span>`],
  shortCall: (j) => ['Short call', `<b>${esc(j.bot)}</b> must buy back ${esc(cardName(j.card))} (${j.why === 'due' ? 'deadline' : 'margin'}) · sold at ${fmt(j.entry)}, now ${fmt(j.price)}`],
  forcedCover: (j) => ['Forced close', `<b>${esc(j.bot)}</b> settled ${esc(cardName(j.card))} in cash at ${fmt(j.price)} with ${esc(j.lender)} (${esc(j.why)}) · sold at ${fmt(j.entry)}`],
  loan: (j) => ['Loan', `<b>${esc(j.lender)}</b> lent ${fmt(j.amount)} to ${esc(j.borrower)} at ${(j.rate * 100).toFixed(2)}%/wk`],
  marginCall: (j) => ['Margin', `<b>${esc(j.bot)}</b> margin call · loan ${fmt(j.debt)} against ${fmt(j.cards)} of cards`],
  adopted: (j) => ['Evolution', `<b>${esc(j.bot)}</b> (${j.roc >= 0 ? '+' : ''}${Math.round(j.roc * 100)}%) adopts ${esc(j.from)}'s strategy (+${Math.round(j.mentorRoc * 100)}%): ${esc(j.before)} → ${esc(j.after)}`],
  died: (j) => ['Evolution', `<b>${esc(j.bot)}</b> dies at ${j.age} generations; ${fmt(j.estate)} passes to ${j.heirs.map(esc).join(' and ')}`],
  eliminated: (j) => ['Evolution', `<b>${esc(j.bot)}</b> eliminated (${esc(j.kind)}, ${esc(j.social)})`],
  born: (j) => ['Evolution', `<b>${esc(j.bot)}</b> born from ${esc(j.parent)}`],
};
const GROUP = { credit: ['loan', 'marginCall', 'default'], shorts: ['short', 'cover', 'shortCall', 'forcedCover'], people: ['entered', 'exited', 'default'], trade: ['trade', 'passTrade', 'ticketTrade'], auction: ['auctionList', 'auctionResult'], research: ['research'], notes: ['share', 'steal', 'flagLift'], game: ['game'], pack: ['pack'], talk: ['post', 'message'], ai: ['aiActions'] };

/* ---------- Controls ---------- */
$('preset').innerHTML = Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
const SLIDERS = { formulaPull: [0.01, (v) => (v ? v + '%' : 'none')], printRunK: [1, (v) => v + ' (on Restart)'], printRunExp: [0.01, (v) => (v / 100).toFixed(2) + (v === 50 ? ' (square root)' : '')], poolMultiplier: [1, (v) => '×' + v + ' the copies out'], startCash: [1, (v) => v.toLocaleString()], newcomerCashSd: [0.01, (v) => (v / 100).toFixed(2) + ' log sd'], concentrationFree: [1, (v) => v + ' copies'], concentrationSlope: [0.01, (v) => (v / 100).toFixed(2) + ' per copy'], itemHaircut: [0.01, (v) => v + '% of mark'], nnResearchError: [0.01, (v) => '±' + v + '%'], guardChance: [0.01, (v) => v + '%'], gameNoise: [0.01, (v) => (v / 100).toFixed(2) + ' log sd'], formBlendSeasons: [1, (v) => v + (v > 1 ? ' seasons' : ' season')], wealthTaxThreshold: [1, (v) => v + '× the median'], wealthTaxEvery: [1, (v) => (v > 1 ? v + ' wk' : 'weekly')], coverBid: [0.01, (v) => '×' + (v / 100).toFixed(2) + ' the mark'], coverSettle: [0.01, (v) => '×' + (v / 100).toFixed(2) + ' the mark'], coverGraceWeeks: [1, (v) => v + ' wk'], lendShareMax: [0.01, (v) => v + '% of idle cash'], memoryCap: [1, (v) => (v ? v + ' notes' : 'by age only')], quitMinWeeks: [1, (v) => v + ' wk'], tacticMatch: [0.1, (v) => (v / 10).toFixed(1) + ' sd'], tacticWindow: [1, (v) => v + (v > 1 ? ' gens' : ' gen')], practiceWorlds: [1, (v) => (v > 1 ? v + ' worlds' : '1 (as before)')], populationFloor: [0.01, (v) => (v ? v + '% of the start' : 'off')], fitnessSharing: [0.1, (v) => (v ? 'strength ' + (v / 10).toFixed(1) : 'off')], sharingRadius: [0.01, (v) => (v / 100).toFixed(2)], guideEvery: [1, (v) => v + ' wk'], guideLag: [1, (v) => v + ' wk old'], adaptEvery: [1, (v) => v + ' wk'], adaptSize: [0.01, (v) => '±' + (v / 100).toFixed(2)], lossRate: [0.001, (v) => (v ? (v / 10).toFixed(1) + '% a season' : 'off')], entryHype: [0.1, (v) => (v ? '×' + (v / 10).toFixed(1) : 'off')], entryReturns: [0.1, (v) => (v ? '×' + (v / 10).toFixed(1) : 'off')], entryNews: [0.1, (v) => (v ? '×' + (v / 10).toFixed(1) : 'off')], cashShockChance: [0.0001, (v) => (v ? (v / 100).toFixed(2) + '% a week' : 'off')], priceRange: [0.01, (v) => '±' + v + '%'], priceLogK: [0.01, (v) => (v / 100).toFixed(2) + ' (×' + Math.exp(v / 100).toFixed(2) + ' per unit)'], priceClamp: [1, (v) => '×' + v + ' either way'], rateLogMid: [0.001, (v) => (v / 10).toFixed(1) + '%/wk'], rateClamp: [1, (v) => (v * 100).toLocaleString() + '%/wk'], keepMax: [0.01, (v) => v + '% of worth'], rateMax: [0.001, (v) => (v / 10).toFixed(1) + '%/wk'], deployOrders: [1, (v) => String(v)], maxOrderQty: [1, (v) => String(v)], maxListings: [1, (v) => String(v)], maxShorts: [1, (v) => String(v)], maxPacks: [1, (v) => String(v)], attention: [1, (v) => (v ? v + ' + holdings and watchlist' : 'every live card')], attentionMemory: [1, (v) => v + ' wk'], quitDrawdown: [0.01, (v) => v + '% of peak'], quitChance: [0.01, (v) => v + '%'], extraRookies: [1, (v) => String(v)], dormantAfter: [1, (v) => (v ? 'after ' + v + ' wk' : 'never')], markDepth: [1, (v) => 'best ' + v + ' orders'], markHalfLife: [1, (v) => (v ? v + ' wk half-life' : 'off')], holdCost: [0.0001, (v) => (v ? (v / 100).toFixed(2) + '% of mark' : 'off')], estateSale: [0.01, (v) => (v ? v + '% of cards' : 'off')], cashShockChance: [0.0001, (v) => (v ? (v / 100).toFixed(2) + '% a week' : 'off')], cashShockSize: [0.01, (v) => v + '% of worth'], markWeeks: [1, (v) => v + ' wk'], collectorSaveWeeks: [1, (v) => v + ' wk of budget'], collectors: [1, (v) => String(v)], collectorError: [0.01, (v) => '±' + v + '%'], collectorStart: [0.01, (v) => v + '% of copies'], collectorPerCard: [1, (v) => v + ' copies'], collectorSpread: [0.01, (v) => v + '%'], royaltyRate: [0.01, (v) => v + '%'], nnFitnessGens: [1, (v) => v + ' gens'], practiceGens: [1, (v) => (v ? v + ' (on Restart)' : 'none')], compsWeeks: [1, (v) => v + ' wk'], formSeasons: [1, (v) => v + (v > 1 ? ' seasons' : ' season') + ` (${v * 17} games)`], hypeInjury: [0.01, (v) => (v ? '×' + (v / 100).toFixed(1) : 'off')], entryRate: [0.01, (v) => (v / 100).toFixed(2)], heirs: [1, (v) => String(v)], scarcity: [0.01, (v) => (v / 100).toFixed(2)], packsPerWeek: [1, (v) => String(v)], liqListings: [1, (v) => String(v)], outsideBudget: [1, (v) => v.toLocaleString()], outsideResale: [0.01, (v) => v + '%'], prizeShare: [0.01, (v) => v + '% of takings'], livingCost: [1, (v) => String(v)], lifestyle: [0.0001, (v) => (v / 100).toFixed(2) + '%'], maxLTV: [0.01, (v) => (v ? v + '%' : 'off')], interest: [0.0001, (v) => (v / 100).toFixed(2) + '%'], fee: [0.01, (v) => v + '%'], allowance: [1, (v) => String(v)], packEdge: [0.01, (v) => v + '%'], passesPerWeek: [1, (v) => String(v)], knowledgeWeeks: [1, (v) => v + ' wk'], detectChance: [0.01, (v) => v + '%'], priceLimit: [0.01, (v) => (v ? '±' + v + '%' : 'off')], wealthTax: [0.01, (v) => (v ? v + '%' : 'off')], positionLimit: [0.01, (v) => (v ? v + '%' : 'off')], storePremium: [0.01, (v) => '+' + v + '%'], walkUp: [0.01, (v) => v + '%'], walkVolLow: [0.01, (v) => '±' + v + '%'], walkVolHigh: [0.01, (v) => '±' + v + '%'], riskPerDoubling: [1, (v) => '+' + v + ' pts'], flagWeeks: [1, (v) => (v ? v + ' wk clean' : 'forever')], cardLendFee: [0.0001, (v) => (v / 100).toFixed(2) + '%/wk'], shortMargin: [0.01, (v) => v + '%'], cardLoanWeeks: [1, (v) => v + ' wk'], nnMutation: [0.01, (v) => '±' + (v / 100).toFixed(2)], nnReset: [0.01, (v) => v.toFixed(1) + '%'], evolveShare: [0.01, (v) => v + '%'], storeCopies: [1, (v) => String(v)] };
const SELECTS = ['rngStreams', 'championWeight', 'compsSource', 'openPrice', 'fitnessExo', 'botScale', 'attentionSample', 'priceMap', 'rateMap', 'entrants', 'quitRule', 'forcedOrder', 'wealthTaxTo', 'rookieRule', 'leagueFill', 'singleBidder', 'fitnessValue', 'markRule', 'royaltyFunding', 'vaultIndex', 'valueBasis', 'pastSave', 'valueModel', 'priceRule', 'outsideMode', 'liquidation', 'forcedSale', 'packSale', 'hotRank'];
const TOGGLES = ['tactics', 'guideOn', 'adaptOn', 'priceAnchor', 'wealthTaxForced', 'outsideNews', 'retirementByAge', 'injuryByAge', 'pressure', 'injuries', 'retirement', 'rookies', 'awards', 'capPoorest', 'turnover', 'twoSidedQuotes', 'shorting', 'credit', 'passesTradable', 'games', 'sharing', 'stealing', 'gossip', 'outsideCollectors', 'royalties', 'evolve', 'leagueUpdates', 'centralBank', 'store', 'closedEconomy'];
function syncControls() {
  const c = cfgNow(); if (!c) return;
  for (const [k, [s, f]] of Object.entries(SLIDERS)) { $(k).value = Math.round(((c[k] ?? DEFAULTS[k]) / s) * 100) / 100; /* a run file from before a setting existed ran on its default */ $(k + 'V').textContent = f(+$(k).value); }
  for (const k of TOGGLES) $(k).checked = !!c[k];
  for (const k of SELECTS) if (c[k] != null) $(k).value = c[k];
  assumeList(c);
  if (typeof rulesUi === 'function') rulesUi();
}
// The Assumptions list in Rules: every setting the engine names as an assumption (ASSUMPTIONS), with its running value
function assumeList(c) {
  const fmtA = (v) => (Array.isArray(v) ? v.join('–') : v && typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k} ${x}`).join(', ') : String(v));
  $('assumeList').innerHTML = ASSUMPTIONS.map(([k, what]) => `<li><span><code>${k}</code> ${esc(what)}</span><b>${esc(fmtA(c[k] ?? DEFAULTS[k]))}</b></li>`).join('');
}
for (const [k, [s, f]] of Object.entries(SLIDERS)) $(k).addEventListener('input', () => { const v = +$(k).value; $(k + 'V').textContent = f(v); opts[k] = v * s; if (mode === 'live') { tell({ cmd: 'cfg', k, v: v * s }); logChange(k, v * s); } });
for (const k of SELECTS) $(k).addEventListener('change', (e) => { opts[k] = e.target.value; if (mode === 'live') { tell({ cmd: 'cfg', k, v: e.target.value }); logChange(k, e.target.value); } });
for (const k of TOGGLES) $(k).addEventListener('change', (e) => { opts[k] = e.target.checked; if (mode === 'live') { tell({ cmd: 'cfg', k, v: e.target.checked }); logChange(k, e.target.checked); } });
$('rulesBtn').addEventListener('click', () => { const open = !$('rules')._open; sheet($('rules'), open); $('rulesBtn').setAttribute('aria-expanded', String(open));  });
function advance() {
  if (mode === 'live') { tell({ cmd: 'step' }); return false; }
  if (cursor < FRAMES.length - 1) { cursor++; for (const [s, b] of FRAMES[cursor].arcs || []) arcs.push({ s, b, age: 0 }); return true; }
  setPlay(false); return false;
}
// Keep what is under the top of the screen exactly where it is while panels redraw (Safari has no scroll anchoring
// of its own). Before: note the chain of elements under a point just below the sticky bar. After: the deepest one still
// on the page tells how far everything moved, and the page scrolls by the same amount.
function anchorNow() {
  if (scrollY < 2) return null; const y = Math.min(innerHeight - 1, ($('status').getBoundingClientRect().bottom || 0) + 12);
  let el = document.elementFromPoint(innerWidth / 2, y); const chain = [];
  const list = el?.closest?.('tbody, .watch__list, .wks, .pks, [data-k]'); if (list) el = list.parentElement; // rows in a ranked list move by design: anchor on the list itself
  while (el && el !== document.body && chain.length < 12) { chain.push([el, el.getBoundingClientRect().top]); el = el.parentElement; }
  return chain;
}
function anchorFix(chain) {
  if (!chain) return; const hit = chain.find(([el]) => el.isConnected); if (!hit) return;
  const d = hit[0].getBoundingClientRect().top - hit[1]; if (Math.abs(d) >= 0.5) window.scrollBy(0, d);
}
const steady = (fn) => (...a) => { const k = anchorNow(); try { return fn(...a); } finally { anchorFix(k); } };
// A new week (or panels coming into view): the redraws go into the queue in the order they matter, the cheap
// numbers and the chart first. The slow panels (heatmaps, map, feed, account) come at most every half second.
function queueWeek(panels) {
  queue('fast', () => drawFast(true)); queue('main', drawMain); queue('charts', drawCharts); queue('status', drawStatus);
  queue('watch', drawWatch); queue('mvc', () => cur() && drawMvc(cur())); queue('ind', drawIndicators); queue('groups', drawGroups); queue('vis', watchVis);
  if (!panels) return;
  for (const [k, fn] of [['core', drawPanelsCore], ['tape', drawTape], ['acct', drawAcct], ['cons', drawCons], ['detail', drawDetail], ['league', drawLeagueNews], ['health', drawHealth], ['tactics', drawTactics], ['sectors', drawSectors], ['map', drawMap], ['cal', drawCalendar], ['heat', drawHeatmaps]]) queue(k, () => cur() && fn());
}
function loop(ts) {
  const dt = Math.min(0.1, (ts - lastT) / 1000 || 0); lastT = ts;
  let ran = false;
  if (mode === 'live') { ran = dirty; dirty = false; } // the worker sets the pace
  else if (playing) { acc += dt * 3 * speed; while (acc >= 1) { if (!advance()) { acc = 0; break; } acc -= 1; ran = true; } }
  if (wake && FRAMES.length && H) { wake = false; watchVis(); floorDirty = true; queueWeek(true); panelT = ts; }
  if (ran && FRAMES.length) { frameT = ts; const p = ts - panelT > 500; queueWeek(p); if (p) panelT = ts; }
  if (ran || floorDirty || floorMoving || arcs.length) drawFloor();
  const work = QUEUE.size > 0, anchor = work ? anchorNow() : null;
  const mainQueued = QUEUE.has('main'), chartsQueued = QUEUE.has('charts');
  if (work) runQueue(8);
  // Tweens: the main chart and the line charts redraw every frame only while a new point is easing in
  if (!mainQueued && MAIN.anim) drawMain();
  if (!chartsQueued && CHART_ANIM.size) drawCharts();
  if (NUMS.size) stepNums(performance.now());
  anchorFix(anchor);
  requestAnimationFrame(loop);
}
function redrawAll() { DRAWGEN++; QUEUE.clear(); $('stratLegend').html = GROUPS.map((g) => `<span><i style="background:${g.color}"></i>${g.label}</span>`).join(''); drawFloor(); drawCharts(); drawPanels(); }
$('play').addEventListener('click', () => setPlay(!playing));
$('step').addEventListener('click', () => { setPlay(false); advance(); if (mode === 'replay') { drawCharts(); drawPanels(); } });
$('seed').value = opts.seed;
$('reset').addEventListener('click', () => { if (mode === 'replay') { cursor = 0; arcs = []; redrawAll(); return; } opts.seed = randSeed(); $('seed').value = opts.seed; startLive(); });
$('seed').addEventListener('change', () => { opts.seed = Number($('seed').value) || randSeed(); $('seed').value = opts.seed; if (mode === 'live') startLive(); }); // a typed seed starts (or replays) that run
$('preset').addEventListener('change', (e) => { presetKey = e.target.value; opts = { seed: randSeed() }; $('seed').value = opts.seed; startLive(); });
$('liveBtn').addEventListener('click', () => startLive());
$('saveRun').addEventListener('click', saveRun);
$('runFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try { const run = JSON.parse(await file.text()); if (!run.frames?.length) throw new Error('no frames'); startReplay(run); }
  catch (err) { $('hyp').innerHTML = `<b>Not a sandbox run.</b> Pick a run.json from <span class="mono">sandbox/runs/</span> (${esc(err.message)}).`; }
});
document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => { speed = Number(b.dataset.speed); tell({ cmd: 'speed', v: speed }); document.querySelectorAll('[data-speed]').forEach((o) => o.setAttribute('aria-pressed', String(o === b))); }));
function readTheme() {
  Object.assign(COL, { chalk: css('--chalk'), muted: css('--muted'), faint: css('--faint'), gold: css('--gold'), panel: css('--panel'), up: css('--up'), down: css('--down'), sky: css('--sky'), mark: css('--mark'), onAccent: css('--on-accent'), lampOff: css('--lamp-off'), lampNone: css('--lamp-none'), ink: css('--ink-rgb') });
  NEUTRAL.splice(0, 3, ...css('--neutral-rgb').split(',').map(Number)); BLUE_HI.splice(0, 3, ...css('--deep-rgb').split(',').map(Number));
}
readTheme();


/* ---------- Stock-market desk: selection, tape, watchlist, main chart, detail, account ---------- */
let SEL = { type: 'market' }, ACCT = null, TF = 52, CMODE = 'line', wsortKey = 'vol', wq = '';
const cfgNow = () => (mode === 'replay' ? RUN.config : LIVECFG || {});
const select = steady(function (s) { SEL = s; if (mode === 'live') sendSel(); if (FRAMES.length) { drawMap(); drawIndicators(); drawGroups(); } $('toMarket').hidden = s.type === 'market'; drawMain(); drawDetail(); drawWatch(); });
function selectBot(id) { if (ACCT !== id) { ACCT_UI.open.clear(); ACCT_UI.allPos = false; } ACCT = id; SEL = { type: 'bot', id }; if (mode === 'live') sendSel(); { const r = $('acctPanel').getBoundingClientRect(); if (r.top > innerHeight || r.bottom < 0) $('acctPanel').scrollIntoView({ behavior: 'auto', block: 'start' }); } $('toMarket').hidden = false; drawMain(); drawDetail(); drawAcct(); }
$('toMarket').addEventListener('click', () => select({ type: 'market' }));
document.querySelectorAll('#tf [data-tf]').forEach((b) => b.addEventListener('click', () => { TF = +b.dataset.tf; document.querySelectorAll('#tf [data-tf]').forEach((o) => o.setAttribute('aria-pressed', String(o === b))); drawMain(); }));
document.querySelectorAll('#cmode [data-m]').forEach((b) => b.addEventListener('click', () => { CMODE = b.dataset.m; document.querySelectorAll('#cmode [data-m]').forEach((o) => o.setAttribute('aria-pressed', String(o === b))); drawMain(); }));
$('wsort').addEventListener('change', (e) => { wsortKey = e.target.value; drawWatch(); });
$('wfilter').addEventListener('input', (e) => { wq = e.target.value.trim().toLowerCase(); drawWatch(); });

// A player's state now (live: the world; replay: the frame's price vector). His price is what his cards trade for,
// brought back to a Prizm Base equivalent; his value is his Prizm Base card's hidden value.
// The public price guide as of a frame: the latest publication at or before it (null in runs without the guide)
function guideAt(at) { const f = FRAMES[at]; if (!f || f.guideT == null) return null; if (f._g !== undefined) return f._g; let g = null; for (let i = at; i >= 0 && i >= at - 40; i--) if (FRAMES[i].guide) { g = { v: FRAMES[i].guide, t: FRAMES[i].t }; break; } return (f._g = g); }
function cardNow(id) {
  const at = ix(), fr = FRAMES[at]; if (!fr) return { P: null };
  const P = fr.prices?.[id] ?? null, back = FRAMES[Math.max(0, at - 4)].prices?.[id];
  let F = null; for (let i = at; i >= 0; i--) if (FRAMES[i].values) { F = FRAMES[i].values[id]; break; }
  let vol4 = 0; for (let i = Math.max(0, at - 3); i <= at; i++) vol4 += FRAMES[i].vol?.[id] || 0;
  const spark = []; for (let i = Math.max(0, at - 23); i <= at; i++) spark.push(FRAMES[i].prices?.[id]);
  const g = guideAt(at);
  return { P, F, G: g?.v[id] ?? null, GT: g?.t ?? null, circ: fr.circ?.[id] ?? null, pool: fr.pool?.[id] ?? null, chg: P != null && back ? P / back - 1 : 0, vol4, spark };
}
const ret4 = (h) => (h.length > 4 ? h[h.length - 1] / h[h.length - 5] - 1 : 0);
const chgSpan = (x) => `<span class="${x >= 0 ? 'up' : 'down'}">${x >= 0 ? '▲' : '▼'} ${(Math.abs(x) * 100).toFixed(1)}%</span>`;
const mktMult = (mid) => FINISH_MULTS[mid & 3] * DESIGN_MULTS[(mid >> 2) & 3];
const mktLabel = (mid) => { const p = LIBRARY.players[mid >> 4]; return `${p.pos} ${p.name} · ${FINISHES[mid & 3]} ${DESIGNS[(mid >> 2) & 3]}`; };
const ovrOf = (id) => FRAMES[ix()]?.ovr?.[id] ?? LIBRARY.players[id].ovr ?? 60;
// The card's risk rating (starts at OVR, then follows its value) and its weekly swing
const riskNow = (id) => FRAMES[ix()]?.risk?.[id] ?? null;
const swingOf = (r) => { const c = cfgNow(); if (r == null || c.walkVolLow == null) return null; return L(c.walkVolLow, c.walkVolHigh, C((r - c.riskLo) / (c.riskHi - c.riskLo), 0, 1)); };
const riskText = (id) => { const r = riskNow(id), v = swingOf(r); return r == null ? '' : `risk ${Math.round(r)} · ±${(v * 100).toFixed(1)}%/wk`; };

// Marquee: two identical copies slide on the compositor (smooth even while the page is busy). Every item has a fixed
// width, so the loop length stays the same week to week and the text changes under it without a jump.
function marquee(view, a, b, html) {
  if (a._html === html) return; a.html = html; b.html = html;
  const w = a.offsetWidth; if (w && Math.abs((view._w || 0) - w) > 2) { view._w = w; const dur = Math.max(20, w / 40); view.style.setProperty('--marq-dur', dur.toFixed(1) + 's'); view.style.setProperty('--marq-steps', String(Math.round(dur * 30))); } // 30 steps a second: smooth, half the repaints
}
function drawTape() {
  const m = cur().movers || { up: [], down: [] };
  const g = guideAt(ix());
  const item = ([id, P, r]) => { const p = LIBRARY.players[id]; return `<button type="button" class="tk" data-card="${id}"><b>${p.pos} ${esc(p.name)}</b><span>${fmt(P)} ${chgSpan(r)}${g?.v[id] != null ? ` <small>guide ${fmt(g.v[id])}</small>` : ''}</span></button>`; };
  const items = [...m.up.map(item), ...m.down.map(item)]; while (items.length < 14) items.push('<span class="tk" aria-hidden="true"></span>');
  marquee($('tape'), $('tapeTrack'), $('tapeTrack2'), items.join(''));
}
function drawWatch() {
  // cardNow for every player at once: the frames it looks back on are found once, not once per player
  const at = ix(), fr = FRAMES[at]; if (!fr) return; const back = FRAMES[Math.max(0, at - 4)].prices, g = guideAt(at), vols = [];
  let vals = null; for (let i = at; i >= 0; i--) if (FRAMES[i].values) { vals = FRAMES[i].values; break; }
  for (let i = Math.max(0, at - 3); i <= at; i++) if (FRAMES[i].vol) vols.push(FRAMES[i].vol);
  const rows = [];
  LIBRARY.players.forEach((p, id) => {
    const P = fr.prices?.[id] ?? null; if (P == null || (wq && !p.name.toLowerCase().includes(wq) && p.pos.toLowerCase() !== wq)) return;
    let vol4 = 0; for (const v of vols) vol4 += v[id] || 0; const bk = back?.[id];
    rows.push({ id, p, P, F: vals?.[id] ?? null, G: g?.v[id] ?? null, circ: fr.circ?.[id] ?? null, chg: bk ? P / bk - 1 : 0, vol4 });
  });
  const by = { vol: (a, b) => b.vol4 - a.vol4, up: (a, b) => b.chg - a.chg, down: (a, b) => a.chg - b.chg, cap: (a, b) => b.P * (b.circ ?? 1) - a.P * (a.circ ?? 1), rich: (a, b) => b.P / b.F - a.P / a.F, cheap: (a, b) => a.P / a.F - b.P / b.F }[wsortKey];
  rows.sort(by);
  $('watchMore').textContent = watchAll ? 'Show fewer' : `Show all ${rows.length} players`;
  const list = $('watch'); list.classList.toggle('all', watchAll);
  const rowH = list.firstElementChild?.offsetHeight || 43, fitN = Math.max(8, Math.floor((list.clientHeight || rowH * 14) / rowH));
  patchRows(list, (watchAll ? rows : rows.slice(0, fitN)).map((r) => ({ key: r.id, val: r.P, html: `<button type="button" class="wrow" role="option" data-card="${r.id}" aria-selected="${SEL.type === 'card' && SEL.id === r.id}"><b>${r.p.pos} ${esc(r.p.name)}${cur()?.inj?.includes(r.id) ? ' <span class="pill pill--out">OUT</span>' : ''}</b><span class="px">${fmt(r.P)}</span><small>${esc(teamShort(r.p.team))} · OVR ${ovrOf(r.id)}${riskNow(r.id) != null ? ` · risk ${Math.round(riskNow(r.id))}` : ''} · ${r.vol4} trades · ${(r.P / r.F).toFixed(2)}×${r.G != null ? ` · guide ${fmt(r.G)}` : ''}</small><span class="chg">${chgSpan(r.chg)}</span></button>` })));
}

// Bars for the main chart: [{t, o, h, l, c, v, val}]
function barsFor(sel) {
  const n = nNow(), out = [];
  // The market is a fixed-basket index (every player weighted by his starting supply), like a stock index, so new
  // cards entering circulation don't look like rising prices
  if (sel.type === 'market') { for (let i = 0; i < n; i++) { const f = FRAMES[i], prev = FRAMES[i - 1]?.h.p ?? f.h.p, c = f.h.p; out.push({ t: f.t, o: prev, h: Math.max(prev, c), l: Math.min(prev, c), c, v: f.h.trades, val: f.h.f, mk: f.h.pMark ?? null }); } return out; }
  if (sel.type === 'metric') { const m = METRICS.find((x) => x.key === sel.key), d = metricSeries(m, n - 1); for (let i = 0; i < n; i++) { const c = d[i]; if (c == null) continue; const prev = d[i - 1] ?? c; out.push({ t: FRAMES[i].t, o: prev, h: Math.max(prev, c), l: Math.min(prev, c), c, v: 0, val: m.ref ? m.ref(FRAMES[i]) : null }); } return out; }
  if (sel.type === 'card') {
    let val = null; for (let i = 0; i < n; i++) { const f = FRAMES[i]; if (f.values) val = f.values[sel.id]; const c = f.prices?.[sel.id]; if (c == null) continue; const prev = FRAMES[i - 1]?.prices?.[sel.id] ?? c; out.push({ t: f.t, o: prev, h: Math.max(prev, c), l: Math.min(prev, c), c, v: f.vol?.[sel.id] || 0, val }); }
    return out;
  }
  for (let i = 0; i < n; i++) { const f = FRAMES[i], w = botMap(f).get(sel.id); if (w == null) continue; const pw = FRAMES[i - 1] ? botMap(FRAMES[i - 1]).get(sel.id) ?? w : w; out.push({ t: f.t, o: pw, h: Math.max(pw, w), l: Math.min(pw, w), c: w, v: 0, val: f._med }); }
  return out;
}

// The main chart keeps the Vault's own colours: a gold price line over a gold-to-amber fill on a navy plot, the old
// green and red for candles and volume, and one vivid colour per study.
const VAULT = { gold: '#ffc83d', amber: '#ff8a1f', navy: '#111627', navy2: '#090d1a', grid: '#262f4a', label: '#96a2c4', up: '#4fd18b', down: '#ff8a8a', ink: '#1a1205',
  value: '#63e6e2', marks: '#64d2ff', ma4: '#ff375f', ma12: '#bf5af2', bands: '#40c8e0', rsi: '#ff9f0a' };
const MAIN = {};
let mainCache = null;
function navyPlot(x, Wd, Ht) { // the old navy plot: a soft vertical gradient in a rounded rectangle
  const g = x.createLinearGradient(0, 0, 0, Ht); g.addColorStop(0, rgba(VAULT.navy, 0.96)); g.addColorStop(1, rgba(VAULT.navy2, 0.96));
  x.fillStyle = g; x.beginPath(); if (x.roundRect) x.roundRect(0, 0, Wd, Ht, 10); else x.rect(0, 0, Wd, Ht); x.fill();
}
function drawMain() {
  if (!seen('chart')) { MAIN.anim = false; return; }
  const sel = SEL, now = performance.now();
  const ck = `${JSON.stringify(sel)}|${nNow()}|${FRAMES.length}|${DRAWGEN}`;
  if (!mainCache || mainCache.k !== ck) mainCache = { k: ck, all: barsFor(sel) };
  const all = mainCache.all, bars = TF ? all.slice(-TF) : all.slice();
  const cv = $('chart'), [x, Wd, Ht] = fit(cv); x.clearRect(0, 0, Wd, Ht);
  const vc = $('volc'), [vx, vW, vH] = fit(vc); vx.clearRect(0, 0, vW, vH);
  // Header
  let name = 'Vault index', sub = 'repeat sales: from trades only · start = 100 · cyan: every card\'s mark, bids and asks included', valLabel = 'Hidden value';
  const met = sel.type === 'metric' ? METRICS.find((x) => x.key === sel.key) : null; if (met) { name = met.label; sub = 'market stat over time · click its tile again to go back'; valLabel = met.refLabel || ''; }
  if (sel.type === 'card') { const p = LIBRARY.players[sel.id]; name = `${p.pos} ${p.name}`; sub = `${teamShort(p.team)} · OVR ${ovrOf(sel.id)}${riskNow(sel.id) != null ? ` · ${riskText(sel.id)}` : ''} · price shown as Prizm Base${(() => { const c = cardNow(sel.id); return c.G != null ? ` · guide ${fmt(c.G)} (published wk ${c.GT})` : ''; })()}`; }
  if (sel.type === 'bot') { const b = cur().bots.find((b) => b[0] === sel.id); name = b ? b[2] : 'Bot'; sub = b ? `${kindOf(b)} · ${GROUPS[b[17] ?? 2].label} · worth` : 'not in the market now'; valLabel = 'Median bot'; }
  $('ch-name').textContent = name; $('chSub').textContent = sub;
  const last = bars[bars.length - 1], first = bars[0];
  const show = met ? met.show : fmt, selKey = JSON.stringify(sel) + '|' + TF + '|' + CMODE;
  // A new week eases in over TW: the newest bar grows out of the one before, the y-range glides to its new bounds.
  // A new selection, timeframe or chart type snaps.
  const snap = MAIN.selKey !== selKey; if (snap) { MAIN.selKey = selKey; $('chLast')._num = null; }
  const lastT = last ? last.t : null; if (lastT !== MAIN.lastT) { MAIN.t0 = !snap && MAIN.lastT != null && !RM() ? now : -1e9; MAIN.from = MAIN.dom; MAIN.lastT = lastT; }
  const ease = bars.length > 1 ? easeOut((now - MAIN.t0) / TW) : 1;
  setNum($('chLast'), last ? show(last.c) : '–'); $('chChg').html = !last || !first ? '' : met ? `<span class="k">from ${show(first.o)} · ${TF ? TF + 'W' : 'all'}</span>` : chgSpan(last.c / first.o - 1) + ` <span class="k">${TF ? TF + 'W' : 'all'}</span>`;
  const li = (c, t) => `<span><i class="line" style="background:${c}"></i>${t}</span>`;
  $('chLegend').html = li(VAULT.gold, sel.type === 'bot' ? 'Worth' : met ? met.label : 'Price') + (valLabel ? `<span><i class="dash" style="border-top-color:${VAULT.value}"></i>${valLabel}</span>` : '') + (sel.type === 'market' ? li(VAULT.marks, 'Marks index (every card\'s mark)') : '') + (sel.type !== 'bot' && STUD.ma ? li(VAULT.ma4, '4W avg') + li(VAULT.ma12, '12W avg') : '') + (sel.type !== 'bot' && STUD.bb ? li(VAULT.bands, 'Bands') : '') + (sel.type !== 'bot' && STUD.rsi ? li(VAULT.rsi, 'RSI') : '');
  if (!bars.length) { MAIN.anim = false; return; }
  navyPlot(x, Wd, Ht); navyPlot(vx, vW, vH);
  const pad = { l: 8, r: 58, t: 10, b: 18 }, iw = Wd - pad.l - pad.r, ih = Ht - pad.t - pad.b;
  let lo = Infinity, hi = -Infinity; for (const b of bars) { lo = Math.min(lo, b.l, b.val ?? Infinity, b.mk ?? Infinity); hi = Math.max(hi, b.h, b.val ?? -Infinity, b.mk ?? -Infinity); }
  const sp = hi - lo || hi || 1; lo -= sp * 0.06; hi += sp * 0.06; if (!(met && met.zero)) lo = Math.max(0, lo);
  if (ease < 1 && MAIN.from) { lo = L(MAIN.from[0], lo, ease); hi = L(MAIN.from[1], hi, ease); }
  MAIN.dom = [lo, hi]; MAIN.anim = ease < 1;
  if (ease < 1) { const k = bars.length - 1, a = bars[k - 1], z = bars[k], c = a.c + (z.c - a.c) * ease; bars[k] = { ...z, c, h: Math.max(z.o, c), l: Math.min(z.o, c), v: z.v * ease, val: z.val != null && a.val != null ? L(a.val, z.val, ease) : z.val, mk: z.mk != null && a.mk != null ? L(a.mk, z.mk, ease) : z.mk }; }
  const X0 = (i) => pad.l + (iw * (i + 0.5)) / bars.length, kL = bars.length - 1;
  const X = ease < 1 && kL > 0 ? (i) => (i === kL ? L(X0(kL - 1), X0(kL), ease) : X0(i)) : X0;
  const Y = (v) => pad.t + ih * (1 - (v - lo) / (hi - lo)), bw = Math.max(1, (iw / bars.length) * 0.66);
  x.font = `500 10px ${css('--mono')}`; x.textBaseline = 'middle';
  x.setLineDash([2, 4]); x.lineWidth = 1; x.strokeStyle = VAULT.grid;
  for (let i = 0; i <= 5; i++) { const v = lo + ((hi - lo) * i) / 5, y = Math.round(Y(v)) + 0.5; x.beginPath(); x.moveTo(pad.l, y); x.lineTo(pad.l + iw, y); x.stroke(); x.fillStyle = VAULT.label; x.fillText(show(v), Wd - pad.r + 6, y); }
  x.setLineDash([]);
  x.save(); x.beginPath(); x.rect(pad.l, 0, iw, Ht); x.clip();
  x.textBaseline = 'alphabetic'; x.fillStyle = VAULT.label;
  const step = Math.max(1, Math.ceil(bars.length / 8)); for (let i = 0; i < bars.length; i += step) x.fillText(`W${bars[i].t}`, X0(i) - 8, Ht - 3);
  // Hidden value (or median) line
  x.beginPath(); let on = false; bars.forEach((b, i) => { if (b.val == null) { on = false; return; } on ? x.lineTo(X(i), Y(b.val)) : x.moveTo(X(i), Y(b.val)); on = true; }); x.setLineDash([5, 4]); x.strokeStyle = VAULT.value; x.lineWidth = 1.5; x.stroke(); x.setLineDash([]);
  if (bars.some((b) => b.mk != null)) { x.beginPath(); let on2 = false; bars.forEach((b, i) => { if (b.mk == null) { on2 = false; return; } on2 ? x.lineTo(X(i), Y(b.mk)) : x.moveTo(X(i), Y(b.mk)); on2 = true; }); x.strokeStyle = VAULT.marks; x.lineWidth = 1.4; x.stroke(); } // every card's mark (bids and asks included)
  if (sel.type !== 'bot') drawStudies(x, bars, X, Y);
  if (CMODE === 'candle') {
    bars.forEach((b, i) => { const upc = b.c >= b.o, col = upc ? VAULT.up : VAULT.down; x.fillStyle = col; x.fillRect(Math.round(X(i)) - 0.5, Y(b.h), 1, Math.max(1, Y(b.l) - Y(b.h))); const y1 = Y(Math.max(b.o, b.c)), y2 = Y(Math.min(b.o, b.c)); const g = x.createLinearGradient(0, y1, 0, y1 + Math.max(1.5, y2 - y1)); g.addColorStop(0, col); g.addColorStop(1, rgba(col, 0.7)); x.fillStyle = g; x.fillRect(X(i) - bw / 2, y1, bw, Math.max(1.5, y2 - y1)); });
  } else {
    x.beginPath(); bars.forEach((b, i) => (i ? x.lineTo(X(i), Y(b.c)) : x.moveTo(X(i), Y(b.c)))); x.lineTo(X(kL), pad.t + ih); x.lineTo(X(0), pad.t + ih); x.closePath();
    const g = x.createLinearGradient(0, pad.t, 0, pad.t + ih); g.addColorStop(0, rgba(VAULT.gold, 0.42)); g.addColorStop(0.45, rgba(VAULT.amber, 0.16)); g.addColorStop(1, rgba(VAULT.amber, 0)); x.fillStyle = g; x.fill();
    x.beginPath(); bars.forEach((b, i) => (i ? x.lineTo(X(i), Y(b.c)) : x.moveTo(X(i), Y(b.c))));
    const lg = x.createLinearGradient(pad.l, 0, pad.l + iw, 0); lg.addColorStop(0, VAULT.amber); lg.addColorStop(0.35, VAULT.gold); lg.addColorStop(1, VAULT.gold);
    x.strokeStyle = lg; x.lineWidth = 2.2; x.lineJoin = 'round'; x.shadowColor = rgba(VAULT.gold, 0.45); x.shadowBlur = 8; x.stroke(); x.shadowBlur = 0;
    const lb = bars[kL]; x.beginPath(); x.arc(X(kL), Y(lb.c), 6, 0, Math.PI * 2); x.fillStyle = rgba(VAULT.gold, 0.25); x.fill(); x.beginPath(); x.arc(X(kL), Y(lb.c), 3, 0, Math.PI * 2); x.fillStyle = VAULT.gold; x.fill();
  }
  x.restore();
  // Last price tag
  { const lb = bars[kL], y = Y(lb.c); x.fillStyle = VAULT.gold; x.beginPath(); if (x.roundRect) x.roundRect(Wd - pad.r + 2, y - 8, pad.r - 4, 16, 4); else x.rect(Wd - pad.r + 2, y - 8, pad.r - 4, 16); x.fill(); x.fillStyle = VAULT.ink; x.font = `700 10px ${css('--mono')}`; x.textBaseline = 'middle'; x.fillText(show(last.c), Wd - pad.r + 6, y); }
  // Volume: green and red bars that fade toward the floor
  const vmax = Math.max(1, ...bars.map((b) => b.v || 0));
  bars.forEach((b, i) => { const h = ((b.v || 0) / vmax) * (vH - 4), col = b.c >= b.o ? VAULT.up : VAULT.down; if (h <= 0) return; const g = vx.createLinearGradient(0, vH - h, 0, vH); g.addColorStop(0, rgba(col, 0.8)); g.addColorStop(1, rgba(col, 0.25)); vx.fillStyle = g; vx.fillRect(X(i) - bw / 2, vH - h, bw, h); });
  vx.fillStyle = VAULT.label; vx.font = `500 10px ${css('--mono')}`; vx.fillText(sel.type === 'bot' || met ? '' : `volume (max ${fmt(vmax)})`, pad.l + 4, 12);
  drawRsi(bars, X, pad);
  // Crosshair
  if (MAIN.hi != null && MAIN.hi < bars.length) { const i = MAIN.hi, b = bars[i]; x.fillStyle = rgba(VAULT.gold, 0.4); x.fillRect(Math.round(X0(i)), pad.t, 1, ih); x.fillRect(pad.l, Math.round(Y(b.c)), iw, 1); }
  Object.assign(MAIN, { bars, X: X0, pad, iw });
}
{
  const cv = $('chart'), tip = $('chartTip');
  const move = (e) => { if (!MAIN.bars) return; const r = cv.getBoundingClientRect(), i = C(Math.floor(((e.clientX - r.left - MAIN.pad.l) / MAIN.iw) * MAIN.bars.length), 0, MAIN.bars.length - 1); MAIN.hi = i; const b = MAIN.bars[i]; tip.innerHTML = `<b>Week ${b.t}</b><br>Open <span class="mono">${fmt(b.o)}</span> · close <span class="mono">${fmt(b.c)}</span><br>High <span class="mono">${fmt(b.h)}</span> · low <span class="mono">${fmt(b.l)}</span>${b.val != null ? `<br>${SEL.type === 'bot' ? 'Median bot' : 'Hidden value'} <span class="mono">${fmt(b.val)}</span> · ${(b.c / b.val).toFixed(2)}×` : ''}${SEL.type !== 'bot' ? `<br><span class="k">${b.v} ${SEL.type === 'market' ? 'trades' : 'trades'}</span>` : ''}`; placeTip(tip, cv, MAIN.X(i), e.clientY - r.top); drawMain(); };
  cv.addEventListener('pointermove', move); cv.addEventListener('pointerdown', move);
  cv.addEventListener('pointerleave', () => { MAIN.hi = null; tip.hidden = true; drawMain(); });
}
const tile = (k, v) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`;
// Every market stat, as a history: each tile draws its own sparkline; clicking one shows it in the main chart
const seasonNum = (f) => { const m = /Y(\d+)/.exec(f.season || ''); return m ? +m[1] : null; };
// Breadth for frame i (cached): advancers and decliners against the week before, players above their 12-week average,
// new 12-week highs and lows, and volatility (the spread of this week's price changes)
function breadth(i) {
  const f = FRAMES[i]; if (!f || !f.prices) return null; if (f._br) return f._br;
  const prev = FRAMES[i - 1]?.prices, out = { adv: 0, dec: 0, unch: 0, above: 0, n: 0, hi: [], lo: [], vix: null };
  if (!prev) return (f._br = out);
  const rs = [];
  for (let id = 0; id < f.prices.length; id++) {
    const P = f.prices[id], Q = prev[id]; if (P == null || Q == null || !(Q > 0)) continue;
    if ((f.circ?.[id] ?? 1) <= 0) continue;
    out.n++; const r = P / Q - 1; rs.push(Math.log(P / Q));
    if (r > 0.001) out.adv++; else if (r < -0.001) out.dec++; else out.unch++;
    let s = 0, k = 0, mx = -Infinity, mn = Infinity; for (let j = Math.max(0, i - 12); j < i; j++) { const v = FRAMES[j].prices?.[id]; if (v == null) continue; s += v; k++; if (v > mx) mx = v; if (v < mn) mn = v; }
    if (k && P > s / k) out.above++;
    if (k >= 8 && P > mx * 1.0001) out.hi.push(id); if (k >= 8 && P < mn * 0.9999) out.lo.push(id);
  }
  if (rs.length > 2) { const m = rs.reduce((a, b) => a + b, 0) / rs.length; out.vix = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / (rs.length - 1)); }
  return (f._br = out);
}
const B = (k) => (f, i) => breadth(i)?.[k] ?? null;
const O = (k) => (f) => f.ord?.[k] ?? null;
const IND_GROUPS = [
  ['Market', [
    { key: 'index', label: 'Vault index', desc: 'every player in a fixed basket, start = 100', get: (f) => f.h.p, show: (v) => v.toFixed(1) },
    { key: 'mcap', label: 'Market value', desc: 'every card out, at its price', get: (f) => f.mkt?.mcap, ref: (f) => f.mkt?.vcap, refLabel: 'Hidden value', show: fmt },
    { key: 'prem', label: 'Premium', desc: 'market value over hidden value, minus 1', get: (f) => (f.mkt?.vcap ? f.mkt.mcap / f.mkt.vcap - 1 : null), show: (v) => (v * 100).toFixed(1) + '%', zero: true },
    { key: 'trades', label: 'Trades / wk', desc: 'cards that changed hands in the weekly market', get: (f) => f.h.trades, show: (v) => fmt(v) },
    { key: 'vix', label: 'Volatility', desc: 'how far prices typically moved this week', get: B('vix'), show: (v) => (v * 100).toFixed(1) + '%' },
  ]],
  ['Breadth', [
    { key: 'adline', label: 'Advance–decline line', desc: 'running total of advancers minus decliners', get: (f, i) => { let s = 0; for (let j = 1; j <= i; j++) { const b = breadth(j); if (b) s += b.adv - b.dec; } return s; }, show: (v) => fmt(v), zero: true, cum: true },
    { key: 'above', label: 'Above 12-wk average', desc: 'share of players priced above their 12-week average', get: (f, i) => { const b = breadth(i); return b?.n ? b.above / b.n : null; }, show: (v) => pct(v) },
  ]],
  ['Order flow', [
    { key: 'press', label: 'Buy pressure', desc: 'bids as a share of all orders (50% = balanced)', get: (f) => (f.ord && f.ord.bids + f.ord.asks ? f.ord.bids / (f.ord.bids + f.ord.asks) : null), show: (v) => pct(v) },
  ]],
  ['Supply', [
    { key: 'cards', label: 'Cards out', desc: 'copies in circulation, one-of-a-kind included', get: (f) => f.mkt?.cards, show: fmt },
    { key: 'packs', label: 'Packs / wk', desc: 'packs bought this week', get: O('packs'), show: fmt },
    { key: 'auc', label: 'Auction sell-through', desc: 'share of auctions that sold', get: (f) => (f.ord?.aucListed ? f.ord.aucSold / f.ord.aucListed : null), show: (v) => pct(v) },
  ]],
  ['Short selling', [
    { key: 'sratio', label: 'Short ratio', desc: 'short value as a share of the market', get: (f) => (f.ord && f.mkt?.mcap ? f.ord.shortValue / f.mkt.mcap : null), show: (v) => (v * 100).toFixed(2) + '%' },
    { key: 'snew', label: 'New shorts / wk', desc: 'copies borrowed and sold this week', get: O('shorts'), show: (v) => String(v) },
    { key: 'sforce', label: 'Forced closes / wk', desc: 'shorts settled in cash after a margin call or the deadline', get: O('forced'), show: (v) => String(v) },
  ]],
  ['Money', [
    { key: 'cash', label: 'Coins held', desc: 'all cash in bots’ hands', get: (f) => f.mkt?.cash, show: fmt },
    { key: 'minted', label: 'Coins created / wk', desc: 'new coins into bots’ hands this week: allowance, royalties, outside buyers, prizes, newcomers', get: (f) => f.money?.totalIn, show: fmt },
    { key: 'burned', label: 'Coins removed / wk', desc: 'coins that left bots’ hands this week: living costs, fees, packs, liquidator sales, the Vault store, outside sellers, holding costs, bots that left', get: (f) => f.money?.totalOut, show: fmt },
    { key: 'netcoins', label: 'Net new coins / wk', desc: 'the change in all bots’ cash this week (created − removed ± anything untagged): above zero, the money supply grows', get: (f) => f.money?.net, show: (v) => (v >= 0 ? '+' : '') + fmt(v), zero: true },
    { key: 'top10', label: 'Cash held by the 10% with the most cash', desc: 'their share of all cash', get: (f) => f.mkt?.cashTop10, show: (v) => pct(v) },
    { key: 'gini', label: 'Gini', desc: '0 = equal, 1 = one bot owns everything', get: (f) => f.h.gini, show: (v) => v.toFixed(3) },
  ]],
  ['Credit', [
    { key: 'lev', label: 'Debt ÷ market value', desc: 'how leveraged the market is', get: (f) => (f.mkt?.mcap ? f.mkt.debt / f.mkt.mcap : null), show: (v) => pct(v) },
    { key: 'rate', label: 'Loan rate / wk', desc: 'the rate the credit market cleared at', get: (f) => f.mkt?.rate ?? null, show: (v) => (v * 100).toFixed(2) + '%' },
    { key: 'calls', label: 'Margin calls / wk', desc: 'borrowers forced to sell', get: (f) => f.mkt?.calls ?? 0, show: (v) => String(Math.round(v)) },
  ]],
  ['Knowledge and trust', [
    { key: 'pass', label: 'Pass price', desc: 'what a research pass last sold for', get: (f) => f.h.pass, show: (v) => fmt(v) },
    { key: 'ticket', label: 'Ticket price', desc: 'what a game ticket last sold for', get: (f) => f.tickets ?? null, show: (v) => fmt(v) },
    { key: 'informed', label: 'Notes per bot', desc: 'fresh research notes held', get: (f) => f.h.informed, show: (v) => v.toFixed(1) },
    { key: 'flagged', label: 'Flagged thieves', desc: 'bots flagged by 5 or more others', get: O('flagged'), show: (v) => String(v) },
  ]],
  ['Population', [
    { key: 'lines', label: 'Lineages', desc: 'families still trading', get: (f) => f.lineages?.count, show: (v) => String(Math.round(v)) },
    { key: 'family', label: 'Largest family', desc: 'its share of all wealth', get: (f) => f.lineages?.topShare, show: (v) => pct(v) },
    { key: 'gQuitAll', na: 1, label: 'Wish to leave (median)', desc: 'the quit output (0–1) at the last generation end, all bots; above 0.5 a bot may leave under quitRule network', get: (f) => f.gen?.quitAll?.[2], show: (v) => v.toFixed(2) },
    { key: 'gQuitNew', na: 1, label: 'Wish to leave, newcomers', desc: 'the same for bots under 40 weeks in the market', get: (f) => f.gen?.quitNew?.[2], show: (v) => v.toFixed(2) },
    { key: 'gExits', na: 1, label: 'Left last generation', desc: 'bots that left in the last generation (all causes); hover the log for causes, ages and worth deciles', get: (f) => f.gen?.exits, show: (v) => String(v) },
    { key: 'gEntries', na: 1, label: 'Joined last generation', desc: 'newcomers in the last generation (heirs not counted)', get: (f) => f.gen?.entries, show: (v) => String(v) },
    { key: 'gPop', na: 1, label: 'Bots at the generation end', desc: 'the population when the last generation ended', get: (f) => f.gen?.population, show: (v) => String(v) },
  ]],
  ['Evolution', [
    { key: 'gPersistMark', na: 1, label: 'Skill carries over (marks)', desc: 'rank correlation of bots’ returns at marks, this generation against the last', get: (f) => f.gen?.persistMark, show: (v) => v.toFixed(2), zero: true },
    { key: 'gPersistBid', na: 1, label: 'Skill carries over (selling value)', desc: 'the same at what holdings could actually have sold for', get: (f) => f.gen?.persistBid, show: (v) => v.toFixed(2), zero: true },
    { key: 'gFromTop', na: 1, label: 'Descended from the last top 10%', desc: 'share of bots whose networks were copied or inherited from the previous generation’s top 10% during the last generation', get: (f) => f.gen?.fromTop, show: (v) => pct(v) },
    { key: 'gLineTop', na: 1, label: 'Largest lineage', desc: 'its share of all bots', get: (f) => f.gen?.lineTop, show: (v) => pct(v) },
    { key: 'gNetDist', na: 1, label: 'Network distance', desc: 'mean cosine distance between card networks’ weights (50 bots); 0 = identical, 1 = unrelated', get: (f) => f.gen?.netDist, show: (v) => v.toFixed(2) },
    { key: 'gNetCopy', na: 1, label: 'Distance, copies to sources', desc: 'the same between bots copied in the last generation and the bots they copied', get: (f) => f.gen?.netDistCopies, show: (v) => v.toFixed(2) },
    { key: 'gResp', na: 1, label: 'Behaviour distance', desc: 'median RMS distance between bots’ card-network outputs on 24 fixed sample cards (what fitness sharing measures)', get: (f) => f.gen?.respDist, show: (v) => v.toFixed(2) },
    { key: 'gClusters', na: 1, label: 'Strategy clusters', desc: 'k-means on the outputs on the sample cards, k = 2–8 by silhouette', get: (f) => f.gen?.clusters, show: (v) => String(v) },
    { key: 'gClusterTop', na: 1, label: 'Largest strategy cluster', desc: 'its share of the bots', get: (f) => f.gen?.clusterTop, show: (v) => pct(v) },
    { key: 'gAdaptKept', na: 1, label: 'Trials kept', desc: 'share of learning-within-a-lifetime trials kept last generation', get: (f) => f.gen?.adaptKept, show: (v) => pct(v) },
    { key: 'gAdaptFollow', na: 1, label: 'Kept trials hold up', desc: 'rank correlation of a kept trial’s score with the same bot’s next period; near 0, the kept trials were noise', get: (f) => f.gen?.adaptFollow, show: (v) => v.toFixed(2), zero: true },
  ]],
  ['Bots’ order book', [
    { key: 'bGap', na: 1, label: 'Bid–ask gap', desc: 'median gap between bots’ best standing bid and best standing ask after the cross, as a share of the mark, on cards with both', get: (f) => f.bookD?.gap, show: (v) => pct(v) },
    { key: 'bBoth', na: 1, label: 'Cards with both sides', desc: 'share of cards in circulation with a bot bid and a bot ask standing', get: (f) => f.bookD?.both, show: (v) => pct(v) },
    { key: 'bOnlyBid', na: 1, label: 'Only bids', desc: 'share of cards with bot bids but no bot asks', get: (f) => f.bookD?.onlyBid, show: (v) => pct(v) },
    { key: 'bOnlyAsk', na: 1, label: 'Only asks', desc: 'share of cards with bot asks but no bot bids', get: (f) => f.bookD?.onlyAsk, show: (v) => pct(v) },
    { key: 'bNeither', na: 1, label: 'Neither', desc: 'share of cards with no bot orders', get: (f) => f.bookD?.neither, show: (v) => pct(v) },
    { key: 'bBidDist', na: 1, label: 'Bids from the mark', desc: 'median distance of bots’ bids from the mark, in units of the price range (−1 = 60% below with ±60%)', get: (f) => f.bookD?.bidDist, show: (v) => v.toFixed(2), zero: true },
    { key: 'bAskDist', na: 1, label: 'Asks from the mark', desc: 'the same for asks', get: (f) => f.bookD?.askDist, show: (v) => v.toFixed(2), zero: true },
    { key: 'bBidEdge', na: 1, label: 'Bids at the edge', desc: 'share of bots’ bids whose price-offset output is beyond 90% of its range', get: (f) => f.bookD?.bidEdge, show: (v) => pct(v) },
    { key: 'bAskEdge', na: 1, label: 'Asks at the edge', desc: 'the same for asks', get: (f) => f.bookD?.askEdge, show: (v) => pct(v) },
  ]],
  ['Limits the networks press', [
    { key: 'lBidWall', na: 1, label: 'Bids at the wall', desc: 'share of bots’ bids whose price is at the limit of its mapping: beyond 90% of the fixed range, or at the safety clamp on the log scale', get: (f) => f.limits?.bidEdge, show: (v) => pct(v) },
    { key: 'lAskWall', na: 1, label: 'Asks at the wall', desc: 'the same for asks', get: (f) => f.limits?.askEdge, show: (v) => pct(v) },
    { key: 'lBidFar', na: 1, label: 'Bids past ±60%', desc: 'share of bids priced beyond ×1.54 or ×0.46 of their base, the edges of the default range: how much the log scale’s extra room is used', get: (f) => f.limits?.bidFar, show: (v) => pct(v) },
    { key: 'lAskFar', na: 1, label: 'Asks past ±60%', desc: 'the same for asks', get: (f) => f.limits?.askFar, show: (v) => pct(v) },
    { key: 'lKeep', na: 1, label: 'Cash target at the top', desc: 'share of neural bots whose cash-target output is in the top 5% of its range', get: (f) => f.limits?.keep, show: (v) => pct(v) },
    { key: 'lRate', na: 1, label: 'Loan rates at the ceiling', desc: 'share of neural bots whose borrowing rate is in the top 5% of the fixed range, or at the safety bound on the log scale', get: (f) => f.limits?.maxRate, show: (v) => pct(v) },
    { key: 'lRate5', na: 1, label: 'Borrowing rates above 5%', desc: 'share of neural bots that would borrow at more than 5% a week (the default ceiling)', get: (f) => f.limits?.maxOver5, show: (v) => pct(v) },
    { key: 'lOrders', na: 1, label: 'Buy orders cut off', desc: 'share of acting neural bots with one more buy order they wanted and could pay for when the weekly count stopped them', get: (f) => f.limits?.orders, show: (v) => pct(v) },
    { key: 'lListings', na: 1, label: 'Listings cut off', desc: 'share with one more auction listing they wanted when the weekly count stopped them', get: (f) => f.limits?.listings, show: (v) => pct(v) },
    { key: 'lShorts', na: 1, label: 'Shorts cut off', desc: 'share with one more short sale they wanted when the weekly count stopped them', get: (f) => f.limits?.shorts, show: (v) => pct(v) },
    { key: 'lPacks', na: 1, label: 'Packs cut off', desc: 'share that wanted more packs than the weekly count allows', get: (f) => f.limits?.packs, show: (v) => pct(v) },
  ]],
];
const METRICS = IND_GROUPS.flatMap(([, ms]) => ms);
const GTAG = { Market: 'MARKET', Breadth: 'BREADTH', 'Order flow': 'FLOW', Supply: 'SUPPLY', 'Short selling': 'SHORTS', Money: 'MONEY', Credit: 'CREDIT', 'Knowledge and trust': 'TRUST', Population: 'PEOPLE', Evolution: 'EVOLUTION', 'Bots’ order book': 'BOOK', 'Limits the networks press': 'LIMITS' };
// Every indicator value is worked out once per week and kept on that week's frame (frames never change once in)
function mval(m, i) {
  const f = FRAMES[i], c = (f._m ||= {}); if (m.key in c) return c[m.key];
  if (m.cum) { let j = i; while (j > 0 && !(m.key in (FRAMES[j - 1]._m ||= {}))) j--; let s = j > 0 ? FRAMES[j - 1]._m[m.key] : 0; for (; j <= i; j++) { const b = breadth(j); if (b) s += b.adv - b.dec; (FRAMES[j]._m ||= {})[m.key] = s; } return s; }
  const v = m.get(f, i); return (c[m.key] = v == null || !isFinite(v) ? null : v);
}
const metricSeries = (m, upto = ix(), from = 0) => { const out = []; for (let i = Math.max(0, from); i <= upto; i++) out.push(mval(m, i)); return out; };
// A market-site mini chart: the last 52 weeks, green when it ended above where it started and red when below, a dotted
// baseline at the start, a fading fill, high and low marks, and a dot on the latest value
let UP = COL.up, DN = COL.down; // reset by readTheme's listener
function spark(cv, d, show, zero, selected) {
  const [x, Wd, Ht] = fit(cv); x.clearRect(0, 0, Wd, Ht);
  const idx = d.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0); if (idx.length < 2) return null;
  const first = d[idx[0]], last = d[idx[idx.length - 1]], up = last >= first, col = selected ? COL.gold : up ? UP : DN;
  let lo = Infinity, hi = -Infinity, iLo = 0, iHi = 0; for (const i of idx) { if (d[i] < lo) { lo = d[i]; iLo = i; } if (d[i] > hi) { hi = d[i]; iHi = i; } }
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const sp = hi - lo || Math.abs(hi) || 1, pt = 9, pb = 9, L0 = 1, R0 = 4;
  const X = (i) => L0 + (i / Math.max(1, d.length - 1)) * (Wd - L0 - R0), Y = (v) => pt + (1 - (v - lo) / sp) * (Ht - pt - pb);
  // baseline at the start of the window
  x.strokeStyle = ink(0.28); x.lineWidth = 1; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(L0, Math.round(Y(first)) + 0.5); x.lineTo(Wd - R0, Math.round(Y(first)) + 0.5); x.stroke(); x.setLineDash([]);
  const path = () => { x.beginPath(); let on = false; d.forEach((v, i) => { if (v == null) { on = false; return; } on ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)); on = true; }); };
  path(); x.lineTo(X(idx[idx.length - 1]), Ht); x.lineTo(X(idx[0]), Ht); x.closePath();
  const g = x.createLinearGradient(0, pt, 0, Ht); g.addColorStop(0, rgba(col, 0.28)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fill();
  path(); x.strokeStyle = col; x.lineWidth = 1.6; x.lineJoin = 'round'; x.stroke();
  const lx = X(idx[idx.length - 1]), ly = Y(last); x.beginPath(); x.arc(lx, ly, 4.5, 0, Math.PI * 2); x.fillStyle = rgba(col, 0.25); x.fill(); x.beginPath(); x.arc(lx, ly, 2.2, 0, Math.PI * 2); x.fillStyle = col; x.fill();
  if (show && Wd > 120) { x.font = `500 9px ${css('--mono')}`; x.fillStyle = COL.faint; x.textBaseline = 'top'; x.textAlign = X(iHi) > Wd / 2 ? 'right' : 'left'; x.fillText('H ' + show(hi), C(X(iHi), 2, Wd - 2), 0); x.textBaseline = 'bottom'; x.textAlign = X(iLo) > Wd / 2 ? 'right' : 'left'; x.fillText('L ' + show(lo), C(X(iLo), 2, Wd - 2), Ht); x.textAlign = 'left'; x.textBaseline = 'alphabetic'; }
  return { first, last, up };
}
// Each group's tiles fill whole rows: as many columns as fit (tiles at least 188 px), then evened out, so 8 tiles on
// a 7-column width become two rows of 4 instead of 7 and 1
function evenTiles() {
  for (const g of document.querySelectorAll('#ind .indt')) { const n = g.children.length, w = g.getBoundingClientRect().width || 1, fit = Math.max(1, Math.floor((w + 6) / 194)), rows = Math.ceil(n / fit), cols = Math.ceil(n / rows); g.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`; }
}
addEventListener('resize', () => evenTiles());
// The indicators board: built once, then only values and sparklines change each week
function drawIndicators() {
  const f = cur(); const host = $('ind'); if (!f || !host) return; const at = ix();
  if (host.dataset.built && !seen(host)) return;
  if (!host.dataset.built) {
    host.innerHTML = IND_GROUPS.map(([g, ms]) => `<div class="indg"><h3>${g}${INFO[g] ? ' ' + infoBtn(g) : ''}</h3><div class="indt">${ms.map((m) => `<div class="qt" role="button" tabindex="0" data-metric="${m.key}" title="${esc(m.label)}: click to chart it"><span class="qt__top"><span class="qt__name">${m.label}${infoBtn(m.key)}</span><span class="qt__tf">52W</span></span><span class="qt__row"><b data-v></b><span class="qt__chg" data-c></span></span><canvas aria-hidden="true"></canvas></div>`).join('')}</div></div>`).join('');
    host.dataset.built = '1'; evenTiles();
  }
  for (const el of host.querySelectorAll('[data-metric]')) {
    const m = METRICS.find((x) => x.key === el.dataset.metric), d = metricSeries(m, at, at - 51), v = d[d.length - 1], on = SEL.type === 'metric' && SEL.key === m.key;
    el.setAttribute('aria-pressed', String(on)); el.querySelector('[data-v]').textContent = v == null ? (m.na ? 'n/a' : '–') : m.show(v);
    const w = d.slice(-52), r = spark(el.querySelector('canvas'), w, m.show, m.zero, on), c = el.querySelector('[data-c]');
    if (!r) { c.textContent = ''; continue; }
    const rel = r.first > 0 && !m.zero && !m.noPct, ch = rel ? r.last / r.first - 1 : r.last - r.first, flat = Math.abs(ch) < 1e-9;
    c.className = 'qt__chg ' + (flat ? '' : ch > 0 ? 'qt--up' : 'qt--dn');
    c.textContent = flat ? '0' : `${ch > 0 ? '▲' : '▼'} ${rel ? Math.abs(ch * 100).toFixed(1) + '%' : m.show(Math.abs(ch))}`;
  }
}

// The market-data sections: one quote table per group (every indicator with its last value, 1-week and 52-week
// change, where it sits in its 52-week range, and its trend), with that group's charts and tables beside it
const QROW = (m) => `<tr data-metric="${m.key}"><td><span class="qname">${m.label}</span>${infoBtn(m.key)}</td><td class="num" data-v></td><td class="num" data-c1></td><td class="num" data-c52></td><td class="rng"><span class="rbar"><i></i><b></b></span><span class="rlh"><span data-lo></span><span data-hi></span></span></td><td class="sp"><canvas aria-hidden="true"></canvas></td></tr>`;
const chgOf = (m, a, b) => { if (a == null || b == null) return null; const rel = a > 0 && !m.zero && !m.noPct; return { rel, v: rel ? b / a - 1 : b - a }; };
const chgHtml = (m, c) => (!c ? '<span class="k">–</span>' : Math.abs(c.v) < 1e-9 ? '<span class="k">0</span>' : `<span class="${c.v > 0 ? 'up' : 'down'}">${c.v > 0 ? '▲' : '▼'} ${c.rel ? Math.abs(c.v * 100).toFixed(1) + '%' : m.show(Math.abs(c.v))}</span>`);
function drawGroups() {
  const f = cur(); if (!f) return; const at = ix();
  for (const tb of document.querySelectorAll('table.qtab')) {
    const g = IND_GROUPS.find(([name]) => name === tb.dataset.group); if (!g) continue;
    const body = tb.tBodies[0]; if (!body.dataset.built) { body.innerHTML = g[1].map(QROW).join(''); body.dataset.built = '1'; }
    for (const tr of body.rows) {
      const m = METRICS.find((x) => x.key === tr.dataset.metric), d = metricSeries(m, at), w = d.slice(-52), v = d[d.length - 1], on = SEL.type === 'metric' && SEL.key === m.key;
      tr.classList.toggle('on', on);
      tr.querySelector('[data-v]').textContent = v == null ? (m.na ? 'n/a' : '–') : m.show(v);
      const prev = d[Math.max(0, d.length - 2)], f52 = w.find((x) => x != null);
      tr.querySelector('[data-c1]').innerHTML = chgHtml(m, chgOf(m, prev, v)); tr.querySelector('[data-c52]').innerHTML = chgHtml(m, chgOf(m, f52, v));
      const vals = w.filter((x) => x != null), lo = vals.length ? Math.min(...vals) : null, hi = vals.length ? Math.max(...vals) : null;
      const pos = v == null || lo == null || hi === lo ? 0.5 : (v - lo) / (hi - lo);
      tr.querySelector('.rbar b').style.left = `${(pos * 100).toFixed(1)}%`; tr.querySelector('.rbar i').style.width = `${(pos * 100).toFixed(1)}%`;
      tr.querySelector('[data-lo]').textContent = lo == null ? '' : m.show(lo); tr.querySelector('[data-hi]').textContent = hi == null ? '' : m.show(hi);
      spark(tr.querySelector('canvas'), w, null, m.zero, on);
    }
  }
}
const MS = (k) => metricSeries(METRICS.find((m) => m.key === k));
function drawFeatures() {
  if (!FRAMES.length || !$('fxMkt')) return; // only on the sectioned layout
  line('fxMkt', [{ data: MS('mcap'), color: SYS.blue, fill: true }, { data: MS('vcap'), color: SYS.mint, dash: true }], { fy: fmt, min: 0 });
  line('fxPrem', [{ data: MS('prem'), color: SYS.indigo, fill: true }], { fy: (v) => (v * 100).toFixed(0) + '%', ref: 0 });
  line('fxAD', [{ data: MS('adline'), color: COL.up, fill: true }], { fy: (v) => fmt(v), ref: 0 });
  line('fxFlow', [{ data: MS('bids'), color: COL.up }, { data: MS('asks'), color: COL.down }], { fy: fmt, min: 0 });
  line('fxShort', [{ data: MS('sopen'), color: SYS.orange, fill: true }, { data: MS('slend'), color: SYS.teal }], { fy: fmt, min: 0 });
  line('fxCards', [{ data: MS('cards'), color: SYS.mint, fill: true }], { fy: fmt });
  line('fxMint', [{ data: MS('minted'), color: SYS.purple, fill: true }, { data: MS('packs'), color: SYS.yellow }], { fy: fmt, min: 0 });
  line('fxDebt', [{ data: MS('debt'), color: SYS.orange, fill: true }], { fy: fmt, min: 0 });
  line('fxRate', [{ data: MS('rate'), color: SYS.yellow, fill: true }], { fy: (v) => (v * 100).toFixed(2) + '%', min: 0 });
}
const fxTip = (keys) => (i) => `<b>${when(FRAMES[i].t)}</b><br>` + keys.map((k) => { const m = METRICS.find((x) => x.key === k), v = metricSeries(m, i)[i]; return `${m.label} <span class="mono">${v == null ? '–' : m.show(v)}</span>`; }).join('<br>');
[['fxMkt', ['mcap', 'vcap', 'prem']], ['fxPrem', ['prem']], ['fxAD', ['adline', 'adv', 'dec']], ['fxFlow', ['bids', 'asks', 'press']], ['fxShort', ['sopen', 'slend', 'sval']], ['fxCards', ['cards']], ['fxMint', ['minted', 'packs']], ['fxDebt', ['debt', 'lev']], ['fxRate', ['rate']]].forEach(([id, ks]) => { if ($(id)) crosshair(id, fxTip(ks)); });

/* ---------- Info cards: a small "i" beside every stat and every chart opens what it is ---------- */
const INFO = {
  // panels and charts, by their title
  'Watchlist': 'Every player, sorted the way you choose. A player’s price is what his cards trade for, brought back to a Prizm Base equivalent. The multiple at the end of each row is his price ÷ hidden value.',
  'Leaderboard': 'The richest bots right now: worth (cash + cards at their price − loans − cards owed on shorts), their 4-week return, and their return over the last full generation.',
  'Market value vs hidden value': 'Gold: every card in circulation at the price it last traded for. Dashed: the same cards at their hidden value, which no bot sees. The gap between them is the premium.',
  'Premium (market ÷ hidden value − 1)': 'Above zero the market pays more than cards are worth (a bubble); below zero it pays less (a discount).',
  'Advance–decline line': 'Each week, the number of players whose price rose minus the number whose price fell, added up since week 0. A falling line means most players are sliding, even if the index is flat.',
  'Bids vs offers per week': 'How many buy orders (green) and sell orders (red) bots placed in the weekly market. More offers than bids pushes prices down.',
  'Short interest (copies on loan)': 'Red: borrowed copies sold short and not yet bought back. Blue: copies their holders offered to lend this week, the supply short sellers can borrow from.',
  'Cards out': 'Every copy in circulation, one-of-a-kind cards included. It only grows when packs are opened.',
  'New cards and packs per week': 'Gold: new copies pulled from packs. Blue: packs bought. New copies add supply, which weighs on prices.',
  'Loans out': 'Coins lent between bots. There is no bank: every loan is one bot’s cash lent to another, secured by the borrower’s cards.',
  'Loan rate per week': 'The rate the weekly credit auction cleared at: what borrowers paid lenders, per week.',
  'Cash held by the richest 10%': 'The share of all coins held by the richest tenth of bots. Rising means cash is concentrating at the top.',
  'Where the money goes': 'Over the last 20 weeks, by wealth group: realized profit and loss from selling cards, net cash in or out, and quick flips (cards sold within 12 weeks of buying).',
  'Cost of access': 'What a research pass (gold) and a game ticket (blue) last sold for in their own weekly markets. Passes reveal a player’s library page and hidden risk rating; tickets enter the Arcade contests.',
  'Notes': 'Notes swapped between friends (blue) and stolen (red) each week. A thief that is caught gets flagged, and bots that flagged it won’t share, trade or lend with it until the flag lifts.',
  'Wealth share': 'How total wealth splits between the richest 10%, the next 40% and the bottom 50%, week by week.',
  'Gini': 'Inequality of wealth: 0 means every bot is equally rich, 1 means one bot owns everything.',
  'Sectors': 'The eight positions as sectors. Returns and price ÷ value are weighted by the cards each player has out; up / down counts players whose price rose or fell this week.',
  'Sector returns over time': 'Each position’s 4-week return, week by week. Green rows are rising sectors, red falling ones.',
  'Calendar': 'What the rules have scheduled: season changes, the end of each generation (royalties, selection, deaths), loans falling due, contests and flags.',
  'Floor': 'Every bot as a dot. Further right means richer; higher means the cards it holds have a higher average OVR. Blue dots gained over 4 weeks, red ones lost.',
  'What they learned': 'For each input of the card network, how much raising it pushes the richest bots toward buying (red) or selling (blue), measured on their own networks. These weights came from selection, not from anyone programming them.',
  'OVR bands · price ÷ value': 'For players grouped by OVR, what their cards trade for against their hidden value, week by week.',
  'Who holds which OVR bands': 'Which wealth group holds the value in each OVR band right now.',
  'Wealth groups · 4-week return': 'The average 4-week return of the richest 10%, the next 40% and the bottom 50%.',
  'Top 20 bots · worth vs median': 'The 20 richest bots now, and their worth against the median bot over time.',
  'Games · last 4 weeks': 'The Arcade contests: entries, prize pots, and the skill index (does knowing more score more? 0 = luck, 1 = pure skill), overall and by wealth group.',
  'Most traded': 'The players traded most over 20 weeks, with their price (gold) against hidden value (dashed).',
  'Library page': 'A player’s page as a research pass shows it: stats, OVR, grade, Career Legacy and awards.',
  'Feed': 'Everything that happens, newest first: headlines, trades, auctions, research, notes, games, packs, credit and shorts.',
  'Account': 'The selected bot: worth, cash, realized and unrealized profit, its positions (shorts shown as −1), what its networks currently decide, and its recent activity.',
  'Market map': 'Every player as a box sized by the market value of his cards out, coloured by price change over the chosen weeks, grouped by position.',
  'Top gainers': 'Traded players with the biggest price rise over 4 weeks.', 'Top losers': 'Traded players with the biggest price fall over 4 weeks.',
  'New 12-week highs': 'Players trading at their highest price in 12 weeks.', 'New 12-week lows': 'Players trading at their lowest price in 12 weeks.',
  'Most active': 'Players with the most trades over 4 weeks.', 'Most shorted': 'Players with the most copies borrowed and sold short right now.',
  'Market': 'The market as a whole. Each row: the latest value, its change over 1 week and 52 weeks, where it sits between its 52-week low and high, and its 52-week trend. Click a row to chart it full size.',
  'Breadth': 'How many players move, not just how far: advancers, decliners, the advance–decline line, and new highs and lows.',
  'Order flow': 'The orders bots placed: bids, offers, and how unfilled orders moved prices.',
  'Short selling': 'Borrowing cards to sell them, betting the price will fall, and buying them back later.',
  'Supply': 'New cards from packs, cards in circulation, and the auction market for one-of-a-kind cards.',
  'Money': 'Coins entering (allowance, prizes), leaving (living costs) and who holds them.',
  'Credit': 'Coin loans between bots: how much, at what rate, and how many go wrong.',
  'Knowledge and trust': 'Research, notes, theft and the flags that follow it.',
  'Population': 'How many bots trade, how many family lines survive, and how wealth is shared.',
};
const infoText = (k) => { const m = METRICS.find((x) => x.key === k); return m ? `<b>${esc(m.label)}</b><br>${esc(m.desc[0].toUpperCase() + m.desc.slice(1))}.<br><span class="k">Click the row to chart it full size.</span>` : INFO[k] ? `<b>${esc(k)}</b><br>${esc(INFO[k])}` : null; };
function infoBtn(k) { return `<button type="button" class="info" data-info="${esc(k)}" aria-label="What is this?">i</button>`; }
// Every panel and chart title gets an info button if there is a card for it
for (const h of document.querySelectorAll('.panel h2, .panel h3')) { const t = h.textContent.trim(); if (INFO[t] && !h.querySelector('.info')) h.insertAdjacentHTML('beforeend', ' ' + infoBtn(t)); }
{
  const card = document.createElement('div'); card.className = 'infocard'; card.hidden = true; card.setAttribute('role', 'tooltip'); document.body.appendChild(card);
  let pinned = null;
  const show = (btn) => { const html = infoText(btn.dataset.info); if (!html) return; card.innerHTML = html; card.hidden = false; const r = btn.getBoundingClientRect(), w = Math.min(300, innerWidth - 24); card.style.width = w + 'px'; let x = r.left + r.width / 2 - w / 2; x = C(x, 12, innerWidth - w - 12); card.style.left = x + scrollX + 'px'; const below = r.bottom + 8 + card.offsetHeight < innerHeight; card.style.top = (below ? r.bottom + 8 : r.top - card.offsetHeight - 8) + scrollY + 'px'; };
  const hide = () => { card.hidden = true; pinned = null; };
  document.addEventListener('pointerover', (e) => { const b = e.target.closest('.info'); if (b && !pinned && e.pointerType === 'mouse') show(b); });
  document.addEventListener('pointerout', (e) => { const b = e.target.closest('.info'); if (b && !pinned && e.pointerType === 'mouse') card.hidden = true; });
  document.addEventListener('click', (e) => { const b = e.target.closest('.info'); if (b) { e.stopPropagation(); e.preventDefault(); if (pinned === b) hide(); else { pinned = b; show(b); } return; } if (!e.target.closest('.infocard')) hide(); }, true);
  document.addEventListener('focusin', (e) => { const b = e.target.closest?.('.info'); if (b) show(b); });
  document.addEventListener('focusout', (e) => { if (e.target.closest?.('.info') && !pinned) card.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  addEventListener('scroll', () => { if (!pinned) card.hidden = true; }, { passive: true });
}
// Movers: gainers and losers over 4 weeks, most active, new 12-week highs and lows
function moverRows(rows, extra) { const out = rows.slice(0, 10).map((r) => { const p = LIBRARY.players[r.id]; return `<tr data-card="${r.id}"><td>${p.pos} ${esc(p.name)}</td><td class="num">${fmt(r.P)}</td><td class="num">${extra(r)}</td></tr>`; }); if (!out.length) out.push('<tr><td class="k" colspan="3">None this week.</td></tr>'); while (out.length < 10) out.push('<tr class="pad"><td colspan="3">&nbsp;</td></tr>'); return out.join(''); }
// Sectors: the eight positions, each weighted by the cards it has out
const SECTORS = ['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL'];
function sectorAt(i, k) {
  const f = FRAMES[i], b = FRAMES[Math.max(0, i - k)]; if (!f?.prices || !b?.prices) return null;
  const s = SECTORS.map(() => ({ now: 0, then: 0, val: 0, n: 0, vol: 0, adv: 0, dec: 0 })); let vals = null; for (let j = i; j >= 0; j--) if (FRAMES[j].values) { vals = FRAMES[j].values; break; }
  const prev = FRAMES[i - 1]?.prices;
  for (let id = 0; id < f.prices.length; id++) {
    const k2 = SECTORS.indexOf(LIBRARY.players[id].pos), c = f.circ?.[id] ?? 1, P = f.prices[id], Q = b.prices[id]; if (k2 < 0 || P == null || Q == null || c <= 0) continue;
    const x = s[k2]; x.now += P * c; x.then += Q * c; x.val += (vals?.[id] ?? P) * c; x.n++; x.vol += f.vol?.[id] || 0; if (prev?.[id] != null) { if (P > prev[id] * 1.001) x.adv++; else if (P < prev[id] * 0.999) x.dec++; }
  }
  return s;
}
function drawSectors() {
  const at = ix(); const s1 = sectorAt(at, 1), s4 = sectorAt(at, 4), s12 = sectorAt(at, 12); if (!s1) return;
  const tot = s1.reduce((a, x) => a + x.now, 0) || 1;
  const r = (x) => (x && x.then ? x.now / x.then - 1 : null);
  $('sectors').tBodies[0].html = SECTORS.map((p, k) => { const a = s1[k]; return `<tr><td><b>${p}</b></td><td class="num">${a.n}</td><td class="num">${r(a) == null ? '–' : chgSpan(r(a))}</td><td class="num">${r(s4[k]) == null ? '–' : chgSpan(r(s4[k]))}</td><td class="num">${r(s12[k]) == null ? '–' : chgSpan(r(s12[k]))}</td><td class="num">${a.val ? (a.now / a.val).toFixed(2) + '×' : '–'}</td><td class="num">${pct(a.now / tot)}</td><td class="num">${a.vol}</td><td class="num"><span class="up">${a.adv}</span> / <span class="down">${a.dec}</span></td></tr>`; }).join('');
  const n = nNow(), { cols, range } = buckets(n, hmWidth('hmSec')), rows = SECTORS.map((p) => ({ label: p }));
  const val = (i, j) => { const s = sectorAt(range(j)[1], 4); const x = s?.[i]; return x && x.then ? x.now / x.then - 1 : null; };
  heatmap('hmSec', rows, cols, val, (v) => { const t = C(v / 0.15, -1, 1); return t >= 0 ? mix(NEUTRAL, [29, 156, 92], t) : mix(NEUTRAL, [196, 58, 58], -t); }, (i, j) => { const [a, b] = range(j), v = val(i, j); return `<b>${SECTORS[i]}</b><br>Weeks ${FRAMES[a].t}–${FRAMES[b].t}<br>4-week return <span class="mono">${v == null ? '–' : (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%'}</span><br><span class="k">every ${SECTORS[i]}'s price, weighted by the cards he has out</span>`; }, (j) => `W${FRAMES[range(j)[0]].t}`);
}
// The market detail under the chart: breadth and order flow as bars
function internalsHtml(f, at) {
  const b = breadth(at) || { adv: 0, dec: 0, unch: 0, hi: [], lo: [] }, o = f.ord || {};
  const bar = (l, r, lc, rc, ll, rl) => { const t = l + r || 1; return `<div class="ibar"><div class="ibar__lab"><span>${ll} <b>${Math.round(l).toLocaleString()}</b></span><span><b>${Math.round(r).toLocaleString()}</b> ${rl}</span></div><div class="ibar__track"><i style="width:${(l / t) * 100}%;background:${lc}"></i><i style="width:${(r / t) * 100}%;background:${rc}"></i></div></div>`; };
  return `<div style="grid-column:1/-1;display:grid;gap:10px"><h3>Market internals this week</h3>${bar(b.adv, b.dec, COL.up, COL.down, 'Advancers', 'decliners')}${bar(o.bids || 0, o.asks || 0, COL.up, COL.down, 'Bids', 'offers')}${bar(o.pullUp || 0, o.pullDown || 0, COL.up, COL.down, 'Quotes pulled up', 'pulled down')}${bar(b.hi.length, b.lo.length, COL.up, COL.down, 'New highs', 'new lows')}${bar(o.aucSold || 0, (o.aucListed || 0) - (o.aucSold || 0), COL.sky, COL.lampOff, 'Auctions sold', 'unsold')}<p class="note">Every indicator, with its history, is in the board below the desk. Click one to chart it here.</p></div>${(() => { const w = cur()?.why; if (!w) return ''; const top = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${esc(k)} <b>${n}</b>`).join(' · ') || '–'; return `<div class="note" style="grid-column:1/-1">Why neural bots traded this week (the input that pushed hardest): bought on ${top(w.buy)}<br>sold on ${top(w.sell)}</div>`; })()}`;
}

/* ---------- Terminal: status line, market map, calendar, chart studies ---------- */
let MAPK = 4, STUD = { ma: true, bb: false, rsi: true }, watchAll = false, lbAll = false, feedN = 20;
function drawStatus() {
  const f = cur(), at = ix(); if (!f) return;
  const p1 = FRAMES[Math.max(0, at - 1)]?.h.p ?? f.h.p, b = breadth(at) || {}, o = f.ord || {};
  $('statusBadge').html = mode === 'replay' ? `<span class="paused">Replay</span>` : playing ? `<span class="live">Live</span>` : `<span class="paused">Paused</span>`;
  const item = (k, v, w) => `<span style="width:${k.length + w + 4}ch">${k}<b>${v}</b></span>`; // w = the widest the value gets
  marquee($('statusView'), $('statusSet'), $('statusSet2'), [item('Week', f.t, 4), item('Season', f.season || '–', 4), `<span style="width:20ch">Vault index<b>${f.h.p.toFixed(1)}</b> ${chgSpan(f.h.p / p1 - 1)}</span>`, item('Premium', f.mkt?.vcap ? ((f.mkt.mcap / f.mkt.vcap - 1) * 100).toFixed(1) + '%' : '–', 7), `<span style="width:13ch">A/D<b><span class="up">${b.adv ?? 0}</span>/<span class="down">${b.dec ?? 0}</span></b></span>`, item('Volatility', b.vix == null ? '–' : (b.vix * 100).toFixed(1) + '%', 6), item('Trades', f.h.trades, 6), item('Coins traded', fmt(o.coins), 8), item('Buy pressure', o.bids + o.asks ? pct(o.bids / (o.bids + o.asks)) : '–', 4), item('Loan rate', f.mkt?.rate == null ? '–' : (f.mkt.rate * 100).toFixed(2) + '%', 6), item('Bots', f.bots.length, 4), ...(f.guideT != null ? [item('Guide', 'wk ' + f.guideT, 6)] : []), item('New coins', f.money ? (f.money.net >= 0 ? '+' : '−') + fmt(Math.abs(f.money.net)) : '–', 9), `<span style="width:58ch">Top card<b>${f.top?.[0] ? `${esc(f.top[0].label)} ${fmt(f.top[0].P)}` : '–'}</b></span>`].join(''));
}
// Squarified treemap: rectangles close to square, biggest first
function squarify(items, x, y, w, h) {
  const out = [], tot = items.reduce((a, it) => a + it.v, 0); if (!tot || w <= 0 || h <= 0) return out;
  const scale = (w * h) / tot; let rest = items.map((it) => ({ ...it, a: it.v * scale })), X = x, Y = y, Wd = w, Ht = h;
  const worst = (row, side) => { const s = row.reduce((a, r) => a + r.a, 0), mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
  while (rest.length) {
    const side = Math.min(Wd, Ht); let row = [rest[0]], i = 1;
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) { row.push(rest[i]); i++; }
    const s = row.reduce((a, r) => a + r.a, 0);
    if (Wd >= Ht) { const cw = s / Ht; let yy = Y; for (const r of row) { const rh = r.a / cw; out.push({ ...r, x: X, y: yy, w: cw, h: rh }); yy += rh; } X += cw; Wd -= cw; }
    else { const rh = s / Wd; let xx = X; for (const r of row) { const cw = r.a / rh; out.push({ ...r, x: xx, y: Y, w: cw, h: rh }); xx += cw; } Y += rh; Ht -= rh; }
    rest = rest.slice(i);
  }
  return out;
}
const mapCol = (r) => { if (r == null) return `rgb(${NEUTRAL})`; const t = C(r / (MAPK === 1 ? 0.08 : MAPK === 4 ? 0.2 : 0.4), -1, 1); return t >= 0 ? mix(NEUTRAL, [29, 156, 92], t) : mix(NEUTRAL, [196, 58, 58], -t); };
const onTile = (fill, a) => { const [r, g, b] = (fill.match(/\d+/g) || [0, 0, 0]).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? `rgba(0,0,0,${a * 0.85})` : `rgba(255,255,255,${a})`; };
let MAPR = [];
scale('scaleMap', 'down', 'up', (t) => mapCol(((t * 2 - 1) * 0.2)));
function drawMap() {
  const at = ix(), f = FRAMES[at]; if (!f?.prices || !seen('map')) return;
  const cv = $('map'), [x, Wd, Ht] = fit(cv); x.clearRect(0, 0, Wd, Ht);
  const back = FRAMES[Math.max(0, at - MAPK)]?.prices || f.prices;
  const groups = SECTORS.map((pos) => ({ pos, v: 0, kids: [] }));
  for (let id = 0; id < f.prices.length; id++) { const P = f.prices[id], c = f.circ?.[id] ?? 0, k = SECTORS.indexOf(LIBRARY.players[id].pos); if (P == null || c <= 0 || k < 0) continue; const v = P * c, Q = back[id]; groups[k].kids.push({ id, v, P, r: Q > 0 ? P / Q - 1 : null }); groups[k].v += v; }
  const gs = groups.filter((g) => g.v > 0).sort((a, b) => b.v - a.v); MAPR = [];
  for (const g of squarify(gs, 0, 0, Wd, Ht)) {
    const head = g.h > 40 && g.w > 50 ? 15 : 0;
    x.fillStyle = COL.panel; x.fillRect(g.x, g.y, g.w, g.h);
    const kids = squarify(g.kids.sort((a, b) => b.v - a.v), g.x + 1, g.y + head + 1, g.w - 2, g.h - head - 2);
    for (const k of kids) {
      x.fillStyle = mapCol(k.r); x.fillRect(k.x + 0.5, k.y + 0.5, Math.max(0, k.w - 1), Math.max(0, k.h - 1));
      if (SEL.type === 'card' && SEL.id === k.id) { x.strokeStyle = COL.gold; x.lineWidth = 2; x.strokeRect(k.x + 1.5, k.y + 1.5, k.w - 3, k.h - 3); }
      MAPR.push(k);
      if (k.w > 44 && k.h > 24) {
        const p = LIBRARY.players[k.id], big = k.w > 110 && k.h > 46; x.fillStyle = onTile(mapCol(k.r), 0.95); x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = `600 ${big ? 14 : 11}px ${css('--display')}`; const nm = big ? p.name : p.name.split(' ').slice(-1)[0];
        x.fillText(nm.length * (big ? 7 : 6) > k.w ? nm.slice(0, Math.max(3, Math.floor(k.w / (big ? 7.5 : 6.5)))) : nm, k.x + k.w / 2, k.y + k.h / 2 - (big ? 8 : 5));
        x.font = `500 ${big ? 12 : 10}px ${css('--mono')}`; x.fillStyle = onTile(mapCol(k.r), 0.75); x.fillText(k.r == null ? '' : `${k.r >= 0 ? '+' : ''}${(k.r * 100).toFixed(1)}%`, k.x + k.w / 2, k.y + k.h / 2 + (big ? 9 : 6));
      }
    }
    if (head) { x.fillStyle = COL.muted; x.textAlign = 'left'; x.textBaseline = 'middle'; x.font = `700 11px ${css('--mono')}`; x.fillText(`${g.pos} · ${fmt(g.v)}`, g.x + 5, g.y + 8); }
  }
  x.textAlign = 'left';
}
{
  const cv = $('map'), tip = $('mapTip');
  const hit = (e) => { const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top; return [MAPR.find((k) => mx >= k.x && mx < k.x + k.w && my >= k.y && my < k.y + k.h), mx, my]; };
  cv.addEventListener('pointermove', (e) => { const [k, mx, my] = hit(e); if (!k) { tip.hidden = true; return; } const p = LIBRARY.players[k.id], f = cur(); tip.innerHTML = `<b>${p.pos} ${esc(p.name)}</b><br>${esc(teamShort(p.team))} · OVR ${ovrOf(k.id)}${riskNow(k.id) != null ? ` · ${riskText(k.id)}` : ''}<br>Price <span class="mono">${fmt(k.P)}</span> · ${MAPK}W ${k.r == null ? '–' : chgSpan(k.r)}<br>${f.circ?.[k.id] ?? '–'} cards out · market value <span class="mono">${fmt(k.v)}</span>`; placeTip(tip, cv, mx, my); });
  cv.addEventListener('pointerleave', () => (tip.hidden = true));
  cv.addEventListener('click', (e) => { const [k] = hit(e); if (k) { select({ type: 'card', id: k.id }); { const r = $('chart').getBoundingClientRect(); if (r.top > innerHeight || r.bottom < 0) $('ch-name').scrollIntoView({ behavior: 'auto', block: 'start' }); } } });
}
document.querySelectorAll('#mapTf [data-k]').forEach((b) => b.addEventListener('click', () => { MAPK = +b.dataset.k; document.querySelectorAll('#mapTf [data-k]').forEach((o) => o.setAttribute('aria-pressed', String(o === b))); drawMap(); }));
document.querySelectorAll('#studies [data-s]').forEach((b) => b.addEventListener('click', () => { STUD[b.dataset.s] = !STUD[b.dataset.s]; b.setAttribute('aria-pressed', String(STUD[b.dataset.s])); drawMain(); }));
$('watchMore').addEventListener('click', () => { watchAll = !watchAll; drawWatch(); });
$('lbMore').addEventListener('click', () => { lbAll = !lbAll; drawPanels(); });
function drawCalendar() {
  const f = cur(); if (!f) return; const c = cfgNow(), t = f.t, sw = c.seasonWeeks || 20, gw = c.weeksPerGeneration || 20, o = f.ord || {};
  const nextS = Math.ceil((t + 1) / sw) * sw, nextG = Math.ceil((t + 1) / gw) * gw, yr = seasonNum(f);
  const ev = [];
  ev.push([nextS, `Season ${yr != null ? 'Y' + (yr + 1) : 'change'} arrives`, 'new OVRs and real results; risk ratings shift with OVR; rookies enter the pool']);
  ev.push([nextG, 'Generation ends', `royalties (${pct(c.royaltyRate ?? 0.03)} of hidden value) paid to holders ${c.evolve ? ` · the worst ${pct(c.evolveShare ?? 0.1)} copy the best networks` : ''} · bots at the end of their lives pass their estates and networks to ${c.heirs ?? 1} heir${(c.heirs ?? 1) > 1 ? 's' : ''}`]);
  if (o.due4) ev.push([t + 4, `${o.due4} loans fall due`, `${fmt(o.due4Coins)} coins within 4 weeks; borrowers who can't repay must sell`]);
  ev.push([t + 1, 'Every week', `allowance ${fmt(c.allowance)} a bot · living cost ${fmt(c.livingCost)} plus ${((c.lifestyle ?? 0) * 100).toFixed(2)}% of worth · ${c.passesPerWeek ?? 3} research passes and ${c.gameTickets ?? 3} tickets each`]);
  if (f.topics) ev.push([t + 1, 'This week’s contests', Object.entries(f.topics).map(([g, tp]) => `${GAMES[g]?.label || g}${tp ? ` (${tp})` : ''}`).join(' · ')]);
  if (c.flagWeeks) ev.push([t + 1, 'Thief flags', `${o.flagged ?? 0} bots flagged by 5+; a flag lifts after ${c.flagWeeks} weeks without being caught`]);
  ev.sort((a, b) => a[0] - b[0]);
  $('cal').html = ev.map(([w, h, d]) => `<div><time>${w <= t + 1 ? 'Now' : 'W' + w}</time><span><b>${esc(h)}</b>${w > t + 1 ? ` <span class="k">in ${w - t} wk</span>` : ''}<small>${esc(d)}</small></span></div>`).join('');
}
// Chart studies on the main chart's bars
function sma(xs, k) { return xs.map((_, i) => (i + 1 < k ? null : xs.slice(i + 1 - k, i + 1).reduce((a, b) => a + b, 0) / k)); }
function sdev(xs, k) { const m = sma(xs, k); return xs.map((_, i) => (m[i] == null ? null : Math.sqrt(xs.slice(i + 1 - k, i + 1).reduce((a, b) => a + (b - m[i]) ** 2, 0) / k))); }
function rsi(xs, k = 14) { const out = xs.map(() => null); let g = 0, l = 0; for (let i = 1; i < xs.length; i++) { const d = xs[i] - xs[i - 1]; if (i <= k) { g += Math.max(0, d); l += Math.max(0, -d); if (i === k) out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); continue; } g = (g * (k - 1) + Math.max(0, d)) / k; l = (l * (k - 1) + Math.max(0, -d)) / k; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } return out; }
function drawStudies(x, bars, X, Y) {
  const cl = bars.map((b) => b.c), path = (d, col, w, dash) => { x.beginPath(); let on = false; d.forEach((v, i) => { if (v == null) { on = false; return; } on ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)); on = true; }); x.setLineDash(dash || []); x.strokeStyle = col; x.lineWidth = w; x.stroke(); x.setLineDash([]); };
  if (STUD.bb) { const m = sma(cl, 12), s = sdev(cl, 12); const up = m.map((v, i) => (v == null ? null : v + 2 * s[i])), dn = m.map((v, i) => (v == null ? null : v - 2 * s[i])), ix0 = up.findIndex((v) => v != null); if (ix0 >= 0) { x.beginPath(); for (let i = ix0; i < up.length; i++) x.lineTo(X(i), Y(up[i])); for (let i = dn.length - 1; i >= ix0; i--) x.lineTo(X(i), Y(dn[i])); x.closePath(); x.fillStyle = rgba(VAULT.bands, 0.08); x.fill(); } path(up, rgba(VAULT.bands, 0.8), 1, [2, 3]); path(dn, rgba(VAULT.bands, 0.8), 1, [2, 3]); }
  if (STUD.ma) { path(sma(cl, 4), VAULT.ma4, 1.5); path(sma(cl, 12), VAULT.ma12, 1.5); }
}
function drawRsi(bars, X, pad) {
  const cv = $('rsic'); cv.hidden = !STUD.rsi; if (!STUD.rsi) return;
  const [x, Wd, Ht] = fit(cv); x.clearRect(0, 0, Wd, Ht); navyPlot(x, Wd, Ht); const r = rsi(bars.map((b) => b.c)), Y = (v) => 4 + (1 - v / 100) * (Ht - 8);
  x.fillStyle = rgba(VAULT.rsi, 0.07); x.fillRect(pad.l, Y(70), Wd - pad.l - pad.r, Y(30) - Y(70));
  x.fillStyle = rgba(VAULT.down, 0.12); x.fillRect(pad.l, Y(100), Wd - pad.l - pad.r, Y(70) - Y(100)); x.fillStyle = rgba(VAULT.up, 0.1); x.fillRect(pad.l, Y(30), Wd - pad.l - pad.r, Y(0) - Y(30));
  x.fillStyle = VAULT.label; x.font = `500 10px ${css('--mono')}`; x.textBaseline = 'middle'; x.fillText('70', Wd - pad.r + 6, Y(70)); x.fillText('30', Wd - pad.r + 6, Y(30)); x.fillText('RSI 14', pad.l + 4, 10);
  x.beginPath(); let on = false; r.forEach((v, i) => { if (v == null) { on = false; return; } on ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)); on = true; }); x.strokeStyle = VAULT.rsi; x.lineWidth = 1.6; x.lineJoin = 'round'; x.stroke();
  const last = r[r.length - 1]; if (last != null) { x.fillStyle = last > 70 ? VAULT.down : last < 30 ? VAULT.up : VAULT.label; x.fillText(last.toFixed(0), Wd - pad.r + 24, Y(last)); }
}

function drawDetail() {
  const f = cur(); if (!f) return;
  if (SEL.type === 'market' || SEL.type === 'metric') {
    const c = cfgNow(), safe = [c.store && 'store', c.priceLimit && 'limits', c.wealthTax && 'tax', c.positionLimit && 'caps', c.centralBank && 'bank', c.closedEconomy && 'closed'].filter(Boolean).join(' · ') || 'none';
    $('detail').html = internalsHtml(f, ix()) + `<div class="stats" style="grid-column:1/-1">${tile('Safeguards', safe)}${f.people ? tile('Joined / left this week', `+${f.people.joined} / −${f.people.left}`) : ''}${f.lineages ? tile('Lineages', `${f.lineages.count} · deepest gen ${f.lineages.depth}`) : ''}</div>`;
    return;
  }
  if (SEL.type === 'card') {
    const id = SEL.id, p = LIBRARY.players[id], now = cardNow(id), risk = riskNow(id), swing = swingOf(risk), cw = cfgNow();
    // His 16 card markets: design × finish, each with its own price; and his one-of-a-kind cards
    let grid = '', items = '', tape = '<p class="note">Time &amp; sales shows in live mode.</p>', holders = '';
    const D = mode === 'live' && LIVE.p?.id === id ? LIVE.p : null;
    const cell = (d, fi) => { const mid = id * 16 + d * 4 + fi; if (D) { const g = D.grid[d * 4 + fi], m = { P: g[0], F: g[1], circ: g[2] }; return `<td class="num" title="value ${fmt(m.F)} · ${m.circ} out">${m.circ ? fmt(m.P) : '<span class="k">' + fmt(m.P) + '</span>'}<br><span class="k">${m.circ} out</span></td>`; } return `<td class="num">${now.P == null ? '–' : fmt(now.P * mktMult(mid))}</td>`; };
    grid = `<div style="grid-column:1/-1"><h3>His 16 cards</h3><div class="tablewrap"><table class="book"><thead><tr><th></th>${FINISHES.map((x) => `<th class="num">${x}</th>`).join('')}</tr></thead><tbody>${[0, 1, 2, 3].map((d) => `<tr><td>${DESIGNS[d]}</td>${[0, 1, 2, 3].map((fi) => cell(d, fi)).join('')}</tr>`).join('')}</tbody></table></div><p class="note">${D ? 'Price of each card market; grey = none in circulation (quoted from the player\'s price).' : 'Replays record one price per player; each card shown at that price × its rarity premium.'}</p></div>`;
    if (D) {
      items = `<div style="grid-column:1/-1"><h3>One of a kind (${D.nItems})</h3>${D.items.length ? `<div class="tablewrap"><table class="book"><tbody>${D.items.slice(0, 10).map(([label, owner, oid, mark]) => `<tr data-bot="${oid}"><td>${esc(label.split(' · ').slice(1).join(' · '))}</td><td>${esc(owner)}</td><td class="num">${fmt(mark)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">None pulled yet.</p>'}</div>`;
      tape = D.tape.length ? `<table class="book"><thead><tr><th>Wk</th><th>Card</th><th>Buyer</th><th class="num">Price</th></tr></thead><tbody>${D.tape.map((j) => `<tr><td class="k">${j.t}</td><td class="k">${esc(String(j.card).split('|').slice(1).join(' ') || String(j.card).split(' · ').slice(1).join(' · '))}</td><td>${esc(j.buyer || '–')}</td><td class="num">${fmt(j.price)}</td></tr>`).join('')}</tbody></table>` : '<p class="note">No trades yet.</p>';
      holders = `<div style="grid-column:1/-1"><h3>Top holders</h3><table class="book"><tbody>${D.holders.map(([bid, bname, grp, q, v]) => `<tr data-bot="${bid}"><td><span class="sw" style="background:${GROUPS[grp].color}"></span>${esc(bname)}</td><td class="num">${q} cards</td><td class="num k">${fmt(v)}</td></tr>`).join('') || '<tr><td class="k">Nobody</td></tr>'}</tbody></table></div>`;
    } else if (mode === 'live') { items = '<p class="note" style="grid-column:1/-1">Loading his cards…</p>'; }
    $('detail').html = `<div class="stats">${tile('Price (Prizm Base)', fmt(now.P))}${tile('Hidden value', fmt(now.F))}${tile('Price ÷ value', now.F ? (now.P / now.F).toFixed(2) + '×' : '–')}${tile('4-wk change', chgSpan(now.chg))}${tile('OVR', ovrOf(id))}${risk != null ? tile('Risk rating', Math.round(risk)) + tile('Weekly swing', `±${(swing * 100).toFixed(1)}% · up ${pct(cw.walkUp)} of weeks`) : ''}${now.circ != null ? tile('Cards out', now.circ) + tile('Left in pool', now.pool) : ''}${FRAMES[ix()]?.si ? tile('Short interest', `${FRAMES[ix()].si[id]} copies`) : ''}${tile('4-wk trades', now.vol4)}</div>${grid}${items}<div style="grid-column:1/-1"><h3>Time &amp; sales</h3>${tape}</div>${holders}`;
    return;
  }
  $('detail').html = '<p class="note">The account panel shows this bot\'s positions and activity.</p>';
}
function botLogFor(name) {
  if (mode === 'live') return LIVE.b?.log || [];
  const out = []; for (let i = cursor; i >= 0 && out.length < 50; i--) for (const j of (FRAMES[i].aiLog || []).slice().reverse()) { if (Object.values(j).includes(name)) out.push(j); if (out.length >= 50) break; }
  return out;
}
/* ---------- Account ---------- */
// Every log entry has a kind, and each kind one colour, the same in the account and the feed
const KIND = { trade: 'trade', passTrade: 'trade', ticketTrade: 'trade', auctionList: 'auction', auctionResult: 'auction', pack: 'pack', game: 'game', short: 'short', cover: 'short', shortCall: 'short', forcedCover: 'short', share: 'notes', steal: 'notes', flagLift: 'notes', loan: 'credit', marginCall: 'credit', default: 'credit', research: 'research', adopted: 'evo', died: 'evo', eliminated: 'evo', born: 'evo', entered: 'evo', exited: 'evo', post: 'talk', message: 'talk', aiActions: 'talk' };
const NEWSKIND = { return: 'evo', champion: 'pack', award: 'pack', hof: 'auction', retire: 'research', rookie: 'trade', injury: 'credit', crash: 'credit', margin: 'credit', credit: 'credit', bubble: 'pack', season: 'trade', gen: 'evo', evolve: 'evo', people: 'evo', flag: 'notes', fashion: 'notes', auction: 'auction', corner: 'short', pool: 'research', start: 'research', update: 'trade', games: 'game' };
const ACCT_UI = { open: new Set(), allPos: false, packs: 3, weeks: 8, shorts: 3 };
// A pull: "RB:Name|Design|Finish" for a market copy, or a one-of-a-kind label (kit, parallel, autograph)
function pullChip(k) {
  const m = /^([A-Z]+):(.+?)\|(\w+)\|(\w+)$/.exec(k || '');
  if (m) return `<span class="pull pull--${m[4].toLowerCase()}" title="${esc(cardName(k))}">${esc(m[2].split(' ').slice(-1)[0])} <i>${esc(m[4] === 'Base' ? m[3] : m[4] + ' ' + m[3])}</i></span>`;
  const auto = /Autograph/.test(k), par = /Prizm (Red|Blue|Green|Gold|Black)/.exec(k);
  const nm = (k.split(' · ')[0] || '').split(' ').slice(-1)[0];
  return `<span class="pull pull--${auto ? 'auto' : par ? 'par' : 'kit'}" title="${esc(k)}">${esc(nm)} <i>${auto ? 'Autograph' : par ? par[0] : 'Alt kit'}</i></span>`;
}
// One week of a bot's log, counted: what it bought, sold, listed, opened, played, shorted and stole
function weekDigest(rows, name) {
  const c = { buy: [0, 0], sell: [0, 0], list: 0, won: [0, 0], pack: [0, 0], game: [0, 0, 0], short: 0, cover: 0, forced: 0, swap: 0, steal: 0, robbed: 0, credit: 0, other: 0 };
  for (const j of rows) {
    if (j.type === 'trade') { if (j.buyer === name) { c.buy[0]++; c.buy[1] += j.price; } else { c.sell[0]++; c.sell[1] += j.price; } }
    else if (j.type === 'auctionList') c.list++;
    else if (j.type === 'auctionResult') { if (j.winner === name) { c.won[0]++; c.won[1] += j.price; } }
    else if (j.type === 'pack') { c.pack[0]++; c.pack[1] += j.price || 0; }
    else if (j.type === 'game') { c.game[0]++; if (j.won) c.game[1]++; c.game[2] += j.net || 0; }
    else if (j.type === 'short') c.short++; else if (j.type === 'cover') c.cover++; else if (j.type === 'forcedCover' || j.type === 'shortCall') c.forced++;
    else if (j.type === 'share') c.swap++; else if (j.type === 'steal') { if (j.thief === name) c.steal++; else c.robbed++; }
    else if (KIND[j.type] === 'credit') c.credit++; else c.other++;
  }
  const chip = (k, t) => `<span class="chip k-${k}">${t}</span>`, out = [];
  if (c.buy[0]) out.push(chip('trade', `▲ ${c.buy[0]} bought · ${fmt(c.buy[1])}`));
  if (c.sell[0]) out.push(chip('sell', `▼ ${c.sell[0]} sold · ${fmt(c.sell[1])}`));
  if (c.pack[0]) out.push(chip('pack', `${c.pack[0]} pack${c.pack[0] > 1 ? 's' : ''}`));
  if (c.won[0]) out.push(chip('auction', `${c.won[0]} won at auction`)); if (c.list) out.push(chip('auction', `${c.list} listed`));
  if (c.game[0]) out.push(chip('game', `${c.game[1]}/${c.game[0]} games · ${c.game[2] >= 0 ? '+' : ''}${fmt(c.game[2])}`));
  if (c.short + c.cover + c.forced) out.push(chip('short', [c.short && `${c.short} short`, c.cover && `${c.cover} bought back`, c.forced && `${c.forced} forced`].filter(Boolean).join(' · ')));
  if (c.swap + c.steal + c.robbed) out.push(chip('notes', [c.swap && `${c.swap} swaps`, c.steal && `${c.steal} thefts`, c.robbed && `robbed ${c.robbed}×`].filter(Boolean).join(' · ')));
  if (c.credit) out.push(chip('credit', `${c.credit} credit`));
  return out.join('') || '<span class="k">quiet week</span>';
}
function drawAcct() {
  const f = cur(); if (!f) return;
  if (ACCT == null || !f.bots.some((b) => b[0] === ACCT)) { const pick = f.bots.filter((b) => b[9]).sort((a, b) => b[3] - a[3])[0] || f.bots.slice().sort((a, b) => b[3] - a[3])[0]; ACCT = pick[0]; if (mode === 'live') sendSel(); }
  const b = f.bots.find((x) => x[0] === ACCT), [id, , name, w, n, soc, flaggedBy, cash, notes, isAi, gen, model] = b;
  const rank = f.bots.slice().sort((x, y) => y[3] - x[3]).findIndex((x) => x[0] === id) + 1;
  let longs = [], shorts = [], realized = null, debt = null, bot = null, log = [], packs = [];
  if (mode === 'live' && LIVE.b?.id === id) {
    bot = LIVE.b; realized = bot.realized; debt = bot.debt; log = bot.log || []; packs = bot.packs || [];
    longs = bot.positions.map(([pid, label, q, ac, P]) => ({ pid, label, q, ac, P, pnl: ac == null ? null : (P - ac) * q }));
    shorts = (bot.shorts || []).map(([pid, label, entry, P, left, forced]) => ({ pid, label, entry, P, left, forced, pnl: entry - P }));
  } else if (isAi && f.aiDetail?.[name]) {
    const d = f.aiDetail[name]; realized = d.realized; debt = d.debt ?? null; log = botLogFor(name);
    longs = d.positions.map(([cid, q, ac]) => { const P = (f.prices?.[cid >> 4] ?? 0) * mktMult(cid); return { pid: cid >> 4, label: mktLabel(cid), q, ac, P, pnl: (P - ac) * q }; });
  }
  longs.sort((x, y) => y.q * y.P - x.q * x.P);
  const cardVal = longs.reduce((s, p) => s + p.q * p.P, 0), shortVal = shorts.reduce((s, p) => s + p.P, 0);
  const unreal = longs.reduce((s, p) => s + (p.pnl || 0), 0) + shorts.reduce((s, p) => s + p.pnl, 0);
  const sg = (v) => (v == null ? '–' : `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${fmt(v)}</span>`);
  const ws = []; for (let i = Math.max(0, nNow() - 80); i < nNow(); i++) ws.push(botMap(FRAMES[i]).get(id) ?? null);
  const w4 = ws[Math.max(0, ws.length - 5)], ch4 = w4 ? w - w4 : null;
  // Where its worth sits: cash, cards held, minus what it owes (loans) and what its shorts would cost to buy back
  const tot = Math.max(1, cash + cardVal + (debt || 0) + shortVal), seg = (v, k, label) => (v > 0 ? `<i class="k-${k}" style="width:${(v / tot) * 100}%" title="${label} ${fmt(v)}"></i>` : '');
  const g = bot?.g, gbar = (label, v, max) => `<span><em>${label}</em><i><b style="width:${Math.round(C(v / max, 0, 1) * 100)}%"></b></i></span>`;
  const showN = ACCT_UI.allPos ? longs.length : 8;
  const pad = (rows, k, cols) => { while (rows.length < k) rows.push(`<tr class="pad"><td colspan="${cols}">&nbsp;</td></tr>`); return rows.join(''); };
  const posRows = pad(longs.slice(0, showN).map((p) => `<tr data-card="${p.pid}"><td title="${esc(p.label)}">${esc(p.label)}</td><td class="num">${p.q > 1 ? p.q + '×' : ''}${fmt(p.P)}</td><td class="num">${p.pnl == null ? '–' : sg(p.pnl)}</td></tr>`), Math.min(8, showN), 3);
  const shortRows = pad(shorts.slice(0, ACCT_UI.shorts).map((p) => `<tr data-card="${p.pid}"><td title="${esc(p.label)}">${esc(p.label)}</td><td class="num">${fmt(p.entry)} → ${fmt(p.P)}</td><td class="num">${p.forced ? '<span class="down">forced</span>' : p.left + ' wk'}</td><td class="num">${sg(p.pnl)}</td></tr>`), ACCT_UI.shorts, 4);
  const packRows = packs.slice(0, ACCT_UI.packs).map((j) => `<div class="pk"><time>W${j.t}</time><span class="pk__t">${esc(j.packType || 'pack')}${j.free ? ' · free' : ` · ${fmt(j.price)}`}</span><div class="pk__pulls">${j.pulls.map(pullChip).join('')}</div></div>`);
  while (packRows.length < ACCT_UI.packs) packRows.push(`<div class="pk pk--pad">${packRows.length ? '' : '<span class="k">No packs yet.</span>'}</div>`);
  // Week by week: one line per week, newest first; click a week to see every entry in it
  const byWeek = new Map(); for (const j of log) { if (!byWeek.has(j.t)) byWeek.set(j.t, []); byWeek.get(j.t).push(j); }
  const weeks = [...byWeek.keys()].sort((x, y) => y - x).slice(0, ACCT_UI.weeks);
  const weekRows = weeks.map((t) => { const rows = byWeek.get(t), open = ACCT_UI.open.has(t);
    const det = open ? `<div class="wk__det">${rows.map((j) => { const r = ACT[j.type]?.(j); return r ? `<div><span class="tag k-${KIND[j.type] || 'talk'}">${r[0]}</span><span>${r[1]}</span></div>` : ''; }).join('')}</div>` : '';
    return `<div class="wk${open ? ' wk--open' : ''}"><button type="button" class="wk__h" data-wk="${t}" aria-expanded="${open}"><time>W${t}</time><span class="wk__c">${weekDigest(rows, name)}</span><span class="wk__n">${rows.length}</span></button>${det}</div>`; });
  while (weekRows.length < ACCT_UI.weeks) weekRows.push('<div class="wk wk--pad"></div>');
  $('acct').html = `<div class="ah"><span class="sw" style="background:${grpColor(b)}"></span><b>${esc(name)}</b><span class="ah__rank">#${rank}<small>/${f.bots.length}</small></span></div>
  <div class="ah__chips"><span class="chip">${kindOf(b)}${model ? ' · ' + esc(model) : ''}</span><span class="chip" style="color:${grpColor(b)}">${GROUPS[b[17] ?? 2].label}</span><span class="chip${soc === 2 ? ' k-notes' : ''}">${SOC[soc]}</span><span class="chip">gen ${gen}</span>${flaggedBy >= 5 ? `<span class="chip k-credit">flagged by ${flaggedBy}</span>` : ''}</div>
  <div class="aw"><div><span>Worth</span><b>${fmt(w)}</b><small>${ch4 == null ? '' : `${sg(ch4)} in 4 wk`}</small></div><canvas id="acctSpark" aria-label="${esc(name)} worth over the last 80 weeks"></canvas></div>
  <div class="alloc" aria-label="What its worth is made of">${seg(cash, 'cash', 'Cash')}${seg(cardVal, 'trade', 'Cards')}${seg(debt || 0, 'credit', 'Owes')}${seg(shortVal, 'short', 'Shorts to buy back')}</div>
  <div class="alloc__k"><span><i class="k-cash"></i>Cash ${fmt(cash)}</span><span><i class="k-trade"></i>Cards ${fmt(cardVal)}</span><span><i class="k-credit"></i>Owes ${fmt(debt || 0)}</span>${shorts.length ? `<span><i class="k-short"></i>Shorts ${fmt(shortVal)}</span>` : ''}</div>
  <div class="am">${[['Realized', sg(realized)], ['Unrealized', sg(unreal)], ['Cards', n], ['Notes', notes], ['Avg OVR', b[15] ?? '–'], ['Research 8 wk', bot?.research ?? '–']].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
  ${g ? `<div class="ag">${gbar(`Cash target ${pct(g.keep)}`, g.keep, 0.6)}${gbar(`Borrows ${g.lev.toFixed(2)}×`, g.lev, 1.5)}${gbar(`Lends ${pct(g.lendShare)} of cash`, g.lendShare, 0.7)}${gbar(`Lends ${pct(bot.lendCards || 0)} of cards`, bot.lendCards || 0, 1)}</div>` : ''}
  <h3 class="ah3">Holdings<span>${longs.length} cards · ${fmt(cardVal)}</span></h3>
  <table class="atab"><tbody>${posRows}</tbody></table><button type="button" class="more" id="acctAll"${longs.length > 8 ? '' : ' disabled'}>${longs.length > 8 ? (ACCT_UI.allPos ? 'Show top 8' : `Show all ${longs.length}`) : mode === 'replay' && !isAi ? 'Replays record positions for AI bots only' : 'All shown'}</button>
  <h3 class="ah3">Short<span>${shorts.length ? `${shorts.length} open${shorts.length > ACCT_UI.shorts ? ` (top ${ACCT_UI.shorts} shown)` : ''} · ${sg(shorts.reduce((s, p) => s + p.pnl, 0))}` : 'none open'}</span></h3><table class="atab atab--4"><tbody>${shortRows}</tbody></table>
  <h3 class="ah3">Packs opened<span>${packs.length ? `${packs.length > ACCT_UI.packs ? 'latest ' + ACCT_UI.packs : packs.length} · colour = finish` : ''}</span></h3>
  <div class="pks">${packRows.join('')}</div>
  <h3 class="ah3">Week by week<span>click a week for every entry</span></h3>
  <div class="wks">${weekRows.join('') || ''}</div>`;
  const cv = $('acctSpark'), [x, Wd, Ht] = fit(cv), vals = ws.filter((v) => v != null);
  if (vals.length > 1) { const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1, up = vals[vals.length - 1] >= vals[0]; x.beginPath(); let on = false, lx = 0; ws.forEach((v, k) => { if (v == null) { on = false; return; } const px = (k / (ws.length - 1)) * (Wd - 4) + 2, py = Ht - 3 - ((v - lo) / sp) * (Ht - 6); on ? x.lineTo(px, py) : x.moveTo(px, py); on = true; lx = px; }); x.strokeStyle = up ? COL.up : COL.down; x.lineWidth = 1.6; x.stroke(); x.lineTo(lx, Ht); x.lineTo(2, Ht); x.closePath(); x.fillStyle = up ? rgba(COL.up, 0.1) : rgba(COL.down, 0.1); x.fill(); }
}
document.addEventListener('click', (e) => {
  const wk = e.target.closest('[data-wk]'); if (wk) { const t = +wk.dataset.wk; ACCT_UI.open.has(t) ? ACCT_UI.open.delete(t) : ACCT_UI.open.add(t); drawAcct(); }
  if (e.target.id === 'acctAll') { ACCT_UI.allPos = !ACCT_UI.allPos; drawAcct(); }
});
function drawMint() {
  const host = $('mintTable'), m = cur()?.money; if (!host) return;
  if (!m) { host.html = ''; return; }
  const row = (k, v, cls) => `<tr><td>${esc(k)}</td><td class="num ${cls}">${cls === 'up' ? '+' : '−'}${fmt(Math.abs(v))}</td></tr>`;
  const ins = Object.entries(m.created).filter(([, v]) => v), outs = Object.entries(m.removed).filter(([, v]) => v);
  const fz = Object.entries(cur()?.forced || {}).filter(([, n]) => n).sort((a, b) => b[1] - a[1]), sh = cur()?.shocks || 0;
  const tail = `<p class="note">Forced sales this week: ${fz.length ? fz.map(([k, n]) => `${esc(k)} ${n}`).join(' · ') : 'none'}${sh ? ` · cash shocks ${sh}` : ''}</p>`;
  { const y = cur()?.royYield, n = $('royYieldNote'); if (n) n.textContent = y != null ? `royalty yield actually paid: ${(y * 100).toFixed(3)}% of marked value a week (last generation)` : 'royalty yield actually paid: shown after the first generation'; }
  const cr = cur()?.credit, credit = cr ? `<p class="note">Credit this week: offered ${fmt(cr.offered)} · asked ${fmt(cr.asked)} · lent ${fmt(cr.lent)} · repaid at maturity ${fmt(cr.repaidMaturity)} · repaid by forced sales ${fmt(cr.repaidForced)} · median cash target ${pct(cr.all.keep?.[2] ?? 0)} (richest 10%: ${pct(cr.top.keep?.[2] ?? 0)}) · median borrow ${(cr.all.lev?.[2] ?? 0).toFixed(2)}×</p>` : '';
  host.html = tail + credit + `<table class="atab"><thead><tr><th>This week's money</th><th class="num">Coins</th></tr></thead><tbody>${ins.map(([k, v]) => row(k, v, 'up')).join('')}${outs.map(([k, v]) => row(k, v, 'down')).join('')}${Math.abs(m.other) >= 1 ? `<tr><td class="k">other (untagged)</td><td class="num">${m.other >= 0 ? '+' : '−'}${fmt(Math.abs(m.other))}</td></tr>` : ''}<tr><td><b>Net change in bots' cash</b></td><td class="num ${m.net >= 0 ? 'up' : 'down'}"><b>${m.net >= 0 ? '+' : '−'}${fmt(Math.abs(m.net))}</b></td></tr></tbody></table>`;
}
function drawCons() {
  drawMint();
  const n = nNow(), from = Math.max(0, n - 20);
  const sum = (k, a) => { let s = 0; for (let i = from; i < n; i++) s += FRAMES[i].flow?.[k]?.[a] || 0; return s; };
  const rows = GROUPS.map((g, a) => ({ g, real: sum('realized', a), net: sum('net', a), trips: sum('trips', a) }));
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.real)));
  $('pnl').tBodies[0].html = rows.map((r) => `<tr><td><span class="sw" style="background:${r.g.color}"></span>${r.g.label}</td><td class="num ${r.real >= 0 ? 'up' : 'down'}">${r.real >= 0 ? '+' : ''}${fmt(r.real)}</td><td class="bar"><span class="${r.real < 0 ? 'neg' : ''}" style="width:${(Math.abs(r.real) / max) * 100}%"></span></td><td class="num">${r.net >= 0 ? '+' : ''}${fmt(r.net)}</td><td class="num">${r.trips}</td></tr>`).join('');
  const c0 = H.cashTop.find((v) => v != null), c1 = H.cashTop[n - 1];
  $('consNote').textContent = `Groups are by worth each week. The richest 10% hold ${pct(c1)} of all cash (${pct(c0)} at the start). Quick flips: sold within 12 weeks of buying.`;
}


/* ---------- The government (regulated runs: docs/regulator-spec.md §16) ---------- */
// Shown only for a run that has one (a replayed or followed regulate.mjs run): status, the treasury and its own account,
// the ledger by line, the commentary, the board with its parsed signals, the notebook (new lines marked) and every dial
// it touched. Everything follows the cursor in a replay. With no government the panel stays hidden and nothing else changes.
const UI_GOV_REV = new Set(['fees', 'holding', 'wealthTax', 'packTax', 'outsideTax', 'exitTax', 'pollTax', 'levy']);
const UI_GOV_NAME = { fees: 'Trade and auction fees', holding: 'Holding costs', wealthTax: 'Wealth tax', packTax: 'Pack sales tax', outsideTax: 'Outside sales tax', exitTax: 'Exit tax', pollTax: 'Poll tax', levy: 'Levies', allowance: 'Allowance', transfers: 'Transfers', royalties: 'Royalties', consumption: 'Government consumption', feeSubsidy: 'Fee subsidy', packSubsidy: 'Pack subsidy', outsideSubsidy: 'Outside subsidy', exitSubsidy: 'Exit subsidy', wealthSubsidy: 'Wealth subsidy', holdSubsidy: 'Holding subsidy', openingGrant: 'Opening grant' };
let GOV_ON = false; // a run with a government is shown (applyLayout keeps the panel hidden otherwise)
function govShow(on) { const p = $('govPanel'); GOV_ON = !!on; if (!p || p.hidden === !on) return; p.hidden = !on; if (typeof drawNav === 'function' && typeof ROWS !== 'undefined') drawNav(); }
const uiGovVal = (v) => (typeof v === 'number' ? (Math.abs(v) >= 1000 ? fmt(v) : String(+v.toPrecision(4))) : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));
function drawGov() {
  const P = $('govPanel'); if (!P || P.hidden || !seen('govPanel')) return; const n = nNow(), f = cur(), G = f?.gov, R = RUN?.gov || {}; if (!G) return;
  const t = f.t, D = (R.decisions || []).filter((d) => d.weekEffective <= t + 1), turns = D.filter((d) => d.type === 'turn');
  { const S = R.status || {}, lags = turns.slice(1).map((d) => d.lagWeeks).sort((a, b) => a - b), med = lags.length ? lags[lags.length >> 1] : null, live = mode === 'replay' && RUN?.meta?.source === 'regulate.mjs' && cursor >= FRAMES.length - 1 && window.LIVE_RUN;
    const st = live ? S.state || 'watching' : 'replay', since = S.since ? Math.round((Date.now() - S.since) / 1000) : null;
    const what = !live ? `replay of week ${t}` : st === 'thinking' ? `thinking for ${since} s (read week ${S.week})` : st === 'asleep' ? `asleep until week ${S.until}${S.when?.length ? ` or ${S.when.map((w) => `${w.field} ${w.op} ${w.value}`).join(', ')}` : ''}` : st === 'unavailable' ? `unavailable (${esc(S.error || 'usage window')}); the world runs on its last settings` : st === 'error' ? `last turn failed (${esc(S.error || '')}); retried on the next wake` : st;
    const c = R.clock || {}; $('govStatus').html = `<span class="gov__chip" data-s="${live ? esc(st) : 'replay'}">${esc(live ? st : 'Replay')}</span><span>${what}</span><span>pace <b>${R.lockstep != null ? `lockstep ${R.lockstep}` : R.pace ? `${R.pace} s a week` : 'no clock'}</b></span>${c.behindMs != null ? `<span>behind the clock <b>${fmt(c.behindMs / 1000)} s</b> over ${fmt(c.slowWeeks)} slow weeks</span>` : ''}<span>turns <b>${turns.length}</b></span><span>median lag <b>${med == null ? '–' : `${med} wk`}</b></span>${(R.governments || []).length > 1 ? `<span>government <b>${esc(R.governments.filter((g) => g.from <= t).at(-1)?.id || '')}</b> of ${R.governments.length}</span>` : ''}`; }
  { const cash = f.h?.money ?? 0, cards = f.mkt?.mcap ?? 0, share = G.T / Math.max(1, cash + G.T + cards), ap = G.approval;
    const tiles = [['Treasury', fmt(G.T)], ['Own account', fmt(G.acct)], ['Revenue this week', fmt(G.rev)], ['Spending this week', fmt(G.spend)], ['Paid of what was owed', G.frac ? pct(Math.min(...Object.values(G.frac))) : '–'], ['Treasury share (cards at marks)', pct(share)], ['Board tone', G.board ? (G.board.tone >= 0 ? '+' : '') + G.board.tone.toFixed(2) : '–'], ...(ap ? [['Approval so far', ap.share == null ? '–' : pct(ap.share)]] : [])];
    $('govStats').html = tiles.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join(''); }
  const T = FRAMES.map((x) => x.gov?.T ?? null), A = FRAMES.map((x) => x.gov?.acct ?? null);
  line('govT', [{ data: T, color: SYS.blue, fill: true }, { data: A, color: SYS.orange }], { fy: fmt, min: 0 });
  line('govRS', [{ data: FRAMES.map((x) => x.gov?.rev ?? null), color: SYS.green }, { data: FRAMES.map((x) => x.gov?.spend ?? null), color: SYS.pink }, { data: FRAMES.map((x) => (x.gov ? -(x.gov.lines?.consumption || 0) : null)), color: SYS.orange, dash: true }], { fy: fmt, min: 0 });
  { const c = charts.govT, cv = $('govT'); if (c && c.X && turns.length) { const x = cv.getContext('2d'), d = window.devicePixelRatio || 1; x.save(); x.setTransform(d, 0, 0, d, 0, 0); const Ht = cv.getBoundingClientRect().height; x.fillStyle = ink(0.35);
    for (const e of turns) { const i = FRAMES.findIndex((q) => q.t === e.weekEffective); if (i >= 0 && i < n) x.fillRect(Math.round(c.X(i)), Ht - c.pad.b - 6, 1, 6); } x.restore(); } }
  { const sum = (from) => { const o = {}; for (let i = Math.max(0, from); i < n; i++) for (const [k, v] of Object.entries(FRAMES[i].gov?.lines || {})) o[k] = (o[k] || 0) + v; return o; }, a = G.lines || {}, b = sum(n - 20), c = sum(0);
    const keys = [...new Set([...Object.keys(c)])].sort((p, q) => (UI_GOV_REV.has(q) - UI_GOV_REV.has(p)) || Math.abs(c[q]) - Math.abs(c[p]));
    $('govLines').tBodies[0].html = keys.map((k) => `<tr class="${UI_GOV_REV.has(k) ? 'rev' : k === 'consumption' ? 'co' : k === 'openingGrant' ? '' : 'sp'}"><td>${esc(UI_GOV_NAME[k] || k)}</td><td class="num">${fmt(a[k] || 0)}</td><td class="num">${fmt(b[k] || 0)}</td><td class="num">${fmt(c[k] || 0)}</td></tr>`).join('') || '<tr><td colspan="4" class="note">No ledger lines yet.</td></tr>'; }
  $('govComm').html = turns.slice(-40).reverse().map((d) => `<div class="gov__item"><time>W${d.weekRead} → W${d.weekEffective}${d.gov && (R.governments || []).length > 1 ? ` · ${esc(d.gov)}` : ''}${d.budgetDay ? ' · budget day' : ''}</time>${d.commentary ? `<p>${esc(d.commentary)}</p>` : ''}<span class="note">${d.changes?.length ? d.changes.map((c) => esc(c.dial)).join(', ') : 'no changes'}${d.errors?.length ? ` · <span class="err">${d.errors.length} rejected: ${d.errors.map((e) => esc(e.dial ?? 'controls')).join(', ')}</span>` : ''}${d.facts && !d.facts.ok ? ` · <span class="err">turn failed</span>` : ''}</span></div>`).join('') || '<p class="note">No turns yet.</p>';
  $('govBoard').html = turns.filter((d) => d.board?.text).slice(-30).reverse().map((d) => { const p = d.board.parsed || {}; const ment = (p.mentions || []).map((m) => `${esc(m.name)} ${m.dir > 0 ? '▲' : m.dir < 0 ? '▼' : '·'}`).join(', '); const dl = Object.entries(p.dials || {}).map(([k, v]) => `${esc(k)} ${v > 0 ? '▲' : '▼'}`).join(', ');
    return `<div class="gov__item"><time>W${d.weekEffective}</time><p>${esc(d.board.text)}</p><span class="note">tone ${(p.tone ?? 0).toFixed(2)}${ment ? ` · players: ${ment}` : ''}${dl ? ` · dials: ${dl}` : ''}</span></div>`; }).join('') || '<p class="note">Nothing posted yet.</p>';
  { const V = (R.nbVersions || []).filter((v) => v.week <= t + 1), cur1 = V.at(-1), prev = cur1 ? V.slice(0, -1).reverse().find((v) => v.gov === cur1.gov) : null, old = new Set((prev?.text || '').split('\n'));
    $('govNbNote').textContent = cur1 ? `${cur1.gov} · as of week ${cur1.week} · ${cur1.text.length.toLocaleString()} characters · new lines marked` : 'its own file · new lines marked';
    $('govNb').html = cur1 ? cur1.text.split('\n').map((l) => (l && !old.has(l) ? `<span class="new">${esc(l)}</span>` : esc(l))).join('\n') : '<span class="note">Empty.</span>'; }
  $('govDials').html = D.flatMap((d) => (d.changes || []).map((c) => [d.weekEffective, c, d.type === 'arm' ? d.arm : d.gov])).slice(-200).reverse().map(([w, c, who]) => `<div class="gov__dial"><time>W${w}</time><code>${esc(c.dial)}</code><span>${esc(uiGovVal(c.old))} → ${esc(uiGovVal(c.new))}</span></div>`).join('') || '<p class="note">No dial changed yet.</p>';
}
/* ---------- Start ---------- */
// Live AI run: the runner (node run.mjs --serve PORT) serves this page with window.LIVE_RUN set. New weeks stream in
// every few seconds; the view follows the newest week unless it has been scrubbed back.
async function followLive(url) {
  let run = null;
  const pull = async () => {
    try {
      const r = await fetch(`${url}?since=${run ? FRAMES.length : 0}`, { cache: 'no-store' }); const d = await r.json();
      if (!run) { if (!d.frames.length) throw new Error('no weeks yet'); run = { meta: d.meta, config: d.config, frames: d.frames, memos: d.memos, gov: d.gov }; startReplay(run); cursor = FRAMES.length - 1; setPlay(false); redrawAll(); }
      else if (d.frames.length) { const following = cursor >= FRAMES.length - 1; for (const f of d.frames) { run.frames.push(f); pushFrame(f); for (const [s2, b2] of f.arcs || []) arcs.push({ s: s2, b: b2, age: 0 }); } run.meta = d.meta; run.memos = d.memos; if (d.gov) run.gov = d.gov; if (following) cursor = FRAMES.length - 1; drawCharts(); drawPanels(); }
      const m = d.meta || {}; if (m.source === 'regulate.mjs') $('hyp').innerHTML = `<b>Live government run ${esc(m.id || '')}.</b> Week ${FRAMES.length - 1} · government ${esc(m.government || '')} · ${(d.gov?.decisions || []).filter((x) => x.type === 'turn').length} turns · pace ${m.pace ? `${m.pace} s a week` : 'no clock'}. The view follows the newest week; its panel is under Government.`; else $('hyp').innerHTML = `<b>Live AI run ${esc(m.id || '')}.</b> Week ${FRAMES.length - 1} of ${m.weeksPlanned} · ${m.calls} decisions · ${m.errors} errors · $${(m.costUsd || 0).toFixed(2)} list-price usage${m.stopped ? ` · stopped: ${esc(m.stopped)}` : ''}. The view follows the newest week.`;
    } catch (err) { $('hyp').innerHTML = `<b>Waiting for the run…</b> (${esc(err.message)})`; }
    setTimeout(pull, 3000);
  };
  pull();
}
setPlay(playing);
if (window.LIVE_RUN) followLive(window.LIVE_RUN); else startLive();
requestAnimationFrame(loop);
document.addEventListener('visibilitychange', () => { if (mode === 'live') tell({ cmd: 'hidden', v: document.hidden }); });
window.addEventListener('resize', () => { drawCharts(); drawPanels(); });

/* ---------- Layout: reorder rows, minimize or hide any panel (kept in this browser) ---------- */
const LAYOUT_KEY = 'tf-layout-v1';
const slug = (t) => (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const panelKey = (p) => p.getAttribute('aria-labelledby') || 'p-' + slug(p.querySelector('h2')?.textContent);
const panelName = (p) => p.classList.contains('chartp') ? 'Chart' : (p.querySelector('h2')?.firstChild?.textContent || p.querySelector('h2')?.textContent || 'Panel').trim();
const WRAP = document.querySelector('.wrap'), FIRST_ROW = $('tape'); const BEFORE_ROWS = FIRST_ROW.previousElementSibling; // the status bar: rows always come after it
// Rows: everything from the ticker down (the status bar stays pinned at the top)
const ROWS = (() => { const out = []; let on = false; for (const el of [...WRAP.children]) { if (el === FIRST_ROW) on = true; if (!on || el.id === 'layoutP') continue; const key = el.id || el.querySelector('[aria-labelledby]')?.getAttribute('aria-labelledby') || (el.matches('section') ? panelKey(el) : 'r-' + slug(el.className)); el.dataset.row = key; out.push(el); } return out; })();
const rowName = (r) => { const ps = r.matches('section.panel') ? [r] : [...r.querySelectorAll('section.panel')]; if (ps.length) return ps.map(panelName).join(' · '); return { tape: 'Ticker', mvc: 'Most valuable cards' }[r.id] || (r.classList.contains('kpis') ? 'Key numbers' : r.className); };
const panelsOf = (r) => (r.matches('section.panel') ? [r] : [...r.querySelectorAll('section.panel')]);
let LAY = { order: [], hideRow: [], hide: [], min: [] };
try { const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null'); if (v && Array.isArray(v.order)) LAY = { order: v.order, hideRow: v.hideRow || [], hide: v.hide || [], min: v.min || [] }; } catch {}
const saveLay = () => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(LAY)); } catch {} };
function applyLayout() {
  const keys = ROWS.map((r) => r.dataset.row), order = [...LAY.order.filter((k) => keys.includes(k)), ...keys.filter((k) => !LAY.order.includes(k))];
  const byKey = new Map(ROWS.map((r) => [r.dataset.row, r]));
  let prev = BEFORE_ROWS; for (const k of order) { const r = byKey.get(k); if (prev.nextElementSibling !== r) prev.after(r); prev = r; }
  for (const r of ROWS) {
    const ps = panelsOf(r); let vis = 0;
    for (const p of ps) { const k = panelKey(p), h = LAY.hide.includes(k); p.hidden = h; p.classList.toggle('min', LAY.min.includes(k)); if (!h) vis++; }
    r.hidden = LAY.hideRow.includes(r.dataset.row) || (ps.length > 0 && vis === 0);
    if (r.classList.contains('grid') || r.classList.contains('desk') || r.classList.contains('movers')) { r.classList.remove('n1', 'n2', 'n3', 'n4', 'n5'); const top = [...r.children].filter((c) => !c.hidden && !(c.classList.contains('stack') && panelsOf(c).every((p) => p.hidden))); for (const c of r.children) if (c.classList.contains('stack')) c.hidden = panelsOf(c).every((p) => p.hidden); if (top.length < r.children.length) r.classList.add('n' + Math.max(1, top.length)); }
  }
  { const gp = $('govPanel'); if (gp && !GOV_ON) gp.hidden = true; } // only a run with a government shows its panel
  ACCT_UI.weeks = 8; wake = true; drawLayoutPanel(); drawNav();
}
function moveRow(key, d) { const keys = [...WRAP.children].filter((el) => el.dataset.row).map((el) => el.dataset.row), i = keys.indexOf(key), j = i + d; if (i < 0 || j < 0 || j >= keys.length) return; [keys[i], keys[j]] = [keys[j], keys[i]]; LAY.order = keys; saveLay(); applyLayout(); }
const toggleIn = (arr, k) => { const i = arr.indexOf(k); i >= 0 ? arr.splice(i, 1) : arr.push(k); };
// The small controls on every panel: move its row up or down, minimize to the title, hide
for (const p of document.querySelectorAll('section.panel')) {
  const host = p.querySelector(':scope > .head') || p.querySelector(':scope > .chhead .chhead__id') || p; const k = panelKey(p);
  host.insertAdjacentHTML('beforeend', `<span class="pctl" role="group" aria-label="Arrange ${esc(panelName(p))}"><button type="button" data-lay="up" data-k="${k}" title="Move this row up" aria-label="Move up">▲</button><button type="button" data-lay="down" data-k="${k}" title="Move this row down" aria-label="Move down">▼</button><button type="button" data-lay="min" data-k="${k}" title="Minimize to the title" aria-label="Minimize">–</button><button type="button" data-lay="hide" data-k="${k}" title="Hide (bring it back from Layout)" aria-label="Hide">×</button></span>`);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lay]'); if (!b) return; e.stopPropagation();
  const k = b.dataset.k, act = b.dataset.lay, p = [...document.querySelectorAll('section.panel')].find((x) => panelKey(x) === k), row = p?.closest('[data-row]') || ROWS.find((r) => r.dataset.row === k);
  if (act === 'up' || act === 'down') { if (row) moveRow(row.dataset.row, act === 'up' ? -1 : 1); return; }
  if (act === 'min') toggleIn(LAY.min, k); else if (act === 'hide') toggleIn(LAY.hide, k); else if (act === 'row') toggleIn(LAY.hideRow, k);
  else if (act === 'rup' || act === 'rdown') { moveRow(k, act === 'rup' ? -1 : 1); return; }
  else if (act === 'reset') LAY = { order: [], hideRow: [], hide: [], min: [] };
  else if (act === 'showall') { LAY.hide = []; LAY.hideRow = []; LAY.min = []; }
  else if (act === 'minall') LAY.min = [...document.querySelectorAll('section.panel')].map(panelKey);
  saveLay(); applyLayout();
}, true);
function drawLayoutPanel() {
  const host = $('layoutP'); if (host.hidden) return;
  const rows = [...WRAP.children].filter((el) => el.dataset.row);
  host.innerHTML = `<div class="lay__head"><b>Layout</b><span class="note">order the rows, show, minimize or hide any panel · saved in this browser</span><span class="lay__acts"><button type="button" data-lay="showall">Show everything</button><button type="button" data-lay="minall">Minimize all</button><button type="button" data-lay="reset">Reset</button></span></div>
  <ol class="lay__rows">${rows.map((r, i) => { const ps = panelsOf(r), k = r.dataset.row, off = LAY.hideRow.includes(k);
    return `<li class="${r.hidden ? 'off' : ''}"><span class="lay__mv"><button type="button" data-lay="rup" data-k="${k}" ${i ? '' : 'disabled'} aria-label="Move up">▲</button><button type="button" data-lay="rdown" data-k="${k}" ${i < rows.length - 1 ? '' : 'disabled'} aria-label="Move down">▼</button></span>
    ${ps.length > 1 || !ps.length ? `<label class="lay__row"><input type="checkbox" data-lay="row" data-k="${k}" ${off ? '' : 'checked'}> <b>${esc(ps.length ? 'Row' : rowName(r))}</b></label>` : ''}
    <span class="lay__ps">${ps.map((p) => { const pk = panelKey(p); return `<span class="lay__p${LAY.hide.includes(pk) ? ' off' : ''}"><label><input type="checkbox" data-lay="hide" data-k="${pk}" ${LAY.hide.includes(pk) ? '' : 'checked'}> ${esc(panelName(p))}</label><button type="button" data-lay="min" data-k="${pk}" aria-pressed="${LAY.min.includes(pk)}" title="Minimize to the title">${LAY.min.includes(pk) ? 'open' : 'min'}</button></span>`; }).join('')}</span></li>`; }).join('')}</ol>`;
}
$('layoutBtn').addEventListener('click', () => { const open = !$('layoutP')._open; if (open) { $('layoutP').hidden = false; drawLayoutPanel(); } sheet($('layoutP'), open); $('layoutBtn').setAttribute('aria-expanded', String(open));  });
applyLayout();

/* ---------- Rules panel: show a control only when its rule is on; mark what differs from the defaults ---------- */
const ctlVal = (k) => { const el = $(k); return el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : +el.value * SLIDERS[k][0]; };
function rulesUi() {
  for (const el of document.querySelectorAll('#rules [data-when]')) el.hidden = !el.dataset.when.split('&').every((c) => { const ne = c.includes('!='), [k, v] = c.split(ne ? '!=' : '='), x = $(k); return v == null ? x.checked : ne ? x.value !== v : x.value === v; });
  for (const k of [...Object.keys(SLIDERS), ...TOGGLES, ...SELECTS]) {
    const el = $(k), d = DEFAULTS[k]; if (!el || d === undefined) continue; const v = ctlVal(k);
    const diff = typeof d === 'number' && SLIDERS[k] ? Math.abs(v - d) > ((+el.step || 1) * SLIDERS[k][0]) / 2 : String(v) !== String(d); // a select holds strings (botScale's default is the number 1)
    el.closest('.slider, .mech, .toggle')?.classList.toggle('chg', diff);
  }
}
$('rules').addEventListener('input', rulesUi); $('rules').addEventListener('change', rulesUi);
$('rulesReset').addEventListener('click', () => {
  for (const k of [...Object.keys(SLIDERS), ...TOGGLES, ...SELECTS]) {
    const el = $(k), d = DEFAULTS[k]; if (!el || d === undefined || ctlVal(k) === d) continue;
    if (el.type === 'checkbox') el.checked = !!d; else if (el.tagName === 'SELECT') el.value = d; else { el.value = Math.round((d / SLIDERS[k][0]) * 100) / 100; $(k + 'V').textContent = SLIDERS[k][1](+el.value); }
    opts[k] = d; if (mode === 'live') { tell({ cmd: 'cfg', k, v: d }); logChange(k, d); }
  }
  rulesUi();
});
rulesUi();

/* ---------- Health board (docs/health-board-spec.md): display only, nothing in the world reads it ---------- */
// Every threshold, in one place. good: which way turns a light green. alarm: red whatever the trend (the lamp pulses).
// healthy: inside it (and not getting worse) the light is green even when flat. deadband: a change between the 4- and
// 12-week averages smaller than this (relative) counts as flat.
const HEALTH = {
  deadband: 0.05, // and each light's `flat`: an absolute change smaller than it is flat too (so 0.01% vs 0.02% leverage isn't 'worse')
  minWeeks: 12,
  alertCooldown: 8, // weeks before the same light can raise another alert
  lights: [
    { key: 'coins', group: 'Activity', label: 'Coins changing hands', good: 'up', alarm: { rel52: 0.25 }, fmt: (v) => fmt(v), why: 'coins in trades and card auctions this week', get: (f) => (f.ord ? f.ord.coins || 0 : null) }, // ord.coins already includes card auction sales
    { key: 'sales', flat: 2, group: 'Activity', label: 'Sales', good: 'up', alarm: { rel52: 0.25 }, fmt: (v) => fmt(v), why: 'trades plus card auction sales this week', get: (f) => f.h?.trades ?? null },
    { key: 'bidask', flat: 0.005, group: 'Activity', label: 'Bids ÷ offers', good: 'up', alarm: { below: 0.05 }, healthy: [0.3, 3], fmt: (v) => v.toFixed(v < 0.1 ? 3 : 2), why: 'unfilled bids for every unfilled offer', get: (f) => (f.ord?.asks ? f.ord.bids / f.ord.asks : null) },
    { key: 'fire', flat: 0.005, group: 'Prices', label: 'Fire sales', good: 'down', alarm: { above: 0.05 }, healthy: [0, 0.01], fmt: (v) => pct(v), why: 'card auctions sold for under 30% (fireShare) of the card\'s mark the week before', get: (f) => (f.ord && 'aucSold' in f.ord ? ((f.ord.aucCardSold ?? f.ord.aucSold) ? f.ord.aucFree / (f.ord.aucCardSold ?? f.ord.aucSold) : 0) : null) },
    { key: 'vsmark', flat: 0.03, group: 'Prices', label: 'Sale vs quote', good: 'toward1', alarm: { below: 0.6 }, healthy: [0.85, 1.15], fmt: (v) => v.toFixed(2) + '×', why: 'median auction price ÷ the card’s mark the week before', get: (f) => f.ord?.aucVsMark ?? null },
    { key: 'pidx', group: 'Prices', label: 'Price index', good: 'up', alarm: { fall8: 0.3 }, fmt: (v) => v.toFixed(0), why: 'the Vault index (trades and auctions)', get: (f) => f.h?.p ?? null },
    { key: 'gap', flat: 0.03, group: 'Prices', label: 'Marks vs sales gap', good: 'toward1', alarm: { above: 1.5, below: 0.67 }, healthy: [0.9, 1.1], fmt: (v) => v.toFixed(2) + '×', why: 'marks index ÷ Vault index', get: (f) => (f.h?.pMark != null && f.h?.p ? f.h.pMark / f.h.p : null) },
    { key: 'liq', flat: 0.005, group: 'Money', label: 'Liquidity', good: 'up', alarm: { below: 0.02 }, healthy: [0.05, 0.3], fmt: (v) => pct(v), why: 'coins held ÷ market value of all cards', get: (f) => (f.mkt?.mcap ? f.mkt.cash / f.mkt.mcap : null) },
    { key: 'broke', flat: 0.01, group: 'Money', label: 'Broke bots', good: 'down', alarm: { above: 0.25 }, healthy: [0, 0.05], fmt: (v) => pct(v), why: 'bots that couldn’t pay their living costs this week', get: (f) => (f.mkt && f.bots?.length ? (f.mkt.broke || 0) / f.bots.length : null) },
    { key: 'supply', flat: 0.002, group: 'Money', label: 'Money supply', good: 'toward0', alarm: { below: -0.03, above: 0.05 }, healthy: [-0.01, 0.02], fmt: (v) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%/wk', why: 'net new coins this week ÷ coins held', get: (f) => (f.money && f.mkt?.cash ? f.money.net / f.mkt.cash : null) },
    { key: 'cashconc', flat: 0.01, group: 'Money', label: 'Cash concentration', good: 'down', alarm: { above: 0.6 }, healthy: [0, 0.35], fmt: (v) => pct(v), why: 'share of all cash held by the 10% with the most cash', get: (f) => f.mkt?.cashTop10 ?? null },
    { key: 'lev', flat: 0.01, group: 'Credit', label: 'Leverage', good: 'down', alarm: { above: 0.25 }, healthy: [0, 0.1], fmt: (v) => pct(v), why: 'debt ÷ market value', get: (f) => (f.mkt?.mcap ? (f.mkt.debt || 0) / f.mkt.mcap : null) },
    { key: 'distress', flat: 1, group: 'Credit', label: 'Distress', good: 'down', alarm: { avg4Above: 10 }, healthy: [0, 2], fmt: (v) => v.toFixed(0), why: 'margin calls plus defaults this week', get: (f) => (f.mkt ? (f.mkt.calls || 0) + (f.mkt.defaults || 0) : null) },
    { key: 'forcedSh', flat: 0.02, group: 'Credit', label: 'Forced sales', good: 'down', alarm: { above: 0.4 }, healthy: [0, 0.1], fmt: (v) => pct(v), why: 'share of sales that were forced', get: (f) => (f.forced && f.h?.trades ? Math.min(1, Object.values(f.forced).reduce((a, b) => a + b, 0) / f.h.trades) : null) },
    { key: 'gini', flat: 0.01, group: 'Fairness', label: 'Inequality', good: 'down', alarm: { above: 0.55 }, healthy: [0, 0.35], fmt: (v) => v.toFixed(2), why: 'Gini of worth', get: (f) => f.h?.gini ?? null },
    { key: 'bottom', flat: 0.01, group: 'Fairness', label: 'Bottom half', good: 'up', alarm: { below: 0.15 }, healthy: [0.25, 1], fmt: (v) => pct(v), why: 'wealth share of the poorer 50%', get: (f) => f.h?.share?.[2] ?? null },
    { key: 'follow', flat: 0.05, group: 'Football', label: 'Prices follow the football', hidden: true, good: 'up', alarm: { below: 0 }, healthy: [0.4, 1], fmt: (v) => v.toFixed(2), why: 'correlation across players of 20-week price change with 20-week value change (uses hidden value)', get: (f, i) => followCorr(i) },
    { key: 'pv', flat: 0.03, group: 'Football', label: 'Price ÷ value', hidden: true, good: 'toward1', alarm: { above: 2, below: 0.5 }, healthy: [0.8, 1.25], fmt: (v) => v.toFixed(2) + '×', why: 'card prices ÷ hidden value (uses hidden value)', get: (f) => f.h?.bub ?? null },
    { key: 'persist', flat: 0.05, group: 'Bots', label: 'Skill carries over', good: 'up', alarm: { below: 0 }, healthy: [0.2, 1], fmt: (v) => v.toFixed(2), why: 'rank correlation of bots’ returns between the last two generations', get: (f) => f.persist ?? null },
    { key: 'pop', flat: 2, group: 'Bots', label: 'Joiners − leavers', good: 'up', alarm: { leftShare20: 0.1 }, fmt: (v) => (v >= 0 ? '+' : '') + v.toFixed(0), why: 'bots joining minus bots leaving over 20 weeks', get: (f, i) => { if (i < 19) return null; let j = 0, l = 0; for (let k = i - 19; k <= i; k++) { j += FRAMES[k].people?.joined || 0; l += FRAMES[k].people?.left || 0; } return j - l; } },
  ],
};
const HGROUPS = [...new Set(HEALTH.lights.map((L) => L.group))];
function followCorr(i) {
  if (i < 20) return null; const a = FRAMES[i], b = FRAMES[i - 20]; const va = valuesAt(i), vb = valuesAt(i - 20); if (!a?.prices || !b?.prices || !va || !vb) return null;
  const xs = []; for (let k = 0; k < a.prices.length; k++) { const p1 = a.prices[k], p0 = b.prices[k], v1 = va[k], v0 = vb[k]; if (p1 > 0 && p0 > 0 && v1 > 0 && v0 > 0) xs.push([Math.log(p1 / p0), Math.log(v1 / v0)]); }
  if (xs.length < 10) return null; const n = xs.length, mx = xs.reduce((s, x) => s + x[0], 0) / n, my = xs.reduce((s, x) => s + x[1], 0) / n; let sxy = 0, sxx = 0, syy = 0; for (const [x, y] of xs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
function valuesAt(i) { for (let k = i; k >= 0; k--) if (FRAMES[k]?.values) return FRAMES[k].values; return null; }
const hval = (L, i) => { const f = FRAMES[i]; if (!f) return null; const c = (f._hv ||= {}); if (L.key in c) return c[L.key]; const v = L.get(f, i); return (c[L.key] = v == null || !isFinite(v) ? null : v); };
// A light's state at week index i: 'g' green, 'r' red, 'a' red in its alarm zone, 'o' off, 'n' not enough data. Cached on the frame.
function lightAt(L, i) {
  const f = FRAMES[i]; if (!f) return { s: 'n' }; const c = (f._hl ||= {}); if (c[L.key]) return c[L.key];
  const x = hval(L, i); if (x == null || i < HEALTH.minWeeks - 1) return (c[L.key] = { s: 'n', x });
  const win = (k) => { const xs = []; for (let j = i - k + 1; j <= i; j++) { const v = hval(L, j); if (v != null) xs.push(v); } return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const a4 = win(4), a12 = win(12), db = HEALTH.deadband; let trend = 0;
  if (a4 != null && a12 != null) {
    if (L.flat != null && Math.abs(a4 - a12) < L.flat) trend = 0;
    else if (L.good === 'up' || L.good === 'down') { const rel = (a4 - a12) / Math.max(1e-9, Math.abs(a12)); trend = Math.abs(rel) < db ? 0 : (rel > 0) === (L.good === 'up') ? 1 : -1; }
    else { const t = L.good === 'toward1' ? 1 : 0, d4 = Math.abs(a4 - t), d12 = Math.abs(a12 - t), ch = (d12 - d4) / Math.max(0.05, d12); trend = Math.abs(ch) < db ? 0 : ch > 0 ? 1 : -1; }
  }
  const A = L.alarm || {}; let alarm = null;
  if (A.above != null && x > A.above) alarm = `above ${L.fmt(A.above)}`; if (A.below != null && x < A.below) alarm = `under ${L.fmt(A.below)}`;
  if (A.avg4Above != null && a4 != null && a4 >= A.avg4Above) alarm = `4-week average ${a4.toFixed(1)}, alarm at ${A.avg4Above}`;
  if (A.rel52 != null) { let hi = 0; for (let j = Math.max(0, i - 51); j <= i; j++) { const v = hval(L, j); if (v != null && v > hi) hi = v; } if (hi > 0 && x < A.rel52 * hi) alarm = `under ${Math.round(A.rel52 * 100)}% of its 52-week high`; }
  if (A.fall8 != null && i >= 8) { const p8 = hval(L, i - 8); if (p8 > 0 && x < p8 * (1 - A.fall8)) alarm = `fell ${Math.round((1 - x / p8) * 100)}% in 8 weeks`; }
  if (A.leftShare20 != null && i >= 19) { let left = 0; for (let k = i - 19; k <= i; k++) left += FRAMES[k].people?.left || 0; const n = f.bots?.length || 1; if (left > A.leftShare20 * n) alarm = `${left} bots left in 20 weeks`; }
  const inHealthy = L.healthy && x >= L.healthy[0] && x <= L.healthy[1];
  const s = alarm ? 'a' : trend < 0 ? 'r' : inHealthy || trend > 0 ? 'g' : 'o';
  return (c[L.key] = { s, x, trend, alarm });
}
const HL_RANK = { a: 4, r: 3, o: 1, g: 0, n: -1 };
// Each light is also a chart: clicking it charts its weekly value like the indicator tiles
for (const L of HEALTH.lights) METRICS.push({ key: 'hl_' + L.key, label: L.label, desc: L.why, get: (f, i) => hval(L, i), show: L.fmt });
function drawHealth() {
  const host = $('hbGroups'); if (!host || !seen('healthPanel') && host.dataset.built) return; const i = ix(); if (i == null || !FRAMES[i]) return;
  const st = HEALTH.lights.map((L) => [L, lightAt(L, i)]);
  const reds = st.filter(([, s]) => s.s === 'a' || s.s === 'r').sort((a, b) => HL_RANK[b[1].s] - HL_RANK[a[1].s]), alarms = st.filter(([, s]) => s.s === 'a').length, greens = st.filter(([, s]) => s.s === 'g').length, known = st.filter(([, s]) => s.s !== 'n').length;
  const overall = alarms || reds.length >= 3 ? 'r' : !reds.length && greens > known / 2 ? 'g' : 'o';
  $('hbTop').html = `<span class="lamp lamp--${overall}${overall === 'r' && alarms ? ' lamp--pulse' : ''}" aria-hidden="true"></span><b>${overall === 'r' ? 'Warning' : overall === 'g' ? 'Healthy' : 'Watch'}</b><span class="note">${reds.length ? reds.slice(0, 5).map(([L, s]) => `${L.label.toLowerCase()} ${L.fmt(s.x)}`).join(', ') : 'no lights red'}</span>`;
  const mark = (s) => (s.s === 'g' ? (s.trend > 0 ? '▲' : '✓') : s.s === 'a' ? '!' : s.s === 'r' ? '▼' : s.s === 'n' ? '' : '–');
  host.html = HGROUPS.map((g) => `<div class="hb__g"><h3>${g}${g === 'Football' ? '<span class="note"> uses hidden value</span>' : ''}</h3>${st.filter(([L]) => L.group === g).map(([L, s]) => {
    const val = s.s === 'n' ? 'n/a' : L.fmt(s.x), reason = s.s === 'n' ? 'not enough data yet' : s.s === 'a' ? `Red: ${L.why}, ${s.alarm}` : s.s === 'r' ? `Red: getting worse (4-week vs 12-week average)` : s.s === 'g' ? (s.trend > 0 ? 'Green: improving' : 'Green: in its healthy range') : 'Off: steady';
    return `<div class="hb__l" role="button" tabindex="0" data-metric="hl_${L.key}" title="${esc(L.label)}: ${esc(L.why)}. ${esc(reason)}"><span class="lamp lamp--${s.s === 'a' ? 'r' : s.s}${s.s === 'a' ? ' lamp--pulse' : ''}" aria-hidden="true"></span><span class="hb__name">${L.label}</span><span class="hb__v">${val} <i>${mark(s)}</i></span><small>${esc(reason)}</small></div>`; }).join('')}</div>`).join('');
  host.dataset.built = '1';
  // timeline strip: one row per group, each week colored by the group's worst light
  let cv = $('hbStripCv'); if (!cv) { $('hbStrip').innerHTML = '<canvas id="hbStripCv" aria-label="Each group’s worst light, week by week"></canvas>'; cv = $('hbStripCv'); cv.addEventListener('click', (e) => { if (mode !== 'replay') return; const r = cv.getBoundingClientRect(), k = Math.floor(((e.clientX - r.left - 70) / Math.max(1, r.width - 70)) * nNow()); if (k >= 0 && k < FRAMES.length) { cursor = k; drawCharts(); drawPanels(); } }); }
  const [x, Wd, Ht] = fit(cv); x.clearRect(0, 0, Wd, Ht); const n = nNow(), rh = Ht / HGROUPS.length, x0 = 70, w = (Wd - x0) / Math.max(1, n), COLS = { a: COL.down, r: rgba(COL.down, 0.55), o: COL.lampOff, g: COL.up, n: COL.lampNone };
  x.font = `600 10px ${css('--mono')}`; x.textBaseline = 'middle';
  HGROUPS.forEach((g, gi) => { x.fillStyle = COL.faint; x.fillText(g, 2, gi * rh + rh / 2); const Ls = HEALTH.lights.filter((L) => L.group === g);
    for (let k = 0; k < n; k++) { let worst = 'n'; for (const L of Ls) { const s = lightAt(L, k).s; if (HL_RANK[s] > HL_RANK[worst]) worst = s; } x.fillStyle = COLS[worst]; x.fillRect(x0 + k * w, gi * rh + 1, Math.max(1, w + 0.5), rh - 2); } });
  // alerts: each time a light turned red from green or off (one per light per cooldown)
  const alerts = [], last = {};
  for (let k = Math.max(1, n - 400); k < n; k++) for (const L of HEALTH.lights) { const s = lightAt(L, k), p = lightAt(L, k - 1); if ((s.s === 'a' || s.s === 'r') && (p.s === 'g' || p.s === 'o') && !(last[L.key] > k - HEALTH.alertCooldown)) { last[L.key] = k; alerts.push([FRAMES[k].t, L, s]); } }
  $('hbAlerts').html = alerts.slice(-6).reverse().map(([t, L, s]) => `<div class="ln"><time>W${t}</time><span class="tag k-credit">Health</span><div>${esc(L.label)} turned red: ${esc(L.fmt(s.x))}${s.alarm ? `, ${esc(s.alarm)}` : ''}</div></div>`).join('') || '<p class="note">No lights have turned red yet.</p>';
}

/* ---------- Sidebar: one link per row in the current layout order, the row in view marked; theme changes ---------- */
function drawNav() {
  const nav = $('sideNav'); if (!nav) return;
  const NAMES = { tape: 'Overview', 'w-h': 'Market desk', healthPanel: 'Health board', 'ln-h': 'League news', 'sec-h': 'Sectors', 'floor-h': 'Floor and leaderboard', 'hg-h': 'What they learned', 'tac-h': 'Tactics', 'hf-h': 'Prices and holdings', 'gt-h': 'Games, notes and wealth', 'ind-h': 'Indicators', 'map-h': 'Market map' };
  const SKIP = new Set(['r-kpis', 'mvc']); // the key numbers and top cards sit under Overview
  const rows = [...document.querySelector('.wrap').children].filter((el) => el.dataset.row && !el.hidden && !SKIP.has(el.dataset.row));
  nav.innerHTML = rows.map((r) => { const p = r.matches('section.panel') ? r : r.querySelector('section.panel'); const name = NAMES[r.dataset.row] || (p?.querySelector('h2')?.firstChild?.textContent || '').trim() || 'Section'; return `<a href="#" data-go="${esc(r.dataset.row)}" title="${esc(name)}"><span>${esc(name)}</span></a>`; }).join('');
  spyNav();
}
function spyNav() {
  const nav = $('sideNav'); if (!nav) return; let on = null;
  for (const a of nav.querySelectorAll('a')) { const r = document.querySelector(`[data-row="${CSS.escape(a.dataset.go)}"]`); if (r && r.getBoundingClientRect().top < 140) on = a; }
  on = on || nav.querySelector('a');
  for (const a of nav.querySelectorAll('a')) a.setAttribute('aria-current', String(a === on));
  // the status bar's glass takes a faint hue from the section in view
  if (on && on._go !== on.dataset.go) { on._go = on.dataset.go; const r = document.querySelector(`[data-row="${CSS.escape(on.dataset.go)}"]`); const hue = r && getComputedStyle(r).getPropertyValue('--tint').trim(); if (hue) $('status').style.setProperty('--hue', hue); }
}
$('sideNav')?.addEventListener('click', (e) => { const a = e.target.closest('a[data-go]'); if (!a) return; e.preventDefault(); if (typeof setSide === 'function' && NARROW.matches) setSide(false); const r = document.querySelector(`[data-row="${CSS.escape(a.dataset.go)}"]`); if (r) { r.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); const h = r.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } } });
{ let pend = false; addEventListener('scroll', () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; spyNav(); }); }, { passive: true }); }
drawNav();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { DRAWGEN++; readTheme(); UP = COL.up; DN = COL.down; drawScales(); scale('scaleMap', 'down', 'up', (t) => mapCol(((t * 2 - 1) * 0.2))); drawCharts(); drawPanels(); });

/* ---------- Controls: sliding segmented pills, filled sliders with a value bubble ---------- */
// Single-choice segmented controls get one pill that slides (and stretches) to the chosen option. The studies group
// allows several at once, so its buttons light up on their own.
function pillSeg(seg) {
  const pill = document.createElement('span'); pill.className = 'seg__pill'; pill.setAttribute('aria-hidden', 'true'); seg.prepend(pill); seg.classList.add('seg--pill');
  const place = () => { const b = seg.querySelector('button[aria-pressed="true"]'); if (!b || !b.offsetWidth) { pill.style.opacity = '0'; return; } pill.style.opacity = '1'; pill.style.width = b.offsetWidth + 'px'; pill.style.transform = `translateX(${b.offsetLeft}px)`; };
  place(); requestAnimationFrame(() => { place(); pill.classList.add('on'); });
  new MutationObserver(place).observe(seg, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
  if (typeof ResizeObserver === 'function') new ResizeObserver(place).observe(seg);
}
for (const seg of document.querySelectorAll('.seg')) if (seg.id !== 'studies') pillSeg(seg);
// Sliders: --p is how far the thumb is along, so the track fills up to it in the section's tint
const paintRange = (el) => { const lo = +el.min || 0, hi = +el.max || 100; el.style.setProperty('--p', `${(((+el.value - lo) / (hi - lo || 1)) * 100).toFixed(2)}%`); };
const paintRanges = () => document.querySelectorAll('input[type=range]').forEach(paintRange);
paintRanges();
{ const _sync = syncControls; syncControls = function () { _sync.apply(this, arguments); paintRanges(); }; }
{ const _ui = rulesUi; rulesUi = function () { _ui.apply(this, arguments); paintRanges(); }; }
{ // the value bubble over the thumb while dragging
  const bub = document.createElement('div'); bub.className = 'rbubble'; bub.setAttribute('aria-hidden', 'true'); document.body.appendChild(bub);
  let on = null;
  const place = () => { if (!on) return; const r = on.getBoundingClientRect(), lo = +on.min || 0, hi = +on.max || 100, t = (+on.value - lo) / (hi - lo || 1); bub.textContent = $(on.id + 'V')?.textContent || on.value; bub.style.left = r.left + 10 + t * (r.width - 20) + 'px'; bub.style.top = r.top + 'px'; };
  document.addEventListener('input', (e) => { if (e.target.matches?.('input[type=range]')) { paintRange(e.target); if (on === e.target) place(); } });
  document.addEventListener('pointerdown', (e) => { const el = e.target.closest?.('input[type=range]'); if (!el) return; on = el; bub.classList.add('on'); requestAnimationFrame(place); });
  const off = () => { on = null; bub.classList.remove('on'); };
  document.addEventListener('pointerup', off); document.addEventListener('pointercancel', off); addEventListener('scroll', () => on && place(), { passive: true });
}

/* ---------- Sidebar: collapsible to a rail of section dots; on narrow screens a sheet over the page ---------- */
const SIDE_KEY = 'tf-side-v1', NARROW = matchMedia('(max-width: 1099px)'), APP = document.querySelector('.app');
let sideCollapsed = false, sideOpen = false;
try { sideCollapsed = localStorage.getItem(SIDE_KEY) === 'collapsed'; } catch {}
{
  const icon = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><rect x="1.75" y="2.75" width="14.5" height="12.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6.75 3v12" stroke="currentColor" stroke-width="1.5"/><path d="M3.6 6h1.4M3.6 8.5h1.4M3.6 11h1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  const side = document.querySelector('.side'); side.id ||= 'side';
  side.insertAdjacentHTML('afterbegin', `<button type="button" class="side__toggle" id="sideToggle" aria-controls="${side.id}">${icon}</button>`);
  APP.insertAdjacentHTML('afterbegin', `<button type="button" class="side__fab" id="sideFab" aria-controls="${side.id}" aria-label="Show sections">${icon}</button><div class="side__scrim" aria-hidden="true"></div>`);
}
function setSide(v) { // v: expanded (wide) or open (narrow)
  if (NARROW.matches) sideOpen = v; else { sideCollapsed = !v; try { localStorage.setItem(SIDE_KEY, sideCollapsed ? 'collapsed' : 'open'); } catch {} }
  applySide();
}
function applySide() {
  const narrow = NARROW.matches, expanded = narrow ? sideOpen : !sideCollapsed;
  APP.classList.toggle('side--collapsed', !narrow && sideCollapsed); APP.classList.toggle('side--open', narrow && sideOpen);
  const label = expanded ? 'Hide sidebar' : 'Show sidebar', keys = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘\\' : 'Ctrl+\\';
  for (const b of [$('sideToggle'), $('sideFab')]) { b.setAttribute('aria-expanded', String(expanded)); b.setAttribute('aria-label', label); b.title = `${label} (${keys})`; }
  document.querySelector('.side').inert = narrow && !sideOpen;
}
$('sideToggle').addEventListener('click', () => setSide(NARROW.matches ? !sideOpen : sideCollapsed));
$('sideFab').addEventListener('click', () => setSide(!sideOpen));
document.querySelector('.side__scrim').addEventListener('click', () => setSide(false));
document.addEventListener('keydown', (e) => {
  if (e.key === '\\' && (e.metaKey || e.ctrlKey) && !e.altKey) { e.preventDefault(); setSide(NARROW.matches ? !sideOpen : sideCollapsed); }
  else if (e.key === 'Escape' && NARROW.matches && sideOpen) setSide(false);
});
NARROW.addEventListener('change', () => { sideOpen = false; applySide(); });
// The content widens with the sidebar's column; once it settles, the charts repaint at their new size
APP.addEventListener('transitionend', (e) => { if (e.target !== APP || e.propertyName !== 'grid-template-columns') return; DRAWGEN++; evenTiles(); drawCharts(); drawMain(); drawPanels(); });
applySide();
