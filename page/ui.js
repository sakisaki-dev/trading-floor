/* Page script for The Trading Floor. The engine (sandbox/engine.mjs) and LIBRARY are inlined above this at build time.
   Everything draws from FRAMES (one compact record per week, engine frame()): live mode appends one per tick, replay
   mode loads them from a run file written by sandbox/run.mjs. */

// Presets change the laws of the world only. Strategies are never assigned: every bot starts with random networks.
const PRESETS = {
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
const SOC = ['Sharer', 'Reciprocator', 'Thief'];
const TAGS = { season: 'Season', people: 'People', credit: 'Credit', fashion: 'Fashion', margin: 'Margin', start: 'Open', gen: 'Gen', evolve: 'Evolution', crash: 'Crash', bubble: 'Bubble', corner: 'Corner', flag: 'Flagged', pool: 'Pool', update: 'Update', auction: 'Auction', games: 'Games' };

const $ = (id) => document.getElementById(id);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const COL = {};
const L = (a, b, t) => a + (b - a) * t, C = (x, a, b) => Math.max(a, Math.min(b, x));
const fmt = (x) => (x == null || !isFinite(x) ? '–' : Math.abs(x) >= 1000 ? Math.round(x).toLocaleString() : Math.abs(x) >= 100 ? Math.round(x).toString() : x.toFixed(1));
const pct = (x) => (x == null || !isFinite(x) ? '–' : `${Math.round(x * 100)}%`);
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FAMS = familyList(LIBRARY);

/* ---------- State ---------- */
let opts = { seed: 88 }, presetKey = 'laws';
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
    if (m.type === 'detail' && mode === 'live') { drawDetail(); drawAcct(); }
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
let CHANGES = [];
const logChange = (k, v) => CHANGES.push({ week: FRAMES[FRAMES.length - 1]?.t ?? 0, rule: k, value: v });
function saveRun() {
  const clean = (f) => Object.fromEntries(Object.entries(f).filter(([k]) => !k.startsWith('_')));
  const t = FRAMES[FRAMES.length - 1]?.t ?? 0, src = mode === 'replay' ? RUN : null;
  const run = src ? { ...src, frames: src.frames.map(clean) } : { meta: { id: `page-seed${opts.seed}-${presetKey}-w${t}`, source: 'Trading Floor page', seed: opts.seed, preset: presetKey, presetRules: PRESETS[presetKey].set, startingRules: { ...opts }, changes: CHANGES, weeks: t, savedAt: new Date().toISOString(), aiBots: [] }, config: LIVECFG, frames: FRAMES.map(clean) };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(run)], { type: 'application/json' })); a.download = `${run.meta.id || 'run'}.json`; document.body.appendChild(a); a.click(); a.remove();
}
const sendSel = () => tell({ cmd: 'sel', p: SEL.type === 'card' ? SEL.id : null, b: ACCT });
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches, speed = 1, acc = 0, lastT = 0, panelT = 0, chartT = 0;
const KEYS = ['p', 'f', 'bub', 'gini', 'share', 'trades', 'pass', 'informed', 'flags', 'shares', 'thefts', 'gamePacks'];
function newHist() { H = Object.fromEntries(KEYS.map((k) => [k, []])); H.ticket = []; H.skill = []; H.mcap = []; H.vcap = []; H.cashTop = []; H.bank = []; }
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
function pushFrame(f) {
  FRAMES.push(f);
  for (const k of KEYS) H[k].push(f.h[k]);
  H.ticket.push(f.tickets ?? null);
  H.mcap.push(f.mkt?.mcap ?? null); H.vcap.push(f.mkt?.vcap ?? null); H.cashTop.push(f.mkt?.cashTop10 ?? null); H.bank.push(f.mkt?.bank ?? null);
  const g = gamesOver(FRAMES.length - 1, 4);
  H.skill.push(g.skill[1] ? g.skill[0] / g.skill[1] : null);
}
const gpw = () => (mode === 'replay' ? RUN.config.weeksPerGeneration : LIVECFG?.weeksPerGeneration ?? 20);
const when = (t) => (t ? `Week ${t}` : 'Start');
const cur = () => FRAMES[mode === 'replay' ? cursor : FRAMES.length - 1];
const nNow = () => (mode === 'replay' ? cursor + 1 : FRAMES.length);
function setPlay(v) { playing = v; $('play').textContent = v ? 'Pause' : 'Play'; if (mode === 'live') tell({ cmd: 'play', v }); }

function startLive() {
  mode = 'live'; RUN = null; $('liveBtn').hidden = true; $('runFile').value = '';
  startWorker(); LIVE = { p: null, b: null }; CHANGES = [];
  tell({ cmd: 'start', opts: { ...opts, ...PRESETS[presetKey].set }, playing, speed });
  $('hyp').innerHTML = PRESETS[presetKey].hyp; $('preset').value = presetKey;
}
function startReplay(run) {
  tell({ cmd: 'play', v: false }); mode = 'replay'; RUN = run; FRAMES = []; newHist();
  for (const f of run.frames) pushFrame(f);
  cursor = 0; $('liveBtn').hidden = false; setPlay(true);
  const ai = run.meta?.aiBots || [];
  $('hyp').innerHTML = run.meta?.source === 'Trading Floor page' ? `<b>Replay ${esc(run.meta.id)}.</b> ${run.frames.length - 1} weeks saved from the page · seed ${run.meta.seed} · ${run.meta.changes?.length || 0} rule changes while it ran.` : `<b>Replay ${esc(run.meta?.id || '')}.</b> ${run.frames.length - 1} weeks · ${ai.length} AI bots (${[...new Set(ai.map((b) => b.model))].map(esc).join(', ') || 'none'}) · $${(run.meta?.costUsd ?? 0).toFixed(2)} API cost. Hover a gold-ringed dot (an AI bot) for its memo.`;
  arcs = []; pos.clear(); redrawAll();
}

/* ---------- Canvas helpers ---------- */
function fit(cv) { const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; const w = Math.max(10, Math.round(r.width * d)), h = Math.max(10, Math.round(r.height * d)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } const x = cv.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return [x, r.width, r.height]; }
function placeTip(tip, cv, px, py) { const r = cv.getBoundingClientRect(), pr = cv.parentElement.getBoundingClientRect(); tip.style.left = C(px + (r.left - pr.left) + 12, 8, Math.max(8, pr.width - 250)) + 'px'; tip.style.top = C(py + (r.top - pr.top) + 12, 8, Math.max(8, pr.height - 100)) + 'px'; tip.hidden = false; }

/* ---------- Floor ---------- */
// A scatter of every bot: x = worth (log), y = the average OVR of the cards it holds (by value), colour = its return
// over the last 4 weeks. Nothing is grouped by strategy: no bot is given one.
const floor = $('floor'), floorTip = $('floorTip');
let dom = [2.5, 4], oDom = [60, 95], pos = new Map(), hover = null, arcs = [];
const retColor = (r) => divergeInv(C((r || 0) / 0.15, -1, 1));
const grpColor = (b) => GROUPS[b[17] ?? 2].color;
function drawFloor() {
  const f = cur(); if (!f) return;
  const [x, Wd, Ht] = fit(floor); x.clearRect(0, 0, Wd, Ht);
  const pad = { l: 34, r: 10, t: 8, b: 16 }, small = Wd < 560 ? 0.7 : 1;
  const vals = f.bots.map((b) => b[3]).filter((v) => v > 0), ovs = f.bots.map((b) => b[15]).filter((v) => v != null);
  if (vals.length) dom = [L(dom[0], Math.log10(Math.max(10, Math.min(...vals))), 0.08), L(dom[1], Math.log10(Math.max(...vals) * 1.05), 0.08)];
  if (ovs.length) oDom = [L(oDom[0], Math.min(...ovs) - 1, 0.08), L(oDom[1], Math.max(...ovs) + 1, 0.08)];
  const X = (v) => pad.l + ((Math.log10(Math.max(1, v)) - dom[0]) / Math.max(0.01, dom[1] - dom[0])) * (Wd - pad.l - pad.r);
  const Y = (o) => pad.t + (1 - ((o ?? oDom[0]) - oDom[0]) / Math.max(1, oDom[1] - oDom[0])) * (Ht - pad.t - pad.b);
  x.font = `500 10px ${css('--mono')}`;
  x.fillStyle = COL.faint; x.textBaseline = 'bottom';
  for (let e = Math.ceil(dom[0] * 2) / 2; e <= dom[1]; e += 0.5) { const v = 10 ** e, px = X(v); if (px < pad.l + 20 || px > Wd - 30) continue; x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(px, pad.t, 1, Ht - pad.t - pad.b); x.fillStyle = COL.faint; x.fillText(fmt(v), px + 3, Ht - 1); }
  x.textBaseline = 'middle'; x.textAlign = 'right';
  for (let o = Math.ceil(oDom[0] / 5) * 5; o <= oDom[1]; o += 5) { const py = Y(o); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(pad.l, py, Wd - pad.l - pad.r, 1); x.fillStyle = COL.faint; x.fillText(String(o), pad.l - 4, py); }
  x.textAlign = 'left'; x.fillStyle = COL.faint; x.textBaseline = 'top'; x.fillText('OVR held ↑', pad.l + 4, pad.t); x.textBaseline = 'bottom'; x.textAlign = 'right'; x.fillText('worth →', Wd - pad.r, Ht - pad.b - 2); x.textAlign = 'left';
  const ids = new Set();
  for (const b of f.bots) {
    const [id, , , w, n] = b; ids.add(id);
    const jit = (((id * 2654435761) % 1000) / 1000 - 0.5) * 6, ty = b[15] == null ? Ht - pad.b - 4 + jit / 3 : Y(b[15]) + jit;
    const p = pos.get(id) || { x: X(w), y: ty };
    p.x = L(p.x, X(w), 0.15); p.y = L(p.y, ty, 0.2); p.r = C(2 + Math.sqrt(n) * 0.35, 2.5, 8) * small * (b[9] ? 1.5 : 1); p.b = b; pos.set(id, p);
  }
  for (const id of [...pos.keys()]) if (!ids.has(id)) pos.delete(id);
  arcs = arcs.filter((a) => a.age < 36); x.lineWidth = 1;
  for (const a of arcs) { const s = pos.get(a.s), b = pos.get(a.b); a.age++; if (!s || !b) continue; x.strokeStyle = `rgba(238,241,250,${0.22 * (1 - a.age / 36)})`; x.beginPath(); x.moveTo(s.x, s.y); x.quadraticCurveTo((s.x + b.x) / 2, Math.min(s.y, b.y) - 24, b.x, b.y); x.stroke(); }
  for (const [id, p] of pos) {
    const b = p.b, col = retColor(b[16]);
    x.beginPath(); x.arc(p.x, p.y, p.r + 1.2, 0, Math.PI * 2); x.fillStyle = COL.panel; x.fill();
    x.beginPath(); x.arc(p.x, p.y, p.r, 0, Math.PI * 2); x.fillStyle = hover && hover !== id ? 'rgba(120,130,160,0.35)' : col; x.fill();
    if (b[9]) { x.strokeStyle = COL.gold; x.lineWidth = 1.6; x.beginPath(); x.arc(p.x, p.y, p.r + 2.5, 0, Math.PI * 2); x.stroke(); }
    if (b[5] === 2) { x.setLineDash([2, 2]); x.strokeStyle = COL.chalk; x.lineWidth = 1; x.beginPath(); x.arc(p.x, p.y, p.r + 2.5, 0, Math.PI * 2); x.stroke(); x.setLineDash([]); }
    if (b[6] >= 5) { x.strokeStyle = 'rgba(238,241,250,0.28)'; x.lineWidth = 1; x.beginPath(); x.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2); x.stroke(); }
    if (hover === id) { x.strokeStyle = COL.gold; x.lineWidth = 2; x.beginPath(); x.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2); x.stroke(); }
  }
}
const kindOf = (b) => (b[9] ? 'AI bot' : b[18] ? 'Neural bot' : 'Genome bot');
function floorPointer(e) {
  const r = floor.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null, bd = 196;
  for (const [id, p] of pos) { const d = (p.x - mx) ** 2 + (p.y - my) ** 2; if (d < bd) { bd = d; best = [id, p]; } }
  hover = best ? best[0] : null;
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
floor.addEventListener('pointerleave', () => { hover = null; floorTip.hidden = true; });

/* ---------- Line charts ---------- */
const charts = {};
function axes(x, Wd, Ht, pad, lo, hi, fy, n) {
  x.font = `500 10px ${css('--mono')}`; x.textBaseline = 'middle'; x.textAlign = 'right';
  for (let i = 0; i <= 3; i++) { const v = lo + ((hi - lo) * i) / 3, y = pad.t + (Ht - pad.t - pad.b) * (1 - i / 3); x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(pad.l, Math.round(y), Wd - pad.l - pad.r, 1); x.fillStyle = COL.faint; x.fillText(fy(v), pad.l - 5, y); }
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  for (let t = gpw(); t < n; t += gpw()) { const px = pad.l + ((Wd - pad.l - pad.r) * t) / Math.max(1, n - 1); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(px, pad.t, 1, Ht - pad.t - pad.b); }
  if (n > 1) { x.fillStyle = COL.faint; x.fillText('W0', pad.l, Ht - 2); x.textAlign = 'right'; x.fillText(`W${FRAMES[n - 1].t}`, Wd - pad.r, Ht - 2); x.textAlign = 'left'; }
}
function line(id, series, o) {
  const cv = $(id), [x, Wd, Ht] = fit(cv); x.clearRect(0, 0, Wd, Ht);
  const n = nNow(), pad = { l: 38, r: 8, t: 6, b: 14 }, data = series.map((s) => s.data.slice(0, n));
  let lo = Infinity, hi = -Infinity; data.forEach((d) => d.forEach((v) => { if (v == null) return; lo = Math.min(lo, v); hi = Math.max(hi, v); }));
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  if (o.ref !== undefined) { lo = Math.min(lo, o.ref); hi = Math.max(hi, o.ref); }
  const sp = hi - lo || 1; lo -= sp * 0.06; hi += sp * 0.06; if (o.min !== undefined) lo = o.min; if (o.max !== undefined) hi = Math.max(o.max, hi);
  const X = (i) => pad.l + ((Wd - pad.l - pad.r) * i) / Math.max(1, n - 1), Y = (v) => pad.t + (Ht - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));
  axes(x, Wd, Ht, pad, lo, hi, o.fy, n);
  if (o.ref !== undefined) { x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(pad.l, Math.round(Y(o.ref)), Wd - pad.l - pad.r, 1); }
  series.forEach((s, k) => {
    const d = data[k];
    const path = () => { x.beginPath(); let on = false; d.forEach((v, i) => { if (v == null) { on = false; return; } on ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)); on = true; }); };
    if (s.fill) { const first = d.findIndex((v) => v != null); if (first >= 0) { path(); x.lineTo(X(n - 1), Ht - pad.b); x.lineTo(X(first), Ht - pad.b); x.closePath(); const g = x.createLinearGradient(0, pad.t, 0, Ht - pad.b); g.addColorStop(0, rgba(s.color, 0.2)); g.addColorStop(1, rgba(s.color, 0)); x.fillStyle = g; x.fill(); } }
    path(); x.setLineDash(s.dash ? [5, 4] : []); x.strokeStyle = s.color; x.lineWidth = 2; x.lineJoin = 'round'; x.stroke(); x.setLineDash([]);
    const lv = d[n - 1]; if (lv != null) { x.beginPath(); x.arc(X(n - 1), Y(lv), 3.2, 0, Math.PI * 2); x.fillStyle = s.color; x.fill(); }
  });
  const c = (charts[id] ||= {}); Object.assign(c, { X, n, pad, Wd });
  if (c.hi !== undefined && c.hi < n) { x.fillStyle = 'rgba(238,241,250,0.35)'; x.fillRect(Math.round(X(c.hi)), pad.t, 1, Ht - pad.t - pad.b); series.forEach((s, k) => { const v = data[k][c.hi]; if (v == null) return; x.beginPath(); x.arc(X(c.hi), Y(v), 4, 0, Math.PI * 2); x.fillStyle = s.color; x.fill(); x.strokeStyle = COL.panel; x.lineWidth = 2; x.stroke(); }); }
}
function stack(id, layers) {
  const cv = $(id), [x, Wd, Ht] = fit(cv); x.clearRect(0, 0, Wd, Ht);
  const n = nNow(), Ls = layers.slice(0, n), pad = { l: 38, r: 8, t: 6, b: 14 };
  const X = (i) => pad.l + ((Wd - pad.l - pad.r) * i) / Math.max(1, n - 1), Y = (v) => pad.t + (Ht - pad.t - pad.b) * (1 - v);
  axes(x, Wd, Ht, pad, 0, 1, (v) => pct(v), n);
  const base = new Array(n).fill(0);
  GROUPS.forEach((a, k) => {
    const top = Ls.map((s, i) => base[i] + (s[k] || 0));
    x.beginPath(); top.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); for (let i = n - 1; i >= 0; i--) x.lineTo(X(i), Y(base[i])); x.closePath(); x.fillStyle = a.color; x.fill();
    x.beginPath(); top.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); x.strokeStyle = COL.panel; x.lineWidth = 2; x.stroke();
    top.forEach((v, i) => (base[i] = v));
  });
  const c = (charts[id] ||= {}); Object.assign(c, { X, n, pad, Wd });
  if (c.hi !== undefined && c.hi < n) { x.fillStyle = 'rgba(238,241,250,0.6)'; x.fillRect(Math.round(X(c.hi)), pad.t, 1, Ht - pad.t - pad.b); }
}
function crosshair(id, render) {
  const cv = $(id), tip = $(id + 'Tip');
  const move = (e) => { const c = charts[id]; if (!c) return; const r = cv.getBoundingClientRect(); const i = C(Math.round(((e.clientX - r.left - c.pad.l) / (c.Wd - c.pad.l - c.pad.r)) * (c.n - 1)), 0, c.n - 1); c.hi = i; tip.innerHTML = render(i); placeTip(tip, cv, c.X(i), 0); drawCharts(); };
  cv.addEventListener('pointermove', move); cv.addEventListener('pointerdown', move);
  cv.addEventListener('pointerleave', () => { if (charts[id]) charts[id].hi = undefined; tip.hidden = true; drawCharts(); });
}
crosshair('cashTop', (i) => `<b>${when(FRAMES[i].t)}</b><br>Richest 10% hold <span class="mono">${pct(H.cashTop[i])}</span> of all cash<br><span class="k">Bank rate ${H.bank[i] == null ? '–' : H.bank[i].toFixed(2) + '×'}</span>`);
crosshair('access', (i) => `<b>${when(FRAMES[i].t)}</b><br>Research pass <span class="mono">${H.pass[i] == null ? '–' : H.pass[i].toFixed(2)}</span><br>Game ticket <span class="mono">${H.ticket[i] == null ? '–' : H.ticket[i].toFixed(2)}</span>`);
crosshair('wins', (i) => `<b>${when(FRAMES[i].t)}</b><br>Skill index <span class="mono">${H.skill[i] == null ? '–' : H.skill[i].toFixed(2)}</span><br><span class="k">Rank correlation between what entrants knew and how they scored, all games, 4-week average</span>`);
crosshair('gini', (i) => `<b>${when(FRAMES[i].t)}</b><br>Gini <span class="mono">${H.gini[i].toFixed(3)}</span>`);
crosshair('notes', (i) => `<b>${when(FRAMES[i].t)}</b><br>Swaps <span class="mono">${H.shares[i]}</span> · thefts <span class="mono">${H.thefts[i]}</span><br><span class="k">${H.flags[i]} flags in force</span>`);
crosshair('strat', (i) => `<b>${when(FRAMES[i].t)}</b><br>` + GROUPS.map((a, k) => [a, H.share[i][k] || 0]).map(([a, v]) => `<span class="sw" style="background:${a.color}"></span>${a.label} hold <span class="mono">${pct(v)}</span>`).join('<br>'));
function drawCharts() {
  line('cashTop', [{ data: H.cashTop, color: '#e66767', fill: true }], { fy: (v) => pct(v), min: 0 });
  drawMain();
  line('access', [{ data: H.pass, color: COL.gold }, { data: H.ticket, color: '#9cc7ff' }], { fy: (v) => v.toFixed(1), min: 0 });
  line('wins', [{ data: H.skill, color: '#3987e5', fill: true }], { fy: (v) => v.toFixed(2), ref: 0 });
  line('gini', [{ data: H.gini, color: '#3987e5', fill: true }], { fy: (v) => v.toFixed(2), min: 0, max: 0.4 });
  line('notes', [{ data: H.shares, color: '#3987e5' }, { data: H.thefts, color: '#e66767' }], { fy: (v) => Math.round(v), min: 0 });
  stack('strat', H.share);
  drawHeatmaps();
}

/* ---------- Heatmaps ---------- */
// Diverging blue ↔ grey ↔ red (the validated pair), sequential blue for shares.
const NEUTRAL = [42, 49, 77], BLUE = [57, 135, 229], RED = [230, 103, 103], BLUE_HI = [156, 199, 255];
const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(L(v, b[i], t))).join(',')})`;
const diverge = (t) => (t >= 0 ? mix(NEUTRAL, RED, Math.min(1, t)) : mix(NEUTRAL, BLUE, Math.min(1, -t)));
const divergeInv = (t) => diverge(-t);
const seq = (t) => (t < 0.5 ? mix(NEUTRAL, BLUE, t * 2) : mix(BLUE, BLUE_HI, Math.min(1, (t - 0.5) * 2)));
function scale(id, left, right, fn) { $(id).innerHTML = `${left}<i style="background:linear-gradient(90deg,${[0, 0.25, 0.5, 0.75, 1].map((t) => fn(t)).join(',')})"></i>${right}`; }
const hm = {};
function heatmap(id, rows, cols, cell, color, tip, colLabel) {
  const cv = $(id), [x, Wd, Ht] = fit(cv); x.clearRect(0, 0, Wd, Ht);
  const LW = Wd < 480 ? 92 : 128, top = 2, bot = colLabel ? 14 : 2, cw = (Wd - LW - 4) / cols, rh = (Ht - top - bot) / rows.length;
  const max = LW < 100 ? 14 : 20;
  x.font = `500 ${rh < 13 ? 9.5 : 11}px ${css('--body')}`; x.textBaseline = 'middle';
  rows.forEach((r, i) => {
    x.fillStyle = r.color || COL.muted; x.fillText(r.label.length > max ? r.label.slice(0, max - 1) + '…' : r.label, 2, top + i * rh + rh / 2);
    for (let j = 0; j < cols; j++) { const v = cell(i, j); x.fillStyle = v == null ? 'rgba(255,255,255,0.03)' : color(v); x.fillRect(LW + j * cw + 0.5, top + i * rh + 0.5, Math.max(1, cw - 1), Math.max(1, rh - 1)); }
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
['hmGene', 'hmFam', 'hmHold', 'hmRet', 'hmBots'].forEach(hmHover);
function buckets(n, width) { const cols = Math.max(1, Math.min(n, Math.floor(width / 7))); return { cols, range: (j) => { const a = Math.floor((j * n) / cols); return [a, Math.max(a, Math.floor(((j + 1) * n) / cols) - 1)]; } }; }
const avg = (xs) => { const v = xs.filter((y) => y != null && isFinite(y)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
// Average worth of each wealth group in a frame (groups as the engine placed them that week)
function grpWorth(f) { if (f._gw) return f._gw; const s = GROUPS.map(() => [0, 0]); for (const b of f.bots) { const g = s[b[17] ?? 2]; g[0] += b[3]; g[1]++; } return (f._gw = s.map(([w, k]) => (k ? w / k : null))); }
function botMap(f) { if (f._bm) return f._bm; const ws = f.bots.map((b) => b[3]).sort((a, b) => a - b); f._med = ws[Math.floor(ws.length / 2)] || 1; return (f._bm = new Map(f.bots.map((b) => [b[0], b[3]]))); }
const hmWidth = (id) => $(id).getBoundingClientRect().width - 132;
const SENS_ROWS = CARD_IN.map((k, i) => [k, i]).filter(([, i]) => i > 0);
function drawHeatmaps() {
  const n = nNow(), f = cur();
  { // What the networks learned: how much each input pushes the richest 10% toward buying (red) or selling (blue)
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
    const rows = top.map((b) => ({ label: b[2], color: b[9] ? COL.gold : COL.muted }));
    const val = (i, j) => { const fr = FRAMES[range(j)[1]], m = botMap(fr).get(top[i][0]); return m == null ? null : m / fr._med; };
    heatmap('hmBots', rows, cols, val, (v) => divergeInv(Math.log(v) / Math.log(4)), (i, j) => { const fr = FRAMES[range(j)[1]], v = val(i, j); return `<b>${esc(top[i][2])}</b> · ${kindOf(top[i])}<br>Week ${fr.t}<br>${v == null ? 'not born yet' : `Worth <span class="mono">${fmt(botMap(fr).get(top[i][0]))}</span> · ${v.toFixed(2)}× median`}`; }, (j) => `W${FRAMES[range(j)[0]].t}`);
  }
}
scale('scaleFam', 'cheap', 'rich', (t) => diverge(t * 2 - 1));
scale('scaleGene', 'sell', 'buy', (t) => divergeInv(1 - t * 2));
scale('scaleHold', '0%', '70%+', (t) => seq(t));
scale('scaleRet', '−12%', '+12%', (t) => divergeInv(t * 2 - 1));
scale('scaleBots', '¼×', '4× median', (t) => divergeInv(t * 2 - 1));

/* ---------- Panels ---------- */
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
function drawPanels() {
  const f = cur(), n = nNow(); if (!f) return;
  const g4 = gamesOver(n - 1, 4), games = Object.values(g4.game).reduce((s, x) => s + x[0], 0), pots = Object.values(g4.game).reduce((s, x) => s + x[1], 0);
  $('kWeek').textContent = String(f.t); $('kWeekS').textContent = `${f.season ? `season ${f.season} · ` : ''}gen ${Math.floor(Math.max(0, f.t - 1) / gpw()) + 1}${mode === 'replay' ? ` · replay ${cursor + 1}/${FRAMES.length}` : ''}`;
  $('kBub').textContent = f.h.bub.toFixed(2) + '×'; $('kBubS').innerHTML = pill(f.h.bub);
  $('kGini').textContent = f.h.gini.toFixed(3); $('kGiniS').textContent = `${f.h.gini >= H.gini[0] ? '▲' : '▼'} from ${H.gini[0].toFixed(3)}`;
  $('kTrades').textContent = f.h.trades.toLocaleString(); $('kTradesS').textContent = `${f.house.packs.toLocaleString()} packs bought`;
  $('kPass').textContent = f.h.pass == null ? '–' : f.h.pass.toFixed(2); $('kPassS').textContent = `coins · ${f.h.informed.toFixed(1)} notes/bot`;
  $('kTicket').textContent = f.tickets == null ? '–' : f.tickets.toFixed(2); $('kTicketS').textContent = f.games ? `${f.games.packsWeek} game packs this wk` : 'games off';
  $('kWin').textContent = g4.skill[1] ? (g4.skill[0] / g4.skill[1]).toFixed(2) : '–'; $('kWinS').textContent = games ? `${games.toLocaleString()} entries · ${fmt(pots)} coins in pots` : 'no games';
  const ranked = f.bots.slice().sort((a, b) => b[3] - a[3]);
  $('kBank').textContent = f.mkt?.rate == null ? '–' : (f.mkt.rate * 100).toFixed(2) + '%'; $('kBankS').textContent = `per week · loans ${f.mkt?.mcap ? pct(f.mkt.debt / f.mkt.mcap) : '–'} of market · ${f.mkt?.defaults ?? 0} defaults`;
  $('lb').tBodies[0].innerHTML = ranked.slice(0, 12).map((b) => `<tr data-bot="${b[0]}"><td><span class="sw" style="background:${grpColor(b)}"></span>${esc(b[2])}</td><td class="num">${fmt(b[3])}</td><td class="num ${(b[13] ?? 0) >= 0 ? 'up' : 'down'}">${b[13] == null ? '–' : (b[13] >= 0 ? '+' : '') + Math.round(b[13] * 100) + '%'}</td><td class="num">gen ${b[10]}</td><td>${SOC[b[5]]}${b[6] >= 5 ? ' <span class="pill pill--hot">flagged</span>' : ''}</td></tr>`).join('');
  { const rows = Object.entries(GAMES).map(([g, d]) => [g, d, g4.game[g] || [0, 0, 0, 0]]).sort((a, b) => (b[2][3] ? b[2][2] / b[2][3] : -1) - (a[2][3] ? a[2][2] / a[2][3] : -1));
    $('gTopic').tBodies[0].innerHTML = rows.map(([g, d, [e, pot, sk, kn]]) => { const r = kn ? sk / kn : null; return `<tr title="${esc(d.skill)}"><td>${esc(d.label)}</td><td class="k">${esc(f.topics?.[g] || '')}</td><td class="num">${e.toLocaleString()}</td><td class="num">${fmt(pot)}</td><td class="num">${r == null ? '–' : r.toFixed(2)}</td><td class="bar"><span class="${r != null && r < 0 ? 'neg' : ''}" style="width:${r == null ? 0 : Math.min(100, Math.abs(r) * 100)}%"></span></td></tr>`; }).join(''); }
  { const rows = GROUPS.map((g, a) => [a, g4.arch[a]]), max = Math.max(0.01, ...rows.map(([, x]) => (x[0] ? x[1] / x[0] : 0)));
    $('gArch').tBodies[0].innerHTML = rows.filter(([, x]) => x[0]).map(([a, [e, w, net]]) => `<tr><td><span class="sw" style="background:${GROUPS[a].color}"></span>${GROUPS[a].label}</td><td class="num">${e.toLocaleString()}</td><td class="num">${pct(w / e)}</td><td class="bar"><span style="width:${((w / e) / max) * 100}%;background:${GROUPS[a].color}"></span></td><td class="num ${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : ''}${fmt(net)}</td></tr>`).join('') || '<tr><td colspan="5" class="k">No games played.</td></tr>'; }
  const soc = [0, 1, 2].map((s) => { const xs = f.bots.filter((b) => b[5] === s); return [s, xs.length, avg(xs.map((b) => b[3])), avg(xs.map((b) => b[6]))]; });
  $('social').tBodies[0].innerHTML = soc.map(([s, k, w, fl]) => `<tr><td>${SOC[s]}</td><td class="num">${k}</td><td class="num">${fmt(w)}</td><td class="num">${fl == null ? '–' : fl.toFixed(1)}</td></tr>`).join('');
  $('researched').textContent = f.researched.length ? 'Most researched: ' + f.researched.map(([id, k]) => `${LIBRARY.players[id].name} (${k})`).join(', ') : '';
  $('spot').innerHTML = f.hot.map(([id, P, F, vol, circ, pool], i) => { const p = LIBRARY.players[id]; return `<button type="button" class="cardrow" data-lib="${id}" data-card="${id}"><div><b>${p.pos} ${esc(p.name)}</b><span>${fmt(P)} vs ${fmt(F)} ${pill(P / F)}<br>${vol} trades · ${circ} out · ${pool} in pool</span></div><canvas id="sp${i}" aria-label="${esc(p.name)} price and value"></canvas></button>`; }).join('');
  f.hot.forEach(([id], i) => {
    const [x, Wd, Ht] = fit($('sp' + i)); x.clearRect(0, 0, Wd, Ht);
    const [P, F] = series(id), all = P.concat(F).filter((v) => v != null); if (!all.length) return;
    const lo = Math.min(...all), hi = Math.max(...all), sp = hi - lo || 1;
    const draw = (d, col, dash) => { x.beginPath(); let on = false; d.forEach((v, k) => { if (v == null) { on = false; return; } const px = Wd - 2 - ((d.length - 1 - k) / 59) * (Wd - 4), py = Ht - 3 - ((v - lo) / sp) * (Ht - 6); on ? x.lineTo(px, py) : x.moveTo(px, py); on = true; }); x.setLineDash(dash ? [3, 3] : []); x.strokeStyle = col; x.lineWidth = 1.5; x.stroke(); x.setLineDash([]); };
    draw(F, COL.chalk, true); draw(P, COL.gold, false);
  });
  drawFeed(); drawTape(); drawWatch(); drawAcct(); drawCons(); drawDetail();
}
function drawLibrary() {
  const p = LIBRARY.players[libId]; if (!p) return;
  const AW = ['Rings', 'MVP', 'OPOY', 'DPOY', 'SBMVP', 'ROTY'];
  const awards = AW.filter((k) => p.stats[k]).map((k) => `${p.stats[k]} ${k}`).join(' · ') || 'no awards';
  const rows = [...Object.entries(p.rates), ...Object.entries(p.stats).filter(([k]) => !AW.includes(k))];
  $('libPage').innerHTML = `<div style="display:grid;gap:6px"><div><b style="font:800 18px/1.1 var(--display);letter-spacing:.02em">${p.pos} ${esc(p.name)}</b> <span class="note">${esc(teamShort(p.team))}${p.nickname ? ` · "${esc(p.nickname)}"` : ''}${p.hallOfFame ? ' · HOF' : ''}</span></div>
  <div class="note">OVR <b style="color:var(--chalk)">${p.ovr ?? '–'}</b> · grade ${p.grade ?? '–'} · legacy ${p.careerLegacy?.toLocaleString() ?? '–'} · ${esc(p.family || '')}<br>${awards} · plays like ${(p.playsLike || []).map(esc).join(', ')}</div>
  <div class="tablewrap"><table><tbody>${rows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="num">${typeof v === 'number' ? v.toLocaleString() : esc(v)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-lib]'); if (t) { libId = +t.dataset.lib; $('libPick').value = libId; drawLibrary(); }
  const c = e.target.closest('[data-card]'); if (c) select({ type: 'card', id: +c.dataset.card });
  const b = e.target.closest('[data-bot]'); if (b) selectBot(+b.dataset.bot);
});

/* ---------- Feed ---------- */
let feedF = 'news';
const ACT = {
  trade: (j) => ['Trade', `<b>${esc(j.buyer)}</b> bought ${esc(j.card)} from ${esc(j.seller)} · ${j.price}`],
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
  loan: (j) => ['Loan', `<b>${esc(j.lender)}</b> lent ${fmt(j.amount)} to ${esc(j.borrower)} at ${(j.rate * 100).toFixed(2)}%/wk`],
  marginCall: (j) => ['Margin', `<b>${esc(j.bot)}</b> margin call · loan ${fmt(j.debt)} against ${fmt(j.cards)} of cards`],
  adopted: (j) => ['Evolution', `<b>${esc(j.bot)}</b> (${j.roc >= 0 ? '+' : ''}${Math.round(j.roc * 100)}%) adopts ${esc(j.from)}'s strategy (+${Math.round(j.mentorRoc * 100)}%): ${esc(j.before)} → ${esc(j.after)}`],
  died: (j) => ['Evolution', `<b>${esc(j.bot)}</b> dies at ${j.age} generations; ${fmt(j.estate)} passes to ${j.heirs.map(esc).join(' and ')}`],
  eliminated: (j) => ['Evolution', `<b>${esc(j.bot)}</b> eliminated (${esc(j.kind)}, ${esc(j.social)})`],
  born: (j) => ['Evolution', `<b>${esc(j.bot)}</b> born from ${esc(j.parent)}`],
};
const GROUP = { credit: ['loan', 'marginCall', 'default'], people: ['entered', 'exited', 'default'], trade: ['trade', 'passTrade', 'ticketTrade'], auction: ['auctionList', 'auctionResult'], research: ['research'], notes: ['share', 'steal'], game: ['game'], pack: ['pack'], talk: ['post', 'message'], ai: ['aiActions'] };
function drawFeed() {
  const n = nNow(), rows = [];
  if (feedF === 'news') {
    for (let i = n - 1; i >= 0 && rows.length < 60; i--) for (const e of FRAMES[i].events) rows.push(`<div class="ev"><time>W${e.t}</time><span class="tag">${TAGS[e.kind] || 'Note'}</span><div>${esc(e.text)}</div></div>`);
  } else {
    outer: for (let i = n - 1; i >= 0; i--) for (const j of (FRAMES[i].jn || []).slice().reverse()) { if (feedF !== 'all' && !GROUP[feedF].includes(j.type)) continue; const r = ACT[j.type]?.(j); if (r) rows.push(`<div class="ev"><time>W${j.t}</time><span class="tag">${r[0]}</span><div>${r[1]}</div></div>`); if (rows.length >= 60) break outer; }
  }
  $('feed').innerHTML = rows.join('') || '<p class="note">Nothing yet.</p>';
}
document.querySelectorAll('#actFilter [data-f]').forEach((b) => b.addEventListener('click', () => { feedF = b.dataset.f; document.querySelectorAll('#actFilter [data-f]').forEach((o) => o.setAttribute('aria-pressed', String(o === b))); drawFeed(); }));

/* ---------- Controls ---------- */
$('preset').innerHTML = Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
$('libPick').innerHTML = LIBRARY.players.map((p, i) => `<option value="${i}">${p.pos} ${esc(p.name)}</option>`).join('');
$('libPick').addEventListener('change', (e) => { libId = +e.target.value; drawLibrary(); });
const SLIDERS = { livingCost: [1, (v) => String(v)], lifestyle: [0.0001, (v) => (v / 100).toFixed(2) + '%'], maxLTV: [0.01, (v) => (v ? v + '%' : 'off')], interest: [0.0001, (v) => (v / 100).toFixed(2) + '%'], fee: [0.01, (v) => v + '%'], allowance: [1, (v) => String(v)], packEdge: [0.01, (v) => v + '%'], passesPerWeek: [1, (v) => String(v)], knowledgeWeeks: [1, (v) => v + ' wk'], detectChance: [0.01, (v) => v + '%'], priceLimit: [0.01, (v) => (v ? '±' + v + '%' : 'off')], wealthTax: [0.01, (v) => (v ? v + '%' : 'off')], positionLimit: [0.01, (v) => (v ? v + '%' : 'off')], storePremium: [0.01, (v) => '+' + v + '%'], walkUp: [0.01, (v) => v + '%'], walkVolLow: [0.01, (v) => '±' + v + '%'], walkVolHigh: [0.01, (v) => '±' + v + '%'], riskPerDoubling: [1, (v) => '+' + v + ' pts'] };
const TOGGLES = ['credit', 'passesTradable', 'games', 'sharing', 'stealing', 'gossip', 'outsideCollectors', 'royalties', 'evolve', 'leagueUpdates', 'centralBank', 'store', 'closedEconomy'];
function syncControls() {
  const c = cfgNow(); if (!c) return;
  for (const [k, [s, f]] of Object.entries(SLIDERS)) { $(k).value = Math.round((c[k] / s) * 100) / 100; $(k + 'V').textContent = f(+$(k).value); }
  for (const k of TOGGLES) $(k).checked = !!c[k];
}
for (const [k, [s, f]] of Object.entries(SLIDERS)) $(k).addEventListener('input', () => { const v = +$(k).value; $(k + 'V').textContent = f(v); opts[k] = v * s; if (mode === 'live') { tell({ cmd: 'cfg', k, v: v * s }); logChange(k, v * s); } });
for (const k of TOGGLES) $(k).addEventListener('change', (e) => { opts[k] = e.target.checked; if (mode === 'live') { tell({ cmd: 'cfg', k, v: e.target.checked }); logChange(k, e.target.checked); } });
$('rulesBtn').addEventListener('click', () => { const open = $('rules').hidden; $('rules').hidden = !open; $('rulesBtn').setAttribute('aria-expanded', String(open)); $('rulesBtn').textContent = open ? 'Rules ▴' : 'Rules ▾'; });
function advance() {
  if (mode === 'live') { tell({ cmd: 'step' }); return false; }
  if (cursor < FRAMES.length - 1) { cursor++; for (const [s, b] of FRAMES[cursor].arcs) arcs.push({ s, b, age: 0 }); return true; }
  setPlay(false); return false;
}
function loop(ts) {
  const dt = Math.min(0.1, (ts - lastT) / 1000 || 0); lastT = ts;
  let ran = false;
  if (mode === 'live') { ran = dirty; dirty = false; } // the worker sets the pace
  else if (playing) { acc += dt * 3 * speed; while (acc >= 1) { if (!advance()) { acc = 0; break; } acc -= 1; ran = true; } }
  drawFloor();
  if (ran && ts - chartT > 120) { drawCharts(); chartT = ts; }
  if (ran && ts - panelT > 500) { drawPanels(); panelT = ts; }
  requestAnimationFrame(loop);
}
function redrawAll() { $('stratLegend').innerHTML = GROUPS.map((g) => `<span><i style="background:${g.color}"></i>${g.label}</span>`).join(''); drawFloor(); drawCharts(); drawPanels(); libId = cur().hot[0]?.[0] ?? 0; $('libPick').value = libId; drawLibrary(); }
$('play').addEventListener('click', () => setPlay(!playing));
$('step').addEventListener('click', () => { setPlay(false); advance(); if (mode === 'replay') { drawCharts(); drawPanels(); } });
$('reset').addEventListener('click', () => { if (mode === 'replay') { cursor = 0; arcs = []; redrawAll(); return; } opts.seed = Number($('seed').value) || 88; startLive(); });
$('seed').addEventListener('change', () => { opts.seed = Number($('seed').value) || 88; if (mode === 'live') startLive(); });
$('preset').addEventListener('change', (e) => { presetKey = e.target.value; opts = { seed: opts.seed }; startLive(); });
$('liveBtn').addEventListener('click', () => startLive());
$('saveRun').addEventListener('click', saveRun);
$('runFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try { const run = JSON.parse(await file.text()); if (!run.frames?.length) throw new Error('no frames'); startReplay(run); }
  catch (err) { $('hyp').innerHTML = `<b>Not a sandbox run.</b> Pick a run.json from <span class="mono">sandbox/runs/</span> (${esc(err.message)}).`; }
});
document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => { speed = Number(b.dataset.speed); tell({ cmd: 'speed', v: speed }); document.querySelectorAll('[data-speed]').forEach((o) => o.setAttribute('aria-pressed', String(o === b))); }));
Object.assign(COL, { chalk: css('--chalk'), muted: css('--muted'), faint: css('--faint'), gold: css('--gold'), panel: css('--panel') });


/* ---------- Stock-market desk: selection, tape, watchlist, main chart, detail, account ---------- */
let SEL = { type: 'market' }, ACCT = null, TF = 52, CMODE = 'line', wsortKey = 'vol', wq = '';
const cfgNow = () => (mode === 'replay' ? RUN.config : LIVECFG || {});
function select(s) { SEL = s; if (mode === 'live') sendSel(); $('toMarket').hidden = s.type === 'market'; if (s.type === 'card') { libId = s.id; $('libPick').value = s.id; drawLibrary(); } drawMain(); drawDetail(); drawWatch(); }
function selectBot(id) { ACCT = id; SEL = { type: 'bot', id }; if (mode === 'live') sendSel(); $('toMarket').hidden = false; drawMain(); drawDetail(); drawAcct(); }
$('toMarket').addEventListener('click', () => select({ type: 'market' }));
document.querySelectorAll('#tf [data-tf]').forEach((b) => b.addEventListener('click', () => { TF = +b.dataset.tf; document.querySelectorAll('#tf [data-tf]').forEach((o) => o.setAttribute('aria-pressed', String(o === b))); drawMain(); }));
document.querySelectorAll('#cmode [data-m]').forEach((b) => b.addEventListener('click', () => { CMODE = b.dataset.m; document.querySelectorAll('#cmode [data-m]').forEach((o) => o.setAttribute('aria-pressed', String(o === b))); drawMain(); }));
$('wsort').addEventListener('change', (e) => { wsortKey = e.target.value; drawWatch(); });
$('wfilter').addEventListener('input', (e) => { wq = e.target.value.trim().toLowerCase(); drawWatch(); });

// A player's state now (live: the world; replay: the frame's price vector). His price is what his cards trade for,
// brought back to a Prizm Base equivalent; his value is his Prizm Base card's hidden value.
function cardNow(id) {
  const at = ix(), fr = FRAMES[at]; if (!fr) return { P: null };
  const P = fr.prices?.[id] ?? null, back = FRAMES[Math.max(0, at - 4)].prices?.[id];
  let F = null; for (let i = at; i >= 0; i--) if (FRAMES[i].values) { F = FRAMES[i].values[id]; break; }
  let vol4 = 0; for (let i = Math.max(0, at - 3); i <= at; i++) vol4 += FRAMES[i].vol?.[id] || 0;
  const spark = []; for (let i = Math.max(0, at - 23); i <= at; i++) spark.push(FRAMES[i].prices?.[id]);
  return { P, F, circ: fr.circ?.[id] ?? null, pool: fr.pool?.[id] ?? null, chg: P != null && back ? P / back - 1 : 0, vol4, spark };
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

function drawTape() {
  const m = cur().movers; if (!m) { $('tapeTrack').innerHTML = ''; return; }
  const item = ([id, P, r]) => { const p = LIBRARY.players[id]; return `<button type="button" class="tk" data-card="${id}"><b>${p.pos} ${esc(p.name)}</b>${fmt(P)} ${chgSpan(r)}</button>`; };
  const html = [...m.up.map(item), ...m.down.map(item)].join('');
  $('tapeTrack').innerHTML = html + html; // doubled for a seamless loop
}
function drawWatch() {
  const rows = LIBRARY.players.map((p, id) => ({ id, p, ...cardNow(id) })).filter((r) => r.P != null && (!wq || r.p.name.toLowerCase().includes(wq) || r.p.pos.toLowerCase() === wq));
  const by = { vol: (a, b) => b.vol4 - a.vol4, up: (a, b) => b.chg - a.chg, down: (a, b) => a.chg - b.chg, cap: (a, b) => b.P * (b.circ ?? 1) - a.P * (a.circ ?? 1), rich: (a, b) => b.P / b.F - a.P / a.F, cheap: (a, b) => a.P / a.F - b.P / b.F }[wsortKey];
  rows.sort(by);
  $('watch').innerHTML = rows.slice(0, 80).map((r) => `<button type="button" class="wrow" role="option" data-card="${r.id}" aria-selected="${SEL.type === 'card' && SEL.id === r.id}"><b>${r.p.pos} ${esc(r.p.name)}</b><span class="px">${fmt(r.P)}</span><small>${esc(teamShort(r.p.team))} · OVR ${ovrOf(r.id)}${riskNow(r.id) != null ? ` · risk ${Math.round(riskNow(r.id))}` : ''} · ${r.vol4} trades · ${(r.P / r.F).toFixed(2)}×</small><span class="chg">${chgSpan(r.chg)}</span></button>`).join('');
}

// Bars for the main chart: [{t, o, h, l, c, v, val}]
function barsFor(sel) {
  const n = nNow(), out = [];
  // The market is a fixed-basket index (every player weighted by his starting supply), like a stock index, so new
  // cards entering circulation don't look like rising prices
  if (sel.type === 'market') { for (let i = 0; i < n; i++) { const f = FRAMES[i], prev = FRAMES[i - 1]?.h.p ?? f.h.p, c = f.h.p; out.push({ t: f.t, o: prev, h: Math.max(prev, c), l: Math.min(prev, c), c, v: f.h.trades, val: f.h.f }); } return out; }
  if (sel.type === 'card') {
    let val = null; for (let i = 0; i < n; i++) { const f = FRAMES[i]; if (f.values) val = f.values[sel.id]; const c = f.prices?.[sel.id]; if (c == null) continue; const prev = FRAMES[i - 1]?.prices?.[sel.id] ?? c; out.push({ t: f.t, o: prev, h: Math.max(prev, c), l: Math.min(prev, c), c, v: f.vol?.[sel.id] || 0, val }); }
    return out;
  }
  for (let i = 0; i < n; i++) { const f = FRAMES[i], w = botMap(f).get(sel.id); if (w == null) continue; const pw = FRAMES[i - 1] ? botMap(FRAMES[i - 1]).get(sel.id) ?? w : w; out.push({ t: f.t, o: pw, h: Math.max(pw, w), l: Math.min(pw, w), c: w, v: 0, val: f._med }); }
  return out;
}

const MAIN = {};
function drawMain() {
  const sel = SEL, all = barsFor(sel), bars = TF ? all.slice(-TF) : all;
  const cv = $('chart'), [x, Wd, Ht] = fit(cv); x.clearRect(0, 0, Wd, Ht);
  const vc = $('volc'), [vx, vW, vH] = fit(vc); vx.clearRect(0, 0, vW, vH);
  // Header
  let name = 'Vault index', sub = 'every player, fixed basket · start = 100', valLabel = 'Hidden value';
  if (sel.type === 'card') { const p = LIBRARY.players[sel.id]; name = `${p.pos} ${p.name}`; sub = `${teamShort(p.team)} · OVR ${ovrOf(sel.id)}${riskNow(sel.id) != null ? ` · ${riskText(sel.id)}` : ''} · price shown as Prizm Base`; }
  if (sel.type === 'bot') { const b = cur().bots.find((b) => b[0] === sel.id); name = b ? b[2] : 'Bot'; sub = b ? `${kindOf(b)} · ${GROUPS[b[17] ?? 2].label} · worth` : 'not in the market now'; valLabel = 'Median bot'; }
  $('ch-name').textContent = name; $('chSub').textContent = sub;
  const last = bars[bars.length - 1], first = bars[0];
  $('chLast').textContent = last ? fmt(last.c) : '–'; $('chChg').innerHTML = last && first ? chgSpan(last.c / first.o - 1) + ` <span class="k">${TF ? TF + 'W' : 'all'}</span>` : '';
  $('chLegend').innerHTML = `<span><i class="line" style="background:var(--gold)"></i>${sel.type === 'bot' ? 'Worth' : 'Price'}</span><span><i class="dash"></i>${valLabel}</span>`;
  if (!bars.length) return;
  const pad = { l: 8, r: 58, t: 10, b: 18 }, iw = Wd - pad.l - pad.r, ih = Ht - pad.t - pad.b;
  let lo = Infinity, hi = -Infinity; for (const b of bars) { lo = Math.min(lo, b.l, b.val ?? Infinity); hi = Math.max(hi, b.h, b.val ?? -Infinity); }
  const sp = hi - lo || hi || 1; lo -= sp * 0.06; hi += sp * 0.06; lo = Math.max(0, lo);
  const X = (i) => pad.l + (iw * (i + 0.5)) / bars.length, Y = (v) => pad.t + ih * (1 - (v - lo) / (hi - lo)), bw = Math.max(1, (iw / bars.length) * 0.66);
  x.font = `500 10px ${css('--mono')}`; x.textBaseline = 'middle';
  for (let i = 0; i <= 5; i++) { const v = lo + ((hi - lo) * i) / 5, y = Y(v); x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(pad.l, Math.round(y), iw, 1); x.fillStyle = COL.faint; x.fillText(fmt(v), Wd - pad.r + 6, y); }
  x.textBaseline = 'alphabetic'; x.fillStyle = COL.faint;
  const step = Math.max(1, Math.ceil(bars.length / 8)); for (let i = 0; i < bars.length; i += step) x.fillText(`W${bars[i].t}`, X(i) - 8, Ht - 3);
  // Hidden value (or median) line
  x.beginPath(); let on = false; bars.forEach((b, i) => { if (b.val == null) { on = false; return; } on ? x.lineTo(X(i), Y(b.val)) : x.moveTo(X(i), Y(b.val)); on = true; }); x.setLineDash([5, 4]); x.strokeStyle = COL.chalk; x.lineWidth = 1.5; x.stroke(); x.setLineDash([]);
  if (CMODE === 'candle') {
    bars.forEach((b, i) => { const upc = b.c >= b.o, col = upc ? '#4fd18b' : '#ff8a8a'; x.fillStyle = col; x.fillRect(Math.round(X(i)) - 0.5, Y(b.h), 1, Math.max(1, Y(b.l) - Y(b.h))); const y1 = Y(Math.max(b.o, b.c)), y2 = Y(Math.min(b.o, b.c)); x.fillRect(X(i) - bw / 2, y1, bw, Math.max(1.5, y2 - y1)); });
  } else {
    x.beginPath(); bars.forEach((b, i) => (i ? x.lineTo(X(i), Y(b.c)) : x.moveTo(X(i), Y(b.c)))); x.lineTo(X(bars.length - 1), pad.t + ih); x.lineTo(X(0), pad.t + ih); x.closePath();
    const g = x.createLinearGradient(0, pad.t, 0, pad.t + ih); g.addColorStop(0, rgba(COL.gold, 0.22)); g.addColorStop(1, rgba(COL.gold, 0)); x.fillStyle = g; x.fill();
    x.beginPath(); bars.forEach((b, i) => (i ? x.lineTo(X(i), Y(b.c)) : x.moveTo(X(i), Y(b.c)))); x.strokeStyle = COL.gold; x.lineWidth = 2; x.stroke();
  }
  // Last price tag
  if (last) { const y = Y(last.c); x.fillStyle = COL.gold; x.fillRect(Wd - pad.r + 2, y - 8, pad.r - 4, 16); x.fillStyle = '#1a1205'; x.font = `700 10px ${css('--mono')}`; x.textBaseline = 'middle'; x.fillText(fmt(last.c), Wd - pad.r + 6, y); }
  // Volume
  const vmax = Math.max(1, ...bars.map((b) => b.v || 0));
  bars.forEach((b, i) => { const h = ((b.v || 0) / vmax) * (vH - 4); vx.fillStyle = b.c >= b.o ? 'rgba(79,209,139,0.55)' : 'rgba(255,138,138,0.55)'; vx.fillRect(X(i) - bw / 2, vH - h, bw, h); });
  vx.fillStyle = COL.faint; vx.font = `500 10px ${css('--mono')}`; vx.fillText(sel.type === 'bot' ? '' : `volume (max ${fmt(vmax)})`, pad.l, 10);
  // Crosshair
  if (MAIN.hi != null && MAIN.hi < bars.length) { const i = MAIN.hi, b = bars[i]; x.fillStyle = 'rgba(238,241,250,0.35)'; x.fillRect(Math.round(X(i)), pad.t, 1, ih); x.fillRect(pad.l, Math.round(Y(b.c)), iw, 1); }
  Object.assign(MAIN, { bars, X, pad, iw });
}
{
  const cv = $('chart'), tip = $('chartTip');
  const move = (e) => { if (!MAIN.bars) return; const r = cv.getBoundingClientRect(), i = C(Math.floor(((e.clientX - r.left - MAIN.pad.l) / MAIN.iw) * MAIN.bars.length), 0, MAIN.bars.length - 1); MAIN.hi = i; const b = MAIN.bars[i]; tip.innerHTML = `<b>Week ${b.t}</b><br>Open <span class="mono">${fmt(b.o)}</span> · close <span class="mono">${fmt(b.c)}</span><br>High <span class="mono">${fmt(b.h)}</span> · low <span class="mono">${fmt(b.l)}</span>${b.val != null ? `<br>${SEL.type === 'bot' ? 'Median bot' : 'Hidden value'} <span class="mono">${fmt(b.val)}</span> · ${(b.c / b.val).toFixed(2)}×` : ''}${SEL.type !== 'bot' ? `<br><span class="k">${b.v} ${SEL.type === 'market' ? 'trades' : 'trades'}</span>` : ''}`; placeTip(tip, cv, MAIN.X(i), e.clientY - r.top); drawMain(); };
  cv.addEventListener('pointermove', move); cv.addEventListener('pointerdown', move);
  cv.addEventListener('pointerleave', () => { MAIN.hi = null; tip.hidden = true; drawMain(); });
}
const tile = (k, v) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`;
function drawDetail() {
  const f = cur(); if (!f) return;
  if (SEL.type === 'market') {
    const m = f.mkt || {}, c = cfgNow();
    $('detail').innerHTML = `<div class="stats">${tile('Market value', fmt(m.mcap))}${tile('Hidden value', fmt(m.vcap))}${tile('Premium', m.vcap ? ((m.mcap / m.vcap - 1) * 100).toFixed(1) + '%' : '–')}${tile('Coins held', fmt(m.cash))}${tile('Loans out', fmt(m.debt))}${tile('Margin calls', m.calls ?? 0)}${f.lender ? tile('Lenders', `${pct(f.lender.ltv)} · ${(f.lender.rate * 100).toFixed(2)}%/wk`) : ''}${f.season ? tile('Season', f.season) : ''}${f.lineages ? tile('Lineages', `${f.lineages.count} · deepest gen ${f.lineages.depth}`) + tile('Largest family', `${pct(f.lineages.topShare)} of wealth`) : ''}${tile('Bots', f.bots.length + (f.people ? ` (+${f.people.joined}/−${f.people.left})` : ''))}${tile('Living costs / wk', fmt(m.spent))}${tile('Cards out', fmt(m.cards))}${tile('Richest 10% cash', pct(m.cashTop10))}${tile('Safeguards', [c.store && 'store', c.priceLimit && 'limits', c.wealthTax && 'tax', c.positionLimit && 'caps', c.centralBank && 'bank', c.closedEconomy && 'closed'].filter(Boolean).join(' · ') || 'none')}</div>`;
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
    $('detail').innerHTML = `<div class="stats">${tile('Price (Prizm Base)', fmt(now.P))}${tile('Hidden value', fmt(now.F))}${tile('Price ÷ value', now.F ? (now.P / now.F).toFixed(2) + '×' : '–')}${tile('4-wk change', chgSpan(now.chg))}${tile('OVR', ovrOf(id))}${risk != null ? tile('Risk rating', Math.round(risk)) + tile('Weekly swing', `±${(swing * 100).toFixed(1)}% · up ${pct(cw.walkUp)} of weeks`) : ''}${now.circ != null ? tile('Cards out', now.circ) + tile('Left in pool', now.pool) : ''}${tile('4-wk trades', now.vol4)}</div>${grid}${items}<div style="grid-column:1/-1"><h3>Time &amp; sales</h3>${tape}</div>${holders}`;
    return;
  }
  $('detail').innerHTML = '<p class="note">The account panel shows this bot\'s positions and activity.</p>';
}
function botLogFor(name) {
  if (mode === 'live') return LIVE.b?.log || [];
  const out = []; for (let i = cursor; i >= 0 && out.length < 50; i--) for (const j of (FRAMES[i].aiLog || []).slice().reverse()) { if (Object.values(j).includes(name)) out.push(j); if (out.length >= 50) break; }
  return out;
}
function drawAcct() {
  const f = cur(); if (!f) return;
  if (ACCT == null || !f.bots.some((b) => b[0] === ACCT)) { const pick = f.bots.filter((b) => b[9]).sort((a, b) => b[3] - a[3])[0] || f.bots.slice().sort((a, b) => b[3] - a[3])[0]; ACCT = pick[0]; if (mode === 'live') sendSel(); }
  const b = f.bots.find((x) => x[0] === ACCT), [id, , name, w, n, soc, flaggedBy, cash, notes, isAi, gen, model] = b;
  const rank = f.bots.slice().sort((x, y) => y[3] - x[3]).findIndex((x) => x[0] === id) + 1;
  let positions = [], realized = null, extra = '', debt = null;
  if (mode === 'live' && LIVE.b?.id === id) {
    const bot = LIVE.b;
    realized = bot.realized; debt = bot.debt;
    positions = bot.positions.map(([pid, label, q, ac, P]) => ({ pid, label, q, ac, P, pnl: ac == null ? null : (P - ac) * q }));
    const g = bot.g, bar = (label, v, max, col) => `<span title="${label}"><i style="width:${Math.round(C(v / max, 0, 1) * 100)}%;background:${col}"></i>${label}</span>`;
    extra = (g ? `<div class="genome">${bar(`cash target ${pct(g.keep)}`, g.keep, 0.6, '#3987e5')}${bar(`borrow ${g.lev.toFixed(2)}×`, g.lev, 1.5, '#e66767')}${bar(`lend ${pct(g.lendShare)}`, g.lendShare, 0.7, '#4fd18b')}${bar(`pass bid ${fmt(g.passBid)}`, g.passBid, 30 * (cfgNow().coinScale || 1), '#c98500')}${bar(`ticket bid ${fmt(g.ticketBid)}`, g.ticketBid, 10 * (cfgNow().coinScale || 1), '#9085e9')}</div>` : '') + `<div class="note">Lent ${fmt(bot.lent)} · Swaps ${bot.stats.shared} · thefts ${bot.stats.stolen} (caught ${bot.stats.caught}) · researched ${bot.stats.researched} · ${bot.passes} passes · ${bot.tickets} tickets${bot.games ? ` · enters ${bot.games} games` : ''}${bot.memo ? `<br>Memo: ${esc(bot.memo).slice(0, 200)}` : ''}</div>`;
  } else if (isAi && f.aiDetail?.[name]) {
    const d = f.aiDetail[name]; realized = d.realized; debt = d.debt ?? null;
    positions = d.positions.map(([cid, q, ac]) => { const P = (f.prices?.[cid >> 4] ?? 0) * mktMult(cid); return { cid, pid: cid >> 4, label: mktLabel(cid), q, ac, P, pnl: (P - ac) * q }; });
    const m = RUN.memos?.[name] && Object.entries(RUN.memos[name]).filter(([t]) => +t <= f.t).pop()?.[1];
    extra = m ? `<div class="note">Memo: ${esc(m).slice(0, 240)}</div>` : '';
  }
  positions.sort((x, y) => y.q * y.P - x.q * x.P);
  const unreal = positions.reduce((s, p) => s + (p.pnl || 0), 0);
  const log = botLogFor(name).slice(0, 40).map((j) => { const r = ACT[j.type]?.(j); return r ? `<div><time>W${j.t}</time><span class="k">${r[0]}</span> ${r[1]}</div>` : ''; }).join('');
  $('acct').innerHTML = `<div class="who"><b><span class="sw" style="background:${grpColor(b)}"></span>${esc(name)}</b><span class="note">${kindOf(b)}${model ? ` · ${esc(model)}` : ''} · ${GROUPS[b[17] ?? 2].label} · ${SOC[soc]} · gen ${gen} · rank ${rank}/${f.bots.length}</span></div>
  <div class="stats">${tile('Worth', fmt(w))}${tile('Cash', fmt(cash))}${tile('Realized', realized == null ? '–' : `<span class="${realized >= 0 ? 'up' : 'down'}">${realized >= 0 ? '+' : ''}${fmt(realized)}</span>`)}${tile('Unrealized', positions.length ? `<span class="${unreal >= 0 ? 'up' : 'down'}">${unreal >= 0 ? '+' : ''}${fmt(unreal)}</span>` : '–')}${tile('Loan', debt == null ? '–' : fmt(debt))}${tile('Cards', n)}${tile('Notes', notes)}${tile('Cards\' avg OVR', b[15] ?? '–')}</div>
  <canvas id="acctSpark" aria-label="${esc(name)} worth over time"></canvas>${extra}
  <h3 style="margin:6px 0 0;font:800 13px/1 var(--display);text-transform:uppercase;letter-spacing:.04em">Positions</h3>
  ${positions.length ? `<div class="tablewrap"><table><thead><tr><th>Card</th><th class="num">Qty</th><th class="num">Avg</th><th class="num">Last</th><th class="num">P&amp;L</th></tr></thead><tbody>${positions.slice(0, 25).map((p) => `<tr data-card="${p.pid}"><td>${esc(p.label)}</td><td class="num">${p.q}</td><td class="num">${fmt(p.ac)}</td><td class="num">${fmt(p.P)}</td><td class="num ${(p.pnl || 0) >= 0 ? 'up' : 'down'}">${p.pnl == null ? '–' : (p.pnl >= 0 ? '+' : '') + fmt(p.pnl)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="note">${mode === 'replay' ? 'Replays record positions for AI bots only.' : 'No cards.'}</p>`}
  <h3 style="margin:6px 0 0;font:800 13px/1 var(--display);text-transform:uppercase;letter-spacing:.04em">Activity</h3>
  <div class="log">${log || '<p class="note">Nothing recorded yet.</p>'}</div>`;
  const ws = []; for (let i = Math.max(0, nNow() - 80); i < nNow(); i++) ws.push(botMap(FRAMES[i]).get(id) ?? null);
  const cv = $('acctSpark'), [x, Wd, Ht] = fit(cv), vals = ws.filter((v) => v != null);
  if (vals.length > 1) { const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1; x.beginPath(); let on = false; ws.forEach((v, k) => { if (v == null) { on = false; return; } const px = (k / (ws.length - 1)) * (Wd - 4) + 2, py = Ht - 4 - ((v - lo) / sp) * (Ht - 8); on ? x.lineTo(px, py) : x.moveTo(px, py); on = true; }); x.strokeStyle = grpColor(b); x.lineWidth = 2; x.stroke(); }
}
function drawCons() {
  const n = nNow(), from = Math.max(0, n - 20);
  const sum = (k, a) => { let s = 0; for (let i = from; i < n; i++) s += FRAMES[i].flow?.[k]?.[a] || 0; return s; };
  const rows = GROUPS.map((g, a) => ({ g, real: sum('realized', a), net: sum('net', a), trips: sum('trips', a) }));
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.real)));
  $('pnl').tBodies[0].innerHTML = rows.map((r) => `<tr><td><span class="sw" style="background:${r.g.color}"></span>${r.g.label}</td><td class="num ${r.real >= 0 ? 'up' : 'down'}">${r.real >= 0 ? '+' : ''}${fmt(r.real)}</td><td class="bar"><span class="${r.real < 0 ? 'neg' : ''}" style="width:${(Math.abs(r.real) / max) * 100}%"></span></td><td class="num">${r.net >= 0 ? '+' : ''}${fmt(r.net)}</td><td class="num">${r.trips}</td></tr>`).join('');
  const c0 = H.cashTop.find((v) => v != null), c1 = H.cashTop[n - 1];
  $('consNote').textContent = `Groups are by worth each week. The richest 10% hold ${pct(c1)} of all cash (${pct(c0)} at the start). Quick flips: sold within 12 weeks of buying.`;
}

/* ---------- Start ---------- */
// Live AI run: the runner (node run.mjs --serve PORT) serves this page with window.LIVE_RUN set. New weeks stream in
// every few seconds; the view follows the newest week unless it has been scrubbed back.
async function followLive(url) {
  let run = null;
  const pull = async () => {
    try {
      const r = await fetch(`${url}?since=${run ? FRAMES.length : 0}`, { cache: 'no-store' }); const d = await r.json();
      if (!run) { if (!d.frames.length) throw new Error('no weeks yet'); run = { meta: d.meta, config: d.config, frames: d.frames, memos: d.memos }; startReplay(run); cursor = FRAMES.length - 1; setPlay(false); redrawAll(); }
      else if (d.frames.length) { const following = cursor >= FRAMES.length - 1; for (const f of d.frames) { run.frames.push(f); pushFrame(f); for (const [s2, b2] of f.arcs || []) arcs.push({ s: s2, b: b2, age: 0 }); } run.meta = d.meta; run.memos = d.memos; if (following) cursor = FRAMES.length - 1; drawCharts(); drawPanels(); }
      const m = d.meta || {}; $('hyp').innerHTML = `<b>Live AI run ${esc(m.id || '')}.</b> Week ${FRAMES.length - 1} of ${m.weeksPlanned} · ${m.calls} decisions · ${m.errors} errors · $${(m.costUsd || 0).toFixed(2)} list-price usage${m.stopped ? ` · stopped: ${esc(m.stopped)}` : ''}. The view follows the newest week.`;
    } catch (err) { $('hyp').innerHTML = `<b>Waiting for the run…</b> (${esc(err.message)})`; }
    setTimeout(pull, 3000);
  };
  pull();
}
setPlay(playing);
if (window.LIVE_RUN) followLive(window.LIVE_RUN); else startLive();
requestAnimationFrame(loop);
window.addEventListener('resize', () => { drawCharts(); drawPanels(); });
